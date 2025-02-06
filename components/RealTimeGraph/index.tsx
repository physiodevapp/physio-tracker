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
import { JointColors, CanvasKeypointName, Kinematics } from "@/interfaces/pose";
import { getColorsForJoint } from "@/services/joint";

// Registro de componentes de Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface RealTimeGraphProps {
  joints: CanvasKeypointName[]; // Lista de articulaciones a mostrar
  valueTypes?: Kinematics[]; // Se acepta un arreglo con uno o ambos valores
  // Función que proporciona datos para una articulación; se espera que devuelva ambos valores.
  getDataForJoint: (joint: CanvasKeypointName) => {
    timestamp: number;
    angle: number;
    angularVelocity: number;
    color: JointColors;
  } | null;
  timeWindow?: number; // Ventana de tiempo en milisegundos (por defecto 10 segundos)
  parentStyles?: string; // Estilos CSS para el contenedor
  updateInterval?: number; // Intervalo de actualización en milisegundos (por defecto 500ms)
  maxPoints?: number; // Número máximo de puntos a mantener por set de datos (por defecto 50)
  maxPointsThreshold?: number;
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
  // Estado para almacenar los datos por articulación (se mantienen SOLO los últimos maxPoints puntos)
  const [chartData, setChartData] = useState<{
    [joint: string]: {
      labels: number[]; // Aquí se almacenan los timestamps absolutos
      angle: number[];
      angularVelocity: number[];
      color: JointColors;
    };
  }>({});

  // Estado para el tiempo actual (en milisegundos)
  const [currentTime, setCurrentTime] = useState(performance.now());
  // Ref para almacenar el tiempo inicial (primer timestamp recibido)
  const startTimeRef = useRef<number | null>(null);

  const transformJointName = (joint: string): string => {
    const words = joint.split("_");
    if (words.length === 0) return joint;
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
    for (let i = 1; i < words.length; i++) {
      words[i] = words[i].toLowerCase();
    }
    return words.join(" ");
  };

  const transformKinematicsLabel = (vType: Kinematics): string => {
    if (vType === Kinematics.ANGULAR_VELOCITY) {
      return "angular velocity";
    }
    return vType; // En este caso, "angle"
  };

  // Construir los datasets para cada articulación y cada valueType
  const datasets: ChartDataset<"line">[] = [];
  joints.forEach((joint) => {
    const jointData = chartData[joint];
    if (!jointData) return;

    const baseColor = jointData.color.borderColor;
    const baseBackgroundColor = jointData.color.backgroundColor;

    valueTypes.forEach((vType) => {
      datasets.push({
        label: `${transformJointName(joint)} ${transformKinematicsLabel(vType)}`,
        // Utilizamos los datos (números absolutos) pero en el eje X se normalizarán
        data: vType === Kinematics.ANGLE ? jointData.angle : jointData.angularVelocity,
        borderColor: baseColor,
        backgroundColor: baseBackgroundColor,
        borderWidth: vType === Kinematics.ANGLE ? 2 : 1,
        tension: 0.6,
        ...(vType === Kinematics.ANGULAR_VELOCITY && { borderDash: [2, 2] }),
      });
    });
  });

  useEffect(() => {
    let lastUpdate = performance.now();
    let animationFrameId: number;

    const update = () => {
      const now = performance.now();
      setCurrentTime(now);

      if (now - lastUpdate >= updateInterval) {
        joints.forEach((joint) => {
          const newData = getDataForJoint(joint);
          
          if (newData) {
            setChartData((prev) => {
              const previousData =
                prev[joint] || {
                  labels: [],
                  angle: [],
                  angularVelocity: [],
                  color: getColorsForJoint(null),
                };

              // Si aún no se ha establecido el tiempo inicial, lo fijamos
              if (startTimeRef.current === null) {
                startTimeRef.current = newData.timestamp;
              }

              // Evitamos duplicados si el timestamp no ha avanzado
              if (
                previousData.labels.length > 0 &&
                newData.timestamp === previousData.labels[previousData.labels.length - 1]
              ) {
                return prev;
              }

              // Agregamos el nuevo dato (se almacenan timestamps absolutos)
              const updatedLabels = [...previousData.labels, newData.timestamp].slice(-maxPoints);
              const updatedAngle = [...previousData.angle, newData.angle].slice(-maxPoints);
              const updatedAngularVelocity = [...previousData.angularVelocity, newData.angularVelocity].slice(-maxPoints);

              return {
                ...prev,
                [joint]: {
                  labels: updatedLabels,
                  angle: updatedAngle,
                  angularVelocity: updatedAngularVelocity,
                  color: newData.color,
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
    
    return () => {
      cancelAnimationFrame(animationFrameId);

      startTimeRef.current = null;
    };
  }, [getDataForJoint, joints, updateInterval, maxPoints]);

  // Normalización: Si startTimeRef está definido, restamos su valor a los timestamps para que comiencen en 0
  const normalizedMinX = startTimeRef.current ? (currentTime - timeWindow - startTimeRef.current) / 1000 : 0;
  const normalizedMaxX = startTimeRef.current ? (currentTime - startTimeRef.current) / 1000 : (currentTime / 1000);

  return (
    <div className={parentStyles}>
      <Line
        className="pb-2"
        data={{
          // Para las etiquetas del eje X, usamos los timestamps normalizados (en segundos)
          labels:
            chartData && Object.values(chartData).length > 0
              ? Object.values(chartData)[0].labels.map((ts) =>
                  ((ts - (startTimeRef.current || ts)) / 1000).toFixed(1)
                )
              : [],
          datasets: datasets,
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: "top",
              labels: {
                usePointStyle: true,
                font: { size: 10 },
                generateLabels: (chart) => {
                  const defaultLabels = ChartJS.defaults.plugins.legend.labels.generateLabels(chart);
                  return defaultLabels
                    .filter((label) =>
                      label.text.toLowerCase().includes("angle")
                    )
                    .map((label) => ({
                      ...label,
                      text: label.text.split("angle")[0].trim(),
                    }));
                },
              },
            },
            decimation: {
              enabled: true,
              algorithm: "lttb",
              samples: maxPoints,
              threshold: maxPointsThreshold,
            },
          },
          elements: {
            point: { radius: 0 },
          },
          scales: {
            x: {
              type: "linear",
              // Establecemos el rango del eje X usando valores normalizados
              min: normalizedMinX,
              max: normalizedMaxX,
              title: { display: true, text: "Time (seconds)" },
              ticks: {
                // Calcula un stepSize dinámico basado en el rango actual y un número objetivo de ticks (por ejemplo, 10)
                stepSize: Math.max(1, Math.ceil((normalizedMaxX - normalizedMinX) / 10)),
                maxTicksLimit: 11, // Limita el número máximo de ticks a 10
                callback: (value) => Number(value).toFixed(0),
              },
            },
            y: {
              title: {
                display: false,
                text: (() => {
                  if (
                    valueTypes.includes(Kinematics.ANGLE) &&
                    valueTypes.includes(Kinematics.ANGULAR_VELOCITY)
                  ) {
                    return "Angle (°) & Angular Velocity (°/s)";
                  }
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
