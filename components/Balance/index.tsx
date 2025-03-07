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
import SpectrumChart from "./FrequencyGraph";
import COPChart from "./COPGraph";
import { motion } from "framer-motion";
import CountdownRing from "./Counter";
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
    isBaselineDefined,
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
      <motion.h1
        initial={{ y: 0, opacity: 1 }}
        animate={{ y: isMainMenuOpen ? -48 : 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 100, damping: 15 }}
        className="absolute z-10 inset-x-0 mx-auto w-[50vw] text-center text-xl text-white bg-black/40 
        rounded-full py-2 px-4 font-bold mt-2 whitespace-nowrap"
      >
        Balance
      </motion.h1>
      {isRecording && (
        <div 
          data-element="non-swipeable"
          className='absolute w-full h-dvh z-50 flex justify-center items-center bg-black/30'
          onClick={() => setIsRecording(false)}
          >
          <CountdownRing 
            seconds={15}
            start={isBaselineDefined}
            endTrigger={() => setIsRecording(false)}
            size={200}
            thickness={12}
            backgroundThickness={11}
            color={!isBaselineDefined ? 'yellow' : 'limegreen'}
            backgroundColor='#444'
            text={log}
            />
        </div>
      )}
      <div className="absolute top-0 left-0 z-[1] w-full h-[6rem] bg-gradient-to-b from-white dark:from-black to-transparent pointer-events-none"></div>
      <div 
        className={`relative w-full h-dvh flex flex-col items-center overflow-auto pt-[6rem]`}
        onClick={handleMainLayer}
        >
        {(((motionStatsData.copPoints?.length ?? 0) < 100) && !isRecording && isBaselineDefined) && (
          <p className="px-4 py-2">{log}</p>
        )}
        {(isBaselineDefined && !isRecording) && (  
          <section className="flex flex-row flex-wrap w-full px-1 gap-y-4">
            <table className="flex-1 basis-full border-collapse text-center border border-black">
              <thead>
                <tr>
                  <th className="text-left px-4 py-2"></th>
                  <th>ML (Y)</th>
                  <th>AP (Z)</th>
                  <th>Global</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-bold">Zero<sub> fr</sub></td>
                  <td>{motionStatsData.zeroFrequency.ML_Y} Hz</td>
                  <td>{motionStatsData.zeroFrequency.AP_Z} Hz</td>
                  <td>-</td>
                </tr>
                <tr>
                  <td className="font-bold">Zero<sub> STD</sub></td>
                  <td>{motionStatsData.zeroSTD.ML_Y} m/s²</td>
                  <td>{motionStatsData.zeroSTD.AP_Z} m/s²</td>
                  <td>-</td>
                </tr>
                <tr>
                  <td className="font-bold">Main<sub> fr</sub></td>
                  <td>{motionStatsData.mainFrequency.ML_Y} Hz</td>
                  <td>{motionStatsData.mainFrequency.AP_Z} Hz</td>
                  <td>-</td>
                </tr>
                <tr>
                  <td className="font-bold">RMS</td>
                  <td>{motionStatsData.RMS.ML_Y!} cm</td>
                  <td>{motionStatsData.RMS.AP_Z!} cm</td>
                  <td>-</td>
                </tr>
                <tr>
                  <td className="font-bold">Var</td>
                  <td>{motionStatsData.Variance.ML_Y} cm²</td>
                  <td>{motionStatsData.Variance.AP_Z} cm²</td>
                  <td>{motionStatsData.Variance.Global} cm²</td>
                </tr>
                <tr>
                  <td className="font-bold">Jerk</td>
                  <td>{motionStatsData.jerk?.ML_Y ?? "-"} m/s³</td>
                  <td>{motionStatsData.jerk?.AP_Z ?? "-"} m/s³</td>
                  <td>-</td>
                </tr>
                <tr>
                  <td className="font-bold">Area<sub> COP</sub></td>
                  <td>-</td>
                  <td>-</td>
                  <td>{motionStatsData.copArea?.value ?? "-"} cm²</td>
                </tr>
              </tbody>
            </table>
            <div className="flex-1 basis-full">
              <SpectrumChart 
                spectrumParamsY={{
                  frequencies: frequencyData.frequencies_y,
                  amplitudes: frequencyData.amplitudes_y
                }}
                spectrumParamsZ={{
                  frequencies: frequencyData.frequencies_z,
                  amplitudes: frequencyData.amplitudes_z
                }}
                options={{                
                  canvasId: "spectrum",
                  maxFreq: 10
                }}
                />
            </div> 
            <div className="flex-1 basis-full">
              {!isRecording && (
                <COPChart 
                  areaParams={{
                    copAreaPoints: motionStatsData.copArea!.boundaryPoints!
                  }}
                  ellipseParams={{
                    copPoints: motionStatsData.copPoints!,
                    semiMajor: motionStatsData.ellipse!.semiMajor!,
                    semiMinor: motionStatsData.ellipse!.semiMinor!,
                    orientation: motionStatsData.ellipse!.orientation!,
                    centerX: motionStatsData.ellipse!.centerX!,
                    centerY: motionStatsData.ellipse!.centerY!
                  }}
                  options={{
                    canvasId: "cop"
                  }}
                  />
              )}
            </div>  
          </section> 
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
