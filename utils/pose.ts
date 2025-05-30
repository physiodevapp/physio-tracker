import { CanvasKeypointName, JointConfigMap, JointDataMap, JumpHeuristicPreview, JumpMetrics, JumpPoint } from "@/interfaces/pose";
import * as poseDetection from '@tensorflow-models/pose-detection';
import { RefObject } from "react";

export interface VideoFrame {
  videoTime: number; // Tiempo relativo en segundos dentro del vídeo
  frameImage: HTMLCanvasElement;
  keypoints: poseDetection.Keypoint[];
  jointData?: JointDataMap; // Datos de las articulaciones para ese frame
  videoWidth: number;
  videoHeight: number;
}

export const excludedKeypoints = [
  'left_eye', 'right_eye',
  'left_eye_inner', 'right_eye_inner', 
  'left_eye_outer', 'right_eye_outer',
  'left_ear', 'right_ear',
  'nose', 
  'mouth_left', 'mouth_right',
  'left_thumb', 'right_thumb',
  'left_index', 'right_index', 
  'left_pinky', 'right_pinky', 
];

export  const keypointPairs: [CanvasKeypointName, CanvasKeypointName][] = [
  [CanvasKeypointName.LEFT_SHOULDER, CanvasKeypointName.RIGHT_SHOULDER],
  [CanvasKeypointName.LEFT_SHOULDER, CanvasKeypointName.LEFT_ELBOW],
  [CanvasKeypointName.LEFT_ELBOW, CanvasKeypointName.LEFT_WRIST],
  [CanvasKeypointName.RIGHT_SHOULDER, CanvasKeypointName.RIGHT_ELBOW],
  [CanvasKeypointName.RIGHT_ELBOW, CanvasKeypointName.RIGHT_WRIST],
  [CanvasKeypointName.LEFT_HIP, CanvasKeypointName.RIGHT_HIP],
  [CanvasKeypointName.LEFT_HIP, CanvasKeypointName.LEFT_KNEE],
  [CanvasKeypointName.LEFT_KNEE, CanvasKeypointName.LEFT_ANKLE],
  [CanvasKeypointName.LEFT_ANKLE, CanvasKeypointName.LEFT_HEEL],
  [CanvasKeypointName.LEFT_ANKLE, CanvasKeypointName.LEFT_FOOT_INDEX],
  [CanvasKeypointName.LEFT_HEEL, CanvasKeypointName.LEFT_FOOT_INDEX],
  [CanvasKeypointName.RIGHT_HIP, CanvasKeypointName.RIGHT_KNEE],
  [CanvasKeypointName.RIGHT_KNEE, CanvasKeypointName.RIGHT_ANKLE],
  [CanvasKeypointName.RIGHT_ANKLE, CanvasKeypointName.RIGHT_HEEL],
  [CanvasKeypointName.RIGHT_ANKLE, CanvasKeypointName.RIGHT_FOOT_INDEX],
  [CanvasKeypointName.RIGHT_HEEL, CanvasKeypointName.RIGHT_FOOT_INDEX],
];

