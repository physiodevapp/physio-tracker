"use client";

import { } from "@/interfaces/balance";
import { } from "@/services/balance";
import {
  Bars3Icon,
  Cog6ToothIcon,
  DevicePhoneMobileIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import React, { useEffect, useState } from "react";
import BalanceSettings from "@/modals/BalanceSettings";
import useMotionHandler from "./Hooks/useMotionHandler";
import useOrientationHandler from "./Hooks/useOrientationHandler";
import SpectrumChart from "./FrequencyGraph";
import COPChart from "./COPGraph";
import { motion } from "framer-motion";
import CountdownRing from "./Counter";
import { useSettings } from "@/providers/Settings";
import Image from "next/image";

export interface IndexProps {
  handleMainMenu: (visibility?: boolean) => void;
  isMainMenuOpen: boolean;
}

const Index = ({ handleMainMenu, isMainMenuOpen }: IndexProps) => {
  const [showSettings, setShowSettings] = useState(false);
  const { settings, setSensorHeight } = useSettings();

  const [isRecording, setIsRecording] = useState<boolean | null>(null);

  const [hasValidTestResults, setHasValidTestResults] = useState(false);
  const [isDefaultState, setIsDefaultState] = useState(false);
  
  const { 
    startMotion, stopMotion,
    isBaselineDefined,
    isOrientationCorrect,
    log,
    COPData, 
    frequencyData,
  } = useMotionHandler({settings: settings.balance});

  const { orientation } = useOrientationHandler({
    settings: settings.balance,
    isActive: !isRecording
  });

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
      handleMainLayer();

      startMotion();

      setIsDefaultState(false);
      setHasValidTestResults(false);
    } 
    else {
      stopMotion();
    }
  }, [isRecording]);

  useEffect(() => {
    const hasSufficientData = (COPData.copPoints?.length ?? 0) > settings.balance.calibrationPoints
    if (isBaselineDefined && hasSufficientData) {
      setHasValidTestResults(true)
    } 
    else {
      setHasValidTestResults(false);
    }
  }, [COPData]);

  const getThumbPosition = () => {
    const percentage = ((settings.balance.sensorHeight - 40) / (220 - 40)) * 100;
    return `${percentage}%`;
  };

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
            pause={!isOrientationCorrect}
            onEnd={() => setIsRecording(false)}
            size={200}
            thickness={12}
            backgroundThickness={11}
            color={isOrientationCorrect
              ? !isBaselineDefined ? 'yellow' : 'limegreen'
              : 'red'
            }
            backgroundColor='#444'
            text={log}
            />
        </div>
      )}
      {!isRecording && (
        <>
          <div className="absolute top-0 left-0 z-[1] w-full h-[7rem] bg-gradient-to-b from-white via-white/20 to-transparent dark:from-black dark:via-black/20 dark:to-transparent pointer-events-none"></div>
          <div 
            className={`relative w-full h-dvh flex flex-col items-center overflow-auto pt-[7rem]`}
            onClick={handleMainLayer}
            >
            {!isDefaultState && (
              <>
                {!hasValidTestResults && (
                  <p className="px-4 py-2">{log}</p>
                )}
                {hasValidTestResults && (  
                  <>
                    <p className="absolute -translate-y-10 text-lg">Metrics analyzed</p>
                    <section className="flex flex-row flex-wrap w-full px-1 gap-y-4">
                      <div className="flex-1 basis-full py-2 border-2 border-black dark:border-white rounded-lg">
                        <table className="w-full border-collapse text-left">
                          <thead>
                            <tr>
                              <th className="pr-2 w-16 py-2"></th>
                              <th className="pl-2">ML (Y)</th>
                              <th className="pl-2">AP (Z)</th>
                              <th className="pl-2">Global</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="pr-2 w-16 font-bold text-right ">Z<sub> fr</sub></td>
                              <td className="pl-2">{COPData.zeroFrequency.ML_Y} Hz</td>
                              <td className="pl-2">{COPData.zeroFrequency.AP_Z} Hz</td>
                              <td className="pl-2">-</td>
                            </tr>
                            <tr>
                              <td className="pr-2 w-16 font-bold text-right ">Z<sub> STD</sub></td>
                              <td className="pl-2">{COPData.zeroSTD.ML_Y} m/s²</td>
                              <td className="pl-2">{COPData.zeroSTD.AP_Z} m/s²</td>
                              <td className="pl-2">-</td>
                            </tr>
                            <tr>
                              <td className="pr-2 w-16 font-bold text-right ">Main<sub> fr</sub></td>
                              <td className="pl-2">{COPData.mainFrequency.ML_Y} Hz</td>
                              <td className="pl-2">{COPData.mainFrequency.AP_Z} Hz</td>
                              <td className="pl-2">-</td>
                            </tr>
                            <tr>
                              <td className="pr-2 w-16 font-bold text-right ">RMS</td>
                              <td className="pl-2">{COPData.RMS.ML_Y} cm</td>
                              <td className="pl-2">{COPData.RMS.AP_Z} cm</td>
                              <td className="pl-2">-</td>
                            </tr>
                            <tr>
                              <td className="pr-2 w-16 font-bold text-right ">Var</td>
                              <td className="pl-2">{COPData.Variance.ML_Y} cm²</td>
                              <td className="pl-2">{COPData.Variance.AP_Z} cm²</td>
                              <td className="pl-2">{COPData.Variance.Global} cm²</td>
                            </tr>
                            <tr>
                              <td className="pr-2 w-16 font-bold text-right ">Jerk</td>
                              <td className="pl-2">{COPData.jerk?.ML_Y ?? "-"} m/s³</td>
                              <td className="pl-2">{COPData.jerk?.AP_Z ?? "-"} m/s³</td>
                              <td className="pl-2">-</td>
                            </tr>
                            <tr>
                              <td className="pr-2 w-16 font-bold text-right ">Area</td>
                              <td className="pl-2">-</td>
                              <td className="pl-2">-</td>
                              <td className="pl-2">{COPData.copArea?.value ?? "-"} cm²</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
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
                        <COPChart 
                          areaParams={{
                            copAreaPoints: COPData.copArea?.boundaryPoints ?? [{x: 0, y: 0}]
                          }}
                          ellipseParams={{
                            copPoints: COPData.copPoints ?? [{ml: 0, ap: 0}],
                            semiMajor: COPData.ellipse?.semiMajor ?? 0,
                            semiMinor: COPData.ellipse?.semiMinor ?? 0,
                            orientation: COPData.ellipse?.orientation ?? 0,
                            centerX: COPData.ellipse?.centerX ?? 0,
                            centerY: COPData.ellipse?.centerY ?? 0
                          }}
                          options={{
                            canvasId: "cop"
                          }}
                          />     
                      </div>  
                    </section> 
                  </>
                )}
              </>
            )}
            {(isDefaultState || !hasValidTestResults) ? (
                <>
                  <Image 
                    src="/silhouette_transparent.png" 
                    alt="Loading..." 
                    width={100} 
                    height={100} 
                    priority 
                    quality={80}
                    className={`absolute top-1/2 -translate-y-1/2 w-[80vw] p-4 rounded-full brightness-[1.2] dark:invert-[1] border-[0.4rem] transition-transform ${
                      orientation === "landscape" 
                        ? 'rotate-90 border-[#21e324] dark:border-[#D7138F]' 
                        : 'rotate-0 border-[#bebebe] dark:border-[#9b9b9b]'
                    }`}
                    />
                  {orientation === "landscape" ? (
                      <>
                        <div className="absolute top-1/2 -translate-y-1/2 left-0 w-[6rem] py-1 rotate-90 bg-blue-500 text-white text-lg text-center rounded-xl border-[6px] border-white dark:border-background-dark">
                          {settings.balance.sensorHeight} cm
                        </div>
                        <div
                          data-element="non-swipeable" 
                          className='absolute top-1/2 translate-y-[12rem] w-[100dvw] px-12'
                          >
                          {/* Barra base */}
                          <div className="w-full h-2 rounded-md relative">
                            {/* Thumb visual */}
                            <div
                              className="absolute z-10 top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none"
                              style={{ left: getThumbPosition() }}
                              >
                              <DevicePhoneMobileIcon className="w-8 h-12 text-blue-500 bg-white dark:bg-background-dark"/>
                            </div>
                            {/* Input funcional (invisible) */}
                            <input
                              id="update-height"
                              type="range"
                              value={settings.balance.sensorHeight}
                              min="40"
                              max="220"
                              step="5"
                              onChange={(e) => setSensorHeight(parseInt(e.target.value))}
                              className="absolute top-0 left-0 w-full h-2 cursor-pointer sensor-height-range"
                            />
                          </div>
                        </div>
                        <button 
                          className="absolute top-1/2 -translate-y-1/2 px-6 rotate-90 rounded-lg p-2 bg-green-500 font-bold uppercase text-2xl animate-pulse"
                          onClick={() => settings?.balance && setIsRecording(true)}
                        >Test</button>
                      </>
                    ) : null
                  }
                </> 
              ) : null
            }
          </div>
        </>
      )}
      {(showSettings && !isRecording) ? (
          <BalanceSettings />
        ) : null
      }
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
          {(!isRecording && hasValidTestResults && !isDefaultState) ? (
              <TrashIcon
                className="h-6 w-6 text-red-500 cursor-pointer"
                onClick={() => setIsDefaultState(true)}
                />
            ) : null
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
