interface DataPoint {
  x: number;
  y: number;
}

export interface Cycle { 
  startX: number | null;
  endX: number | null;
  peakX: number | null;
  peakY: number | null;
  duration: number | null; 
  amplitude: number | null;
  relativeSpeedRatio: number | null;
  speedRatio: number | null;
  workLoad: number | null; 
  minX?: number;
  minY?: number;
}

interface BaselineCrossSegment {
  startX: number;
  endX: number;
  peakX: number;
  peakY: number;
  isValley: boolean;
}

function addRelativeSpeedToCycles(
  cycles: Cycle[],
  cyclesToAverage: number = 3
): Cycle[] {
  const baseVelocities = cycles
    .slice(1, cyclesToAverage)
    .map(cycle =>
      (cycle.amplitude! / (cycle.duration! / 1000)) / (cycle.workLoad ?? 1)
    )
    .filter(v => !isNaN(v) && isFinite(v));

  const baseSpeed =
    baseVelocities.length > 0
      ? baseVelocities.reduce((sum, v) => sum + v, 0) / baseVelocities.length
      : 1;

  return cycles.map(cycle => ({
    ...cycle,
    relativeSpeedRatio: baseSpeed > 0 ? cycle.speedRatio! / baseSpeed : 1
  }));
}

function findBestStableRegion(
  data: DataPoint[],
  fromIndex: number,
  direction: 'backward' | 'forward',
  baseline: number,
  maxWindowSize = 30,
  threshold = 0.01
): DataPoint | null {
  let bestPoint: DataPoint | null = null;

  for (let windowSize = 5; windowSize <= maxWindowSize; windowSize += 5) {
    const point = detectStableSlopeRegion(data, fromIndex, direction, threshold, windowSize);
    
    if (point && ((direction === 'backward' && point.y < baseline) || direction === 'forward')) {
      bestPoint = point;
    }
  }

  return bestPoint;
}

function detectStableSlopeRegion(
  data: DataPoint[],
  fromIndex: number,
  direction: 'backward' | 'forward',
  threshold = 0.01,
  windowSize = 5
): DataPoint | null {
  const checkRange = (index: number) => {
    const segment: number[] = [];
    for (let i = 0; i < windowSize; i++) {
      const a = data[index + i - 1];
      const b = data[index + i];
      if (!a || !b) return false;
      segment.push(Math.abs(b.y - a.y));
    }
    return segment.every(dy => dy < threshold);
  };

  if (direction === 'backward') {
    for (let i = fromIndex; i >= windowSize; i--) {
      if (checkRange(i - windowSize)) {
        return data[i - windowSize];
      }
    }
  } else {
    for (let i = fromIndex; i < data.length - windowSize; i++) {
      if (checkRange(i)) {
        return data[i + windowSize];
      }
    }
  }

  return null;
}

function getSafeExtendedStartX(
  data: DataPoint[],
  currentPeakX: number,
  previousEndX: number | null,
  dyThreshold = 0.01,
  maxLookback = 100
): number {
  const startIndex = data.findIndex(p => p.x === currentPeakX);
  if (startIndex <= 0) return currentPeakX;

  for (let j = startIndex; j >= 1; j--) {
    const prev = data[j - 1];
    const curr = data[j];
    const dy = Math.abs(curr.y - prev.y);

    const isPastMaxLookback = Math.abs(currentPeakX - curr.x) > maxLookback;
    const isBeforePreviousCycle = previousEndX !== null && curr.x < previousEndX;

    if (dy < dyThreshold && !isPastMaxLookback && !isBeforePreviousCycle) {
      return curr.x;
    }
  }

  return currentPeakX;
}

function getSafeExtendedEndX(
  data: DataPoint[],
  currentPeakX: number,
  nextStartX: number | null,
  dyThreshold = 0.01,
  maxLookahead = 100
): number {
  const startIndex = data.findIndex(p => p.x === currentPeakX);
  if (startIndex < 0 || startIndex >= data.length - 1) return currentPeakX;

  for (let j = startIndex; j < data.length - 1; j++) {
    const curr = data[j];
    const next = data[j + 1];
    const dy = Math.abs(next.y - curr.y);

    const isPastMaxLookahead = Math.abs(next.x - currentPeakX) > maxLookahead;
    const isAfterNextCycle = nextStartX !== null && next.x > nextStartX;

    if (dy < dyThreshold && !isPastMaxLookahead && !isAfterNextCycle) {
      return next.x;
    }
  }

  return currentPeakX;
}

