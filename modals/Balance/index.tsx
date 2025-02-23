"use client";

import { useSettings } from '@/providers/Settings';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import React from 'react'

const Index = () => {
  const {
      settings,
      setBalanceTestDuration,
      setBalanceAccelerometerWeight,
      setBalanceClassificationThresholds,
      setBalanceSampleWindow,
      setBalanceSmoothingWindow,
      resetBalanceSettings
    } = useSettings();

  return (
    <section
      data-element="non-swipeable"
      className="absolute bottom-0 w-full h-[40vh] bg-gradient-to-b from-black/40 to-black rounded-t-lg p-4"
      >
      <div
        className="w-full h-9 flex justify-end text-white/60 italic font-light cursor-pointer"
        onClick={resetBalanceSettings}
        >
        Set default values{" "}
        <ArrowPathIcon className="ml-2 w-6 h-6" />
      </div>
      {/* Sliders para ajustar parámetros de detección */}
      <div className="mt-2 space-y-2 text-white">
        <div className='flex gap-2'>
          {/* Test duration */}
          <div className="flex-1">
            <label className="block text-sm">
              Test duration: {settings.balance.testDuration} s
            </label>
            <input
              type="range"
              min="1"
              max="30"
              value={settings.balance.testDuration}
              onChange={(e) =>
                setBalanceTestDuration(parseInt(e.target.value, 10))
              }
              className="w-full"
              />
          </div>
          {/* Intervalo de muestreo */}
          <div className="flex-1">
            <label className="block text-sm">
              Window: {(settings.balance.sampleWindow / 1000).toFixed(1)} s
            </label>
            <input
              type="range"
              min="500"
              max="5000"
              step="100"
              value={settings.balance.sampleWindow}
              onChange={(e) => setBalanceSampleWindow(parseInt(e.target.value, 10))}
              className="w-full"
              />
          </div>
        </div>
        <div className='flex gap-2'>
          {/* Pesos para Sensores */}
          <div className="flex-1">
            <label className="block text-sm">
              <span className='overline'>a</span><span className='align-sub uppercase text-[0.6rem]'> weight</span>: {settings.balance.sensorWeights.accelerometer.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.balance.sensorWeights.accelerometer}
              onChange={(e) => setBalanceAccelerometerWeight(parseFloat(e.target.value))}
              className="w-full"
              />
          </div>
          {/* Parámetros de Suavizado */}
          <div className="flex-1">
            <label className="block text-sm">
              Smoothing<span className='align-sub uppercase text-[0.6rem]'> </span>: {settings.balance.smoothingWindow} samples
            </label>
            <input
              type="range"
              min="1"
              max="20"
              value={settings.balance.smoothingWindow}
              onChange={(e) => setBalanceSmoothingWindow(parseInt(e.target.value, 10))}
              className="w-full"
              />
          </div>
        </div>
        {/* Umbrales de clasificación */}
        <div className='flex gap-2'>
          <div className="flex-1">
            <label className="block text-sm">
              Excellent: {settings.balance.classificationThresholds.excellent}
            </label>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={settings.balance.classificationThresholds.excellent}
              onChange={(e) =>
                setBalanceClassificationThresholds({
                  ...settings.balance.classificationThresholds,
                  excellent: parseFloat(e.target.value),
                })
              }
              className="w-full"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm">
              Good: {settings.balance.classificationThresholds.good}
            </label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={settings.balance.classificationThresholds.good}
              onChange={(e) =>
                setBalanceClassificationThresholds({
                  ...settings.balance.classificationThresholds,
                  good: parseFloat(e.target.value),
                })
              }
              className="w-full"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm">
              Fair: {settings.balance.classificationThresholds.fair}
            </label>
            <input
              type="range"
              min="1"
              max="3"
              step="0.1"
              value={settings.balance.classificationThresholds.fair}
              onChange={(e) =>
                setBalanceClassificationThresholds({
                  ...settings.balance.classificationThresholds,
                  fair: parseFloat(e.target.value),
                })
              }
              className="w-full"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

export default Index