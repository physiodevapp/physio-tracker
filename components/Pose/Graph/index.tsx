import { useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  ChartDataset,
  ChartConfiguration,
  registerables,
  Plugin as ChartPlugin,
} from "chart.js";
import { JointColors, CanvasKeypointName, Kinematics } from "@/interfaces/pose";
import { getColorsForJoint } from "@/services/joint";
import { useSettings } from "@/providers/Settings";
import { lttbDownsample } from "@/services/chart";
import CrosshairPlugin from 'chartjs-plugin-crosshair';
// import annotationPlugin from 'chartjs-plugin-annotation';

// Registro de componentes de Chart.js
ChartJS.register(
  ...registerables,
  // CrosshairPlugin,
  // annotationPlugin,
);

// Definimos la interfaz para cada punto de datos
interface DataPoint {
  x: number; // Tiempo normalizado en segundos
  y: number; // Valor medido (por ejemplo, ángulo o velocidad angular)
}

type RecordedPositions = {
  [joint in CanvasKeypointName]?: {
    timestamp: number;
    angle: number;
    angularVelocity: number;
    color: JointColors;
  }[];
};

interface IndexProps {
  joints: CanvasKeypointName[]; // Lista de articulaciones a mostrar
  valueTypes?: Kinematics[]; // Se acepta un arreglo con uno o ambos valores
  // Función que proporciona datos para una articulación; se espera que devuelva ambos valores.
  getDataForJoint: (joint: CanvasKeypointName) => {
    timestamp: number;
    angle: number;
    angularVelocity: number;
    color: JointColors;
  } | null;
  onPointClick: (time: number) => void;
  onVerticalLineChange: (newValue: number) => void;
  parentStyles?: string; // Estilos CSS para el contenedor
  recordedPositions?: RecordedPositions;
  verticalLineValue?: number;
}

