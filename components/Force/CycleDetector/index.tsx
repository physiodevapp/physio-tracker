import React, { useState, useEffect, useRef } from 'react';

type DataPoint = {
  time: number;     // Timestamp en microsegundos
  force: number; // Valor filtrado (por ejemplo, EMA)
};

enum CycleState {
  IDLE,
  IN_CYCLE,
}

interface IndexProps {
  dataPoint: DataPoint;
  reset: boolean;
}

const Index: React.FC<IndexProps> = ({ dataPoint, reset }) => {
  // Parámetros ajustables con sliders
  const [windowSize, setWindowSize] = useState<number>(100);
  const [factorLow, setFactorLow] = useState<number>(1);
  const [factorHigh, setFactorHigh] = useState<number>(3);
  const [minConsecutiveLow, setMinConsecutiveLow] = useState<number>(5);
  const peakMergeInterval = 200_000; // Intervalo fijo (en microsegundos)

  // Refs para almacenar datos y estado interno sin re-renderizados constantes
  const dataWindowRef = useRef<number[]>([]);
  const cycleStateRef = useRef<CycleState>(CycleState.IDLE);
  const consecutiveLowCountRef = useRef<number>(0);
  const lastPeakTimestampRef = useRef<number>(0);
  const peakIntervalsRef = useRef<number[]>([]);
  const thresholdLowRef = useRef<number>(0);
  const thresholdHighRef = useRef<number>(0);

  const [cycleCount, setCycleCount] = useState<number>(0);

  // Función para calcular estadísticas en la ventana
  const updateStats = (windowData: number[]): { baseline: number; stdDev: number } => {
    const n = windowData.length;
    const mean = windowData.reduce((sum, val) => sum + val, 0) / n;
    const variance = windowData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    return { baseline: mean, stdDev: Math.sqrt(variance) };
  };

  // Actualiza los umbrales dinámicos
  const updateThresholds = () => {
    const dataWindow = dataWindowRef.current;
    if (dataWindow.length >= windowSize) {
      const stats = updateStats(dataWindow);
      thresholdLowRef.current = stats.baseline + factorLow * stats.stdDev;
      thresholdHighRef.current = stats.baseline + factorHigh * stats.stdDev;
    }
  };

  // Procesa cada nueva lectura del sensor
  const handleNewReading = (filteredForce: number, timestamp: number) => {
    // Actualizamos la ventana de datos
    dataWindowRef.current.push(filteredForce);
    if (dataWindowRef.current.length > windowSize) {
      dataWindowRef.current.shift();
    }
    updateThresholds();

    // Obtención de los umbrales actuales
    const thresholdLow = thresholdLowRef.current;
    const thresholdHigh = thresholdHighRef.current;

    // Lógica de la máquina de estados
    if (cycleStateRef.current === CycleState.IDLE) {
      if (filteredForce > thresholdHigh) {
        cycleStateRef.current = CycleState.IN_CYCLE;
        setCycleCount((prev) => prev + 1);
        consecutiveLowCountRef.current = 0;
        lastPeakTimestampRef.current = timestamp;
        console.log(`Ciclo #${cycleCount + 1} iniciado en t=${timestamp}`);
      }
    } else if (cycleStateRef.current === CycleState.IN_CYCLE) {
      if (filteredForce > thresholdHigh) {
        const interval = timestamp - lastPeakTimestampRef.current;
        if (lastPeakTimestampRef.current > 0 && interval < peakMergeInterval) {
          peakIntervalsRef.current.push(interval);
        }
        lastPeakTimestampRef.current = timestamp;
        consecutiveLowCountRef.current = 0;
        console.log(`Pico detectado en ciclo #${cycleCount} a t=${timestamp}`);
      } else if (filteredForce < thresholdLow) {
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
  };

  // Procesa cada nuevo dato del sensor
  useEffect(() => {
    if (dataPoint) {
      handleNewReading(dataPoint.force, dataPoint.time);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataPoint]);

  // Si se activa el reset desde el padre, reiniciamos el estado interno
  useEffect(() => {
    if (reset) {
      console.log('Reseteando SensorCycleDetector');
      cycleStateRef.current = CycleState.IDLE;
      consecutiveLowCountRef.current = 0;
      lastPeakTimestampRef.current = 0;
      peakIntervalsRef.current = [];
      dataWindowRef.current = [];
      thresholdLowRef.current = 0;
      thresholdHighRef.current = 0;
      setCycleCount(0);
    }
  }, [reset]);

  return (
    <div className="p-4 border border-gray-300 rounded shadow max-w-md mx-auto">
      <div className='flex gap-6 justify-between'>
        <p className="flex flex-col mb-2">
          <span className="font-bold">Ciclos detectados</span> 
          <span className='text-center text-2xl'>{cycleCount} reps</span>
        </p>
        <div className='flex flex-col justify-between'>
          <p className="flex mb-2">
            <span className="font-bold mr-2">Umbral Bajo:</span>{thresholdLowRef.current.toFixed(2)}
          </p>
          <p className="flex mb-2">
            <span className="font-bold mr-2">Umbral Alto:</span> {thresholdHighRef.current.toFixed(2)}
          </p>
        </div>
      </div>
      <div className="space-y-1 mt-4">
        <div>
          <label className="block mb-1 font-medium">
            windowSize: {windowSize}
          </label>
          <input
            type="range"
            min="10"
            max="300"
            value={windowSize}
            onChange={(e) => {
              const newVal = parseInt(e.target.value, 10);
              setWindowSize(newVal);
              // Reiniciamos la ventana para evitar inconsistencias
              dataWindowRef.current = [];
            }}
            className="w-full"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">
            factorLow: {factorLow}
          </label>
          <input
            type="range"
            step="0.1"
            min="0"
            max="5"
            value={factorLow}
            onChange={(e) => setFactorLow(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">
            factorHigh: {factorHigh}
          </label>
          <input
            type="range"
            step="0.1"
            min="0"
            max="10"
            value={factorHigh}
            onChange={(e) => setFactorHigh(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">
            minConsecutiveLow: {minConsecutiveLow}
          </label>
          <input
            type="range"
            min="1"
            max="20"
            value={minConsecutiveLow}
            onChange={(e) => setMinConsecutiveLow(parseInt(e.target.value, 10))}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
};

export default Index;
