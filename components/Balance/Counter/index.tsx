"use client";

// import { useSettings } from "@/providers/Settings";
import React, { useState, useEffect } from "react";

interface IndexProps {
  seconds: number;
  start: boolean;
  endTrigger: () => void;
  size?: number;                   // Tamaño en píxeles. Si no se especifica, se usa un valor por defecto.
  thickness?: number;             // Grosor del anillo. Valor por defecto: 8.
  backgroundThickness?: number;   // Grosor del anillo de fondo. Si no se especifica, se usa thickness.
  color?: string;
  backgroundColor?: string;
  text?: string;
}

const Index = ({ 
  seconds,
  start = true,
  endTrigger,
  size = 100, 
  thickness = 8, 
  backgroundThickness, 
  color = "limegreen", 
  backgroundColor = "#444",
  text,
}: IndexProps) => {
  // const { settings } = useSettings();
  
  const [timeLeft, setTimeLeft] = useState(seconds);

  // Si no se especifica backgroundThickness, se utiliza thickness.
  const bgThickness = backgroundThickness !== undefined ? backgroundThickness : thickness;

  useEffect(() => {
    if (!start) return;

    setTimeLeft(seconds); // Reset al cambiar la duración

    if (seconds <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft((prev: number) => {
        if (prev <= 1) {
          clearInterval(interval);
          endTrigger(); // Llamar a la función cuando el tiempo llegue a 0 ms
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [seconds, start]);

  // Para centrar ambos círculos, usamos el mayor de los dos grosores.
  const center = size / 2;
  const maxThickness = Math.max(thickness, bgThickness);
  const radius = center - maxThickness / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = (timeLeft / seconds) * 100;
  const strokeDashoffset = circumference * (1 - progress / 100);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={`${!start ? 'animate-pulse' : ''}`}>
        {/* Círculo de fondo */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          stroke={backgroundColor}
          strokeWidth={bgThickness}
          fill="transparent"
          />
        {/* Círculo de progreso, rotado -90° para iniciar en la parte superior */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
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
      <div className="absolute flex flex-row flex-wrap justify-center">
        <p className={`flex-1 basis-full text-center text-6xl font-bold ${start ? 'animate-pulse' : ''}`}>{timeLeft} s</p>
        {text && (
          <p className={`flex-1 basis-full text-center text-2xl ${!start ? 'animate-pulse' : ''}`}>{text}</p>
        )}
      </div>
    </div>
  );
};

export default Index;
