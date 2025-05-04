// providers/Device.tsx
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type DeviceSize = "mobile" | "tablet" | "laptop";

interface DeviceProviderProps {
  children: React.ReactNode;
}

const DeviceContext = createContext<DeviceSize | null>(null);

export const DeviceProvider: React.FC<DeviceProviderProps> = ({ children }) => {
  const [deviceSize, setDeviceSize] = useState<DeviceSize>("mobile");

  useEffect(() => {
    const checkDeviceSize = () => {
      const width = window.innerWidth;

      if (width < 640) {
        setDeviceSize("mobile");
      } else if (width >= 640 && width < 1024) {
        setDeviceSize("tablet");
      } else {
        setDeviceSize("laptop");
      }
    };

    if (typeof window !== "undefined") {
      checkDeviceSize();
      window.addEventListener("resize", checkDeviceSize);
      return () => window.removeEventListener("resize", checkDeviceSize);
    }
  }, []);

  return (
    <DeviceContext.Provider value={deviceSize}>
      {children}
    </DeviceContext.Provider>
  );
};

export const useDevice = (): DeviceSize => {
  const context = useContext(DeviceContext);
  if (context === null) {
    throw new Error("useDevice debe usarse dentro de un DeviceProvider");
  }
  return context;
};
