"use client";

import React from "react";
import { ArrowPathIcon } from "@heroicons/react/24/solid";
import { useSettings } from "@/providers/Settings";

const Index: React.FC = () => {
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
    resetForceSettings,
  } = useSettings();

  return (
    <section
      data-element="non-swipeable"
      className="absolute bottom-0 w-full px-4 pt-[1rem] pb-[2rem] bg-gradient-to-b from-black/80 to-black rounded-t-lg p-4 text-white"
      >
      <div
        className="w-full h-9 flex justify-end text-white/60 italic font-light cursor-pointer"
        onClick={resetForceSettings}
        >
        Set default values <ArrowPathIcon className="ml-2 w-6 h-6" />
      </div>
      <div className="flex flex-col gap-4 text-white">
        <div className="flex gap-6">
          <div className="flex-1 flex flex-col gap-2">
            <label 
              htmlFor="movingAverageWindow"
              className="block text-sm"
              >
                Window<span className="align-sub uppercase text-[0.6rem]"> Avg</span>{" "}: {((settings.force.movingAverageWindow ?? 0) / 1000).toFixed(1)} s
            </label>
            <input
              id="movingAverageWindow"
              type="range"
              min="500"
              max="5000"
              step="100"
              value={settings.force.movingAverageWindow}
              onChange={(e) => setMovingAverageWindow(parseInt(e.target.value))}
              className="w-full"
              />
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <label 
              htmlFor="hysteresis"
              className="block text-sm"
              >
                Hysteresis<span className="align-sub text-[0.6rem]"></span>: {settings.force.hysteresis} kg
            </label>
            <input
              id="hysteresis"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.force.hysteresis}
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
                {settings.force.minAvgAmplitude} kg
            </label>
            <input
              id="minAvgAmplitude"
              type="range"
              min="0.1"
              max="2"
              step="0.1"
              value={settings.force.minAvgAmplitude}
              onChange={(e) => setMinAvgAmplitude(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <label 
              htmlFor="durationChangeThreshold"
              className="block text-sm"
              >
                Duration <span className="align-sub uppercase text-[0.6rem]"> Var</span>: {settings.force.durationChangeThreshold} s
            </label>
            <input
              id="durationChangeThreshold"
              type="range"
              min="0.01"
              max="0.2"
              step="0.01"
              value={settings.force.durationChangeThreshold}
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
                <span className="align-sub uppercase text-[0.6rem]"> Drop</span>: {(settings.force.peakDropThreshold ?? 0) * 100}%
            </label>
            <input
              id="peakDropThreshold"
              type="range"
              min="0.1"
              max="1.0"
              step="0.1"
              value={settings.force.peakDropThreshold}
              onChange={(e) => setPeakDropThreshold(parseFloat(e.target.value))}
              className="w-full"
              />
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <label 
              htmlFor="velocityWeight" 
              className="block text-sm"
              >
                <span className="overline">V</span><span className="align-sub uppercase text-[0.6rem]"> drop</span>: {settings.force.velocityDropThreshold?.toFixed(2)} %
            </label>
            <input
              id="velocityWeight"
              type="range"
              min="0.5"
              max="1.0"
              step="0.05"
              value={settings.force.velocityDropThreshold}
              onChange={(e) => setVelocityDropThreshold(parseFloat(e.target.value))}
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
                {settings.force.cyclesToAverage}
            </label>
            <input
              id="cyclesToAverage"
              type="range"
              min="1"
              max="10"
              value={settings.force.cyclesToAverage}
              onChange={(e) => setCyclesToAverage(parseInt(e.target.value))}
              className="w-full"
              />
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <label 
              htmlFor="velocityVariationThreshold" 
              className="block text-sm"
              >
              Cycle<span className="align-sub uppercase text-[0.6rem]"> var</span>: {settings.force.variabilityThreshold.toFixed(2)} %
            </label>
            <input
              id="velocityVariationThreshold"
              type="range"
              min="0.01" 
              max="0.10" 
              step="0.01" 
              value={settings.force.variabilityThreshold}
              onChange={(e) => setVariabilityThreshold(parseFloat(e.target.value))}
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
            Cycles<span className="align-sub uppercase text-[0.6rem]"> analysis</span>: {settings.force.cyclesForAnalysis}
          </label>
          <input
            id="cyclesForAnalysis"
            type="range"
            min="4" 
            max="8" 
            step="1" 
            value={settings.force.cyclesForAnalysis}
            onChange={(e) => setCyclesForAnalysis(parseInt(e.target.value))}
            className="w-full"
            />
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <label 
              htmlFor="outlierSensitivity"
              className="block text-sm"
              >
                Outlier<span className="align-sub uppercase text-[0.6rem]"> Sensitivity (σ)</span>:{" "}
                {settings.force.outlierSensitivity.toFixed(1)}
            </label>
            <input
              id="outlierSensitivity"
              type="range"
              min="1"
              max="5"
              step="0.1"
              value={settings.force.outlierSensitivity}
              onChange={(e) => setOutlierSensitivity(parseFloat(e.target.value))}
              className="w-full"
              />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Index;
