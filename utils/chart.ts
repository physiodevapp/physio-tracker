import {Chart as ChartJS} from 'chart.js';

export interface DataPoint {
  x: number;
  y: number;
}

export function lttbDownsample(data: DataPoint[], threshold: number): DataPoint[] {
  const dataLength = data.length;
  if (threshold >= dataLength || threshold === 0) {
    return data;
  }
  
  const sampled: DataPoint[] = [];
  // Siempre incluimos el primer punto
  sampled.push(data[0]);

  // Calculamos el tamaño de cada bucket (excluyendo el primer y el último punto)
  const bucketSize = (dataLength - 2) / (threshold - 2);
  let a = 0; // Índice del punto previamente seleccionado

  for (let i = 0; i < threshold - 2; i++) {
    // Calculamos los límites del bucket y nos aseguramos de no exceder dataLength
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, dataLength);

    // Calculamos el promedio (avgX, avgY) del bucket siguiente
    let avgX = 0, avgY = 0;
    const avgRangeLength = bucketEnd - bucketStart;
    if (avgRangeLength > 0) {
      for (let j = bucketStart; j < bucketEnd; j++) {
        avgX += data[j].x;
        avgY += data[j].y;
      }
      avgX /= avgRangeLength;
      avgY /= avgRangeLength;
    } else {
      // Si el bucket está vacío, usamos el primer elemento del bucket
      avgX = data[bucketStart].x;
      avgY = data[bucketStart].y;
    }
    
    // Definimos el rango del bucket actual
    const rangeStart = Math.floor(i * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, dataLength);

    // Buscamos el punto en el bucket actual que forme el triángulo con mayor área
    let maxArea = -1;
    let nextA = rangeStart;
    let chosenPoint: DataPoint = data[rangeStart];

    for (let j = rangeStart; j < rangeEnd; j++) {
      const area = Math.abs(
        (data[a].x - data[j].x) * (avgY - data[a].y) -
        (data[a].x - avgX) * (data[j].y - data[a].y)
      ) / 2;
      
      if (area > maxArea) {
        maxArea = area;
        nextA = j;
        chosenPoint = data[j];
      }
    }
    
    sampled.push(chosenPoint);
    a = nextA;
  }
  
  // Finalmente, incluimos el último punto
  sampled.push(data[dataLength - 1]);
  
  return sampled;
}

/**
 * Función auxiliar para interpolar el canal alfa entre startAlpha y endAlpha según el ratio (0 a 1).
 * Se asume que el color base (RGB) es constante.
 */
export function getInterpolatedColor(
  ratio: number,
  startAlpha: number,
  endAlpha: number,
  r: number,
  g: number,
  b: number
): string {
  const alpha = startAlpha + (endAlpha - startAlpha) * ratio;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export function getMaxYValue(chart: ChartJS) {
  let maxY = 0;

  chart.data.datasets.forEach((dataset) => {
    dataset.data.forEach((point) => {
      if(point) {
        if (typeof point === 'number') {
          // Si el punto es un número directo (raro, pero posible)
          if (point > maxY) maxY = point;
        } else if (Array.isArray(point)) {
          // Si el punto es un array [x, y]
          if (point[1] > maxY) maxY = point[1];
        } else if ('y' in point) {
          // Si el punto es un objeto con propiedad `y`
          if (point.y > maxY) maxY = point.y;
        }
      }
    });        
  });

  return maxY;
};