export const updateMultipleJoints = ({
  keypoints,
  selectedJoints,
  jointDataRef,
  jointConfigMap,
  jointWorker,
  orthogonalReference,
  formatJointName,
  jointAngleHistorySize,
  setAnglesToDisplay,
  mode = 'live',
}: {
  keypoints: poseDetection.Keypoint[];
  selectedJoints: CanvasKeypointName[];
  jointDataRef: RefObject<JointDataMap>;
  jointConfigMap: JointConfigMap;
  jointWorker: Worker;
  orthogonalReference?: 'horizontal' | 'vertical';
  formatJointName: (jointName: string) => string;
  jointAngleHistorySize: number;
  ignoreHistorySize?: boolean;
  setAnglesToDisplay?: React.Dispatch<React.SetStateAction<string[]>>;
  mode?: 'live' | 'video';
}): Promise<JointDataMap> => {
  return new Promise((resolve) => {
    if (!jointWorker) return resolve({} as JointDataMap);

    const jointNamesToUse =
      mode === 'video'
        ? (Object.keys(jointConfigMap) as CanvasKeypointName[]) // 👈 usar todas las disponibles
        : selectedJoints;

    if (!jointNamesToUse.length) return resolve({} as JointDataMap);

    const jointDataMap = jointNamesToUse.reduce((acc, jointName) => {
      const data = jointDataRef.current[jointName];
      acc[jointName] = {
        angleHistory: data?.angleHistory ?? [],
      };
      return acc;
    }, {} as Record<string, { angleHistory: number[] }>);

    const handleWorkerResponse = (e: MessageEvent<{ updatedJointData: JointDataMap }>) => {
      const updatedJointData = e.data.updatedJointData;
      const jointAngles: Record<string, { L?: string; R?: string }> = {};

      // Fase 1: procesar joints y guardar los datos por lado
      selectedJoints.forEach((jointName) => {
        const updatedData = updatedJointData[jointName];
        const label = formatJointName(jointName); // Ej. "R Elbow"

        const match = label.match(/^(R|L) (.+)$/);
        if (match) {
          const [, side, baseName] = match;

          if (!jointAngles[baseName]) jointAngles[baseName] = {};

          if (updatedData) {
            jointDataRef.current[jointName] = updatedData;
            jointAngles[baseName][side as 'L' | 'R'] = `${updatedData.angle.toFixed(0)}°`;
          }
        } else {
          // No tiene lado (e.g. "Neck", "Torso")
          jointAngles[label] = {
            L: updatedData ? `${updatedData.angle.toFixed(0)}°` : "-",
          };

          if (updatedData) {
            jointDataRef.current[jointName] = updatedData;
          }
        }
      });

      // Fase 2: construir la lista formateada
      const anglesToDisplay: string[] = [];

      Object.entries(jointAngles).forEach(([baseName, { L, R }]) => {
        if (L && R) {
          anglesToDisplay.push(`${baseName}: ${L} / ${R}`);
        } else if (L) {
          anglesToDisplay.push(`L ${baseName}: ${L}`);
        } else if (R) {
          anglesToDisplay.push(`R ${baseName}: ${R}`);
        } else {
          anglesToDisplay.push(`${baseName}: -`);
        }
      });

      // Fase 3: actualizar si hay cambios
      if (setAnglesToDisplay) {
        setAnglesToDisplay(prev => {
          const hasChanged =
            prev.length !== anglesToDisplay.length ||
            prev.some((val, i) => val !== anglesToDisplay[i]);

          return hasChanged ? anglesToDisplay : prev;
        });
      }

      resolve(updatedJointData); // 👉 devolvemos también los datos nuevos
    };

    jointWorker.addEventListener('message', handleWorkerResponse, { once: true });

    jointWorker.postMessage({
      keypoints,
      jointNames: jointNamesToUse,
      jointConfigMap,
      jointDataMap,
      angleHistorySize: mode === "video" ? 0 : jointAngleHistorySize,
      orthogonalReference,
    });
  });
};

export function filterRepresentativeFrames(
  frames: VideoFrame[],
  angleThreshold = 5
): VideoFrame[] {
  if (!frames.length) return [];

  const selectedFrames = [frames[0]];
  let lastAngles = frames[0].jointData;

  for (let i = 1; i < frames.length; i++) {
    const current = frames[i];
    const jointData = current.jointData;

    if (!jointData || !lastAngles) continue; // Si falta, ignoramos este frame

    let totalDelta = 0;
    let count = 0;

    for (const joint in jointData) {
      if (Object.prototype.hasOwnProperty.call(lastAngles, joint) && Object.prototype.hasOwnProperty.call(jointData, joint)) {
        const lastAngle = lastAngles[joint as keyof JointDataMap];
        const currentAngle = jointData[joint as keyof JointDataMap];
    
        if (lastAngle && currentAngle) {
          totalDelta += Math.abs(currentAngle.angle - lastAngle.angle);
          count++;
        }
      }
    }
    

    const avgDelta = totalDelta / (count || 1);

    if (avgDelta >= angleThreshold) {
      selectedFrames.push(current);
      lastAngles = jointData;
    }
  }

  return selectedFrames;
}

///===============///
/// Jump analysis ///

