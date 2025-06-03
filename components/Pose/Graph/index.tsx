import { useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  ChartDataset,
  ChartConfiguration,
  registerables,
  ActiveDataPoint,
  ChartEvent,
} from "chart.js";
import { JointColors, CanvasKeypointName, Kinematics, DragLimits, PoseAnnotations } from "@/interfaces/pose";
import zoomPlugin from 'chartjs-plugin-zoom';
import { ArrowsPointingInIcon } from "@heroicons/react/24/outline";
import annotationPlugin, { AnnotationOptions } from "chartjs-plugin-annotation";
import { getAllAnnotations, IAnnotation } from "@/utils/chart";

// Registro de componentes de Chart.js
ChartJS.register(
  ...registerables,
  zoomPlugin,
  annotationPlugin, 
);

// Definimos la interfaz para cada punto de datos
interface DataPoint {
  x: number; // Tiempo normalizado en segundos
  y: number; // Valor medido (por ejemplo, ángulo o velocidad angular)
}

export type RecordedPositions = {
  [joint in CanvasKeypointName]?: {
    timestamp: number;
    angle: number;
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
  hiddenLegendsRef?: React.RefObject<Set<number>>;
  onToggleLegend?: (index: number, hidden: boolean) => void;
  annotations?: PoseAnnotations;
  dragLimits?: DragLimits;
  onDraggableLinesUpdated?: (draggableLinesUpdated: Record<string, number>) => void;
}

const areAllDatasetsHidden = (chart: ChartJS): boolean => {
  return chart.data.datasets!.every((ds, i) => !chart.isDatasetVisible(i));
}

const customCrosshairPlugin = ({
  recordedPositions,
  tooltipXRef,
  hiddenLegendsRef,
}: {
  recordedPositions: RecordedPositions;
  tooltipXRef: React.RefObject<number>;
  hiddenLegendsRef: React.RefObject<Set<number>>;
}) => ({
  id: 'customCrosshair',
  afterEvent(chart: ChartJS & {
    _isDraggingAnnotation?: boolean;
    _customCrosshairX?: number | undefined;
  }, args: { 
    event: ChartEvent 
  }) {
    // ❌ Bloquear si se está arrastrando una anotación
    if (chart._isDraggingAnnotation) return;

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
  afterDraw(chart: ChartJS & {
      _isDraggingAnnotation?: boolean;
      _customCrosshairX?: number | undefined;
  }) {
    // ❌ Bloquear si se está arrastrando una anotación
    if (chart._isDraggingAnnotation) return;

    const xMs = tooltipXRef.current;
    const allHidden = areAllDatasetsHidden(chart);

    if (xMs == null || allHidden) return;

    const { ctx, chartArea, scales } = chart;
    const xScale = scales["x"];
    const yScale = scales["y"];

    const xPixel = xScale.getPixelForValue(xMs);

    // Línea vertical roja
    ctx.save();
    ctx.strokeStyle = "#F66";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xPixel, chartArea.top);
    ctx.lineTo(xPixel, chartArea.bottom);
    ctx.stroke();
    ctx.restore();

    // Línea horizontal + punto exacto
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      if (hiddenLegendsRef?.current?.has(datasetIndex)) return;

      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;

      const label = dataset.label ?? "";
      const jointLabel = label
        .toLowerCase()
        .replace(/ (angle)/, "")
        .replace(/\s+/g, "_") as CanvasKeypointName;

      const jointData = recordedPositions?.[jointLabel];
      if (!jointData?.length) return;

      const nearest = jointData.reduce((prev, curr) =>
        Math.abs(curr.timestamp - xMs) < Math.abs(prev.timestamp - xMs) ? curr : prev,
      );

      if (nearest.angle < yScale.min || nearest.angle > yScale.max) return;

      const yPixel = yScale.getPixelForValue(nearest.angle);

      // Línea horizontal discontinua
      ctx.save();
      ctx.strokeStyle = dataset.borderColor as string ?? "#999";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(chartArea.left, yPixel);
      ctx.lineTo(chartArea.right, yPixel);
      ctx.stroke();
      ctx.restore();

      // Punto de intersección
      ctx.save();
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#F66";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(xPixel, yPixel, 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
  }
});

const getNearestJointValues = (
  xMs: number,
  recordedPositions: RecordedPositions,
  datasets: ChartDataset<'line'>[]
): { label: CanvasKeypointName; y: number }[] => {
  return datasets.map((dataset) => {
    const rawLabel = dataset.label ?? '';
    const jointLabel = rawLabel
      .toLowerCase()
      .replace(/ (angle)/, '')
      .replace(/\s+/g, '_') as CanvasKeypointName;

    const jointData = recordedPositions[jointLabel] ?? [];

    const nearest = jointData.reduce((prev, curr) =>
      Math.abs(curr.timestamp - xMs) < Math.abs(prev.timestamp - xMs) ? curr : prev,
      jointData[0]
    );

    return {
      label: jointLabel,
      y: nearest?.angle ?? null,
    };
  }).filter((val): val is { label: CanvasKeypointName; y: number } => val !== null);
}; 

function customDragger(
  minGap: number = 260, // ms
  dragLimits: DragLimits,
  onDragEnd?: (updatedLines: Record<string, number>) => void,
) {
  let element: IAnnotation | null = null;
  let lastEvent: ChartEvent | null = null;
  let isUpdateScheduled = false;
  let activeKey: string | null = null;
  let dragEndHandler: ((ev: Event) => void) | null = null;

  function createDragEndHandler(chart: ChartJS & { _isDraggingAnnotation: boolean; }): (ev: Event) => void {
    return () => {
      if (typeof onDragEnd === 'function') {
        const annotations = getAllAnnotations(chart);

        ///
        const updated: Record<string, number> = {};

        Object.entries(annotations).forEach(([key, ann]) => {
          if (
            key.startsWith("takeoffLine_") ||
            key.startsWith("landingLine_")
          ) {
            updated[key] = ann.xMin;
          }
        });

        onDragEnd?.(updated);
        ///
      }
      chart._isDraggingAnnotation = false;
      element = null;
      lastEvent = null;
      activeKey = null;

      if (dragEndHandler) {
        window.removeEventListener('mouseup', dragEndHandler);
        window.removeEventListener('touchend', dragEndHandler);
        dragEndHandler = null;
      }
    };
  }

  return {
    id: 'customDragger',

    beforeEvent(chart: ChartJS & {
        _isDraggingAnnotation: boolean;
    }, args: { event: ChartEvent } & { changed?: boolean }) {
      const event = args.event;

      const clientX =
        event.x ?? (event.native as TouchEvent | undefined)?.touches?.[0]?.clientX ?? 0;

      const annotations = getAllAnnotations(chart);
      if (!annotations || typeof annotations !== 'object' || Array.isArray(annotations)) return;

      const xScale = chart.scales.x;
      if (!xScale || xScale.min === undefined || xScale.max === undefined) return;

      const draggableKeys = Object.keys(annotations).filter(key =>
        key.startsWith('takeoffLine_') || key.startsWith('landingLine_')
      );
      for (const key of draggableKeys) {
        const ann = annotations[key];
        if (!ann || ann.type !== 'line') continue;

         const xPixel = xScale.getPixelForValue(ann.xMin);
        // const tolerance = ann.borderWidth / 2;
        ///
        const visibleWidth = ann.borderWidth ?? 2;
        const extraPadding = 10; // ⬅️ área invisible extra para tocar
        const tolerance = visibleWidth / 2 + extraPadding;
        ///

        if (
          (event.type === 'mousedown' || event.native?.type === 'touchstart') &&
          clientX >= xPixel - tolerance &&
          clientX <= xPixel + tolerance
        ) {
          element = ann;
          activeKey = key;
          lastEvent = event;
          chart._isDraggingAnnotation = true;

          dragEndHandler = createDragEndHandler(chart);
          window.addEventListener('mouseup', dragEndHandler);
          window.addEventListener('touchend', dragEndHandler);
          return;
        }
      }

      if (
        (event.type === 'mousemove' || event.native?.type === 'touchmove') &&
        element &&
        lastEvent &&
        activeKey
      ) {
        const prevX =
          lastEvent.x ?? (lastEvent.native as TouchEvent | undefined)?.touches?.[0]?.clientX ?? 0;
        const moveX = clientX - prevX;

        const pixelsPerUnit = xScale.width / (xScale.max - xScale.min);
        const deltaValue = moveX / pixelsPerUnit;

        const nextX = element.xMin + deltaValue;
        const minVisible = xScale.min;
        const maxVisible = xScale.max;

        const margin = (maxVisible - minVisible) * 0.02;
        const safeMin = minVisible + margin;
        const safeMax = maxVisible - margin;

        const limits = dragLimits?.[activeKey];
        if (
          (limits && (nextX < limits.min || nextX > limits.max)) ||
          nextX < safeMin || nextX > safeMax
        ) {
          return;
        }

        const [type, indexStr] = activeKey.split('_'); // Ej: ['takeoffLine', '0']
        const otherKey =
          type === 'takeoffLine' ? `landingLine_${indexStr}` :
          type === 'landingLine' ? `takeoffLine_${indexStr}` : null;

        if (otherKey && annotations[otherKey]) {
          const otherX = annotations[otherKey].xMin;

          if (
            (type === 'takeoffLine' && nextX >= otherX - minGap) ||
            (type === 'landingLine' && nextX <= otherX + minGap)
          ) {
            return; // ❌ Muy cerca de la otra línea del mismo salto
          }
        }

        element.xMin = nextX;
        element.xMax = nextX;

        if (!isUpdateScheduled) {
          isUpdateScheduled = true;
          requestAnimationFrame(() => {
            chart.update('none');
            isUpdateScheduled = false;
          });
        }

        lastEvent = event;
        args.changed = true;
        return;
      }
    }
  };
}

const Index = ({
  joints,
  valueTypes = [Kinematics.ANGLE],
  recordedPositions = undefined,
  onVerticalLineChange,
  parentStyles = "relative w-full flex flex-col items-center justify-start h-[50vh]",
  verticalLineValue = 0,
  hiddenLegendsRef,
  onToggleLegend,
  annotations,
  dragLimits,
  onDraggableLinesUpdated,
}: IndexProps) => {
  const [isZoomed, setIsZoomed] = useState(false);
  const tooltipXRef = useRef<number>(0);

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
    let datasetIndex = 0;

    joints.forEach((joint) => {
      const jointData = chartData[joint];
      if (!jointData) return;
  
      const baseColor = jointData.color.borderColor;
      const baseBackgroundColor = jointData.color.backgroundColor;
  
      valueTypes.forEach((vType) => {
        const dataPoints = jointData.anglePoints;
  
        result.push({
          label: `${transformJointName(joint)} ${vType}`,
          data: dataPoints,
          borderColor: baseColor,
          backgroundColor: baseBackgroundColor,
          borderWidth: 2,          
          tension: 0, //0.6,
          pointRadius: 0,
          pointHoverRadius: 0,
          pointHoverBorderWidth: 0,
          pointHoverBorderColor: '#F66',
          pointHoverBackgroundColor: 'white',
          pointHitRadius: 0,
          parsing: false,
          cubicInterpolationMode: 'monotone',
          hidden: hiddenLegendsRef?.current?.has(datasetIndex) ?? false
        });

        datasetIndex++;
      });
    });

    return result;
  }, [chartData, joints, valueTypes]);

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
          // Tomamos el primer timestamp como referencia (cero milisegundos)
          const start = dataArray[0].timestamp;
          const anglePoints = dataArray.map((d: { timestamp: number; angle: number; }) => ({
            x: (d.timestamp - start), // en ms,
            y: d.angle,
          }));
          newChartData[joint] = {
            anglePoints,
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

  const processedAnnotations = useMemo(() => {
    const updated: Record<string, any> = {};

    Object.entries(annotations ?? {}).forEach(([key, ann]) => {
      if (key.startsWith("takeoffLine_") || key.startsWith("landingLine_")) {
        updated[key] = {
          ...ann,
          draggable: true,
        };
      } else {
        updated[key] = ann;
      }
    });

    return updated;
  }, [annotations]);

  const chartConfig = useMemo<ChartConfiguration>(
    () => ({
      type: "line",
      data: {
        datasets,
      },
      plugins: [
        customDragger(
          100,
          dragLimits!,
          (updatedLines) => {
            onDraggableLinesUpdated?.(updatedLines)
          },
        ),
        customCrosshairPlugin({
          recordedPositions: recordedPositions!,
          tooltipXRef,
          hiddenLegendsRef: hiddenLegendsRef!,
        }),
      ],
      options: {
        responsive: true,
        animation: false,
        maintainAspectRatio: false,
        interaction: {
          mode: "index", //"index","nearest"
          axis: "x",
          intersect: false,
          includeInvisible: false,
        },   
        plugins: {
          zoom: {
            limits: {
              x: {min: 0, max: normalizedMaxX , minRange: 2_000},
              y: {min: -10, max: 200, minRange: 60}
            },
            pan: {
              enabled: false,
              mode: 'xy', // o 'xy'
              threshold: 10_000,
              onPan: ({ chart }: { chart: ChartJS }) => {
                setIsZoomed(true);

                const x = tooltipXRef.current;
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
          annotation: {
            annotations: processedAnnotations ?? {},
          },
          legend: {
            display: true,
            position: "top",
            labels: {
              usePointStyle: true,
              padding: 12,  
              font: { 
                size: 10,
              },
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
            // onClick: () => {},  
            onClick: (e, legendItem, legend) => {
              const chart = legend.chart as ChartJS;
            
              const index = legendItem.datasetIndex;
              if (typeof index !== 'number') return;
            
              const meta = chart.getDatasetMeta(index);
              const isCurrentlyHidden = meta.hidden ?? false;
              meta.hidden = !isCurrentlyHidden;
            
              // Capturamos el valor actual visible antes del update
              const activeTooltipPoint = chart.tooltip?.dataPoints?.[0];
              const xValueBeforeUpdate = tooltipXRef.current ?? activeTooltipPoint?.parsed?.x;

              onToggleLegend?.(index, meta.hidden);            
              // chart.update();
            
              const allHidden = areAllDatasetsHidden(chart);
            
              if (allHidden) {
                chart.setActiveElements([]);
                chart.update();
                chart.draw();
                return;
              }
            
              // ✅ Solo usar xValueBeforeUpdate, NO verticalLineValue
              if (xValueBeforeUpdate === undefined) return;
            
              tooltipXRef.current = xValueBeforeUpdate 
            
              const activeElements: { datasetIndex: number; index: number }[] = [];
            
              chart.data.datasets.forEach((dataset, datasetIndex) => {
                const meta = chart.getDatasetMeta(datasetIndex);
                if (meta.hidden) return;
            
                const points = dataset.data as { x: number; y: number }[];
            
                let closestIndex = 0;
                let minDiff = Infinity;
            
                points.forEach((point, index) => {
                  const diff = Math.abs(point.x - xValueBeforeUpdate);
                  if (diff < minDiff) {
                    minDiff = diff;
                    closestIndex = index;
                  }
                });
            
                activeElements.push({ datasetIndex, index: closestIndex });
              });
              
              chart.setActiveElements(activeElements);
              chart.update();
              chart.draw();
            },                                                        
          },
          tooltip: {
            enabled: false,
            boxPadding: 6,
            external: (context) => {            
              const chart = context.chart;
              if (areAllDatasetsHidden(chart)) return;
            
              const tooltip = context.tooltip;
              const { dataPoints, caretX } = tooltip;
            
              if (!dataPoints || dataPoints.length === 0) return;
            
              const xScale = chart.scales["x"];
              const xMs = xScale.getValueForPixel(caretX)!; // ✅ valor real en milisegundos
            
              tooltipXRef.current = xMs; // Guarda para el plugin
            
              const values = getNearestJointValues(
                xMs, 
                recordedPositions!, 
                context.chart.data.datasets as ChartDataset<'line'>[]
              );
            
              onVerticalLineChange({
                x: xMs / 1000, // 🎯 segundos para el componente padre
                values,
              });
            }        
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
              stepSize: 1_000,
              maxTicksLimit: 12_000,
              callback: (value) => {
                // Si el valor es negativo, no se muestra nada.
                if (Number(value) < 0 || datasets.length === 0) return "";

                const seconds = Number(value) / 1000;
                
                return seconds.toFixed(0);
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
    }),[JSON.stringify(datasets), JSON.stringify(annotations)]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    chartRef.current = new ChartJS(ctx, chartConfig);

    chartRef.current.data.datasets.forEach((_, datasetIndex) => {
      const meta = chartRef.current!.getDatasetMeta(datasetIndex);
      meta.hidden = hiddenLegendsRef?.current?.has(datasetIndex) ?? false;
    });
    chartRef.current.update();

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [chartConfig]);

  useEffect(() => {
    const chart = chartRef.current as ChartJS;
    if (!chart || verticalLineValue === undefined) return;
    // console.log('PoseChart verticalLineValue', verticalLineValue)
    // console.log('recordedPositions ', recordedPositions)
  
    // Actualiza la línea vertical normalmente
    const activeElements: { datasetIndex: number; index: number }[] = [];
  
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const points = dataset.data as DataPoint[];
  
      let closestIndex = 0;
      let minDiff = Infinity;
  
      points.forEach((point, index) => {
        const xVal = point?.x;
        if (xVal === undefined) return;
  
        const diff = Math.abs(Number(xVal) - verticalLineValue);
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = index;
        }
      });
  
      activeElements.push({ datasetIndex, index: closestIndex });
    });
  
    const allIndexesAreZero = activeElements.every(el => el.index === 0);

    const anyDatasetVisible = chart.data.datasets.some((_, i) => {
      const meta = chart.getDatasetMeta(i);
      return meta.hidden !== true;
    });

    if (activeElements.length > 0 && !allIndexesAreZero) {
      tooltipXRef.current = verticalLineValue;

      chart.setActiveElements(activeElements);

      if (anyDatasetVisible) {
        chart.update();
        chart.draw();
      }
    } else {      
      // Si todos eran 0, entonces limpiar tooltip y línea
      chart.setActiveElements([]);

      tooltipXRef.current = 0;
      chart.update();
      chart.draw();
    }
  }, [verticalLineValue, chartData]); 
 
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
          <ArrowsPointingInIcon 
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
