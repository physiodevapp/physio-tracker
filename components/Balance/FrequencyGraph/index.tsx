"use client";

import { useEffect, useMemo, useRef } from "react";
import { Chart, ChartConfiguration, ChartEvent, registerables } from "chart.js";

Chart.register(...registerables);

interface SpectrumParams {
  frequencies: number[];
  amplitudes: number[];
}

interface IndexProps {
  spectrumParamsY: SpectrumParams;
  spectrumParamsZ: SpectrumParams;
  options: {
    canvasId: string;
    maxFreq?: number;
  }
}

const customCrosshairPlugin = (isActive: boolean = true) => ({
  id: 'customCrosshair',
  afterEvent(chart: Chart & { _customCrosshairX?: number }, args: { event: ChartEvent }) {
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
  afterDraw(chart: Chart & { _customCrosshairX?: number }) {
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
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return; 

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

const Index: React.FC<IndexProps> = ({
  spectrumParamsY,
  spectrumParamsZ,
  options,
}) => {
  const chartRef = useRef<Chart | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { canvasId, maxFreq = 10 } = options;

  const { filteredFreqsY, filteredAmpsY, filteredAmpsZ } = useMemo(() => {
    const filterData = (frequencies: number[], amplitudes: number[]) => {
      return frequencies.reduce<{ freqs: number[]; amps: number[] }>(
        (acc, freq, i) => {
          if (freq >= 0 && freq <= maxFreq) {
            acc.freqs.push(freq);
            acc.amps.push(amplitudes[i]);
          }
          return acc;
        },
        { freqs: [], amps: [] }
      );
    };

    const { freqs: filteredFreqsY, amps: filteredAmpsY } = filterData(
      spectrumParamsY.frequencies,
      spectrumParamsY.amplitudes
    );
    const { amps: filteredAmpsZ } = filterData(
      spectrumParamsZ.frequencies,
      spectrumParamsZ.amplitudes
    );

    return { filteredFreqsY, filteredAmpsY, filteredAmpsZ };
  }, [spectrumParamsY, spectrumParamsZ, maxFreq]);

  const chartConfig = useMemo<ChartConfiguration>(
    () => ({
      type: "line",
      data: {
        labels: filteredFreqsY,
        datasets: [
          {
            label: "ML Amplitude",
            data: filteredAmpsY,
            borderColor: "rgba(75, 192, 192, 1)",
            backgroundColor: "rgba(75, 192, 192, 0.2)",
            fill: false,
            pointRadius: 4,
          },
          {
            label: "AP Amplitude",
            data: filteredAmpsZ,
            borderColor: "rgba(255, 99, 132, 1)",
            backgroundColor: "rgba(255, 99, 132, 0.2)",
            fill: false,
            pointRadius: 4,
          },
        ],
      },
      plugins: [
        customCrosshairPlugin(),
      ],
      options: {
        responsive: true,
        animation: false,
        maintainAspectRatio: true,
        aspectRatio: 1,
        plugins: {
          legend: { display: true, labels: { usePointStyle: true } },
          tooltip: {
            boxPadding: 6,
            callbacks: {
              label: function (context) {
                return `${context.dataset.label}: ${context.parsed.y.toFixed(2)} m/s²`;
              },
              title: function (context) {
                return `${context[0].parsed.x.toFixed(2)} Hz`;
              },
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            min: 0,
            max: maxFreq,
            title: { display: true, text: "Frequency (Hz)" },
            ticks: {
              stepSize: 1,
              callback: value => Number(value).toFixed(0),
            },
          },
          y: {
            title: { display: true, text: "Amplitude (m/s²)" },
            ticks: {
              callback: value => Number(value).toFixed(1),
            },
          },
        },
      },
    }),
    [filteredFreqsY, filteredAmpsY, filteredAmpsZ, maxFreq]
  );

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    if (chartRef.current) {
      chartRef.current.data.labels = filteredFreqsY;
      chartRef.current.data.datasets[0].data = filteredAmpsY;
      chartRef.current.data.datasets[1].data = filteredAmpsZ;
      chartRef.current.update();
    } else {
      chartRef.current = new Chart(ctx, chartConfig);
    }

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [chartConfig]);

  return (
    <div 
      data-element="non-swipeable"
      className="w-full h-auto max-w-screen bg-white border-gray-200 border-2 dark:border-none rounded-lg py-2 pr-1">
      <canvas id={canvasId} ref={canvasRef} className="bg-white"/>
    </div>
  );
};

export default Index;
