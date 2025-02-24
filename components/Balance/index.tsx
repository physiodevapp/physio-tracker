"use client";

import { Acceleration } from "@/interfaces/balance";
import {
  calculateStaticBalanceQuality,
  classifySway,
  detectVibrationRange,
} from "@/services/balance";
import {
  Bars3Icon,
  Cog6ToothIcon,
  PlayIcon,
  StopIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import React, { useState, useEffect, useRef } from "react";
import BalanceSettings from "@/modals/BalanceSettings";
import { useSettings } from "@/providers/Settings";
import CountdownRing from "./Counter";
import BalanceChart from "./Graph";

export interface IndexProps {
  handleMainMenu: (visibility?: boolean) => void;
  isMainMenuOpen: boolean;
}

const Index = ({ handleMainMenu, isMainMenuOpen }: IndexProps) => {
  const [showSettings, setShowSettings] = useState(false);
  const { settings } = useSettings();

  const [accelProcessedData, setAccelProcessedData] = useState<Acceleration[]>([]);
  const [measurementStarted, setMeasurementStarted] = useState<boolean>(false);
  const [calibrating, setCalibrating] = useState<boolean>(false);
  const baselineX = useRef<number | null>(null);
  const baselineY = useRef<number | null>(null);
  const baselineZ = useRef<number | null>(null);
  const baselineSamples = useRef<{ x: number; y: number; z: number }[]>([]);

  const [results, setResults] = useState<{
    balanceQuality: string;
    sway: { lateral: string; anteriorPosterior: string };
    vibration: { vibrationRange: string; vibrationIndex: number };
  } | null>(null);

  const measurementTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Iniciar medición con calibración inicial
  const startMeasurement = () => {
    setAccelProcessedData([]);
    setResults(null);
    setMeasurementStarted(true);
    setCalibrating(true);
    baselineX.current = null;
    baselineY.current = null;
    baselineZ.current = null;
    baselineSamples.current = [];
    toggleSettings(false);

    // Finalizar medición después de X segundos (configurable)
    measurementTimeoutRef.current = setTimeout(() => {
      finishMeasurement();
    }, ((settings.balance.testDuration + 1) * 1000));
  };

  // Finalizar medición y calcular resultados
  const finishMeasurement = () => {
    setMeasurementStarted(false);
    const balanceQuality = calculateStaticBalanceQuality({
      accelData: accelProcessedData,
      useZ: settings.balance.useX, // Z en protocolo es X en sensor
    });
    const vibration = detectVibrationRange({
      accelData: accelProcessedData,
      useZ: settings.balance.useX, // Z en protocolo es X en sensor
      vibrationThreshold: settings.balance.vibrationThreshold
    });
    const sway = classifySway(accelProcessedData);
    setResults({ balanceQuality, sway, vibration });
  };

  // Cancelar medición manualmente
  const cancelMeasurement = () => {
    if (measurementTimeoutRef.current) {
      clearTimeout(measurementTimeoutRef.current);
    }
    finishMeasurement();
  };

  // Capturar datos del sensor solo si la medición está activa
  useEffect(() => {
    if (!measurementStarted) return;

    let motionData: { x: number; y: number; z: number } | null = null;
    let calibrationCompleted = false;
    baselineSamples.current = [];

    const handleMotion = (event: DeviceMotionEvent) => {
      if (event.accelerationIncludingGravity) {
        const { x, y, z } = event.accelerationIncludingGravity;

        if (x === null || y === null || z === null) return;

        if (!calibrationCompleted) {
          // Guardar muestras de calibración
          baselineSamples.current.push({ x, y, z });
          return;
        }

        motionData = { x, y, z };
      }
    };

    window.addEventListener("devicemotion", handleMotion);

    // **Cálculo del baseline después del tiempo de calibración**
    const calibrationTimeout = setTimeout(() => {
      if (baselineSamples.current.length > 0) {
        baselineY.current =
          baselineSamples.current.reduce((sum, sample) => sum + sample.y, 0) /
          baselineSamples.current.length
        baselineZ.current =
          baselineSamples.current.reduce((sum, sample) => sum + sample.z, 0) /
          baselineSamples.current.length
        baselineX.current =
          baselineSamples.current.reduce((sum, sample) => sum + sample.x, 0) /
          baselineSamples.current.length;
      }
      calibrationCompleted = true;
      setCalibrating(false);
    }, ((settings.balance.baselineCalibrationTime + 1) * 1000));

    // **Intervalo para procesar los datos cada `samplingRate` ms**
    const samplingInterval = setInterval(() => {
      if (!motionData || !calibrationCompleted) return;

      // Oscilación lateral (ML Sway) en Y
      const deltaX = motionData.y - (baselineY.current ?? 0);

      // Oscilación anteroposterior (AP Sway) en Z
      const deltaY = motionData.z - (baselineZ.current ?? 0);

      // Oscilación vertical en X
      const deltaZ = motionData.x - (baselineX.current ?? 0);

      // Normalización
      const maxOscillation = settings.balance.maxOscillation;
      const normX = Math.max(-1, Math.min(1, deltaX / maxOscillation));
      const normY = Math.max(-1, Math.min(1, deltaY / maxOscillation));
      const normZ = Math.max(-1, Math.min(1, deltaZ / maxOscillation));

      setAccelProcessedData((prev) => [
        ...prev,
        { x: normX, y: normY, z: normZ, timestamp: Date.now() },
      ]);
    }, settings.balance.samplingRate);

    return () => {
      window.removeEventListener("devicemotion", handleMotion);
      clearTimeout(calibrationTimeout);
      clearInterval(samplingInterval);
    };
  }, [measurementStarted, settings.balance.samplingRate, settings.balance.baselineCalibrationTime, settings.balance.maxOscillation]);

  const toggleSettings = (visibility?: boolean) => {
    setShowSettings(visibility === undefined ? !showSettings : visibility);
  };

  const handleMainLayer = () => {
    handleMainMenu(false);
    toggleSettings(false);
    if (measurementStarted) cancelMeasurement();
  };

  return (
    <>
      <div 
        className={`relative w-full h-dvh flex flex-col justify-center items-center ${
          measurementStarted ? 'bg-black/80' : ''
        }`}
        onClick={handleMainLayer}
        >
        <h1 className={`absolute left-1/2 -translate-x-1/2 z-10 text-xl text-white bg-black/40 rounded-full py-1 px-4 font-bold mt-2 transition-[top] duration-300 ease-in-out whitespace-nowrap ${
          isMainMenuOpen ? '-top-12' : 'top-0'
        }`}>Balance</h1>
        {/* Una vez finalizada la medición, mostramos el gráfico */}
        {(results && !measurementStarted) && (
          <div className='h-[50vh] p-4'>
            <BalanceChart accelData={accelProcessedData} />
          </div>
        )}
        {measurementStarted && (
          <div 
            data-element="non-swipeable"
            className='w-full h-dvh z-50 flex justify-center items-center bg-black/30'
            >
            <CountdownRing 
              size={200}
              thickness={12}
              backgroundThickness={11}
              color={calibrating ? 'yellow' : 'limegreen'}
              backgroundColor='#444'
              />
          </div>
        )}
        {(results && !measurementStarted) && (
          <div className='p-4'>
            <p><strong>Static Balance Quality:</strong> {results.balanceQuality}</p>
            <p><strong>Sway - Lateral:</strong> {results.sway.lateral}</p>
            <p><strong>Anterior-Posterior:</strong> {results.sway.anteriorPosterior}</p>
            <p>
              <strong>Vibration Range:</strong> {results.vibration.vibrationRange}{" "}
              (Index: {results.vibration.vibrationIndex.toFixed(2)})
            </p>
          </div>
        )}
      </div>
      {(showSettings && !measurementStarted) && (
        <BalanceSettings />
      )}
      <section 
        data-element="non-swipeable"
        className="absolute top-1 left-1 p-2 z-10 flex flex-col justify-between gap-6 bg-black/40 rounded-full"
        >
        <>
          {isMainMenuOpen ?
            <XMarkIcon 
              className="w-6 h-6 text-white"
              onClick={() => handleMainMenu()}
              />
            : <Bars3Icon 
                className="w-6 h-6 text-white"
                onClick={() => handleMainMenu()}
                />
          }
          {measurementStarted ?
            <StopIcon 
              className={`w-6 h-6 text-green-500 ${
                measurementStarted ? 'animate-pulse' : ''
              }`}
              onClick={cancelMeasurement}
              />
            : <PlayIcon 
                className="w-6 h-6 text-white"
                onClick={() => !measurementStarted && startMeasurement()}
                />
          }
        </>
      </section>
      <section
        data-element="non-swipeable"
        className="absolute top-1 right-1 p-2 z-10 flex flex-col justify-between gap-6 bg-black/40 rounded-full"
        >
        <>
          <Cog6ToothIcon 
            className="w-6 h-6 text-white"
            onClick={() => !measurementStarted && toggleSettings()}
            />
        </>
       </section> 
    </>
  );
};

export default Index;
