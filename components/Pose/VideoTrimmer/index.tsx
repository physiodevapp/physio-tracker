"use client";
// VideoTrimmer component

import { useEffect, useMemo, useRef, useState } from 'react';
import CustomRangeSlider, { RangeProps, TrimmerProps } from "./CustomRangeSlider";
import { debounce } from '@/utils/video';
import Image from 'next/image';

interface IndexProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onTrimChange?: ({
    range, 
    markerPosition,
  }: TrimmerProps) => void;
  onReady?: ({
    range, 
    markerPosition,
  }: TrimmerProps) => void;
}

const minDistance = 1; // segundos

const Index: React.FC<IndexProps> = ({ videoRef, onTrimChange, onReady }) => {
  const [duration, setDuration] = useState(0);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [range, setRange] = useState<RangeProps>({start: 0, end: minDistance});
  const [markerPosition, setMarkerPosition] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isReady, setIsReady] = useState(false);

  const lastThumbnailCount = useRef(0);
  const generateThumbnails = async (video: HTMLVideoElement, maxThumbs: number = 7) => {
    const thumbs: string[] = [];
    const canvas = canvasRef.current ?? document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 200;
    canvas.height = 100;

    const count = Math.min(maxThumbs, Math.floor(video.duration));
    const step = video.duration / count;

    const originalDisplay = '';
    video.pause();
    video.style.display = 'none';

    // 🚀 Limpiamos el array ANTES de generar las nuevas
    if (thumbnails.length !== count) {
      // console.log("Limpiando thumbnails...");
      setThumbnails([]);
      lastThumbnailCount.current = count;
    }

    for (let i = 0; i < count; i++) {
      const time = i * step;
      await new Promise<void>((resolve) => {
        video.currentTime = time;
        video.onseeked = () => {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumbs.push(canvas.toDataURL('image/jpeg'));
          resolve();
        };
      });
    }

    video.style.display = originalDisplay;
    setThumbnails(thumbs); // 🔴 Ahora sí, actualizamos el estado
    return thumbs;
  };

  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;

    const handleLoadedMetadata = async () => {
      setDuration(video.duration);
      setRange({start: 0, end: video.duration});
      setMarkerPosition(0);
      if (thumbnails.length === 0) {
        const thumbs = await generateThumbnails(video, 8);
        setThumbnails(thumbs);
      }
      setIsReady(true);
      onReady?.({
        range: {start: 0, end: video.duration},
        markerPosition: 0,
      });
    };

    if (video.readyState >= 1) {
      handleLoadedMetadata();
    } else {
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
    }
  }, [videoRef]);

  const handleTrimChange = debounce(({range: newRange, markerPosition: newMarkerPosition}: TrimmerProps) => {
    // 🔴 Evitar el bucle si los valores son iguales
    if (newRange.start !== range.start || 
      newRange.end !== range.end ||
      newMarkerPosition !== markerPosition
    ) {
      setRange({start: newRange.start, end: newRange.end});
      setMarkerPosition(newMarkerPosition);
      onTrimChange?.({
        range: {start: newRange.start, end: newRange.end},
        markerPosition: newMarkerPosition,
      });
    }
  }, 100);

  const memoizedThumbnails = useMemo(() => {
    return thumbnails.map((src, idx) => (
      <div
        key={idx}
        className={`relative aspect-[2/1]`}
        style={{ width: `${100 / thumbnails.length}%` }}
      >
        <Image
          src={src}
          alt={`Thumbnail ${idx}`}
          fill
          className={`object-cover`}
          sizes={`${100 / thumbnails.length}vw`}
          quality={80}
        />
      </div>
    ));
  }, [thumbnails]);

  if (!isReady) return null;

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="hidden" />
      <div 
        className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[0.7rem] border-2 border-dashed border-white bg-white/20'
        style={{
          width: "calc(100% + 26px)",
          height: "calc(100% + 6px)",
        }}/>
      <div
        className="relative w-full h-full"
        style={{ paddingLeft: '0px', paddingRight: '0px' }} >
        <div className="flex w-full h-full">
          {memoizedThumbnails}
        </div>
        {/* Slider superpuesto */}
        <div
          data-element="non-swipeable"
          className="absolute top-0 left-0 w-full h-full flex items-center"
          style={{ pointerEvents: 'none' }} >
          <div style={{ width: '100%', height: '100%',  pointerEvents: 'auto' }}>
            <CustomRangeSlider
              min={0}
              max={duration}
              initialRange={{start: 0, end:  duration}}
              minDistance={Number((duration * 0.2).toFixed(1))}
              onChange={handleTrimChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
