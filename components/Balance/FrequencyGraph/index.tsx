"use client";

import { useEffect, useRef } from "react";
import { Chart, ChartConfiguration, registerables } from "chart.js";

Chart.register(...registerables);

interface SpectrumParams {
  frequencies: number[];
  amplitudes: number[];
}

interface IndexProps {
  spectrumParamsY: SpectrumParams;
  spectrumParamsZ: SpectrumParams;
  canvasId: string;
  maxFreq?: number;
}

const Index: React.FC<IndexProps> = ({
  spectrumParamsY,
  spectrumParamsZ,
  canvasId,
  maxFreq = 10,
}) => {
  const chartRef = useRef<Chart | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Extraer datos de frecuencias y amplitudes
    const { frequencies: frequenciesY, amplitudes: amplitudesY } = spectrumParamsY;
    const { frequencies: frequenciesZ, amplitudes: amplitudesZ } = spectrumParamsZ;

    // Filtrar valores dentro del rango 0 - maxFreq Hz
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

    const { freqs: finalFrequenciesY, amps: finalAmplitudesY } = filterData(frequenciesY, amplitudesY);
    const { freqs: finalFrequenciesZ, amps: finalAmplitudesZ } = filterData(frequenciesZ, amplitudesZ);

    // Configuración del gráfico
    const config: ChartConfiguration = {
      type: "line",
      data: {
        labels: finalFrequenciesY,
        datasets: [
          {
            label: "Amplitud Y",
            data: finalAmplitudesY,
            borderColor: "rgba(75, 192, 192, 1)",
            backgroundColor: "rgba(75, 192, 192, 0.2)",
            fill: false,
            pointRadius: 4,
          },
          {
            label: "Amplitud Z",
            data: finalAmplitudesZ,
            borderColor: "rgba(255, 99, 132, 1)",
            backgroundColor: "rgba(255, 99, 132, 0.2)",
            fill: false,
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        animation: false,
        plugins: {
          legend: {
            display: true,
          },
          tooltip: {
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
            title: {
              display: true,
              text: "Frecuencia (Hz)",
            },
            ticks: {
              stepSize: 1,
              callback: function (value) {
                return Number(value).toFixed(0);
              },
            },
          },
          y: {
            title: {
              display: true,
              text: "Amplitud (m/s²)",
            },
            ticks: {
              callback: function (value) {
                return Number(value).toFixed(1);
              },
            },
          },
        },
      },
    };

    // Crear o actualizar el gráfico
    if (chartRef.current) {
      chartRef.current.data.labels = finalFrequenciesY;
      chartRef.current.data.datasets[0].data = finalAmplitudesY;
      chartRef.current.data.datasets[1].data = finalAmplitudesZ;
      chartRef.current.update();
    } else {
      chartRef.current = new Chart(canvasRef.current, config);
    }

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [spectrumParamsY, spectrumParamsZ, maxFreq]);

  return <canvas id={canvasId} ref={canvasRef} />;
};

export default Index;
