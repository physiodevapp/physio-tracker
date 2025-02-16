import React, { useState, useEffect, useRef } from 'react';

enum CycleState {
  IDLE,
  IN_CYCLE,
}

interface DataPoint {
  force: number;
  time: number; // en microsegundos
}

interface IndexProps {
  dataPoint: DataPoint | null;
  reset: boolean;
  calibrationTime: number; // en milisegundos
  isRecording: boolean;
  onCalibrationComplete: (thresholdLow: number, thresholdHigh: number) => void;
  onCycleDetected: (cycleCount: number | null) => void;
}

const Index: React.FC<IndexProps> = ({
  dataPoint,
  reset,
  calibrationTime,
  isRecording,
  onCalibrationComplete,
  onCycleDetected,
}) => {
  // Parámetros ajustables con sliders
  const [windowSize, setWindowSize] = useState<number>(100);
  const [minConsecutiveLow, setMinConsecutiveLow] = useState<number>(2);
  const peakMergeInterval = 200_000; // en microsegundos
  const [reductionFactor, setReductionFactor] = useState(0.4); // Controla el % de reducción del pico
  const [growthFactor, setGrowthFactor] = useState(0.2); // Controla el % de crecimiento del mínimo

  // Refs para almacenar datos y estado interno sin re-renderizados
  const dataWindowRef = useRef<number[]>([]);
  const cycleStateRef = useRef<CycleState>(CycleState.IDLE);
  const consecutiveLowCountRef = useRef<number>(0);
  const lastPeakTimestampRef = useRef<number>(0);
  const peakIntervalsRef = useRef<number[]>([]);
  const thresholdLowRef = useRef<number>(0);
  const thresholdHighRef = useRef<number>(0);

  const [cycleCount, setCycleCount] = useState<number>(0);

  // Variables de calibración y fijación de umbrales
  const [isCalibrating, setIsCalibrating] = useState<boolean>(true);
  const [thresholdsFixed, setThresholdsFixed] = useState<boolean>(false);
  const calibrationDataRef = useRef<number[]>([]);

  // Para reajuste por fatiga (opcional, en este ejemplo no lo usamos)
  const [fatigueMessage, setFatigueMessage] = useState<string>("");

  const growMin = (x: number, factor: number) => {
    return x + Math.abs(x) * factor;
  }

  const reduceMax = (x: number, factor: number) => {
    return x - Math.abs(x) * factor;
  }

  // Función para calcular estadísticas (media y desviación estándar)
  const updateStats = (data: number[]): { baseline: number; stdDev: number } => {
    const n = data.length;
    const mean = data.reduce((sum, val) => sum + val, 0) / n;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    return { baseline: mean, stdDev: Math.sqrt(variance) };
  };

  // Actualiza los umbrales (usando la ventana móvil) mientras no se hayan fijado
  const updateThresholds = () => {
    if (thresholdsFixed) return;
    
    const windowData = dataWindowRef.current;
    if (windowData.length >= windowSize) {
      // Ordenamos los datos en la ventana actual
      const sorted = [...windowData].sort((a, b) => a - b);
      
      // Tomamos el 10% superior e inferior como referencia de picos y mínimos
      const numPeaks = Math.max(1, Math.floor(sorted.length * 0.1));
      const topPeaks = sorted.slice(sorted.length - numPeaks);
      const typicalPeak = topPeaks.reduce((sum, val) => sum + val, 0) / topPeaks.length;

      const numLows = Math.max(1, Math.floor(sorted.length * 0.1));
      const bottomLows = sorted.slice(0, numLows);
      const typicalLow = bottomLows.reduce((sum, val) => sum + val, 0) / bottomLows.length;

      // Aplicamos reducción y crecimiento proporcional a los umbrales
      const calibratedHigh = reduceMax(typicalPeak, reductionFactor); // Reducimos el 40% del pico típico
      const calibratedLow = growMin(typicalLow, growthFactor); // Incrementamos un 20% el mínimo típico

      thresholdHighRef.current = calibratedHigh;
      thresholdLowRef.current = calibratedLow;
    }
  };


  // Finaliza la calibración y fija los umbrales iniciales.
  // Aquí se llama a la función onCalibrationComplete para enviar los valores al padre.
  const finalizeCalibration = () => {
    setIsCalibrating(false);
    if (calibrationDataRef.current.length === 0) return;
    const stats = updateStats(calibrationDataRef.current);
    const baseline = stats.baseline;
    const stdDev = stats.stdDev;

    // Ordenamos los datos de calibración
    const sorted = [...calibrationDataRef.current].sort((a, b) => a - b);
    const numPeaks = Math.max(1, Math.floor(sorted.length * 0.1));
    const topPeaks = sorted.slice(sorted.length - numPeaks);
    const typicalPeak = topPeaks.reduce((sum, val) => sum + val, 0) / topPeaks.length;

    const numLows = Math.max(1, Math.floor(sorted.length * 0.1));
    const bottomLows = sorted.slice(0, numLows);
    const typicalLow = bottomLows.reduce((sum, val) => sum + val, 0) / bottomLows.length;

    // Fijamos los umbrales iniciales:
    // Por ejemplo, umbral alto = 95% del pico típico, umbral bajo = 105% del mínimo típico.
    const calibratedHigh = reduceMax(typicalPeak, reductionFactor);
    const calibratedLow = growMin(typicalLow, growthFactor);
    thresholdHighRef.current = calibratedHigh;
    thresholdLowRef.current = calibratedLow;
    setThresholdsFixed(true);

    console.log(
      "Calibración finalizada:",
      "baseline =", baseline,
      "stdDev =", stdDev,
      "pico típico =", typicalPeak,
      "mínimo típico =", typicalLow,
      "nuevo umbral alto =", calibratedHigh,
      "nuevo umbral bajo =", calibratedLow
    );

    // Envía los valores al componente padre
    onCalibrationComplete(calibratedLow, calibratedHigh);
  };

  // Procesa cada nueva lectura del sensor
  const handleNewReading = (force: number, timestamp: number) => {
    if (!isRecording) return;

    // Durante la calibración, acumula datos
    if (isCalibrating) {
      calibrationDataRef.current.push(force);
    }

    // Actualiza la ventana móvil
    dataWindowRef.current.push(force);
    if (dataWindowRef.current.length > windowSize) {
      dataWindowRef.current.shift();
    }
    updateThresholds();

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
          console.log(`Ciclo #${cycleCount + 1} iniciado en t=${timestamp}`);
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

        if (consecutiveLowCountRef.current >= minConsecutiveLow) {
          console.log(`Ciclo #${cycleCount} finalizado en t=${timestamp}`);
          if (peakIntervalsRef.current.length > 0) {
            const avgInterval =
              peakIntervalsRef.current.reduce((a, b) => a + b, 0) /
              peakIntervalsRef.current.length;
            console.log(`Intervalo promedio entre picos: ${avgInterval} microsegundos`);
          }
          cycleStateRef.current = CycleState.IDLE;
          consecutiveLowCountRef.current = 0;
          peakIntervalsRef.current = [];
        }
      }
    }
  };

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
      setCycleCount(0);
      setIsCalibrating(true);
      setThresholdsFixed(false);
      // Reiniciar también cualquier mensaje
      setFatigueMessage("");
    }
  }, [reset]);

  // Este efecto se dispara cuando cambian reductionFactor o growthFactor
  useEffect(() => {
    if (thresholdsFixed && dataWindowRef.current.length >= windowSize) {
      const sorted = [...dataWindowRef.current].sort((a, b) => a - b);

      const numPeaks = Math.max(1, Math.floor(sorted.length * 0.1));
      const topPeaks = sorted.slice(sorted.length - numPeaks);
      const typicalPeak = topPeaks.reduce((sum, val) => sum + val, 0) / topPeaks.length;

      const numLows = Math.max(1, Math.floor(sorted.length * 0.1));
      const bottomLows = sorted.slice(0, numLows);
      const typicalLow = bottomLows.reduce((sum, val) => sum + val, 0) / bottomLows.length;

      // Aplicamos la reducción y el crecimiento en base a los sliders
      const newThresholdHigh = reduceMax(typicalPeak, reductionFactor);
      const newThresholdLow = growMin(typicalLow, growthFactor);

      // Actualizamos los refs de umbrales
      thresholdHighRef.current = newThresholdHigh;
      thresholdLowRef.current = newThresholdLow;

      // Notificamos al padre con los nuevos valores recalibrados
      onCalibrationComplete(newThresholdLow, newThresholdHigh);

      console.log(
        "Umbrales reajustados por slider:",
        "nuevo umbral bajo =", newThresholdLow,
        "nuevo umbral alto =", newThresholdHigh
      );
    }
  }, [reductionFactor, growthFactor]);

  useEffect(() => {
    // Notificamos al padre los ciclos totales detectados
    const cycleCountUpdate = reset ? null : cycleCount
    onCycleDetected(cycleCountUpdate)
  }, [cycleCount])


  return (
    <div className="p-4 border border-gray-300 rounded shadow max-w-md mx-auto">
      {/* <div className="flex gap-6 justify-between">
        <p className="flex flex-1 flex-col items-center mb-2">
          {isRecording && isCalibrating ? (
            <>
              <span className="font-bold text-blue-600">Calibrando...</span>
              <span className="text-center text-xs text-blue-600">
                Realiza varias repeticiones.
              </span>
            </>
          ) : (
            <>
              <span className="font-bold">Ciclos detectados</span>
              <span className="text-center text-2xl">{cycleCount} reps</span>
            </>
          )}
          {fatigueMessage && (
            <span className="text-xs text-red-600 mt-1">{fatigueMessage}</span>
          )}
        </p>
        <div className="flex flex-col justify-start">
          <p className="flex mb-2">
            <span className="font-bold mr-2">Umbral Alto:</span>
            <span className='text-blue-500 font-semibold'>{thresholdHighRef.current.toFixed(2)}</span>
          </p>
          <p className="flex mb-2">
            <span className="font-bold mr-2">Umbral Bajo:</span>
            <span className='text-red-500 font-semibold'>{thresholdLowRef.current.toFixed(2)}</span>
          </p>
        </div>
      </div> */}
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
            className="w-full"
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
            className="w-full"
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
            className="w-full"
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
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
};

export default Index;
