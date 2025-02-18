import React, { useEffect, useMemo, useRef, useState } from 'react';
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
}

const Index: React.FC<IndexProps> = ({ sensorData, displayAnnotations }) => {
  const decimationThreshold = 200;

  // Mapeamos los datos para adaptarlos a la función lttbDownsample
  //  Convertimos "time" a "x" y de microsegundos a milisegundos
  const mappedData  = sensorData.map(point => ({
    x: point.time / 1000,
    y: point.force,
  }));

  // Aplicamos la función de downsampling usando useMemo para optimizar
  const downsampledData = useMemo(() => {
    return lttbDownsample(mappedData, decimationThreshold);
  }, [mappedData, decimationThreshold]);

  // Definimos una ventana para el promedio móvil (por ejemplo, últimos 5 segundos)
  const movingAverageWindow = 3_000; // 5000 ms = 5 segundos

  // Cálculo del promedio de la fuerza solo para los datos recientes
  const averageValue = useMemo(() => {
    if (!downsampledData.length) return 0;
    const currentTime = downsampledData[downsampledData.length - 1].x;
    const windowStartTime = currentTime - movingAverageWindow;
    
    // Buscar el índice del primer punto que esté dentro de la ventana
    let startIndex = 0;
    while (startIndex < downsampledData.length && downsampledData[startIndex].x < windowStartTime) {
      startIndex++;
    }
    
    // Extraer los datos recientes usando slice, sin mutar el array original
    const recentData = downsampledData.slice(startIndex);
    const sum = recentData.reduce((acc, point) => acc + point.y, 0);
    return recentData.length ? sum / recentData.length : 0;
  }, [downsampledData, movingAverageWindow]);

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
        pointRadius: 0,
        pointHoverRadius: 0,
        pointHitRadius: 0,
      },
    ],
  };

   // Estado para contabilizar los ciclos completos
   const [cycleCount, setCycleCount] = useState(0);
   // Este ref almacenará el estado del "medio ciclo":
   // null: sin cruce inicial
   // "above" o "below": se ha detectado el primer cruce
   const halfCycleStateRef = useRef<"above" | "below" | null>(null);

  // Definimos el valor de histéresis para evitar contar cruces por ruido.
  // Por ejemplo, 0.1 puede ser ajustado según la amplitud de la señal.
  const HYSTERESIS = 0.1;

  // Detectar cruces en cada actualización de datos
  useEffect(() => {
    if (!downsampledData.length) return;
    
    const lastPoint = downsampledData[downsampledData.length - 1];
    const upperThreshold = averageValue + HYSTERESIS;
    const lowerThreshold = averageValue - HYSTERESIS;
  
    // Determinar el estado actual de la señal
    let newState: "above" | "below" | "within" = "within";
    if (lastPoint.y >= upperThreshold) {
      newState = "above";
    } else if (lastPoint.y <= lowerThreshold) {
      newState = "below";
    }
    
    // Si la señal está dentro de la zona de tolerancia, no hacemos nada.
    if (newState === "within") return;
  
    // Si aún no se registró ningún cruce, registramos el primero.
    if (halfCycleStateRef.current === null) {
      halfCycleStateRef.current = newState;
    } 
    // Si ya se registró un cruce y ahora se detecta el opuesto, se completa un ciclo.
    else if (halfCycleStateRef.current !== newState) {
      setCycleCount(prev => prev + 1);
      // Reiniciamos para empezar a contar un nuevo ciclo.
      halfCycleStateRef.current = null;
    }
  }, [downsampledData, averageValue]);

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
          averageLine: {
            type: 'line',
            display: displayAnnotations,
            yMin: averageValue,
            yMax: averageValue,
            borderColor: 'red',
            borderWidth: 2,
            label: {
              content: `Avg: ${averageValue.toFixed(2)}`,
              display: true,
              position: 'start',
            },
          },
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
    <div>
      <Line data={chartData} options={chartOptions} />
      <h3>Ciclos contados: {cycleCount}</h3>
    </div>
  );
};

export default Index;
