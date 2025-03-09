"use client";

import { useState, useRef, useEffect } from "react";
import { IFilterState, IFrequencyData, IMotionData, ICOPData } from "@/interfaces/balance";
import { butterworthLowPass_SampleGeneric, getFrequencyFeatures, calculateSTD, calculateCOP_Stats } from "@/services/balance";
import { BalanceSettings } from "@/providers/Settings";

export default function useMotionHandler({settings}: {settings: BalanceSettings}) {  
  // 🔗 Constantes
  const {
    calibrationDelay: CALIBRATION_DELAY,
    calibrationPoints: CALIBRATION_POINTS,
    calibrationStdThreshold: CALIBRATION_STD_THRESHOLD,
    calibrationDomFreqThreshold: CALIBRATION_DOM_FREQ_THRESHOLD,
    requiredCalibrationAttempts: REQUIRED_CALIBRATION_ATTEMPTS,
    gravity: GRAVITY,
    gravityFactor: GRAVITY_FACTOR,
    cutoffFrequency: CUTOFF_FREQUENCY,
  } = settings;

  // 🛠️ Variables del filtro Butterworth
  const filterStateRef_Y = useRef<IFilterState>({ x1: 0, x2: 0, y1: 0, y2: 0 });
  const filterStateRef_Y_2 = useRef<IFilterState>({ x1: 0, x2: 0, y1: 0, y2: 0 });
  const filterStateRef_Z = useRef<IFilterState>({ x1: 0, x2: 0, y1: 0, y2: 0 });
  const filterStateRef_Z_2 = useRef<IFilterState>({ x1: 0, x2: 0, y1: 0, y2: 0 });
  
  // 🛠️ Variables del listener
  const [isAcquiring, setIsAcquiring] = useState(false);
  const motionListenerActiveRef = useRef(false);
  const measurementStartTimeRef = useRef<number | null>(null);
  const [samplingFrequency, setSamplingFrequency] = useState<number | null>(null);
  const samplingFrequencyRef = useRef<number | null>(null);
  const motionDataRef = useRef<IMotionData[]>([]);
  
  // 🛠️ Variables de la calibracion
  const [isOrientationCorrect, setIsOrientationCorrect] = useState(false);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [isBaselineDefined, setIsBaselineDefined] = useState(false);
  const isBaselineDefinedRef = useRef<boolean>(false);
  const baselineRef = useRef({
    noGravity: { x: 0, y: 0, z: 0 },
    noGravityFiltered: { y: 0, z: 0 }
  });
  const calibrationAttemptsRef = useRef<number>(0);
  const calibrationCyclesCompletedRef = useRef<boolean>(false);
  const calibratedRef = useRef<boolean>(false);
  const calibratedDataRef = useRef<{
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
  const [COPData, setCOPData] = useState<ICOPData>({
    zeroFrequency: {
      ML_Y: parseFloat(calibratedDataRef.current.domFreq_y?.toFixed(1) ?? "0"),
      AP_Z: parseFloat(calibratedDataRef.current.domFreq_z?.toFixed(1) ?? "0"),
    },
    zeroSTD: {
      ML_Y: parseFloat(calibratedDataRef.current.std_y?.toFixed(1) ?? "0"),
      AP_Z: parseFloat(calibratedDataRef.current.std_z?.toFixed(1) ?? "0"),
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

  // ⚙️ **Encapsulación de la verificación de posición**
  function isDeviceInCorrectPosition({gravity_X}: 
    {gravity_X: number, gravity_Y?: number, gravity_Z?: number}
  ): boolean {
    const GRAVITY_THRESHOLD = GRAVITY * GRAVITY_FACTOR; // Mínimo valor esperado en el eje correcto
  
    // Modo Landscape: La gravedad debe estar en X y ser positiva
    const isLandscape = Math.abs(gravity_X) > GRAVITY_THRESHOLD && gravity_X > 0;

    setIsOrientationCorrect(isLandscape);

    if (!isLandscape) {
      setLog("Position error");
    }
  
    return isLandscape;
  }
  
  // ⚙️ **Encapsulación de la verificación de adquisición**
  function isAcquisitionReady(now: number): boolean {
    if (!measurementStartTimeRef.current) {
      measurementStartTimeRef.current = now;
    }

    if (now - measurementStartTimeRef.current < CALIBRATION_DELAY) {
      // console.log(`Esperando ${((CALIBRATION_DELAY - (now - measurementStartTimeRef.current)) / 1000).toFixed(0)} segundos...`);
      setLog(`Hold still...`)
      setIsAcquiring(false);
      return false;
    }

    setIsAcquiring(true);
    return true;
  }

  // ⚙️ **Encapsulación de la calibración**
  function checkCalibration(): boolean {
    if (calibrationCyclesCompletedRef.current) return true;

    if (!calibratedRef.current) {
      if (motionDataRef.current.length < CALIBRATION_POINTS) {
        // console.log(`Calibrando... Datos insuficientes: ${motionDataRef.current.length} puntos`);
        setLog(`Calibrating...`);
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
        // console.log(`Calibrando... STD Y: ${std_y.toFixed(3)} m/s², STD Z: ${std_z.toFixed(3)} m/s²`);
        setLog(`STD...`);
        return false;
      }

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
        // console.log(`Calibrando... frecuencia dominante (Y: ${domFreq_y.toFixed(2)} Hz, Z: ${domFreq_z.toFixed(2)} Hz) supera el umbral`);
        setLog(`Frequency...`)
        return false;
      }

      calibratedRef.current = true;
      calibratedDataRef.current = { 
        std_y, 
        std_z,
        domFreq_y, 
        domFreq_z };
      return false;
    } else {
      // Fase final de calibración
      calibrationAttemptsRef.current++;
      if (calibrationAttemptsRef.current < REQUIRED_CALIBRATION_ATTEMPTS) {
        measurementStartTimeRef.current = null;
        calibratedRef.current = false;
        motionDataRef.current = [];
        return false;
      }

      calibrationCyclesCompletedRef.current = true;
      setIsCalibrated(true);
      return true;
    }
  }

  // ⚙️ **Encapsulación del baselineRef**
  function calibrateBaseline () {
    if (motionDataRef.current.length === 0) return;

    const n = motionDataRef.current.length;
    let sumX = 0, sumY = 0, sumZ = 0;
    let sumFilteredY = 0, sumFilteredZ = 0;
    for (const record of motionDataRef.current) {
      sumX += 0;
      sumY += record.noGravityFiltered.y;
      sumZ += record.noGravityFiltered.z;

      sumFilteredY += record.noGravityFiltered.y;
      sumFilteredZ += record.noGravityFiltered.z;
    }

    baselineRef.current = { 
      noGravity: { x: sumX / n, y: sumY / n, z: sumZ / n },
      noGravityFiltered: { y: sumFilteredY / n, z: sumFilteredZ / n }
    };

    setIsBaselineDefined(true);
    isBaselineDefinedRef.current = true;

    setLog("Evaluating...")

    motionDataRef.current = [];
  }

  // ⚙️ **Evento DeviceMotion**
  function handleMotion(event: DeviceMotionEvent) {
    try {
      if (!motionListenerActiveRef.current) return;

      if (!isDeviceInCorrectPosition({gravity_X: (event.accelerationIncludingGravity!.x! - event.acceleration! .x!)})) return;
      
      const now = Date.now();
      
      // Verificar si el tiempo de adquisición está listo
      if (!isAcquisitionReady(now)) return;

      const incGravity = event.accelerationIncludingGravity;
      const noGravity = event.acceleration;

      if (incGravity && noGravity) {
        // Calcular sin gravedad
        const noGravity_X = noGravity.x ?? 0;
        const noGravity_Y = noGravity.y ?? 0;
        const noGravity_Z = noGravity.z ?? 0;

        // Calcular gravedad
        const gravity_X = (incGravity.x ?? 0) - noGravity_X;
        const gravity_Y = (incGravity.y ?? 0) - noGravity_Y;
        const gravity_Z = (incGravity.z ?? 0) - noGravity_Z;

        // Obtener timestamp e intervalo
        const timestamp = now;
        const interval = event.interval;
        setSamplingFrequency(1000 / interval);
        samplingFrequencyRef.current = (1000 / interval);

        // Filtrar datos sin gravedad
        const filtered_Y = butterworthLowPass_SampleGeneric({
          x0: noGravity_Y - baselineRef.current.noGravityFiltered.y ,
          states: [filterStateRef_Y.current, filterStateRef_Y_2.current],
          cutoffFrequency: CUTOFF_FREQUENCY,
          samplingFrequency: samplingFrequencyRef.current!
        }) ?? 0;

        const filtered_Z = butterworthLowPass_SampleGeneric({
          x0: noGravity_Z - baselineRef.current.noGravityFiltered.z,
          states: [filterStateRef_Z.current, filterStateRef_Z_2.current],
          cutoffFrequency: CUTOFF_FREQUENCY,
          samplingFrequency: samplingFrequencyRef.current!
        }) ?? 0;

        // Almacenar datos
        motionDataRef.current.push({
          timestamp,
          interval,
          gravity: { x: gravity_X, y: gravity_Y, z: gravity_Z },
          noGravity: {
            x: noGravity_X - baselineRef.current.noGravity.x,
            y: noGravity_Y - baselineRef.current.noGravity.y,
            z: noGravity_Z - baselineRef.current.noGravity.z,
          },
          noGravityFiltered: { y: filtered_Y, z: filtered_Z }
        });

        if (!checkCalibration()) return;

        if (!isBaselineDefinedRef.current) calibrateBaseline();

        // analyzeDeviceMotionData({calculationMode: "realTime"});
      }
    } catch (error) {
      console.error("Error en handleMotion:", error);
    }
  }

  // ⚙️ **Restaurar variables**
  function reset() {
    // Reiniciar el listener del evento DeviceMotion
    motionListenerActiveRef.current = true;
    setIsAcquiring(false);
    
    // Resetear los datos recientes utilizados en la calibración
    measurementStartTimeRef.current = null;
    calibratedRef.current = false;
    calibrationCyclesCompletedRef.current = false;
    calibrationAttemptsRef.current = 0;
    calibratedDataRef.current = {
      std_y: null,
      std_z: null,
      domFreq_y: null,
      domFreq_z: null,
    };
    setIsCalibrated(false);
    setIsBaselineDefined(false);
    isBaselineDefinedRef.current = false;
    baselineRef.current = {
      noGravity: { x: 0, y: 0, z: 0 },
      noGravityFiltered: { y: 0, z: 0 },
    };
    setIsOrientationCorrect(false);
    
    // Resetear variables relacionadas con la medición
    motionDataRef.current = [];
    setSamplingFrequency(null);
    samplingFrequencyRef.current = null;
    setLog("");
    setCOPData({
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
    filterStateRef_Y.current = { x1: 0, x2: 0, y1: 0, y2: 0 };
    filterStateRef_Y_2.current = { x1: 0, x2: 0, y1: 0, y2: 0 };
    filterStateRef_Z.current = { x1: 0, x2: 0, y1: 0, y2: 0 };
    filterStateRef_Z_2.current = { x1: 0, x2: 0, y1: 0, y2: 0 };
  }  

  // ⚙️ ** Iniciar prueba **
  function startMotion() {
    if (!window.DeviceMotionEvent) {
      console.log('DeviceMotionEvent no es soportado en este navegador.');
      setLog("Not supported");
    } 
    else {
      console.log("🔵 Motion Listener ACTIVADO");
      reset();
      window.addEventListener("devicemotion", handleMotion, false);
    } 
  }

  // ⚙️ ** Finalizar prueba **
  function stopMotion() {
    if (motionListenerActiveRef.current) {
      console.log("🔴 Motion Listener DETENIDO");
      motionListenerActiveRef.current = false;
      analyzeDeviceMotionData({calculationMode: "postProcessing"});
      window.removeEventListener('devicemotion', handleMotion, false);      
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
          timeWindow: calculationMode === "postProcessing"
            ? undefined
            : 4, // últimos segundos
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
  
      setCOPData({
        zeroFrequency: {
          ML_Y: parseFloat((calibratedDataRef.current.domFreq_y!).toFixed(2) ?? "0"),
          AP_Z: parseFloat((calibratedDataRef.current.domFreq_z!).toFixed(2) ?? "0"),
        },
        zeroSTD: {
          ML_Y: parseFloat((calibratedDataRef.current.std_y!).toFixed(3) ?? "0"),
          AP_Z: parseFloat((calibratedDataRef.current.std_z!).toFixed(3) ?? "0"),
        },
        mainFrequency: {
          ML_Y: parseFloat(dominantFrequency_y?.toFixed(2) ?? "0"),
          AP_Z: parseFloat(dominantFrequency_z?.toFixed(2) ?? "0"),
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
          ML_Y: jerkML != null ? parseFloat(jerkML?.toFixed(2)) : null,
          AP_Z: jerkAP != null ? parseFloat(jerkAP?.toFixed(2)) : null,
        },
        copArea: {
          value: copArea != null ? parseFloat(copArea.toFixed(2)) : null,
          boundaryPoints: copAreaBoundaryPoints,
        },
        ellipse: {
          semiMajor, semiMinor,
          orientation,
          centerX, centerY
        },
        copPoints,
      });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      setLog(`Unsufficient data`);
    }
  }

  useEffect(() => {

    return () => {
      window.removeEventListener("devicemotion", handleMotion);
    }
  }, []);  

  return { 
    samplingFrequency, 
    isAcquiring, isCalibrated, isBaselineDefined, 
    isOrientationCorrect,
    startMotion, stopMotion,
    log, 
    COPData,
    frequencyData,
  };
}
