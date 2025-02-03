"use client";

import React from "react";
import { useTensorFlow } from "@/providers/TensorFlowContext";
import { PoseDetectorProvider } from "@/providers/PoseDetectorContext";

const ClientProvidersWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Ahora este hook se ejecuta en el cliente, ya que el componente está marcado como "use client"
  const isTfReady = useTensorFlow();

  return (
    <PoseDetectorProvider isTfReady={isTfReady}>
      {children}
    </PoseDetectorProvider>
  );
};

export default ClientProvidersWrapper;
