import { useEffect, useState } from "react";
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
} from "chart.js";
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
  maxPoints?: number; // Número máximo de puntos a mostrar en el gráfico (por defecto 50)
}

export const RealTimeGraph = ({
  joints,
  valueType,
  getDataForJoint,
  timeWindow = 10000, // Últimos 10 segundos
  parentStyles = "relative w-full flex flex-col items-center justify-center h-[50vh]",
  updateInterval = 500, // Valor por defecto 500 ms
  maxPoints = 50, // Valor por defecto 50
}: RealTimeGraphProps) => {
  const [chartData, setChartData] = useState<{ [joint: string]: { labels: number[]; data: number[] } }>({});

  const transformJointName = (joint: string): string => {
    const words = joint.split('_');
    if (words.length === 0) return joint;
    // Capitaliza la primera palabra y pasa el resto a minúsculas
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
    for (let i = 1; i < words.length; i++) {
      words[i] = words[i].toLowerCase();
    }
    return words.join(' ');
  };

  useEffect(() => {
    let lastUpdate = performance.now();
    let animationFrameId: number;

    const update = () => {
      const now = performance.now();
      
      if (now - lastUpdate >= updateInterval) {
        joints.forEach((joint) => {
          const newData = getDataForJoint(joint);

          if (newData) {
            setChartData((prev) => {
              const currentTime = performance.now();
              const previousData = prev[joint] || { labels: [], data: [] };

              // Filtrar los datos antiguos fuera de la ventana de tiempo
              const filteredLabels = previousData.labels.filter((timestamp) => currentTime - timestamp <= timeWindow);
              const filteredData = previousData.data.slice(previousData.labels.length - filteredLabels.length);

              // Agregar el nuevo dato
              let newLabels = [...filteredLabels, newData.timestamp];
              let newValues = [...filteredData, newData.value];

              // Si se excede el máximo, hacer downsampling tomando cada nth punto
              if (newLabels.length > maxPoints) {
                const step = Math.ceil(newLabels.length / maxPoints);
                newLabels = newLabels.filter((_, i) => i % step === 0);
                newValues = newValues.filter((_, i) => i % step === 0);
              }

              return {
                ...prev,
                [joint]: {
                  labels: newLabels,
                  data: newValues,
                },
              };
            });
          }
        });
        lastUpdate = now;
      }
      animationFrameId = requestAnimationFrame(update);
    };

    animationFrameId = requestAnimationFrame(update);

    return () => cancelAnimationFrame(animationFrameId);
  }, [getDataForJoint, joints, timeWindow, updateInterval, maxPoints]);

  return (
    <div className={parentStyles}>
      <h2 className="text-xl font-bold mb-4">
        Real-Time Graph: {valueType === "angle" ? "Angle" : "Velocity"}
      </h2>
      <Line
        data={{
          labels:
            chartData[joints[0]]?.labels
              .map((timestamp) =>
                ((timestamp - chartData[joints[0]].labels[0]) / 1000).toFixed(1)
              ) || [],
          datasets: joints.map((joint, index) => ({
            label: `${transformJointName(joint)} ${valueType}`,
            data: chartData[joint]?.data || [],
            borderColor: `hsl(${(index * 60) % 360}, 70%, 50%)`,
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
                display: joints.length > 0,
                callback: (value) => Number(value).toFixed(0),
              },
            },
            y: {
              title: {
                display: true,
                text: valueType === "angle" ? "Angle (degrees)" : "Velocity (°/s or px/s)",
              },
              ticks: {
                display: joints.length > 0,
                callback: (value) => Number(value).toFixed(0),
              },
            },
          },
        }}
      />
    </div>
  );
};
