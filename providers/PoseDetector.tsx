"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import * as poseDetection from '@tensorflow-models/pose-detection';

// Definimos el tipo del detector
type DetectorType = poseDetection.PoseDetector | null;

// Creamos el contexto con un valor inicial nulo
const PoseDetectorContext = createContext<DetectorType>(null);

interface PoseDetectorProviderProps {
  isTfReady: boolean; // Indicador de que TensorFlow ya se inicializó
  children: React.ReactNode;
}

export const PoseDetectorProvider: React.FC<PoseDetectorProviderProps> = ({ isTfReady, children }) => {
  const [detector, setDetector] = useState<DetectorType>(null);

  useEffect(() => {
    // Si TensorFlow aún no está listo, no se inicializa el detector
    if (!isTfReady) return;

    const initializeDetector = async () => {
      try {
        // Si ya existe el detector, no se vuelve a crear
        if (detector) return;

        const detectorInstance = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          {
            modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
            minPoseScore: 0.3,
          }
        );
        setDetector(detectorInstance);
      } catch (error) {
        console.error("Error al inicializar el detector:", error);
      }
    };

    initializeDetector();
  }, [isTfReady, detector]);

  return (
    <PoseDetectorContext.Provider value={detector}>
      {children}
    </PoseDetectorContext.Provider>
  );
};

// Hook para usar el detector en cualquier componente
export const usePoseDetector = (): DetectorType => {
  const context = useContext(PoseDetectorContext);
  return context;
};
