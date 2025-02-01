import * as poseDetection from '@tensorflow-models/pose-detection';

export interface VideoConstraints {
  facingMode: "user" | "environment";
}

export interface PoseSettings {
  scoreThreshold: number;
}

export interface KeypointData {
  position: { x: number; y: number };
  lastTimestamp: number;
  velocityInPixels: number;
  velocityInPixelsHistory: number[];
}

export interface JointData {
  angle: number;
  lastTimestamp: number;
  angularVelocity: number;
  angularVelocityHistory: number[];
  angleHistory: number[];
}

export type JointDataMap = Partial<{ [K in Keypoint]: JointData }>;

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
  jointData: JointData | null;
  jointName: Keypoint;
  invert?: boolean;
  velocityHistorySize?: number;
  angleHistorySize?: number;
  withVelocity?: boolean; // Nuevo parámetro: si es true, se calcula y dibuja la velocidad
}

export type JointConfigMap = Partial<{ [key in Keypoint]: { invert: boolean } }>;

export enum Kinematics {
  ANGLE = "angle",
  ANGULAR_VELOCITY = "angularVelocity",
}
