"use client";

import { CanvasKeypointName } from '@/interfaces/pose';
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';

// Definimos interfaces para cada grupo de settings
interface PoseSettings {
  selectedJoints: CanvasKeypointName[];
  angularHistorySize: number;
  velocityHistorySize: number;
  poseTimeWindow: number;
  poseUpdateInterval: number;
  poseGraphSample: number;
  poseGraphSampleThreshold: number;
}

interface ColorSettings {
  redHueLower1: number;
  redHueUpper1: number;
  redHueLower2: number;
  redHueUpper2: number;
  greenHueLower: number;
  greenHueUpper: number;
  blueHueLower: number;
  blueHueUpper: number;
  minSaturation: number;
  minValue: number;
}

// Agregamos un nuevo grupo force con variables opcionales
interface ForceSettings {
  movingAverageWindow?: number;
  minAvgAmplitude?: number;
  maxAvgDuration?: number;
  forceDropThreshold?: number;
  cyclesToAverage?: number;
  hysteresis?: number;
}

interface Settings {
  pose: PoseSettings;
  color: ColorSettings;
  force: ForceSettings;
}

// Extendemos la interfaz del contexto para incluir setters para force
interface SettingsContextProps {
  settings: Settings;
  // Setters para pose
  setSelectedJoints: (joints: CanvasKeypointName[]) => void;
  setAngularHistorySize: (size: number) => void;
  setVelocityHistorySize: (size: number) => void;
  setPoseTimeWindow: (timeInSeconds: number) => void;
  setPoseUpdateInterval: (timeInMiliseconds: number) => void;
  setPoseGraphSample: (sample: number) => void;
  setPoseGraphSampleThreshold: (sampleThreshold: number) => void;
  // Setters para color
  setRedHueLower1: (value: number) => void;
  setRedHueUpper1: (value: number) => void;
  setRedHueLower2: (value: number) => void;
  setRedHueUpper2: (value: number) => void;
  setGreenHueLower: (value: number) => void;
  setGreenHueUpper: (value: number) => void;
  setBlueHueLower: (value: number) => void;
  setBlueHueUpper: (value: number) => void;
  setMinSaturation: (value: number) => void;
  setMinValue: (value: number) => void;
  // Setters para force (todos opcionales)
  setMovingAverageWindow: (value: number) => void;
  setMinAvgAmplitude: (value: number) => void;
  setMaxAvgDuration: (value: number) => void;
  setForceDropThreshold: (value: number) => void;
  setCyclesToAverage: (value: number) => void;
  setHysteresis: (value: number) => void;
  // Función para resetear los settings
  resetForceSettings: () => void;
  resetColorSettings: () => void;
}

const SettingsContext = createContext<SettingsContextProps | undefined>(undefined);

interface SettingsProviderProps {
  children: ReactNode;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const defaultConfig: Settings = {
    pose: {
      selectedJoints: [],
      angularHistorySize: 5,
      velocityHistorySize: 10,
      poseTimeWindow: 10,
      poseUpdateInterval: 300,
      poseGraphSample: 50,
      poseGraphSampleThreshold: 60,
    },
    color: {
      redHueLower1: 0,
      redHueUpper1: 10,
      redHueLower2: 170,
      redHueUpper2: 180,
      greenHueLower: 36,
      greenHueUpper: 89,
      blueHueLower: 90,
      blueHueUpper: 128,
      minSaturation: 70,
      minValue: 50,
    },
    force: {
      // Valores por defecto para force (puedes modificarlos según necesites)
      movingAverageWindow: 3_000,   // 3 segundos por defecto (en ms)
      minAvgAmplitude: 0.5,         // Ejemplo: 0.5 kg
      maxAvgDuration: 2_000,        // Ejemplo: 2000 ms
      forceDropThreshold: 0.7,      // 70%
      cyclesToAverage: 3,           // Promediar los últimos 3 ciclos
      hysteresis: 0.1,              // Factor de histéresis por defecto
    },
  };

