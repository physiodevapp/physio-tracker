"use client";

import { CanvasKeypointName } from '@/interfaces/pose';
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import * as poseDetection from '@tensorflow-models/pose-detection';

// Definimos interfaces para cada grupo de settings
interface PoseSettings {
  selectedJoints: CanvasKeypointName[];
  angularHistorySize: number;
  higherFrequency: boolean;
  poseModel: poseDetection.SupportedModels;
  poseInitDelayMs: number;
  videoEndThresholdSec: number;
  poseModelLatency: number;
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
  minVisibleAreaFactor: number;
}

// Agregamos un nuevo grupo force con variables opcionales
export interface ForceSettings {
  movingAverageWindow: number;
  minAvgAmplitude: number;
  peakDropThreshold: number;
  cyclesToAverage: number;
  cyclesForAnalysis: number;
  hysteresis: number;
  durationChangeThreshold: number;
  velocityDropThreshold: number;
  variabilityThreshold: number;
  outlierSensitivity: number;
}

// Interfaz para BalanceSettings
export interface BalanceSettings {
  calibrationDelay: number;
  calibrationPoints: number;
  calibrationStdThreshold: number;
  calibrationDomFreqThreshold: number;
  requiredCalibrationAttempts: number;
  gravity: number;
  gravityFactor: number;
  cutoffFrequency: number;
  testDuration: number;
  sensorHeight: number;
  autoStartAfterCalibration: boolean;
}

interface Settings {
  pose: PoseSettings;
  color: ColorSettings;
  force: ForceSettings;
  balance: BalanceSettings;
}

