"use client";

import { CanvasKeypointName } from '@/interfaces/pose';
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';

// Definimos la interfaz del objeto settings
interface Settings {
  selectedJoints: CanvasKeypointName[];
  angularHistorySize: number;
  velocityHistorySize: number;
  poseTimeWindow: number;
  poseUpdateInterval: number;
  poseGraphSample: number;
  poseGraphSampleThreshold: number;
}

// Definimos la interfaz del contexto para incluir el estado y las funciones de actualización
interface SettingsContextProps {
  settings: Settings;
  setSelectedJoints: (joints: CanvasKeypointName[]) => void;
  setAngularHistorySize: (size: number) => void;
  setVelocityHistorySize: (size: number) => void;
  setPoseTimeWindow: (timeInSeconds: number) => void;
  setPoseUpdateInterval: (timeInMiliseconds: number) => void;
  setPoseGraphSample: (sample: number) => void;
  setPoseGraphSampleThreshold: (sampleThreshold: number) => void;
}

// Creamos el contexto
const SettingsContext = createContext<SettingsContextProps | undefined>(undefined);

interface SettingsProviderProps {
  children: ReactNode;
}

// Implementamos el provider
export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const defaultConfig = { 
    selectedJoints: [], 
    angularHistorySize: 5, 
    velocityHistorySize: 10, 
    poseTimeWindow: 10, 
    poseUpdateInterval: 300,
    poseGraphSample: 50,
    poseGraphSampleThreshold: 60, 
  };

  const [settings, setSettings] = useState<Settings>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("poseSettings");

      return stored
        ? JSON.parse(stored)
        : defaultConfig;
    }
    
    return defaultConfig;
  });

  const setSelectedJoints = (joints: CanvasKeypointName[]) => {
    setSettings(prev => ({ ...prev, selectedJoints: joints }));
  };

  const setAngularHistorySize = (size: number) => {
    if (size >= 1 && size <= 20) {
      setSettings(prev => ({ ...prev, angularHistorySize: size }));
    }
  };

  const setVelocityHistorySize = (size: number) => {
    if (size >= 1 && size <= 20) {
      setSettings(prev => ({ ...prev, velocityHistorySize: size }));
    }
  };

  const setPoseTimeWindow = (timeInSeconds: number) => {
    setSettings(prev => ({...prev, poseTimeWindow: timeInSeconds}));
  }

  const setPoseUpdateInterval = (timeInMiliseconds: number) => {
    setSettings(prev => ({...prev, poseUpdateInterval: timeInMiliseconds}))
  }

  const setPoseGraphSample = (sample: number) => {
    setSettings(prev => ({...prev, poseGraphSample: sample}))
  }

  const setPoseGraphSampleThreshold = (sampleThreshold: number) => {
    setSettings(prev => ({...prev, poseGraphSampleThreshold: sampleThreshold}))
  }

  useEffect(() => {
    localStorage.setItem("poseSettings", JSON.stringify(settings));
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
        setPoseGraphSampleThreshold
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

// Hook personalizado para usar el contexto fácilmente
export const useSettings = (): SettingsContextProps => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
