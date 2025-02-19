// contexts/OpenCvContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { CVModule } from '../global';

interface OpenCvContextType {
  cv: CVModule | null;
  loading: boolean;
  error: string | null;
}

const OpenCvContext = createContext<OpenCvContextType>({
  cv: null,
  loading: true,
  error: null,
});

export const OpenCvProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cvInstance, setCvInstance] = useState<CVModule | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Función para cargar opencv.js de forma asíncrona
  const loadOpenCv = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.cv) {
        resolve();
      } else {
        const script = document.createElement('script');
        script.src = 'https://docs.opencv.org/4.x/opencv.js';
        script.async = true;
        script.onload = () => {
          window.cv.onRuntimeInitialized = () => {
            resolve();
          };
        };
        script.onerror = () => reject('Error al cargar opencv.js');
        document.body.appendChild(script);
      }
    });
  };

  useEffect(() => {
    loadOpenCv()
      .then(() => {
        setCvInstance(window.cv as CVModule);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, []);

  return (
    <OpenCvContext.Provider value={{ cv: cvInstance, loading, error }}>
      {children}
    </OpenCvContext.Provider>
  );
};

export const useOpenCv = () => useContext(OpenCvContext);
