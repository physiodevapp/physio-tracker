"use client";

import { } from "@/interfaces/balance";
import { } from "@/services/balance";
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
    
  };

  // Finalizar medición y calcular resultados
  const finishMeasurement = () => {
    
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

    return () => {
      window.removeEventListener("devicemotion", handleMotion);
    };
  }, [measurementStarted]);

  const toggleSettings = (visibility?: boolean) => {
    setShowSettings(visibility === undefined ? !showSettings : visibility);
  };

  const handleMainLayer = () => {
    handleMainMenu(false);
    toggleSettings(false);
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
              onClick={finishMeasurement}
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