function mergeConsecutiveSameValleyStatus(segments: BaselineCrossSegment[]): BaselineCrossSegment[] {
  if (!segments.length) return [];

  const merged: BaselineCrossSegment[] = [];
  let current = { ...segments[0] };

  for (let i = 1; i < segments.length; i++) {
    const next = segments[i];
    if (current.isValley === next.isValley) {
      current = {
        startX: Math.min(current.startX, next.startX),
        endX: Math.max(current.endX, next.endX),
        peakX: Math.abs(current.peakY) > Math.abs(next.peakY) ? current.peakX : next.peakX,
        peakY: Math.abs(current.peakY) > Math.abs(next.peakY) ? current.peakY : next.peakY,
        isValley: current.isValley
      };
    } else {
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);
  return merged;
}

export function detectOutlierEdges(
  data: { x: number, y: number }[],
  threshold: number = 0.06,
  minStablePoints: number = 5,
  instabilityCheckWindow: number = 10
): { startOutlierIndex: number | null; endOutlierIndex: number | null } {
  const ys = data.map(p => p.y);
  const mean = ys.reduce((sum, y) => sum + y, 0) / ys.length;
  const deviations = ys.map(y => Math.abs(y - mean));

  let startOutlierIndex: number | null = null;
  let endOutlierIndex: number | null = null;

  // Buscar desde el inicio
  for (let i = 0; i < data.length - minStablePoints; i++) {
    const stable = deviations.slice(i, i + minStablePoints).every(dev => dev < threshold);

    if (stable) {
      // Validar que no haya inestabilidad fuerte justo antes (como hiciste con el final)
      const instabilitySlice = deviations.slice(i + minStablePoints, i + minStablePoints + instabilityCheckWindow);
      const hasInstability = instabilitySlice.some(dev => dev > threshold * 2);

      if (!hasInstability) {
        startOutlierIndex = i;
        break;
      }
    }
  }

  // Buscar desde el final
  for (let i = data.length - minStablePoints; i >= 0; i--) {
    const stable = deviations.slice(i, i + minStablePoints).every(dev => dev < threshold);

    if (stable) {
      const instabilitySlice = deviations.slice(i - instabilityCheckWindow, i);
      const hasInstability = instabilitySlice.some(dev => dev > threshold * 2);

      if (!hasInstability) {
        endOutlierIndex = i + minStablePoints - 1;
        break;
      }
    }
  }

  return { startOutlierIndex, endOutlierIndex };
}

export function adjustCyclesByZeroCrossing(
  inputData: DataPoint[],
  baseline = 0,
  cycles: Cycle[],
  cyclesToAverage = 3,
): { baselineCrossSegments: BaselineCrossSegment[]; adjustedCycles: Cycle[] } {
  const data = inputData;
  let baselineCrossSegments: BaselineCrossSegment[] = [];
  const zeroCrossings: number[] = [];
  const workLoad = cycles[0].workLoad ?? null;

  // Find zero-crossings (sign changes relative to baseline)
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];

    if ((prev.y < baseline && curr.y >= baseline) || (prev.y > baseline && curr.y <= baseline)) {
      const t = (baseline - prev.y) / (curr.y - prev.y);
      const crossX = prev.x + t * (curr.x - prev.x);
      zeroCrossings.push(crossX);
    }
  }

  // Find peak or valley between each pair of zero-crossings
  for (let i = 0; i < zeroCrossings.length - 1; i++) {
    const startX = zeroCrossings[i];
    const endX = zeroCrossings[i + 1];
    
    const segment = data.filter(p => p.x >= startX && p.x <= endX);
    
    if (segment.length === 0) continue;
    
    let peakPoint = segment[0];
    
    for (const point of segment) {
      const absDeviation = Math.abs(point.y - baseline);
      if (absDeviation > Math.abs(peakPoint.y - baseline)) {
        peakPoint = point;
      }
    }
    
    // ------ Filter out short segments ------
    if (Math.abs(endX - startX) < 100) continue; // valor en ms
    if (Math.abs(peakPoint.y - baseline) < 0.06) continue; // valor en kg

    baselineCrossSegments.push({
      startX,
      endX,
      peakX: peakPoint.x,
      peakY: peakPoint.y,
      isValley: peakPoint.y < baseline
    });
    // 🔄 Limpiar segmentos repetidos por tipo
    baselineCrossSegments = mergeConsecutiveSameValleyStatus(baselineCrossSegments);
  }

  // Group cycles from valley to valley with optional first/last peak exception
  let adjustedCycles: Cycle[] = [];
  const valleys = baselineCrossSegments.filter(c => c.isValley);

  // Extend to the beginning
  if (valleys.length > 0) {
    const firstValley = valleys[0];
    const extraLeftSegment = data.filter(p => p.x < firstValley.peakX);
    if (extraLeftSegment.length > 0) {
      const minX = Math.min(...extraLeftSegment.map(p => p.x));

      const fromIndex = data.findIndex(p => p.y === Math.max(...extraLeftSegment.map(p => p.y)));
      const bestStableStart = findBestStableRegion(data, fromIndex, 'backward', baseline);
      const fallbackStartX = baselineCrossSegments[0]?.startX ?? minX;
      const actualStartX = bestStableStart?.x ?? fallbackStartX;

      const nextStartX = valleys[1]?.peakX ?? null;
      const safeEndX = getSafeExtendedEndX(data, firstValley.peakX, nextStartX);

      const cycleSegment = data.filter(p => p.x >= actualStartX && p.x <= firstValley.peakX);
      const maxY = Math.max(...cycleSegment.map(p => p.y));
      const minY = Math.min(...cycleSegment.map(p => p.y));
      const duration = firstValley.peakX - actualStartX;
      const amplitude = maxY - minY;
      const speedRatio = (amplitude / (duration / 1_000)) / (workLoad ?? 1);

      adjustedCycles.push({
        startX: actualStartX,
        endX: safeEndX,
        peakY: maxY,
        peakX: cycleSegment.find(p => p.y === maxY)!.x,
        amplitude,
        duration,
        relativeSpeedRatio: null,
        speedRatio,
        workLoad: workLoad ?? null,
        minX: cycleSegment.find(p => p.y === minY)!.x,
        minY,
      });
    }
  }

  // Normal valley-to-valley cycles
  for (let i = 0; i < valleys.length - 1; i++) {
    const start = valleys[i];
    const end = valleys[i + 1];

    // Optionally extend a bit left and right for start and end if gradient changes drastically
    const previousCycleEndX = adjustedCycles[adjustedCycles.length - 1]?.endX ?? null;
    const extendedStartX = getSafeExtendedStartX(data, start.peakX, previousCycleEndX);
    const nextCycleStartX = valleys[i + 2]?.peakX ?? null;
    const extendedEndX = getSafeExtendedEndX(data, end.peakX, nextCycleStartX);

    const extendedSegment = data.filter(p => p.x >= extendedStartX && p.x <= extendedEndX);
    const maxY = Math.max(...extendedSegment.map(p => p.y));
    const minY = Math.min(start.peakY, end.peakY);
    const duration = extendedEndX - extendedStartX;
    const amplitude = maxY - minY;
    const speedRatio = (amplitude / (duration / 1_000)) / (workLoad ?? 1);

    adjustedCycles.push({
      startX: extendedStartX, // start.peakX,
      endX: extendedEndX, // end.peakX,
      peakY: maxY,
      peakX: data.find(p => p.y === maxY)!.x,
      amplitude,
      duration,
      relativeSpeedRatio: null,
      speedRatio,
      workLoad: workLoad ?? null,
      minX: data.find(p => p.y === minY)!.x,
      minY,
    });
  }

  // Extend to the end
  if (valleys.length > 0) {
    const lastValley = valleys[valleys.length - 1];
    const extraRightSegment = data.filter(p => p.x > lastValley.peakX);

    if (extraRightSegment.length > 0) {
      const maxX = Math.max(...extraRightSegment.map(p => p.x));
      const fromIndex = data.findIndex(p => p.y === Math.max(...extraRightSegment.map(p => p.y)));

      const bestStableEnd = findBestStableRegion(data, fromIndex, 'forward', baseline); // <- aquí usamos la mejora
      const fallbackStartX = baselineCrossSegments[baselineCrossSegments.length - 1]?.endX ?? maxX;
      const actualEndX = bestStableEnd && bestStableEnd.y < baseline ? bestStableEnd.x : fallbackStartX;

      const cycleSegment = data.filter(p => p.x >= lastValley.peakX && p.x <= actualEndX);
      const maxY = Math.max(...cycleSegment.map(p => p.y));
      const minY = Math.min(...cycleSegment.map(p => p.y));
      const duration = actualEndX - lastValley.peakX;
      const amplitude = maxY - minY;
      const speedRatio = (amplitude / (duration / 1_000)) / (workLoad ?? 1);

      const previousEndX = adjustedCycles.at(-1)?.endX ?? null;
      const safeStartX = getSafeExtendedStartX(data, lastValley.peakX, previousEndX);

      adjustedCycles.push({
        startX: safeStartX,
        endX: actualEndX,
        peakY: maxY,
        peakX: cycleSegment.find(p => p.y === maxY)!.x,
        amplitude,
        duration,
        relativeSpeedRatio: null,
        speedRatio,
        workLoad: workLoad ?? null,
        minX: cycleSegment.find(p => p.y === minY)!.x,
        minY,
      });
    }
  }

  adjustedCycles = addRelativeSpeedToCycles(adjustedCycles, cyclesToAverage);

  return { baselineCrossSegments, adjustedCycles };
}