// Encuentra los picos angulares máximos antes y después de un mínimo, utilizados para acotar las fases de impulso y amortiguación
function findMaxPeaksAroundIndex({
  jointTrajectory,
  minIndex,
  similarAngleTolerance = 1,
}: {
  // 🔹 Array de puntos con información de ángulo y tiempo de la cadera
  jointTrajectory: JumpPoint[];
  // 🔹 Índice central alrededor del cual buscar los máximos (el punto más bajo de la trayectoria)
  minIndex: number;
  // 🔹 Tolerancia en grados para considerar un punto como "similar" al máximo encontrado
  similarAngleTolerance: number;
}): {
  prevPeak: JumpPoint | null;
  nextPeak: JumpPoint | null;
} {
  const findMaxAngleIndex = (start: number, end: number): number => {
    let maxIndex = -1;
    let maxAngle = -Infinity;
    for (let i = start; i <= end; i++) {
      const angle = jointTrajectory[i]?.angle;
      if (angle != null && angle > maxAngle) {
        maxAngle = angle;
        maxIndex = i;
      }
    }
    return maxIndex;
  };

  // --- NEXT PEAK ---
  const nextIndex = findMaxAngleIndex(minIndex, jointTrajectory.length - 1);
  const maxAngleNext = jointTrajectory[nextIndex]?.angle ?? -Infinity;

  let closestSimilarNextIndex = nextIndex;
  for (let i = minIndex; i < nextIndex; i++) {
    const angle = jointTrajectory[i]?.angle;
    if (angle != null && Math.abs(angle - maxAngleNext) <= similarAngleTolerance) {
      closestSimilarNextIndex = i;
      break;
    }
  }

  // --- PREV PEAK ---
  const prevIndex = findMaxAngleIndex(0, minIndex);
  const maxAnglePrev = jointTrajectory[prevIndex]?.angle ?? -Infinity;

  let closestSimilarPrevIndex = prevIndex;
  for (let i = minIndex; i > 0; i--) {
    const angle = jointTrajectory[i]?.angle;
    if (angle != null && Math.abs(angle - maxAnglePrev) <= similarAngleTolerance) {
      closestSimilarPrevIndex = i;
      break;
    }
  }

  return {
    prevPeak: jointTrajectory[closestSimilarPrevIndex] ?? null,
    nextPeak: jointTrajectory[closestSimilarNextIndex] ?? null,
  };
}

// Aplica un suavizado por media móvil a una serie de valores numéricos, ignorando los nulos, para reducir fluctuaciones espurias
function smoothTrajectory({
  data,
  slidingAvgWindow = 3,
}: {
  // 🔹 Array de números o nulls (posiciones Y de la articulación)
  data: (number | null)[];
  // 🔹 Tamaño de la ventana deslizante usada para calcular la media Debe ser un número impar para mantener simetría. Cuanto mayor sea ese valor, más se suaviza... pero con el riesgo de perder precisión temporal si se pasa de largo.
  slidingAvgWindow: number;
}): (number | null)[] {
  return data.map((_, i) => {
    const values = data.slice(Math.max(0, i - Math.floor(slidingAvgWindow / 2)), i + Math.ceil(slidingAvgWindow / 2))
      .filter(v => v !== null) as number[];
    return values.length ? values.reduce((a, b) => a + b) / values.length : null;
  });
}

// Encuentra el punto más bajo suavizado en una serie de valores verticales, útil para identificar el mínimo real reduciendo ruido
function findSmoothedMinIndex({
  yValues, 
  slidingAvgWindow = 3,
}: {
  // 🔹 Array de valores numéricos (coordenadas Y del punto de la cadera)
  yValues: number[];
  // 🔹 Tamaño de la ventana para el suavizado (media móvil). Cuanto mayor sea, más suave será la curva
  slidingAvgWindow: number;
}): number {
  const smoothed = smoothTrajectory({data: yValues, slidingAvgWindow}) as number[];
  const min = Math.min(...smoothed);
  return smoothed.findIndex(v => v === min);
}

// Detecta un cambio claro en la dirección del ángulo articular (aumento o disminución) a partir de un punto inicial, si la variación acumulada supera un umbral

