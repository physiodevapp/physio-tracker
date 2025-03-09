"use client";

import { useState, useEffect } from "react";

export enum IDeviceOrientation {
  Portrait = "portrait",
  Landscape = "landscape",
}

export function useDeviceOrientation(): `${IDeviceOrientation}` {
  const [orientation, setOrientation] = useState<IDeviceOrientation>(
    IDeviceOrientation.Portrait
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (!event.gamma || !event.beta) return;

      setOrientation(
        Math.abs(event.gamma) > 40 &&
        event.gamma < 0 &&
        Math.abs(event.beta) < 20
        ? IDeviceOrientation.Landscape
        : IDeviceOrientation.Portrait
      );
    };

    window.addEventListener("deviceorientation", handleOrientation);

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, []);

  return orientation;
}
