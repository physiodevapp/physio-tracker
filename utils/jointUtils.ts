import * as poseDetection from "@tensorflow-models/pose-detection";
import { drawAngle, drawAngularVelocity } from "./drawUtils";
import { JointData, Keypoint, UpdateJointParams } from "../interfaces/pose";

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
  jointName: Keypoint
): [Keypoint, Keypoint, Keypoint] | null => {
  switch (jointName) {
    case Keypoint.RIGHT_ELBOW:
      return [
        Keypoint.RIGHT_SHOULDER,
        Keypoint.RIGHT_ELBOW,
        Keypoint.RIGHT_WRIST,
      ];
    case Keypoint.RIGHT_KNEE:
      return [Keypoint.RIGHT_HIP, Keypoint.RIGHT_KNEE, Keypoint.RIGHT_ANKLE];
    case Keypoint.RIGHT_SHOULDER:
      return [
        Keypoint.RIGHT_HIP,
        Keypoint.RIGHT_SHOULDER,
        Keypoint.RIGHT_ELBOW,
      ];
    case Keypoint.RIGHT_HIP:
      return [Keypoint.RIGHT_SHOULDER, Keypoint.RIGHT_HIP, Keypoint.RIGHT_KNEE];

    case Keypoint.LEFT_ELBOW:
      return [Keypoint.LEFT_SHOULDER, Keypoint.LEFT_ELBOW, Keypoint.LEFT_WRIST];
    case Keypoint.LEFT_KNEE:
      return [Keypoint.LEFT_HIP, Keypoint.LEFT_KNEE, Keypoint.LEFT_ANKLE];
    case Keypoint.LEFT_SHOULDER:
      return [Keypoint.LEFT_HIP, Keypoint.LEFT_SHOULDER, Keypoint.LEFT_ELBOW];
    case Keypoint.LEFT_HIP:
      return [Keypoint.LEFT_SHOULDER, Keypoint.LEFT_HIP, Keypoint.LEFT_KNEE];

    default:
      return null; // Si la articulación no es reconocida, devolver null
  }
};

const getJointKeypoints = (
  jointName: Keypoint,
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

export const updateJoint = ({
  ctx,
  keypoints,
  jointData,
  jointName,
  invert = false,
  velocityHistorySize = 5,
  angleHistorySize = 5,
  withVelocity = false, // Valor por defecto (puedes ajustarlo según necesites)
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
      };
    } else {
      jointData = {
        ...jointData,
        angle: angleNow,
        lastTimestamp: timeNow,
      };
    }
  }

  // Dibujar en el canvas:
  // Siempre se dibuja el ángulo
  drawAngle(ctx, kpB, smoothedAngle);

  // Dibujar la velocidad angular solo si withVelocity es true
  if (withVelocity) {
    drawAngularVelocity(ctx, kpB, jointData.angularVelocity);
  }

  return jointData;
};