function findAngleEventIndex({
  angles,
  start,
  direction,
  acumulatedThreshold = 2,
  minSingleStepChange = 0,
  scanDirection = "forward"
}: {
  // 🔹 Array de ángulos (pueden contener `null`) correspondientes a cada frame
  angles: (number | null)[];
  // 🔹 Índice desde el cual comenzar a buscar el cambio
  start: number;
  // 🔹 Dirección esperada del cambio angular
  direction: "increase" | "decrease";
  // 🔹 Diferencia acumulada mínima (en grados) para que se considere un evento angular
  acumulatedThreshold: number;
  minSingleStepChange: number;
  scanDirection: "forward" | "backward";
}): number {
  const factor = direction === "increase" ? 1 : -1;

  const step = scanDirection === "forward" ? 1 : -1;
  const limit = scanDirection === "forward"
    ? angles.length - 3
    : 2; // mínimo índice que permita [i-2, i-1, i]

  for (
    let i = start;
    scanDirection === "forward" ? i < limit : i >= limit;
    i += step
  ) {
    const a = angles[i];
    const b = angles[i + step];
    const c = angles[i + 2 * step];

    if ([a, b, c].every(v => v != null)) {
      const diffs = [b! - a!, c! - b!];
      const consistent = diffs.every(d => d * factor > 0);
      const magnitude = diffs.reduce((acc, d) => acc + Math.abs(d), 0);
      const passesSingleStep = diffs.some(d => Math.abs(d) >= minSingleStepChange);

      if (consistent && magnitude >= acumulatedThreshold && passesSingleStep) {
        return i;
      }
    }
  }

  return start;
}

// Detecta el fin de la fase de amortiguación tras el aterrizaje, buscando el ángulo máximo más tardío en una ventana cercana al impacto
function estimateAmortizationEndIndex({
  // 🔹 Array de puntos con información de ángulo y tiempo de la cadera
  jointTrajectory,
  // 🔹 Índice donde ocurre el aterrizaje detectado
  landingIndex,
  // 🔹 Cuántos frames hacia adelante se consideran para buscar el pico angular post-aterrizaje. Por defecto, 12 frames (~0.4 s si la cámara graba a 30 fps)
  range = 12,
  // 🔹 Umbral en grados para considerar que varios valores son "similares" al máximo
  angleTolerance = 1,
}: {
  jointTrajectory: JumpPoint[];
  landingIndex: number;
  range: number;
  angleTolerance: number;
}): number {
  const end = Math.min(jointTrajectory.length, landingIndex + range);
  const window = jointTrajectory.slice(landingIndex + 1, end);

  if (window.length === 0) return landingIndex;

  // 1. Encontrar el valor máximo
  const maxAngle = Math.max(...window.map(p => p.angle ?? -Infinity));

  // 2. Buscar todos los valores cercanos al máximo
  const closeCandidates = window.filter(p =>
    p.angle != null && Math.abs(p.angle - maxAngle) <= angleTolerance
  );

  // 3. De esos, quedarnos con el más alejado (más tardío)
  const furthest = closeCandidates.reduce((a, b) =>
    a.index > b.index ? a : b
  );

  return furthest?.index ?? landingIndex;
}

