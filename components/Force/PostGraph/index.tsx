import { useEffect, useMemo, useRef, useState } from "react";
import {Chart as ChartJS, ChartConfiguration, registerables, ActiveDataPoint, ChartEvent} from 'chart.js';
import { lttbDownsample } from "@/services/chart";
import annotationPlugin from 'chartjs-plugin-annotation';
import zoomPlugin from 'chartjs-plugin-zoom';
import { ViewfinderCircleIcon } from "@heroicons/react/24/solid";

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
  maxPoint: number;
  displayAnnotations: boolean;
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
      ctx.strokeStyle = "rgb(75, 192, 192)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(chartArea.left, yPixel);
      ctx.lineTo(chartArea.right, yPixel);
      ctx.stroke();
      ctx.restore();
    });
  },
});

const Index: React.FC<IndexProps> = ({
  rawSensorData,
  maxPoint,
  displayAnnotations = true,  
}) => {
  const [isZoomed, setIsZoomed] = useState(false);

  // --- Cofiguración del gráfico ----
  const chartRef = useRef<ChartJS | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  // Mapeamos los datos para adaptarlos a la función lttbDownsample
  // Convertimos "time" a "x" y de microsegundos a milisegundos
  const mappedData = useMemo(() => {
    // Calcular la media y desviación estándar de la fuerza
    const values = rawSensorData.map(p => p.force);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const std = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);

    // Filtrar outliers (por ejemplo, fuera de 2 desviaciones estándar)
    const cleaned = rawSensorData.filter(p => {
      return Math.abs(p.force - mean) <= 2 * std;
    });

    // Mapear a datos de Chart.js
    return cleaned.map(point => ({
      x: point.time / 1000, // ms
      y: point.force,       // kg
    }));   
  }, [rawSensorData]);
  
  // Aplicamos la función de downsampling usando useMemo para optimizar
  const decimationThreshold = 600;
  const downsampledData = useMemo(() => {
    return lttbDownsample(mappedData, decimationThreshold);
  }, [JSON.stringify(mappedData), decimationThreshold]);

  const minTime = downsampledData.length > 0 ? downsampledData[0].x : 0;
  const maxTime = downsampledData.length > 0 ? downsampledData[downsampledData.length - 1].x : 1000;

  const chartConfig = useMemo<ChartConfiguration>(
    () => ({
      type: "line",
      plugins: [
        customCrosshairPlugin(),
      ],
      data: {
        // labels: downsampledData.map(point => point.x),
        datasets: [
          {
            label: 'Force (kg)',
            // data: downsampledData.map(point => point.y),
            data: downsampledData.map(point => ({
              x: point.x, // segundos
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
              const label = tooltipModel.body?.[0]?.lines?.[0] || "";
              tooltipRef.current.innerHTML = `Current: <strong>${label}</strong>`;

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
                max: maxPoint,
                minRange: 1,
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
              topLine: {
                type: 'line',
                display: Boolean(displayAnnotations && mappedData.length),
                yMin: maxPoint ?? 0,
                yMax: maxPoint ?? 0,
                borderColor: 'rgba(239, 68, 239, 0.60',
                borderWidth: 2,
                borderDash: [6, 4],
                label: {
                  content: `Max: ${(maxPoint ?? 0).toFixed(2)} kg`,
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
          },
        },
      },
    }), [downsampledData]);

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
    <section className='relative bg-white rounded-lg pl-2 pr-1 pt-6 pb-2 mt-2'>
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
          <span>Max: <strong>{maxPoint.toFixed(2)} kg</strong></span> 
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