"use client";

import { BalanceSettings } from "@/providers/Settings";
import { useState, useEffect } from "react";

export enum IDeviceOrientation {
  Portrait = "portrait",
  Landscape = "landscape",
}

export function useDeviceOrientation({settings, isActive}: {settings: BalanceSettings, isActive: boolean; }): {orientation: `${IDeviceOrientation}`} {
  const [orientation, setOrientation] = useState<IDeviceOrientation>(
    IDeviceOrientation.Portrait
  );

  const {
    gravity: GRAVITY,
    gravityFactor: GRAVITY_FACTOR,
  } = settings;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOrientation = (event: DeviceMotionEvent) => {
      if (!event.accelerationIncludingGravity || !event.acceleration) return;
      
      const GRAVITY_THRESHOLD = GRAVITY * GRAVITY_FACTOR; // Mínimo valor esperado en el eje correcto

      setOrientation(
        // Modo Landscape: La gravedad debe estar en X y ser positiva
        Math.abs(event.accelerationIncludingGravity.x! - event.acceleration.x!) > GRAVITY_THRESHOLD && 
        (event.accelerationIncludingGravity.x! - event.acceleration.x!)  > 0
        ? IDeviceOrientation.Landscape
        : IDeviceOrientation.Portrait
      );
    };

    if (isActive) {
      window.addEventListener("devicemotion", handleOrientation);
    } else {
      window.removeEventListener("devicemotion", handleOrientation);
    }

    return () => {
      window.removeEventListener("devicemotion", handleOrientation);
    };
  }, [isActive]);

  return { orientation };
}