// Calcula métricas clave de un salto (altura, tiempo de vuelo, impulso, amortiguación y ángulos articulares) a partir de una serie de frames de vídeo
function analyzeJumpMetrics({
  // 🔹 Array de frames con keypoints y datos articulares
  frames,
  // 🔹 Lado del cuerpo a analizar: "left" o "right"
  side = "right",
  // 🔹 Articulación utilizada para la deteccion de saltos
  joint = "knee",
  // 🔹 Cuántos frames hacia adelante se consideran para buscar el pico angular post-aterrizaje. Por defecto, 12 frames (~0.4 s si la cámara graba a 30 fps)
  range = 12,
  // 🔹 Umbral en grados para considerar que varios valores son "similares" al máximo
  angleTolerance = 1,
  // 🔹 Diferencia acumulada mínima (en grados) para que se considere un evento angular
  acumulatedThreshold = 2,
  // 🔹 Diferencia mínima de grados para considerar despegue/aterrizaje
  minSingleStepChange = 5,
  // 🔹 Tamaño de la ventana deslizante usada para calcular la media Debe ser un número impar para mantener simetría. Cuanto mayor sea ese valor, más se suaviza... pero con el riesgo de perder precisión temporal si se pasa de largo
  slidingAvgWindow = 3,
  // 🔹 Tolerancia en grados para considerar un punto como "similar" al máximo encontrado
  similarAngleTolerance = 1,
}: {
  frames: VideoFrame[];
  side: "left" | "right";
  joint?: "knee" | "hip";
  minSingleStepChange?: number;
  range: number;
  angleTolerance: number;
  acumulatedThreshold?: number;
  slidingAvgWindow?: number;
  similarAngleTolerance?: number;
}): JumpMetrics {
  if (!frames.length) return null;

  const getJointAngle = (frameIndex: number, jointName: CanvasKeypointName): number | null =>
    frames[frameIndex]?.jointData?.[jointName]?.angle ?? null;

  const first = frames[0];

  const keypointIndexMap: Record<string, number> = {};
  first.keypoints.forEach((kp, index) => {
    if (kp.name) keypointIndexMap[kp.name] = index;
  });

  const jointName = joint === "hip"
    ? side === "right"
      ? CanvasKeypointName.RIGHT_HIP
      : CanvasKeypointName.LEFT_HIP
    : side === "right"
      ? CanvasKeypointName.RIGHT_KNEE
      : CanvasKeypointName.LEFT_KNEE;
  const jointIndex = keypointIndexMap[jointName];

  if (jointIndex === undefined) {
    console.warn("❌ No se encontraron índices para los keypoints necesarios.");
    return null;
  }

  const jointTrajectory: JumpPoint[] = frames.map((f, index) => ({
    timestamp: f.videoTime * 1_000,
    y: f.keypoints[jointIndex].y,
    angle: f.jointData?.[jointName]?.angle ?? null,
    index,
  }));
  console.log('jointTrajectory ', jointTrajectory)

  const yMinRaw = Math.min(...jointTrajectory.map(p => p.y));
  const minIndex = findSmoothedMinIndex({
    yValues: jointTrajectory.map(p => p.y),
    slidingAvgWindow,
  });

  const takeoffIndex = findAngleEventIndex({
    angles: jointTrajectory.map(item => item.angle), 
    start: minIndex, 
    direction: "increase", 
    acumulatedThreshold,
    minSingleStepChange,
    scanDirection: "backward",
  });

  const landingIndex = findAngleEventIndex({
    angles: jointTrajectory.map(item => item.angle), 
    start: minIndex, 
    direction: "increase", 
    acumulatedThreshold,
    minSingleStepChange,
    scanDirection: "forward",
  });

  const flightTime =
    takeoffIndex !== -1 && landingIndex !== -1
      ? (jointTrajectory[landingIndex].timestamp - jointTrajectory[takeoffIndex].timestamp) / 1_000
      : null;
  
  // Estimación física de la altura basada en tiempo de vuelo
  const height = flightTime ? (9.81 * Math.pow(flightTime, 2)) / 8 : 0;

  const { prevPeak } = findMaxPeaksAroundIndex({
    jointTrajectory, 
    minIndex,
    similarAngleTolerance,
  });
  const impulseStartIndex = prevPeak ? prevPeak.index + 1 : takeoffIndex;
  const amortizationEndIndex = estimateAmortizationEndIndex({
    jointTrajectory, 
    landingIndex,
    range,
    angleTolerance,
  });

  const impulseDurationInSeconds =
    takeoffIndex > impulseStartIndex
      ? (jointTrajectory[takeoffIndex].timestamp - jointTrajectory[impulseStartIndex].timestamp) / 1_000
      : null;

  const amortizationDurationInSeconds =
    amortizationEndIndex > landingIndex
      ? (jointTrajectory[amortizationEndIndex].timestamp - jointTrajectory[landingIndex].timestamp) / 1_000
      : null;

  const angles = {
    impulseStart: {
      timestamp: jointTrajectory[impulseStartIndex].timestamp,
      jointAngle: getJointAngle(impulseStartIndex, jointName),
    },
    takeoff: {
      timestamp: jointTrajectory[takeoffIndex].timestamp,
      jointAngle: getJointAngle(takeoffIndex, jointName),
    },
    landing: {
      timestamp: jointTrajectory[landingIndex].timestamp,
      jointAngle: getJointAngle(landingIndex, jointName),
    },
    amortizationEnd: {
      timestamp: jointTrajectory[amortizationEndIndex].timestamp,
      jointAngle: getJointAngle(amortizationEndIndex, jointName),
    },
  };

  return {
    heightInMeters: height,
    flightTimeInSeconds: flightTime,
    reactiveStrengthIndex: flightTime ? height / flightTime : null,
    takeoffTimestamp: jointTrajectory[takeoffIndex].timestamp,
    landingTimestamp: jointTrajectory[landingIndex].timestamp,
    impulseDurationInSeconds,
    amortizationDurationInSeconds,
    angles,
    sideUsed: side,
    yMinRaw: yMinRaw,
  };
}

