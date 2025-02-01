import { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from "chart.js";
import { Keypoint } from "@/interfaces/pose";

// Registro de componentes de Chart.js
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface RealTimeGraphProps {
  joints: Keypoint[]; // Lista de articulaciones a mostrar
  valueType: "angle" | "velocity"; // Tipo de dato a mostrar
  getDataForJoint: (joint: Keypoint) => { timestamp: number; value: number } | null; // Función que proporciona datos para una articulación
  timeWindow?: number; // Ventana de tiempo en milisegundos (por defecto 10 segundos)
  parentStyles?: string; // Estilos CSS para el contenedor
  updateInterval?: number; // Intervalo de actualización en milisegundos (por defecto 500ms)
}

export const RealTimeGraph = ({
  joints,
  valueType,
  getDataForJoint,
  timeWindow = 10000, // Últimos 10 segundos
  parentStyles = "relative w-full flex flex-col items-center justify-center h-[50vh]",
  updateInterval = 500, // Valor por defecto 500 ms
}: RealTimeGraphProps) => {
  const [chartData, setChartData] = useState<{ [joint: string]: { labels: number[]; data: number[] } }>(
    {}
  );

  const transformJointName = (joint: string): string => {
    const words = joint.split('_');
    if (words.length === 0) return joint;
    // Capitaliza solo la primera palabra y pasa el resto a minúsculas
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
    for (let i = 1; i < words.length; i++) {
      words[i] = words[i].toLowerCase();
    }
    return words.join(' ');
  };

  useEffect(() => {
    console.log('joints in RealTimeGraph', joints);
    const interval = setInterval(() => {
      joints.forEach((joint) => {
        const newData = getDataForJoint(joint);

        if (newData) {
          setChartData((prev) => {
            const now = performance.now();

            // Filtrar datos antiguos fuera de la ventana de tiempo
            const previousData = prev[joint] || { labels: [], data: [] };
            const filteredLabels = previousData.labels.filter((timestamp) => now - timestamp <= timeWindow);
            const filteredData = previousData.data.slice(previousData.labels.length - filteredLabels.length);

            return {
              ...prev,
              [joint]: {
                labels: [...filteredLabels, newData.timestamp],
                data: [...filteredData, newData.value],
              },
            };
          });
        }
      });
    }, updateInterval); // Actualización cada 500ms

    return () => clearInterval(interval);
  }, [getDataForJoint, joints, timeWindow, updateInterval]);

  return (
    <div className={parentStyles}>
      <h2 className="text-xl font-bold mb-4">Real-Time Graph: {valueType === "angle" ? "Angle" : "Velocity"}</h2>
      <Line
        data={{
          labels: chartData[joints[0]]?.labels.map((timestamp) => ((timestamp - chartData[joints[0]].labels[0]) / 1000).toFixed(1)) || [],
          datasets: joints.map((joint, index) => ({
            label: `${transformJointName(joint)} ${valueType}`,
            data: chartData[joint]?.data || [],
            borderColor: `hsl(${(index * 60) % 360}, 70%, 50%)`, // Colores únicos por articulación
            backgroundColor: `hsla(${(index * 60) % 360}, 70%, 50%, 0.2)`,
            tension: 0.3,
          })),
        }}
        options={{
          responsive: true,
          plugins: {
            legend: {
              display: true,
              position: "top",
            },
          },
          scales: {
            x: {
              type: "linear",
              title: {
                display: true,
                text: "Time (seconds)",
              },
              ticks: {
                stepSize: 1,
                callback: (value) => Number(value).toFixed(0),
              },
            },
            y: {
              title: {
                display: true,
                text: valueType === "angle" ? "Angle (degrees)" : "Velocity (°/s or px/s)",
              },
              ticks: {
                callback: (value) => Number(value).toFixed(0), // <-- Cambio agregado aquí
              },
            },
          },
        }}
      />
    </div>
  );
}
