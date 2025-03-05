export interface IMotionData {
  timestamp: number;
  interval: number;
  gravity: { x: number; y: number; z: number };
  noGravity: { x: number; y: number; z: number };
  noGravityFiltered: { y: number; z: number };
}

export interface IFilterState {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

export interface ICOPPoint {
  ml: number;  // Desplazamiento mediolateral en cm
  ap: number;  // Desplazamiento anteroposterior en cm
}

export interface ICOPRMS {
  ml: number | null;      // COP RMS en el eje mediolateral (cm)
  ap: number | null;      // COP RMS en el eje anteroposterior (cm)
  global: number | null;  // COP RMS global (cm)
}

export interface ICOPStats {
  copPoints: ICOPPoint[];
  meanML: number;             // Promedio del desplazamiento en el eje mediolateral (cm)
  meanAP: number;             // Promedio del desplazamiento en el eje anteroposterior (cm)
  varianceML: number;         // Varianza en el eje mediolateral (cm²)
  varianceAP: number;         // Varianza en el eje anteroposterior (cm²)
  covariance: number;         // Covarianza entre ML y AP (cm²)
  globalVariance: number;     // Varianza global (cm²)
  rmsML: number;              // en cm
  rmsAP: number;              // en cm
  ellipse: {
    semiMajor: number;        // Semieje mayor de la elipse de confianza (cm)
    semiMinor: number;        // Semieje menor de la elipse de confianza (cm)
    orientation: number;      // Orientación de la elipse en radianes
    centerX: number,          // el meanML del COP (cm)
    centerY: number,          // el meanAP del COP (cm)
  };
  copArea: {
    value: number,            // en cm²
    points: {
        x: number;
        y: number;
      }[],
  },
  jerkML: number,             // en cm/s³
  jerkAP: number,             // en cm/s³
}

export interface IMotionStats {
  zeroFrequency: {
    ML_Y: number;
    AP_Z: number;
    Global?: number;
  };
  zeroSTD: {
    ML_Y: number;
    AP_Z: number;
    Global?: number;
  };
  mainFrequency: {
    ML_Y: number;
    AP_Z: number;
    Global?: number;
  };
  RMS: {
    ML_Y: number;
    AP_Z: number;
    Global?: number;
  };
  Variance: {
    ML_Y: number;
    AP_Z: number;
    Global?: number;
  };
  // Variables opcionales
  jerk?: {
    ML_Y?: number;
    AP_Z?: number;
    Global?: number;
  };
  copArea?: {
    boundaryPoints?: {
        x: number;
        y: number;
      }[];
    value?: number;
  };
  ellipse?: {
    semiMajor?: number;
    semiMinor?: number;
    orientation?: number;
    centerX?: number;
    centerY?: number;
  };
  copPoints?: ICOPPoint[];
}

export interface IFrequencyData {
  frequencies_y: number[];
  amplitudes_y: number[];
  frequencies_z: number[];
  amplitudes_z: number[];
  dominantFrequency_y: number | null;
  dominantFrequency_z: number | null;
}