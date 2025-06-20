import { useEffect, useMemo, useRef, useState } from 'react';
import { DataXYPoint } from '@/utils/chart';
import { ForceSettings } from '@/providers/Settings';

// Define la métrica del ciclo
interface CycleMetric {
  amplitude: number; // kg o grados (°)
  duration: number; // ms
  timestamp: number;
}

interface CyclesDetectorProps {
  downsampledData: DataXYPoint[];
  settings: ForceSettings;
  workLoad: number | null;
  // mappedData: {x: number, y: number}[];
  // isRecording: boolean;
}

export default function useCyclesDetector({
  downsampledData,
  settings,  
  workLoad = null,
}: CyclesDetectorProps) {
  const {
    hysteresis,
    movingAverageWindow,
    minAvgAmplitude,
    peakDropThreshold: amplitudeDropThreshold,
    cyclesToAverage,
    cyclesForAnalysis,
    durationChangeThreshold,
    velocityDropThreshold,
    variabilityThreshold,
  } = settings;

  const fatigueTipsMap: Record<string, string> = {
    // Individual
    "↓ Amp": "Power output is reduced.",
    "↑ Cyc": "Movement is slower.",
    "↓ F̅": "Power output is reduced.",
    "↓ V̅": "Movement is slower.",
    "↑ Var": "Movement is less stable.",
  
    // Doubles
    "↓ Amp,↑ Cyc": "Movement is slower and less powerful.",
    "↓ Amp,↓ V̅": "Movement is slower and less powerful.",
    "↓ F̅,↓ V̅": "Movement is slower and less powerful.",
    "↑ Cyc,↑ Var": "Movement is slower and less stable.",
    "↓ Amp,↑ Var": "Movement is less stable and less powerful.",
    "↓ F̅,↑ Var": "Movement is less stable and less powerful.",
  
    // Triples
    "↓ Amp,↑ Cyc,↑ Var": "Fatigue is slowing and destabilizing movement.",
    "↓ Amp,↓ V̅,↑ Var": "Fatigue is slowing and destabilizing movement.",
    "↓ Amp,↓ F̅,↓ V̅": "Significant power loss detected.",
    "↑ Cyc,↓ V̅,↑ Var": "Fatigue is slowing and destabilizing movement.",
    "↓ F̅,↓ V̅,↑ Var": "Fatigue is slowing and destabilizing movement.",
    "↓ Amp,↑ Cyc,↓ V̅": "Fatigue is slowing and weakening movement.",
    "↓ Amp,↑ Cyc,↓ F̅": "Fatigue is slowing and weakening movement.",
    "↓ Amp,↓ F̅,↑ Var": "Fatigue is destabilizing and weakening movement.",
    "↓ F̅,↑ Cyc,↑ Var": "Fatigue is slowing and destabilizing movement.",
  };    

  // ---------- Estados y refs para la lógica de ciclos ----------
  const [cycleCount, setCycleCount] = useState(0);
  const [cycleDuration, setCycleDuration] = useState<number | null>(null);
  const [cycleAmplitude, setCycleAmplitude] = useState<number | null>(null);
  const [cycleRelativeSpeedRatio, setCycleRelativeSpeedRatio] = useState<number | null>(null);
  const [cycleBoundaries, setCycleBoundaries] = useState<{ startX: number; endX: number, minY: number, maxY: number }>();

  const [cycleMetrics, setCycleMetrics] = useState<CycleMetric[]>([]);
  const cycleDurationsRef = useRef<number[]>([]);
  const initialAvgVelocityRef = useRef<number | null>(null);
  
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
  // const peak = useMemo(() => {
  //   if (mappedData.length === 0) return 0;
  //   return Math.max(...mappedData.map(point => point.y));
  // }, [mappedData]);
  const peak = useMemo(() => {
    if (downsampledData.length === 0) return 0;
    return Math.max(...downsampledData.map(point => point.y));
  }, [downsampledData]);

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
    cycleDurationsRef.current.push(newDuration);
    
    // Mantener solo los últimos "cyclesToAverage" ciclos en la memoria
    if (cycleDurationsRef.current.length > cyclesToAverage) {
      cycleDurationsRef.current.shift();
    }
  };

  // ----- Detectar el ciclo -----
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
        // let amplitude = 0;
        // if (currentCycleExtremesRef.current) {
        //   amplitude =
        //     currentCycleExtremesRef.current.max - currentCycleExtremesRef.current.min;
        //   setCycleAmplitude(amplitude);
        // }
        // Calcular la duración del ciclo (en milisegundos)
        // let duration = 0;
        // if (cycleStartTimeRef.current !== null) {
        //   duration = lastPoint.x - cycleStartTimeRef.current;
        //   setCycleDuration(duration);
        // }   
        // Se marcan los "limites" del ciclo
        let amplitude = 0;
        let duration = 0;
        if (cycleStartTimeRef.current !== null && currentCycleExtremesRef.current) {
          const startX = cycleStartTimeRef.current;
          const endX = lastPoint.x;

          const pointsInCycle = downsampledData.filter(p => p.x >= startX && p.x <= endX);

          const maxY = Math.max(...pointsInCycle.map(p => p.y));
          const minY = Math.min(...pointsInCycle.map(p => p.y));

          setCycleBoundaries({ 
            startX, 
            endX,
            minY,
            maxY,
          });

          duration = endX - startX;
          setCycleDuration(duration);

          amplitude = maxY - minY;
          setCycleAmplitude(amplitude)
        }  
        // Se incrementa el contador de ciclos
        setCycleCount(prev => prev + 1);
        // Almacenar las métricas del ciclo en el array (manteniendo, por ejemplo, los últimos 10 ciclos)
        setCycleMetrics(prev => {
          const newCycle = { amplitude, duration, timestamp: lastPoint.x };
          const updated = [...prev, newCycle];
          // Limitar a los últimos "maxCyclesForAnalysis" ciclos para análisis
          return updated.slice(-cyclesForAnalysis);
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
  const detectFatigue = (): {isFatigued: boolean, reasons: string[], interpretation: string} => {
    if (!aggregatedCycleMetrics || !cycleMetrics || !cycleDurationsRef) return { isFatigued: false, reasons: [], interpretation: "" };

    // Verifica si se puede normalizar
    const isWorkLoadConstant = (workLoad ?? 0) > 0; 

    // const cycleDurationFatigue  = aggregatedCycleMetrics.avgDuration > maxAvgDuration;
    let durationChangeRate = 0;
    if (cycleDurationsRef.current.length >= 2) {
      const lastDurations = cycleDurationsRef.current
        .slice(-cyclesToAverage)
      for (let i = 1; i < lastDurations.length; i++) {
        durationChangeRate += (lastDurations[i] - lastDurations[i - 1]) / lastDurations[i - 1]; 
      }
      durationChangeRate /= (lastDurations.length - 1); // Promedio del cambio
    }

    //---- Comparar con la velocidad inicial (promedio de los primeros "cyclesToAverage" ciclos) ----
    // Calcular la "velocidad" (kg/s) promedio de los últimos ciclos
    const recentVelocities = cycleMetrics
      .slice(-cyclesToAverage) // Últimos "cyclesToAverage" ciclos
      .map(cycle => (cycle.amplitude / (cycle.duration)) / (isWorkLoadConstant ? workLoad! : 1))
      .filter(velocity => !isNaN(velocity) && isFinite(velocity));

    const avgVelocity = recentVelocities.length > 0 
      ? recentVelocities.reduce((sum, v) => sum + v, 0) / recentVelocities.length 
      : 0;  
    // Calcular la velocidad inicial una sola vez
    if (initialAvgVelocityRef.current === null && cycleMetrics.length > cyclesToAverage) {
      const initialVelocities = cycleMetrics
        .slice(1, cyclesToAverage + 1)
        .map(cycle => (cycle.amplitude / (cycle.duration)) / (isWorkLoadConstant ? workLoad! : 1))
        .filter(velocity => !isNaN(velocity) && isFinite(velocity));
      
      initialAvgVelocityRef.current = initialVelocities.length > 0 
        ? initialVelocities.reduce((sum, v) => sum + v, 0) / initialVelocities.length 
        : avgVelocity;
    }
    // Calcular el speed ratio
    const isValidCycle =
      cycleAmplitude != null &&
      cycleDuration != null &&
      isFinite(cycleAmplitude) &&
      isFinite(cycleDuration) &&
      cycleDuration !== 0;
    const velocity = isValidCycle
      ? (cycleAmplitude / cycleDuration) / (isWorkLoadConstant ? workLoad! : 1)
      : null;
    setCycleRelativeSpeedRatio(
      initialAvgVelocityRef.current != null &&
      velocity != null &&
      isFinite(velocity)
        ? velocity / initialAvgVelocityRef.current
        : null
    );

    // Calcular la variabilidad de los últimos "cyclesToAverage" ciclos
    const recentAmplitudes = cycleMetrics
      .slice(-cyclesToAverage)
      .map(cycle => cycle.amplitude / (isWorkLoadConstant ? workLoad! : 1));
    const amplitudeMean = recentAmplitudes.reduce((sum, val) => sum + val, 0) / recentAmplitudes.length;
    const amplitudeVariance = recentAmplitudes.reduce((sum, val) => sum + Math.pow(val - amplitudeMean, 2), 0) / recentAmplitudes.length;
    
    // Fatiga basada en métricas promediadas sobre los ciclos recientes
    const cycleAmplitudeFatigue  = (aggregatedCycleMetrics.avgAmplitude / (isWorkLoadConstant ? workLoad! : 1)) < minAvgAmplitude;
    const cycleDurationFatigue = durationChangeRate > durationChangeThreshold;
    const velocityFatigue = initialAvgVelocityRef.current !== null && avgVelocity < ((initialAvgVelocityRef.current ?? 0) * velocityDropThreshold);
    const variabilityFatigue = amplitudeVariance > variabilityThreshold;
    // Fatiga basada en el promedio de valores en la ventana de tiempo definida
    const timeWindowAmplitudeFatigue = (recentWindowData.recentPeak / (isWorkLoadConstant ? workLoad! : 1)) < (peak * amplitudeDropThreshold);

    // Guardamos las razones específicas de fatiga
    const fatigueReasons: string[] = [];
    if (cycleAmplitudeFatigue) fatigueReasons.push("↓ Amp");
    if (cycleDurationFatigue) fatigueReasons.push("↑ Cyc");
    if (timeWindowAmplitudeFatigue) fatigueReasons.push("↓ F̅");
    if (velocityFatigue) fatigueReasons.push("↓ V̅");
    if (variabilityFatigue) fatigueReasons.push("↑ Var");

    const isFatigued = fatigueReasons.length >= 2;
    const fatigueTip = getFatigueTip(fatigueReasons);

    return { isFatigued, reasons: fatigueReasons, interpretation: fatigueTip };
  }

  const getFatigueTip = (fatigueReasons: string[]): string => {
    if (fatigueReasons.length === 0) return "No fatigue detected.";
  
    const key = fatigueReasons.sort().join(',');
  
    if (fatigueReasons.length <= 3 && fatigueTipsMap[key]) {
      return fatigueTipsMap[key];
    }
  
    return "Multiple fatigue markers detected.";
  };

  // Calcular la detección de fatiga (puedes mostrarla o usarla en la UI)
  const fatigueStatus = useMemo(() => detectFatigue(), [aggregatedCycleMetrics, recentWindowData, peak]);

  useEffect(() => {
    if (downsampledData.length === 0) {
      setCycleCount(0);
      setCycleDuration(null);
      setCycleAmplitude(null);
      setCycleRelativeSpeedRatio(null);
      setCycleBoundaries(undefined);
      setCycleMetrics([]);
      cycleDurationsRef.current = [];
      initialAvgVelocityRef.current = null;
      cycleStartRef.current = null;
      lastExtremeRef.current = null;
      cycleStartTimeRef.current = null;
      currentCycleExtremesRef.current = null;
    }
  }, [downsampledData]);

  return {
    cycleCount,
    cycleDuration,
    cycleAmplitude,
    cycleRelativeSpeedRatio,
    cycleBoundaries,
    fatigueStatus,
    recentWindowData,
    peak,
  }
}