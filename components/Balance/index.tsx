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
import React, { useEffect, useState } from "react";
import BalanceSettings from "@/modals/BalanceSettings";
import { useMotionHandler } from "./Hooks/useMotionHandler";
import SpectrumChart from "./FrequencyGraph"
// import CountdownRing from "./Counter";
// import { useSettings } from "@/providers/Settings";

export interface IndexProps {
  handleMainMenu: (visibility?: boolean) => void;
  isMainMenuOpen: boolean;
}

const Index = ({ handleMainMenu, isMainMenuOpen }: IndexProps) => {
  const [showSettings, setShowSettings] = useState(false);
  const [isRecording, setIsRecording] = useState<boolean | null>(null);
  // const { settings } = useSettings();
  const { 
    startMotion, stopMotion,
    isBaselineCalibrated, 
    frequencyData,
    log,
  } = useMotionHandler();

  const toggleSettings = (visibility?: boolean) => {
    setShowSettings(visibility === undefined ? !showSettings : visibility);
  };

  const handleMainLayer = () => {
    handleMainMenu(false);
    toggleSettings(false);
  };

  useEffect(() => {
    if (isRecording === null) return;

    if (isRecording) {
      startMotion();
    } 
    else {
      stopMotion();
    }
  }, [isRecording])

  return (
    <>
      <div 
        className={`relative w-full h-dvh flex flex-col justify-center items-center`}
        onClick={handleMainLayer}
        >
        <h1 className={`absolute left-1/2 -translate-x-1/2 z-10 text-xl text-white bg-black/40 rounded-full py-1 px-4 font-bold mt-2 transition-[top] duration-300 ease-in-out whitespace-nowrap ${
          isMainMenuOpen ? '-top-12' : 'top-0'
        }`}>Balance</h1>
        {/* {(isRecording && !isBaselineCalibrated) && (
          <div 
            data-element="non-swipeable"
            className='w-full h-dvh z-50 flex justify-center items-center bg-black/30'
            >
            <CountdownRing 
              size={200}
              thickness={12}
              backgroundThickness={11}
              color={!isCalibrated ? 'yellow' : 'limegreen'}
              backgroundColor='#444'
              />
          </div>
        )} */}
        <div>Log:: {log}</div>
        {isBaselineCalibrated && (
          <SpectrumChart 
            canvasId="spectrum"
            spectrumParamsY={{
              frequencies: frequencyData.frequencies_y,
              amplitudes: frequencyData.amplitudes_y
            }}
            spectrumParamsZ={{
              frequencies: frequencyData.frequencies_z,
              amplitudes: frequencyData.amplitudes_z
            }}
            maxFreq={10}
            />
        )}
      </div>
      {(showSettings && !isRecording) && (
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
          {isRecording ?
            <StopIcon 
              className={`w-6 h-6 text-green-500 ${
                isRecording ? 'animate-pulse' : ''
              }`}
              onClick={() => setIsRecording(false)}
              />
            : <PlayIcon 
                className="w-6 h-6 text-white"
                onClick={() => !isRecording && setIsRecording(true)}
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
            onClick={() => !isRecording && toggleSettings()}
            />
        </>
       </section> 
    </>
  );
};

export default Index;
