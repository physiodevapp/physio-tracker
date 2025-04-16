"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chart as ChartJS, ChartConfiguration, registerables } from "chart.js";

ChartJS.register(...registerables);

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
  afterDraw(chart: ChartJS & { _customCrosshairX?: number }) {
    if (!isActive) return;

    const x = chart._customCrosshairX;
    if (x == null) return;

    const anyVisible = chart.data.datasets.some((_, index) => {
      const meta = chart.getDatasetMeta(index);
      return !meta.hidden;
    });

    if (!anyVisible) return;

    const { ctx, chartArea, scales } = chart;
    const xScale = scales["x"];
    const yScale = scales["y"];
    const xValue = xScale.getValueForPixel(x);

    // Línea vertical
    ctx.save();
    ctx.strokeStyle = "#F66";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;

      const data = dataset.data as { x: number; y: number }[];

      const closestPoint = data.reduce((prev, curr) =>
        Math.abs(curr.x - xValue!) < Math.abs(prev.x - xValue!) ? curr : prev
      );

      const yPixel = yScale.getPixelForValue(closestPoint.y);

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
  },
});

const Index: React.FC<IndexProps> = ({
  spectrumParamsY,
  spectrumParamsZ,
  options,
}) => {
  const chartRef = useRef<ChartJS | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { canvasId, maxFreq = 10 } = options;

  const [tooltipData, setTooltipData] = useState<{
    x: number;
    values: { label: string; value: number; color: string }[];
  } | null>(null); 

  const { filteredDataY, filteredDataZ } = useMemo(() => {
    const filterData = (frequencies: number[], amplitudes: number[]) => {
      return frequencies.reduce<{ points: { x: number; y: number }[] }>(
        (acc, freq, i) => {
          if (freq >= 0 && freq <= maxFreq) {
            acc.points.push({ x: freq, y: amplitudes[i] });
          }
          return acc;
        },
        { points: [] }
      );
    };
  
    const { points: filteredDataY } = filterData(
      spectrumParamsY.frequencies,
      spectrumParamsY.amplitudes
    );
    const { points: filteredDataZ } = filterData(
      spectrumParamsZ.frequencies,
      spectrumParamsZ.amplitudes
    );
  
    return { filteredDataY, filteredDataZ };
  }, [spectrumParamsY, spectrumParamsZ, maxFreq]);
  

  const chartConfig = useMemo<ChartConfiguration>(
    () => ({
      type: "line",
      data: {
        // labels: filteredFreqsY,
        datasets: [
          {
            label: "ML Amplitude",
            data: filteredDataY,
            borderColor: "rgba(75, 192, 192, 1)",
            backgroundColor: "rgba(75, 192, 192, 0.2)",
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 3,
            pointHoverBorderWidth: 1,
            pointHoverBorderColor: 'red',
            pointHitRadius: 0,
          },
          {
            label: "AP Amplitude",
            data: filteredDataZ,
            borderColor: "rgba(245, 143, 180, 1)",
            backgroundColor: "rgba(245, 143, 180, 0.2)",
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 3,
            pointHoverBorderWidth: 1,
            pointHoverBorderColor: 'red',
            pointHitRadius: 0,
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
        interaction: {
          mode: "nearest",
          axis: "x",
          intersect: false,
        },
        plugins: {
          legend: { 
            display: false, 
            labels: { 
              usePointStyle: true 
            },
            onClick: () => {},
          },
          tooltip: {
            enabled: false,
            boxPadding: 6,
            callbacks: {
              label: function (context) {
                const label = context.dataset.label!.replace('Amplitude', 'Amp');
                return `${label}: ${context.parsed.y.toFixed(2)} m/s²`;
              },
              title: function (context) {
                return `${context[0].parsed.x.toFixed(2)} Hz`;
              },
            },
            external: (context) => {
              const chart = context.chart as ChartJS & { _customCrosshairX?: number; };
              const tooltip = context.tooltip;
            
              if (!tooltip?.dataPoints?.length) return;
            
              const x = tooltip.dataPoints[0].parsed.x;
              const values = tooltip.dataPoints.map((point) => {
                const dataset = chart.data.datasets[point.datasetIndex];
                return {
                  label: point.dataset.label ?? '',
                  value: point.parsed.y,
                  color: (dataset.borderColor as string) ?? 'black',
                };
              });
            
              setTooltipData({ x, values });
            
              chart._customCrosshairX = tooltip.caretX;
              chart.draw();
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
    [filteredDataY, filteredDataZ, maxFreq]
  );

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
    <>
      <p className="w-full text-center py-2 text-lg">Frequency Spectrum Results</p>
      <div 
        data-element="non-swipeable"
        className="w-full h-auto max-w-screen bg-white border-gray-200 border-2 dark:border-none rounded-lg py-2 pr-1">
        <div className="flex flex-row-reverse justify-between items-center px-6 pb-2 bg-white text-black text-sm p-2 rounded shadow">
          <div className="font-bold mb-1 text-lg text-gray-600">
            Freq: {tooltipData?.x !== undefined ? tooltipData.x.toFixed(2) + ' Hz' : '- Hz'}
          </div>
          <div className="flex flex-col gap-1 text-gray-600">
            {(tooltipData?.values?.length
              ? tooltipData.values
              : [{ label: 'ML Amp', value: undefined, color: 'rgba(75, 192, 192, 1)' }, { label: 'AP Amp', value: undefined, color: 'rgba(245, 143, 180, 1)' }]
            ).map((item, i) => (
              <div key={i} className="flex items-center gap-1">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full mr-1 border-2"
                  style={{ 
                    borderColor: item.color, 
                    backgroundColor: item.color.replace(/rgba?\(([^,]+,[^,]+,[^,]+),[^)]+\)/, 'rgba($1, 1.0)'), 
                  }}
                ></span>
                {item.label.replace('Amplitude', 'Amp')}:{" "}
                {item.value !== undefined ? item.value.toFixed(2) + " m/s²" : "- m/s"}
              </div>
            ))}
          </div>
        </div>

        <canvas id={canvasId} ref={canvasRef} className="bg-white"/>
      </div>
    </>
  );
};

export default Index;
