"use client";

import { useSettings } from "@/providers/Settings";
import React, { useState, useEffect } from "react";

interface IndexProps {
  size?: number; // Tamaño en píxeles. Si no se especifica, se usa un valor por defecto.
  thickness?: number;  // Grosor del anillo. Valor por defecto: 8.
  backgroundThickness?: number; // Grosor del anillo de fondo. Si no se especifica, se usa thickness.
}

const Index = ({ size = 100, thickness = 8, backgroundThickness }: IndexProps) => {
  const { settings } = useSettings();
  const totalDuration = settings.balance.testDuration;
  
  const [timeLeft, setTimeLeft] = useState(totalDuration);

  // Si no se especifica backgroundThickness, se utiliza thickness.
  const bgThickness = backgroundThickness !== undefined ? backgroundThickness : thickness;

  useEffect(() => {
    setTimeLeft(totalDuration); // Reset al cambiar la duración

    if (totalDuration <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft((prev: number) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [totalDuration]);

  // Para centrar ambos círculos, usamos el mayor de los dos grosores.
  const center = size / 2;
  const maxThickness = Math.max(thickness, bgThickness);
  const radius = center - maxThickness / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = (timeLeft / totalDuration) * 100;
  const strokeDashoffset = circumference * (1 - progress / 100);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Círculo de fondo */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          stroke="#444"
          strokeWidth={bgThickness}
          fill="transparent"
        />
        {/* Círculo de progreso, rotado -90° para iniciar en la parte superior */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          stroke="limegreen"
          strokeWidth={thickness}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      {/* Tiempo restante en el centro */}
      <span className="absolute text-6xl font-bold text-white animate-pulse">
        {timeLeft} s
      </span>
    </div>
  );
};

export default Index;
