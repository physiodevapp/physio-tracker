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
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

// Registrar los componentes necesarios de Chart.js, incluyendo el plugin de anotaciones
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, annotationPlugin);

// Define el tipo para cada punto de datos
export interface DataPoint {
  time: number;  // Tiempo en microsegundos (se convertirá a ms)
  force: number; // Fuerza en kg
}

// Define la métrica del ciclo
interface CycleMetric {
  amplitude: number; // kg
  duration: number; // ms
  timestamp: number;
}

// Ahora ampliamos las props para recibir los umbrales
interface IndexProps {
  sensorData: DataPoint[];
  displayAnnotations: boolean;
  isEstimatingMass: boolean;
  workLoad: number | null;
  // Ventana temporal para el promedio (en milisegundos)
  movingAverageWindow?: number;
  // Umbral de amplitud mínima promedio para detectar fatiga (ej. en kg)
  minAvgAmplitude?: number;
  // Umbral de duración máxima promedio (en ms) de un ciclo para detectar fatiga
  maxAvgDuration?: number;
  // Umbral de caída de fuerza: porcentaje del valor máximo (ej. 0.7 = 70%)
  forceDropThreshold?: number;
  // Número de ciclos a promediar para obtener las métricas agregadas
  cyclesToAverage?: number;
  // Factor de histéresis para la detección de cruces
  hysteresis?: number;
  velocityWeight?: number;
  velocityVariationThreshold?: number; 
}

