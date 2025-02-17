// components/Index.tsx
import React from 'react';
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
  thresholdLow: number;  // valor de umbral bajo
  thresholdHigh: number; // valor de umbral alto
  displayAnnotations: boolean;
}

const Index: React.FC<IndexProps> = ({ sensorData, thresholdLow, thresholdHigh, displayAnnotations }) => {
  // Convertir los tiempos de microsegundos a milisegundos
  const convertedData = sensorData.map(point => ({
    time: point.time / 1000,
    force: point.force,
  }));

  // Ventana de tiempo de 10 segundos
  const timeWindow = 10000; // 10 segundos en ms
  const lastTime = convertedData.length > 0 ? convertedData[convertedData.length - 1].time : 0;
  const minTime = convertedData.length > 0 ? lastTime - timeWindow : undefined;
  const maxTime = convertedData.length > 0 ? lastTime : undefined;

  // Configuración de datos para la gráfica
  const chartData = {
    labels: convertedData.map(point => point.time),
    datasets: [
      {
        label: 'Force (kg)',
        data: convertedData.map(point => point.force),
        fill: false,
        borderWidth: 2,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
        pointRadius: 0,
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
          lowLine: {
            type: 'line',
            display: displayAnnotations,
            yMin: thresholdLow,
            yMax: thresholdLow,
            borderColor: 'red',
            borderWidth: 2,
            borderDash: [5, 5], 
            label: {
              display: true,
              content: `Trough: ${thresholdLow.toFixed(1)} kg`,
              position: 'start',
              // yAdjust: -10
            }
          },
          highLine: {
            type: 'line',
            display: displayAnnotations,
            yMin: thresholdHigh,
            yMax: thresholdHigh,
            borderColor: 'blue',
            borderWidth: 2,
            borderDash: [5, 5], 
            label: {
              display: true,
              content: `Peak: ${thresholdHigh.toFixed(1)} kg`,
              position: 'start'
            }
          }
        }
      }
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
    <div>
      <Line data={chartData} options={chartOptions} />
    </div>
  );
};

export default Index;
