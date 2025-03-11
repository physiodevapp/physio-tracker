import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js'; 
import annotationPlugin from 'chartjs-plugin-annotation';
import { lttbDownsample } from '@/services/chart';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { ForceSettings } from '@/providers/Settings';
import useCyclesDetector from '../Hooks/useCyclesDetector';

// Registrar los componentes necesarios de Chart.js, incluyendo el plugin de anotaciones
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, annotationPlugin);

// Define el tipo para cada punto de datos
export interface DataPoint {
  time: number;  // Tiempo en microsegundos (se convertirá a ms)
  force: number; // Fuerza en kg
}

// Ahora ampliamos las props para recibir los umbrales
interface IndexProps {
  sensorData: DataPoint[];
  displayAnnotations: boolean;
  isEstimatingMass: boolean;
  workLoad: number | null;
  settings: ForceSettings;
}

const Index: React.FC<IndexProps> = ({
  sensorData,
  displayAnnotations = true,
  isEstimatingMass = false,
  workLoad = null,
  settings
}) => {
  const {
    movingAverageWindow,
    hysteresis,
  } = settings

  const decimationThreshold = 200;

  // Mapeamos los datos para adaptarlos a la función lttbDownsample
  //  Convertimos "time" a "x" y de microsegundos a milisegundos
  const mappedData = useMemo(() => {
    return sensorData.map(point => ({
      x: point.time / 1000, // ms
      y: point.force,       // kg
    }));    
  }, [sensorData]);

  // Aplicamos la función de downsampling usando useMemo para optimizar
  const downsampledData = useMemo(() => {
    return lttbDownsample(mappedData, decimationThreshold);
  }, [mappedData, decimationThreshold]);

  const {
    cycleCount,
    cycleDuration,
    cycleAmplitude,
    ponderatedCycleVelocity,
    fatigueDetected,
    recentAverageValue: recentAverageForceValue,
    maxPoint,
  } = useCyclesDetector({
    mappedData,
    downsampledData,
    settings,
    workLoad,
  });

  // Ventana de tiempo de 10 segundos
  const timeWindow = 10_000; // 10 segundos en ms
  const lastTime = downsampledData.length > 0 ? downsampledData[downsampledData.length - 1].x : 0;
  const minTime = downsampledData.length > 0 ? lastTime - timeWindow : undefined;
  const maxTime = downsampledData.length > 0 ? lastTime : undefined;

  // Configuración de datos para la gráfica
  const chartData = {
    labels: downsampledData.map(point => point.x),
    datasets: [
      {
        label: 'Force (kg)',
        data: downsampledData.map(point => point.y),
        fill: false,
        borderWidth: 2,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
        pointRadius: 0 ,
        pointHoverRadius: 0,
        pointHitRadius: 0,
      },
    ],
  };

  // Opciones del gráfico, incluyendo las anotaciones horizontales
  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    animation: false,
    plugins: {
      title: {
        display: false,
        text: 'Real-Time Force vs Time',
      },
      legend: {
        display: false,
      },
      // Configuración de anotaciones
      annotation: {
        annotations: {
          movingAverageWindowBox: {
            type: 'box',
            display: Boolean(displayAnnotations && mappedData.length),
            xMin: lastTime - movingAverageWindow, // lastTime es el tiempo del último dato
            xMax: lastTime,
            yScaleID: 'y',
            yMin: (ctx) => ctx.chart.scales['y'].min,
            yMax: (ctx) => ctx.chart.scales['y'].max,
            backgroundColor: 'rgba(68, 68, 239, 0.10)',
            borderWidth: 0,
          },
          hysteresisBox: {
            type: 'box',
            display: Boolean(displayAnnotations && mappedData.length),
            xScaleID: 'x',
            yScaleID: 'y',
            // Cubre toda la escala en el eje x
            xMin: (ctx) => ctx.chart.scales['x'].min,
            xMax: (ctx) => ctx.chart.scales['x'].max,
            yMin: recentAverageForceValue - hysteresis,
            yMax: recentAverageForceValue + hysteresis,
            backgroundColor: 'rgba(75, 192, 75, 0.4)',
            borderWidth: 0,
          },
          averageLine: {
            type: 'line',
            display: Boolean(displayAnnotations && mappedData.length),
            yMin: recentAverageForceValue,
            yMax: recentAverageForceValue,
            borderColor: 'rgba(68, 68, 239, 1.0)',
            borderWidth: 2,
            label: {
              content: `Avg: ${recentAverageForceValue.toFixed(2)} kg`,
              display: true,
              position: 'start',
            },
          },
          topLine: {
            type: 'line',
            display: Boolean(displayAnnotations && mappedData.length),
            yMin: maxPoint ?? 0,
            yMax: maxPoint ?? 0,
            borderColor: 'rgba(239, 68, 239, 0.60',
            borderWidth: 2,
            borderDash: [6, 4],
            label: {
              content: `Max: ${(maxPoint ?? 0).toFixed(2)} kg`,
              display: true,
              position: 'start',
            },
          }
        }
      },
    },
    scales: {
      x: {
        type: 'linear',
        position: 'bottom',
        title: {
          display: false,
          text: 'Time (ms)',
        },
        ticks: {
          stepSize: 1000,
          callback: (value) => {
            const numValue = Number(value);
            if (numValue < 0) return '';
            return (numValue / 1000).toFixed(0) + 's';
          },
        },
        min: minTime,
        max: maxTime,
      },
      y: {
        title: {
          display: false,
          text: 'Force (kg)',
        },
        ticks: {
          // stepSize: 0.1,
          callback: (value) => {
            const numValue = Number(value);
            if (numValue < 0) return '';
            return numValue.toFixed(1);
          },
        },
      },
    },
  };

  return (
    <div className={`mt-12`}
      >
      <section className='relative w-full text-lg'>
        <div className={`absolute w-full flex flex-row justify-center items-baseline gap-4 text-center font-base text-4xl left-1/2 -translate-x-1/2 transition-[top] duration-300 ease-in-out -top-10 px-8 ${
            fatigueDetected ? 'text-red-500 animate-pulse' : ''
          } ${
            isEstimatingMass ? 'opacity-40' : ''
          }`}
        >
          <span className={`flex flex-row-reverse justify-start items-center gap-2 ${
            (workLoad !== null && mappedData.length) ? 'flex-[1.4]' : ''
          }`}
          >
            {cycleCount ?? 0} {cycleCount === 1 ? 'rep' : 'reps'}
            {fatigueDetected && (
              <ExclamationTriangleIcon className='w-6 h-6'/>
            )}
          </span>
          {(workLoad !== null && mappedData.length) && (
            <span className='flex-1 text-2xl text-left'>
              {ponderatedCycleVelocity?.toFixed(1)} m/s
            </span>
          )}
        </div>
        <div className={`w-full flex justify-center gap-4 ${
            isEstimatingMass ? 'opacity-40' : ''
          }`}
          >
          <p className='text-right'>Last Cycle: <span className='font-semibold'>{(cycleAmplitude ?? 0).toFixed(1)} kg</span></p>
          <p className='text-left font-semibold'>{((cycleDuration ?? 0) / 1000).toFixed(1)} s</p>
        </div>
      </section>
      <Line data={chartData} options={chartOptions} className='bg-white rounded-lg px-1 py-4 mt-2'/>
    </div>
  );
};

export default Index;
