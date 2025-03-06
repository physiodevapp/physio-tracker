import { ICOPPoint, ICOPRMS, ICOPStats, IFilterState, IMotionData } from "@/interfaces/balance";
import { FFT } from "dsp.js-browser";

// Aplica un filtro Butterworth de manera incremental a una muestra de datos.
export function butterworthLowPass_SampleGeneric({
  x0, 
  states, 
  cutoffFrequency,
  samplingFrequency
}: {
  x0: number;
  states: IFilterState[];
  cutoffFrequency: number;
  samplingFrequency: number;
}): number {
  
  function butterworthLowPass_Sample(x0: number, state: IFilterState, cutoffFrequency: number, samplingFrequency: number): number {
    const Q = 1 / Math.sqrt(2); // Factor Q para Butterworth de segundo orden
    const omega = 2 * Math.PI * cutoffFrequency / samplingFrequency;
    const cosw = Math.cos(omega);
    const sinw = Math.sin(omega);
    const alpha = sinw / (2 * Q);

    // Coeficientes del filtro
    const b0 = (1 - cosw) / 2;
    const b1 = 1 - cosw;
    const b2 = (1 - cosw) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cosw;
    const a2 = 1 - alpha;

    // Normalización
    const b0n = b0 / a0;
    const b1n = b1 / a0;
    const b2n = b2 / a0;
    const a1n = a1 / a0;
    const a2n = a2 / a0;

    // Ecuación en diferencias:
    // y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
    const y0 = b0n * x0 + b1n * state.x1 + b2n * state.x2 - a1n * state.y1 - a2n * state.y2;

    // Actualizamos el estado del filtro
    state.x2 = state.x1;
    state.x1 = x0;
    state.y2 = state.y1;
    state.y1 = y0;

    return y0;
  }

  let output = x0;

  for (let i = 0; i < states.length; i++) {
    output = butterworthLowPass_Sample(output, states[i], cutoffFrequency, samplingFrequency);
  }

  return output;
}

// Aplica un filtro Butterworth en bloque a una muestra de datos.
export function butterworthLowPass_BlockGeneric({
  data,
  cutoffFrequency,
  samplingFrequency,
  order,
}: {
  data: number[];
  cutoffFrequency: number;
  order: number;
  samplingFrequency: number;
}): number[] {
  function butterworthLowPass_Block(data: number[], cutoffFrequency: number, samplingFrequency: number): number[] {
    // Valor de Q para un filtro Butterworth de segundo orden (1/√2 para Butterworth).
    const Q = 1 / Math.sqrt(2);
    // Cálculo del ángulo normalizado.
    const omega = (2 * Math.PI * cutoffFrequency) / samplingFrequency;
    const cosw = Math.cos(omega);
    const sinw = Math.sin(omega);
    const alpha = sinw / (2 * Q);

    // Coeficientes del filtro
    const b0 = (1 - cosw) / 2;
    const b1 = 1 - cosw;
    const b2 = (1 - cosw) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cosw;
    const a2 = 1 - alpha;

    // Normalización de coeficientes
    const b0n = b0 / a0;
    const b1n = b1 / a0;
    const b2n = b2 / a0;
    const a1n = a1 / a0;
    const a2n = a2 / a0;

    const filtered: number[] = [];
    // Variables para almacenar valores previos de entrada y salida.
    let x1 = 0, x2 = 0;
    let y1 = 0, y2 = 0;

    for (let i = 0; i < data.length; i++) {
      const x0 = data[i];
      // Ecuación de diferencia: y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
      const y0 = b0n * x0 + b1n * x1 + b2n * x2 - a1n * y1 - a2n * y2;
      filtered.push(y0);

      // Actualizar valores para la siguiente iteración
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;
    }
    return filtered;
  }

  if (order % 2 !== 0) {
    throw new Error("El orden debe ser par, ya que cada pasada es de orden 2.");
  }

  let result = data;
  const nStages = order / 2;

  for (let i = 0; i < nStages; i++) {
    result = butterworthLowPass_Block(result, cutoffFrequency, samplingFrequency);
  }

  return result;
}

