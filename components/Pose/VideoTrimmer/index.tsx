"use client";
// VideoTrimmer component

import { useEffect, useRef, useState } from 'react';
import CustomRangeSlider from "./CustomRangeSlider";
import { debounce } from '@/utils/video';
import Image from 'next/image';

interface IndexProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onTrimChange?: (start: number, end: number) => void;
  onReady?: (start: number, end: number) => void;
}

const minDistance = 1; // segundos

const Index: React.FC<IndexProps> = ({ videoRef, onTrimChange, onReady }) => {
  const [duration, setDuration] = useState(0);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [range, setRange] = useState<[number, number]>([0, minDistance]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isReady, setIsReady] = useState(false);

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
    return thumbs;
  };

  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;

    const handleLoadedMetadata = async () => {
      setDuration(video.duration);
      setRange([0, video.duration]);
      const thumbs = await generateThumbnails(video, 8);
      setThumbnails(thumbs);
      setIsReady(true);
      onReady?.(0, video.duration);
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

  const handleTrimChange = debounce((newRange: [number, number]) => {
    // 🔴 Evitar el bucle si los valores son iguales
    if (newRange[0] !== range[0] || newRange[1] !== range[1]) {
      setRange(newRange);
      onTrimChange?.(newRange[0], newRange[1]);
    }
  }, 100);

  if (!isReady) return null;

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="hidden" />

      <div
        className="relative w-full h-full"
        style={{ paddingLeft: '0px', paddingRight: '0px' }} >
        <div className="flex w-full h-full">
          {thumbnails.map((src, idx) => (
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
          ))}
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
              initialRange={[0, duration]}
              minDistance={2}
              onChange={(range, markerPosition) => {
                // console.log(markerPosition);
                // console.log(range);
                handleTrimChange(range);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