function isJumpLikeDetailed({
  frames,
  slidingAvgWindow = 3,
  side = "right",
  joint = "knee",
}: {
  frames: VideoFrame[]
  slidingAvgWindow: number;
  side: "left" | "right";
  joint?: "knee" | "hip";
}): {
  isJump: boolean;
  reason?: string;
  metricsPreview?: JumpHeuristicPreview;
} {
  if (!frames.length) return { isJump: false, reason: "No frames provided" };

  const jointName = joint === "hip"
    ? side === "right"
      ? CanvasKeypointName.RIGHT_HIP
      : CanvasKeypointName.LEFT_HIP
    : side === "right"
      ? CanvasKeypointName.RIGHT_KNEE
      : CanvasKeypointName.LEFT_KNEE;
  const jointIndex = frames[0].keypoints.findIndex(kp => kp.name === jointName);

  if (jointIndex === -1) {
    return { isJump: false, reason: "Hip keypoint not found" };
  }

  const jointTrajectory: JumpPoint[] = frames.map((f, index) => ({
    timestamp: f.videoTime * 1_000,
    y: f.keypoints[jointIndex].y,
    angle: f.jointData?.[jointName]?.angle ?? null,
    index,
  }));

  const yValues = jointTrajectory.map(p => p.y);
  const minIndex = findSmoothedMinIndex({yValues, slidingAvgWindow});
  
  const start = Math.max(0, minIndex - 30);
  const end = Math.min(yValues.length - 1, minIndex + 30);
  
  const maxYBefore = Math.max(...yValues.slice(start, minIndex));
  const maxYAfter = Math.max(...yValues.slice(minIndex, end + 1));
  
  const angleValues = [...jointTrajectory].map(item => item.angle);
  const validAnglesBefore = angleValues.slice(start, minIndex).filter(a => a !== null) as number[];
  const validAnglesAfter = angleValues.slice(minIndex, end + 1).filter(a => a !== null) as number[];

  const maxAngleBefore = Math.max(...validAnglesBefore);
  const maxAngleAfter = Math.max(...validAnglesAfter);
  const dropHeight = maxYBefore - yValues[minIndex];
  const riseHeight = maxYAfter - yValues[minIndex];
  const angleChange = Math.abs(maxAngleBefore - maxAngleAfter);

  const metricsPreview = {
    minIndex,
    dropHeight,
    riseHeight,
    maxAngleBefore,
    maxAngleAfter,
    angleChange,
  };

  if (dropHeight <= 200) return { isJump: false, reason: "Insufficient drop height", metricsPreview };
  if (riseHeight <= 200) return { isJump: false, reason: "Insufficient rise height", metricsPreview };
  if (maxAngleBefore <= 30 || maxAngleAfter <= 30) return { isJump: false, reason: "Angle too low", metricsPreview };
  if (angleChange <= 10) return { isJump: false, reason: "Angle change too small", metricsPreview };

  return { isJump: true, metricsPreview };
}

