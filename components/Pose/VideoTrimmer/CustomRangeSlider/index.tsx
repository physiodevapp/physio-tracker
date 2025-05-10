"use client";
// CustomRangeSlider component

import React, { useState, useRef, useEffect } from 'react';

interface IndexProps {
  min: number;
  max: number;
  initialRange: [number, number];
  minDistance?: number;
  onChange?: (range: [number, number], markerPosition: number) => void;
}

const Index: React.FC<IndexProps> = ({
  min,
  max,
  initialRange,
  minDistance = 1,
  onChange,
}) => {
  const [range, setRange] = useState<[number, number]>(initialRange);
  const [isDragging, setIsDragging] = useState(false);
  const [draggingTarget, setDraggingTarget] = useState<'start' | 'end' | 'marker' | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const lastTouchPosition = useRef<number>(0);
  const [markerPosition, setMarkerPosition] = useState<number>(initialRange[0]);
  const [isMarkerAttached, setIsMarkerAttached] = useState<null | 'start' | 'end'>(null);
  
  const thumbOffset = 10; // pixels
  const markerWidth = 0.25 * 16; // pixels

  const handleTouchStart = (target: 'start' | 'end' | 'marker', event: React.TouchEvent) => {
    setIsDragging(true);
    setDraggingTarget(target);
    lastTouchPosition.current = event.touches[0].clientX;

    if (target === 'start') {
      setIsMarkerAttached('start');
      setMarkerPosition(range[0]);
    } else if (target === 'end') {
      setIsMarkerAttached('end');
      setMarkerPosition(range[1]);
    } else {
      setIsMarkerAttached(null);
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging || !sliderRef.current) return;

    const sliderRect = sliderRef.current.getBoundingClientRect();
    const pixelRange = sliderRect.width;
    const ratio = (max - min) / pixelRange;
    const movement = (e.touches[0].clientX - lastTouchPosition.current) * ratio;
    lastTouchPosition.current = e.touches[0].clientX;

    if (draggingTarget === 'start') {
      setRange((prev) => {
        const [start, end] = prev;
        const newStart = Math.min(Math.max(start + movement, min), end - minDistance);

        if (isMarkerAttached === 'start') {
          setMarkerPosition(newStart);
        }

        if (onChange) onChange([newStart, end], newStart);
        return [newStart, end];
      });
    } else if (draggingTarget === 'end') {
      setRange((prev) => {
        const [start, end] = prev;
        const newEnd = Math.max(Math.min(end + movement, max), start + minDistance);

        if (isMarkerAttached === 'end') {
          setMarkerPosition(newEnd);
        }

        if (onChange) onChange([start, newEnd], newEnd);
        return [start, newEnd];
      });
    } else if (draggingTarget === 'marker') {
      setMarkerPosition((prev) => {
        const newMarkerPos = Math.max(range[0], Math.min(prev + movement, range[1]));

        if (onChange) onChange([range[0], range[1]], newMarkerPos);
        return newMarkerPos;
      });
    }
  };

  const handleTouchUp = () => {
    setIsDragging(false);
    setDraggingTarget(null);
  };

  const handleMarkerTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const sliderRect = sliderRef.current?.getBoundingClientRect();
    if (!sliderRect) return;

    const pixelRange = sliderRect.width;
    const ratio = (max - min) / pixelRange;
    const touchX = e.touches[0].clientX - sliderRect.left;
    const newMarkerPosition = min + touchX * ratio;

    if (newMarkerPosition >= range[0] && newMarkerPosition <= range[1]) {
      setMarkerPosition(newMarkerPosition);
      setIsDragging(true);
      setDraggingTarget('marker');

      if (onChange) onChange([range[0], range[1]], newMarkerPosition);
    }
  };

  const handleMarkerTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging || draggingTarget !== 'marker') return;

    const sliderRect = sliderRef.current?.getBoundingClientRect();
    if (!sliderRect) return;

    const pixelRange = sliderRect.width;
    const ratio = (max - min) / pixelRange;
    const touchX = e.touches[0].clientX - sliderRect.left;
    const newMarkerPosition = min + touchX * ratio;

    if (newMarkerPosition >= range[0] && newMarkerPosition <= range[1]) {
      setMarkerPosition(newMarkerPosition);

      if (onChange) onChange([range[0], range[1]], newMarkerPosition);
    }
  };

  useEffect(() => {
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchUp);

    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchUp);
    };
  }, [isDragging, draggingTarget]);

  useEffect(() => {
    if (isMarkerAttached === 'start') {
      setMarkerPosition(range[0]);
    } else if (isMarkerAttached === 'end') {
      setMarkerPosition(range[1]);
    }
  }, [range, isMarkerAttached]);

  return (
    <div className="relative w-full h-full" ref={sliderRef}>
      <div
        className="absolute h-full bg-white cursor-ew-resize z-20 rounded-l-xl"
        style={{ 
          left: `calc(${((range[0] - min) / (max - min)) * 100}% - ${thumbOffset}px)`,
          width: `${thumbOffset}px`,
        }}
        onTouchStart={(e) => handleTouchStart('start', e)} />

      <div
        className="absolute h-full bg-white/20 z-10"
        style={{
          left: `${((range[0] - min) / (max - min)) * 100}%`,
          width: `${((range[1] - range[0]) / (max - min)) * 100}%`
        }}
        onTouchStart={handleMarkerTouchStart}
        onTouchMove={handleMarkerTouchMove}
      />

      <div
        className="absolute w-[10px] h-full bg-white cursor-ew-resize z-20 rounded-r-xl"
        style={{ 
          left: `${((range[1] - min) / (max - min)) * 100}%`,
          width: `${thumbOffset}px`, 
        }}
        onTouchStart={(e) => handleTouchStart('end', e)} />

      <div
        className="absolute top-1/2 -translate-y-1/2 h-[120%] bg-gray-300 z-30 cursor-ew-resize rounded-full"
        style={{ 
          left: `calc(${((markerPosition - min) / (max - min)) * 100}% - ${markerWidth / 2}px)`, 
          width: `${markerWidth}px`,
        }}
        onTouchStart={(e) => handleTouchStart('marker', e)} />

      <div
        className="absolute -top-11 left-[50%] transform -translate-x-1 bg-black/40 text-white text-sm px-2 py-1 rounded-md whitespace-nowrap"
        style={{
          left: `calc(${((markerPosition - min) / (max - min)) * 100}% - ${markerWidth / 2}px)`,
        }} >
        {markerPosition.toFixed(1)} s
      </div>
    </div>
  );
};

export default Index;
