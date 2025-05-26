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

/// findMaxPeaksAroundIndex original
// export function findMaxPeaksAroundIndex(
//   hipTrajectory: JumpPoint[],
//   minIndex: number,
// ): {
//   prevPeak: JumpPoint | null;
//   nextPeak: JumpPoint | null;
// } {
//   const findMaxAngleIndex = (start: number, end: number): number => {
//     let maxIndex = -1;
//     let maxAngle = -Infinity;
//     for (let i = start; i <= end; i++) {
//       const angle = hipTrajectory[i].angle;
//       if (angle != null && angle > maxAngle) {
//         maxAngle = angle;
//         maxIndex = i;
//       }
//     }
//     return maxIndex;
//   };

//   const prevIndex = findMaxAngleIndex(0, minIndex);
//   const nextIndex = findMaxAngleIndex(minIndex, hipTrajectory.length - 1);

//   // const prevPeak = hipTrajectory.find(p => p.index === prevIndex) ?? null;
//   const prevPeak = prevIndex !== -1 ? hipTrajectory[prevIndex] : null;
//   // const nextPeak = hipTrajectory.find(p => p.index === nextIndex) ?? null;
//   const nextPeak = nextIndex !== -1 ? hipTrajectory[nextIndex] : null;

//   return { prevPeak, nextPeak };
// }
///
function findMaxPeaksAroundIndex(
  hipTrajectory: JumpPoint[],
  minIndex: number,
  tolerance: number = 1 // grados
): {
  prevPeak: JumpPoint | null;
  nextPeak: JumpPoint | null;
} {
  const findMaxAngleIndex = (start: number, end: number): number => {
    let maxIndex = -1;
    let maxAngle = -Infinity;
    for (let i = start; i <= end; i++) {
      const angle = hipTrajectory[i]?.angle;
      if (angle != null && angle > maxAngle) {
        maxAngle = angle;
        maxIndex = i;
      }
    }
    return maxIndex;
  };

  // --- NEXT PEAK ---
  const nextIndex = findMaxAngleIndex(minIndex, hipTrajectory.length - 1);
  const maxAngleNext = hipTrajectory[nextIndex]?.angle ?? -Infinity;

  let closestSimilarNextIndex = nextIndex;
  for (let i = minIndex; i < nextIndex; i++) {
    const angle = hipTrajectory[i]?.angle;
    if (angle != null && Math.abs(angle - maxAngleNext) <= tolerance) {
      closestSimilarNextIndex = i;
      break;
    }
  }

  // --- PREV PEAK ---
  const prevIndex = findMaxAngleIndex(0, minIndex);
  const maxAnglePrev = hipTrajectory[prevIndex]?.angle ?? -Infinity;

  let closestSimilarPrevIndex = prevIndex;
  for (let i = minIndex; i > 0; i--) {
    const angle = hipTrajectory[i]?.angle;
    if (angle != null && Math.abs(angle - maxAnglePrev) <= tolerance) {
      closestSimilarPrevIndex = i;
      break;
    }
  }

  return {
    prevPeak: hipTrajectory[closestSimilarPrevIndex] ?? null,
    nextPeak: hipTrajectory[closestSimilarNextIndex] ?? null,
  };
}

function smoothTrajectory(data: (number | null)[], window = 3): (number | null)[] {
  return data.map((_, i) => {
    const values = data.slice(Math.max(0, i - Math.floor(window / 2)), i + Math.ceil(window / 2))
      .filter(v => v !== null) as number[];
    return values.length ? values.reduce((a, b) => a + b) / values.length : null;
  });
}

function findSmoothedMinIndex(yValues: number[], window = 3): number {
  const smoothed = smoothTrajectory(yValues, window) as number[];
  const min = Math.min(...smoothed);
  return smoothed.findIndex(v => v === min);
}

function findAngleEventIndex(
  angles: (number | null)[],
  start: number,
  direction: "increase" | "decrease",
  threshold = 2 // diferencia acumulada minima de grados para considerarlo un cambio
): number {
  const factor = direction === "increase" ? 1 : -1;

  for (let i = start; i < angles.length - 3; i++) {
    if ([angles[i], angles[i + 1], angles[i + 2]].every(v => v != null)) {
      const a = angles[i]!, b = angles[i + 1]!, c = angles[i + 2]!;
      const diffs = [b - a, c - b];
      const consistent = diffs.every(d => d * factor > 0);
      const magnitude = diffs.reduce((acc, d) => acc + Math.abs(d), 0);
      if (consistent && magnitude > threshold) return i;
    }
  }

  return start;
}

