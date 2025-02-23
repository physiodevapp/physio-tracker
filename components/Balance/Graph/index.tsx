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
  LegendItem
} from "chart.js";
import { getInterpolatedColor } from "@/services/chart";

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

interface CustomDataset {
  label?: string;
  legendColor?: string;
  // Puedes agregar otras propiedades si las necesitas
}

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
        label: "ML Sway",
        data: accelDataX,
        legendColor: "rgba(75,192,192,1)",
        // Se usa una función scriptable para devolver un color en función del timestamp de cada punto.
        borderColor: (context: ScriptableContext<"line">) => {
          const point = context.raw as { timestamp: number };
          if (point && point.timestamp !== undefined) {
            const ratio = (point.timestamp - accelStartTime) / (accelEndTime - accelStartTime);
            return getInterpolatedColor(ratio, 0.5, 1, 75, 192, 192);
          }
          // Para este dataset se parte de rgba(75,192,192,0.5) hasta rgba(75,192,192,1)
          return "rgba(75,192,192,1)";
        },
        borderWidth: 2,
        tension: 0.4,
        fill: false,
        pointBackgroundColor: "white",
      },
      {
        label: "AP Sway",
        data: accelDataY,
        legendColor: "rgba(255,99,132,1)",
        borderColor: (context: ScriptableContext<"line">) => {
          const point = context.raw as { timestamp: number };
          if (point && point.timestamp !== undefined) {
            const ratio = (point.timestamp - accelStartTime) / (accelEndTime - accelStartTime);
            return getInterpolatedColor(ratio, 0.5, 1, 255, 99, 132);
          }
          // Para este dataset se parte de rgba(255,99,132,0.5) hasta rgba(255,99,132,1)
          return "rgba(255,99,132,1)"
        },
        borderWidth: 2,
        tension: 0.4,
        fill: false,
        pointBackgroundColor: "white",
      },
      {
        label: "Pitch",
        data: gyroDataBeta,
        legendColor: "rgba(54,162,235,1)",
        borderColor: (context: ScriptableContext<"line">) => {
          const point = context.raw as { timestamp: number };
          if (point && point.timestamp !== undefined) {
            const ratio = (point.timestamp - gyroStartTime) / (gyroEndTime - gyroStartTime);
            return getInterpolatedColor(ratio, 0.5, 1, 54, 162, 235);
          }
          // Para este dataset se parte de rgba(54,162,235,0.5) hasta rgba(54,162,235,1)
          return "rgba(54,162,235,1)";
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
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
        labels: {
          usePointStyle: true, 
          pointStyle: 'circle',
          generateLabels: (chart: ChartJS): LegendItem[] => {
            const datasets = chart.data.datasets as CustomDataset[] || [];
            return datasets.map((dataset: CustomDataset, i: number) => ({
              text: dataset.label ?? "",
              fillStyle: dataset.legendColor,
              hidden: !chart.isDatasetVisible(i),
              datasetIndex: i, // Usar datasetIndex en vez de index
              strokeStyle: "transparent",
              lineWidth: 0,
            }));
          },
        }
      },
      title: {
        display: false,
        text: "Balance Trace",
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: "Frontal",
        },
        type: "linear",
        suggestedMin: -1,
        suggestedMax: 1,
      },
      y: {
        title: {
          display: true,
          text: "Sagital",
        },
        suggestedMin: -1,
        suggestedMax: 1,
      },
    },
  };

  return (
    <>
      <Line data={data} options={options} className="bg-white" />
    </>
  );
};

export default Index;
