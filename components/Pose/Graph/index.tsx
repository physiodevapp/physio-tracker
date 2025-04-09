import { useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  ChartDataset,
  ChartConfiguration,
  ChartEvent,
  registerables,
} from "chart.js";
import { JointColors, CanvasKeypointName, Kinematics } from "@/interfaces/pose";
import { getColorsForJoint } from "@/services/joint";
import { useSettings } from "@/providers/Settings";
import { lttbDownsample } from "@/services/chart";

// Registro de componentes de Chart.js
ChartJS.register(
  ...registerables,
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
    // angularVelocity: number;
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
    // angularVelocity: number;
    color: JointColors;
  } | null;
  onVerticalLineChange: (newValue: {
    x: number;
    values: { label: string; y: number }[];
  }) => void;
  parentStyles?: string; // Estilos CSS para el contenedor
  recordedPositions?: RecordedPositions;
  verticalLineValue?: number;
}

const customCrosshairPlugin = (isActive: boolean = true) => ({
  id: 'customCrosshair',
  afterEvent(chart: ChartJS & { _customCrosshairX?: number }, args: { event: ChartEvent }) {
    if (!isActive) return;

    const { chartArea } = chart;
    const { event } = args;

    if (!event || event.x == null || event.y == null) return;

    if (
      event.x >= chartArea.left &&
      event.x <= chartArea.right &&
      event.y >= chartArea.top &&
      event.y <= chartArea.bottom
    ) {
      chart._customCrosshairX = event.x;
    } else {
      chart._customCrosshairX = undefined;
    }
  },
  afterDraw(chart: ChartJS & { _customCrosshairX?: number }) {
    if (!isActive) return;
  
    const x = chart._customCrosshairX;
    if (!x) return;
  
    const { ctx, chartArea, scales } = chart;
    const xScale = scales['x'];
    const yScale = scales['y'];
  
    const xValue = xScale.getValueForPixel(x);
  
    // Línea vertical roja
    ctx.save();
    ctx.strokeStyle = '#F66';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  
    // Para cada dataset
    chart.data.datasets.forEach((dataset) => {
      const data = dataset.data as { x: number; y: number }[];
  
      if (!data || !data.length) return;
  
      // Buscar el punto más cercano al xValue
      const closestPoint = data.reduce((prev, curr) =>
        Math.abs(curr.x - xValue!) < Math.abs(prev.x - xValue!) ? curr : prev
      );
  
      const yPixel = yScale.getPixelForValue(closestPoint.y);
  
      // Dibujar línea horizontal en y = yPixel
      ctx.save();
      ctx.strokeStyle = dataset.borderColor as string;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(chartArea.left, yPixel);
      ctx.lineTo(chartArea.right, yPixel);
      ctx.stroke();
      ctx.restore();
    });
  }
  
});

