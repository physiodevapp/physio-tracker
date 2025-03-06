"use client";

import { useState, useRef, useEffect } from "react";
import { IFilterState, IFrequencyData, IMotionData, IMotionStats } from "@/interfaces/balance";
import { butterworthLowPass_SampleGeneric, getFrequencyFeatures, calculateSTD, calculateCOP_Stats } from "@/services/balance";

// 🔗 Constantes
const CALIBRATION_DELAY = 6000; // 6 segundos
const CALIBRATION_POINTS = 200;
const CALIBRATION_STD_THRESHOLD = 1.00; // m/s²
const CALIBRATION_DOM_FREQ_THRESHOLD = 2.0; // Hz
const REQUIRED_CALIBRATION_ATTEMPTS = 2; // Se requieren 2 ciclos exitosos
const GRAVITY = 9.81;
const CUTOFF_FREQUENCY = 5; // Frecuencia de corte recomendada

export function useMotionHandler() {  
  // 🛠️ Variables del filtro Butterworth
  const filterStateY = useRef<IFilterState>({ x1: 0, x2: 0, y1: 0, y2: 0 });
  const filterStateY_2 = useRef<IFilterState>({ x1: 0, x2: 0, y1: 0, y2: 0 });
  const filterStateZ = useRef<IFilterState>({ x1: 0, x2: 0, y1: 0, y2: 0 });
  const filterStateZ_2 = useRef<IFilterState>({ x1: 0, x2: 0, y1: 0, y2: 0 });
  
  // 🛠️ Variables del listener
  const [isAcquiring, setIsAcquiring] = useState(false);
  const motionListenerActive = useRef(false);
  const measurementStartTime = useRef<number | null>(null);
  const [samplingFrequency, setSamplingFrequency] = useState<number | null>(null);
  const samplingFrequencyRef = useRef<number | null>(null);
  const motionDataRef = useRef<IMotionData[]>([]);
  
  // 🛠️ Variables de la calibracion
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [isBaselineCalibrated, setIsBaselineCalibrated] = useState(false);
  const isBaselineCalibratedRef = useRef<boolean>(false);
  const baseline = useRef({ x: 0, y: 0, z: 0 });
  const calibrationAttempts = useRef<number>(0);
  const calibrationCyclesCompleted = useRef<boolean>(false);
  const calibrated = useRef<boolean>(false);
  const calibratedData = useRef<{
    std_y: number | null;
    std_z: number | null;
    domFreq_y: number | null;
    domFreq_z: number | null;
  }>({
    std_y: null,
    std_z: null,
    domFreq_y: null,
    domFreq_z: null,
  });

  // 🛠️ Variables de datos procesados
  const [frequencyData, setFrequencyData] = useState<IFrequencyData>({
    frequencies_y: [],
    amplitudes_y: [],
    frequencies_z: [],
    amplitudes_z: [],
    dominantFrequency_y: null,
    dominantFrequency_z: null,
  });
  const [log, setLog] = useState("");
  const [motionStatsData, setMotionStats] = useState<IMotionStats>({
    zeroFrequency: {
      ML_Y: parseFloat(calibratedData.current.domFreq_y?.toFixed(1) ?? "0"),
      AP_Z: parseFloat(calibratedData.current.domFreq_z?.toFixed(1) ?? "0"),
    },
    zeroSTD: {
      ML_Y: parseFloat(calibratedData.current.std_y?.toFixed(1) ?? "0"),
      AP_Z: parseFloat(calibratedData.current.std_z?.toFixed(1) ?? "0"),
    },
    mainFrequency: {
      ML_Y: parseFloat(frequencyData.dominantFrequency_y?.toFixed(3) ?? "0"),
      AP_Z: parseFloat(frequencyData.dominantFrequency_z?.toFixed(3) ?? "0"),
    },
    RMS: {
      ML_Y: 0,
      AP_Z: 0,
    },
    Variance: {
      ML_Y: 0,
      AP_Z: 0,
      Global: 0,
    },    
  });

  // ⚙️ **Encapsulación de la verificación de adquisición**
  function isAcquisitionReady(now: number): boolean {
    if (!measurementStartTime.current) {
      measurementStartTime.current = now;
    }

    if (now - measurementStartTime.current < CALIBRATION_DELAY) {
      setLog(`Esperando ${((CALIBRATION_DELAY - (now - measurementStartTime.current)) / 1000).toFixed(0)} segundos...`);
      setIsAcquiring(false);
      return false;
    }

    setIsAcquiring(true);
    return true;
  }

  // ⚙️ **Encapsulación de la calibración**
  function checkCalibration(): boolean {
    if (calibrationCyclesCompleted.current) return true;

    if (!calibrated.current) {
      if (motionDataRef.current.length < CALIBRATION_POINTS) {
        setLog(`Calibrando... Datos insuficientes: ${motionDataRef.current.length} puntos`);
        return false;
      }

      // Evaluar estabilidad de la señal
      const std_y = calculateSTD({
        values: motionDataRef.current.slice(-CALIBRATION_POINTS).map(record => record.noGravity.y)
      });
      const std_z = calculateSTD({
        values: motionDataRef.current.slice(-CALIBRATION_POINTS).map(record => record.noGravity.z)
      });

      if (std_y > CALIBRATION_STD_THRESHOLD || std_z > CALIBRATION_STD_THRESHOLD) {
        setLog(`Calibrando... STD Y: ${std_y.toFixed(3)} m/s², STD Z: ${std_z.toFixed(3)} m/s²`);
        return false;
      }

      setLog(`STD Y | Z: ${std_y.toFixed(2)} | ${std_z.toFixed(2)} m/s²`);

      const {
        dominantFrequency_y: domFreq_y, 
        dominantFrequency_z: domFreq_z,
      } = getFrequencyFeatures({
        calculationMode: "realTime",
        motionData: motionDataRef.current.slice(-CALIBRATION_POINTS),
        cutoffFrequency: CUTOFF_FREQUENCY,
        samplingFrequency: samplingFrequencyRef.current!,
      });

      if (domFreq_y > CALIBRATION_DOM_FREQ_THRESHOLD || domFreq_z > CALIBRATION_DOM_FREQ_THRESHOLD) {
        setLog(`Calibrando... frecuencia dominante (Y: ${domFreq_y.toFixed(2)} Hz, Z: ${domFreq_z.toFixed(2)} Hz) supera el umbral`);
        return false;
      }

      setLog(`Dom. freq. Y | Z: ${domFreq_y.toFixed(2)} | ${domFreq_z.toFixed(2)} Hz`);

      calibrated.current = true;
      calibratedData.current = { 
        std_y, 
        std_z,
        domFreq_y, 
        domFreq_z };
      return false;
    } else {
      // Fase final de calibración
      calibrationAttempts.current++;
      if (calibrationAttempts.current < REQUIRED_CALIBRATION_ATTEMPTS) {
        measurementStartTime.current = null;
        calibrated.current = false;
        motionDataRef.current = [];
        return false;
      }

      calibrationCyclesCompleted.current = true;
      setIsCalibrated(true);
      return true;
    }
  }

  // ⚙️ **Encapsulación del baseline**
  function calibrateBaseline () {
    if (motionDataRef.current.length === 0) return;
    const n = motionDataRef.current.length;
    let sumX = 0, sumY = 0, sumZ = 0;
    for (const record of motionDataRef.current) {
      sumX += record.noGravity.x;
      sumY += record.noGravity.y;
      sumZ += record.noGravity.z;
    }
    baseline.current = { x: sumX / n, y: sumY / n, z: sumZ / n };
    setIsBaselineCalibrated(true);
    isBaselineCalibratedRef.current = true;
  }

  // ⚙️ **Evento DeviceMotion**
  function handleMotion(event: DeviceMotionEvent) {
    try {
      if (!motionListenerActive.current) return;
      const now = Date.now();
      
      // Verificar si el tiempo de adquisición está listo
      if (!isAcquisitionReady(now)) return;

      const incGravity = event.accelerationIncludingGravity;
      const noGravity = event.acceleration;

      if (incGravity && noGravity) {
        // Calcular gravedad
        const gravityX = (incGravity.x ?? 0) - (noGravity.x ?? 0);
        const gravityY = (incGravity.y ?? 0) - (noGravity.y ?? 0);
        const gravityZ = (incGravity.z ?? 0) - (noGravity.z ?? 0);

        // Obtener timestamp e intervalo
        const timestamp = now;
        const interval = event.interval;
        setSamplingFrequency(1000 / interval);
        samplingFrequencyRef.current = (1000 / interval);

        // Filtrar datos sin gravedad
        const filteredY = butterworthLowPass_SampleGeneric({
          x0: (noGravity.y ?? 0) - (isBaselineCalibratedRef.current ? baseline.current.y : 0),
          states: [filterStateY.current, filterStateY_2.current],
          cutoffFrequency: CUTOFF_FREQUENCY,
          samplingFrequency: samplingFrequencyRef.current!
        }) ?? 0;

        const filteredZ = butterworthLowPass_SampleGeneric({
          x0: (noGravity.z ?? 0) - (isBaselineCalibratedRef.current ? baseline.current.z : 0),
          states: [filterStateZ.current, filterStateZ_2.current],
          cutoffFrequency: CUTOFF_FREQUENCY,
          samplingFrequency: samplingFrequencyRef.current!
        }) ?? 0;

        // Almacenar datos
        motionDataRef.current.push({
          timestamp,
          interval,
          gravity: { x: gravityX, y: gravityY, z: gravityZ },
          noGravity: {
            x: (noGravity.x ?? 0) - (isBaselineCalibratedRef.current ? baseline.current.x : 0),
            y: (noGravity.y ?? 0) - (isBaselineCalibratedRef.current ? baseline.current.y : 0),
            z: (noGravity.z ?? 0) - (isBaselineCalibratedRef.current ? baseline.current.z : 0),
          },
          noGravityFiltered: { y: filteredY, z: filteredZ }
        });

        if (!checkCalibration()) return;

        if (!isBaselineCalibratedRef.current) calibrateBaseline();

        analyzeDeviceMotionData({calculationMode: "realTime"});
      }
    } catch (error) {
      console.error("Error en handleMotion:", error);
    }
  }

  // ⚙️ **Restaurar variables**
  function reset() {
    // Reiniciar el listener del evento DeviceMotion
    motionListenerActive.current = true;
    setIsAcquiring(false);
    
    // Resetear los datos recientes utilizados en la calibración
    measurementStartTime.current = null;
    calibrated.current = false;
    calibrationCyclesCompleted.current = false;
    calibrationAttempts.current = 0;
    calibratedData.current = {
      std_y: null,
      std_z: null,
      domFreq_y: null,
      domFreq_z: null,
    };
    setIsCalibrated(false);
    setIsBaselineCalibrated(false);
    isBaselineCalibratedRef.current = false;
    baseline.current = { x: 0, y: 0, z: 0 };
    
    // Resetear variables relacionadas con la medición
    motionDataRef.current = [];
    setSamplingFrequency(null);
    samplingFrequencyRef.current = null;
    setLog("");
    setMotionStats({
      zeroFrequency: {
        ML_Y: 0,
        AP_Z: 0,
      },
      zeroSTD: {
        ML_Y: 0,
        AP_Z: 0,
      },
      mainFrequency: {
        ML_Y: 0,
        AP_Z: 0,
      },
      RMS: {
        ML_Y: 0,
        AP_Z: 0,
      },
      Variance: {
        ML_Y: 0,
        AP_Z: 0,
        Global: 0,
      },    
    });
    setFrequencyData({
      frequencies_y: [],
      amplitudes_y: [],
      frequencies_z: [],
      amplitudes_z: [],
      dominantFrequency_y: 0,
      dominantFrequency_z: 0,
    })
  
    // Resetear estados de los filtros Butterworth
    filterStateY.current = { x1: 0, x2: 0, y1: 0, y2: 0 };
    filterStateY_2.current = { x1: 0, x2: 0, y1: 0, y2: 0 };
    filterStateZ.current = { x1: 0, x2: 0, y1: 0, y2: 0 };
    filterStateZ_2.current = { x1: 0, x2: 0, y1: 0, y2: 0 };
  }  

  // ⚙️ ** Iniciar prueba **
  function startMotion() {
    if (!window.DeviceMotionEvent) {
      console.log('DeviceMotionEvent no es soportado en este navegador.');
    } 
    else {
      console.log("🔵 Motion Listener ACTIVADO");
      reset();
      window.addEventListener("devicemotion", handleMotion, false);
    } 
  }

  // ⚙️ ** Finalizar prueba **
  function stopMotion() {
    if (motionListenerActive.current) {
      console.log("🔴 Motion Listener DETENIDO");
      window.removeEventListener("devicemotion", handleMotion);
      analyzeDeviceMotionData({calculationMode: "postProcessing"});
    }
  }

  // ⚙️ ** Analizar los datos del evento DeviceMotion **
  function analyzeDeviceMotionData ({ calculationMode }: {calculationMode: "realTime" | "postProcessing"}) {
    try {      
      // Frequencies
      const {
        frequencies_y, amplitudes_y,
        frequencies_z, amplitudes_z,
        dominantFrequency_y, dominantFrequency_z,
      } = getFrequencyFeatures({
          calculationMode,
          motionData: motionDataRef.current,
          cutoffFrequency: CUTOFF_FREQUENCY,
          samplingFrequency: samplingFrequencyRef.current!,
          timeWindow: 4, // últimos segundos,
        });
  
      setFrequencyData({
        frequencies_y, frequencies_z,
        amplitudes_y, amplitudes_z,
        dominantFrequency_y, dominantFrequency_z
      });
  
      // COP
      const {
        copPoints,
        rmsML, rmsAP,
        varianceML, varianceAP, globalVariance,
        ellipse: { semiMajor, semiMinor, orientation, centerX, centerY },
        copArea: { points: copAreaBoundaryPoints, value: copArea},
        jerkML, jerkAP
      } = calculateCOP_Stats({
          calculationMode,
          motionData: motionDataRef.current,
          cutoffFrequency: CUTOFF_FREQUENCY,
          samplingFrequency: samplingFrequency!,
          gravity: GRAVITY
        });
  
      setMotionStats({
        zeroFrequency: {
          ML_Y: calibratedData.current.domFreq_y!,
          AP_Z: calibratedData.current.domFreq_z!,
        },
        zeroSTD: {
          ML_Y: calibratedData.current.std_y!,
          AP_Z: calibratedData.current.std_z!,
        },
        mainFrequency: {
          ML_Y: parseFloat(dominantFrequency_y?.toFixed(3) ?? "0"),
          AP_Z: parseFloat(dominantFrequency_z?.toFixed(3) ?? "0"),
        },
        RMS: {
          ML_Y: parseFloat(rmsML?.toFixed(1) ?? "0"),
          AP_Z: parseFloat(rmsAP?.toFixed(1) ?? "0"),
        },
        Variance: {
          ML_Y: parseFloat(varianceML?.toFixed(3) ?? "0"),
          AP_Z: parseFloat(varianceAP?.toFixed(3) ?? "0"),
          Global: parseFloat(globalVariance?.toFixed(3) ?? "0"),
        },
        jerk: {
          ML_Y: parseFloat(jerkML.toFixed(2)),
          AP_Z: parseFloat(jerkAP.toFixed(2)),
        },
        copArea: {
          value: parseFloat(copArea.toFixed(2)),
          boundaryPoints: copAreaBoundaryPoints
        },
        ellipse: {
          semiMajor, semiMinor,
          orientation,
          centerX, centerY
        },
        copPoints,
      });
      setLog(`Y: ${dominantFrequency_y} | Z: ${dominantFrequency_z}`);
    } catch (error) {
      setLog(`Unsufficient data. , ${error}`);
    }
  }

  useEffect(() => {

    return () => {
      window.removeEventListener("devicemotion", handleMotion);
    }
  }, []);  

  return { 
    samplingFrequency, 
    isAcquiring, isCalibrated, isBaselineCalibrated, 
    startMotion, stopMotion,
    log, 
    motionStatsData,
    frequencyData,
  };
}