// Extendemos la interfaz del contexto para incluir setters para force
interface SettingsContextProps {
  settings: Settings;
  // Setters para pose
  setSelectedJoints: (joints: CanvasKeypointName[]) => void;
  setAngularHistorySize: (size: number) => void;
  setHigherFrequency: (value: boolean) => void;
  setPoseModel: (value: poseDetection.SupportedModels) => void;
  setPoseInitDelayMs: (value: number) => void;
  setVideoEndThresholdSec: (value: number) => void;
  setPoseModelLatency: (value: number) => void;
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
  setMinVisibleAreaFactor: (value: number) => void;
  // Setters para force (todos opcionales)
  setMovingAverageWindow: (value: number) => void;
  setMinAvgAmplitude: (value: number) => void;
  setPeakDropThreshold: (value: number) => void;
  setCyclesToAverage: (value: number) => void;
  setCyclesForAnalysis: (value: number) => void;
  setHysteresis: (value: number) => void;
  setDurationChangeThreshold: (value: number) => void;
  setVelocityDropThreshold: (value: number) => void;
  setVariabilityThreshold: (value: number) => void;
  setOutlierSensitivity: (value: number) => void;
  // Setters para balance
  setCalibrationDelay: (value: number) => void;
  setCalibrationPoints: (value: number) => void;
  setCalibrationStdThreshold: (value: number) => void;
  setCalibrationDomFreqThreshold: (value: number) => void;
  setRequiredCalibrationAttempts: (value: number) => void;
  setGravity: (value: number) => void;
  setGravityFactor: (value: number) => void;
  setCutoffFrequency: (value: number) => void;
  setTestDuration: (value: number) => void;
  setSensorHeight: (value: number) => void;
  setAutoStartAfterCalibration: (value: boolean) => void;
  // Función para resetear los settings
  resetPoseSettings: () => void;
  resetForceSettings: () => void;
  resetColorSettings: () => void;
  resetBalanceSettings: () => void;
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
      higherFrequency: false,
      poseModel: poseDetection.SupportedModels.MoveNet,
      poseInitDelayMs: 500,
      videoEndThresholdSec: 0.05,
      poseModelLatency: 0.20,
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
      minVisibleAreaFactor: 0.8,
    },
    force: {
      movingAverageWindow: 3_000,       // 3 segundos por defecto (en ms)
      minAvgAmplitude: 0.5,             // Ejemplo: 0.5 kg
      peakDropThreshold: 0.7,           // 70%
      cyclesToAverage: 3,               // Promediar los últimos 3 ciclos
      cyclesForAnalysis: 6,
      hysteresis: 0.1,                  // Factor de histéresis por defecto
      durationChangeThreshold: 0.05,
      velocityDropThreshold: 0.75,
      variabilityThreshold: 0.04,
      outlierSensitivity: 2,
    },
    balance: {
      calibrationDelay: 6_000,          // en milisegundos
      calibrationPoints: 200,
      calibrationStdThreshold: 1.0,
      calibrationDomFreqThreshold: 2.0, // en Hz
      requiredCalibrationAttempts: 2,
      gravity: 9.81, 
      gravityFactor: 0.8,
      cutoffFrequency: 5,               // en Hz
      testDuration: 15,                 // en segundos
      sensorHeight: 110,                // en cm
      autoStartAfterCalibration: true,
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
  const setHigherFrequency = (value: boolean) => {
    setSettings(prev => ({ ...prev, pose: { ...prev.pose, higherFrequency: value } }));
  };
  const setPoseModel = (value: poseDetection.SupportedModels) => {
    setSettings(prev => ({ ...prev, pose: { ...prev.pose, poseModel: value } }));
  };
  const setPoseInitDelayMs = (value: number) => {
    setSettings(prev => ({ ...prev, pose: { ...prev.pose, poseInitDelayMs: value } }));
  };
  const setVideoEndThresholdSec = (value: number) => {
    setSettings(prev => ({ ...prev, pose: { ...prev.pose, videoEndThresholdSec: value } }));
  };
  const setPoseModelLatency = (value: number) => {
    setSettings(prev => ({ ...prev, pose: { ...prev.pose, poseModelLatency: value } }));
  };
  const resetPoseSettings = () => {
    setSettings(prev => ({
      ...prev,
      pose: {
        ...defaultConfig.pose,
        selectedJoints: prev.pose.selectedJoints,
      },
    }));
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
  const setMinVisibleAreaFactor = (value: number) => setSettings(prev => ({ ...prev, color: { ...prev.color, minVisibleAreaFactor: value } }));
  const resetColorSettings = () => {
    setSettings(prev => ({ ...prev, color: defaultConfig.color }));
  };

  // Setters para force
  const setMovingAverageWindow = (value: number) =>
    setSettings(prev => ({ ...prev, force: { ...prev.force, movingAverageWindow: value } }));
  const setMinAvgAmplitude = (value: number) =>
    setSettings(prev => ({ ...prev, force: { ...prev.force, minAvgAmplitude: value } }));
  const setPeakDropThreshold = (value: number) =>
    setSettings(prev => ({ ...prev, force: { ...prev.force, peakDropThreshold: value } }));
  const setCyclesToAverage = (value: number) =>
    setSettings(prev => ({ ...prev, force: { ...prev.force, cyclesToAverage: value } }));
  const setCyclesForAnalysis = (value: number) =>
    setSettings(prev => ({ ...prev, force: { ...prev.force, cyclesForAnalysis: value } }));
  const setHysteresis = (value: number) =>
    setSettings(prev => ({ ...prev, force: { ...prev.force, hysteresis: value } }));
  const setDurationChangeThreshold = (value: number) =>
    setSettings(prev => ({ ...prev, force: { ...prev.force, durationChangeThreshold: value } }));
  const setVelocityDropThreshold = (value: number) =>
    setSettings(prev => ({ ...prev, force: { ...prev.force, velocityDropThreshold: value } }));
  const setVariabilityThreshold = (value: number) =>
    setSettings(prev => ({ ...prev, force: { ...prev.force, variabilityThreshold: value } }));
  const setOutlierSensitivity = (value: number) =>
    setSettings(prev => ({ ...prev, force: { ...prev.force, outlierSensitivity: value } }));
  const resetForceSettings = () => {
    setSettings(prev => ({ ...prev, force: defaultConfig.force }));
  };  

  // Setter para balance
  const setCalibrationDelay = (value: number) => setSettings(prev => ({ ...prev, balance: { ...prev.balance, calibrationDelay: value } }));
  const setCalibrationPoints = (value: number) => setSettings(prev => ({ ...prev, balance: { ...prev.balance, calibrationPoints: value } }));
  const setCalibrationStdThreshold = (value: number) => setSettings(prev => ({ ...prev, balance: { ...prev.balance, calibrationStdThreshold: value } }));
  const setCalibrationDomFreqThreshold = (value: number) => setSettings(prev => ({ ...prev, balance: { ...prev.balance, calibrationDomFreqThreshold: value } }));
  const setRequiredCalibrationAttempts = (value: number) => setSettings(prev => ({ ...prev, balance: { ...prev.balance, requiredCalibrationAttempts: value } }));
  const setGravity = (value: number) => setSettings(prev => ({ ...prev, balance: { ...prev.balance, gravity: value } }));
  const setGravityFactor = (value: number) => setSettings(prev => ({ ...prev, balance: { ...prev.balance, gravityFactor: value } }));
  const setCutoffFrequency = (value: number) => setSettings(prev => ({ ...prev, balance: { ...prev.balance, cutoffFrequency: value } }));
  const setTestDuration = (value: number) => setSettings(prev => ({ ...prev, balance: { ...prev.balance, testDuration: value } }));
  const setSensorHeight = (value: number) => setSettings(prev => ({ ...prev, balance: { ...prev.balance, sensorHeight: value } }));
  const setAutoStartAfterCalibration = (value: boolean) => setSettings(prev => ({ ...prev, balance: { ...prev.balance, autoStartAfterCalibration: value } }));
  const resetBalanceSettings = () => {
    setSettings(prev => ({ 
      ...prev, 
      balance: {
        ...defaultConfig.balance,
        sensorHeight: prev.balance.sensorHeight,
      } 
    }));
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
        setHigherFrequency,
        setPoseModel,
        setPoseInitDelayMs,
        setVideoEndThresholdSec,
        setPoseModelLatency,
        resetPoseSettings,
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
        setMinVisibleAreaFactor,
        resetColorSettings,
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
        setCalibrationDelay,
        setCalibrationPoints,
        setCalibrationStdThreshold,
        setCalibrationDomFreqThreshold,
        setRequiredCalibrationAttempts,
        setGravity,
        setGravityFactor,
        setCutoffFrequency,
        setTestDuration,
        setSensorHeight,
        setAutoStartAfterCalibration,
        resetBalanceSettings
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
