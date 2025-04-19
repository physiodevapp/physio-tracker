"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';

interface TensorFlowProviderProps {
  children: React.ReactNode;
}

// Creamos el contexto con tipo booleano o null
const TensorFlowContext = createContext<boolean | null>(null);

export const TensorFlowProvider: React.FC<TensorFlowProviderProps> = ({ children }) => {
  const [isReady, setIsReady] = useState<boolean>(false);

  useEffect(() => {
    const initializeTensorFlow = async () => {
      try {
        await tf.setBackend('webgl'); // O 'wasm' según tu preferencia
        await tf.ready();
        // console.log('Tensorflow backend: ', tf.getBackend())
        setIsReady(true);
      } catch (error) {
        console.error("Error al inicializar TensorFlow:", error);
      }
    };

    if (typeof window !== 'undefined') {
      initializeTensorFlow();
    }
  }, []);

  return (
    <TensorFlowContext.Provider value={isReady}>
      {children}
    </TensorFlowContext.Provider>
  );
};

export const useTensorFlow = (): boolean => {
  const context = useContext(TensorFlowContext);
  if (context === null) {
    throw new Error("useTensorFlow debe usarse dentro de un TensorFlowProvider");
  }
  return context;
}
