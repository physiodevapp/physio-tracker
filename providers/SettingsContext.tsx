"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';

// Definimos la interfaz del objeto settings
interface Settings {
  selectedJoints: string[];
  angularHistorySize: number;
  velocityHistorySize: number;
}

// Definimos la interfaz del contexto para incluir el estado y las funciones de actualización
interface SettingsContextProps {
  settings: Settings;
  setSelectedJoints: (joints: string[]) => void;
  setAngularHistorySize: (size: number) => void;
  setVelocityHistorySize: (size: number) => void;
}

// Creamos el contexto
const SettingsContext = createContext<SettingsContextProps | undefined>(undefined);

interface SettingsProviderProps {
  children: ReactNode;
}

// Implementamos el provider
export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>({
    selectedJoints: [],
    angularHistorySize: 1,
    velocityHistorySize: 1,
  });

  const setSelectedJoints = (joints: string[]) => {
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

  return (
    <SettingsContext.Provider
      value={{
        settings,
        setSelectedJoints,
        setAngularHistorySize,
        setVelocityHistorySize,
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
