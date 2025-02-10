interface DataPoint {
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
