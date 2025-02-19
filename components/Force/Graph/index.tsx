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

// Define el tipo para la fatiga
interface FatigueMetrics {
  lastCycleDuration: number;    // Duración del último ciclo en ms
  lastCycleAmplitude: number;   // Amplitud vertical del último ciclo
  cycleCount: number;           // Número de ciclos totales
  movingAverageForce: number;   // Valor medio de los últimos ciclos
  maxForce: number;             // Valor máximo acumulado hasta el momento
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
  const movingAverageWindow = 3_000; // 3000 ms = 3 segundos

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

  // Cálculo del valor máximo de fuerza
  const maxPoint = useMemo(() => {
    if (sensorData.length === 0) return 0;
    return Math.max(...mappedData.map(point => point.y));
  }, [mappedData]);

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

  // Estados para contabilizar ciclos completos, la duración y la amplitud del ciclo
  const [cycleCount, setCycleCount] = useState(0);
  const [cycleDuration, setCycleDuration] = useState<number | null>(null);
  const [cycleAmplitude, setCycleAmplitude] = useState<number | null>(null);
  // Ref para guardar el extremo que inició el ciclo ("above" o "below")
  const cycleStartRef = useRef<"above" | "below" | null>(null);
  // Ref para registrar el último extremo detectado
  const lastExtremeRef = useRef<"above" | "below" | null>(null);
  // Ref para almacenar el tiempo (x) en que se inició el ciclo
  const cycleStartTimeRef = useRef<number | null>(null);
  // Ref para registrar los extremos (mínimo y máximo) observados durante el ciclo actual
  const currentCycleExtremesRef = useRef<{ min: number; max: number } | null>(null);

  // Función que detecta fatiga
  const detectFatigue = (metrics: FatigueMetrics): boolean => {
    const {
      lastCycleDuration,
      lastCycleAmplitude,
      movingAverageForce,
      maxForce,
    } = metrics;

    // Definimos algunos umbrales (estos deben ajustarse a tu caso concreto)
    const MIN_AMPLITUDE_THRESHOLD = 0.5; // Si la amplitud cae por debajo de este valor, puede indicar fatiga.
    const MAX_DURATION_THRESHOLD = 2000; // Si la duración del ciclo supera este valor, puede indicar fatiga.
    const FORCE_DROP_THRESHOLD = 0.7;    // Si el valor medio cae por debajo del 70% del valor máximo, puede ser indicativo.

    // La fatiga podría detectarse si se cumplen algunas de estas condiciones:
    const amplitudeFatigue = lastCycleAmplitude < MIN_AMPLITUDE_THRESHOLD;
    const durationFatigue = lastCycleDuration > MAX_DURATION_THRESHOLD;
    const forceFatigue = movingAverageForce < (maxForce * FORCE_DROP_THRESHOLD);

    // Por ejemplo, si se cumplen al menos dos condiciones, consideramos que hay fatiga.
    const fatigueDetected = [amplitudeFatigue, durationFatigue, forceFatigue].filter(Boolean).length >= 2;
    
    return fatigueDetected;
  }

  // Valor de histéresis para definir la zona de tolerancia
  const HYSTERESIS = 0.1;

  useEffect(() => {
    if (!downsampledData.length) return;

    const lastPoint = downsampledData[downsampledData.length - 1];
    const upperThreshold = averageValue + HYSTERESIS;
    const lowerThreshold = averageValue - HYSTERESIS;

    // Determinamos el estado extremo actual
    let currentExtreme: "above" | "below" | "within" = "within";
    if (lastPoint.y >= upperThreshold) {
      currentExtreme = "above";
    } else if (lastPoint.y <= lowerThreshold) {
      currentExtreme = "below";
    } else {
      currentExtreme = "within";
    }

    // Si estamos en la zona de tolerancia, no hacemos nada
    if (currentExtreme === "within") return;

    // Mientras estemos fuera de la zona de tolerancia, acumulamos los extremos del ciclo
    if (!currentCycleExtremesRef.current) {
      currentCycleExtremesRef.current = { min: lastPoint.y, max: lastPoint.y };
    } else {
      currentCycleExtremesRef.current.min = Math.min(currentCycleExtremesRef.current.min, lastPoint.y);
      currentCycleExtremesRef.current.max = Math.max(currentCycleExtremesRef.current.max, lastPoint.y);
    }

    // Si no se ha iniciado un ciclo, asignamos el extremo actual y el tiempo de inicio
    if (cycleStartRef.current === null) {
      cycleStartRef.current = currentExtreme;
      lastExtremeRef.current = currentExtreme;
      cycleStartTimeRef.current = lastPoint.x;
      return;
    }

    // Si se detecta un cambio en el extremo
    if (currentExtreme !== lastExtremeRef.current) {
      // Actualizamos el último extremo
      lastExtremeRef.current = currentExtreme;
      // Si el extremo actual es igual al que inició el ciclo, se completó un ciclo
      if (currentExtreme === cycleStartRef.current) {
        // Calcular la amplitud: diferencia entre el valor máximo y mínimo registrados en el ciclo
        if (currentCycleExtremesRef.current) {
          const amplitude =
            currentCycleExtremesRef.current.max - currentCycleExtremesRef.current.min;
          setCycleAmplitude(amplitude);
        }
        // Se incrementa el contador de ciclos
        setCycleCount(prev => prev + 1);
        // Calcular la duración del ciclo (en milisegundos)
        if (cycleStartTimeRef.current !== null) {
          const duration = lastPoint.x - cycleStartTimeRef.current;
          setCycleDuration(duration);
        }
        // Reiniciamos el ciclo iniciando de nuevo en ese extremo
        cycleStartRef.current = currentExtreme;
        // Reiniciamos el tiempo de inicio y los extremos para el siguiente ciclo
        cycleStartTimeRef.current = lastPoint.x;
        currentCycleExtremesRef.current = null;
      }
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
            display: Boolean(displayAnnotations && sensorData.length),
            yMin: averageValue,
            yMax: averageValue,
            borderColor: 'red',
            borderWidth: 2,
            label: {
              content: `Avg: ${averageValue.toFixed(2)} kg`,
              display: true,
              position: 'start',
            },
          },
          topLine: {
            type: 'line',
            display: Boolean(displayAnnotations && sensorData.length),
            yMin: maxPoint ?? 0,
            yMax: maxPoint ?? 0,
            borderColor: 'orange',
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

  useEffect(() => {
    if (sensorData.length === 0) {
      setCycleCount(0);
    }
  }, [sensorData])

  return (
    <div>
      <Line data={chartData} options={chartOptions} />
      <h3>Ciclos contados: {cycleCount}</h3>
      <p>Duración del último ciclo: {((cycleDuration ?? 0) / 1000).toFixed(2)} s</p>
      <p>Amplitud del último ciclo: {(cycleAmplitude ?? 0).toFixed(1)} kg</p>
    </div>
  );
};

export default Index;
