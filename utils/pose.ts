import { CanvasKeypointName, JointConfigMap, JointData, JointDataMap } from "@/interfaces/pose";
import * as poseDetection from '@tensorflow-models/pose-detection';
import { RefObject } from "react";

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
  jointAngleHistorySize,
  orthogonalReference,
  formatJointName,
  setAnglesToDisplay,
}: {
  keypoints: poseDetection.Keypoint[];
  selectedJoints: CanvasKeypointName[];
  jointDataRef: RefObject<JointDataMap>;
  jointConfigMap: JointConfigMap;
  jointWorker: Worker;
  jointAngleHistorySize: number;
  orthogonalReference?: 'horizontal' | 'vertical';
  formatJointName: (jointName: string) => string;
  setAnglesToDisplay?: React.Dispatch<React.SetStateAction<string[]>>;
}) => {
  if (!selectedJoints.length || !jointWorker) return;

  const jointDataMap = selectedJoints.reduce((acc, jointName) => {
    const data = jointDataRef.current[jointName];
    acc[jointName] = {
      angleHistory: data?.angleHistory ?? [],
    };
    return acc;
  }, {} as Record<string, { angleHistory: number[] }>);

  jointWorker.postMessage({
    keypoints,
    jointNames: selectedJoints,
    jointConfigMap,
    jointDataMap,
    angleHistorySize: jointAngleHistorySize,
    orthogonalReference,
  });

  jointWorker.onmessage = (e: MessageEvent<{ updatedJointData: Record<string, JointData> }>) => {
    const updatedJointData = e.data.updatedJointData;
    const anglesToDisplay: string[] = [];

    selectedJoints.forEach((jointName) => {
      const updatedData = updatedJointData[jointName];
      const label = formatJointName(jointName);

      if (updatedData) {
        jointDataRef.current[jointName] = updatedData;
        const angle = `${label}: ${updatedData.angle.toFixed(0)}°`;
        anglesToDisplay.push(angle);
      } else {
        anglesToDisplay.push(`${label}: -`);
      }
    });

    if (setAnglesToDisplay) {
      setAnglesToDisplay(prev => {
        const hasChanged =
          prev.length !== anglesToDisplay.length ||
          prev.some((val, i) => val !== anglesToDisplay[i]);

        return hasChanged ? anglesToDisplay : prev;
      });
    }
  };
};
