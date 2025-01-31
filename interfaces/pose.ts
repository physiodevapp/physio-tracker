import * as poseDetection from '@tensorflow-models/pose-detection';

export interface PoseSettings {
  scoreThreshold: number;
}

export interface KeypointData {
  position: { x: number; y: number };
  lastTimestamp: number;
  velocityInPixels: number;
  velocityInPixelsHistory: number[];
}

export interface JointAngleData {
  angle: number;
  lastTimestamp: number;
  angularVelocity: number;
  angularVelocityHistory: number[];
  angleHistory: number[];
}

export type JointAngleDataMap = Partial<{ [K in Keypoint]: JointAngleData }>;

export enum Keypoint {
  LEFT_SHOULDER = "left_shoulder",
  RIGHT_SHOULDER = "right_shoulder",
  LEFT_ELBOW = "left_elbow",
  RIGHT_ELBOW = "right_elbow",
  LEFT_WRIST = "left_wrist",
  RIGHT_WRIST = "right_wrist",
  LEFT_HIP = "left_hip",
  RIGHT_HIP = "right_hip",
  LEFT_KNEE = "left_knee",
  RIGHT_KNEE = "right_knee",
  LEFT_ANKLE = "left_ankle",
  RIGHT_ANKLE = "right_ankle",
}

export interface UpdateJointParams {
  ctx: CanvasRenderingContext2D;
  keypoints: poseDetection.Keypoint[];
  jointAngleData: JointAngleData | null;
  jointName: Keypoint;
  invert?: boolean; // Opción con valor por defecto
  velocityHistorySize?: number; // Parámetro opcional para ajustar el tamaño del historial
  angleHistorySize?: number; // Otro ejemplo de opción configurable
}

export type JointConfigMap = Partial<{ [key in Keypoint]: { invert: boolean } }>;
