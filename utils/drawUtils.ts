import { Keypoint, KeypointData } from "@/interfaces/pose";
import * as poseDetection from "@tensorflow-models/pose-detection";

export const drawKeypoints = (
  ctx: CanvasRenderingContext2D,
  keypoints: poseDetection.Keypoint[],
  selectedKeypoint: Keypoint | null,
  keypointData: KeypointData | null,
  pointColor: string = "white",
  pointRadius: number = 5
) => {
  keypoints.forEach((kp) => {
    // Mostrar velocidad sobre el keypoint seleccionado
    if (kp.name === selectedKeypoint && keypointData?.velocityInPixels !== null) {
      ctx.font = "16px Arial";
      ctx.fillStyle = "yellow";
      ctx.fillText(`Velocity: ${keypointData?.velocityInPixels.toFixed(0)} px/s`, kp.x + 10, kp.y);
    }

    // Dibujar el punto del keypoint
    ctx.beginPath();
    ctx.arc(kp.x, kp.y, pointRadius, 0, 2 * Math.PI);
    ctx.fillStyle = pointColor;
    ctx.fill();
  });
};

export const drawKeypointConnections = (
  ctx: CanvasRenderingContext2D,
  keypoints: poseDetection.Keypoint[],
  keypointPairs: [Keypoint, Keypoint][],
  strokeStyle: string = "white",
  lineWidth: number = 2
) => {
  // Aplicar estilo al trazo
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;

  keypointPairs.forEach(([pointA, pointB]) => {
    const kpA = keypoints.find((kp) => kp.name === pointA);
    const kpB = keypoints.find((kp) => kp.name === pointB);

    if (kpA && kpB) {
      ctx.beginPath();
      ctx.moveTo(kpA.x, kpA.y);
      ctx.lineTo(kpB.x, kpB.y);
      ctx.stroke();
    }
  });
};

export const drawAngleAndVelocity = (
  ctx: CanvasRenderingContext2D,
  kp: { x: number; y: number },
  smoothedAngle: number,
  smoothedAngularVelocity: number,
  padding: number = 8
) => {
  // Preparar los textos
  const textAngle = `${smoothedAngle.toFixed(0)}°`;
  const textVelocity = `ω: ${smoothedAngularVelocity.toFixed(0)} °/s`;

  // Configurar fuente y medir el texto
  ctx.font = "16px Arial";
  ctx.textBaseline = "top";

  const angleMetrics = ctx.measureText(textAngle);
  const velocityMetrics = ctx.measureText(textVelocity);

  // Calcular dimensiones del cuadro
  const rectX = kp.x + 10;
  const rectY = kp.y - 10;
  const rectWidth = Math.max(angleMetrics.width, velocityMetrics.width) + padding * 2;
  const rectHeight = 40;

  // Dibujar fondo del cuadro
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

  // Dibujar texto del ángulo
  ctx.fillStyle = "yellow";
  ctx.fillText(textAngle, rectX + padding, rectY + 4);

  // Dibujar texto de la velocidad angular
  ctx.fillStyle = "cyan";
  ctx.fillText(textVelocity, rectX + padding, rectY + 20);
};