function estimateAmortizationEndIndex(
  hipTrajectory: JumpPoint[],
  landingIndex: number,
  range: number = 12,
  angleTolerance: number = 1
): number {
  const end = Math.min(hipTrajectory.length, landingIndex + range);
  const window = hipTrajectory.slice(landingIndex + 1, end);

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

function analyzeJumpMetrics({
  frames,
  side = "right",
  angleChangeThreshold = 2, // grados
}: {
  frames: VideoFrame[];
  side: "left" | "right";
  angleChangeThreshold?: number;
}): JumpMetrics {
  if (!frames.length) return null;

  const getJointAngle = (frameIndex: number, jointName: CanvasKeypointName): number | null =>
    frames[frameIndex]?.jointData?.[jointName]?.angle ?? null;

  const first = frames[0];

  const keypointIndexMap: Record<string, number> = {};
  first.keypoints.forEach((kp, index) => {
    if (kp.name) keypointIndexMap[kp.name] = index;
  });

  const hipName = side === "right" ? CanvasKeypointName.RIGHT_HIP : CanvasKeypointName.LEFT_HIP;
  const kneeName = side === "right" ? CanvasKeypointName.RIGHT_KNEE : CanvasKeypointName.LEFT_KNEE;

  const hipIndex = keypointIndexMap[hipName];

  if (hipIndex === undefined) {
    console.warn("❌ No se encontraron índices para los keypoints necesarios.");
    return null;
  }

  const hipTrajectory: JumpPoint[] = frames.map((f, index) => ({
    timestamp: f.videoTime * 1000,
    y: f.keypoints[hipIndex].y,
    angle: f.jointData?.[hipName]?.angle ?? null,
    index,
  }));
  // console.log('hipTrajectory ', hipTrajectory)

  const angleThreshold = angleChangeThreshold;

  const yMinRaw = Math.min(...hipTrajectory.map(p => p.y));
  // const minIndex = hipTrajectory.findIndex(p => p.y === yMinRaw);
  const minIndex = findSmoothedMinIndex(hipTrajectory.map(p => p.y));

  // let takeoffIndex = minIndex;
  let takeoffIndex = findAngleEventIndex(hipTrajectory.map(item => item.angle), minIndex, "increase", 2);
  for (let i = minIndex - 1; i > 0; i--) {
    const current = hipTrajectory[i].angle;
    const prev = hipTrajectory[i - 1].angle;
    if (current !== null && prev !== null) {
      if (Math.abs(current - prev) > angleThreshold) {
        takeoffIndex = i;
        break;
      }
    }
  }

  // let landingIndex = minIndex;
  let landingIndex = findAngleEventIndex(hipTrajectory.map(item => item.angle), minIndex, "decrease", 2);
  for (let i = minIndex + 1; i < hipTrajectory.length - 1; i++) {
    const current = hipTrajectory[i].angle;
    const next = hipTrajectory[i + 1].angle;
    if (current !== null && next !== null) {
      if (Math.abs(current - next) > angleThreshold) {
        landingIndex = i;
        break;
      }
    }
  }

  const flightTime =
    takeoffIndex !== -1 && landingIndex !== -1
      ? (hipTrajectory[landingIndex].timestamp - hipTrajectory[takeoffIndex].timestamp) / 1000
      : null;
  
  // Estimación física de la altura basada en tiempo de vuelo
  const height = flightTime ? (9.81 * Math.pow(flightTime, 2)) / 8 : 0;

  const { prevPeak } = findMaxPeaksAroundIndex(hipTrajectory, minIndex);
  const impulseStartIndex = prevPeak ? prevPeak.index + 1 : takeoffIndex;
  // const amortizationEndIndex = nextPeak ? nextPeak.index - 1 : landingIndex;
  const amortizationEndIndex = estimateAmortizationEndIndex(hipTrajectory, landingIndex);


  const impulseDurationInSeconds =
    takeoffIndex > impulseStartIndex
      ? (hipTrajectory[takeoffIndex].timestamp - hipTrajectory[impulseStartIndex].timestamp) / 1000
      : null;

  const amortizationDurationInSeconds =
    amortizationEndIndex > landingIndex
      ? (hipTrajectory[amortizationEndIndex].timestamp - hipTrajectory[landingIndex].timestamp) / 1000
      : null;

  const angles = {
    impulseStart: {
      timestamp: hipTrajectory[impulseStartIndex].timestamp,
      hipAngle: getJointAngle(impulseStartIndex, hipName),
      kneeAngle: getJointAngle(impulseStartIndex, kneeName),
    },
    takeoff: {
      timestamp: hipTrajectory[takeoffIndex].timestamp,
      hipAngle: getJointAngle(takeoffIndex, hipName),
      kneeAngle: getJointAngle(takeoffIndex, kneeName),
    },
    landing: {
      timestamp: hipTrajectory[landingIndex].timestamp,
      hipAngle: getJointAngle(landingIndex, hipName),
      kneeAngle: getJointAngle(landingIndex, kneeName),
    },
    amortizationEnd: {
      timestamp: hipTrajectory[amortizationEndIndex].timestamp,
      hipAngle: getJointAngle(amortizationEndIndex, hipName),
      kneeAngle: getJointAngle(amortizationEndIndex, kneeName),
    },
  };

  return {
    heightInMeters: height,
    flightTimeInSeconds: flightTime,
    reactiveStrengthIndex: flightTime ? height / flightTime : null,
    takeoffTimestamp: hipTrajectory[takeoffIndex].timestamp,
    landingTimestamp: hipTrajectory[landingIndex].timestamp,
    impulseDurationInSeconds,
    amortizationDurationInSeconds,
    angles,
    sideUsed: side,
    yMinRaw: yMinRaw,
  };
}

function isJumpLikeDetailed(frames: VideoFrame[]): {
  isJump: boolean;
  reason?: string;
  metricsPreview?: JumpHeuristicPreview;
} {
  if (!frames.length) return { isJump: false, reason: "No frames provided" };

  const hipName = CanvasKeypointName.RIGHT_HIP; // puedes parametrizar
  const hipIndex = frames[0].keypoints.findIndex(kp => kp.name === hipName);
  if (hipIndex === -1) {
    return { isJump: false, reason: "Hip keypoint not found" };
  }

  const hipY = frames.map((f, i) => ({
    index: i,
    y: f.keypoints[hipIndex].y,
  }));
  const hipAngles = frames.map(f => f.jointData?.[hipName]?.angle ?? null);

  const yValues = hipY.map(p => p.y);
  // const minIndex = yValues.indexOf(Math.min(...yValues));
  const minIndex = findSmoothedMinIndex(yValues);
  
  const start = Math.max(0, minIndex - 30);
  const end = Math.min(yValues.length - 1, minIndex + 30);
  
  const maxYBefore = Math.max(...yValues.slice(start, minIndex));
  const maxYAfter = Math.max(...yValues.slice(minIndex, end + 1));
  
  const angleValues = hipAngles;
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

export function detectJumpEvents({
  frames,
  side = "right",
  windowSize = 30,
  minSeparation = 40,
  angleChangeThreshold = 2, // grados
} : {
  frames: VideoFrame[];
  side?: "left" | "right";
  windowSize?: number;
  minSeparation?: number;
  angleChangeThreshold?: number;
}): {
  jumpIndex: number;
  timestamp: number;
  isJump: boolean;
  reason?: string;
  metricsPreview?: JumpHeuristicPreview;
  metrics?: JumpMetrics | null;
}[] {
  if (!frames.length) return [];

  const hipName =
    side === "right"
      ? CanvasKeypointName.RIGHT_HIP
      : CanvasKeypointName.LEFT_HIP;

  const hipIndex = frames[0].keypoints.findIndex(kp => kp.name === hipName);
  if (hipIndex === -1) return [];

  const yValues = frames.map(f => f.keypoints[hipIndex].y);
  const candidateMinIndices: number[] = [];

  for (let i = windowSize; i < yValues.length - windowSize; i++) {
    const window = yValues.slice(i - windowSize, i + windowSize + 1);
    const isLocalMin = yValues[i] === Math.min(...window);
    const farFromLast =
      candidateMinIndices.length === 0 ||
      i - candidateMinIndices[candidateMinIndices.length - 1] > minSeparation;

    if (isLocalMin && farFromLast) {
      candidateMinIndices.push(i);
    }
  }

  return candidateMinIndices.map(jumpIndex => {
    const subStart = Math.max(0, jumpIndex - windowSize);
    const subEnd = Math.min(frames.length, jumpIndex + windowSize + 1);
    const subFrames = frames.slice(subStart, subEnd);

    const { isJump, reason, metricsPreview } = isJumpLikeDetailed(subFrames);

    const metrics = isJump
      ? analyzeJumpMetrics({ frames: subFrames, side, angleChangeThreshold })
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














