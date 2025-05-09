import React, { useState, useRef, useEffect } from 'react';

interface IndexProps {
  min: number;
  max: number;
  initialRange: [number, number];
  minDistance?: number;
  onChange?: (range: [number, number]) => void;
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
  const [draggingTarget, setDraggingTarget] = useState<'start' | 'end' | 'range' | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const lastTouchPosition = useRef<number>(0);

  const handleTouchStart = (target: 'start' | 'end' | 'range', event: React.TouchEvent) => {
    setIsDragging(true);
    setDraggingTarget(target);
    lastTouchPosition.current = event.touches[0].clientX; // Guardamos la posición inicial
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging || !sliderRef.current) return;

    const sliderRect = sliderRef.current.getBoundingClientRect();
    const pixelRange = sliderRect.width;
    const ratio = (max - min) / pixelRange;

    // Calculamos el desplazamiento (diferencia con el último toque)
    const movement = (e.touches[0].clientX - lastTouchPosition.current) * ratio;
    lastTouchPosition.current = e.touches[0].clientX;

    setRange((prev) => {
      let [start, end] = prev;

      if (draggingTarget === 'start') {
        start = Math.min(Math.max(start + movement, min), end - minDistance);
      } else if (draggingTarget === 'end') {
        end = Math.max(Math.min(end + movement, max), start + minDistance);
      } else if (draggingTarget === 'range') {
        const rangeSize = end - start;
        start = Math.max(min, Math.min(start + movement, max - rangeSize));
        end = start + rangeSize;
      }

      if (onChange) onChange([start, end]);
      return [start, end];
    });
  };

  const handleTouchUp = () => {
    setIsDragging(false);
    setDraggingTarget(null);
  };

  useEffect(() => {
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchUp);

    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchUp);
    };
  }, [isDragging, draggingTarget]);

  return (
    <div className="relative w-full h-full" ref={sliderRef}>
      {/* Extremidad izquierda */}
      <div
        className="absolute w-[10px] h-full bg-white cursor-ew-resize z-20 rounded-l-xl rounded-r-none"
        style={{ left: `${((range[0] - min) / (max - min)) * 100}%` }}
        onTouchStart={(e) => handleTouchStart('start', e)} />

      {/* Track verde: ahora está entre los bordes blancos */}
      <div
        className="absolute h-full bg-[#4caf4f]/60 z-10 cursor-grab"
        style={{
          left: `calc(${((range[0] - min) / (max - min)) * 100}% + 10px)`,
          width: `calc(${((range[1] - range[0]) / (max - min)) * 100}% - 20px)`,
        }}
        onTouchStart={(e) => handleTouchStart('range', e)} />

      {/* Extremidad derecha */}
      <div
        className="absolute w-[10px] h-full bg-white cursor-ew-resize z-20 rounded-l-none rounded-r-xl"
        style={{ left: `calc(${((range[1] - min) / (max - min)) * 100}% - 10px)` }}
        onTouchStart={(e) => handleTouchStart('end', e)} />
    </div>
  );
};

export default Index;
