"use client";

import React from "react";
import { TensorFlowProvider, useTensorFlow } from "@/providers/TensorFlow";
import { PoseDetectorProvider } from "@/providers/PoseDetector";
import { SettingsProvider } from "@/providers/Settings";
import { ThemeProvider } from "next-themes";
import { BluetoothProvider } from "@/providers/Bluetooth";
import { DeviceProvider } from "@/providers/Device";


// Este componente se encarga de consumir el estado de TensorFlow y envolver a los demás providers
const TensorFlowDetectorWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isTfReady = useTensorFlow();

  return (
    <PoseDetectorProvider isTfReady={isTfReady}>
      {children}
    </PoseDetectorProvider>
  );
};

// Ahora el ClientProvidersWrapper incluye al TensorFlowProvider y al TensorFlowDetectorWrapper
const ClientProvidersWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ThemeProvider attribute={"class"} defaultTheme="system" enableSystem>
      <DeviceProvider>
        <SettingsProvider>
          <BluetoothProvider>
            <TensorFlowProvider>
              <TensorFlowDetectorWrapper>
                {children}
              </TensorFlowDetectorWrapper>
            </TensorFlowProvider>
          </BluetoothProvider>
        </SettingsProvider>
      </DeviceProvider>
    </ThemeProvider>
  );
};

export default ClientProvidersWrapper;