  const [settings, setSettings] = useState<Settings>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("settings");
      return stored ? JSON.parse(stored) : defaultConfig;
    }
    return defaultConfig;
  });

  // Setters para pose
  const setSelectedJoints = (joints: CanvasKeypointName[]) => {
    setSettings(prev => ({ ...prev, pose: { ...prev.pose, selectedJoints: joints } }));
  };

  const setAngularHistorySize = (size: number) => {
    if (size >= 1 && size <= 20) {
      setSettings(prev => ({ ...prev, pose: { ...prev.pose, angularHistorySize: size } }));
    }
  };

  const setVelocityHistorySize = (size: number) => {
    if (size >= 1 && size <= 20) {
      setSettings(prev => ({ ...prev, pose: { ...prev.pose, velocityHistorySize: size } }));
    }
  };

  const setPoseTimeWindow = (timeInSeconds: number) => {
    setSettings(prev => ({ ...prev, pose: { ...prev.pose, poseTimeWindow: timeInSeconds } }));
  };

  const setPoseUpdateInterval = (timeInMiliseconds: number) => {
    setSettings(prev => ({ ...prev, pose: { ...prev.pose, poseUpdateInterval: timeInMiliseconds } }));
  };

  const setPoseGraphSample = (sample: number) => {
    setSettings(prev => ({ ...prev, pose: { ...prev.pose, poseGraphSample: sample } }));
  };

  const setPoseGraphSampleThreshold = (sampleThreshold: number) => {
    setSettings(prev => ({ ...prev, pose: { ...prev.pose, poseGraphSampleThreshold: sampleThreshold } }));
  };

  // Setters para color
  const setRedHueLower1 = (value: number) => setSettings(prev => ({ ...prev, color: { ...prev.color, redHueLower1: value } }));
  const setRedHueUpper1 = (value: number) => setSettings(prev => ({ ...prev, color: { ...prev.color, redHueUpper1: value } }));
  const setRedHueLower2 = (value: number) => setSettings(prev => ({ ...prev, color: { ...prev.color, redHueLower2: value } }));
  const setRedHueUpper2 = (value: number) => setSettings(prev => ({ ...prev, color: { ...prev.color, redHueUpper2: value } }));
  const setGreenHueLower = (value: number) => setSettings(prev => ({ ...prev, color: { ...prev.color, greenHueLower: value } }));
  const setGreenHueUpper = (value: number) => setSettings(prev => ({ ...prev, color: { ...prev.color, greenHueUpper: value } }));
  const setBlueHueLower = (value: number) => setSettings(prev => ({ ...prev, color: { ...prev.color, blueHueLower: value } }));
  const setBlueHueUpper = (value: number) => setSettings(prev => ({ ...prev, color: { ...prev.color, blueHueUpper: value } }));
  const setMinSaturation = (value: number) => setSettings(prev => ({ ...prev, color: { ...prev.color, minSaturation: value } }));
  const setMinValue = (value: number) => setSettings(prev => ({ ...prev, color: { ...prev.color, minValue: value } }));
  const resetColorSettings = () => {
    setSettings(prev => ({ ...prev, color: defaultConfig.color }));
  };

  // Setters para force
  const setMovingAverageWindow = (value: number) =>
    setSettings(prev => ({ ...prev, force: { ...prev.force, movingAverageWindow: value } }));
  const setMinAvgAmplitude = (value: number) =>
    setSettings(prev => ({ ...prev, force: { ...prev.force, minAvgAmplitude: value } }));
  const setMaxAvgDuration = (value: number) =>
    setSettings(prev => ({ ...prev, force: { ...prev.force, maxAvgDuration: value } }));
  const setForceDropThreshold = (value: number) =>
    setSettings(prev => ({ ...prev, force: { ...prev.force, forceDropThreshold: value } }));
  const setCyclesToAverage = (value: number) =>
    setSettings(prev => ({ ...prev, force: { ...prev.force, cyclesToAverage: value } }));
  const setHysteresis = (value: number) =>
    setSettings(prev => ({ ...prev, force: { ...prev.force, hysteresis: value } }));
  const resetForceSettings = () => {
    setSettings(prev => ({ ...prev, force: defaultConfig.force }));
  };

  useEffect(() => {
    localStorage.setItem("settings", JSON.stringify(settings));
  }, [settings]);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        setSelectedJoints,
        setAngularHistorySize,
        setVelocityHistorySize,
        setPoseTimeWindow,
        setPoseUpdateInterval,
        setPoseGraphSample,
        setPoseGraphSampleThreshold,
        setRedHueLower1,
        setRedHueUpper1,
        setRedHueLower2,
        setRedHueUpper2,
        setGreenHueLower,
        setGreenHueUpper,
        setBlueHueLower,
        setBlueHueUpper,
        setMinSaturation,
        setMinValue,
        resetColorSettings,
        setMovingAverageWindow,
        setMinAvgAmplitude,
        setMaxAvgDuration,
        setForceDropThreshold,
        setCyclesToAverage,
        setHysteresis,
        resetForceSettings
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

// Hook personalizado para usar el contexto
export const useSettings = (): SettingsContextProps => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
