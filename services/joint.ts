import * as poseDetection from "@tensorflow-models/pose-detection";
import { drawAngle, drawAngularVelocity } from "./draw";
import { JointColors, JointData, CanvasKeypointName, UpdateJointParams } from "../interfaces/pose";

const calculateJointAngleDegrees = (
  A: poseDetection.Keypoint,
  B: poseDetection.Keypoint,
  C: poseDetection.Keypoint,
  invert = false
) => {
  // Vectores BA y BC
  const BA = { x: A.x - B.x, y: A.y - B.y };
  const BC = { x: C.x - B.x, y: C.y - B.y };

  // Producto punto BA · BC
  const dot = BA.x * BC.x + BA.y * BC.y;

  // Magnitudes de BA y BC
  const magBA = Math.sqrt(BA.x ** 2 + BA.y ** 2);
  const magBC = Math.sqrt(BC.x ** 2 + BC.y ** 2);

  // Evitar división por cero
  if (magBA === 0 || magBC === 0) {
    return 0;
  }

  // Ángulo en radianes
  const angleRad = Math.acos(dot / (magBA * magBC));
  // Convertir a grados
  let angleDeg = (angleRad * 180) / Math.PI;

  if (invert) {
    angleDeg = 180 - angleDeg;
  }

  return angleDeg;
};

const getJointPoints = (
  jointName: CanvasKeypointName
): [CanvasKeypointName, CanvasKeypointName, CanvasKeypointName] | null => {
  switch (jointName) {
    case CanvasKeypointName.RIGHT_ELBOW:
      return [
        CanvasKeypointName.RIGHT_SHOULDER,
        CanvasKeypointName.RIGHT_ELBOW,
        CanvasKeypointName.RIGHT_WRIST,
      ];
    case CanvasKeypointName.RIGHT_KNEE:
      return [CanvasKeypointName.RIGHT_HIP, CanvasKeypointName.RIGHT_KNEE, CanvasKeypointName.RIGHT_ANKLE];
    case CanvasKeypointName.RIGHT_SHOULDER:
      return [
        CanvasKeypointName.RIGHT_HIP,
        CanvasKeypointName.RIGHT_SHOULDER,
        CanvasKeypointName.RIGHT_ELBOW,
      ];
    case CanvasKeypointName.RIGHT_HIP:
      return [CanvasKeypointName.RIGHT_SHOULDER, CanvasKeypointName.RIGHT_HIP, CanvasKeypointName.RIGHT_KNEE];

    case CanvasKeypointName.LEFT_ELBOW:
      return [CanvasKeypointName.LEFT_SHOULDER, CanvasKeypointName.LEFT_ELBOW, CanvasKeypointName.LEFT_WRIST];
    case CanvasKeypointName.LEFT_KNEE:
      return [CanvasKeypointName.LEFT_HIP, CanvasKeypointName.LEFT_KNEE, CanvasKeypointName.LEFT_ANKLE];
    case CanvasKeypointName.LEFT_SHOULDER:
      return [CanvasKeypointName.LEFT_HIP, CanvasKeypointName.LEFT_SHOULDER, CanvasKeypointName.LEFT_ELBOW];
    case CanvasKeypointName.LEFT_HIP:
      return [CanvasKeypointName.LEFT_SHOULDER, CanvasKeypointName.LEFT_HIP, CanvasKeypointName.LEFT_KNEE];

    default:
      return null; // Si la articulación no es reconocida, devolver null
  }
};

const getJointKeypoints = (
  jointName: CanvasKeypointName,
  keypoints: poseDetection.Keypoint[]
):
  | [poseDetection.Keypoint, poseDetection.Keypoint, poseDetection.Keypoint]
  | null => {
  const jointPoints = getJointPoints(jointName);
  if (!jointPoints) return null;

  const [pointA, pointB, pointC] = jointPoints;
  const kpA = keypoints.find((kp) => kp.name === pointA);
  const kpB = keypoints.find((kp) => kp.name === pointB);
  const kpC = keypoints.find((kp) => kp.name === pointC);

  // Verificar que los keypoints existen
  if (!kpA || !kpB || !kpC) return null;

  return [kpA, kpB, kpC];
};

// export enum CanvasKeypointName {
//   LEFT_SHOULDER = "left_shoulder",
//   LEFT_ELBOW = "left_elbow",
//   LEFT_WRIST = "left_wrist",
//   LEFT_HIP = "left_hip",
//   LEFT_KNEE = "left_knee",
//   LEFT_ANKLE = "left_ankle",
//   RIGHT_SHOULDER = "right_shoulder",
//   RIGHT_ELBOW = "right_elbow",
//   RIGHT_WRIST = "right_wrist",
//   RIGHT_HIP = "right_hip",
//   RIGHT_KNEE = "right_knee",
//   RIGHT_ANKLE = "right_ankle",
// }

// export interface JointColors {
//   borderColor: string;
//   backgroundColor: string;
// }

