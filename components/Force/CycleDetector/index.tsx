import React, { useState, useEffect, useRef } from 'react';

enum CycleState {
  IDLE,
  IN_CYCLE,
}

interface DataPoint {
  force: number;
  time: number; // en microsegundos
}

type ThresholdType = "peak" | "trough";

interface NewThresholds {
  newThresholdHigh: number;
  newThresholdLow: number;
}

interface IndexProps {
  dataPoint: DataPoint | null;
  reset: boolean;
  calibrationTime: number; // en milisegundos
  isRecording: boolean;
  onThresholdsUpdate: (thresholdLow: number, thresholdHigh: number) => void;
  onCycleDetected: (cycleCount: number | null) => void;
}

const Index: React.FC<IndexProps> = ({
  dataPoint,
  reset,
  calibrationTime,
  isRecording,
  onThresholdsUpdate,
  onCycleDetected,
}) => {
  // Parámetros ajustables con sliders
  const [windowSize, setWindowSize] = useState<number>(100);
  const [minConsecutiveLow, setMinConsecutiveLow] = useState<number>(2);
  const peakMergeInterval = 200_000; // en microsegundos
  const [reductionFactor, setReductionFactor] = useState(0.20); // Controla el % de reducción del pico
  const [growthFactor, setGrowthFactor] = useState(0.35); // Controla el % de crecimiento del mínimo

  const [thresholds, setThresholds] = useState<{ high: number; low: number }>({
    high: 0,
    low: 0,
  });  
  const [cycleCount, setCycleCount] = useState<number>(0);
  const [avgCycleInterval, setAvgCycleInterval] = useState(0);
  const lastUpdateRef = useRef<number>(0);
  const updateInterval = 2_500; // actualizar cada 1000ms, por ejemplo

  // Refs para almacenar datos y estado interno sin re-renderizados
  const dataWindowRef = useRef<number[]>([]);
  const cycleStateRef = useRef<CycleState>(CycleState.IDLE);
  const consecutiveLowCountRef = useRef<number>(0);
  const lastPeakTimestampRef = useRef<number>(0);
  const peakIntervalsRef = useRef<number[]>([]);
  const thresholdLowRef = useRef<number>(thresholds.low);
  const thresholdHighRef = useRef<number>(thresholds.high);
  const minConsecutiveLowRef = useRef(minConsecutiveLow);
  const reductionFactorRef = useRef(reductionFactor);
  const growthFactorRef = useRef(growthFactor);
  const windowSizeRef = useRef(windowSize);
  const lastCycleFinishRef = useRef<number>(0);
  const cycleIntervalsRef = useRef<number[]>([]);
  const avgCycleIntervalRef = useRef<number>(avgCycleInterval);

  // Variables de calibración y fijación de umbrales
  const [isCalibrating, setIsCalibrating] = useState<boolean>(true);
  const [thresholdsFixed, setThresholdsFixed] = useState<boolean>(false);
  const calibrationDataRef = useRef<number[]>([]);
  const [initialThresholds, setInitialThresholds] = useState<{ high: number; low: number } | null>(null);

  // Para reajuste por fatiga (opcional, en este ejemplo no lo usamos)
  const [fatigueMessage, setFatigueMessage] = useState<string>("");

  const growMin = (x: number, factor: number) => {
    return x + Math.abs(x) * factor;
  }

  const reduceMax = (x: number, factor: number) => {
    return x - Math.abs(x) * factor;
  }

  // Función para calcular estadísticas (media y desviación estándar)
  // const updateStats = (data: number[]): { baseline: number; stdDev: number } => {
  //   const n = data.length;
  //   const mean = data.reduce((sum, val) => sum + val, 0) / n;
  //   const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
  //   return { baseline: mean, stdDev: Math.sqrt(variance) };
  // };  
  
  // Actualiza los umbrales
  const updateThresholds = (thresholdType: ThresholdType, factor: number, data: number[]): NewThresholds => {    
    let newThresholdHigh = thresholdHighRef.current;
    let newThresholdLow = thresholdLowRef.current;

    if (data.length === 0) return { newThresholdHigh, newThresholdLow };
    // console.log('updateThresholds data.length ', data.length);
    // Ordena los datos
    const sorted = [...data].sort((a, b) => a - b);

    // Actualiza el threshold alto (picos) si no se está ajustando solo el reductionFactor
    if (thresholdType === "peak") {
      const numPeaks = Math.max(1, Math.floor(sorted.length * 0.1));
      const topPeaks = sorted.slice(sorted.length - numPeaks);
      const typicalPeak = topPeaks.reduce((sum, value) => sum + value, 0) / topPeaks.length;
      newThresholdHigh = reduceMax(typicalPeak, factor);
      thresholdHighRef.current = newThresholdHigh;
    }

    // Actualiza el threshold bajo (valles) si no se está ajustando solo el growthFactor
    if (thresholdType === "trough") {
      const numLows = Math.max(1, Math.floor(sorted.length * 0.1));
      const bottomLows = sorted.slice(0, numLows);
      const typicalLow = bottomLows.reduce((sum, value) => sum + value, 0) / bottomLows.length;
      newThresholdLow = growMin(typicalLow, factor);
      thresholdLowRef.current = newThresholdLow;
    }

    // Actualiza el estado para disparar el useEffect que depende de los thresholds.
    setThresholds({ high: newThresholdHigh, low: newThresholdLow });

    return { newThresholdHigh, newThresholdLow };
  }

  // Finaliza la calibración y fija los umbrales iniciales. 
  const finalizeCalibration = () => {
    setIsCalibrating(false);

    if (calibrationDataRef.current.length === 0) return;

    // Descarta el primer 30% de los datos
    const totalData = calibrationDataRef.current.length;
    const startIndex = Math.floor(totalData * 0.30);
    const filteredData = calibrationDataRef.current.slice(startIndex);

    // Llena inicialmente la ventana de datos con filteredData 
    dataWindowRef.current = [...filteredData]

    const { newThresholdHigh } = updateThresholds("peak", reductionFactorRef.current, filteredData);
    const { newThresholdLow } = updateThresholds("trough", growthFactorRef.current, filteredData );

    setInitialThresholds({ high: newThresholdHigh, low: newThresholdLow });

    setThresholdsFixed(true);

    // Envía los valores al componente padre
    onThresholdsUpdate(newThresholdLow, newThresholdHigh);
  };

  // Procesa cada nueva lectura del sensor
  const handleNewReading = (force: number, timestamp: number) => {
    if (!isRecording) return;

    // Durante la calibración, acumula datos
    if (isCalibrating) {
      calibrationDataRef.current.push(force);
    }

    if (!isCalibrating) {
      // Actualiza la ventana móvil
      dataWindowRef.current.push(force);

      if (dataWindowRef.current.length > windowSize) {
        dataWindowRef.current.shift();

        const now = Date.now();
        // Actualizamos los thresholds solo si ha pasado el intervalo deseado
        if (now - lastUpdateRef.current > updateInterval) {
          console.log('update now');
          // Descarta el primer 30% de los datos
          const totalData = dataWindowRef.current.length;
          const startIndex = Math.floor(totalData * 0.30);
          const filteredData = dataWindowRef.current.slice(startIndex);

          const { newThresholdHigh } = updateThresholds("peak", reductionFactorRef.current, filteredData);
          const { newThresholdLow } = updateThresholds("trough", growthFactorRef.current, filteredData);
          
          onThresholdsUpdate(newThresholdLow, newThresholdHigh);

          lastUpdateRef.current = now;
        }
      }
    }

    // Solo se detectan ciclos si la calibración ha finalizado
    if (!isCalibrating) {
      const thLow = thresholdLowRef.current;
      const thHigh = thresholdHighRef.current;

      if (cycleStateRef.current === CycleState.IDLE) {
        if (force > thHigh) {
          cycleStateRef.current = CycleState.IN_CYCLE;
          setCycleCount(prev => prev + 1);
          consecutiveLowCountRef.current = 0;
          lastPeakTimestampRef.current = timestamp;
          // console.log(`Ciclo #${cycleCount + 1} iniciado en t=${timestamp}`);
        }
      } else if (cycleStateRef.current === CycleState.IN_CYCLE) {
        if (force > thHigh) {
          const interval = timestamp - lastPeakTimestampRef.current;
          if (lastPeakTimestampRef.current > 0 && interval < peakMergeInterval) {
            peakIntervalsRef.current.push(interval);
          }
          lastPeakTimestampRef.current = timestamp;
          consecutiveLowCountRef.current = 0;
          // console.log(`Pico detectado en ciclo #${cycleCount} a t=${timestamp}`);
        } else if (force < thLow) {
          consecutiveLowCountRef.current++;
        } else {
          consecutiveLowCountRef.current = 0;
        }

        if (consecutiveLowCountRef.current >= minConsecutiveLowRef.current) {
          // Calcular intervalo promedio entre picos (dentro del ciclo actual)
          // if (peakIntervalsRef.current.length > 0) {
          //   const avgInterval =
          //     peakIntervalsRef.current.reduce((a, b) => a + b, 0) /
          //     peakIntervalsRef.current.length;
          //   console.log(`Intervalo promedio entre picos intraciclo: ${avgInterval} microsegundos`);
          // }

          // Calcular el intervalo entre ciclos:
          if (lastCycleFinishRef.current > 0) {
            const cycleInterval = timestamp - lastCycleFinishRef.current;
            cycleIntervalsRef.current.push(cycleInterval);
            // Calcular el promedio de intervalos entre ciclos
            const avgCycleInterval = cycleIntervalsRef.current.reduce((a, b) => a + b, 0) / cycleIntervalsRef.current.length;
            // console.log(`Intervalo promedio entre ciclos: ${avgCycleInterval} microsegundos`);
            // Actualiza la ref para usarla en el useEffect de fatiga
            avgCycleIntervalRef.current = avgCycleInterval;
            setAvgCycleInterval(avgCycleInterval)
          }
          
          // Actualizar el timestamp de finalización del ciclo actual
          lastCycleFinishRef.current = timestamp;

          cycleStateRef.current = CycleState.IDLE;
          consecutiveLowCountRef.current = 0;
          peakIntervalsRef.current = [];
        }
      }
    }
  };

  const handleMinconsecutiveLowChangeFinished = (value: number) => {
    minConsecutiveLowRef.current = value;
  }

  const handleWindowSizeChangeFinished = (value: number) => {
    dataWindowRef.current = [];
    windowSizeRef.current = value;
  } 

  // Este efecto se dispara cuando cambian reductionFactor o growthFactor
  const handleThresholdChangeFinished = (type: ThresholdType, value: number) => {
    console.log('dataWindowRef.current.length -> ', dataWindowRef.current.length);
    if (thresholdsFixed && dataWindowRef.current.length >= windowSizeRef.current) {
      const {newThresholdHigh, newThresholdLow} = updateThresholds(type, value, dataWindowRef.current);

      // Notificamos al padre con los nuevos valores recalibrados
      onThresholdsUpdate(newThresholdLow, newThresholdHigh);
    }
  }

  // Inicia el timer de calibración si isRecording es true
  useEffect(() => {
    if (isRecording) {

      const calibrationTimer = setTimeout(() => {
        finalizeCalibration();
      }, calibrationTime);
      return () => clearTimeout(calibrationTimer);
    }
  }, [calibrationTime, isRecording]);

  // Efecto para procesar cada nuevo dato del sensor
  useEffect(() => {
    if (dataPoint && isRecording) {
      handleNewReading(dataPoint.force, dataPoint.time);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataPoint, isRecording]);

  // Resetear el componente cuando se activa la prop "reset"
  useEffect(() => {
    if (reset) {
      console.log("Reseteando SensorCycleDetector");
      cycleStateRef.current = CycleState.IDLE;
      consecutiveLowCountRef.current = 0;
      lastPeakTimestampRef.current = 0;
      peakIntervalsRef.current = [];
      dataWindowRef.current = [];
      thresholdLowRef.current = 0;
      thresholdHighRef.current = 0;
      calibrationDataRef.current = [];
      lastUpdateRef.current = 0;
      cycleIntervalsRef.current = [];
      lastCycleFinishRef.current = 0;
      avgCycleIntervalRef.current = 0;
      setCycleCount(0);
      setAvgCycleInterval(0);
      setInitialThresholds({high: 0, low: 0});
      setThresholds({high: 0, low: 0});
      setThresholdsFixed(false);
      setIsCalibrating(true);
      setFatigueMessage("");
    }
  }, [reset]);

  // Notificamos al padre los ciclos totales detectados
  useEffect(() => {
    const cycleCountUpdate = isCalibrating ? null : cycleCount;
    onCycleDetected(cycleCountUpdate);
  }, [cycleCount, isCalibrating]);

  // Detectamos si hay indicios de fatiga
  useEffect(() => {
    if (!isCalibrating && initialThresholds) {
      // 1. Detectar aplanamiento (disminución del rango)
      // const initialRange = initialThresholds.high - initialThresholds.low;
      // const currentRange = thresholds.high - thresholds.low;
      // if (currentRange < initialRange * 0.7) {
      //   setFatigueMessage("Posible fatiga detectada: la curva se ha aplanado significativamente.");
      //   console.log('curva APLANÁNDOSE...');
      //   console.log('initialRange - ', initialRange.toFixed(1), ' - currentRange - ', currentRange.toFixed(1));
      //   console.log('=======================');
      // } else {
      //   setFatigueMessage("");
      // }

      // 2. Detectar ralentización del ciclo
      const cycleIntervalThreshold = 2_500_000; // 1,000,000 microsegundos
      if (avgCycleInterval > cycleIntervalThreshold) {
        setFatigueMessage(prev =>
          prev
          ? prev + " Además, el ciclo se está ralentizando."
          : "Posible fatiga detectada: el ciclo se está ralentizando."
        );
        console.log('curva RALENTIZÁNDOSE...');
        console.log('avgCycleInterval - ', (avgCycleInterval / 1_000_000).toFixed(2), 'cycleIntervalThreshold - ', (cycleIntervalThreshold / 1_000_000).toFixed(2));
        console.log('=======================');
      }
    }
  }, [thresholds, avgCycleInterval, isCalibrating, initialThresholds]);

  

  return (
    <div className="p-4 border border-gray-300 rounded shadow max-w-md mx-auto">
      <div className="space-y-1">
        <div>
          <label className="block mb-1 font-medium">Decrease the peak by   {(reductionFactor * 100).toFixed(0)}%</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={reductionFactor}
            onChange={(e) => setReductionFactor(parseFloat(e.target.value))}
            onMouseUp={(e) => handleThresholdChangeFinished("peak", parseFloat(e.currentTarget.value))}
            onTouchEnd={(e) => handleThresholdChangeFinished("peak", parseFloat(e.currentTarget.value))}
            className="w-full"
            disabled={isCalibrating}
            />
        </div>
        <div>
          <label className="block mb-1 font-medium">Increase the trough by {(growthFactor * 100).toFixed(0)}%</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={growthFactor}
            onChange={(e) => setGrowthFactor(parseFloat(e.target.value))}
            onMouseUp={(e) => handleThresholdChangeFinished("trough", parseFloat(e.currentTarget.value))}
            onTouchEnd={(e) => handleThresholdChangeFinished("trough", parseFloat(e.currentTarget.value))}
            className="w-full"
            disabled={isCalibrating}
            />
        </div>
        <div>
          <label className="block mb-1 font-medium">Min consecutive peaks: {minConsecutiveLow}</label>
          <input
            type="range"
            min="1"
            max="20"
            value={minConsecutiveLow}
            onChange={(e) => setMinConsecutiveLow(parseInt(e.target.value, 10))}
            onMouseUp={(e) => handleMinconsecutiveLowChangeFinished(parseInt(e.currentTarget.value, 10))}
            onTouchEnd={(e) => handleMinconsecutiveLowChangeFinished(parseInt(e.currentTarget.value, 10))}
            className="w-full"
            disabled={isCalibrating}
            />
        </div>
        <div>
          <label className="block mb-1 font-medium">Sample window size:  {windowSize}</label>
          <input
            type="range"
            min="10"
            max="300"
            value={windowSize}
            onChange={(e) => {
              const newVal = parseInt(e.target.value, 10);
              setWindowSize(newVal);
              dataWindowRef.current = [];
            }}
            onMouseUp={(e) => handleWindowSizeChangeFinished(parseInt(e.currentTarget.value, 10))}
            onTouchEnd={(e) => handleWindowSizeChangeFinished(parseInt(e.currentTarget.value, 10))}
            className="w-full"
            disabled={isCalibrating}
          />
        </div>
      </div>
    </div>
  );
};

export default Index;