const Index = ({
  joints,
  valueTypes = [Kinematics.ANGLE],
  getDataForJoint,
  recordedPositions = undefined,
  onVerticalLineChange,
  parentStyles = "relative w-full flex flex-col items-center justify-start h-[50vh]",
  // verticalLineValue = 0,
}: IndexProps) => {
  const { settings } = useSettings();
  const { 
    poseTimeWindow,
    poseUpdateInterval,
    poseGraphSample,
    poseGraphSampleThreshold,
  } = settings.pose;

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
      // angularVelocityPoints: DataPoint[];
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
        let dataPoints = jointData.anglePoints

        // Si la cantidad de puntos es mayor que el threshold deseado, los reducimos.
        if (dataPoints.length > poseGraphSampleThreshold) {
          dataPoints = lttbDownsample(dataPoints, poseGraphSample);
        }
  
        result.push({
          label: `${transformJointName(joint)} ${vType}`,
          data: dataPoints,
          borderColor: baseColor,
          backgroundColor: baseBackgroundColor,
          borderWidth: 2,          
          tension: 0.6,
          pointRadius: 0,
          pointHoverRadius: !realTime ? 3 : 0,
          pointHoverBorderWidth: !realTime ? 1 : 0,
          pointHoverBorderColor: 'red',
          pointHitRadius: 0,
          parsing: false,
        });
      });
    });

    return result;
  }, [chartData, joints, valueTypes, poseGraphSample, poseGraphSampleThreshold, poseTimeWindow, poseUpdateInterval]);

  // Calculamos el rango del eje X usando el tiempo normalizado
  let normalizedMaxX;
  let normalizedMinX;
  if (!realTime) {
    const allXValues = Object.values(chartData)
    .flatMap(data => data.anglePoints.map(point => point.x));
    normalizedMaxX = allXValues.length > 0 
      ? Math.min(Math.max(...allXValues), poseTimeWindow) 
      : 0;
    normalizedMinX = 0;
  } else {
    normalizedMaxX = startTimeRef.current
      ? (currentTime - startTimeRef.current) / 1000
      : currentTime / 1000;
    normalizedMinX = normalizedMaxX - poseTimeWindow;
  }

  useEffect(() => {
    // Si está en modo pausa, no iniciamos el ciclo de actualización.
    if (!realTime) return;

    let lastUpdate = performance.now();
    let animationFrameId: number;

    const update = () => {
      const now = performance.now();
      setCurrentTime(now);

      if (now - lastUpdate >= poseUpdateInterval) {
        joints.forEach((joint) => {
          const newData = getDataForJoint(joint);
          if (newData) {
            setChartData((prev) => {
              // Extraemos la información previa para la articulación.
              // Si no existe o no tiene la estructura esperada, usamos arrays vacíos.
              const previousData = prev[joint] || {
                anglePoints: [] as DataPoint[],
                // angularVelocityPoints: [] as DataPoint[],
                color: getColorsForJoint(null),
              };
  
              // Nos aseguramos de que anglePoints y angularVelocityPoints sean arrays
              const anglePoints = Array.isArray(previousData.anglePoints)
                ? previousData.anglePoints
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
              ].slice(-poseGraphSample);
  
              return {
                ...prev,
                [joint]: {
                  anglePoints: updatedAnglePoints,
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
  }, [getDataForJoint, joints, poseTimeWindow, poseUpdateInterval, poseGraphSample, poseGraphSampleThreshold, realTime]);

  useEffect(() => {
    if (recordedPositions) {
      const newChartData: {
        [joint: string]: {
          anglePoints: DataPoint[];
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
          newChartData[joint] = {
            anglePoints,
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
        customCrosshairPlugin(!realTime)
      ],
      options: {
        responsive: true,
        animation: false,
        maintainAspectRatio: false,
        interaction: {
          mode: "index", //"nearest",
          axis: "x",
          intersect: false,
          includeInvisible: false,
        },       
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: {
              usePointStyle: true,
              font: { size: 10 },
              padding: 20,  
              generateLabels: (chart) => {
                const defaultLabels = ChartJS.defaults.plugins.legend.labels.generateLabels(chart);
        
                return defaultLabels.map((label: { text: string; }) => {
                  const rawText = label.text.toLowerCase();
        
                  const formattedLabel = rawText
                    .replace(/^right\s/, "R ")
                    .replace(/^left\s/, "L ")
                    .replace(/\s*angle$/, "") // Elimina "angle" al final
                    .replace(/\s+/g, " ")     // Limpieza de espacios extra
                    .trim();
        
                  return {
                    ...label,
                    text: formattedLabel,
                  };
                });
              },
            },
            onClick: () => {},                       
          },
          tooltip: {
            enabled: false,
            boxPadding: 6,
            external: (context) => {
              const tooltipModel = context.tooltip;
              const dataPoints = tooltipModel.dataPoints;

              if (dataPoints && dataPoints.length > 0) {
                const x = dataPoints[0].parsed.x;
                const values = dataPoints.map(dp => {
                  const rawLabel = dp.dataset.label ?? '';
              
                  const jointLabel = rawLabel
                    .toLowerCase()
                    .replace(/ (angle)/, '')
                    .replace(/\s+/g, '_');
              
                  return {
                    label: jointLabel,
                    y: dp.parsed.y,
                  };
                });

                onVerticalLineChange({ x, values });
              }
            },
          }
        },
        elements: {
          point: { 
            radius: 0,
            hitRadius: 0,
            hoverRadius: 0,
          },
        },
        scales: {
          x: {
            type: "linear",
            min: normalizedMinX,
            max: normalizedMaxX,
            title: { display: false, text: "Time (seconds)" },
            ticks: {
              display: joints.length > 0,
              stepSize: 1,
              maxTicksLimit: 12,
              callback: (value) => {
                // Si el valor es negativo, no se muestra nada.
                if (Number(value) < 0 || datasets.length === 0) return "";
                
                return Number(value).toFixed(0);
              },
            },
          },
          y: {
            title: {
              display: false,
              text: (() => {
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

  
  return (
    <div 
      data-element="non-swipeable"
      className={parentStyles}
      >
        <canvas 
          ref={canvasRef} 
          className='bg-white px-2 pb-2'
          />
    </div>
  );
};

export default Index;