const Index: React.FC<IndexProps> = ({
  sensorData,
  displayAnnotations = true,
  isEstimatingMass = false,
  workLoad = null,
  movingAverageWindow = 3_000,   // 3 segundos por defecto (en ms)
  minAvgAmplitude = 0.5,         // Ejemplo: 0.5 kg
  maxAvgDuration = 2_000,        // Ejemplo: 2000 ms
  forceDropThreshold = 0.7,      // 70%
  cyclesToAverage = 3,           // Promediar los últimos 5 ciclos
  hysteresis = 0.1,              // Factor de histéresis por defecto
  velocityWeight = 0.7,
  velocityVariationThreshold = 0.2
}) => {
  const decimationThreshold = 200;

  // Mapeamos los datos para adaptarlos a la función lttbDownsample
  //  Convertimos "time" a "x" y de microsegundos a milisegundos
  const mappedData  = sensorData.map(point => ({
    x: point.time / 1000, // ms
    y: point.force,       // kg
  }));

  // Aplicamos la función de downsampling usando useMemo para optimizar
  const downsampledData = useMemo(() => {
    return lttbDownsample(mappedData, decimationThreshold);
  }, [mappedData, decimationThreshold]);

  // Cálculo del promedio de la fuerza solo para los datos recientes
  const recentAverageForceValue = useMemo(() => {
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

  // ---------- Estados y refs para la lógica de ciclos ----------
  const [cycleCount, setCycleCount] = useState(0);
  const [cycleDuration, setCycleDuration] = useState<number | null>(null);
  const [cycleAmplitude, setCycleAmplitude] = useState<number | null>(null);
  const [lastCycleVelocity, setLastCycleVelocity] = useState<number | null>(null);
  const [cycleVelocityEstimate, setCycleVelocityEstimate] = useState<number | null>(null);
  const [ponderatedCycleVelocity, setPonderatedCycleVelocity] = useState<number | null>(null);
  const [cycleMetrics, setCycleMetrics] = useState<CycleMetric[]>([]);
  
  // ---------- Refs para la lógica de detección de ciclo ----------
  // Ref para guardar el extremo que inició el ciclo ("above" o "below")
  const cycleStartRef = useRef<"above" | "below" | null>(null);
  // Ref para registrar el último extremo detectado
  const lastExtremeRef = useRef<"above" | "below" | null>(null);
  // Ref para almacenar el tiempo (x) en que se inició el ciclo
  const cycleStartTimeRef = useRef<number | null>(null);
  // Ref para registrar los extremos (mínimo y máximo) observados durante el ciclo actual
  const currentCycleExtremesRef = useRef<{ min: number; max: number } | null>(null);

  useEffect(() => {
    if (!downsampledData.length) return;

    const lastPoint = downsampledData[downsampledData.length - 1];
    const upperThreshold = recentAverageForceValue + hysteresis;
    const lowerThreshold = recentAverageForceValue - hysteresis;

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
        // Calcular la amplitud: diferencia entre el valor máximo y mínimo registrados en el ciclo (en kg)
        let amplitude = 0;
        if (currentCycleExtremesRef.current) {
          amplitude =
            currentCycleExtremesRef.current.max - currentCycleExtremesRef.current.min;
          setCycleAmplitude(amplitude);
        }
        // Calcular la duración del ciclo (en milisegundos)
        let duration = 0;
        if (cycleStartTimeRef.current !== null) {
          duration = lastPoint.x - cycleStartTimeRef.current;
          setCycleDuration(duration);
        }        
        // Se incrementa el contador de ciclos
        setCycleCount(prev => prev + 1);
        // Almacenar las métricas del ciclo en el array (manteniendo, por ejemplo, los últimos 10 ciclos)
        setCycleMetrics(prev => {
          const newCycle = { amplitude, duration, timestamp: lastPoint.x };
          const updated = [...prev, newCycle];
          // Limitar a los últimos 10 ciclos para análisis
          return updated.slice(-10);
        });
        // Reiniciamos el ciclo iniciando de nuevo en ese extremo
        cycleStartRef.current = currentExtreme;
        // Reiniciamos el tiempo de inicio y los extremos para el siguiente ciclo
        cycleStartTimeRef.current = lastPoint.x;
        currentCycleExtremesRef.current = null;
      }
    }
  }, [downsampledData, recentAverageForceValue]);

  // --- Agrupación de métricas de ciclos para detectar fatiga ---
  // Por ejemplo, usando los últimos cyclesToAverage ciclos
  const aggregatedCycleMetrics = useMemo(() => {
    if (cycleMetrics.length === 0) return null;
    const recentCycles = cycleMetrics.slice(-cyclesToAverage);
    const avgAmplitude = recentCycles.reduce((sum, m) => sum + m.amplitude, 0) / recentCycles.length;
    const avgDuration = recentCycles.reduce((sum, m) => sum + m.duration, 0) / recentCycles.length;
    return { avgAmplitude, avgDuration, count: recentCycles.length };
  }, [cycleMetrics]);

  // ------ Velocidad estimada del último ciclo ------
  const getLastCycleVelocity  = useMemo(() => {
    if (!workLoad || !cycleAmplitude || !cycleDuration) return null; 
    // Fuerza media aproximada
    const forceMed = cycleAmplitude / 2;  
    // Tiempo del ciclo en segundos
    const cycleTimeSec = cycleDuration / 1000;  
    // Cálculo de la velocidad media
    const velocity = (forceMed / workLoad) * (cycleTimeSec / 2);

    return velocity;
  }, [workLoad, cycleAmplitude, cycleDuration]);

  useEffect(() => {
    if (getLastCycleVelocity  !== null) {
      setLastCycleVelocity(getLastCycleVelocity );
    }
  }, [getLastCycleVelocity ]);  

  // ------ Estimar la velocidad promedio de varios ciclos recientes ------
  const getCycleVelocityEstimate = useMemo(() => {
    if (!workLoad || !aggregatedCycleMetrics) return null;
  
    const { avgAmplitude, avgDuration } = aggregatedCycleMetrics;
    const forceMed = avgAmplitude / 2;
    const cycleTimeSec = avgDuration / 1000; // convertir a segundos
  
    return (forceMed / workLoad) * (cycleTimeSec / 2);
  }, [workLoad, aggregatedCycleMetrics]);

  useEffect(() => {
    if (getCycleVelocityEstimate  !== null) {
      setCycleVelocityEstimate(getCycleVelocityEstimate );
    }
  }, [getCycleVelocityEstimate ]); 

  // ------ Ponderación de velocidades ------
  const ponderateVelocity = useMemo(() => {
    const alpha = velocityWeight; // Peso para el último ciclo
    if (lastCycleVelocity === null || cycleVelocityEstimate === null) return null;
    return (alpha * lastCycleVelocity) + ((1 - alpha) * cycleVelocityEstimate);
  }, [lastCycleVelocity, cycleVelocityEstimate]);

  useEffect(() => {
    if (ponderateVelocity  !== null) {
      setPonderatedCycleVelocity(ponderateVelocity );
    }
  }, [ponderateVelocity])

  // ------ Fatiga ------
  // Función de detección de fatiga basada en las métricas agregadas
  const detectFatigue = (): boolean => {
    if (!aggregatedCycleMetrics || lastCycleVelocity === null || cycleVelocityEstimate === null) return false;

    const amplitudeFatigue = aggregatedCycleMetrics.avgAmplitude < minAvgAmplitude;
    const durationFatigue = aggregatedCycleMetrics.avgDuration > maxAvgDuration;
    const forceFatigue = recentAverageForceValue < (maxPoint * forceDropThreshold);
    const velocityVariation = Math.abs(lastCycleVelocity - cycleVelocityEstimate);
    const velocityFatigue = velocityVariation > (cycleVelocityEstimate * velocityVariationThreshold); // Fatiga si la variación supera el 20%

    // Por ejemplo, si se cumplen al menos dos condiciones, se detecta fatiga
    const conditionsMet = [amplitudeFatigue, durationFatigue, forceFatigue, velocityFatigue].filter(Boolean).length;
    return conditionsMet >= 2;
  }

  // Calcular la detección de fatiga (puedes mostrarla o usarla en la UI)
  const fatigueDetected = useMemo(() => detectFatigue(), [aggregatedCycleMetrics, recentAverageForceValue, maxPoint, lastCycleVelocity, cycleVelocityEstimate]);

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
            display: Boolean(displayAnnotations && sensorData.length),
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
            display: Boolean(displayAnnotations && sensorData.length),
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
            display: Boolean(displayAnnotations && sensorData.length),
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
            display: Boolean(displayAnnotations && sensorData.length),
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

  useEffect(() => {
    if (sensorData.length === 0) {
      setCycleCount(0);
      setCycleDuration(0);
      setCycleAmplitude(0);
      setLastCycleVelocity(null);
      setCycleMetrics([]);
    }
  }, [sensorData])

  return (
    <div className={`mt-12`}
      >
      <section className='relative w-full text-lg'>
        <div className={`absolute w-full flex flex-row justify-center items-baseline gap-4 text-center font-base text-4xl left-1/2 -translate-x-1/2 transition-[top] duration-300 ease-in-out -top-10${
            fatigueDetected ? 'text-red-500 animate-pulse' : ''
          } ${
            isEstimatingMass ? 'opacity-40' : ''
          }`}
        >
          <span className={`flex flex-row-reverse justify-start items-center gap-2 ${
            (workLoad !== null && sensorData.length) ? 'flex-[1.1]' : ''
          }`}
          >
            {cycleCount ?? 0} {cycleCount === 1 ? 'rep' : 'reps'}
            {fatigueDetected && (
              <ExclamationTriangleIcon className='w-6 h-6'/>
            )}
          </span>
          {(workLoad !== null && sensorData.length) && (
            <span className='flex-1 text-3xl text-left'>
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
      <Line data={chartData} options={chartOptions} />
    </div>
  );
};

export default Index;
