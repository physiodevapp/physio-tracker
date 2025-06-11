import { JointColors, CanvasKeypointName, JointConfigMap } from "../interfaces/pose";

export const jointConfigMap: JointConfigMap = {
    [CanvasKeypointName.RIGHT_ELBOW]: { invert: true },
    [CanvasKeypointName.RIGHT_SHOULDER]: { invert: false },
    [CanvasKeypointName.RIGHT_HIP]: { invert: true },
    [CanvasKeypointName.RIGHT_KNEE]: { invert: true },
    [CanvasKeypointName.LEFT_ELBOW]: { invert: true },
    [CanvasKeypointName.LEFT_SHOULDER]: { invert: false },
    [CanvasKeypointName.LEFT_HIP]: { invert: true },
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
