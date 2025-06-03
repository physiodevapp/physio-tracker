import { CanvasKeypointName, JointConfigMap, JointDataMap, Jump, JumpPoint } from "@/interfaces/pose";
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

/// Beta jump analysis
export function detectJumpWindowsByAngle({
  frames,
  mode ="strict",
  side = "right",
  joint = "knee",
  maxTakeoffFlexion = 20, // mejor crear max?TakeoffFlexion y max?LandingFlexion y hacerlos dinamicos
  maxLandingFlexion = 20,
  minFlexionBeforeJump = 45,
  minFlexionAfterLanding = 45,
  slidingAvgWindow = 3,
  searchWindow = 15,
  trendWindow = 3,
}: {
  frames: VideoFrame[];
  mode?: "strict" | "smoothed"
  side?: "left" | "right";
  joint?: "knee" | "hip";
  maxTakeoffFlexion?: number;
  maxLandingFlexion?: number;
  minFlexionBeforeJump?: number;
  minFlexionAfterLanding?: number;
  slidingAvgWindow?: number;
  searchWindow?: number;
  trendWindow?: number;
}): Jump[] {
  if (!frames.length) return [];

  const jointName =
    joint === "hip"
      ? side === "right"
        ? CanvasKeypointName.RIGHT_HIP
        : CanvasKeypointName.LEFT_HIP
      : side === "right"
      ? CanvasKeypointName.RIGHT_KNEE
      : CanvasKeypointName.LEFT_KNEE;

  const angleValues = frames.map((f) => ({
    angle: f.jointData?.[jointName]?.angle ?? null,
    yValue: f.keypoints.find(kp => kp.name === jointName)?.y ?? null,
    videoTime: f.videoTime,
  }));
  const validAngles = angleValues
    .map((a, i) => ({
      index: i,
      angle: a.angle,
      yValue: a.yValue,
      videoTime: a.videoTime,
    }))
    .filter((a) => a.angle !== null) as JumpPoint[];
  const smoothedAngles: JumpPoint[] = validAngles.map((p, i, arr) => {
    const start = Math.max(0, i - Math.floor(slidingAvgWindow / 2));
    const end = Math.min(arr.length, i + Math.ceil(slidingAvgWindow / 2));
    const window = arr.slice(start, end).map((a) => ({
      angle: a.angle,
      yValue: a.yValue,
    }));
    const avgAngle = window.reduce((sum, val) => sum + val.angle, 0) / window.length;
    const avgY = window.reduce((sum, val) => sum + val.yValue, 0) / window.length;

    return {
      index: p.index,
      angle: avgAngle,
      yValue: avgY,
      videoTime: p.videoTime, // ✅ Mantenemos el mismo timestamp
    };
  });
  // console.log('angleValues ', angleValues)
  // console.log('validAngles ',validAngles)
  // console.log('smoothedAngles ', smoothedAngles)

  const results: Jump[] = [];

  // solo para elegir en el bucle y el prev, curr o next
  const angles = (mode === "smoothed") ? smoothedAngles : validAngles;

  for (let i = 1; i < angles.length - 1; i++) {
    const prev = angles[i - 1].angle;
    const curr = angles[i].angle;
    const next = angles[i + 1].angle;

    // Detectar mínimo local (centro del vuelo)
    if (curr < maxTakeoffFlexion && curr < prev && curr < next) {
      const preWindowSmoothed = smoothedAngles.slice(Math.max(0, i - searchWindow), i);
      const postWindowSmoothed = smoothedAngles.slice(i + 1, i + 1 + searchWindow);
      
      const impulsePoint = findImpulsePoint(
        preWindowSmoothed, 
        trendWindow,
      );
      // console.log('impulsePoint ', impulsePoint)
      if (!impulsePoint) continue;

      const cushionPoint = findCushionPoint(
        postWindowSmoothed, 
        trendWindow,
      );
      // console.log('cushionPoint ', cushionPoint)
      if (!cushionPoint) continue;
      
      if (
        impulsePoint.angle >= minFlexionBeforeJump &&
        cushionPoint.angle >= minFlexionAfterLanding
      ) {
        // console.log('minimo local ', validAngles[i])
        const fromImpulseToMin = validAngles.slice(
          validAngles.findIndex(p => p.index === impulsePoint.index),
          i + 1 // i + 1 = índice del mínimo local (centro del salto)
        );
        const takeoffPoint = findTakeoffPoint(
          fromImpulseToMin,
          trendWindow,
          maxTakeoffFlexion,
        ); 
        // console.log('takeoffPoint ', takeoffPoint)    
  
        const fromMinToCushion = validAngles.slice(
          i,
          validAngles.findIndex(p => p.index === cushionPoint.index) + 1
        );
        const landingPoint = findLandingPoint(
          fromMinToCushion,
          trendWindow,
          maxLandingFlexion,
        );
        // console.log('landingPoint ', landingPoint)

        results.push({
          impulsePoint,
          takeoffPoint: takeoffPoint ?? impulsePoint,
          landingPoint: landingPoint ?? cushionPoint,
          cushionPoint,
        });
        i += searchWindow;
      }
    }
  }

  return results;
}

