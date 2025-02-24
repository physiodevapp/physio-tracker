"use client";

import React from "react";
import { ArrowPathIcon } from "@heroicons/react/24/solid";
import { useSettings } from "@/providers/Settings";

const Index: React.FC = () => {
  const {
    settings,
    setMovingAverageWindow,
    setMinAvgAmplitude,
    setMaxAvgDuration,
    setForceDropThreshold,
    setCyclesToAverage,
    setHysteresis,
    setVelocityWeight,
    setVelocityVariationThreshold,
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
      <div className="space-y-2 text-white">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-sm">
              Window<span className="align-sub uppercase text-[0.6rem]"> Avg</span>{" "}: {((settings.force.movingAverageWindow ?? 0) / 1000).toFixed(1)} s
            </label>
            <input
              type="range"
              min="500"
              max="5000"
              step="100"
              value={settings.force.movingAverageWindow}
              onChange={(e) => setMovingAverageWindow(parseInt(e.target.value))}
              className="w-full"
              />
          </div>
          <div className="flex-1">
            <label className="block text-sm">
              Hysteresis<span className="align-sub text-[0.6rem]"></span>: {settings.force.hysteresis}
            </label>
            <input
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
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-sm">
              Amp.<span className="align-sub uppercase text-[0.6rem]"> Avg Min</span>:{" "}
              {settings.force.minAvgAmplitude} kg
            </label>
            <input
              type="range"
              min="0.1"
              max="2"
              step="0.1"
              value={settings.force.minAvgAmplitude}
              onChange={(e) => setMinAvgAmplitude(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm">
              Duration <span className="align-sub uppercase text-[0.6rem]"> Avg Max</span>: {((settings.force.maxAvgDuration ?? 0) / 1000).toFixed(1)} s
            </label>
            <input
              type="range"
              min="500"
              max="2000"
              step="100"
              value={settings.force.maxAvgDuration}
              onChange={(e) => setMaxAvgDuration(parseInt(e.target.value))}
              className="w-full"
              />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-sm">
              <span className="overline">F</span>
              <span className="align-sub uppercase text-[0.6rem]"> Drop</span>: {(settings.force.forceDropThreshold ?? 0) * 100}%
            </label>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={settings.force.forceDropThreshold}
              onChange={(e) => setForceDropThreshold(parseFloat(e.target.value))}
              className="w-full"
              />
          </div>
          <div className="flex-1">
            <label className="block text-sm">
              Cycles<span className="align-sub uppercase text-[0.6rem]"> Avg</span>:{" "}
              {settings.force.cyclesToAverage}
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={settings.force.cyclesToAverage}
              onChange={(e) => setCyclesToAverage(parseInt(e.target.value))}
              className="w-full"
              />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label htmlFor="velocityWeight" className="text-sm font-semibold">
              <span className="overline">V</span><span className="align-sub uppercase text-[0.6rem]"> cycle weight</span>: {settings.force.velocityWeight?.toFixed(2)}
            </label>
            <input
              id="velocityWeight"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.force.velocityWeight}
              onChange={(e) => setVelocityWeight(parseFloat(e.target.value))}
              className="w-full"
              />
          </div>
          <div className="flex-1">
            <label htmlFor="velocityVariationThreshold" className="text-sm">
              Δ<span className="overline">V</span><span className="align-sub uppercase text-[0.6rem]"> cycle</span>: {((settings.force.velocityVariationThreshold ?? 0) * 100).toFixed(0)}%
            </label>
            <input
              id="velocityVariationThreshold"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.force.velocityVariationThreshold}
              onChange={(e) => setVelocityVariationThreshold(parseFloat(e.target.value))}
              className="w-full"
              />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Index;
