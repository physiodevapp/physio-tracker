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

// Definimos la interfaz para cada punto de datos
interface DataPoint {
  x: number; // Tiempo normalizado en segundos
  y: number; // Valor medido (por ejemplo, ángulo o velocidad angular)
}

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
  // Estado para almacenar los datos por articulación
  // Para cada articulación se almacenan:
  //   - anglePoints: Array de { x, y } para el ángulo.
  //   - angularVelocityPoints: Array de { x, y } para la velocidad angular.
  //   - color: Color asociado.
  const [chartData, setChartData] = useState<{
    [joint: string]: {
      anglePoints: DataPoint[];
      angularVelocityPoints: DataPoint[];
      color: JointColors;
    };
  }>({});

  // Estado para el tiempo actual (en milisegundos)
  const [currentTime, setCurrentTime] = useState(performance.now());
  // Ref para almacenar el tiempo inicial global (se fija la primera vez que se recibe un dato)
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

  // Construir los datasets usando los puntos (x, y) para cada articulación y cada valueType
  const datasets: ChartDataset<"line">[] = [];
  joints.forEach((joint) => {
    const jointData = chartData[joint];
    if (!jointData) return;

    const baseColor = jointData.color.borderColor;
    const baseBackgroundColor = jointData.color.backgroundColor;

    valueTypes.forEach((vType) => {
      const dataPoints =
        vType === Kinematics.ANGLE
          ? jointData.anglePoints
          : jointData.angularVelocityPoints;

      datasets.push({
        label: `${transformJointName(joint)} ${transformKinematicsLabel(vType)}`,
        data: dataPoints,
        borderColor: baseColor,
        backgroundColor: baseBackgroundColor,
        borderWidth: vType === Kinematics.ANGLE ? 2 : 1,
        tension: 0.6,
        ...(vType === Kinematics.ANGULAR_VELOCITY && { borderDash: [2, 2] }),
      });
    });
  });

  // Calculamos el rango del eje X usando el tiempo normalizado
  const normalizedMaxX = startTimeRef.current
    ? (currentTime - startTimeRef.current) / 1000
    : currentTime / 1000;
  const normalizedMinX = normalizedMaxX - timeWindow / 1000;

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
              // Extraemos la información previa para la articulación.
              // Si no existe o no tiene la estructura esperada, usamos arrays vacíos.
              const previousData = prev[joint] || {
                anglePoints: [] as DataPoint[],
                angularVelocityPoints: [] as DataPoint[],
                color: getColorsForJoint(null),
              };
  
              // Nos aseguramos de que anglePoints y angularVelocityPoints sean arrays
              const anglePoints = Array.isArray(previousData.anglePoints)
                ? previousData.anglePoints
                : [];
              const angularVelocityPoints = Array.isArray(previousData.angularVelocityPoints)
                ? previousData.angularVelocityPoints
                : [];
  
              // Si aún no se ha establecido el tiempo inicial global, lo fijamos
              if (startTimeRef.current === null) {
                startTimeRef.current = newData.timestamp;
              }
  
              // Calculamos el tiempo normalizado (en segundos) para el nuevo dato
              const normalizedTime =
                (newData.timestamp - (startTimeRef.current as number)) / 1000;
  
              // Evitamos duplicados si el tiempo normalizado no ha avanzado
              if (
                anglePoints.length > 0 &&
                normalizedTime === anglePoints[anglePoints.length - 1].x
              ) {
                return prev;
              }
  
              // Agregamos el nuevo punto a cada serie y recortamos para mantener solo los últimos maxPoints
              const updatedAnglePoints = [
                ...anglePoints,
                { x: normalizedTime, y: newData.angle },
              ].slice(-maxPoints);
  
              const updatedAngularVelocityPoints = [
                ...angularVelocityPoints,
                { x: normalizedTime, y: newData.angularVelocity },
              ].slice(-maxPoints);
  
              return {
                ...prev,
                [joint]: {
                  anglePoints: updatedAnglePoints,
                  angularVelocityPoints: updatedAngularVelocityPoints,
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
      // **No reiniciamos startTimeRef.current aquí**
    };
  }, [getDataForJoint, joints, updateInterval, maxPoints]);

  // Nuevo efecto: Si no hay datos (o displayGraphs es false) reiniciamos la línea de tiempo.
  // Puedes adaptar la condición según tu lógica.
  useEffect(() => {
    // Comprobamos si para todos los joints getDataForJoint devuelve null
    const allNull = joints.every((joint) => !getDataForJoint(joint));
    if (allNull) {
      // Reiniciamos la línea de tiempo
      startTimeRef.current = performance.now();
      setCurrentTime(performance.now());
    }
  }, [joints, getDataForJoint]);

  return (
    <div className={parentStyles}>
      <Line
        className="pb-2"
        data={{
          // Al usar puntos con x e y, no se requiere definir "labels"
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
                  const defaultLabels =
                    ChartJS.defaults.plugins.legend.labels.generateLabels(chart);
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
              min: normalizedMinX,
              max: normalizedMaxX,
              title: { display: true, text: "Time (seconds)" },
              ticks: {
                stepSize: 1,
                // stepSize: Math.max(
                //   1,
                //   Math.ceil((normalizedMaxX - normalizedMinX) / 10)
                // ),
                maxTicksLimit: 12,
                callback: (value) => {
                  // Si el valor es negativo, no se muestra nada.
                  if (Number(value) < 0) return "";
                  return Number(value).toFixed(0);
                },
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
