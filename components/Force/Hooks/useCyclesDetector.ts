import { useEffect, useMemo, useRef, useState } from 'react';
import { DataPoint } from '@/services/chart';
import { ForceSettings } from '@/providers/Settings';

// Define la métrica del ciclo
interface CycleMetric {
  amplitude: number; // kg o grados (°)
  duration: number; // ms
  timestamp: number;
}

interface CyclesDetectorProps {
  mappedData: {x: number, y: number}[];
  downsampledData: DataPoint[];
  settings: ForceSettings;
  workLoad: number | null;
}

export default function useCyclesDetector({
  mappedData, 
  settings,
  workLoad,
  downsampledData,
}: CyclesDetectorProps) {
  const {
    hysteresis,
    movingAverageWindow,
    minAvgAmplitude,
    maxAvgDuration,
    forceDropThreshold,
    cyclesToAverage,
    velocityWeight,
    velocityVariationThreshold,
  } = settings
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

  // Cálculo del valor máximo de fuerza
  const maxPoint = useMemo(() => {
    if (mappedData.length === 0) return 0;
    return Math.max(...mappedData.map(point => point.y));
  }, [mappedData]);

  // Cálculo del promedio de la fuerza solo para los datos recientes
  const recentAverageValue = useMemo(() => {
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

  // Detectar el ciclo
  useEffect(() => {
    if (!downsampledData.length) return;

    const lastPoint = downsampledData[downsampledData.length - 1];
    const upperThreshold = recentAverageValue + hysteresis;
    const lowerThreshold = recentAverageValue - hysteresis;

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
  }, [downsampledData, recentAverageValue]);

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
      setPonderatedCycleVelocity(ponderateVelocity);
    }
  }, [ponderateVelocity]);

  // ------ Fatiga ------
  // Función de detección de fatiga basada en las métricas agregadas
  const detectFatigue = (): boolean => {
    if (!aggregatedCycleMetrics) return false;

    const amplitudeFatigue = aggregatedCycleMetrics.avgAmplitude < minAvgAmplitude;
    const durationFatigue = aggregatedCycleMetrics.avgDuration > maxAvgDuration;
    const forceFatigue = recentAverageValue < (maxPoint * forceDropThreshold);

    const velocityFatigue = 
      lastCycleVelocity !== null &&
      cycleVelocityEstimate !== null &&
      Math.abs(lastCycleVelocity - cycleVelocityEstimate) > (cycleVelocityEstimate * velocityVariationThreshold);

    // Solo incluir velocityFatigue si se pudo evaluar correctamente
    const fatigueConditions = [amplitudeFatigue, durationFatigue, forceFatigue];

    if (velocityFatigue !== false) { // Se incluye si es true, ignorando si es false o no evaluable (null)
      fatigueConditions.push(velocityFatigue);
    }

    const conditionsMet = fatigueConditions.filter(Boolean).length;
    return conditionsMet >= 2;
  }

  // Calcular la detección de fatiga (puedes mostrarla o usarla en la UI)
  const fatigueDetected = useMemo(() => detectFatigue(), [aggregatedCycleMetrics, recentAverageValue, maxPoint, lastCycleVelocity, cycleVelocityEstimate]);

  useEffect(() => {
    if (mappedData.length === 0) {
      setCycleCount(0);
      setCycleDuration(0);
      setCycleAmplitude(0);
      setLastCycleVelocity(null);
      setCycleMetrics([]);
    }
  }, [mappedData]);

  return {
    cycleCount,
    cycleDuration,
    cycleAmplitude,
    ponderatedCycleVelocity,
    fatigueDetected,
    recentAverageValue,
    maxPoint,
  }
}