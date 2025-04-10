import React, { useEffect, useMemo, useRef, useState } from 'react';
import {Chart as ChartJS, ChartEvent, ChartConfiguration, registerables} from 'chart.js'; 
import annotationPlugin from 'chartjs-plugin-annotation';
import { lttbDownsample } from '@/services/chart';
import { ForceSettings } from '@/providers/Settings';
import useCyclesDetector from '../Hooks/useCyclesDetector';
import FullTestForceChart from "../PostGraph";

// Registrar los componentes necesarios de Chart.js, incluyendo el plugin de anotaciones
ChartJS.register(
  ...registerables,
  annotationPlugin,
);

// Define el tipo para cada punto de datos
export interface DataPoint {
  time: number;  // Tiempo en microsegundos (se convertirá a ms)
  force: number; // Fuerza en kg
}

// Ahora ampliamos las props para recibir los umbrales
interface IndexProps {
  sensorData: DataPoint[];
  rawSensorData: DataPoint[];
  displayAnnotations: boolean;
  isEstimatingMass: boolean;
  workLoad: number | null;
  settings: ForceSettings;
  isRecording: boolean;
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

    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.strokeStyle = '#F66';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
});

const Index: React.FC<IndexProps> = ({
  sensorData,
  rawSensorData,
  displayAnnotations = true,
  isEstimatingMass = false,
  settings,
  isRecording,
  workLoad,
}) => {
  const {
    movingAverageWindow,
    hysteresis,
  } = settings
  
  // Mapeamos los datos para adaptarlos a la función lttbDownsample
  //  Convertimos "time" a "x" y de microsegundos a milisegundos
  const mappedData = useMemo(() => {
    return sensorData.map(point => ({
      x: point.time / 1000, // ms
      y: point.force,       // kg
    }));    
  }, [sensorData]);
  
  // Aplicamos la función de downsampling usando useMemo para optimizar
  const decimationThreshold = 200;
  const downsampledData = useMemo(() => {
    return lttbDownsample(mappedData, decimationThreshold);
  }, [JSON.stringify(mappedData), decimationThreshold]);

  const {
    cycleCount,
    cycleDuration,
    cycleAmplitude,
    cycleSpeedRatio,
    fatigueStatus,
    recentWindowData: {recentAverageValue: recentAverageForceValue},
    peak: maxPoint, // kg
  } = useCyclesDetector({
    mappedData,
    downsampledData,
    settings,
    workLoad,
  });

  const [cycleData, setCycleData] = useState<{ 
    workLoad: number | null; 
    cycleCount: number | null; 
    cycleDuration: number | null; 
    cycleAmplitude: number | null;
    cycleSpeedRatio: number | null;
  }[]>([]);

  useEffect(() => {
    if (cycleCount === 0) {
      setCycleData([]);
    };

    setCycleData(prevData => {
      const newCycle = { 
        workLoad: workLoad, 
        cycleCount, 
        cycleDuration, 
        cycleAmplitude,
        cycleSpeedRatio,
      };

      const updatedData = [...prevData, newCycle];
      return updatedData;
    });

}, [cycleCount]);

  // ---- Comporbar si hay mas datos que mostrar (scroll) ----
  const [showScrollHint, setShowScrollHint] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkScroll = () => {
      if (scrollContainerRef.current) {
        const { scrollHeight, clientHeight, scrollTop } = scrollContainerRef.current;
        setShowScrollHint(
          scrollHeight > clientHeight && 
          (scrollTop + 1) < (scrollHeight - clientHeight) &&
          scrollHeight - clientHeight > 10
        );
      }
    };

    // Comprobar al montar
    checkScroll();

    // Event listener para ocultar el aviso cuando el usuario hace scroll
    const divElement = scrollContainerRef.current;
    if (divElement) {
      divElement.addEventListener("scroll", checkScroll);
    }

    return () => {
      if (divElement) {
        divElement.removeEventListener("scroll", checkScroll);
      }
    };
  }, [cycleData]);

  // ---- Ventana de tiempo de 10 segundos ----
  const timeWindow = 10_000; // 10 segundos en ms
  const lastTime = downsampledData.length > 0 ? downsampledData[downsampledData.length - 1].x : 0;
  const minTime = downsampledData.length > 0 ? lastTime - timeWindow : undefined;
  const maxTime = downsampledData.length > 0 ? lastTime : undefined;

  // --- Cofiguración del gráfico ----
  const chartRef = useRef<ChartJS | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const chartConfig = useMemo<ChartConfiguration>(
    () => ({
      type: "line",
      plugins: [
        customCrosshairPlugin(),
      ],
      data: {
        labels: downsampledData.map(point => point.x),
        datasets: [
          {
            label: 'Force (kg)',
            data: downsampledData.map(point => point.y),
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
                const value = context.raw as number; // Valor de la serie
                const datasetLabel = context.dataset.label || "";
                
                // Formatear la fuerza con dos decimales y añadir "kg"
                if (datasetLabel.includes("Force")) {
                  return ` ${value.toFixed(2)} kg`;
                }
                
                // Valor por defecto si no es ni tiempo ni fuerza
                return `${datasetLabel}: ${value}`;
              }
            }
          },          
          // Configuración de anotaciones
          annotation: {
            annotations: {
              movingAverageWindowBox: {
                type: 'box',
                display: Boolean(displayAnnotations && mappedData.length),
                xMin: lastTime - movingAverageWindow, // lastTime es el tiempo del último dato
                xMax: lastTime,
                yScaleID: 'y',
                yMin: (ctx) => ctx.chart.scales['y'].min,
                yMax: (ctx) => ctx.chart.scales['y'].max,
                backgroundColor: 'rgba(68, 68, 239, 0.10)',
                borderWidth: 0,
              },
              hysteresisBox: {
                type: 'box',
                display: Boolean(displayAnnotations && mappedData.length),
                xScaleID: 'x',
                yScaleID: 'y',
                // Cubre toda la escala en el eje x
                xMin: (ctx) => ctx.chart.scales['x'].min,
                xMax: (ctx) => ctx.chart.scales['x'].max,
                yMin: recentAverageForceValue - hysteresis,
                yMax: recentAverageForceValue + hysteresis,
                backgroundColor: 'rgba(75, 192, 75, 0.4)',
                borderWidth: 0,
              },
              averageLine: {
                type: 'line',
                display: Boolean(displayAnnotations && mappedData.length),
                yMin: recentAverageForceValue,
                yMax: recentAverageForceValue,
                borderColor: 'rgba(68, 68, 239, 1.0)',
                borderWidth: 2,
                label: {
                  content: `Avg: ${recentAverageForceValue.toFixed(2)} kg`,
                  display: false,
                  position: 'start',
                },
              },
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
    <div className={`mt-12`}
      >
      <section className='relative w-full text-lg'>
        <div className={`absolute w-full flex flex-col justify-center items-center text-center font-base text-2xl left-1/2 -translate-x-1/2 transition-[top] duration-300 ease-in-out px-8 ${
            fatigueStatus.isFatigued
              ? 'text-red-500 animate-pulse -top-12' 
              : '-top-10'
          } ${
            isEstimatingMass ? 'opacity-40' : ''
          }`}
        >
          <p className={`flex flex-row justify-center items-center gap-1 font-bold`}
          >
            {cycleCount ?? 0} {cycleCount === 1 ? 'rep.' : 'reps.'}
          </p>
          {fatigueStatus.isFatigued ? (
            <p className='text-[1rem] leading-[1]'>{fatigueStatus.interpretation}</p> 
            ) : null
          }
        </div>
        <div className={`w-full flex justify-center gap-2 pt-2 ${
            isEstimatingMass ? 'opacity-40' : ''
          }`}
          >
          <p className='text-right'>Last Cycle: <span className='font-semibold'>{(cycleAmplitude ?? 0).toFixed(1)} kg</span></p>
          <p className='text-left font-semibold'>{((cycleDuration ?? 0) / 1000).toFixed(1)} s</p>
        </div>
      </section>
      <div data-element="non-swipeable" className={`relative w-full transition-all duration-300 ease-in-out pb-4`}>
        {(rawSensorData.length === 0 || isRecording) ? (
          <section className='relative bg-white rounded-lg px-1 pt-6 pb-2 mt-2'>
            <canvas 
              ref={canvasRef} 
              className='bg-white'
              />
            {sensorData.length > 0 ? (
              <p className="flex flex-row gap-4 absolute top-1 left-2 text-gray-500 text-[0.8rem]">
                <span>Max: <strong>{maxPoint.toFixed(2)} kg</strong></span> 
                <span>Avg: <strong>{recentAverageForceValue.toFixed(2)} kg</strong></span>
              </p>
              ) : null
            }
            {isRecording ? (
                <div className="absolute top-0 left-0 w-full h-full bg-red-500/0"/>
              ) : sensorData.length > 0 ? (
                <div
                  ref={tooltipRef}
                  id="custom-tooltip"
                  className="absolute top-[0.1rem] right-2 bg-white/0 text-gray-500 px-2 py-0.5 rounded opacity-100 text-[0.8rem] pointer-events-none transition-opacity duration-200"
                  />
              ) : null
            }
          </section> ) : (
          <FullTestForceChart 
            rawSensorData={rawSensorData}
            maxPoint={maxPoint}
            displayAnnotations={true}
            />
        )}
        
        <section className="mt-2 px-1 py-2 border-2 border-black dark:border-white rounded-lg">
          <div className="grid grid-cols-5 font-semibold bg-white dark:bg-black border-b py-1 mb-2">
            <div className="pl-1 pr-2">Load</div>
            <div className="pl-1 pr-2">Rep</div>
            <div className="pl-1 pr-2">Time</div>
            <div className="pl-1 pr-2">Amp</div>
            <div className="pl-1 pr-2">V/R</div>
          </div>
          <div ref={scrollContainerRef} className={`overflow-y-auto transition-[max-height] ${isRecording
            ? "max-h-[calc(100dvh-590px)]"
            : "max-h-[calc(100dvh-540px)]"
          }`}>
            <table className="w-full border-collapse text-left table-fixed transition-transform">
              <thead className="hidden md:table-header-group">
                <tr className="align-baseline">
                  <th className="pl-1 pr-2 w-1/5">Load</th>
                  <th className="pl-1 pr-2 w-1/5">Rep</th>
                  <th className="pl-1 pr-2 w-1/5">Time</th>
                  <th className="pl-1 pr-2 w-1/5">Amp</th>
                  <th className="pl-1 pr-2 w-1/5">V/R</th>
                </tr>
              </thead>
              <tbody>
              {(() => {
                const validData = [...cycleData]
                  .filter((data) => data.cycleCount !== 0)
                  .reverse();

                const getStats = (array: number[]) => {
                  const valid = array.filter(v => !isNaN(v));
                  const mean = valid.reduce((sum, val) => sum + val, 0) / valid.length;
                  const std = Math.sqrt(valid.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / valid.length);
                  return { mean, std };
                };

                const isOutlier = (value: number | null, stats: { mean: number; std: number }) => {
                  if (value === null) return false;
                  return Math.abs(value - stats.mean) > 2 * stats.std;
                };

                const durationStats = getStats(validData.map(d => d.cycleDuration ?? NaN));
                const amplitudeStats = getStats(validData.map(d => d.cycleAmplitude ?? NaN));
                const ratioStats = getStats(validData.map(d => d.cycleSpeedRatio ?? NaN));

                return validData.length > 0 ? (
                  validData.map((data, index) => {
                    const isOutlierRow =
                      isOutlier(data.cycleDuration, durationStats) ||
                      isOutlier(data.cycleAmplitude, amplitudeStats) ||
                      isOutlier(data.cycleSpeedRatio, ratioStats);

                    return (
                      <tr
                        key={index}
                        className={isOutlierRow ? "bg-red-100 text-red-700" : ""}
                        >
                        <td className="pl-2">{data.workLoad !== null ? data.workLoad.toFixed(1) : "-"}</td>
                        <td className="pl-2">{data.cycleCount !== null
                          ? data.cycleCount < 10
                            ? <>{'\u00A0\u00A0'}{data.cycleCount.toFixed(0)}</>
                            : data.cycleCount.toFixed(0)
                          : "-"}
                        </td>
                        <td className="pl-2">{data.cycleDuration !== null ? (data.cycleDuration / 1000).toFixed(2) : "-"}</td>
                        <td className="pl-2">{data.cycleAmplitude !== null ? data.cycleAmplitude.toFixed(2) : "-"}</td>
                        <td className="pl-2">{data.cycleSpeedRatio !== null ? data.cycleSpeedRatio.toFixed(2) : "-"}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="pl-2">-</td>
                    <td className="pl-2">-</td>
                    <td className="pl-2">-</td>
                    <td className="pl-2">-</td>
                    <td className="pl-2">-</td>
                  </tr>
                );
              })()}
              </tbody>
            </table>
          </div>
          <div className='flex flex-row justify-end items-center mt-2'>
            <div className="text-sm italic dark:text-gray-500 animate-pulse">
              {showScrollHint ? "Scroll down for more..." : <br/> }
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Index;
