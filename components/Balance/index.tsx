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
import { useSettings } from "@/providers/Settings";
import CountdownRing from "./Counter";
import { useMotionHandler } from "./Hooks/useMotionHandler";

export interface IndexProps {
  handleMainMenu: (visibility?: boolean) => void;
  isMainMenuOpen: boolean;
}

const Index = ({ handleMainMenu, isMainMenuOpen }: IndexProps) => {
  const [showSettings, setShowSettings] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const { settings } = useSettings();
  const { 
    samplingFrequency, 
    isAcquiring, isCalibrated, isBaselineCalibrated, 
    startMotion, stopMotion,
    log, 
    motionStatsData,
    frequencyData,
  } = useMotionHandler();

  const toggleSettings = (visibility?: boolean) => {
    setShowSettings(visibility === undefined ? !showSettings : visibility);
  };

  const handleMainLayer = () => {
    handleMainMenu(false);
    toggleSettings(false);
  };

  useEffect(() => {
    if (isRecording) {
      stopMotion();
    } else {
      startMotion();
    }
  }, [isRecording])

  return (
    <>
      <div 
        className={`relative w-full h-dvh flex flex-col justify-center items-center ${
          isRecording ? 'bg-black/80' : ''
        }`}
        onClick={handleMainLayer}
        >
        <h1 className={`absolute left-1/2 -translate-x-1/2 z-10 text-xl text-white bg-black/40 rounded-full py-1 px-4 font-bold mt-2 transition-[top] duration-300 ease-in-out whitespace-nowrap ${
          isMainMenuOpen ? '-top-12' : 'top-0'
        }`}>Balance</h1>
        {isRecording && (
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
