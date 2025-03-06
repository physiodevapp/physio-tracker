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
          <>
            <table className="w-full border-collapse text-center border border-black">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left px-4 py-2"></th>
                  <th>ML (Y)</th>
                  <th>AP (Z)</th>
                  <th>Global</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-bold">Zero<sub> fr</sub></td>
                  <td>{motionStatsData.zeroFrequency.ML_Y!.toFixed(1)} Hz</td>
                  <td>{motionStatsData.zeroFrequency.AP_Z!.toFixed(1)} Hz</td>
                  <td>-</td>
                </tr>
                <tr>
                  <td className="font-bold">Zero<sub> STD</sub></td>
                  <td>{motionStatsData.zeroSTD.ML_Y!.toFixed(1)} m/s²</td>
                  <td>{motionStatsData.zeroSTD.AP_Z!.toFixed(1)} m/s²</td>
                  <td>-</td>
                </tr>
                <tr>
                  <td className="font-bold">Main<sub> fr</sub></td>
                  <td>{motionStatsData.mainFrequency.ML_Y!.toFixed(3)} Hz</td>
                  <td>{motionStatsData.mainFrequency.AP_Z!.toFixed(3)} Hz</td>
                  <td>-</td>
                </tr>
                <tr>
                  <td className="font-bold">RMS</td>
                  <td>{motionStatsData.RMS.ML_Y!.toFixed(1)} cm</td>
                  <td>{motionStatsData.RMS.AP_Z!.toFixed(1)} cm</td>
                  <td>-</td>
                </tr>
                <tr>
                  <td className="font-bold">Var</td>
                  <td>{motionStatsData.Variance.ML_Y!.toFixed(3)} cm²</td>
                  <td>{motionStatsData.Variance.AP_Z!.toFixed(3)} cm²</td>
                  <td>{motionStatsData.Variance.Global!.toFixed(3)} cm²</td>
                </tr>
                <tr>
                  <td className="font-bold">Jerk</td>
                  <td>{motionStatsData.jerk?.ML_Y!.toFixed(2)} m/s³</td>
                  <td>{motionStatsData.jerk?.AP_Z!.toFixed(2)} m/s³</td>
                  <td>-</td>
                </tr>
                <tr>
                  <td className="font-bold">Area<sub> COP</sub></td>
                  <td>-</td>
                  <td>-</td>
                  <td>{motionStatsData.copArea?.value!.toFixed(2)} cm²</td>
                </tr>
              </tbody>
            </table>

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
            {!isRecording && (
              <>
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
              </>
            )}
          </>
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
