"use client";

import React from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ScriptableContext,
} from "chart.js";

// Registrar los componentes necesarios de Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface Acceleration {
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

interface Gyroscope {
  alpha: number;
  beta: number;
  gamma: number;
  timestamp: number;
}

interface BalanceChartProps {
  accelData: Acceleration[];
  gyroData: Gyroscope[];
}

/**
 * Función auxiliar para interpolar el canal alfa entre startAlpha y endAlpha según el ratio (0 a 1).
 * Se asume que el color base (RGB) es constante.
 */
const getInterpolatedColor = (
  ratio: number,
  startAlpha: number,
  endAlpha: number,
  r: number,
  g: number,
  b: number
): string => {
  const alpha = startAlpha + (endAlpha - startAlpha) * ratio;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const Index: React.FC<BalanceChartProps> = ({ accelData, gyroData }) => {
  // Asegurarse de que existen datos para generar las etiquetas y calcular los rangos
  if (accelData.length === 0 || gyroData.length === 0) {
    return <div>No hay datos suficientes</div>;
  }

  // Para los datasets basados en acelerómetro (primeros dos):
  const accelStartTime = accelData[0].timestamp;
  const accelEndTime = accelData[accelData.length - 1].timestamp;
  // Para el dataset basado en giroscopio:
  const gyroStartTime = gyroData[0].timestamp;
  const gyroEndTime = gyroData[gyroData.length - 1].timestamp;

  // Convertir los datos en objetos que contengan x, y y timestamp.
  // Usaremos como eje x el tiempo transcurrido en segundos desde el primer dato.
  const accelDataX = accelData.map((d) => ({
    x: ((d.timestamp - accelStartTime) / 1000).toFixed(1),
    y: d.x,
    timestamp: d.timestamp,
  }));
  const accelDataY = accelData.map((d) => ({
    x: ((d.timestamp - accelStartTime) / 1000).toFixed(1),
    y: d.y,
    timestamp: d.timestamp,
  }));
  const gyroDataBeta = gyroData.map((d) => ({
    x: ((d.timestamp - gyroStartTime) / 1000).toFixed(1),
    y: d.beta,
    timestamp: d.timestamp,
  }));

  // Las etiquetas se basan en el eje x de uno de los datasets (por ejemplo, accelDataX)
  const labels = accelDataX.map((d) => d.x);

  const data = {
    labels,
    datasets: [
      {
        label: "Lateral Sway (Accel X)",
        data: accelDataX,
        // Se usa una función scriptable para devolver un color en función del timestamp de cada punto.
        borderColor: (context: ScriptableContext<"line">) => {
          const point = context.raw as { timestamp: number };
          const ratio =
            (point.timestamp - accelStartTime) / (accelEndTime - accelStartTime);
          // Para este dataset se parte de rgba(75,192,192,0.5) hasta rgba(75,192,192,1)
          return getInterpolatedColor(ratio, 0.5, 1, 75, 192, 192);
        },
        borderWidth: 2,
        tension: 0.4,
        fill: false,
        pointBackgroundColor: "white",
      },
      {
        label: "Anterior-Posterior Sway (Accel Y)",
        data: accelDataY,
        borderColor: (context: ScriptableContext<"line">) => {
          const point = context.raw as { timestamp: number };
          const ratio =
            (point.timestamp - accelStartTime) / (accelEndTime - accelStartTime);
          // Para este dataset se parte de rgba(255,99,132,0.5) hasta rgba(255,99,132,1)
          return getInterpolatedColor(ratio, 0.5, 1, 255, 99, 132);
        },
        borderWidth: 2,
        tension: 0.4,
        fill: false,
        pointBackgroundColor: "white",
      },
      {
        label: "Rotational (Gyro Beta)",
        data: gyroDataBeta,
        borderColor: (context: ScriptableContext<"line">) => {
          const point = context.raw as { timestamp: number };
          const ratio =
            (point.timestamp - gyroStartTime) / (gyroEndTime - gyroStartTime);
          // Para este dataset se parte de rgba(54,162,235,0.5) hasta rgba(54,162,235,1)
          return getInterpolatedColor(ratio, 0.5, 1, 54, 162, 235);
        },
        borderWidth: 2,
        tension: 0.4,
        fill: false,
        pointBackgroundColor: "white",
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: "top" as const,
      },
      title: {
        display: true,
        text: "Balance Trace",
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: "Time (s)",
        },
      },
      y: {
        title: {
          display: true,
          text: "Value",
        },
      },
    },
  };

  return (
    <div className="p-4">
      <Line data={data} options={options} />
    </div>
  );
};

export default Index;
