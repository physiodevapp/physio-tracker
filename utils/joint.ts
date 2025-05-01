import * as poseDetection from "@tensorflow-models/pose-detection";
import { JointColors, JointData, CanvasKeypointName, UpdateJointParams, JointConfigMap } from "../interfaces/pose";
// import { drawAngle } from "./draw";

export const jointConfigMap: JointConfigMap = {
    [CanvasKeypointName.RIGHT_ELBOW]: { invert: true },
    [CanvasKeypointName.RIGHT_SHOULDER]: { invert: false },
    [CanvasKeypointName.RIGHT_HIP]: { invert: false },
    [CanvasKeypointName.RIGHT_KNEE]: { invert: true },
    [CanvasKeypointName.LEFT_ELBOW]: { invert: true },
    [CanvasKeypointName.LEFT_SHOULDER]: { invert: false },
    [CanvasKeypointName.LEFT_HIP]: { invert: false },
    [CanvasKeypointName.LEFT_KNEE]: { invert: true },
  };

export const jointOptions = [
  { label: "Right Shoulder", value: CanvasKeypointName.RIGHT_SHOULDER },
  { label: "Right Elbow", value: CanvasKeypointName.RIGHT_ELBOW },
  { label: "Right Hip", value: CanvasKeypointName.RIGHT_HIP },
  { label: "Right Knee", value: CanvasKeypointName.RIGHT_KNEE },
  { label: "Left Shoulder", value: CanvasKeypointName.LEFT_SHOULDER },
  { label: "Left Elbow", value: CanvasKeypointName.LEFT_ELBOW },
  { label: "Left Hip", value: CanvasKeypointName.LEFT_HIP },
  { label: "Left Knee", value: CanvasKeypointName.LEFT_KNEE },
]

const calculateJointAngleDegrees = (
  A: poseDetection.Keypoint,
  B: poseDetection.Keypoint,
  C: poseDetection.Keypoint,
  invert = false,
  orthogonalReference?: 'vertical' | 'horizontal',
) => {
  // ----- 🔍 Solo usar referencia vertical para shoulder o hip -----
  const isShoulder = B.name?.includes('shoulder');
  const isHip = B.name?.includes('hip');

  // Solo aplicamos lógica ortogonal si es shoulder o hip
  if ((orthogonalReference === 'vertical' || orthogonalReference === 'horizontal') && (isShoulder || isHip)) {
    const targetName = isShoulder ? 'elbow' : 'knee';

    const referencePoint =
      A.name?.includes(targetName) ? A :
      C.name?.includes(targetName) ? C :
      null;

    if (!referencePoint) return 0;

    const jointVector = {
      x: referencePoint.x - B.x,
      y: referencePoint.y - B.y,
    };

    let referenceVector: { x: number; y: number };

    if (orthogonalReference === 'vertical') {
      referenceVector = { x: 0, y: 1 }; // línea vertical hacia abajo

      // Ángulo sin signo (como antes)
      const dot = referenceVector.x * jointVector.x + referenceVector.y * jointVector.y;
      const magJoint = Math.hypot(jointVector.x, jointVector.y);
      if (magJoint === 0) return 0;

      const angleDeg = Math.acos(dot / magJoint) * (180 / Math.PI);
      return invert ? 180 - angleDeg : angleDeg;

    } else if (orthogonalReference === 'horizontal') {
      // Línea horizontal hacia el mismo lado que el punto de referencia
      const isRight = referencePoint.x > B.x;
      referenceVector = { x: isRight ? 1 : -1, y: 0 };

      // Ángulo con signo según eje Y
      const angleRad = Math.atan2(referenceVector.y, referenceVector.x) - Math.atan2(jointVector.y, jointVector.x);
      let angleDeg = angleRad * (180 / Math.PI);

      // Normalizar al rango [-180, 180]
      if (angleDeg > 180) angleDeg -= 360;
      if (angleDeg < -180) angleDeg += 360;

      // 👉 Invertir signo si es lado derecho
      if (referenceVector.x < 0) {
        angleDeg = -angleDeg;
      }

      return invert ? -angleDeg : angleDeg;
    }
  }

  // ----- 🧮 Lógica estándar: ángulo entre A-B-C -----
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
  keypoints,
  jointData,
  jointName,
  invert = false,
  angleHistorySize = 5,
  graphAngle = null,
  orthogonalReference,
  // mirror = false,
  // ctx,
}: UpdateJointParams): JointData => {
  // Buscar los keypoints de la articulación
  const jointKeypoints = getJointKeypoints(jointName, keypoints);

  if (!jointKeypoints) {
    return (
      jointData ?? {
        angle: 0,
        lastTimestamp: performance.now(),
        angleHistory: [],
        color: getColorsForJoint(null),
      }
    );
  }

  const [kpA, kpB, kpC] = jointKeypoints;
  // console.log('graphAngle ', graphAngle)
  const angleNow = graphAngle ?? calculateJointAngleDegrees(kpA, kpB, kpC, invert, orthogonalReference);
  let smoothedAngle = angleNow;
  const timeNow = performance.now();

  if (!jointData) {
    jointData = {
      angle: angleNow,
      lastTimestamp: timeNow,
      angleHistory: [],
      color: getColorsForJoint(null),
    };
  } else {
    // ---- Actualizar historial de ángulos para suavizar el valor mostrado ---- review
    if (!graphAngle) {
      const prevData = jointData;
      prevData.angleHistory.push(angleNow);
      if (prevData.angleHistory.length > angleHistorySize) {
        prevData.angleHistory.shift();
      }
      smoothedAngle =
        prevData.angleHistory.reduce((sum, a) => sum + a, 0) /
        prevData.angleHistory.length;
    }

    jointData = {
      ...jointData,
      angle: smoothedAngle, //angleNow, review
      lastTimestamp: timeNow,
      color: getColorsForJoint(jointName)
    };
  }

  // Dibujar en el canvas:
  // Siempre se dibuja el ángulo
  // if (ctx)
  //   drawAngle({ctx, kp: kpB, angle: smoothedAngle, mirror});

  return jointData;
};

export const formatJointName = (jointName: string): string => {
  const sideMap: Record<string, string> = {
    left: "L",
    right: "R",
  };

  const [side, part] = jointName.split("_");

  const sideShort = sideMap[side] ?? side;
  const capitalizedPart = part.charAt(0).toUpperCase() + part.slice(1);

  return `${sideShort} ${capitalizedPart}`;
};
