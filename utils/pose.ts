import { CanvasKeypointName, JointConfigMap, JointDataMap } from "@/interfaces/pose";
import * as poseDetection from '@tensorflow-models/pose-detection';
import { RefObject } from "react";

export type PoseOrientation = "front" | "back" | "left" | "right";

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

export const keypointPairs: [CanvasKeypointName, CanvasKeypointName][] = [
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
  poseOrientation,
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
  poseOrientation: PoseOrientation;
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
      poseOrientation,
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






























