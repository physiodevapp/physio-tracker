"use client";
import { debounce } from '@/utils/video';
// CustomRangeSlider component

import React, { useState, useRef, useEffect } from 'react';

export interface RangeProps {
  start: number;
  end: number;
}

export interface TrimmerProps {
  range: RangeProps;
  markerPosition: number;
}

interface IndexProps {
  min: number;
  max: number;
  initialRange: RangeProps;
  minDistance?: number;
  onChange?: ({
    range, 
    markerPosition,
  }: TrimmerProps) => void;
}

const Index: React.FC<IndexProps> = ({
  min,
  max,
  initialRange,
  minDistance = 1,
  onChange,
}) => {
  const [range, setRange] = useState<RangeProps>(initialRange);
  const [isDragging, setIsDragging] = useState(false);
  const [draggingTarget, setDraggingTarget] = useState<'start' | 'end' | 'marker' | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const lastTouchPosition = useRef<number>(0);
  const [markerPosition, setMarkerPosition] = useState<number>(initialRange.start);
  const [isMarkerAttached, setIsMarkerAttached] = useState<null | 'start' | 'end'>(null);
  
  const thumbOffset = 10; // pixels
  const markerWidth = 0.25 * 16; // pixels

  const handleTouchStart = (target: 'start' | 'end' | 'marker', event: React.TouchEvent) => {
    setIsDragging(true);
    setDraggingTarget(target);
    lastTouchPosition.current = event.touches[0].clientX;

    if (target === 'start') {
      setIsMarkerAttached('start');
      setMarkerPosition(range.start);
    } else if (target === 'end') {
      setIsMarkerAttached('end');
      setMarkerPosition(range.end);
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
        const {start, end} = prev;
        const newStart = Math.min(Math.max(start + movement, min), end - minDistance);

        if (isMarkerAttached === 'start') {
          setMarkerPosition(newStart);
        }

        if (onChange) 
          onChange({
            range: {start: newStart, end}, 
            markerPosition: newStart
          });
        return {start: newStart, end};
      });
    } else if (draggingTarget === 'end') {
      setRange((prev) => {
        const {start, end} = prev;
        const newEnd = Math.max(Math.min(end + movement, max), start + minDistance);

        if (isMarkerAttached === 'end') {
          setMarkerPosition(newEnd);
        }

        if (onChange) 
          onChange({
            range: {start, end: newEnd}, 
            markerPosition: newEnd,
          });
        return {start, end: newEnd};
      });
    } else if (draggingTarget === 'marker') {
      setMarkerPosition((prev) => {
        const newMarkerPos = Math.max(range.start, Math.min(prev + movement, range.end));

        if (onChange) 
          onChange({
            range: {start: range.start, end: range.end}, 
            markerPosition: newMarkerPos,
          });
        return newMarkerPos;
      });
    }
  };

  const handleTouchUp = () => {
    setIsDragging(false);
    setDraggingTarget(null);
  };

  const handleMarkerTouchStart = debounce((e: React.TouchEvent<HTMLDivElement>) => {
    const sliderRect = sliderRef.current?.getBoundingClientRect();
    if (!sliderRect) return;

    const pixelRange = sliderRect.width;
    const ratio = (max - min) / pixelRange;
    const touchX = e.touches[0].clientX - sliderRect.left;
    const newMarkerPosition = min + touchX * ratio;

    if (newMarkerPosition >= range.start && newMarkerPosition <= range.end) {
      setMarkerPosition(newMarkerPosition);
      setIsDragging(true);
      setDraggingTarget('marker');

      if (onChange) 
        onChange({
          range: {start: range.start, end: range.end}, 
          markerPosition: newMarkerPosition,
        });
    }
  }, 100);

  const handleMarkerTouchMove = debounce((e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging || draggingTarget !== 'marker') return;

    const sliderRect = sliderRef.current?.getBoundingClientRect();
    if (!sliderRect) return;

    const pixelRange = sliderRect.width;
    const ratio = (max - min) / pixelRange;
    const touchX = e.touches[0].clientX - sliderRect.left;
    const newMarkerPosition = min + touchX * ratio;

    if (newMarkerPosition >= range.start && newMarkerPosition <= range.end) {
      setMarkerPosition(newMarkerPosition);

      if (onChange) 
        onChange({
          range: {start: range.start, end: range.end}, 
          markerPosition: newMarkerPosition,
        });
    }
  }, 0);

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
      setMarkerPosition(range.start);
    } else if (isMarkerAttached === 'end') {
      setMarkerPosition(range.end);
    }
  }, [range, isMarkerAttached]);

  return (
    <div className="relative w-full h-full" ref={sliderRef}>
      {/* Limite inferior */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-[10px] cursor-ew-resize z-20 rounded-l-xl pl-4 py-4 pr-4"
        style={{ 
          left: `calc(${((range.start - min) / (max - min)) * 100}% - ${thumbOffset + 16}px)`,
          width: `${thumbOffset}px`,
          height: "calc(100% + 30px)",
        }}
        onTouchStart={(e) => handleTouchStart('start', e)}>
          <div className="relative w-[10px] h-full bg-white rounded-l-xl"/>
      </div>
      {/* Area seleccionada */}
      <div
        className="absolute h-full bg-white/20 z-10"
        style={{
          left: `${((range.start - min) / (max - min)) * 100}%`,
          width: `${((range.end - range.start) / (max - min)) * 100}%`
        }}
        onTouchStart={handleMarkerTouchStart}
        onTouchMove={handleMarkerTouchMove} />
      {/* Limite superior */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-[10px] cursor-ew-resize z-20 rounded-r-xl pl-2 py-4 pr-6"
        style={{ 
          left: `calc(${((range.end - min) / (max - min)) * 100}% - 8px)`,
          width: `${thumbOffset}px`,
          height: "calc(100% + 30px)", 
        }}
        onTouchStart={(e) => handleTouchStart('end', e)}>
          <div className="relative w-[10px] h-full bg-white rounded-r-xl"/>
        </div>
      {/* Marcador */}
      <div
        className="absolute top-1/2 -translate-y-1/2 h-[120%] bg-white z-30 cursor-ew-resize rounded-full"
        style={{ 
          left: `calc(${((markerPosition - min) / (max - min)) * 100}% - ${markerWidth / 2}px)`, 
          width: `${markerWidth}px`,
        }} />
      {/* Momento actual */}
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
