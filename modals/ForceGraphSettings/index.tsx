"use client";

import React from "react";
import { ArrowPathIcon } from "@heroicons/react/24/solid";
import { useSettings } from "@/providers/Settings";

type IndexProps = {
  isInPostRecordingMode: boolean;
};

const Index = ({ isInPostRecordingMode }: IndexProps) => {
  const {
    settings,
    setMovingAverageWindow,
    setMinAvgAmplitude,
    setPeakDropThreshold,
    setCyclesToAverage,
    setCyclesForAnalysis,
    setHysteresis,
    setDurationChangeThreshold,
    setVelocityDropThreshold,
    setVariabilityThreshold,
    setOutlierSensitivity,
    setIncludeFirstCycle,
    resetForceSettings,
  } = useSettings();
  const { 
    movingAverageWindow,
    hysteresis,
    minAvgAmplitude,
    durationChangeThreshold,
    peakDropThreshold,
    velocityDropThreshold,
    cyclesForAnalysis,
    outlierSensitivity,
    cyclesToAverage,
    variabilityThreshold,
    includeFirstCycle,
  } = settings.force;

  return (
    <section
      data-element="non-swipeable"
      className="absolute bottom-0 w-full px-4 pt-[1rem] pb-[2rem] bg-gradient-to-b from-black/80 to-black rounded-t-lg p-4 text-white shadow-[0_0_3px_rgba(0,0,0,0.2)] dark:shadow-[0_0_3px_rgba(0,0,0,0.46)]"
      >
      {isInPostRecordingMode ? null : (
        <div
          className="w-full h-9 flex justify-end text-white italic font-bold cursor-pointer"
          onClick={resetForceSettings}
          >
          Set default values <ArrowPathIcon className="ml-2 w-6 h-6" />
        </div>
      )}
      <div className="flex flex-col gap-4 mt-2 text-white">
        {isInPostRecordingMode ? null : (
          <>
            <div className="flex gap-6">
              <div className="flex-1 flex flex-col gap-2">
                <label 
                  htmlFor="movingAverageWindow"
                  className="block text-sm"
                  >
                    Window<span className="align-sub uppercase text-[0.6rem]"> Avg</span>{" "}: {((movingAverageWindow ?? 0) / 1000).toFixed(1)} s
                </label>
                <input
                  id="movingAverageWindow"
                  type="range"
                  min="500"
                  max="5000"
                  step="100"
                  value={movingAverageWindow}
                  onChange={(e) => setMovingAverageWindow(parseInt(e.target.value))}
                  className="w-full"
                  />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <label 
                  htmlFor="hysteresis"
                  className="block text-sm"
                  >
                    Hysteresis<span className="align-sub text-[0.6rem]"></span>: {hysteresis.toFixed(2)} kg
                </label>
                <input
                  id="hysteresis"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={hysteresis}
                  onChange={(e) => setHysteresis(parseFloat(e.target.value))}
                  className="w-full"
                  />
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex-1 flex flex-col gap-2">
                <label 
                  htmlFor="minAvgAmplitude"
                  className="block text-sm"
                  >
                    Amp.<span className="align-sub uppercase text-[0.6rem]"> Avg Min</span>:{" "}
                    {minAvgAmplitude.toFixed(1)} kg
                </label>
                <input
                  id="minAvgAmplitude"
                  type="range"
                  min="0.1"
                  max="2"
                  step="0.1"
                  value={minAvgAmplitude}
                  onChange={(e) => setMinAvgAmplitude(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <label 
                  htmlFor="durationChangeThreshold"
                  className="block text-sm"
                  >
                    Duration <span className="align-sub uppercase text-[0.6rem]"> Var</span>: {durationChangeThreshold.toFixed(2)} s
                </label>
                <input
                  id="durationChangeThreshold"
                  type="range"
                  min="0.01"
                  max="0.2"
                  step="0.01"
                  value={durationChangeThreshold}
                  onChange={(e) => setDurationChangeThreshold(parseFloat(e.target.value))}
                  className="w-full"
                  />
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex-1 flex flex-col gap-2">
                <label 
                  htmlFor="peakDropThreshold"
                  className="block text-sm"
                  >
                    <span className="overline">F</span>
                    <span className="align-sub uppercase text-[0.6rem]"> Drop</span>: {(peakDropThreshold ?? 0) * 100}%
                </label>
                <input
                  id="peakDropThreshold"
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={peakDropThreshold}
                  onChange={(e) => setPeakDropThreshold(parseFloat(e.target.value))}
                  className="w-full"
                  />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <label 
                  htmlFor="velocityWeight" 
                  className="block text-sm"
                  >
                    <span className="overline">V</span><span className="align-sub uppercase text-[0.6rem]"> drop</span>: {velocityDropThreshold?.toFixed(2)} %
                </label>
                <input
                  id="velocityWeight"
                  type="range"
                  min="0.5"
                  max="1.0"
                  step="0.05"
                  value={velocityDropThreshold}
                  onChange={(e) => setVelocityDropThreshold(parseFloat(e.target.value))}
                  className="w-full"
                  />
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex-1 flex flex-col gap-2">
                <label 
                  htmlFor="cyclesForAnalysis" 
                  className="block text-sm"
                  >
                  Cycles<span className="align-sub uppercase text-[0.6rem]"> live analysis</span>: {cyclesForAnalysis}
                </label>
                <input
                  id="cyclesForAnalysis"
                  type="range"
                  min="4" 
                  max="8" 
                  step="1" 
                  value={cyclesForAnalysis}
                  onChange={(e) => setCyclesForAnalysis(parseInt(e.target.value))}
                  className="w-full"
                  />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <label 
                  htmlFor="outlierSensitivity"
                  className="block text-sm"
                  >
                    Outlier<span className="align-sub uppercase text-[0.6rem]"> Sensitivity (<span className="lowercase text-[0.8rem]">σ</span>)</span>:{" "}
                    {outlierSensitivity.toFixed(1)}
                </label>
                <input
                  id="outlierSensitivity"
                  type="range"
                  min="1"
                  max="5"
                  step="0.1"
                  value={outlierSensitivity}
                  onChange={(e) => setOutlierSensitivity(parseFloat(e.target.value))}
                  className="w-full"
                  />
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex-1 flex flex-col gap-2">
                <label 
                  htmlFor="cyclesToAverage"
                  className="block text-sm"
                  >
                    Cycles<span className="align-sub uppercase text-[0.6rem]"> Avg</span>:{" "}
                    {cyclesToAverage}
                </label>
                <input
                  id="cyclesToAverage"
                  type="range"
                  min="1"
                  max="10"
                  value={cyclesToAverage}
                  onChange={(e) => setCyclesToAverage(parseInt(e.target.value))}
                  className="w-full"
                  />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <label 
                  htmlFor="velocityVariationThreshold" 
                  className="block text-sm"
                  >
                  Cycle<span className="align-sub uppercase text-[0.6rem]"> var</span>: {variabilityThreshold.toFixed(2)} %
                </label>
                <input
                  id="velocityVariationThreshold"
                  type="range"
                  min="0.01" 
                  max="0.10" 
                  step="0.01" 
                  value={variabilityThreshold}
                  onChange={(e) => setVariabilityThreshold(parseFloat(e.target.value))}
                  className="w-full"
                  />
              </div>
            </div>
          </>
        )}
        <div className="flex gap-6">
          <div className="flex-1 flex flex-col justify-end gap-2">
            <label className="relative inline-flex items-center cursor-pointer mt-4">
              <input 
                type="checkbox" 
                value="" 
                className="sr-only peer" 
                checked={includeFirstCycle}
                onChange={() => {
                  const next: boolean = !includeFirstCycle;
                  
                  setIncludeFirstCycle(next);
                }} />
              <div
                className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-0 peer-focus:ring-[#5dadec]
                rounded-full peer dark:bg-gray-700 peer-checked:bg-[#5dadec] transition-all duration-200" />
              <div
                className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full shadow peer-checked:translate-x-full transform transition-all duration-200 bg-white`} />
              <span 
                className={`text-white text-sm pl-2 `} >
                  {'Include the first cycle in the calculations'}
              </span>
            </label>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Index;
