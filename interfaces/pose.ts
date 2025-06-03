import type * as poseDetection from '@tensorflow-models/pose-detection';
import { AnnotationOptions } from 'chartjs-plugin-annotation';

export enum CanvasKeypointName {
  LEFT_SHOULDER = "left_shoulder",
  LEFT_ELBOW = "left_elbow",
  LEFT_WRIST = "left_wrist",
  LEFT_HIP = "left_hip",
  LEFT_KNEE = "left_knee",
  LEFT_ANKLE = "left_ankle",
  LEFT_HEEL = "left_heel",
  LEFT_FOOT_INDEX = "left_foot_index",
  RIGHT_SHOULDER = "right_shoulder",
  RIGHT_ELBOW = "right_elbow",
  RIGHT_WRIST = "right_wrist",
  RIGHT_HIP = "right_hip",
  RIGHT_KNEE = "right_knee",
  RIGHT_ANKLE = "right_ankle",
  RIGHT_HEEL = "right_heel",
  RIGHT_FOOT_INDEX = "right_foot_index",
}

export enum Kinematics {
  ANGLE = "angle",
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
  angleHistory: number[];
  color: JointColors;
}

export type JointDataMap = Partial<{ [K in CanvasKeypointName]: JointData }>;

export interface UpdateJointParams {
  keypoints: poseDetection.Keypoint[];
  jointData: JointData | null;
  jointName: CanvasKeypointName;
  ctx?: CanvasRenderingContext2D;
  invert?: boolean;
  angleHistorySize?: number;
  mirror?: boolean;
  graphAngle?: number | null;
  orthogonalReference?: 'vertical' | 'horizontal';
}

export type JointConfigMap = Partial<{ [key in CanvasKeypointName]: { invert: boolean } }>;

export type DragLimits = Record<string, { min: number; max: number }>;

export type PoseAnnotations = Record<string, AnnotationOptions>

export interface JumpPoint {
  index: number;
  angle: number;
  videoTime: number;
  yValue: number;
}
export type Jump = {
  impulsePoint: JumpPoint;
  takeoffPoint: JumpPoint;
  landingPoint: JumpPoint;
  cushionPoint: JumpPoint;
}

