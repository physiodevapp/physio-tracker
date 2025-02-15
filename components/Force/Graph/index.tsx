// components/Index.tsx
import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';

// Registrar los componentes necesarios de Chart.js
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

// Define el tipo para cada punto de datos
export interface DataPoint {
  time: number;  // Tiempo en microsegundos (se convertirá a ms)
  force: number; // Fuerza en kg
}

interface IndexProps {
  sensorData: DataPoint[];
}

const Index: React.FC<IndexProps> = ({ sensorData }) => {
  // Convertir los tiempos de microsegundos a milisegundos
  const convertedData = sensorData.map(point => ({
    time: point.time / 1000,
    force: point.force,
  }));

  // Si existen datos, se toma el último timestamp (en ms) para definir la ventana de 10 seg.
  const timeWindow = 10000; // 10 segundos en milisegundos
  const lastTime = convertedData.length > 0 ? convertedData[convertedData.length - 1].time : 0;
  const minTime = convertedData.length > 0 ? lastTime - timeWindow : 0;
  const maxTime = convertedData.length > 0 ? lastTime : 0;

  // Configuración de datos para la gráfica
  const chartData = {
    labels: convertedData.map(point => point.time),
    datasets: [
      {
        label: 'Force (kg)',
        data: convertedData.map(point => point.force),
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 0,
        pointHitRadius: 0,
      },
    ],
  };

  // Opciones de la gráfica, configurando el eje X como lineal y estableciendo la ventana de 10 segundos.
  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    animation: false,
    plugins: {
      title: {
        display: false,
        text: 'Real-Time Force vs Time',
      },
      legend: {
        display: false,
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
            if (numValue < 0) return '';
            return (numValue / 1000).toFixed(0) + 's';
          },
        },
        min: convertedData.length > 0 ? minTime : undefined,
        max: convertedData.length > 0 ? maxTime : undefined,
      },
      y: {
        title: {
          display: false,
          text: 'Force (kg)',
        },
        ticks: {
          stepSize: 0.1,
          callback: (value) => {
            const numValue = Number(value);
            if (numValue < 0) return '';
            return numValue.toFixed(1);
          },
        },
      },
    },
  };

  return (
    <div>
      <Line data={chartData} options={chartOptions} />
    </div>
  );
};

export default Index;
