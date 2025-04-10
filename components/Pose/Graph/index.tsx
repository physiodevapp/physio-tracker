import { useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  ChartDataset,
  ChartConfiguration,
  ChartEvent,
  registerables,
  ActiveDataPoint,
} from "chart.js";
import { JointColors, CanvasKeypointName, Kinematics } from "@/interfaces/pose";
// import { getColorsForJoint } from "@/services/joint";
import { useSettings } from "@/providers/Settings";
import { lttbDownsample } from "@/services/chart";
import zoomPlugin from 'chartjs-plugin-zoom';
import { ViewfinderCircleIcon } from "@heroicons/react/24/solid";

// Registro de componentes de Chart.js
ChartJS.register(
  ...registerables,
  zoomPlugin 
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
  recordedPositions = undefined,
  onVerticalLineChange,
  parentStyles = "relative w-full flex flex-col items-center justify-start h-[50vh]",
  // verticalLineValue = 0,
}: IndexProps) => {
  const { settings } = useSettings();
  const { 
    poseUpdateInterval,
    poseGraphSample,
    poseGraphSampleThreshold,
  } = settings.pose;

  const [isZoomed, setIsZoomed] = useState(false);

  // --- Cofiguración del gráfico ----
  const chartRef = useRef<ChartJS | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
          pointHoverRadius: 3,
          pointHoverBorderWidth: 1,
          pointHoverBorderColor: 'red',
          pointHitRadius: 0,
          parsing: false,
        });
      });
    });

    return result;
  }, [chartData, joints, valueTypes, poseGraphSample, poseGraphSampleThreshold, poseUpdateInterval]);

  // Calculamos el rango del eje X usando el tiempo normalizado
  const allXValues = Object.values(chartData)
  .flatMap(data => data.anglePoints.map(point => point.x));
  const normalizedMaxX = allXValues.length > 0 
    ? Math.max(...allXValues)
    : 0;
  const normalizedMinX = 0;

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

      const joints = Object.keys(recordedPositions) as CanvasKeypointName[];
      if (joints.length > 0 && recordedPositions[joints[0]] && recordedPositions[joints[0]]!.length > 0) {
        const firstTimestamp = recordedPositions[joints[0]]![0].timestamp;
        startTimeRef.current = firstTimestamp;
      }
    }
  }, [recordedPositions]);

  const chartConfig = useMemo<ChartConfiguration>(
    () => ({
      type: "line",
      data: {
        datasets: datasets,
      },
      plugins: [
        customCrosshairPlugin(),
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
          zoom: {
            limits: {
              x: {min: 0, max: 10, minRange: 5},
              y: {min: -10, max: 200, minRange: 60}
            },
            pan: {
              enabled: false,
              mode: 'xy', // o 'xy'
              threshold: 10,
              onPan: ({ chart }: { chart: ChartJS & { _customCrosshairX?: number } }) => {
                setIsZoomed(true);

                const x = chart._customCrosshairX;
                if (!x) return;

                const xValue = chart.scales.x.getValueForPixel(x);
                const activeElements: ActiveDataPoint[] = [];

                chart.data.datasets.forEach((dataset, datasetIndex) => {
                  const data = dataset.data as { x: number; y: number }[];
                  if (!data?.length) return;
              
                  let closestIndex = 0;
                  let minDist = Infinity;
              
                  data.forEach((point, i) => {
                    const dist = Math.abs(point.x - xValue!);
                    if (dist < minDist) {
                      minDist = dist;
                      closestIndex = i;
                    }
                  });
              
                  activeElements.push({ datasetIndex, index: closestIndex });
                });

                chart.setActiveElements(activeElements);
                chart.tooltip!.setActiveElements(activeElements, { x, y: chart.chartArea.top });
                // chart.update();
              },
            },
            zoom: {
              wheel: {
                enabled: true, // zoom con scroll
              },
              pinch: {
                enabled: true, // zoom con gesto táctil
              },
              mode: 'xy', // solo horizontal (tiempo)
              onZoom: () => setIsZoomed(true),
            },
          },
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
            suggestedMin: -10,
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
        {isZoomed ? (
          <ViewfinderCircleIcon 
          className="absolute bottom-0 left-0 p-1 w-8 h-8 text-gray-400"
          onClick={() => {
            chartRef.current?.resetZoom();

            setIsZoomed(false);
          }}
          /> ) : null
        }
    </div>
  );
};

export default Index;
