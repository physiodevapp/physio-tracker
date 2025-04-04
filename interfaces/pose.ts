import type * as poseDetection from '@tensorflow-models/pose-detection';

export enum CanvasKeypointName {
  LEFT_SHOULDER = "left_shoulder",
  LEFT_ELBOW = "left_elbow",
  LEFT_WRIST = "left_wrist",
  LEFT_HIP = "left_hip",
  LEFT_KNEE = "left_knee",
  LEFT_ANKLE = "left_ankle",
  RIGHT_SHOULDER = "right_shoulder",
  RIGHT_ELBOW = "right_elbow",
  RIGHT_WRIST = "right_wrist",
  RIGHT_HIP = "right_hip",
  RIGHT_KNEE = "right_knee",
  RIGHT_ANKLE = "right_ankle",
}

export enum Kinematics {
  ANGLE = "angle",
  // ANGULAR_VELOCITY = "angularVelocity",
}

export interface PoseSettings {
  scoreThreshold: number;
}

export interface CanvasKeypointData {
  position: { x: number; y: number };
  lastTimestamp: number;
}

export interface JointColors {
  borderColor: string;
  backgroundColor: string;
}

export interface JointData {
  angle: number;
  lastTimestamp: number;
  // angularVelocity: number;
  // angularVelocityHistory: number[];
  angleHistory: number[];
  color: JointColors;
}

export type JointDataMap = Partial<{ [K in CanvasKeypointName]: JointData }>;

export interface UpdateJointParams {
  ctx: CanvasRenderingContext2D;
  keypoints: poseDetection.Keypoint[];
  jointData: JointData | null;
  jointName: CanvasKeypointName;
  invert?: boolean;
  // velocityHistorySize?: number;
  angleHistorySize?: number;
  // withVelocity?: boolean;
  mirror?: boolean;
  drawVelocity?: boolean
}

export type JointConfigMap = Partial<{ [key in CanvasKeypointName]: { invert: boolean } }>;
