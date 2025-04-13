import { useEffect, useMemo, useRef, useState } from "react";
import {Chart as ChartJS, ChartConfiguration, registerables, ActiveDataPoint, ChartEvent} from 'chart.js';
import { lttbDownsample } from "@/services/chart";
import annotationPlugin, { AnnotationOptions } from 'chartjs-plugin-annotation';
import zoomPlugin from 'chartjs-plugin-zoom';
import { ViewfinderCircleIcon } from "@heroicons/react/24/solid";
import { adjustCyclesByZeroCrossing } from "../utils/adjustCyclesByZeroCrossing";
import { useBluetooth } from "@/providers/Bluetooth";
import { useSettings } from "@/providers/Settings";

// Registrar los componentes necesarios de Chart.js, incluyendo el plugin de anotaciones
ChartJS.register(
  ...registerables,
  annotationPlugin,
  zoomPlugin,
);

// Define el tipo para cada punto de datos
export interface DataPoint {
  time: number;  // Tiempo en microsegundos (se convertirá a ms)
  force: number; // Fuerza en kg
}

interface IndexProps {
  rawSensorData: DataPoint[];
  displayAnnotations: boolean;
}

function customCrosshairPlugin(isActive: boolean = true) { 
  return {
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
        ctx.strokeStyle = "rgb(75, 192, 192)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(chartArea.left, yPixel);
        ctx.lineTo(chartArea.right, yPixel);
        ctx.stroke();
        ctx.restore();
      });
    },
  }
};

function calculateMeanY(data: { x: number; y: number }[]): number | null {
  if (!data.length) return null;

  const total = data.reduce((sum, point) => sum + point.y, 0);
  return total / data.length;
}

const Index: React.FC<IndexProps> = ({
  rawSensorData,
  displayAnnotations = true,
}) => {
  const { cycles, setCycles } = useBluetooth(); // useContext(BluetoothContext);

  const { settings } = useSettings();
  const { cyclesToAverage } = settings.force;

  const [isZoomed, setIsZoomed] = useState(false);

  // --- Cofiguración del gráfico ----
  const chartRef = useRef<ChartJS | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  
  // Mapeamos los datos para adaptarlos a la función lttbDownsample
  const mappedData = useMemo(() => {
    if (rawSensorData.length === 0) return [];

    return rawSensorData.map(point => ({
      x: point.time / 1_000, // ms
      y: point.force,       // kg
    }));
  
    const sigma = 1.5;
    const iqrMultiplier = 1.5;
    const minForceThreshold = 0.1;
    const minSlope = 0.016;
  
    // Detectar el inicio real (cuando la fuerza empieza a subir)
    const findStartIndex = (data: typeof rawSensorData, threshold: number, minSlope: number) => {
      for (let i = 0; i < data.length - 1; i++) {
        const slope = data[i + 1].force - data[i].force;
        if (data[i].force >= threshold && slope > minSlope) {
          return i;
        }
      }
      return 0;
    };
  
    // Detectar el final real (cuando termina de bajar)
    const findEndIndex = (data: typeof rawSensorData, threshold: number, minSlope: number) => {
      for (let i = data.length - 2; i >= 0; i--) {
        const slope = data[i + 1].force - data[i].force;
        if (data[i].force >= threshold && slope < -minSlope) {
          return i + 1;
        }
      }
      return data.length - 1;
    };
  
    const startIdx = findStartIndex(rawSensorData, minForceThreshold, minSlope);
    const endIdx = findEndIndex(rawSensorData, minForceThreshold, minSlope);
  
    // Si no hay un rango válido, devuelve vacío
    if (startIdx >= endIdx) return [];
  
    const trimmedData = rawSensorData.slice(startIdx, endIdx + 1);
  
    const startCut = 1_000_000; // μs
    const endCut = 1_000_000;
    const totalDuration = trimmedData[trimmedData.length - 1].time;
  
    const filteredForStats = trimmedData.filter(p =>
      p.time > startCut && p.time < totalDuration - endCut
    );
  
    const values = filteredForStats.map(p => p.force);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);
  
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - iqrMultiplier * iqr;
    const upperBound = q3 + iqrMultiplier * iqr;
  
    const cleaned = trimmedData.filter(p => {
      const outlierBySigma = Math.abs(p.force - mean) > sigma * std;
      const outlierByIQR = p.force < lowerBound || p.force > upperBound;
      return !outlierBySigma && !outlierByIQR;
    });
  
    return cleaned.map(point => ({
      x: point.time / 1_000, // en milisegundos
      y: point.force,
    }));
  }, [rawSensorData]);
  
  // Aplicamos la función de downsampling usando useMemo para optimizar
  const decimationThreshold = 600;
  const downsampledData = useMemo(() => {
    return lttbDownsample(mappedData, decimationThreshold);
  }, [JSON.stringify(mappedData), decimationThreshold]);

  const minTime = downsampledData.length > 0 ? downsampledData[0].x : 0;
  const maxTime = downsampledData.length > 0 ? downsampledData[downsampledData.length - 1].x : 1000; 

  const crossLineValue = (calculateMeanY(mappedData) ?? 0) * 1;
  const topLineValue = Math.max(...downsampledData.map(p => p.y));

  const adjustedCycles = useMemo(() => {
    const { adjustedCycles } = adjustCyclesByZeroCrossing(mappedData, crossLineValue, cycles, cyclesToAverage);
    // console.log('crossLineValue ', crossLineValue)
    // console.log('baselineCrossSegments ', baselineCrossSegments);

    return adjustedCycles;
  }, [downsampledData]);

  const cycleAnnotations: Record<string, AnnotationOptions> = useMemo(() => {
    if (!adjustedCycles?.length) return {};

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
  }, [adjustedCycles]); 

  const chartConfig = useMemo<ChartConfiguration>(
    () => {
      return {
        type: "line",
        plugins: [
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
              pointHoverRadius: 4,
              pointHoverBorderWidth: 1,
              pointHoverBorderColor: 'red',
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
                  minRange: 4_000, 
                },
                y: {
                  min: 'original',
                  max: topLineValue,
                  minRange: 0.8,
                },
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
            // Configuración de anotaciones
            annotation: {
              annotations: {
                ...cycleAnnotations,
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
              min: minTime,
              max: maxTime,
            },
            y: {
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
    if (!adjustedCycles?.length) return;
  
    const validCycles = [...adjustedCycles]
      .filter(cycle => cycle.startX! < cycle.endX!)
      .filter((cycle, index, array) => {
        if (index === array.length - 1) return true;
        return cycle.startX! < array[index + 1].endX!;
      });

    if (chartRef.current) {
      chartRef.current.zoomScale('x', {
        min: validCycles[0].startX ?? 0,
        max: validCycles[validCycles.length - 1].endX ?? downsampledData[downsampledData.length -1].x,
      });
    }
  
    // console.log('validCycles ', validCycles)
    setCycles(validCycles);
  }, [adjustedCycles]);

  return (
    <section className='relative border-gray-200 border-2 dark:border-none bg-white rounded-lg pl-2 pr-1 pt-6 pb-2 mt-2'>
      <canvas 
        ref={canvasRef} 
        className='bg-white'
        />
      {isZoomed ? (
        <ViewfinderCircleIcon 
        className="absolute bottom-0 left-0 p-1 pl-0 w-8 h-8 text-gray-400"
        onClick={() => {
          chartRef.current?.resetZoom();

          setIsZoomed(false);
        }}
        /> ) : null
      }
      {rawSensorData.length > 0 ? (
        <p className="flex flex-row gap-4 absolute top-1 left-2 text-gray-500 text-[0.8rem]">
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
}

export default Index;