// Detecta posibles saltos en una secuencia de frames identificando mínimos locales en la trayectoria vertical de la cadera y aplicando filtros para validar si son saltos reales.
export function detectJumpEvents({
  frames,
  settings: {
    side = "right",
    joint = "knee",
    localMinWindow = 30,
    minSeparation = 40,
    minSingleStepChange = 5,
    range = 12,
    angleTolerance = 1,
    acumulatedThreshold = 2,
    slidingAvgWindow = 3,
    similarAngleTolerance = 1,
  },
}: {
  // 🔹 Array de frames con keypoints y datos articulares
  frames: VideoFrame[];
  settings: {
    // 🔹 Lado del cuerpo a analizar: "left" o "right"
    side?: "left" | "right";
    joint?: "knee" | "hip";
    // 🔹 Tamaño de la ventana para buscar mínimos locales (y extraer subframes)
    localMinWindow?: number;
    // 🔹 Mínima separación entre candidatos a salto, en número de frames
    minSeparation?: number;
    // 🔹 Cuántos frames hacia adelante se consideran para buscar el pico angular post-aterrizaje. Por defecto, 12 frames (~0.4 s si la cámara graba a 30 fps)
    range?: number;
    // 🔹 Umbral en grados para considerar que varios valores son "similares" al máximo
    angleTolerance?: number;
    // 🔹 Diferencia acumulada mínima (en grados) para que se considere un evento angular
    acumulatedThreshold?: number;
    // 🔹 Diferencia mínima de grados para considerar despegue/aterrizaje
    minSingleStepChange?: number;
    // 🔹 Tamaño de la ventana deslizante usada para calcular la media. Debe ser un número impar para mantener simetría. Cuanto mayor sea ese valor, más se suaviza... pero con el riesgo de perder precisión temporal si se pasa de largo
    slidingAvgWindow?: number;
    // 🔹 Tolerancia en grados para considerar un punto como "similar" al máximo encontrado
    similarAngleTolerance?: number;
  }
}): {
  jumpIndex: number;
  timestamp: number;
  isJump: boolean;
  reason?: string;
  metricsPreview?: JumpHeuristicPreview;
  metrics?: JumpMetrics | null;
}[] {
  if (!frames.length) return [];

  const jointName = joint === "hip"
    ? side === "right"
      ? CanvasKeypointName.RIGHT_HIP
      : CanvasKeypointName.LEFT_HIP
    : side === "right"
      ? CanvasKeypointName.RIGHT_KNEE
      : CanvasKeypointName.LEFT_KNEE;
  const jointIndex = frames[0].keypoints.findIndex(kp => kp.name === jointName);
  
  if (jointIndex === -1) return [];

  frames = frames.filter(f => {
    const kp = f.keypoints[jointIndex];
    return kp && typeof kp.y === "number";
  });
  console.log('frames ', frames)

  const yValues = frames.map(f => f.keypoints[jointIndex].y);
  const candidateMinIndices: number[] = [];

  for (let i = localMinWindow; i < yValues.length - localMinWindow; i++) {
    const window = yValues.slice(i - localMinWindow, i + localMinWindow + 1);
    const isLocalMin = yValues[i] === Math.min(...window);
    const farFromLast =
      candidateMinIndices.length === 0 ||
      i - candidateMinIndices[candidateMinIndices.length - 1] > minSeparation;

    if (isLocalMin && farFromLast) {
      candidateMinIndices.push(i);
    }
  }

  return candidateMinIndices.map(jumpIndex => {
    const subStart = Math.max(0, jumpIndex - localMinWindow);
    const subEnd = Math.min(frames.length, jumpIndex + localMinWindow + 1);
    const subFrames = frames.slice(subStart, subEnd);

    const { isJump, reason, metricsPreview } = isJumpLikeDetailed({
      frames: subFrames, 
      slidingAvgWindow,
      side,
      joint,
    });

    const metrics = isJump
      ? analyzeJumpMetrics({ 
          frames: subFrames, 
          side, 
          joint,
          minSingleStepChange,
          range,
          angleTolerance,
          acumulatedThreshold,
          slidingAvgWindow,
          similarAngleTolerance,
        })
      : null;

    return {
      jumpIndex,
      timestamp: frames[jumpIndex].videoTime * 1000,
      isJump,
      reason,
      metricsPreview,
      metrics,
    };
  });
}

/// Jump analysis ///
///===============///