// Calcula la raíz cuadrada media (RMS) de un conjunto de valores numéricos.
export function calculateRMS({values}: {values: number[]}): number {
  if (values.length === 0) return 0; // Evita dividir por 0 en caso de array vacío.

  const sumSquares = values.reduce((acc, a) => acc + a * a, 0);
  const meanSquare = sumSquares / values.length;
  return Math.sqrt(meanSquare);
}

// Calcula la desviación estándar (STD) de un conjunto de valores numéricos.
export function calculateSTD({values}: {values: number[]}): number {
  if (values.length === 0) return 0; // Evita dividir por 0 en caso de array vacío.

  const mean = values.reduce((acc, val) => acc + val, 0) / values.length;
  const variance = values.reduce((acc, val) => acc + (val - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Calcula las frecuencias dominantes y espectros de señal en los ejes Y y Z.
export function getFrequencyFeatures({
  calculationMode,
  motionData,
  cutoffFrequency,
  samplingFrequency,
  timeWindow,
  windowSize = 10,
}: {
  calculationMode: "realTime" | "postProcessing";
  motionData: IMotionData[];
  cutoffFrequency: number;
  samplingFrequency: number;
  timeWindow?: number;
  windowSize?: number;
}) {
  
  function processSignal(signal: number[]) {
    function getDominantFrequency({
      frequencies, 
      amplitudes, 
      windowSize = 10, 
      freqAnalysisBand = 2, // Enfoque detallado en 0-2 Hz
      freqMaxThreshold = 5, // Considerar picos hasta 5 Hz
      prominenceThreshold = 0.5, // Diferencia máxima de amplitud antes de considerar otro pico
      amplitudeThreshold = 0.2 // Diferencia de amplitudes para aceptar un pico sin prominencia
    }: {
      frequencies: number[], 
      amplitudes: number[], 
      windowSize?: number, 
      freqAnalysisBand?: number, 
      freqMaxThreshold?: number, 
      prominenceThreshold?: number, 
      amplitudeThreshold?: number
    }): { dominantFrequency: number } {
    
      function getPeakProminence({
        amplitudes, 
        index, 
        windowSize = 10
      }: {
        amplitudes: number[], 
        index: number, 
        windowSize?: number
      }): number {
        const n = amplitudes.length;
        
        // Limitar la ventana de búsqueda
        const leftStart = Math.max(0, index - windowSize);
        const rightEnd = Math.min(n, index + windowSize + 1);
        
        // Buscar los mínimos en la ventana izquierda y derecha
        const leftMin = Math.min(...amplitudes.slice(leftStart, index));
        const rightMin = Math.min(...amplitudes.slice(index + 1, rightEnd));
    
        // Calcular la prominencia
        return amplitudes[index] - Math.max(leftMin, rightMin);
      }
    
      if (!frequencies.length || !amplitudes.length) {
        return { dominantFrequency: 0 };
      }
    
      // 📌 1️⃣ Detectar picos en la banda 0-2 Hz
      const bandPeaks0_2 = frequencies
        .map((f, i) => (f <= freqAnalysisBand ? i : -1))
        .filter(i => i !== -1 && i > 0 && i < amplitudes.length - 1)
        .filter(i => amplitudes[i] > amplitudes[i - 1] || amplitudes[i] > amplitudes[i + 1]);
    
      // 📌 2️⃣ Detectar picos en la banda 2-5 Hz
      const bandPeaks0_5 = frequencies
        .map((f, i) => (f <= freqMaxThreshold ? i : -1))
        .filter(i => i !== -1 && i > 0 && i < amplitudes.length - 1)
        .filter(i => amplitudes[i] > amplitudes[i - 1] || amplitudes[i] > amplitudes[i + 1]);
    
      // 📌 3️⃣ Calcular la prominencia para cada pico detectado
      const bandPeakData0_2 = bandPeaks0_2.map(idx => ({
        index: idx,
        frequency: frequencies[idx],
        amplitude: amplitudes[idx],
        prominence: getPeakProminence({ amplitudes, index: idx, windowSize })
      }));
    
      const bandPeakData0_5 = bandPeaks0_5.map(idx => ({
        index: idx,
        frequency: frequencies[idx],
        amplitude: amplitudes[idx],
        prominence: getPeakProminence({ amplitudes, index: idx, windowSize })
      }));
    
      // 📌 4️⃣ Determinar el pico más prominente en 0-2 Hz
      const mostProminentPeak0_2 = bandPeakData0_2
        .filter(peak => peak.prominence > 0)
        .reduce((maxPeak, peak) => (peak.prominence > maxPeak.prominence ? peak : maxPeak), bandPeakData0_2[0]);
    
      // 📌 5️⃣ Determinar el pico con mayor amplitud en 0-2 Hz
      const highestAmplitudePeak0_2 = bandPeakData0_2
        .reduce((maxPeak, peak) => (peak.amplitude > maxPeak.amplitude ? peak : maxPeak), bandPeakData0_2[0]);
    
      let finalPeak0_2 = mostProminentPeak0_2 || highestAmplitudePeak0_2;
    
      if (!finalPeak0_2) return { dominantFrequency: 0 }; // No hay picos en 0-2 Hz
    
      // 📌 6️⃣ Comparar amplitudes y decidir si reemplazar el pico prominente en 0-2 Hz
      if (highestAmplitudePeak0_2 && mostProminentPeak0_2 &&
          highestAmplitudePeak0_2.amplitude - mostProminentPeak0_2.amplitude >= amplitudeThreshold) {
        finalPeak0_2 = highestAmplitudePeak0_2;
      }
    
      // 📌 7️⃣ Seleccionar el pico prominente más alto en 2-5 Hz
      const mostProminentPeak0_5 = bandPeakData0_5.length > 0 
        ? bandPeakData0_5.reduce((maxPeak, peak) => peak.prominence > maxPeak.prominence ? peak : maxPeak, bandPeakData0_5[0]) 
        : null;
    
      // 📌 8️⃣ Tomar decisión final entre 0-2 Hz y 2-5 Hz
      if (mostProminentPeak0_5 && finalPeak0_2 &&
          mostProminentPeak0_5.amplitude > finalPeak0_2.amplitude + prominenceThreshold) {
        return { dominantFrequency: mostProminentPeak0_5.frequency };
      }
    
      return { dominantFrequency: finalPeak0_2.frequency };
    }

    const { frequencies, amplitudes } = getFrequencySpectrum({ 
      signal,
      samplingFrequency, 
      timeWindow 
    });
    const { dominantFrequency } = getDominantFrequency({ 
      frequencies, 
      amplitudes,
      windowSize 
    });

    return { frequencies, amplitudes, dominantFrequency };
  }

  const signal_y =
    calculationMode === "realTime"
      ? motionData.map((item) => item.noGravityFiltered.y)
      : butterworthLowPass_BlockGeneric({
          data: motionData.map((record) => record.noGravity.y),
          cutoffFrequency,
          samplingFrequency,
          order: 4,
        });

  const result_y = processSignal(signal_y);

  const signal_z =
    calculationMode === "realTime"
      ? motionData.map((item) => item.noGravityFiltered.z)
      : butterworthLowPass_BlockGeneric({
          data: motionData.map((record) => record.noGravity.z),
          cutoffFrequency,
          samplingFrequency,
          order: 4,
        });

  const result_z = processSignal(signal_z);

  return {
    frequencies_y: result_y.frequencies,
    amplitudes_y: result_y.amplitudes,
    dominantFrequency_y: result_y.dominantFrequency,
    frequencies_z: result_z.frequencies,
    amplitudes_z: result_z.amplitudes,
    dominantFrequency_z: result_z.dominantFrequency,
  };
}

// Obtiene los parámetros del espectro (frecuencias y amplitudes) de una señal de entrada.
export function getFrequencySpectrum({
  signal,
  samplingFrequency,
  timeWindow = 5,
  discardStartSeconds = 5,
  discardEndSeconds = 5,
}: {
  signal: number[];
  samplingFrequency: number;
  timeWindow?: number;
  discardStartSeconds?: number;
  discardEndSeconds?: number;
}) {
  if (signal.length === 0) {
    throw new Error("La señal está vacía. No se puede calcular el espectro.");
  }

  let recentSignal: number[];

  // Extraer los datos de los últimos "timeWindow" segundos.
  if (timeWindow === undefined) {
    // Usar toda la señal, descartando los primeros y últimos segundos
    const startSamples = Math.floor(samplingFrequency * discardStartSeconds);
    const endSamples = Math.floor(samplingFrequency * discardEndSeconds);
    recentSignal = signal.slice(startSamples, signal.length - endSamples);
  } else {
    // Extraer los datos de los últimos "timeWindow" segundos.
    const samplesNeeded = Math.floor(samplingFrequency * timeWindow);
    recentSignal = signal.slice(-samplesNeeded);
  }

  // 1. Zero-padding: asegurarse de que la longitud de la señal sea una potencia de 2.
  let N = 1;
  while (N < recentSignal.length) {
    N *= 2;
  }
  const paddedSignal = [...recentSignal, ...Array(N - recentSignal.length).fill(0)];

  // 2. Aplicar ventana de Hann
  const hannWindow = paddedSignal.map(
    (val, i) => val * (0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1))))
  );

  // 3. Crear una instancia FFT con la señal con ventana.
  const fftObj = new FFT(N, samplingFrequency);
  fftObj.forward(hannWindow);

  // 4. Calcular la resolución en frecuencia.
  const freqResolution = samplingFrequency / N;

  // 5. Construir los arrays de frecuencias y amplitudes (se usa solo hasta N/2, por la simetría).
  const frequencies: number[] = [];
  const amplitudes: number[] = [];
  for (let i = 0; i < N / 2; i++) {
    frequencies.push(i * freqResolution);
    const mag = Math.sqrt(fftObj.real[i] ** 2 + fftObj.imag[i] ** 2);
    amplitudes.push(mag);
  }

  return { frequencies, amplitudes };
}

