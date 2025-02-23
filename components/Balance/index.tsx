"use client";

import { Acceleration, Gyroscope } from '@/interfaces/balance';
import { calculateStaticBalanceQuality, classifySwayWithGyro, detectVibrationRange } from '@/services/balance';
import { Bars3Icon, Cog6ToothIcon, PlayIcon, StopIcon, XMarkIcon } from '@heroicons/react/24/solid';
import React, { useState, useEffect, useRef } from 'react';
import BalanceSettings from "@/modals/BalanceSettings"
import { useSettings } from '@/providers/Settings';
import CountdownRing from "./Counter";
import BalanceChart from "./Graph";

export interface IndexProps {
  handleMainMenu: (visibility?: boolean) => void;
  isMainMenuOpen: boolean;
}

const Index = ({ handleMainMenu, isMainMenuOpen }: IndexProps) => {
  const [showSettings, setShowSettings] = useState(false);

  const { settings } = useSettings();
  
  const [accelData, setAccelData] = useState<Acceleration[]>([]);
  const [gyroData, setGyroData] = useState<Gyroscope[]>([]);
  const [measurementStarted, setMeasurementStarted] = useState<boolean>(false);
  const [results, setResults] = useState<{
    balanceQuality: string;
    sway: { lateral: string; anteriorPosterior: string };
    vibration: { vibrationRange: string; vibrationIndex: number };
  } | null>(null);
  const measurementTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Start measurement and collect data for 30 seconds.
  const startMeasurement = () => {
    setAccelData([]);
    setGyroData([]);
    setResults(null);
    setMeasurementStarted(true);
    toggleSettings(false);

    // Schedule end of measurement after 30 seconds.
    measurementTimeoutRef.current = setTimeout(() => {
      finishMeasurement();
    }, (settings.balance.testDuration + 1) * 1000);
  };

  // Finish measurement and compute results.
  const finishMeasurement = () => {
    setMeasurementStarted(false);
    const balanceQuality = calculateStaticBalanceQuality(accelData, gyroData);
    const sway = classifySwayWithGyro(accelData, gyroData);
    const vibration = detectVibrationRange(accelData, gyroData);
    setResults({ balanceQuality, sway, vibration });
  };

  // Cancel measurement manually and process data collected so far.
  const cancelMeasurement = () => {
    if (measurementTimeoutRef.current) {
      clearTimeout(measurementTimeoutRef.current);
    }
    finishMeasurement();
  };

  // Event listeners for sensor data while measurement is active.
  useEffect(() => {
    if (!measurementStarted) return;
    const handleMotion = (event: DeviceMotionEvent) => {
      console.log('handleMotion');
      if (event.accelerationIncludingGravity) {
        const { x, y, z } = event.accelerationIncludingGravity;
        setAccelData((prev) => [
          ...prev,
          { x: x ?? 0, y: y ?? 0, z: z ?? 0, timestamp: Date.now() ?? 0 },
        ]);
      }
    };

    const handleOrientation = (event: DeviceOrientationEvent) => {
      console.log('handleOrientation');
      const { alpha, beta, gamma } = event;
      setGyroData((prev) => [
        ...prev,
        { alpha: alpha ?? 0, beta: beta ?? 0, gamma: gamma ?? 0, timestamp: Date.now() ?? 0 },
      ]);
    };

    window.addEventListener("devicemotion", handleMotion);
    window.addEventListener("deviceorientation", handleOrientation);

    return () => {
      window.removeEventListener("devicemotion", handleMotion);
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, [measurementStarted]);

  const toggleSettings = (visibility?: boolean) => {
    setShowSettings(visibility === undefined ? !showSettings : visibility);
  }

  const handleMainLayer = () => {
    handleMainMenu(false);
    toggleSettings(false);
    if (measurementStarted) cancelMeasurement();
  }

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
            <BalanceChart accelData={accelData} gyroData={gyroData} />
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
              color='limegreen'
              backgroundColor='#444'
              />
          </div>
        )}
        {(results && !measurementStarted) && (
          <div className='p-4'>
            <p><strong>Static Balance Quality:</strong> {results.balanceQuality}</p>
            <p>
              <strong>Sway - Lateral:</strong> {results.sway.lateral} |{" "}
              <strong>Anterior-Posterior:</strong> {results.sway.anteriorPosterior}
            </p>
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