const Index = ({
  joints,
  valueTypes = [Kinematics.ANGLE],
  getDataForJoint,
  recordedPositions = undefined,
  // onPointClick, 
  onVerticalLineChange,
  parentStyles = "relative w-full flex flex-col items-center justify-start h-[50vh]",
  verticalLineValue = 0,
}: IndexProps) => {
  const { settings } = useSettings();

  // --- Cofiguración del gráfico ----
  const chartRef = useRef<ChartJS | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // const chartRef = useRef<ChartJS<"line", DataPoint[], unknown>>(null);

  const realTime = recordedPositions === undefined;

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
  // Este bloque se recalcula solo cuando cambian chartData, joints o valueTypes.
  const datasets = useMemo(() => {
    const result: ChartDataset<"line">[] = [];
    joints.forEach((joint) => {
      const jointData = chartData[joint];
      if (!jointData) return;
  
      const baseColor = jointData.color.borderColor;
      const baseBackgroundColor = jointData.color.backgroundColor;
  
      valueTypes.forEach((vType) => {
        let dataPoints =
          vType === Kinematics.ANGLE
            ? jointData.anglePoints
            : jointData.angularVelocityPoints;

        // Si la cantidad de puntos es mayor que el threshold deseado, los reducimos.
        if (dataPoints.length > settings.pose.poseGraphSampleThreshold) {
          dataPoints = lttbDownsample(dataPoints, settings.pose.poseGraphSample);
        }
  
        result.push({
          label: `${transformJointName(joint)} ${transformKinematicsLabel(vType)}`,
          data: dataPoints,
          borderColor: baseColor,
          backgroundColor: baseBackgroundColor,
          borderWidth: vType === Kinematics.ANGLE ? 2 : 1,          
          tension: 0.6,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBorderWidth: 1,
          pointHoverBorderColor: 'red',
          pointHitRadius: 0,
          parsing: false,
          ...(vType === Kinematics.ANGULAR_VELOCITY && { borderDash: [2, 2] }),
        });
      });
    });

    return result;
  }, [chartData, joints, valueTypes, settings.pose.poseGraphSample, settings.pose.poseGraphSampleThreshold]);

  // Calculamos el rango del eje X usando el tiempo normalizado
  let normalizedMaxX;
  let normalizedMinX;
  if (!realTime) {
    const allXValues = Object.values(chartData)
    .flatMap(data => data.anglePoints.map(point => point.x));
    normalizedMaxX = allXValues.length > 0 
      ? Math.min(Math.max(...allXValues), settings.pose.poseTimeWindow) 
      : 0;
    normalizedMinX = 0;
  } else {
    normalizedMaxX = startTimeRef.current
      ? (currentTime - startTimeRef.current) / 1000
      : currentTime / 1000;
    normalizedMinX = normalizedMaxX - settings.pose.poseTimeWindow;
  }

  useEffect(() => {
    // Si está en modo pausa, no iniciamos el ciclo de actualización.
    if (!realTime) return;

    let lastUpdate = performance.now();
    let animationFrameId: number;

    const update = () => {
      const now = performance.now();
      setCurrentTime(now);

      if (now - lastUpdate >= settings.pose.poseUpdateInterval) {
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
  
              // Agregamos el nuevo punto a cada serie y recortamos para mantener solo los últimos poseGraphSample
              const updatedAnglePoints = [
                ...anglePoints,
                { x: normalizedTime, y: newData.angle },
              ].slice(-settings.pose.poseGraphSample);
  
              const updatedAngularVelocityPoints = [
                ...angularVelocityPoints,
                { x: normalizedTime, y: newData.angularVelocity },
              ].slice(-settings.pose.poseGraphSample);
  
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
    };
  }, [getDataForJoint, joints, settings.pose.poseUpdateInterval, settings.pose.poseGraphSample, settings.pose.poseGraphSampleThreshold, realTime]);

  useEffect(() => {
    if (recordedPositions) {
      const newChartData: {
        [joint: string]: {
          anglePoints: DataPoint[];
          angularVelocityPoints: DataPoint[];
          color: JointColors;
        };
      } = {};
  
      Object.entries(recordedPositions).forEach(([joint, dataArray]) => {
        if (dataArray && dataArray.length > 0) {
          // Tomamos el primer timestamp como referencia (cero segundos)
          const start = dataArray[0].timestamp;
          const anglePoints = dataArray.map((d: { timestamp: number; angle: number; }) => ({
            x: (d.timestamp - start) / 1000,
            y: d.angle,
          }));
          const angularVelocityPoints = dataArray.map((d: { timestamp: number; angularVelocity: number; }) => ({
            x: (d.timestamp - start) / 1000,
            y: d.angularVelocity,
          }));
          newChartData[joint] = {
            anglePoints,
            angularVelocityPoints,
            // Puedes elegir el color del primer dato o utilizar una función de colores:
            color: dataArray[0].color,
          };
        }
      });
      setChartData(newChartData);
    }
  }, [recordedPositions]);
  
  useEffect(() => {
    if (realTime) {
      const now = performance.now();
      startTimeRef.current = now;
      setCurrentTime(now);
    } else {
      // Suponiendo que recordedPositions es un objeto con claves correspondientes a cada articulación
      // y que quieres usar el primer dato de la primera articulación como referencia:
      const joints = Object.keys(recordedPositions) as CanvasKeypointName[];
      if (joints.length > 0 && recordedPositions[joints[0]] && recordedPositions[joints[0]]!.length > 0) {
        const firstTimestamp = recordedPositions[joints[0]]![0].timestamp;
        startTimeRef.current = firstTimestamp;
        setCurrentTime(firstTimestamp);
      }
    }
  }, [realTime]);

  const chartConfig = useMemo<ChartConfiguration>(
    () => ({
      type: "line",
      data: {
        datasets: datasets,
      },
      plugins: [
        CrosshairPlugin as ChartPlugin,
      ],
      options: {
        responsive: true,
        animation: false,
        maintainAspectRatio: false,
        interaction: {
          mode: "nearest",
          axis: "x",
          intersect: false,
        },
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
            // Sobreescribimos onClick para que oculte/muestre ambos datasets
            onClick: (e, legendItem, legend) => {
              const chart = legend.chart;
              // Obtenemos la etiqueta base, por ejemplo "Left elbow"
              const baseLabel = legendItem.text.toLowerCase();
              // Iteramos sobre todos los datasets
              chart.data.datasets.forEach((ds, i) => {
                // Si el label del dataset (convertido a minúsculas) incluye la etiqueta base
                // (asumimos que ambos datasets tienen, por ejemplo, "Left elbow angle" y "Left elbow angular velocity")
                if (ds.label?.toLowerCase().includes(baseLabel)) {
                  // Alternamos la visibilidad: si estaba oculto, se muestra, y viceversa.
                  const meta = chart.getDatasetMeta(i);
                  meta.hidden = meta.hidden === null ? !chart.data.datasets[i].hidden : !meta.hidden;
                }
              });
              chart.update();
            },
          },
          tooltip: {
            enabled: !realTime,
            external: (context) => {
              const tooltipModel = context.tooltip;
              const dataPoint = tooltipModel.dataPoints?.[0];
              if (dataPoint && typeof dataPoint.parsed.x === 'number') {
                onVerticalLineChange(dataPoint.parsed.x);
              }
            },
            callbacks: {
              title: () => "", // Desactiva el título del tooltip
              // Formatea cada tooltip (cuando se pincha o se hace hover en un punto)
              label: function (context) {
                // Recupera el label original del dataset
                const originalLabel = context.dataset.label || "";
                // Si el label contiene la palabra "angle" (sin distinción de mayúsculas), la quitamos
                const cleanedLabel = originalLabel.toLowerCase().includes("angle")
                  ? originalLabel.split("angle")[0].trim()
                  : originalLabel.split("angular velocity")[0].trim();
    
                // Formatea el valor del eje x (tiempo)
                // Aquí lo mostramos con dos decimales y le añadimos " s"
                const xValue = Number(context.parsed.x).toFixed(2) + " s";
    
                // Formatea el valor del eje y
                // Redondeamos a entero
                const yRounded = Math.round(context.parsed.y);
                // Si el label original contenía "angle", añadimos la unidad de grados
                const yValue = originalLabel.toLowerCase().includes("angle")
                  ? yRounded + " º"
                  : yRounded + " º/s";
    
                return [xValue, `${cleanedLabel}: ${yValue}`];
              },
            },
          },
          crosshair: realTime ? false : {
            line: {
              color: '#F66', 
              width: 1
            },
            sync: {
              // Habilita la sincronización con otros gráficos
              enabled: true,
              // Grupo de gráficos para sincronizar
              group: 1,
              // Suprime tooltips al mostrar un tracer sincronizado
              suppressTooltips: false,
            },
            zoom: {
              enabled: false,  
            },
          }
        },
        elements: {
          point: { 
            radius: !realTime ? 3 : 0,
            hitRadius: !realTime ? 3 : 0,
            hoverRadius: !realTime ? 3 : 0,
          },
        },
        scales: {
          x: {
            type: "linear",
            min: normalizedMinX,
            max: normalizedMaxX,
            title: { display: true, text: "Time (seconds)" },
            ticks: {
              display: joints.length > 0,
              stepSize: 1,
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
            suggestedMax: 180,
            ticks: {
              display: joints.length > 0,
              callback: (value) => Number(value).toFixed(0),
            },
          },
        },
      }
    }),[datasets]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    chartRef.current = new ChartJS(ctx, chartConfig);

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [chartConfig]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const meta = chart.getDatasetMeta(0);

    // Encuentra el punto más cercano al tiempo del video
    if (chart.data.datasets[0] === undefined) return;
    const dataset = chart.data.datasets[0].data as { x: number; y: number }[];
    const index = dataset.findIndex((point) => point.x >= verticalLineValue);

    if (index !== undefined && index !== -1 && chart.tooltip) {
      const point = meta.data[index];

      // Simula un evento de hover para activar crosshair y tooltip
      chart.setActiveElements([
        {
          datasetIndex: 0,
          index,
        },
      ]);

      chart.tooltip.setActiveElements(
        [
          {
            datasetIndex: 0,
            index,
          },
        ],
        { x: point.x, y: point.y }
      );

      const canvas = chart.canvas;

      // Simular evento en coordenadas del punto
      const mouseEvent = new MouseEvent('mousemove', {
        clientX: point.x,
        clientY: point.y,
        bubbles: true,
        cancelable: true,
      });

      canvas.dispatchEvent(mouseEvent);

      chart.update();
    }
    
  }, [verticalLineValue]);  

  return (
    <div 
      data-element="non-swipeable"
      className={parentStyles}
      >
        <canvas 
          ref={canvasRef} 
          className='bg-white px-2'
          />
    </div>
  );
};

export default Index;
