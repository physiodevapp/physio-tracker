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
    setGravityFactor,
    setAutoStartAfterCalibration,
    resetBalanceSettings
  } = useSettings();
  const { 
    testDuration,
    cutoffFrequency,
    calibrationDomFreqThreshold,
    calibrationStdThreshold,
    calibrationDelay,
    gravityFactor,   
    autoStartAfterCalibration,
  } = settings.balance;

  return (
    <section
      data-element="non-swipeable"
      className="absolute bottom-0 w-full px-4 pt-[1rem] pb-[2rem] bg-gradient-to-b from-black/40 to-black rounded-t-lg shadow-[0_0_3px_rgba(0,0,0,0.2)] dark:shadow-[0_0_3px_rgba(0,0,0,0.46)]"
      >
      <div
        className="w-full h-9 flex justify-end text-white italic font-bold cursor-pointer"
        onClick={resetBalanceSettings}
        >
        Set default values{" "}
        <ArrowPathIcon className="ml-2 w-6 h-6" />
      </div>
      <form className='w-full flex flex-col justify-center gap-4 mt-2 text-white'>
        <div className="flex justify-around gap-6">
          <div className="flex-1 flex flex-col gap-2">
            <label className="block text-sm mb-1">
              Duration: {testDuration} seg
            </label>
            <input
                type="range"
                min="10"
                max="30"
                step="1"
                value={testDuration}
                onChange={(e) =>
                  setTestDuration(parseInt(e.target.value, 10))
                }
                className="w-full"
              />
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <label className="block text-sm mb-1">
              Freq<sub className='align-sub text-[0.6rem] uppercase'> cut-off</sub>: {cutoffFrequency.toFixed(1)} Hz
            </label>
            <input
                type="range"
                min="2"
                max="10"
                step="0.5"
                value={cutoffFrequency}
                onChange={(e) =>
                  setCutoffFrequency(parseFloat(e.target.value))
                }
                className="w-full"
              />
          </div>
        </div>
        <div className="flex justify-around gap-6">
          <div className="flex-1 flex flex-col gap-2">
            <label className="block text-sm mb-1">
              Freq<sub className='align-sub text-[0.6rem] uppercase'> dom</sub>: {calibrationDomFreqThreshold.toFixed(1)} Hz
            </label>
            <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={calibrationDomFreqThreshold}
                onChange={(e) =>
                  setCalibrationDomFreqThreshold(parseFloat(e.target.value))
                }
                className="w-full"
              />
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <label className="block text-sm mb-1">
              STD: {calibrationStdThreshold.toFixed(1)} m/s²
            </label>
            <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={calibrationStdThreshold}
                onChange={(e) =>
                  setCalibrationStdThreshold(parseFloat(e.target.value))
                }
                className="w-full"
              />
          </div>
        </div>
        <div className="flex justify-around gap-6">
          <div className="flex-1 flex flex-col gap-2">
            <label className="block text-sm mb-1">
              Hold: {(calibrationDelay / 1000)} seg
            </label>
            <input
                type="range"
                min="4"
                max="10"
                step="1"
                value={calibrationDelay / 1000}
                onChange={(e) =>
                  setCalibrationDelay(parseInt(e.target.value, 10) * 1000)
                }
                className="w-full"
              />
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <label className="block text-sm mb-1">
              Gravity<sub className='align-sub text-[0.6rem] uppercase'> factor</sub>: {gravityFactor.toFixed(2)}
            </label>
            <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={gravityFactor}
                onChange={(e) =>
                  setGravityFactor(parseFloat(e.target.value))
                }
                className="w-full"
              />
          </div>
        </div>
        <div className="flex justify-around gap-6 mt-4">
          <div className="flex-1 flex flex-col justify-end gap-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                value="" 
                className="sr-only peer" 
                checked={autoStartAfterCalibration}
                onChange={() => setAutoStartAfterCalibration(!autoStartAfterCalibration)}
                />
              <div
                className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-0 peer-focus:ring-[#5dadec]
                rounded-full peer dark:bg-gray-700 peer-checked:bg-[#5dadec] transition-all duration-200"
              ></div>
              <div
                className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow
                peer-checked:translate-x-full transform transition-all duration-200"
              ></div>
              <span className="text-white text-sm px-2">Auto-start after calibration</span>
            </label>
          </div>
        </div>
      </form>      
    </section>
  )
}

export default Index