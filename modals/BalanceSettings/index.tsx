"use client";

import { useSettings } from '@/providers/Settings';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import React from 'react'

const Index = () => {
  const {
    settings,
    setTestDuration,
    setCalibrationDelay,
    setCalibrationDomFreqThreshold,
    setCalibrationStdThreshold,
    setCutoffFrequency,
    resetBalanceSettings
  } = useSettings();

  return (
    <section
      data-element="non-swipeable"
      className="absolute bottom-0 w-full px-4 pt-[1rem] pb-[2rem] bg-gradient-to-b from-black/40 to-black rounded-t-lg"
      >
      <div
        className="w-full h-9 flex justify-end text-white/60 italic font-light cursor-pointer"
        onClick={resetBalanceSettings}
        >
        Set default values{" "}
        <ArrowPathIcon className="ml-2 w-6 h-6" />
      </div>
      <form className='w-full flex flex-col justify-center mt-2 space-y-2 text-white'>
        <div className="flex justify-around gap-6">
          <div className="flex-1">
            <label className="block text-sm mb-1">
              Duration: {settings.balance.testDuration} seg
            </label>
            <input
                type="range"
                min="10"
                max="30"
                step="1"
                value={settings.balance.testDuration}
                onChange={(e) =>
                  setTestDuration(parseInt(e.target.value, 10))
                }
                className="w-full"
              />
          </div>
          <div className="flex-1">
            <label className="block text-sm mb-1">
              Freq<sub className='align-sub text-[0.6rem] uppercase'> cut-off</sub>: {settings.balance.cutoffFrequency} Hz
            </label>
            <input
                type="range"
                min="2"
                max="10"
                step="0.5"
                value={settings.balance.cutoffFrequency}
                onChange={(e) =>
                  setCutoffFrequency(parseFloat(e.target.value))
                }
                className="w-full"
              />
          </div>
        </div>
        <div className="flex justify-around gap-4">
          <div className="flex-1">
            <label className="block text-sm mb-1">
              Freq<sub className='align-sub text-[0.6rem] uppercase'> dom</sub>: {settings.balance.calibrationDomFreqThreshold} Hz
            </label>
            <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={settings.balance.calibrationDomFreqThreshold}
                onChange={(e) =>
                  setCalibrationDomFreqThreshold(parseFloat(e.target.value))
                }
                className="w-full"
              />
          </div>
          <div className="flex-1">
            <label className="block text-sm mb-1">
              STD: {settings.balance.calibrationStdThreshold} m/s²
            </label>
            <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={settings.balance.calibrationStdThreshold}
                onChange={(e) =>
                  setCalibrationStdThreshold(parseFloat(e.target.value))
                }
                className="w-full"
              />
          </div>
          <div className="flex-1">
            <label className="block text-sm mb-1">
              Hold: {(settings.balance.calibrationDelay / 1000)} seg
            </label>
            <input
                type="range"
                min="4"
                max="10"
                step="1"
                value={settings.balance.calibrationDelay / 1000}
                onChange={(e) =>
                  setCalibrationDelay(parseInt(e.target.value, 10) * 1000)
                }
                className="w-full"
              />
          </div>
        </div>
      </form>      
    </section>
  )
}

export default Index