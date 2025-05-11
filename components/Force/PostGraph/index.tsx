import { useEffect, useMemo, useRef, useState } from "react";
import {Chart as ChartJS, ChartConfiguration, registerables, ActiveDataPoint, ChartEvent} from 'chart.js';
import { getMaxYValue, lttbDownsample } from "@/utils/chart";
import annotationPlugin, { AnnotationOptions } from 'chartjs-plugin-annotation';
import zoomPlugin from 'chartjs-plugin-zoom';
import { ViewfinderCircleIcon } from "@heroicons/react/24/solid";
import { adjustCyclesByZeroCrossing, Cycle, detectOutlierEdges } from "@/utils/force";
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

function calculateReferenceBaseline(data: { x: number; y: number }[], cycles: Cycle[]) {
  if (cycles.length < 3) {
  console.warn("No se encontraron ciclos intermedios para calcular la referencia.");
  return 0;
};

  // Filtrar los ciclos intermedios (evitamos el primero y el último)
  const middleCycles = cycles.slice(1, cycles.length - 1);

  // Obtener los mínimos locales de cada ciclo intermedio
  const minValues = middleCycles.map((cycle) => {
    const range = data.filter(p => p.x >= cycle.startX! && p.x <= cycle.endX!);
    return Math.min(...range.map(p => p.y));
  });

  // Calcular la media de esos mínimos como referencia
  return minValues.length ? minValues.reduce((a, b) => a + b, 0) / minValues.length : 0;
};

