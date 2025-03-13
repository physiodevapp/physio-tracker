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
  downsampledData,
  settings,  
  workLoad = null,
}: CyclesDetectorProps) {
  const {
    hysteresis,
    movingAverageWindow,
    minAvgAmplitude,
    forceDropThreshold: amplitudeDropThreshold,
    cyclesToAverage,
  } = settings
// ---------- Estados y refs para la lógica de ciclos ----------
  const [cycleCount, setCycleCount] = useState(0);
  const [cycleDuration, setCycleDuration] = useState<number | null>(null);
  const [cycleAmplitude, setCycleAmplitude] = useState<number | null>(null);

  const [cycleMetrics, setCycleMetrics] = useState<CycleMetric[]>([]);
  const cycleDurations = useRef<number[]>([]);
  const initialAvgVelocity = useRef<number | null>(null);
  const durationChangeThreshold = 0.05;
  const velocityDropThreshold = 0.75;
  const variabilityThreshold = 0.04; 
  
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
  const peak = useMemo(() => {
    if (mappedData.length === 0) return 0;
    return Math.max(...mappedData.map(point => point.y));
  }, [mappedData]);

  // Cálculo del promedio de la fuerza solo para los datos recientes
  const recentWindowData: { recentAverageValue: number; recentPeak: number } = useMemo(() => {
    if (!downsampledData.length) return { recentAverageValue: 0, recentPeak: 0 };
    
    const currentTime = downsampledData[downsampledData.length - 1].x;
    const windowStartTime = currentTime - movingAverageWindow;
    
    // Buscar el índice del primer punto que esté dentro de la ventana
    let startIndex = 0;
    while (startIndex < downsampledData.length && downsampledData[startIndex].x < windowStartTime) {
      startIndex++;
    }
    
    // Extraer los datos recientes usando slice, sin mutar el array original
    const recentData = downsampledData.slice(startIndex);

    if (!recentData.length) return { recentAverageValue: 0, recentPeak: 0 };

    // Obtener el valor máximo y mínimo en la ventana de tiempo
    const maxVal = Math.max(...recentData.map(point => point.y));
    const minVal = Math.min(...recentData.map(point => point.y));

    // Calcular la media del máximo y mínimo
    const recentAverageValue = (maxVal + minVal) / 2;

    // Obtener el pico más alto en la ventana de tiempo
    const recentPeak = maxVal;

    return { recentAverageValue, recentPeak };
  }, [downsampledData, movingAverageWindow]);

  const updateCycleDurations = (newDuration: number) => {
    cycleDurations.current.push(newDuration);
    
    // Mantener solo los últimos "cyclesToAverage" ciclos en la memoria
    if (cycleDurations.current.length > cyclesToAverage) {
      cycleDurations.current.shift();
    }
  };

  // Detectar el ciclo
  useEffect(() => {
    if (!downsampledData.length) return;

    const lastPoint = downsampledData[downsampledData.length - 1];
    const upperThreshold = recentWindowData.recentAverageValue + hysteresis;
    const lowerThreshold = recentWindowData.recentAverageValue - hysteresis;

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
        // Guardar la duración del nuevo ciclo en el historial para analizar tendencias de fatiga
        // Esto permite calcular la tasa de cambio del tiempo del ciclo y detectar si se está alargando progresivamente
        updateCycleDurations(duration);
        // Reiniciamos el ciclo iniciando de nuevo en ese extremo
        cycleStartRef.current = currentExtreme;
        // Reiniciamos el tiempo de inicio y los extremos para el siguiente ciclo
        cycleStartTimeRef.current = lastPoint.x;
        currentCycleExtremesRef.current = null;
      }
    }
  }, [downsampledData, recentWindowData]);

  // --- Agrupación de métricas de ciclos para detectar fatiga ---
  // Por ejemplo, usando los últimos "cyclesToAverage" ciclos
  const aggregatedCycleMetrics = useMemo(() => {
    if (cycleMetrics.length === 0) return null;
    const recentCycles = cycleMetrics.slice(-cyclesToAverage);
    const avgAmplitude = recentCycles.reduce((sum, m) => sum + m.amplitude, 0) / recentCycles.length;
    const avgDuration = recentCycles.reduce((sum, m) => sum + m.duration, 0) / recentCycles.length;
    return { avgAmplitude, avgDuration, count: recentCycles.length };
  }, [cycleMetrics]);

  // ------ Fatiga ------
  // Función de detección de fatiga basada en las métricas agregadas
  const detectFatigue = (): {isFatigued: boolean, reasons: string[]} => {
    if (!aggregatedCycleMetrics || !cycleMetrics || !cycleDurations) return { isFatigued: false, reasons: [] };

    // Verifica si se puede normalizar
    const isWorkLoadConstant = (workLoad ?? 0) > 0; 

    // const cycleDurationFatigue  = aggregatedCycleMetrics.avgDuration > maxAvgDuration;
    let durationChangeRate = 0;
    if (cycleDurations.current.length >= 2) {
      const lastDurations = cycleDurations.current.slice(-cyclesToAverage); // Tomamos los últimos "cyclesToAverage" ciclos
      for (let i = 1; i < lastDurations.length; i++) {
        durationChangeRate += (lastDurations[i] - lastDurations[i - 1]) / lastDurations[i - 1]; 
      }
      durationChangeRate /= (lastDurations.length - 1); // Promedio del cambio
    }

    // Calcular la "velocidad" (kg/s) promedio de los últimos ciclos
    const recentVelocities = cycleMetrics
      .slice(-cyclesToAverage) // Últimos "cyclesToAverage" ciclos
      .map(cycle => (cycle.amplitude / cycle.duration) / (isWorkLoadConstant ? workLoad! : 1))
      .filter(velocity => !isNaN(velocity) && isFinite(velocity));

    const avgVelocity = recentVelocities.length > 0 
      ? recentVelocities.reduce((sum, v) => sum + v, 0) / recentVelocities.length 
      : 0;  
    // Comparar con la velocidad inicial (promedio de los primeros "cyclesToAverage" ciclos)
    // Calcular la velocidad inicial una sola vez
    if (initialAvgVelocity.current === null && cycleMetrics.length >= cyclesToAverage) {
      const initialVelocities = cycleMetrics
        .slice(0, cyclesToAverage)
        .map(cycle => (cycle.amplitude / cycle.duration) / (isWorkLoadConstant ? workLoad! : 1))
        .filter(velocity => !isNaN(velocity) && isFinite(velocity));
      
      initialAvgVelocity.current = initialVelocities.length > 0 
        ? initialVelocities.reduce((sum, v) => sum + v, 0) / initialVelocities.length 
        : avgVelocity;
    }

    // Calcular la variabilidad de los últimos "cyclesToAverage" ciclos
    const recentAmplitudes = cycleMetrics
      .slice(-cyclesToAverage)
      .map(cycle => cycle.amplitude / (isWorkLoadConstant ? workLoad! : 1));
    const amplitudeMean = recentAmplitudes.reduce((sum, val) => sum + val, 0) / recentAmplitudes.length;
    const amplitudeVariance = recentAmplitudes.reduce((sum, val) => sum + Math.pow(val - amplitudeMean, 2), 0) / recentAmplitudes.length;
    
    // Fatiga basada en métricas promediadas sobre los ciclos recientes
    const cycleAmplitudeFatigue  = (aggregatedCycleMetrics.avgAmplitude / (isWorkLoadConstant ? workLoad! : 1)) < minAvgAmplitude;
    const cycleDurationFatigue = durationChangeRate > durationChangeThreshold;
    const velocityFatigue = initialAvgVelocity !== null && avgVelocity < ((initialAvgVelocity.current ?? 0) * velocityDropThreshold);
    const variabilityFatigue = amplitudeVariance > variabilityThreshold;
    // Fatiga basada en el promedio de valores en la ventana de tiempo definida
    const timeWindowAmplitudeFatigue = (recentWindowData.recentPeak / (isWorkLoadConstant ? workLoad! : 1)) < (peak * amplitudeDropThreshold);

    // Guardamos las razones específicas de fatiga
    const fatigueReasons: string[] = [];
    if (cycleAmplitudeFatigue) fatigueReasons.push(" ↓ Amp");
    if (cycleDurationFatigue) fatigueReasons.push(" ↑ Cyc");
    if (timeWindowAmplitudeFatigue) fatigueReasons.push(" ↓ F̅");
    if (velocityFatigue) fatigueReasons.push(" ↓ V̅");
    if (variabilityFatigue) fatigueReasons.push(" ↑ Var");

    const isFatigued = fatigueReasons.length >= 2;

    return { isFatigued, reasons: fatigueReasons };
  }

  // Calcular la detección de fatiga (puedes mostrarla o usarla en la UI)
  const fatigueStatus = useMemo(() => detectFatigue(), [aggregatedCycleMetrics, recentWindowData, peak]);

  useEffect(() => {
    if (mappedData.length === 0) {
      setCycleCount(0);
      setCycleDuration(0);
      setCycleAmplitude(0);
      setCycleMetrics([]);
      initialAvgVelocity.current = null;
    }
  }, [mappedData]);

  return {
    cycleCount,
    cycleDuration,
    cycleAmplitude,
    fatigueStatus,
    recentWindowData,
    peak,
  }
}