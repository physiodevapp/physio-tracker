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

export function detectOutlierEdgesByFlatZones(
  data: { x: number; y: number }[],
  flatThreshold: number = 0.01,       // Cuánto puede oscilar la señal sin considerarse movimiento
  minFlatPoints: number = 20           // Cuántos puntos consecutivos se necesitan para declarar "zona plana"
): { startOutlierIndex: number | null; endOutlierIndex: number | null } {
  const ys = data.map(p => p.y);

  let startOutlierIndex: number | null = null;
  let endOutlierIndex: number | null = null;

  // 🔍 Buscar zona plana al inicio
  for (let i = 0; i < data.length - minFlatPoints; i++) {
    const slice = ys.slice(i, i + minFlatPoints);
    const maxDev = Math.max(...slice) - Math.min(...slice);
    if (maxDev < flatThreshold) {
      startOutlierIndex = i + minFlatPoints;
      break;
    }
  }

  // 🔍 Buscar zona plana al final
  for (let i = data.length - minFlatPoints; i >= 0; i--) {
    const slice = ys.slice(i, i + minFlatPoints);
    const maxDev = Math.max(...slice) - Math.min(...slice);
    if (maxDev < flatThreshold) {
      endOutlierIndex = i;
      break;
    }
  }

  return { startOutlierIndex, endOutlierIndex };
}

export function adjustCyclesByZeroCrossing(
  inputData: DataPoint[],
  baseline = 0,
  cycles: Cycle[],
  cyclesToAverage = 3,
  trimLimits?: { start: number; end: number } | null,
  minCycleAmplitude  = 0.05, // kg
  minCycleDuration = 100, // ms
): { baselineCrossSegments: BaselineCrossSegment[]; adjustedCycles: Cycle[] } {
  const data = inputData;
  let baselineCrossSegments: BaselineCrossSegment[] = [];
  const zeroCrossings: number[] = [];
  const workLoad = cycles[0]?.workLoad ?? null;

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

  // ⚠️ Si no hay valleys pero hay un solo segmento válido, forzamos creación de ciclo
  if (valleys.length === 0 && baselineCrossSegments.length === 1 && adjustedCycles.length === 0) {
    const seg = baselineCrossSegments[0];
    const segment = data.filter(p => p.x >= seg.startX && p.x <= seg.endX);
    if (segment.length > 0) {
      const maxY = Math.max(...segment.map(p => p.y));
      const minY = Math.min(...segment.map(p => p.y));
      const duration = seg.endX - seg.startX;
      const amplitude = maxY - minY;
      const speedRatio = (amplitude / (duration / 1_000)) / (workLoad ?? 1);

      const candidateCycle: Cycle = {
        startX: seg.startX,
        endX: seg.endX,
        peakY: maxY,
        peakX: segment.find(p => p.y === maxY)?.x ?? seg.endX,
        amplitude,
        duration,
        relativeSpeedRatio: null,
        speedRatio,
        workLoad: workLoad ?? null,
        minX: segment.find(p => p.y === minY)?.x ?? seg.startX,
        minY,
      };

      adjustedCycles.push(candidateCycle);
    }
  }

  if (trimLimits && adjustedCycles.length > 0) {
    const first = adjustedCycles[0];
    const firstSegment = baselineCrossSegments.find(seg => seg.startX >= trimLimits.start);

    if (firstSegment && first.endX! > trimLimits.start) {
      const proposedStartX = firstSegment.isValley ? firstSegment.peakX : trimLimits.start;
      // console.log('proposedStartX ', proposedStartX)
      // console.log('first.startX! ', first.startX!)
      first.startX = proposedStartX;

      const segment = inputData.filter(p => p.x >= first.startX! && p.x <= first.endX!);
      if (segment.length > 0) {
        first.duration = first.endX! - first.startX;
        first.amplitude = Math.max(...segment.map(p => p.y)) - Math.min(...segment.map(p => p.y));
        first.peakY = Math.max(...segment.map(p => p.y));
        first.peakX = segment.find(p => p.y === first.peakY)?.x ?? first.startX;
        first.minY = Math.min(...segment.map(p => p.y));
        first.minX = segment.find(p => p.y === first.minY)?.x ?? first.startX;
        first.speedRatio = (first.amplitude / (first.duration / 1000)) / (first.workLoad ?? 1);
      }
    }

    const last = adjustedCycles[adjustedCycles.length - 1];
    const lastSegment = [...baselineCrossSegments]
      .reverse()
      .find(seg => seg.endX <= trimLimits.end);
    
    if (lastSegment && last.startX! < trimLimits.end) {
      const proposedEndX = lastSegment.isValley ? lastSegment.peakX : trimLimits.end;
      // console.log('proposedEndX ', proposedEndX)
      // console.log('last.endX! ', last.endX!)
      last.endX = proposedEndX;

      const segment = inputData.filter(p => p.x >= last.startX! && p.x <= last.endX!);
      if (segment.length > 0) {
        last.duration = last.endX - last.startX!;
        last.amplitude = Math.max(...segment.map(p => p.y)) - Math.min(...segment.map(p => p.y));
        last.peakY = Math.max(...segment.map(p => p.y));
        last.peakX = segment.find(p => p.y === last.peakY)?.x ?? last.endX;
        last.minY = Math.min(...segment.map(p => p.y));
        last.minX = segment.find(p => p.y === last.minY)?.x ?? last.endX;
        last.speedRatio = (last.amplitude / (last.duration / 1000)) / (last.workLoad ?? 1);
      }
    }
  }

  adjustedCycles = adjustedCycles.filter(cycle => {
    const duration = cycle.endX! - cycle.startX!;
    return cycle.amplitude! > minCycleAmplitude && duration > minCycleDuration;
  });

  adjustedCycles = addRelativeSpeedToCycles(adjustedCycles, cyclesToAverage);

  // console.log('baselineCrossSegments ', baselineCrossSegments)
  // console.log('adjustedCycles ', adjustedCycles)
  
  return { baselineCrossSegments, adjustedCycles };
}
