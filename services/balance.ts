import { Acceleration } from "@/interfaces/balance";

/**
 * Calculates static balance quality using both accelerometer and gyroscope data.
 */
export const calculateStaticBalanceQuality = ({
  accelData,
  useX = true,
  useY = true,
  useZ = true,
}: {
  accelData: Acceleration[];
  useX?: boolean;
  useY?: boolean;
  useZ?: boolean;
}): string => {
  if (accelData.length === 0) return "No data";

  // Calculamos la suma de las aceleraciones solo en los ejes seleccionados
  const accelSum = accelData.reduce(
    (acc, current) => ({
      x: useX ? acc.x + current.x : acc.x,
      y: useY ? acc.y + current.y : acc.y,
      z: useZ ? acc.z + (current.z ?? 0) : acc.z,
    }),
    { x: 0, y: 0, z: 0 }
  );

  const nAccel = accelData.length;
  const accelMean = {
    x: useX ? accelSum.x / nAccel : 0,
    y: useY ? accelSum.y / nAccel : 0,
    z: useZ ? accelSum.z / nAccel : 0,
  };

  // Calculamos la varianza solo en los ejes seleccionados
  const accelVariance = accelData.reduce(
    (acc, current) => ({
      x: useX ? acc.x + Math.pow(current.x - accelMean.x, 2) : acc.x,
      y: useY ? acc.y + Math.pow(current.y - accelMean.y, 2) : acc.y,
      z: useZ ? acc.z + Math.pow((current.z ?? 0) - accelMean.z, 2) : acc.z,
    }),
    { x: 0, y: 0, z: 0 }
  );

  // Desviación estándar
  const accelStdDev = {
    x: useX ? Math.sqrt(accelVariance.x / nAccel) : 0,
    y: useY ? Math.sqrt(accelVariance.y / nAccel) : 0,
    z: useZ ? Math.sqrt(accelVariance.z / nAccel) : 0,
  };

  // Índice de estabilidad combinando solo los ejes activos
  const accelIndex = Math.sqrt(
    (useX ? Math.pow(accelStdDev.x, 2) : 0) +
    (useY ? Math.pow(accelStdDev.y, 2) : 0) +
    (useZ ? Math.pow(accelStdDev.z, 2) : 0)
  );

  // Contamos cuántos ejes están en uso para la normalización
  const activeAxes = [useX, useY, useZ].filter(Boolean).length || 1; // Evita división por 0

  // Normalizamos el índice según el número de ejes utilizados
  const combinedIndex = accelIndex / activeAxes;

  // Clasificación de la calidad del equilibrio
  if (combinedIndex < 0.5) return "Excellent";
  if (combinedIndex < 1) return "Good";
  if (combinedIndex < 1.5) return "Fair";
  return "Poor";
};

/**
 * Classifies lateral (side-to-side) and anterior-posterior (forward/backward) sway
 * using accelerometer
 */
export const classifySway = (
  accelData: Acceleration[]
): { lateral: string; anteriorPosterior: string } => {
  if (accelData.length === 0) {
    return { lateral: "No data", anteriorPosterior: "No data" };
  }

  const computeStdDev = (data: number[]): number => {
    if (data.length === 0) return 0;
    const mean = data.reduce((sum, value) => sum + value, 0) / data.length;
    const variance =
      data.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
      data.length;
    return Math.sqrt(variance);
  };

  // Lateral sway (X-axis acceleration)
  const stdDevAccelX = computeStdDev(accelData.map((d) => d.x));
  const lateralIndex = stdDevAccelX / 2;

  // Anterior-posterior sway (Y-axis acceleration)
  const stdDevAccelY = computeStdDev(accelData.map((d) => d.y));
  const anteriorPosteriorIndex = stdDevAccelY / 2;

  // Umbrales de clasificación del balanceo
  const minimalThreshold = 0.2;
  const moderateThreshold = 0.5;
  const classify = (index: number): string => {
    if (index < minimalThreshold) return "Minimal";
    if (index < moderateThreshold) return "Moderate";
    return "Severe";
  };

  return {
    lateral: classify(lateralIndex),
    anteriorPosterior: classify(anteriorPosteriorIndex),
  };
};


/**
 * Detects vibration range based on accelerometer and gyroscope data,
 * returning a descriptive label and the calculated vibration index.
 */
export const detectVibrationRange = ({
  accelData,
  useX = true,
  useY = true,
  useZ = true,
  vibrationThreshold = 1,
}: {
  accelData: Acceleration[];
  useX?: boolean;
  useY?: boolean;
  useZ?: boolean;
  vibrationThreshold?: number;
}): { vibrationRange: string; vibrationIndex: number } => {
  if (accelData.length === 0) {
    return { vibrationRange: "No data", vibrationIndex: 0 };
  }

  const computeStdDev = (data: number[]): number => {
    if (data.length === 0) return 0;
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance =
      data.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) /
      data.length;
    return Math.sqrt(variance);
  };

  // Calculamos la desviación estándar solo para los ejes habilitados
  const stdDevX = useX ? computeStdDev(accelData.map((d) => d.x)) : 0;
  const stdDevY = useY ? computeStdDev(accelData.map((d) => d.y)) : 0;
  const stdDevZ = useZ ? computeStdDev(accelData.map((d) => d.z ?? 0)) : 0;

  // Índice de vibración combinado solo con los ejes activos
  const accelVibrationIndex = Math.sqrt(
    (useX ? Math.pow(stdDevX, 2) : 0) +
      (useY ? Math.pow(stdDevY, 2) : 0) +
      (useZ ? Math.pow(stdDevZ, 2) : 0)
  );

  // Normalización dinámica según la cantidad de ejes usados
  const activeAxes = [useX, useY, useZ].filter(Boolean).length || 1; // Evitar dividir por 0
  const combinedVibrationIndex = accelVibrationIndex / activeAxes;

  // Clasificación del rango de vibración
  let vibrationRange = "";
  if (combinedVibrationIndex < vibrationThreshold * 0.5) {
    vibrationRange = "Low";
  } else if (combinedVibrationIndex < vibrationThreshold) {
    vibrationRange = "Moderate";
  } else if (combinedVibrationIndex < vibrationThreshold * 1.5) {
    vibrationRange = "High";
  } else {
    vibrationRange = "Severe";
  }

  return { vibrationRange, vibrationIndex: combinedVibrationIndex };
};