export const getColorsForJoint = (jointName: string | null): JointColors => {
  // Si es null o no está en el enum, retorna blanco
  if (
    jointName === null ||
    !(Object.values(CanvasKeypointName) as string[]).includes(jointName)
  ) {
    return {
      borderColor: "white",
      backgroundColor: "white"
    };
  }

  // Calculamos un hash basado en el string
  let hash = 0;
  for (let i = 0; i < jointName.length; i++) {
    hash = jointName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const absHash = Math.abs(hash);

  // Determinamos si el nombre contiene "right" o "left"
  const lowerName = jointName.toLowerCase();
  const isRight = lowerName.includes("right") && !lowerName.includes("left");
  const isLeft = lowerName.includes("left") && !lowerName.includes("right");

  let baseHue: number;
  if (isRight) {
    // Para articulaciones del lado derecho, hue en [0, 180)
    baseHue = absHash % 180;
  } else if (isLeft) {
    // Para articulaciones del lado izquierdo, hue en [180, 360)
    baseHue = (absHash % 180) + 180;
  } else {
    // Si no se especifica lado, usamos el rango completo
    baseHue = absHash % 360;
  }

  return {
    borderColor: `hsl(${baseHue}, 70%, 50%)`,
    backgroundColor: `hsla(${baseHue}, 70%, 50%, 0.2)`
  };
};


export const updateJoint = ({
  ctx,
  keypoints,
  jointData,
  jointName,
  invert = false,
  velocityHistorySize = 5,
  angleHistorySize = 5,
  withVelocity = false,
  mirror = false,
  videoProcessed = false,
}: UpdateJointParams): JointData => {
  // Buscar los keypoints de la articulación
  const jointKeypoints = getJointKeypoints(jointName, keypoints);

  if (!jointKeypoints) {
    return (
      jointData ?? {
        angle: 0,
        lastTimestamp: performance.now(),
        angularVelocity: 0,
        angularVelocityHistory: [],
        angleHistory: [],
        color: getColorsForJoint(null),
      }
    );
  }

  const [kpA, kpB, kpC] = jointKeypoints;
  const angleNow = calculateJointAngleDegrees(kpA, kpB, kpC, invert);
  let smoothedAngle = angleNow;
  const timeNow = performance.now();

  if (withVelocity) {
    if (!jointData) {
      // Inicializar si no existe información previa
      jointData = {
        angle: angleNow,
        lastTimestamp: timeNow,
        angularVelocity: 0,
        angularVelocityHistory: [],
        angleHistory: [],
        color: getColorsForJoint(null),
      };
    } else {
      const prevData = jointData;
      const anglePrev = prevData.angle;
      const timePrev = prevData.lastTimestamp;
      const deltaTime = (timeNow - timePrev) / 1000; // convertir a segundos

      let angularVelocity = 0;
      if (deltaTime > 0) {
        angularVelocity = (angleNow - anglePrev) / deltaTime;
      }

      // Actualizar historial de velocidades
      prevData.angularVelocityHistory.push(angularVelocity);
      if (prevData.angularVelocityHistory.length > velocityHistorySize) {
        prevData.angularVelocityHistory.shift();
      }

      // Calcular velocidad angular suavizada (media móvil)
      const smoothedAngularVelocity =
        prevData.angularVelocityHistory.reduce((acc, v) => acc + v, 0) /
        prevData.angularVelocityHistory.length;

      // Actualizar historial de ángulos para suavizar el valor mostrado
      prevData.angleHistory.push(angleNow);
      if (prevData.angleHistory.length > angleHistorySize) {
        prevData.angleHistory.shift();
      }

      smoothedAngle =
        prevData.angleHistory.reduce((sum, a) => sum + a, 0) /
        prevData.angleHistory.length;

      // Guardar el nuevo estado de la articulación
      jointData = {
        angle: angleNow,
        lastTimestamp: timeNow,
        angularVelocity: smoothedAngularVelocity,
        angularVelocityHistory: prevData.angularVelocityHistory,
        angleHistory: prevData.angleHistory,
        color: getColorsForJoint(jointName),
      };
    }
  } else {
    // Si solo se requiere dibujar el ángulo, se actualiza solo la información necesaria
    if (!jointData) {
      jointData = {
        angle: angleNow,
        lastTimestamp: timeNow,
        angularVelocity: 0,
        angularVelocityHistory: [],
        angleHistory: [],
        color: getColorsForJoint(null),
      };
    } else {
      jointData = {
        ...jointData,
        angle: angleNow,
        lastTimestamp: timeNow,
        color: getColorsForJoint(jointName)
      };
    }
  }

  // Dibujar en el canvas:
  // Siempre se dibuja el ángulo
  drawAngle({ctx, kp: kpB, angle: smoothedAngle, mirror});

  // Dibujar la velocidad angular solo si withVelocity es true
  if (withVelocity && !videoProcessed) {
    drawAngularVelocity({ctx, kp: kpB, angularVelocity: jointData.angularVelocity, mirror});
  }

  return jointData;
};
