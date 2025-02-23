import { Acceleration, Gyroscope } from "@/interfaces/balance";

/**
 * Calculates static balance quality using both accelerometer and gyroscope data.
 */
export const calculateStaticBalanceQuality = (
  accelData: Acceleration[],
  gyroData: Gyroscope[]
): string => {
  if (accelData.length === 0 || gyroData.length === 0) return "No data";

  // Accelerometer calculations
  const accelSum = accelData.reduce(
    (acc, current) => ({
      x: acc.x + current.x,
      y: acc.y + current.y,
      z: acc.z + current.z,
    }),
    { x: 0, y: 0, z: 0 }
  );
  const nAccel = accelData.length;
  const accelMean = {
    x: accelSum.x / nAccel,
    y: accelSum.y / nAccel,
    z: accelSum.z / nAccel,
  };
  const accelVariance = accelData.reduce(
    (acc, current) => ({
      x: acc.x + Math.pow(current.x - accelMean.x, 2),
      y: acc.y + Math.pow(current.y - accelMean.y, 2),
      z: acc.z + Math.pow(current.z - accelMean.z, 2),
    }),
    { x: 0, y: 0, z: 0 }
  );
  const accelStdDev = {
    x: Math.sqrt(accelVariance.x / nAccel),
    y: Math.sqrt(accelVariance.y / nAccel),
    z: Math.sqrt(accelVariance.z / nAccel),
  };
  const accelIndex = Math.sqrt(
    Math.pow(accelStdDev.x, 2) +
      Math.pow(accelStdDev.y, 2) +
      Math.pow(accelStdDev.z, 2)
  );

  // Gyroscope calculations
  const gyroSum = gyroData.reduce(
    (acc, current) => ({
      alpha: acc.alpha + current.alpha,
      beta: acc.beta + current.beta,
      gamma: acc.gamma + current.gamma,
    }),
    { alpha: 0, beta: 0, gamma: 0 }
  );
  const nGyro = gyroData.length;
  const gyroMean = {
    alpha: gyroSum.alpha / nGyro,
    beta: gyroSum.beta / nGyro,
    gamma: gyroSum.gamma / nGyro,
  };
  const gyroVariance = gyroData.reduce(
    (acc, current) => ({
      alpha: acc.alpha + Math.pow(current.alpha - gyroMean.alpha, 2),
      beta: acc.beta + Math.pow(current.beta - gyroMean.beta, 2),
      gamma: acc.gamma + Math.pow(current.gamma - gyroMean.gamma, 2),
    }),
    { alpha: 0, beta: 0, gamma: 0 }
  );
  const gyroStdDev = {
    alpha: Math.sqrt(gyroVariance.alpha / nGyro),
    beta: Math.sqrt(gyroVariance.beta / nGyro),
    gamma: Math.sqrt(gyroVariance.gamma / nGyro),
  };
  const gyroIndex = Math.sqrt(
    Math.pow(gyroStdDev.alpha, 2) +
      Math.pow(gyroStdDev.beta, 2) +
      Math.pow(gyroStdDev.gamma, 2)
  );

  // Combined index and classification thresholds
  const combinedIndex = (accelIndex + gyroIndex) / 2;
  if (combinedIndex < 0.5) return "Excellent";
  if (combinedIndex < 1) return "Good";
  if (combinedIndex < 1.5) return "Fair";
  return "Poor";
};

/**
 * Classifies lateral (side-to-side) and anterior-posterior (forward/backward) sway
 * using accelerometer (x, y) and gyroscope (alpha, beta) data.
 */
export const classifySwayWithGyro = (
  accelData: Acceleration[],
  gyroData: Gyroscope[]
): { lateral: string; anteriorPosterior: string } => {
  if (accelData.length === 0 || gyroData.length === 0) {
    return { lateral: "No data", anteriorPosterior: "No data" };
  }

  const computeStdDev = (data: number[]): number => {
    const n = data.length;
    const mean = data.reduce((a, b) => a + b, 0) / n;
    const variance = data.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) / n;
    return Math.sqrt(variance);
  };

  // Lateral sway: accelerometer x and gyroscope alpha
  const accelX = accelData.map((d) => d.x);
  const gyroAlpha = gyroData.map((d) => d.alpha);
  const stdDevAccelX = computeStdDev(accelX);
  const stdDevGyroAlpha = computeStdDev(gyroAlpha);
  const lateralIndex = (stdDevAccelX + stdDevGyroAlpha) / 2;

  // Anterior-posterior sway: accelerometer y and gyroscope beta
  const accelY = accelData.map((d) => d.y);
  const gyroBeta = gyroData.map((d) => d.beta);
  const stdDevAccelY = computeStdDev(accelY);
  const stdDevGyroBeta = computeStdDev(gyroBeta);
  const anteriorPosteriorIndex = (stdDevAccelY + stdDevGyroBeta) / 2;

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
export const detectVibrationRange = (
  accelData: Acceleration[],
  gyroData: Gyroscope[]
): { vibrationRange: string; vibrationIndex: number } => {
  if (accelData.length === 0 || gyroData.length === 0) {
    return { vibrationRange: "No data", vibrationIndex: 0 };
  }

  const computeStdDev = (data: number[]): number => {
    const n = data.length;
    const mean = data.reduce((a, b) => a + b, 0) / n;
    const variance = data.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) / n;
    return Math.sqrt(variance);
  };

  const stdDevX = computeStdDev(accelData.map((d) => d.x));
  const stdDevY = computeStdDev(accelData.map((d) => d.y));
  const stdDevZ = computeStdDev(accelData.map((d) => d.z));
  const accelVibrationIndex = Math.sqrt(
    Math.pow(stdDevX, 2) + Math.pow(stdDevY, 2) + Math.pow(stdDevZ, 2)
  );

  const stdDevAlpha = computeStdDev(gyroData.map((d) => d.alpha));
  const stdDevBeta = computeStdDev(gyroData.map((d) => d.beta));
  const stdDevGamma = computeStdDev(gyroData.map((d) => d.gamma));
  const gyroVibrationIndex = Math.sqrt(
    Math.pow(stdDevAlpha, 2) + Math.pow(stdDevBeta, 2) + Math.pow(stdDevGamma, 2)
  );

  const combinedVibrationIndex = (accelVibrationIndex + gyroVibrationIndex) / 2;
  let vibrationRange = "";
  if (combinedVibrationIndex < 0.5) {
    vibrationRange = "Low";
  } else if (combinedVibrationIndex < 1.0) {
    vibrationRange = "Moderate";
  } else if (combinedVibrationIndex < 1.5) {
    vibrationRange = "High";
  } else {
    vibrationRange = "Severe";
  }

  return { vibrationRange, vibrationIndex: combinedVibrationIndex };
};