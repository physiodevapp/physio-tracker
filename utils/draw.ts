import { CanvasKeypointName, CanvasKeypointData } from "@/interfaces/pose";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { getColorsForJoint } from "./joint";

interface DrawKeypointsOptions {
  ctx: CanvasRenderingContext2D;
  keypoints: poseDetection.Keypoint[];
  selectedKeypoint?: CanvasKeypointName | null;
  keypointData?: CanvasKeypointData | null;
  pointColor?: string;
  pointRadius?: number;
  mirror?: boolean;
}

export const drawKeypoints = ({
  ctx,
  keypoints,
  pointColor,    
  pointRadius = 5,         
  mirror = false,           
}: DrawKeypointsOptions) => {
  keypoints.forEach((kp) => {
    // Calcular la coordenada X invertida si es necesario  
    const x = mirror ? ctx.canvas.width - kp.x : kp.x; // MODIFICADO: se utiliza x en lugar de kp.x  
    const y = kp.y; // la coordenada Y se mantiene igual

    // Dibujar el punto del keypoint  
    ctx.beginPath();
    ctx.arc(x, y, pointRadius, 0, 2 * Math.PI);
    ctx.fillStyle = pointColor ?? getColorsForJoint(kp.name ?? null).borderColor;
    ctx.fill();
  });
};

interface DrawKeypointConnectionsOptions {
  ctx: CanvasRenderingContext2D;
  keypoints: poseDetection.Keypoint[];
  keypointPairs: [CanvasKeypointName, CanvasKeypointName][];
  strokeStyle?: string;
  lineWidth?: number;
  mirror?: boolean;
}

export const drawKeypointConnections = ({
  ctx,
  keypoints,
  keypointPairs,
  strokeStyle = "white",
  lineWidth = 2,
  mirror = false
}: DrawKeypointConnectionsOptions) => {
  // Aplicar estilo al trazo
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;

  keypointPairs.forEach(([pointA, pointB]) => {
    const kpA = keypoints.find((kp) => kp.name === pointA);
    const kpB = keypoints.find((kp) => kp.name === pointB);

    if (kpA && kpB) {
      // Calcular coordenadas X invertidas si se requiere  
      const xA = mirror ? ctx.canvas.width - kpA.x : kpA.x;
      const xB = mirror ? ctx.canvas.width - kpB.x : kpB.x;

      ctx.beginPath();
      ctx.moveTo(xA, kpA.y); 
      ctx.lineTo(xB, kpB.y);
      ctx.stroke();
    }
  });
};

interface DrawAngleOptions {
  ctx: CanvasRenderingContext2D;
  kp: { x: number; y: number };
  angle: number;
  padding?: number; 
  mirror?: boolean;
}

// Función para dibujar el ángulo
export const drawAngle = ({
  ctx,
  kp,
  angle,
  padding = 8,
  mirror = false
}: DrawAngleOptions) => {
  const textAngle = `${angle.toFixed(0)}°`;

  // Configurar fuente y alineación
  ctx.font = "16px Arial";
  ctx.textBaseline = "top";

  // Medir el ancho del texto
  const angleMetrics = ctx.measureText(textAngle);

  // Calcular la coordenada X a usar, invirtiéndola si mirror es true  
  const x = mirror ? ctx.canvas.width - kp.x : kp.x; // LÍNEA MODIFICADA: se usa 'x' en vez de kp.x

  // Calcular dimensiones y posición del recuadro usando la coordenada X calculada  
  const rectX = x + 10;  
  const rectY = kp.y - 10; // Se mantiene la posición base para el ángulo
  const rectWidth = angleMetrics.width + padding * 2;
  const rectHeight = 20; // Altura ajustada para una sola línea

  // Dibujar fondo del recuadro
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

  // Dibujar el texto del ángulo
  ctx.fillStyle = "yellow";
  ctx.fillText(textAngle, rectX + padding, rectY + 4);
};


export const getCanvasScaleFactor = ({
  canvas,
  sourceDimensions,
}: {
  canvas: HTMLCanvasElement | null;
  sourceDimensions?: { width: number; height: number };
}): number => {
  if (!canvas || !sourceDimensions) return 1;

  const canvasDisplayWidth = canvas.clientWidth;
  const canvasDisplayHeight = canvas.clientHeight;

  const { width, height } = sourceDimensions;

  if (!width || !height) return 1;

  // const scaleX = canvasDisplayWidth / width;
  // const scaleY = canvasDisplayHeight / height;
  // console.log(scaleX, ' - ', scaleY)
  // return (scaleX + scaleY) / 2;
  ///
  const inverseScaleX = width / canvasDisplayWidth;
  const inverseScaleY = height / canvasDisplayHeight;
  const rawScale = Math.max(inverseScaleX, inverseScaleY);
  const clampedScale = Math.min(Math.max(rawScale, 1.5), 4); // límites entre 1.5x y 5x
  // console.log(inverseScaleX, ' - ', inverseScaleY)
  // console.log(clampedScale)
  return clampedScale;
  ///
};