/// Beta jump analysis
export function detectJumpEventsByAngle({
  frames,
  side = "right",
  joint = "knee",
  slidingAvgWindow = 3,
  minAngle = 20,
  minAngleChange = 25,
  minPrepFlexion = 45,
  minLandFlexion = 45,
  searchWindow = 15,
}: {
  frames: VideoFrame[];
  side?: "left" | "right";
  joint?: "knee" | "hip";
  slidingAvgWindow?: number;
  minAngle?: number;
  minAngleChange?: number;
  minPrepFlexion?: number;
  minLandFlexion?: number;
  searchWindow?: number;
}): {
  takeoffIndex: number;
  landingIndex: number;
  cushionIndex: number;
  prepIndex: number;
  metrics: {
    angleBefore: number;
    angleAtTakeoff: number;
    angleAtLanding: number;
    angleAtCushion: number;
    angleChange: number;
    timeAtAngleBefore: number;
    timeAtTakeoff: number;
    timeAtLanding: number;
    timeAtCushion: number;
  };
}[] {
  if (!frames.length) return [];

  const jointName = joint === "hip"
    ? side === "right"
      ? CanvasKeypointName.RIGHT_HIP
      : CanvasKeypointName.LEFT_HIP
    : side === "right"
      ? CanvasKeypointName.RIGHT_KNEE
      : CanvasKeypointName.LEFT_KNEE;

  const angleValues = frames.map(f => f.jointData?.[jointName]?.angle ?? null);
  const validAngles = angleValues.map((a, i) => ({ angle: a, index: i })).filter(a => a.angle !== null) as { angle: number; index: number }[];
  console.log('validAngles ', validAngles)

  const smoothedAngles = validAngles.map((p, i, arr) => {
    const start = Math.max(0, i - Math.floor(slidingAvgWindow / 2));
    const end = Math.min(arr.length, i + Math.ceil(slidingAvgWindow / 2));
    const window = arr.slice(start, end).map(a => a.angle);
    const avg = window.reduce((sum, val) => sum + val, 0) / window.length;
    return { index: p.index, angle: avg };
  });

  const jumpEvents: {
    takeoffIndex: number;
    landingIndex: number;
    cushionIndex: number;
    prepIndex: number;
    metrics: {
      angleBefore: number;
      angleAtTakeoff: number;
      angleAtLanding: number;
      angleAtCushion: number;
      angleChange: number;
      timeAtAngleBefore: number;
      timeAtTakeoff: number;
      timeAtLanding: number;
      timeAtCushion: number;
    };
  }[] = [];

  for (let i = 1; i < smoothedAngles.length - 1; i++) {
    const prev = smoothedAngles[i - 1].angle;
    const curr = smoothedAngles[i].angle;
    const next = smoothedAngles[i + 1].angle;

    if (curr < minAngle && curr < prev && curr < next) {
      const preWindow = smoothedAngles.slice(Math.max(0, i - searchWindow), i);
      const postWindow = smoothedAngles.slice(i + 1, i + 1 + searchWindow);

      const prepPoint = preWindow.reduce((acc, p) => (p.angle >= acc.angle ? p : acc), preWindow[0]);

      let landingIndex = -1;
      for (let j = 1; j < postWindow.length; j++) {
        const a = postWindow[j - 1].angle;
        const b = postWindow[j].angle;
        if (a <= minAngle && b > a) {
          landingIndex = postWindow[j].index;
          break;
        }
      }
      if (landingIndex === -1) continue;

      const cushionPoint = postWindow.reduce((acc, p) => (p.angle >= acc.angle ? p : acc), postWindow[0]);

      const angleChange = Math.abs(prepPoint.angle - curr);

      if (
        prepPoint.angle >= minPrepFlexion &&
        cushionPoint.angle >= minLandFlexion &&
        angleChange >= minAngleChange
      ) {
        const takeoffIndex = smoothedAngles[i].index;

        jumpEvents.push({
          takeoffIndex,
          prepIndex: prepPoint.index,
          landingIndex,
          cushionIndex: cushionPoint.index,
          metrics: {
            angleBefore: prepPoint.angle,
            angleAtTakeoff: curr,
            angleAtLanding: angleValues[landingIndex] ?? curr,
            angleAtCushion: cushionPoint.angle,
            angleChange,
            timeAtAngleBefore: frames[prepPoint.index].videoTime,
            timeAtTakeoff: frames[takeoffIndex].videoTime,
            timeAtLanding: frames[landingIndex].videoTime,
            timeAtCushion: frames[cushionPoint.index].videoTime,
          },
        });

        i += searchWindow;
      }
    }
  }

  return jumpEvents;
}
