function findImpulsePoint(preWindow: JumpPoint[], trendWindow: number): JumpPoint | null {
  let impulseCandidate: JumpPoint | null = null;

  for (let j = 0; j <= preWindow.length - trendWindow; j++) {
    let trendValid = true;
    for (let k = 1; k < trendWindow; k++) {
      if (preWindow[j + k].angle <= preWindow[j + k - 1].angle) {
        trendValid = false;
        break;
      }
    }

    if (trendValid) {
      const segment = preWindow.slice(j, j + trendWindow);
      const localPeak = segment.reduce(
        (max, p) => (p.angle > max.angle ? p : max),
        segment[0]
      );
      if (!impulseCandidate || localPeak.angle > impulseCandidate.angle) {
        impulseCandidate = localPeak;
      }
    }
  }

  return impulseCandidate;
}

function findTakeoffPoint(
  segment: JumpPoint[],
  trendWindow: number,
  maxTakeoffFlexion?: number,
): JumpPoint | null {
  // console.log('findTakeoffPoint ', segment)
  let maxFlexionCandidate: JumpPoint | null = null;
  let comboCandidate: JumpPoint | null = null;

  for (let j = 0; j <= segment.length - trendWindow; j++) {
    let isDescending = true;

    // Verificamos que haya una tendencia descendente de al menos trendWindow
    for (let k = 1; k < trendWindow; k++) {

      if (segment[j + k].angle >= segment[j + k - 1].angle) {
        isDescending = false;
        break;
      }
    }

    const candidate = segment[j + trendWindow - 1];

    if (maxTakeoffFlexion !== undefined && candidate.angle <= maxTakeoffFlexion) {
      if (maxFlexionCandidate === null) {
        maxFlexionCandidate = candidate;
      }
      if (isDescending) {
        comboCandidate = candidate;
        // En el primer match robusto, comparamos con maxFlexionCandidate
        if (
          maxFlexionCandidate &&
          maxFlexionCandidate.videoTime < comboCandidate.videoTime
        ) {
          return maxFlexionCandidate;
        } else {
          return comboCandidate;
        }
      }
    }
  }

  // Si nunca se encontró un isDescending true, pero sí un maxFlexionCandidate
  return maxFlexionCandidate || null;
}

function findLandingPoint(
  segment: JumpPoint[],
  trendWindow: number,
  maxTakeoffFlexion?: number,
): JumpPoint | null {
  let maxFlexionCandidate: JumpPoint | null = null;
  let comboCandidate: JumpPoint | null = null;

  for (let j = segment.length - trendWindow; j >= 0; j--) {
    let isDescending = true;
    for (let k = 0; k < trendWindow - 1; k++) {
      if (segment[j + k + 1].angle - segment[j + k].angle <= 0) {
        isDescending = false;
        break;
      }
    }

    const candidate = segment[j + trendWindow - 1];

    if (maxTakeoffFlexion !== undefined && candidate.angle <= maxTakeoffFlexion) {
      if (maxFlexionCandidate === null) {
        maxFlexionCandidate = candidate;
      }

      if (isDescending) {
        comboCandidate = candidate;
        // En el primer match robusto, comparamos con maxFlexionCandidate
        if (
          maxFlexionCandidate &&
          maxFlexionCandidate.videoTime > comboCandidate.videoTime
        ) {
          return maxFlexionCandidate;
        } else {
          return comboCandidate;
        }
      }
    }
  }
  // Si nunca se encontró un isDescending true, pero sí un maxFlexionCandidate
  return maxFlexionCandidate || null;
}

function findCushionPoint(postWindow: JumpPoint[], trendWindow: number): JumpPoint | null {
  let cushionCandidate: JumpPoint | null = null;

  for (let j = 0; j <= postWindow.length - trendWindow; j++) {
    let trendValid = true;
    for (let k = 1; k < trendWindow; k++) {
      if (postWindow[j + k].angle <= postWindow[j + k - 1].angle) {
        trendValid = false;
        break;
      }
    }

    if (trendValid) {
      const segment = postWindow.slice(j, j + trendWindow);
      const localPeak = segment.reduce(
        (max, p) => (p.angle > max.angle ? p : max),
        segment[0]
      );
      if (!cushionCandidate || localPeak.angle > cushionCandidate.angle) {
        cushionCandidate = localPeak;
      }
    }
  }

  return cushionCandidate;
}






























