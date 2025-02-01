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

// Función para dibujar el ángulo
export const drawAngle = (
  ctx: CanvasRenderingContext2D,
  kp: { x: number; y: number },
  angle: number,
  padding: number = 8
) => {
  const textAngle = `${angle.toFixed(0)}°`;

  // Configurar fuente y alineación
  ctx.font = "16px Arial";
  ctx.textBaseline = "top";

  // Medir el ancho del texto
  const angleMetrics = ctx.measureText(textAngle);

  // Calcular dimensiones y posición del recuadro
  const rectX = kp.x + 10;
  const rectY = kp.y - 10; // posición base para el ángulo
  const rectWidth = angleMetrics.width + padding * 2;
  const rectHeight = 20; // altura ajustada para una sola línea

  // Dibujar fondo del recuadro
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

  // Dibujar el texto del ángulo
  ctx.fillStyle = "yellow";
  ctx.fillText(textAngle, rectX + padding, rectY + 4);
};

// Función para dibujar la velocidad angular
export const drawAngularVelocity = (
  ctx: CanvasRenderingContext2D,
  kp: { x: number; y: number },
  angularVelocity: number,
  padding: number = 8,
  offsetY: number = 30 // Desplazamiento vertical para que no se solape con el ángulo
) => {
  const textVelocity = `ω: ${angularVelocity.toFixed(0)} °/s`;

  // Configurar fuente y alineación
  ctx.font = "16px Arial";
  ctx.textBaseline = "top";

  // Medir el ancho del texto
  const velocityMetrics = ctx.measureText(textVelocity);

  // Calcular dimensiones y posición del recuadro
  const rectX = kp.x + 10;
  const rectY = kp.y - 10 + offsetY; // se aplica el desplazamiento vertical
  const rectWidth = velocityMetrics.width + padding * 2;
  const rectHeight = 20; // altura ajustada para una sola línea

  // Dibujar fondo del recuadro
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

  // Dibujar el texto de la velocidad angular
  ctx.fillStyle = "cyan";
  ctx.fillText(textVelocity, rectX + padding, rectY + 4);
};
