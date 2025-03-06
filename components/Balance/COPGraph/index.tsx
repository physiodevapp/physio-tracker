"use client";

import { useEffect, useRef, useMemo } from "react";
import { Chart, LineController, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from "chart.js";

Chart.register(LineController, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface IndexProps {
  areaParams: { copAreaPoints: { x: number; y: number }[] };
  ellipseParams: {
    copPoints: { ml: number; ap: number }[];
    semiMajor: number;
    semiMinor: number;
    orientation: number;
    centerX?: number;
    centerY?: number;
  };
  options: { canvasId: string };
}

const Index: React.FC<IndexProps> = ({ ellipseParams, areaParams, options }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);
  const { copPoints, semiMajor, semiMinor, orientation, centerX = 0, centerY = 0 } = ellipseParams;
  const { copAreaPoints } = areaParams;
  const { canvasId } = options;

  // 🟢 Generar puntos de la elipse
  const ellipsePoints = useMemo(() => {
    const numPoints = 100;
    return Array.from({ length: numPoints + 1 }, (_, i) => {
      const theta = (2 * Math.PI * i) / numPoints;
      return {
        x: centerX + semiMajor * Math.cos(theta) * Math.cos(orientation) - semiMinor * Math.sin(theta) * Math.sin(orientation),
        y: centerY + semiMajor * Math.cos(theta) * Math.sin(orientation) + semiMinor * Math.sin(theta) * Math.cos(orientation),
      };
    });
  }, [semiMajor, semiMinor, orientation, centerX, centerY]);

  // 🟠 Formatear datos COP
  const convertedCOPPoints = useMemo(() => copPoints.map(point => ({ x: point.ml, y: point.ap })), [copPoints]);

  // 🔵 Cerrar el área COP si es necesario
  useEffect(() => {
    if (copAreaPoints.length > 0) {
      const firstPoint = copAreaPoints[0];
      const lastPoint = copAreaPoints[copAreaPoints.length - 1];
      if (firstPoint.x !== lastPoint.x || firstPoint.y !== lastPoint.y) {
        copAreaPoints.push(firstPoint);
      }
    }
  }, [copAreaPoints]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    // 🟢 Si ya hay un gráfico, actualizarlo
    if (chartInstance.current) {
      chartInstance.current.data.datasets[0].data = ellipsePoints;
      chartInstance.current.data.datasets[1].data = convertedCOPPoints;
      chartInstance.current.data.datasets[2].data = copAreaPoints;
      chartInstance.current.update();
      return;
    }

    // 🟠 Crear nuevo gráfico
    chartInstance.current = new Chart(ctx, {
      type: "line",
      data: {
        datasets: [
          {
            label: "Ellipse",
            data: ellipsePoints,
            borderColor: "rgba(75, 192, 192, 1)",
            fill: false,
            pointRadius: 0,
            tension: 0,
          },
          {
            label: "Points",
            data: convertedCOPPoints,
            borderColor: "rgba(255, 99, 132, 1)",
            backgroundColor: "rgba(255, 99, 132, 0.5)",
            pointRadius: 1,
            showLine: false,
          },
          {
            label: "Area",
            data: copAreaPoints,
            borderColor: "rgba(0, 123, 255, 1)",
            backgroundColor: "rgba(0, 123, 255, 0.2)",
            fill: true,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        animation: false,
        maintainAspectRatio: false,
        aspectRatio: 1,
        scales: {
          x: {
            type: "linear",
            title: { display: true, text: "ML (cm)" },
            ticks: { callback: value => (typeof value === "number" ? value.toFixed(1) : value) },
          },
          y: {
            title: { display: true, text: "AP (cm)" },
          },
        },
        plugins: {
          legend: { display: true, labels: { usePointStyle: true } },
          tooltip: { enabled: false },
        },
      },
    });

    return () => {
      chartInstance.current?.destroy();
      chartInstance.current = null;
    };
  }, [ellipsePoints, convertedCOPPoints, copAreaPoints]);

  return (
    <>
      <canvas id={canvasId} ref={canvasRef} className="w-full h-auto max-w-screen bg-white" />;
    </>
  )
}

export default Index;
