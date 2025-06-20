import { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from "react";
import {Chart as ChartJS, ChartConfiguration, registerables, ActiveDataPoint, ChartEvent} from 'chart.js';
import { IAnnotation, getAllAnnotations, getMaxYValue, lttbDownsample } from "@/utils/chart";
import annotationPlugin, { AnnotationOptions } from 'chartjs-plugin-annotation';
import zoomPlugin from 'chartjs-plugin-zoom';
import { adjustCyclesByZeroCrossing, calculateRFDInRange, Cycle, detectOutlierEdgesByFlatZones, IRFDData } from "@/utils/force";
import { useBluetooth } from "@/providers/Bluetooth";
import { useSettings } from "@/providers/Settings";
import { ArrowsPointingInIcon, ArrowsPointingOutIcon } from "@heroicons/react/24/outline";

// Registrar los componentes necesarios de Chart.js, incluyendo el plugin de anotaciones
ChartJS.register(
  ...registerables,
  annotationPlugin,
  zoomPlugin,
);

// Define el tipo para cada punto de datos
export interface DataForcePoint {
  time: number;  // Tiempo en microsegundos (se convertirá a ms)
  force: number; // Fuerza en kg
}

export type PostGraphHandle = {
  getRFD: () => IRFDData | null;
  adjustedCycles: Cycle[];
}

interface IndexProps {
  rawSensorData: DataForcePoint[];
  displayAnnotations: boolean;
  workLoad: number | null;
}

const safetyDraggerMarginFactor = 0.02;
function customDragger(
  minGap: number = 260, // ms
  onDragEnd?: (range: { start: number; end: number }) => void,
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
        const startX = annotations['startVerticalLine']?.xMin ?? null;
        const endX = annotations['endVerticalLine']?.xMin ?? null;
        if (startX !== null && endX !== null) {
          onDragEnd({ start: startX, end: endX });
        }
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

      const draggableKeys = ['startVerticalLine', 'endVerticalLine'];
      for (const key of draggableKeys) {
        const ann = annotations[key];
        if (!ann || ann.type !== 'line') continue;

        const xPixel = xScale.getPixelForValue(ann.xMin);
        const tolerance = 6; // ann.borderWidth / 2;

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

        const startX = annotations['startVerticalLine']?.xMin;
        const endX = annotations['endVerticalLine']?.xMin;

        if (nextX < safeMin || nextX > safeMax) return;

        if (
          (activeKey === 'startVerticalLine' && endX !== undefined && nextX >= endX - minGap) ||
          (activeKey === 'endVerticalLine' && startX !== undefined && nextX <= startX + minGap)
        ) {
          return; // ❌ Bloquear si se rompe la distancia mínima
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

function customCrosshairPlugin(isActive: boolean = true) { 
  return {
    id: 'customCrosshair',
    afterEvent(chart: ChartJS & {
      _isDraggingAnnotation?: boolean;
      _customCrosshairX?: number | undefined;
    }, args: { 
      event: ChartEvent 
    }) {
      if (!isActive) return;

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
      if (!isActive) return;

      // ❌ Bloquear si se está arrastrando una anotación
      if (chart._isDraggingAnnotation) return;

      const x = chart._customCrosshairX;
      if (!x) return;

      const { ctx, chartArea, scales } = chart;
      const xScale = scales['x'];
      const yScale = scales['y'];
    
      const xValue = xScale.getValueForPixel(x);
      const xPixel = x;
    
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

        // ⚠️ Ignorar si y está fuera del rango visible
        if (closestPoint.y < yScale.min || closestPoint.y > yScale.max) return;
    
        const yPixel = yScale.getPixelForValue(closestPoint.y);

        // Dibujar línea horizontal en y = yPixel
        ctx.save();
        ctx.strokeStyle = "rgb(75, 192, 192)";
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
    },
  }
};

function positionVerticalLineAtEdge(
  chart: ChartJS, 
  id: 'startVerticalLine' | 'endVerticalLine', 
  min: number,
  max: number,
) {
  const annotations = chart.options.plugins?.annotation?.annotations;
  if (!annotations || typeof annotations !== 'object' || Array.isArray(annotations)) return;

  const margin = (max - min) * safetyDraggerMarginFactor;
  const safeMin = min + margin;
  const safeMax = max - margin;

  const targetX =
    id === 'startVerticalLine'
      ? safeMin ?? 0
      : safeMax ?? 0;

  const annotation = (annotations as Record<string, {type: 'line', xMin: number, xMax: number}>)[id];
  if (!annotation || annotation.type !== 'line') return;

  annotation.xMin = targetX;
  annotation.xMax = targetX;
}

function zoomToAnnotationsRange(
  chart: ChartJS | undefined,
  downsampledData: { x: number }[],
  options?: {
    isZoomed?: boolean;
    marginRatioY?: number;
    xMarginPixels?: number;
    clampMinX?: number;
  }
) {
  if (!chart || !chart.options.scales) return;

  const maxY = getMaxYValue(chart);
  const marginY = maxY * (options?.marginRatioY ?? 0.2);
  chart.options.scales.y!.min = undefined;
  chart.options.scales.y!.max = maxY + marginY;

  // Si NO está activado el zoom → mostrar todo el dataset
  if (options?.isZoomed === false) {
    const min = downsampledData.at(0)?.x ?? 0;
    const max = downsampledData.at(-1)?.x ?? 10000;

    chart.zoomScale('x', { min, max }, 'default');
    chart.update();
    return;
  }

  // Zoom entre líneas de anotación
  const annotations = getAllAnnotations(chart);
  const startLine = annotations['startVerticalLine'];
  const endLine = annotations['endVerticalLine'];

  const startX = startLine?.xMin ?? 0;
  const endX = endLine?.xMax ?? downsampledData.at(-1)?.x ?? 10000;

  const chartWidthPx = chart.width;
  const xVisibleRange = endX - startX || 1000;
  const msPerPixel = xVisibleRange / chartWidthPx;
  const pixelMargin = options?.xMarginPixels ?? 8;
  const xMargin = msPerPixel * pixelMargin;

  const rawMin = startX - xMargin;
  const rawMax = endX + xMargin;

  const clampMin = options?.clampMinX ?? 0;
  const min = Math.max(rawMin, clampMin);
  const max = rawMax;

  if (min >= max) return;

  chart.zoomScale('x', { min, max }, 'default');
  chart.update();
}

function calculateMeanY(data: { x: number; y: number }[]): number | null {
  if (!data.length) return null;

  const total = data.reduce((sum, point) => sum + point.y, 0);
  return total / data.length;
}

function calculateStandardDeviation(data: { y: number }[]) {
  if (!data.length) return 0;

  // Calcula la media
  const mean = data.reduce((acc, point) => acc + point.y, 0) / data.length;

  // Calcula la desviación estándar
  const variance =
    data.reduce((acc, point) => acc + Math.pow(point.y - mean, 2), 0) /
    data.length;

  return Math.sqrt(variance);
};

const Index = forwardRef<PostGraphHandle, IndexProps>(({
  rawSensorData,
  displayAnnotations = true,
  workLoad = null,
}, ref) => {
  const { setCycles } = useBluetooth();

  const { settings } = useSettings();
  const { cyclesToAverage, outlierSensitivity } = settings.force;

  const [isZoomed, setIsZoomed] = useState(false);
  const [minRangeX, setMinRangeX] = useState(4_000);

  const [RFD, setRFD] = useState<IRFDData | null>(null);

  // --- Cofiguración del gráfico ----
  const chartRef = useRef<ChartJS | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  
  // Mapeamos los datos para adaptarlos a la función lttbDownsample
  const mappedData = useMemo(() => {
    if (rawSensorData.length === 0) {
      return [];
    };

    return rawSensorData.map(point => ({
      x: point.time / 1_000, // ms
      y: point.force,       // kg
    }));
  }, [rawSensorData]);
  
  // Aplicamos la función de downsampling usando useMemo para optimizar
  const decimationThreshold = 600;
  const downsampledData = useMemo(() => {
    return lttbDownsample(mappedData, decimationThreshold);
  }, [JSON.stringify(mappedData), decimationThreshold]);

  const [adjustedCycles, setAdjustedCycles] = useState<Cycle[]>([]);
  const [topLineValue, setTopLineValue] = useState(0);
  const [crossLineValue, setCrossLineValue] = useState(0);

  const [trimLimits, setTrimLimits] = useState<{ start: number; end: number } | null>(null);

  const cycleAnnotations: Record<string, AnnotationOptions> = useMemo(() => {
    if (!adjustedCycles || !adjustedCycles?.length) return {};

    const validCycles = [...adjustedCycles]
      .filter(cycle => cycle.startX! < cycle.endX!) // filtro base
      .filter((cycle, index, array) => {
        // Si es el último, no tiene siguiente → se acepta
        if (index === array.length - 1) return true;

        // Verifica que no se solape hacia adelante
        return cycle.startX! < array[index + 1].endX!;
      });
  
    return validCycles.reduce((acc, cycle, index) => {
      const isEven = index % 2 === 0;

      const backgroundColor = isEven
          ? 'rgba(93, 173, 236, 0.4)'  // azul A
          : 'rgba(0, 200, 83, 0.2)'; //'rgba(144, 202, 249, 0.4)';// azul B
      const borderColor = isEven
          ? 'rgba(93, 173, 236, 0)'  // azul A
          : 'rgba(144, 202, 249, 0)';// azul B

      acc[`cycleBox${index}`] = {
        type: 'box',
        xMin: cycle.startX!,
        xMax: cycle.endX!,
        yMin: 'min',
        yMax: 'max',
        backgroundColor: backgroundColor,
        borderColor: borderColor,
        borderWidth: 1,
        label: {
          display: true,
          position: {x: 'center', y: 'start'},
          yAdjust: -5.6,
          content: `# ${index + 1}`,
          color: '#1565c0',
          font: {
            size: 12,
            weight: 'bold',
            style: 'italic'
          },
        }
      };
      return acc;
    }, {} as Record<string, AnnotationOptions>);
  }, [downsampledData, adjustedCycles]); 

  const chartConfig = useMemo<ChartConfiguration>(
    () => {
      return {
        type: "line",
        plugins: [
          customDragger(
            100,
            setTrimLimits,
          ),
          customCrosshairPlugin(),
        ],
        data: {
          // labels: downsampledData.map(point => point.x),
          datasets: [
            {
              label: 'Force (kg)',
              data: downsampledData.map(point => ({
                x: point.x, // milisegundos
                y: point.y, // fuerza en kg
              })),
              parsing: false,
              fill: false,
              borderWidth: 2,
              borderColor: 'rgb(75, 192, 192)',
              tension: 0.1,
              pointRadius: 0,
              pointHoverRadius: 0,
              pointHoverBorderWidth: 0,
              pointHoverBorderColor: '#F66',
              pointHoverBackgroundColor: '#F66',
              pointHitRadius: 0,
            },
          ],
        },
        options: {
          responsive: true,
          animation: false,
          interaction: {
            mode: "nearest",
            axis: "x",
            intersect: false,
          },
          plugins: {
            title: {
              display: false,
              text: 'Force vs Time',
            },
            legend: {
              display: false,
            },
            tooltip: {
              enabled: false,
              external: function (context) {
                if (!tooltipRef.current) return; 

                const tooltipModel = context.tooltip;
                if (tooltipModel.opacity === 0) {
                  tooltipRef.current.style.opacity = "0";
                  return;
                }

                // ✅ Obtener el contenido del tooltip
                const labelY = tooltipModel.body?.[0]?.lines?.[0] || "";
                const rawLabelX = tooltipModel.dataPoints?.[0]?.parsed?.x;
                const labelX =
                  rawLabelX !== undefined
                    ? (Number(rawLabelX) / 1000).toFixed(2)
                    : "";
                tooltipRef.current.innerHTML = `Current: <strong>${labelY}</strong> at ${labelX} s`;

                tooltipRef.current.style.opacity = "1";
                tooltipRef.current.style.fontSize = "16px";
              },
              intersect: false,
              callbacks: {
                title: function (context) {
                  if (!context.length) return ""; // Evitar errores si no hay datos

                  const firstPoint = context[0]; // Tomamos el primer punto del tooltip
                  const timeValue = parseFloat(firstPoint.label as string); // Convertir `label` a número

                  if (isNaN(timeValue)) return "Unknown time"; // Manejo de errores

                  return `Time: ${(timeValue / 1000).toFixed(2)} s`;
                },
                label: function (context) {
                  const raw = context.raw as { x: number; y: number };
                  const value = raw.y; // fuerza en kg
                  const datasetLabel = context.dataset.label || "";

                  if (datasetLabel.includes("Force")) {
                    return ` ${value.toFixed(2)} kg`;
                  }

                  return `${datasetLabel}: ${value}`;
                }
              }
            },  
            zoom: {
              limits: {
                x: {
                  min: 0,
                  max: 30_000,
                  minRange: minRangeX, 
                },
                y: {
                  min: 'original',
                  max: topLineValue,
                  minRange: 0.8,
                },
              },
              pan: {
                enabled: isZoomed,
                mode: 'x', // o 'xy'
                threshold: 10,
                onPanStart: ({ chart, event }: { chart: ChartJS; event: {
                  srcEvent: PointerEvent | MouseEvent | TouchEvent;
                } }) => {                 
                  const pointerEvent = event?.srcEvent as PointerEvent;
                  if (!pointerEvent) return;

                  // Coordenada precisa sobre el canvas
                  const canvasX = pointerEvent.offsetX;

                  // Mayor tolerancia si es touch
                  const isTouch = pointerEvent.pointerType === 'touch' || 'ontouchstart' in window;

                  const annotations = getAllAnnotations(chart);
                  const keysToCheck = ['startVerticalLine', 'endVerticalLine'];

                  for (const key of keysToCheck) {
                    const annotation = annotations[key];
                    if (!annotation || annotation.type !== 'line' || annotation.xMin !== annotation.xMax) continue;

                    const xValue = annotation.xMin;
                    const xCenter = chart.scales.x.getPixelForValue(xValue);

                    if (isNaN(xCenter)) {
                      console.warn(`⚠️ No se pudo calcular el pixel de la línea '${key}'`);
                      continue;
                    }

                    const rawTolerance = (annotation.borderWidth ?? 8) / 2;
                    const tolerance = Math.max(rawTolerance, isTouch ? 10 : 5);
                    const distance = Math.abs(canvasX - xCenter);

                    // console.log(`📍 Touch X: ${canvasX}, línea '${key}' X: ${xCenter}, distancia: ${distance}, tolerancia: ${tolerance}`);

                    const marginExtra = isTouch ? 4 : 0.5;
                    if (distance <= tolerance + marginExtra) {
                      // console.log(`⛔ Pan cancelado sobre línea '${key}'`);
                      return false;
                    }
                  }
                },
                onPan: ({ chart }: { chart: ChartJS & { _customCrosshairX?: number; } }) => {
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
            // Configuración de anotaciones
            annotation: {
              annotations: {
                ...cycleAnnotations,
                startVerticalLine: {
                  type: 'line',
                  xMin: trimLimits?.start ?? 0,
                  xMax: trimLimits?.start ?? 0,
                  borderColor: 'rgba(43, 87, 232, 0.6)', // 'rgba(219, 211, 43, 0.75)',
                  borderWidth: 2,              
                  label: {
                    enabled: false,
                    content: '',
                    position: 'end',
                  },
                  draggable: true,
                },
                endVerticalLine: {
                  type: 'line',
                  xMin: trimLimits?.end ?? 0,
                  xMax: trimLimits?.end ?? 0,
                  borderColor: 'rgba(43, 87, 232, 0.6)', // 'rgba(219, 211, 43, 0.75)',
                  borderWidth: 2,
                  label: {
                    enabled: false,
                    content: '',
                    position: 'end',
                  },
                  draggable: true,
                },              
                crossLine: {
                  type: 'line',
                  display: true,
                  yMin: crossLineValue,
                  yMax: crossLineValue,
                  borderColor: 'rgba(68, 68, 239, 0.4)',
                  borderWidth: 1,
                  label: {
                    content: `Avg: ${crossLineValue} kg`,
                    display: false,
                    position: 'start',
                  },
                },
                topLine: {
                  type: 'line',
                  display: Boolean(displayAnnotations && mappedData.length),
                  yMin: topLineValue ?? 0,
                  yMax: topLineValue ?? 0,
                  borderColor: 'rgba(239, 68, 239, 0.60',
                  borderWidth: 2,
                  borderDash: [6, 4],
                  label: {
                    content: `Max: ${(topLineValue ?? 0).toFixed(2)} kg`,
                    display: false,
                    position: 'start',
                  },
                }
              }
            },
          },
          scales: {
            x: {
              type: 'linear',
              position: 'bottom',
              title: {
                display: false,
                text: 'Time (ms)',
              },
              ticks: {
                stepSize: 1000,
                callback: (value) => {
                  const numValue = Number(value);
                  return numValue >= 0 ? `${(numValue / 1000).toFixed(0)}` : '';
                },
              },
            },
            y: {
              display: true,
              title: {
                display: false,
                text: 'Force (kg)',
              },
              ticks: {
                // stepSize: 0.1,
                callback: (value) => {
                  const numValue = Number(value);
                  if (numValue < 0) return '';
                  return numValue.toFixed(1);
                },
              },
              max: Math.min(1.2 * topLineValue, 2),
            },
          },
        },
      }
  }, [downsampledData, adjustedCycles]);

  const getRFD = (): IRFDData | null => {
    if (adjustedCycles.length !== 1) return null;
    // console.log('calculateRFDInRange... ', adjustedCycles)
    const rfdData = calculateRFDInRange({
      data: mappedData, // downsampledData,
      startX: adjustedCycles[0].startX!,
      endX: adjustedCycles[0].endX!,
      convertToNewtons: false,
    });

    // console.log('rfdData ', rfdData)
    if (!rfdData || RFD) {
      setRFD(null);

      return null;
    }
    else {
      setRFD(rfdData);
  
      return rfdData;
    };
  };

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = chartRef.current;
    const pluginOptions = chart.options.plugins?.annotation;

    if (!pluginOptions) return;

    // Asegura que annotations es un objeto
    if (!pluginOptions.annotations || Array.isArray(pluginOptions.annotations)) {
      pluginOptions.annotations = {};
    }

    const annotations = pluginOptions.annotations as Record<string, AnnotationOptions>;

    if (!RFD) {
      delete annotations['rfdLine'];
      chart.update('none');
      return;
    }

    const { subrange, rfd: rfdValue, areNewtons } = RFD;
    const startX = subrange[0].x;
    const startY = subrange[0].y;
    const endX = subrange[subrange.length - 1].x;
    const endY = subrange[subrange.length - 1].y;
    const units = areNewtons ? "N/s" : "kg/s";

    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / length;
    // const ny = dx / length;
    const offset = 26; // en px
    const xAdjust = (nx * offset) + 72;
    const yAdjust = 0; // ny * offset
    // console.log(xAdjust, ' - ', yAdjust)

    annotations['rfdLine'] = {
      type: 'line',
      display: true,
      xMin: startX,
      yMin: startY,
      xMax: endX,
      yMax: endY,
      borderColor: 'red',
      borderWidth: 4,
      label: {
        display: true,
        content: `RFD: ${rfdValue?.toFixed(2)} ${units}`,
        backgroundColor: 'blue',
        color: 'white',
        font: { size: 16 },
        position: 'start',
        xAdjust,
        yAdjust,
      },
    };

    chart.update('none'); // mantiene zoom y pan
  }, [RFD]);

  useEffect(() => {
    setTrimLimits(null);
  }, []);

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
    if (!downsampledData.length) return;

    const applyTrimLimits = (data: { x: number; y: number }[]) =>
      trimLimits
      ? data.filter(p => p.x >= trimLimits.start && p.x <= trimLimits.end)
      : data;

    // 1️⃣ Filtrado base (sin baseline)
    const targetData = applyTrimLimits(mappedData);
    const meanY = calculateMeanY(targetData) ?? 0;
    const stdDev = calculateStandardDeviation(targetData);

    const filteredData = targetData.filter(
      p => Math.abs(p.y - meanY) < outlierSensitivity * stdDev
    );

    // 2️⃣ Detectar outliers en los extremos
    let trimmedData: { x: number; y: number }[];
    const { startOutlierIndex, endOutlierIndex } = detectOutlierEdgesByFlatZones(filteredData);
    trimmedData = (startOutlierIndex || endOutlierIndex)
      ? filteredData.slice(
          startOutlierIndex ?? 0,
          endOutlierIndex !== null ? endOutlierIndex + 1 : undefined
        )
      : filteredData;

    trimmedData = applyTrimLimits(trimmedData);

    // 3️⃣ Nueva línea de cruce (puede ser un percentil o la media)
    const crossLine = calculateMeanY(trimmedData) ?? 0;
    setCrossLineValue(crossLine);

    // 4️⃣ Línea superior
    const maxY = Math.max(...trimmedData.map(p => p.y));
    setTopLineValue(maxY);

    // 5️⃣ Detectar ciclos desde cero con esa línea de cruce ← no se parte de ningún ciclo preexistente
    const { adjustedCycles } = adjustCyclesByZeroCrossing({
      inputData: trimmedData,
      baseline: crossLine,            
      cyclesToAverage,   // ← cantidad de ciclos para calcular métricas luego
      trimLimits,
      workLoad,
    });
    setAdjustedCycles(adjustedCycles);

  }, [downsampledData, mappedData, trimLimits]);

  useEffect(() => {
    if (!adjustedCycles || !adjustedCycles?.length) return;

    const validCycles = [...adjustedCycles]
      .filter(c => c.startX! < c.endX!)
      .filter((c, i, arr) => i === arr.length - 1 || c.startX! < arr[i + 1].endX!);

    setCycles(validCycles);

    if (chartRef.current && !trimLimits) {
      const min = validCycles[0].startX ?? 0;
      const max = validCycles.at(-1)?.endX ?? downsampledData.at(-1)?.x ?? 10000;

      positionVerticalLineAtEdge(chartRef.current, 'startVerticalLine', min, max);
      positionVerticalLineAtEdge(chartRef.current, 'endVerticalLine', min, max);

      chartRef.current.update();
    }

    // Adaptar el minRange del zoom de forma flexible
    const visibleRange =
      adjustedCycles.length > 1
        ? adjustedCycles[adjustedCycles.length - 1].endX! - adjustedCycles[0].startX!
        : 2_000; // valor por defecto si solo hay 1 ciclo o ninguno
    const adaptiveMinRange = Math.max(300, Math.min(visibleRange * 0.5, 4_000));
    setMinRangeX(adaptiveMinRange);

    // Auto zoom
    zoomToAnnotationsRange(chartRef.current!, downsampledData, {
      isZoomed: true,
      xMarginPixels: 6,
      marginRatioY: 0.2,
      clampMinX: 0,
    });
    setIsZoomed(true);

  }, [adjustedCycles]);

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = chartRef.current;

    // Asegúrate de que los plugins existen
    if (chart.options.plugins?.zoom?.pan) {
      chart.options.plugins.zoom.pan.enabled = isZoomed;
      chart.update();
    }
  }, [isZoomed]);

  useImperativeHandle(ref, () => ({
    getRFD,
    adjustedCycles,
  }));

  return (
    <section className='relative border-gray-200 border-2 dark:border-none bg-white rounded-lg pl-2 pr-2 pt-6 pb-2 mt-2'>
      <canvas 
        ref={canvasRef} 
        className='bg-white'
        />

      {isZoomed ? (
        <ArrowsPointingInIcon 
          className="absolute bottom-0 left-0 p-1 pl-0 w-8 h-8 text-gray-400 cursor-pointer"
          onClick={() => {
            zoomToAnnotationsRange(chartRef.current!, downsampledData, {
              isZoomed: false,
            });
            setIsZoomed(false); // cambia a modo "ver todo"
          }}
        />
      ) : (
        <ArrowsPointingOutIcon
          className="absolute bottom-0 left-0 p-1 pl-0 w-8 h-8 text-gray-400 cursor-pointer"
          onClick={() => {
            zoomToAnnotationsRange(chartRef.current!, downsampledData, {
              isZoomed: true,
              xMarginPixels: 6,
              marginRatioY: 0.2,
              clampMinX: 0,
            });
            setIsZoomed(true); // cambia a modo "zoom entre líneas"
          }}
        />
      )}

      {rawSensorData.length > 0 ? (
        <p className="flex flex-row gap-4 absolute top-1 left-2 text-gray-500 text-[16px]">
          <span>Max: <strong>{topLineValue.toFixed(2)} kg</strong></span> 
        </p>
        ) : null
      }
      <div
        ref={tooltipRef}
        id="custom-tooltip"
        className="absolute top-[0.1rem] right-2 bg-white/0 text-gray-500 px-2 py-0.5 rounded opacity-100 text-[0.8rem] pointer-events-none transition-opacity duration-200"
        />
    </section>
  )
});

Index.displayName = 'PostGraph';

export default Index;