const Index: React.FC<IndexProps> = ({
  rawSensorData,
  displayAnnotations = true,
}) => {
  const { 
    cycles, 
    setCycles,
  } = useBluetooth();

  const { settings } = useSettings();
  const { cyclesToAverage, outlierSensitivity } = settings.force;

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
  }, [rawSensorData]);
  
  // Aplicamos la función de downsampling usando useMemo para optimizar
  const decimationThreshold = 600;
  const downsampledData = useMemo(() => {
    return lttbDownsample(mappedData, decimationThreshold);
  }, [JSON.stringify(mappedData), decimationThreshold]);

  const minTime = downsampledData.length > 0 ? downsampledData[0].x : 0;
  const maxTime = downsampledData.length > 0 ? downsampledData[downsampledData.length - 1].x : 1000; 

  const [adjustedCycles, setAdjustedCycles] = useState<Cycle[]>([]);
  const [topLineValue, setTopLineValue] = useState(0);
  const [crossLineValue, setCrossLineValue] = useState(0);

  useEffect(() => {
    if (!downsampledData.length) return;

    // 1️⃣ Paso 1: Calcular el valor máximo para la línea superior
    const maxY = Math.max(...downsampledData.map(p => p.y));
    setTopLineValue(maxY);

    // 2️⃣ Paso 2: Calcular la referencia dinámica a partir de los mínimos de los ciclos intermedios
    const referenceBaseline = calculateReferenceBaseline(mappedData, cycles);
    // console.log(`🔎 Línea de referencia (baseline):`, referenceBaseline);

    // 3️⃣ Paso 3: Filtrar valores extremos que estén por debajo de esa línea
    const cleanedInitialData = mappedData.filter((p) => p.y >= referenceBaseline - 0.1);

    // 4️⃣ Paso 4: Calcular meanY y stdDev sobre los datos limpios
    const meanY = calculateMeanY(cleanedInitialData) ?? 0;
    const stdDev = calculateStandardDeviation(cleanedInitialData);

    // console.log("meanY después de limpiar extremos:", meanY);

    // 5️⃣ Paso 5: Aplicar el filtro de outliers
    const filteredData = cleanedInitialData.filter(
      (p) => Math.abs(p.y - meanY) < outlierSensitivity * stdDev
    );

    // 6️⃣ Paso 6: Detectar outliers internos
    const { startOutlierIndex, endOutlierIndex } = detectOutlierEdges(filteredData);

    const trimmedData = startOutlierIndex || endOutlierIndex
      ? filteredData.slice(
          startOutlierIndex ?? 0,
          endOutlierIndex !== null ? endOutlierIndex + 1 : undefined
        )
      : filteredData;

    const crossLine = calculateMeanY(trimmedData) ?? 0;
    setCrossLineValue(crossLine);

    // 7️⃣ Paso 7: Calcular ciclos ajustados
    const { adjustedCycles } = adjustCyclesByZeroCrossing(
      mappedData,
      crossLine,
      cycles,
      cyclesToAverage
    );
    setAdjustedCycles(adjustedCycles);
    
  }, [downsampledData, mappedData]);

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
  }, [downsampledData, adjustedCycles]); 

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
                  setIsZoomed(false);

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
  
    // console.log('cycles ', validCycles)
    // console.log('liveCycles ', liveCycles)
    setCycles(validCycles);
  }, [adjustedCycles]);

  
  ///
  
  const leftTrimmerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    console.log('startPosition ', startPosition)

    console.log(leftTrimmerRef.current?.clientLeft)
    console.log(leftTrimmerRef.current?.offsetLeft)
  }, [isZoomed])

  const [startPosition, setStartPosition] = useState(0); // Posición inicial (0%)
  const [endPosition, setEndPosition] = useState(100);   // Posición inicial (100%)
  const [dragging, setDragging] = useState<null | 'start' | 'end'>(null);

  const [lineHeight, setLineHeight] = useState(0);
  const [lineOffsetY, setLineOffsetY] = useState(0);
  const [lineOffsetX, setLineOffsetX] = useState(0);
  const [chartWidth, setChartWidth] = useState(0);
  const [yAxisWidth, setYAxisWidth] = useState(0);
  const [initialDragOffset, setInitialDragOffset] = useState(0);

  const handleTouchStart = (e: React.TouchEvent, type: 'start' | 'end') => {
    if (leftTrimmerRef.current) {
      // Obtenemos la posición inicial del trimmer respecto al viewport
      const trimmerRect = leftTrimmerRef.current.getBoundingClientRect();
      setInitialDragOffset(e.touches[0].clientX - trimmerRect.left); 
    }

    setDragging(type);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
  if (!dragging) return;

  const chart = ChartJS.getChart(canvasRef.current!);
  if (!chart) return;

  const { left, right } = chart.chartArea;
  const touch = e.touches[0];

  // 🔥 Corregimos el cálculo para que no sobrepase el final del gráfico
  // Y restamos el desplazamiento inicial guardado
  const offsetX = touch.clientX - left - initialDragOffset;
  const barWidth = 8; // px

  // ✨ Limitamos el máximo desplazamiento al área real del gráfico
  const maxOffset = right - left - barWidth;
  const limitedOffset = Math.min(Math.max(0, offsetX), maxOffset);

  // 🔄 Cálculo en porcentaje para sincronizar la posición
  const scaledOffset = (limitedOffset / chartWidth) * 100;

  if (dragging === 'start') {
    setStartPosition(Math.max(0, Math.min(scaledOffset, endPosition - 1)));
  } else if (dragging === 'end') {
    setEndPosition(Math.max(startPosition + 1, Math.min(scaledOffset, 100)));
  }
};


  const handleTouchEnd = () => {
    setDragging(null);
  };

  useEffect(() => {
    if (canvasRef.current) {
      const chart = ChartJS.getChart(canvasRef.current);
      if (chart) {
        // Obtener el área del gráfico
        const { top, bottom, left, right } = chart.chartArea;
        const height = bottom - top;
        const width = right - left;

        const containerLeft = canvasRef.current.getBoundingClientRect().left;
        const axisWidth = left - containerLeft;

        // Ajustar el alto y la posición
        setLineHeight(height);
        setLineOffsetY(top); // 👈 Sincronización con el dibujo
        setChartWidth(width); // 👈 Ancho efectivo del gráfico
        setLineOffsetX(left);

        setYAxisWidth(axisWidth);
      }
    }
  }, [canvasRef]);

  ///

  return (
    <section className='relative border-gray-200 border-2 dark:border-none bg-white rounded-lg pl-2 pr-2 pt-6 pb-2 mt-2'>
      {/* Líneas flotantes sin bloquear el gráfico */}
      <div
        ref={leftTrimmerRef}
        className={`absolute bg-gray-500 opacity-60 w-2 z-40 touch-none rounded-r-lg ${isZoomed 
          ? "hidden"
          : ""
          }`}
        style={{ 
          left: `calc(${lineOffsetX + yAxisWidth + (chartWidth * (startPosition / 100))}px)`,
          height: `${lineHeight}px`,
          top: `calc(${lineOffsetY}px + 24px)`,
        }}
        onTouchStart={(e) => handleTouchStart(e, 'start')} 
        onTouchMove={handleTouchMove} // 👈 Ahora directamente aquí
        onTouchEnd={handleTouchEnd}   // 👈 Sin necesidad del useEffect       
        /> 
      {/* <div
        className='absolute top-0 h-full bg-green-500 opacity-60 w-[2px] z-10 touch-none'
        style={{ left: `${endPosition}%` }}
        onTouchStart={(e) => handleTouchStart(e, 'end')}
      /> */}
      <canvas 
        ref={canvasRef} 
        className='bg-white'
        />

      {isZoomed ? (
        <ViewfinderCircleIcon 
          className="absolute bottom-0 left-0 p-1 pl-0 w-8 h-8 text-gray-400"
          onClick={() => {
            if (chartRef.current && chartRef.current.options.scales) {
              // Ajustar los límites manualmente
              chartRef.current.options.scales.x!.min = cycles[0].startX ?? 0;
              chartRef.current.options.scales.x!.max = 
                cycles[cycles.length - 1].endX ?? downsampledData[downsampledData.length - 1].x;

              // También asegurarse de que el eje `y` esté correctamente reescalado
              const maxY = getMaxYValue(chartRef.current);
              // Calculamos un margen del 10% sobre el valor máximo (ajustable)
              const marginTop = maxY * 0.2;
              chartRef.current.options.scales.y!.min = 'original';
              chartRef.current.options.scales.y!.max = maxY + marginTop; 

              chartRef.current.update();
            }

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