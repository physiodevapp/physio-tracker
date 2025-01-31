import { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from "chart.js";

// Registro de componentes de Chart.js
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface RealTimeGraphProps {
  joints: string[]; // Lista de articulaciones a mostrar
  valueType: "angle" | "velocity"; // Tipo de dato a mostrar
  getDataForJoint: (joint: string) => { timestamp: number; value: number } | null; // Función que proporciona datos para una articulación
  timeWindow?: number; // Ventana de tiempo en milisegundos (por defecto 10 segundos)
}

export const RealTimeGraph = ({
  joints,
  valueType,
  getDataForJoint,
  timeWindow = 10000, // Últimos 10 segundos
}: RealTimeGraphProps) => {
  const [chartData, setChartData] = useState<{ [joint: string]: { labels: number[]; data: number[] } }>(
    {}
  );

  useEffect(() => {
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
    }, 500); // Actualización cada 500ms

    return () => clearInterval(interval);
  }, [getDataForJoint, joints, timeWindow]);

  return (
    <div className="max-w-xl mx-auto p-4">
      <h2 className="text-xl font-bold mb-4">Real-Time Graph - {valueType === "angle" ? "Angle" : "Velocity"}</h2>
      <Line
        data={{
          labels: chartData[joints[0]]?.labels.map((timestamp) => ((timestamp - chartData[joints[0]].labels[0]) / 1000).toFixed(1)) || [],
          datasets: joints.map((joint, index) => ({
            label: `${joint} ${valueType}`,
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
              },
            },
            y: {
              title: {
                display: true,
                text: valueType === "angle" ? "Angle (degrees)" : "Velocity (°/s or px/s)",
              },
            },
          },
        }}
      />
    </div>
  );
}
