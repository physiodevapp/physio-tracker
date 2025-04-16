"use client";
import { BalanceSettings } from "@/providers/Settings";
import { useState, useEffect } from "react";

export default function useOrientationHandler({ isActive, settings }: {isActive: boolean; settings: BalanceSettings}): {orientation: "portrait" | "landscape"} {
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");

  const {
    gravity: GRAVITY,
    gravityFactor: GRAVITY_FACTOR,
  } = settings;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOrientation = (event: DeviceMotionEvent) => {
      if (!event.accelerationIncludingGravity || !event.acceleration) return;

      const GRAVITY_THRESHOLD = GRAVITY * GRAVITY_FACTOR; // Mínimo valor esperado en el eje correcto
      const gravity_X = event.accelerationIncludingGravity.x! - event.acceleration.x!
      // Modo Landscape: La gravedad debe estar en X y ser positiva
      const isLandscape = Math.abs(gravity_X) > GRAVITY_THRESHOLD && gravity_X > 0;

      setOrientation(isLandscape ? "landscape" : "portrait");
    };

    if (isActive) {
      window.addEventListener("devicemotion", handleOrientation);
    } else {
      window.removeEventListener("devicemotion", handleOrientation);
    }

    return () => {
      window.removeEventListener("devicemotion", handleOrientation);
    };
  }, [isActive]); // Se ejecuta cuando `isActive` cambia

  return { orientation };
}