export function calculateCOP_Stats({ 
  calculationMode = "realTime",
  motionData,
  cutoffFrequency,
  samplingFrequency,
  sensorHeight_cm = 125,
  gravity = 9.81,
}: { 
  calculationMode?: "realTime" | "postProcessing";
  motionData: { noGravityFiltered: { y: number; z: number }; noGravity: { y: number; z: number } }[];
  cutoffFrequency: number;
  samplingFrequency: number;
  sensorHeight_cm?: number;
  gravity?: number;
}): ICOPStats { 
  function calculateCOP_Variance({
    copPoints
  }: {
    copPoints: ICOPPoint[];
  }): {
    varianceAP: number;
    varianceML: number;
    globalVariance: number;
    meanML: number;
    meanAP: number;
    covariance: number;
  } {
    const n = copPoints.length;
    if (n === 0) {
      return {
        varianceAP: 0,
        varianceML: 0,
        globalVariance: 0,
        meanML: 0,
        meanAP: 0,
        covariance: 0
      };
    }
  
    // Calcular la media para cada eje
    const meanML = copPoints.reduce((sum, p) => sum + p.ml, 0) / n;
    const meanAP = copPoints.reduce((sum, p) => sum + p.ap, 0) / n;
  
    // Calcular la varianza y la covarianza usando la señal recentrada
    const varianceML = copPoints.reduce((sum, p) => sum + (p.ml - meanML) ** 2, 0) / n;
    const varianceAP = copPoints.reduce((sum, p) => sum + (p.ap - meanAP) ** 2, 0) / n;
    const covariance = copPoints.reduce((sum, p) => sum + (p.ml - meanML) * (p.ap - meanAP), 0) / n;
  
    return {
      varianceML,
      varianceAP,
      globalVariance: varianceML + varianceAP,
      meanML,
      meanAP,
      covariance
    };
  }

  function calculateCOP_RMS({
    mlAccs,
    apAccs,
    sensorHeight
  }: {
    mlAccs?: number[];
    apAccs?: number[];
    sensorHeight: number;
  }): ICOPRMS {
    let resultML: number | null = null;
    let resultAP: number | null = null;
  
    if (mlAccs?.length) {
      const rmsAccelerationML = calculateRMS({values: mlAccs});
      // Desplazamiento del COP en cm usando el modelo del péndulo invertido
      resultML = (sensorHeight / gravity) * rmsAccelerationML * 100;
    }
  
    if (apAccs?.length) {
      const rmsAccelerationAP = calculateRMS({values: apAccs});
      resultAP = (sensorHeight / gravity) * rmsAccelerationAP * 100;
    }
  
    // Calcular la magnitud global si ambos valores están presentes
    const global = resultML !== null && resultAP !== null
      ? Math.sqrt(resultML ** 2 + resultAP ** 2)
      : null;
  
    return {
      ml: resultML,
      ap: resultAP,
      global
    };
  }

  function calculateCOP_Ellipse({
    varianceML,
    varianceAP,
    covariance
  }: {
    varianceML: number;
    varianceAP: number;
    covariance: number;
  }) {
    // Construir la matriz de covarianza (2x2):
    // | varianceML    covariance |
    // | covariance    varianceAP |
    const trace = varianceML + varianceAP;
    const determinant = varianceML * varianceAP - covariance * covariance;
    const discriminant = Math.sqrt(trace * trace - 4 * determinant);
  
    // Cálculo de los autovalores (valores propios)
    const eigenValue1 = (trace + discriminant) / 2; // Mayor (cm²)
    const eigenValue2 = (trace - discriminant) / 2; // Menor (cm²)
  
    // La orientación (ángulo) de la elipse se calcula con:
    const orientation = 0.5 * Math.atan2(2 * covariance, varianceML - varianceAP);
  
    // Valor crítico del chi-cuadrado para 2 grados de libertad al 95% de confianza
    const chiSquareVal = 5.991;
  
    // Longitudes de los semiejes (en cm)
    const semiMajor = Math.sqrt(eigenValue1 * chiSquareVal);
    const semiMinor = Math.sqrt(eigenValue2 * chiSquareVal);
  
    return { semiMajor, semiMinor, orientation };
  }

  function calculateCOP_OscillationArea({
    copPoints
  }: {
    copPoints: ICOPPoint[];
  }): { area: number; hull: { x: number; y: number }[] } {
    
    // Función para calcular la envolvente convexa (convex hull) utilizando el algoritmo de Andrew.
    function computeConvexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
      if (points.length <= 1) return points.slice();
  
      // Ordenar puntos por x (y como desempate)
      const sorted = points.slice().sort((a, b) =>
        a.x === b.x ? a.y - b.y : a.x - b.x
      );
  
      const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
        (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  
      const lower: { x: number; y: number }[] = [];
      for (const point of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
          lower.pop();
        }
        lower.push(point);
      }
  
      const upper: { x: number; y: number }[] = [];
      for (let i = sorted.length - 1; i >= 0; i--) {
        const point = sorted[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
          upper.pop();
        }
        upper.push(point);
      }
  
      // Quitar el último elemento de cada lista (se repite el primer punto)
      lower.pop();
      upper.pop();
      return lower.concat(upper);
    }
  
    // Función para calcular el área de un polígono usando la fórmula de shoelace.
    function computePolygonArea(polygon: { x: number; y: number }[]): number {
      let area = 0;
      const n = polygon.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y;
      }
      return Math.abs(area) / 2;
    }
  
    // Si no hay suficientes puntos para formar un polígono, se retorna área 0 y hull vacío.
    if (copPoints.length < 3) return { area: 0, hull: [] };
  
    // Convertir los copPoints (con propiedades ml y ap) al formato { x, y }.
    const convertedCOPPoints = copPoints.map(point => ({
      x: point.ml,
      y: point.ap
    }));
  
    // Calcular la envolvente convexa (convex hull)
    const hull = computeConvexHull(convertedCOPPoints);
  
    // Calcular el área del polígono formado por el convex hull.
    const area = computePolygonArea(hull);
  
    return { area, hull };
  }

  function calculateCOP_Jerk({
    accelerationY,
    accelerationZ,
    dt
  }: {
    accelerationY: number[];
    accelerationZ: number[];
    dt: number;
  }): { jerkY: number; jerkZ: number } {
    
    const jerkY: number[] = [];
    const jerkZ: number[] = [];
  
    // Calcular el jerk para el eje ML (Y)
    for (let i = 1; i < accelerationY.length; i++) {
      jerkY.push(((accelerationY[i] - accelerationY[i - 1]) / dt) * 100);
    }
  
    // Calcular el jerk para el eje AP (Z)
    for (let i = 1; i < accelerationZ.length; i++) {
      jerkZ.push(((accelerationZ[i] - accelerationZ[i - 1]) / dt) * 100);
    }
  
    return { 
      jerkY: calculateRMS({values: jerkY}), 
      jerkZ: calculateRMS({values: jerkZ}),
    };
  }

  const sensorHeight_m = sensorHeight_cm / 100; // Convertir de cm a m

  // Extraer los valores de desplazamiento del COP desde motionData
  let mlValues: number[] = [];
  let apValues: number[] = [];

  mlValues = calculationMode === "realTime" ? 
    motionData.map(record => ((record.noGravityFiltered.y) * (sensorHeight_m / 9.81)) * 100) : 
    butterworthLowPass_BlockGeneric({
      data: motionData.map(record => record.noGravity.y), 
      cutoffFrequency, 
      samplingFrequency,
      order: 4
    }).map(val => (val * (sensorHeight_m / 9.81)) * 100);

  apValues = calculationMode === "realTime" ? 
    motionData.map(record => ((record.noGravityFiltered.z) * (sensorHeight_m / 9.81)) * 100) : 
    butterworthLowPass_BlockGeneric({
      data: motionData.map(record => record.noGravity.z), 
      cutoffFrequency, 
      samplingFrequency, 
      order: 4
    }).map(val => (val * (sensorHeight_m / 9.81)) * 100);

  if (mlValues.length === 0 || apValues.length === 0) {
    throw new Error("No hay datos para calcular la estadística del COP.");
  }

  const copPoints: ICOPPoint[] = mlValues.map((ml, i) => ({
    ml,
    ap: apValues[i]
  }));

  const { varianceAP, varianceML, globalVariance, meanML, meanAP, covariance } = calculateCOP_Variance({ copPoints });

  const { ml: rmsML, ap: rmsAP } = calculateCOP_RMS({
    mlAccs: calculationMode === "realTime" ?
      motionData.map(record => record.noGravityFiltered.y) : 
      butterworthLowPass_BlockGeneric({
        data: motionData.map(record => record.noGravity.y), 
        cutoffFrequency, 
        samplingFrequency,
        order: 4
      }), 
    apAccs: calculationMode === "realTime" ?
      motionData.map(record => record.noGravityFiltered.z) : 
      butterworthLowPass_BlockGeneric({
        data: motionData.map(record => record.noGravity.z), 
        cutoffFrequency, 
        samplingFrequency,
        order: 4
      }), 
    sensorHeight: sensorHeight_m
  });

  let copArea: number | null = null;
  let copAreaPoints: {x: number, y:number}[] | null = null;
  let jerkML: number | null = null;
  let jerkAP: number | null = null;
  let semiMajor: number | null = null;
  let semiMinor: number | null = null;
  let orientation: number | null = null;

  if (calculationMode === "postProcessing") {
    const { area, hull } = calculateCOP_OscillationArea({ copPoints });
    copArea = area;
    copAreaPoints = hull;

    const { jerkY, jerkZ } = calculateCOP_Jerk({
      accelerationY: butterworthLowPass_BlockGeneric({
          data: motionData.map(record => record.noGravity.y),
          cutoffFrequency, 
          samplingFrequency,
          order: 4
        }),
      accelerationZ: butterworthLowPass_BlockGeneric({
          data: motionData.map(record => record.noGravity.z),
          cutoffFrequency, 
          samplingFrequency,
          order: 4
        }),
      dt: 1 / samplingFrequency
    });

    jerkML = jerkY;
    jerkAP = jerkZ;

    const ellipseResult = calculateCOP_Ellipse({
      varianceML,
      varianceAP,
      covariance
    });

    semiMajor = ellipseResult.semiMajor;
    semiMinor = ellipseResult.semiMinor;
    orientation = ellipseResult.orientation;
  }

  return {
    copPoints,
    rmsML: rmsML!,
    rmsAP: rmsAP!,
    varianceML, 
    varianceAP, 
    globalVariance,
    meanML, 
    meanAP,
    covariance,
    ellipse: {
      semiMajor: semiMajor ?? 0,
      semiMinor: semiMinor ?? 0,
      orientation: orientation ?? 0,
      centerX: meanML ?? 0,
      centerY: meanAP ?? 0,
    },
    copArea: {
      value: copArea,
      points: copAreaPoints ?? [],
    },
    jerkML, 
    jerkAP,
  };
}

