import { useEffect, useRef, useState } from "react";
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
  ChartDataset,
} from "chart.js";
import { Keypoint, Kinematics } from "@/interfaces/pose";

// Registro de componentes de Chart.js
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface RealTimeGraphProps {
  joints: Keypoint[]; // Lista de articulaciones a mostrar
  // Se acepta un arreglo con uno o ambos valores
  valueTypes?: Kinematics[]; 
  // Función que proporciona datos para una articulación; se espera que devuelva ambos valores.
  getDataForJoint: (joint: Keypoint) => { timestamp: number; angle: number; angularVelocity: number } | null;
  timeWindow?: number; // Ventana de tiempo en milisegundos (por defecto 10 segundos)
  parentStyles?: string; // Estilos CSS para el contenedor
  updateInterval?: number; // Intervalo de actualización en milisegundos (por defecto 500ms)
  maxPoints?: number; // Número máximo de puntos a mostrar en el gráfico (por defecto 50)
  maxPointsThreshold?: number
}

export const RealTimeGraph = ({
  joints,
  valueTypes = [Kinematics.ANGLE],
  getDataForJoint,
  timeWindow = 10000,
  parentStyles = "relative w-full flex flex-col items-center justify-start h-[50vh]",
  updateInterval = 500,
  maxPoints = 50,
  maxPointsThreshold = 80,
}: RealTimeGraphProps) => {
  // Estado para almacenar los datos por articulación
  const [chartData, setChartData] = useState<{
    [joint: string]: { labels: number[]; angle: number[]; angularVelocity: number[] }
  }>({});

  // Estado global para los labels del eje X
  const [globalLabels, setGlobalLabels] = useState<number[]>([]);
  // Ref para almacenar el tiempo inicial (tomado del primer dato recibido)
  const startTimeRef = useRef<number | null>(null);

  const transformJointName = (joint: string): string => {
    const words = joint.split('_');
    if (words.length === 0) return joint;
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
    for (let i = 1; i < words.length; i++) {
      words[i] = words[i].toLowerCase();
    }
    return words.join(' ');
  };

  const transformKinematicsLabel = (vType: Kinematics): string => {
    if (vType === Kinematics.ANGULAR_VELOCITY) {
      return "angular velocity";
    }
    return vType; // En este caso, "angle"
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
              const previousData = prev[joint] || { labels: [], angle: [], angularVelocity: [] };

              // Establecer el tiempo inicial si aún no se ha hecho
              if (startTimeRef.current === null) {
                startTimeRef.current = newData.timestamp;
              }

              // Verificación para "pausar" si el timestamp no avanza
              if (
                previousData.labels.length > 0 &&
                newData.timestamp === previousData.labels[previousData.labels.length - 1]
              ) {
                return prev; // No actualiza si el timestamp es el mismo
              }

              // Filtrar datos antiguos fuera de la ventana de tiempo
              const filteredLabels = previousData.labels.filter(
                (timestamp) => currentTime - timestamp <= timeWindow
              );
              // Para mantener la consistencia, usamos la misma cantidad de datos en cada array:
              const offset = previousData.labels.length - filteredLabels.length;
              const filteredAngle = previousData.angle.slice(offset);
              const filteredAngularVelocity = previousData.angularVelocity.slice(offset);

              // Agregar el nuevo dato sin downsampling manual
              const newLabels = [...filteredLabels, newData.timestamp];
              const newAngle = [...filteredAngle, newData.angle];
              const newAngularVelocity = [...filteredAngularVelocity, newData.angularVelocity];

              return {
                ...prev,
                [joint]: {
                  labels: newLabels,
                  angle: newAngle,
                  angularVelocity: newAngularVelocity,
                },
              };
            });
          }
        });

        // Actualizamos el array global de labels usando el timestamp actual
        setGlobalLabels((prev) => {
          const newLabel = now;
          if (prev.length === 0 || newLabel > prev[prev.length - 1]) {
            return [...prev, newLabel];
          }
          return prev;
        });

        lastUpdate = now;
      }
      animationFrameId = requestAnimationFrame(update);
    };

    animationFrameId = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(animationFrameId);
      startTimeRef.current = null;
    };
  }, [getDataForJoint, joints, timeWindow, updateInterval]);

  // Construir los datasets para cada articulación y cada valueType
  const datasets: ChartDataset<"line">[] = [];

  joints.forEach((joint, jIndex) => {
    const jointData = chartData[joint];
    if (!jointData) return;

    // Color base para la articulación
    const baseHue = (jIndex * 60) % 360;
    const baseColor = `hsl(${baseHue}, 70%, 50%)`;
    const baseBackgroundColor = `hsla(${baseHue}, 70%, 50%, 0.2)`;

    valueTypes.forEach((vType) => {
      datasets.push({
        label: `${transformJointName(joint)} ${transformKinematicsLabel(vType)}`,
        data: vType === Kinematics.ANGLE ? jointData.angle : jointData.angularVelocity,
        borderColor: baseColor,
        backgroundColor: baseBackgroundColor,
        borderWidth: vType === Kinematics.ANGLE ? 2 : 1,
        tension: 0.6,
        ...(vType === Kinematics.ANGULAR_VELOCITY && { borderDash: [2, 2] }),
      });
    });
  });

  return (
    <div className={parentStyles}>
      <Line
        className="pb-2"
        data={{
          // Usamos el array global para el eje X. Se puede adaptar si se requiere
          labels:
            globalLabels
              .map((timestamp) =>
                ((timestamp - (startTimeRef.current || timestamp)) / 1000).toFixed(1)
              ) || [],
          datasets: datasets,
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: "top",
            },
            decimation: {
              enabled: true,
              algorithm: "lttb",
              samples: maxPoints,
              threshold: maxPointsThreshold
            }
          },
          elements: {
            point: {
              radius: 0,
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
                display: false,
                text: (() => {
                  // Si se muestran ambos valores, se muestra un título combinado.
                  if (valueTypes.includes(Kinematics.ANGLE) && valueTypes.includes(Kinematics.ANGULAR_VELOCITY)) {
                    return "Angle (°) & Angular Velocity (°/s)";
                  }
                  // Si se muestra solo ángulo.
                  if (valueTypes.includes(Kinematics.ANGLE)) {
                    return "Angle (°)";
                  }
                  return "";
                })(),
              },
              suggestedMin: 0,
              suggestedMax: 90,
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
