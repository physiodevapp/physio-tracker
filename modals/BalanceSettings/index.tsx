"use client";

import { useSettings } from '@/providers/Settings';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import React from 'react'

const Index = () => {
  const {
    settings,
    setBalanceTestDuration,
    setBalanceBaselineCalibrationTime,
    setBalanceClassificationThresholds,
    setBalanceSamplingRate,
    setBalanceVibrationThreshold,
    setBalanceMaxOscillation,
    resetBalanceSettings
  } = useSettings();

  const handleChangeTestDuration = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTestDuration = parseInt(e.target.value, 10);
    setBalanceTestDuration(newTestDuration);
  
    // Si `testDuration` baja más que `baselineCalibrationTime`, ajustamos `baselineCalibrationTime`
    if (newTestDuration < settings.balance.baselineCalibrationTime) {
      setBalanceBaselineCalibrationTime(newTestDuration);
    }
  };
  
  const handleChangeBaselineCalibrationTime = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCalibrationTime = parseInt(e.target.value, 10);
    setBalanceBaselineCalibrationTime(newCalibrationTime);
  
    // Si `baselineCalibrationTime` sube más que `testDuration`, ajustamos `testDuration`
    if (newCalibrationTime > settings.balance.testDuration) {
      setBalanceTestDuration(newCalibrationTime);
    }
  };

  const handleChangeSampleRate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHz = parseInt(e.target.value, 10); // Obtenemos el valor en Hz
    setBalanceSamplingRate(1000 / newHz); // Convertimos Hz a ms antes de guardarlo
  }

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
      {/* Sliders para ajustar parámetros de detección */}
      <div className="mt-2 space-y-4 text-white">
        <div className='flex gap-2'>
          {/* Test duration */}
          <div className="flex-1">
            <label className="block text-sm">
              Test duration: {settings.balance.testDuration} s
            </label>
            <input
              type="range"
              min="10"
              max="30"
              value={settings.balance.testDuration}
              onChange={handleChangeTestDuration}
              className="w-full"
              />
          </div>
          {/* Intervalo de muestreo */}
          <div className="flex-1">
            <label className="block text-sm">
              Calibration time: {settings.balance.baselineCalibrationTime} s
            </label>
            <input
              type="range"
              min="3"
              max="5"
              step="1"
              value={settings.balance.baselineCalibrationTime}
              onChange={handleChangeBaselineCalibrationTime}
              className="w-full"
              />
          </div>
        </div>
        <div className='flex gap-2'>
          {/* Tasa de muestreo */}
          <div className="flex-1">
            <label className="block text-sm">
              Fr: {parseInt((1000 / settings.balance.samplingRate).toFixed(0))} Hz
            </label>
            <input
              type="range"
              min="10"   // Mínimo visible en la UI (10 Hz → 100 ms)
              max="100"  // Máximo visible en la UI (100 Hz → 10 ms)
              step="5"
              value={1000 / settings.balance.samplingRate} // Almacena internamente en ms, pero el slider muestra Hz
              onChange={handleChangeSampleRate}
              className="w-full"
            />
          </div>
          {/* Parámetros de oscilación */}
          <div className="flex-1">
            <label className="block text-sm">
              Osc: {settings.balance.maxOscillation}
            </label>
            <input
              type="range"
              min="0.1"
              max="0.5"
              step="0.05"
              value={settings.balance.maxOscillation}
              onChange={(e) => setBalanceMaxOscillation(parseFloat(e.target.value))}
              className="w-full"
              />
          </div>
          {/* Parámetros de vibración */}
          <div className="flex-1">
            <label className="block text-sm">
              Vib: {settings.balance.vibrationThreshold}
            </label>
            <input
              type="range"
              min="0.1"
              max="2"
              step="0.1"
              value={settings.balance.vibrationThreshold}
              onChange={(e) => setBalanceVibrationThreshold(parseFloat(e.target.value))}
              className="w-full"
              />
          </div>
        </div>
        {/* Umbrales de clasificación */}
        <div className='flex gap-2'>
          <div className="flex-1">
            <label className="block text-sm">
              Superb: {settings.balance.classificationThresholds.excellent}
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