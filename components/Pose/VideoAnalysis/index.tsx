"use client";
// VideoAnalysis component

import { useRef, useState, useEffect, forwardRef, useImperativeHandle, useCallback, useMemo, useReducer } from 'react';
import { createPortal } from 'react-dom';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs-core';
import { CanvasKeypointName, JointDataMap, Kinematics } from '@/interfaces/pose';
import { usePoseDetector } from '@/providers/PoseDetector';
import { OrthogonalReference, useSettings } from '@/providers/Settings';
import { excludedKeypoints, filterRepresentativeFrames, updateMultipleJoints, VideoFrame } from '@/utils/pose';
import { formatJointName, jointConfigMap } from '@/utils/joint';
import { drawKeypointConnections, drawKeypoints, getCanvasScaleFactor } from '@/utils/draw';
import { keypointPairs } from '@/utils/pose';
import PoseChart, { RecordedPositions } from '@/components/Pose/Graph';
import VideoTrimmer from '@/components/Pose/VideoTrimmer';
import { ArrowPathIcon, CloudArrowDownIcon, CubeTransparentIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon, PhotoIcon } from '@heroicons/react/24/solid';
import { TrimmerProps } from '../VideoTrimmer/CustomRangeSlider';

export type VideoAnalysisHandle = {
  handleVideoProcessing: () => void;
  isVideoLoaded: () => boolean;
  isVideoProcessed: () => boolean;  
  downloadJSON: () => void;
  removeVideo: () => void;
  handleNewVideo: () => void;
};

export type ProcessingStatus = 'idle' | 'processing' | 'cancelRequested' | 'cancelled' | 'processed' | 'durationExceeded';

interface IndexProps {
  handleMainMenu: (visibility?: boolean) => void;
  isMainMenuOpen: boolean;
  orthogonalReference: OrthogonalReference;
  anglesToDisplay: string[];
  setAnglesToDisplay: React.Dispatch<React.SetStateAction<string[]>>;
  isPoseSettingsModalOpen: boolean;
  setIsPoseSettingsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  jointWorkerRef: React.RefObject<Worker | null>;
  jointDataRef: React.RefObject<JointDataMap>;
  onPause: (value: boolean) => void;
  onWorkerInit?: () => void;
  onLoaded?: (value: boolean) => void;
  onStatusChange?: (status: ProcessingStatus) => void;
}

const Index = forwardRef<VideoAnalysisHandle, IndexProps>(({
  handleMainMenu, 
  isMainMenuOpen,
  orthogonalReference,
  anglesToDisplay,
  setAnglesToDisplay,
  isPoseSettingsModalOpen,
  setIsPoseSettingsModalOpen,
  jointWorkerRef,
  jointDataRef,
  onPause,
  onWorkerInit,
  onLoaded,
  onStatusChange,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputCanvasRef = useRef<HTMLCanvasElement>(null);

  const keypointRadiusBase = 8;

  const [zoomStatus, setZoomStatus] = useState<'in' | 'out'>('in');

  const currentFrameIndexRef = useRef(0);
  const frameResolveRef = useRef<(() => void) | null>(null);
  const totalStepsRef = useRef(0);
  const frameIntervalRef = useRef(60);

  const hasTriggeredRef = useRef(false);

  const [videoLoaded, setVideoLoaded] = useState(false);

  const [trimmerRange, setTrimmerRange] = useState<TrimmerProps>({range: {start: 0, end: 0}, markerPosition: 0});
  const trimmerRangeRef = useRef<TrimmerProps>(trimmerRange);
  const [trimmerReady, setTrimmerReady] = useState(false);

  const processingCancelledRef = useRef(false);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('idle');

  const [aspectRatio, setAspectRatio] = useState(1);

  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(isPlaying);
  const isPlayingUpdateRef = useRef(false);
  const [verticalLineValue, setVerticalLineValue] = useState(0);
  const hiddenLegendsRef = useRef<Set<number>>(new Set());
  const [, forceUpdateUI] = useReducer(x => x + 1, 0);

  const { 
    detector, 
    detectorModel, 
    minPoseScore, 
    isDetectorReady,
  } = usePoseDetector();
  const { settings } = useSettings();
  const { 
    selectedJoints, 
    angularHistorySize,
    pointsPerSecond, 
    minAngleDiff,
  } = settings.pose;
  const selectedJointsRef = useRef(selectedJoints);

  const maxDuration = 30; // segundos

  const [processingProgress, setProcessingProgress] = useState<number>(0);

  const allFramesDataRef = useRef<VideoFrame[]>([]);
  const nearestFrameRef = useRef<VideoFrame>(null);
  const [recordedPositions, setRecordedPositions] = useState<RecordedPositions>();

  const handleClickOnCanvas = () => { 
    if (isPoseSettingsModalOpen || isMainMenuOpen) {
      setIsPoseSettingsModalOpen(false);
  
      handleMainMenu(false);
    }
  }

  const handleVideoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && videoRef.current) { 
      const video = videoRef.current;
      video.src = URL.createObjectURL(file); 
  
      video.onloadedmetadata = () => {
        if (video.duration > maxDuration) {
          setProcessingStatus('durationExceeded');
          removeVideo();
        }
        else {
          setVideoLoaded(true);
          onLoaded?.(true);
        }
      };
  
      video.load();
    }
  }, [onLoaded]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputPortal = useMemo(() => createPortal(
    <input
      ref={fileInputRef}
      type="file"
      accept="video/*"
      onChange={handleVideoUpload}
      style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
    />,
    document.body
  ), [handleVideoUpload]);
  
  const [scaleFactor, setScaleFactor] = useState<number | null>(null);
  const scaleFactorRef = useRef(scaleFactor);

  const smartFrameInterval = (videoDuration: number, maxFrames: number = 300): number => {
    const idealInterval = videoDuration / maxFrames;
    return Math.max(idealInterval, 1 / 120); 
  }

  const resetProcessingState = useCallback(() => {
    processingCancelledRef.current = false;
  
    setProcessingStatus('idle');
    onStatusChange?.('idle');
  
    allFramesDataRef.current = [];
    setRecordedPositions(undefined);
  
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  
    setProcessingProgress(0);
  }, [onStatusChange]);  

  const handleSeekedFrame = async ({
    video,
    canvasRef,
    inputCanvasRef,
    detector,
    detectorModel,
    minPoseScore,
    i,
    steps,
    allFramesDataRef,
    setProcessingProgress,
  }: {
    video: HTMLVideoElement;
    canvasRef: React.RefObject<HTMLCanvasElement>;
    inputCanvasRef: React.RefObject<HTMLCanvasElement>;
    detector: poseDetection.PoseDetector;
    detectorModel: poseDetection.SupportedModels;
    minPoseScore: number;
    i: number;
    steps: number;
    allFramesDataRef: React.RefObject<VideoFrame[]>;
    setProcessingProgress: (p: number) => void;
  }) => {
    let poses: poseDetection.Pose[] = [];
  
    if (detectorModel === poseDetection.SupportedModels.BlazePose) {
      const inputCanvas = inputCanvasRef.current;
      if (!inputCanvas) return;
  
      const realWidth = video.videoWidth;
      const realHeight = video.videoHeight;
      const maxInputSize = 320;
      const scale = realWidth > realHeight
        ? maxInputSize / realWidth
        : maxInputSize / realHeight;
  
      inputCanvas.width = Math.round(realWidth * scale);
      inputCanvas.height = Math.round(realHeight * scale);
  
      const inputCtx = inputCanvas.getContext('2d');
      inputCtx?.drawImage(video, 0, 0, inputCanvas.width, inputCanvas.height);
  
      const inputTensor = tf.browser.fromPixels(inputCanvas);
      poses = await detector.estimatePoses(inputTensor);
      inputTensor.dispose();
  
      poses.forEach(pose => {
        pose.keypoints.forEach(kp => {
          kp.x /= scale;
          kp.y /= scale;
        });
      });
    } else {
      poses = await detector.estimatePoses(video, {
        maxPoses: 1,
        flipHorizontal: false,
      });
    }
  
    if (poses.length > 0 && canvasRef.current) {
      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = canvasRef.current.width;
      frameCanvas.height = canvasRef.current.height;
      const frameCtx = frameCanvas.getContext('2d')!;

      // Dibujamos directamente el video en el frame
      frameCtx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);

      const keypoints = poses[0].keypoints.filter(kp =>
        kp.score && 
        kp.score > minPoseScore &&
        !excludedKeypoints.includes(kp.name!)
      );
  
      allFramesDataRef.current.push({
        videoTime: video.currentTime,
        frameImage: frameCanvas,
        keypoints,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });
  
      setProcessingProgress(((i + 1) / steps) * 100);
    }
  };

  const handleSeeked = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !inputCanvasRef.current || !detector || !detectorModel) return;
  
    const i = currentFrameIndexRef.current;
    const video = videoRef.current;
  
    await handleSeekedFrame({
      video,
      canvasRef: canvasRef as React.RefObject<HTMLCanvasElement>,
      inputCanvasRef: inputCanvasRef as React.RefObject<HTMLCanvasElement>,
      detector,
      detectorModel,
      minPoseScore,
      i,
      steps: totalStepsRef.current,
      allFramesDataRef,
      setProcessingProgress,
    });
  
    frameResolveRef.current?.();
  }, [canvasRef, inputCanvasRef, detector, detectorModel, minPoseScore]);
  
  const processFrames = async () => {
    if (!videoRef.current || !canvasRef.current || !inputCanvasRef.current || !detector || !detectorModel) return;
  
    allFramesDataRef.current = [];
    setRecordedPositions(undefined);
  
    const video = videoRef.current;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
  
    const selectedDuration = trimmerRangeRef.current.range.end - trimmerRangeRef.current.range.start;
    const desiredPoints = Math.floor(selectedDuration * pointsPerSecond);
    const frameInterval = smartFrameInterval(selectedDuration, desiredPoints);

    frameIntervalRef.current = frameInterval;

    const startFrame = Math.floor(trimmerRangeRef.current.range.start / frameInterval);
    const endFrame = Math.floor(trimmerRangeRef.current.range.end / frameInterval);
    
    const steps = endFrame - startFrame;
    totalStepsRef.current = steps;
  
    video.onseeked = handleSeeked;
  
    for (let i = 0; i < steps; i++) {
      if (processingCancelledRef.current) return;
  
      currentFrameIndexRef.current = i;
  
      await new Promise<void>((resolve) => {
        frameResolveRef.current = resolve;
        video.currentTime = i * frameInterval;
      });
  
      if (i < steps - 1) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, Math.max(30, frameInterval * 1000))
        );
      }
    }
  }; 

  const analyzeAllFrames = async () => {  
    if (!jointWorkerRef.current) {
      console.warn("⚠️ jointWorkerRef is null. Joint analysis aborted.");
      return;
    }
  
    for (const [index, frame] of allFramesDataRef.current.entries()) {
      if (processingCancelledRef.current) {
        // console.warn('🛑 Joint analysis aborted by user.');
        return;
      }
    
      try {
        const updatedData = await updateMultipleJoints({
          keypoints: frame.keypoints,
          selectedJoints,
          jointDataRef,
          jointConfigMap,
          jointWorker: jointWorkerRef.current,
          orthogonalReference,
          formatJointName: (jointName) => jointName,
          jointAngleHistorySize: angularHistorySize,
          mode: "video",
        });
  
        frame.jointData = structuredClone(updatedData);
  
      } catch (err) {
        console.error(`❌ Error analyzing frame ${index + 1}:`, err);
      }
    }
  };
  
  const handleVideoProcessing = async () => {
    processingCancelledRef.current = false;    
    setProcessingStatus('processing');
    onStatusChange?.("processing")
    setProcessingProgress(0);

    currentFrameIndexRef.current = 0;

    await processFrames();  // Primero captura frames + keypoints
    
    if (processingCancelledRef.current) {
      console.warn('🛑 Análisis abortado por el usuario.');
      resetProcessingState();
      return;
    }
    
    await analyzeAllFrames(); // Luego calcula ángulos

    if (processingCancelledRef.current) {
      console.warn('🛑 Análisis abortado por el usuario.');
      resetProcessingState();
      return;
    }

    const framesWithJointData = allFramesDataRef.current.filter(
      (frame): frame is VideoFrame =>
        !!frame.jointData &&
        Object.values(frame.jointData).some(joint => typeof joint.angle === "number")
    );       
    const reducedFrames = filterRepresentativeFrames(framesWithJointData, minAngleDiff); // umbral de grados
    //  console.log("🟢 Frames representativos:", reducedFrames.length, "de", allFramesDataRef.current.length);

    if (reducedFrames.length >= 80) { // mínimo de 80 puntos en el gráfico
      allFramesDataRef.current = reducedFrames;
    }

    const transformed = transformToRecordedPositions(reducedFrames);
    setRecordedPositions(transformed);

    setProcessingStatus("processed");
    onStatusChange?.("processed");
    setProcessingProgress(0);

    const firstFrame = allFramesDataRef.current[0];
    if (canvasRef.current && firstFrame) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.drawImage(firstFrame.frameImage, 0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      nearestFrameRef.current = firstFrame;
      currentFrameIndexRef.current = 0;
      setVerticalLineValue(firstFrame.videoTime * 1_000);

      isPlayingRef.current = false;
      setIsPlaying(false);
      onPause?.(true);
    }
  };

  const removeVideo = () => {
    allFramesDataRef.current = [];
    setRecordedPositions(undefined);

    isPlayingRef.current = true;
    setIsPlaying(true);
    onPause?.(false);

    if (processingStatus === "processed") {
      setProcessingStatus("idle");
      onStatusChange?.("idle");
    }
    else if (videoLoaded) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
  
      setTrimmerReady(false);
      setVideoLoaded(false);
      onLoaded?.(false);
    }
  }
  
  const downloadJSON = () => {
    const dataStr = JSON.stringify(allFramesDataRef.current, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
  
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pose-data.json';
    link.click();
    
    URL.revokeObjectURL(url);
  }; 

  const transformToRecordedPositions = (frames: VideoFrame[]
  ): RecordedPositions => {
    const recordedPositions: RecordedPositions = {};
    
    frames.forEach((frame) => {
      const { videoTime, jointData } = frame;
  
      if (jointData) {
        Object.entries(jointData).forEach(([jointName, { angle, color }]) => {
          if (!recordedPositions[jointName as CanvasKeypointName]) {
            recordedPositions[jointName as CanvasKeypointName] = [];
          }
          
          recordedPositions[jointName as CanvasKeypointName]?.push({
            timestamp: videoTime * 1_000,
            angle,
            color,
          });
        });
      }
    });
  
    return recordedPositions;
  };

  const findNearestFrame = (frames: VideoFrame[], targetTime: number): VideoFrame => {
    return frames.reduce((prev, curr) => 
      Math.abs(curr.videoTime - targetTime) < Math.abs(prev.videoTime - targetTime)
        ? curr
        : prev
    );
  }  

  const handleVerticalLineChange = useCallback(async (newValue: {
    x: number;
    values: { label: string; y: number }[];
  }) => {
    if (isPlayingUpdateRef.current) return;

    if (isPlayingRef.current) {
      // 🔴 Detener animación
      isPlayingRef.current = false;
      setIsPlaying(false);
      onPause?.(true);
    }
  
    if (processingStatus !== "processed") return;
  
    const nearestFrame = findNearestFrame(allFramesDataRef.current, newValue.x);
    nearestFrameRef.current = nearestFrame;

    updateDisplayedAngles(nearestFrame, selectedJointsRef.current);
  
    if (!isPlayingUpdateRef.current) {
      const index = allFramesDataRef.current.findIndex(f => f === nearestFrame);
      if (index !== -1) currentFrameIndexRef.current = index;
    } else {
      isPlayingUpdateRef.current = false;
    }
  
    // 🖼 Redibuja frame seleccionado
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && nearestFrame) {
      ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
      ctx.drawImage(nearestFrame.frameImage, 0, 0, canvasRef.current!.width,canvasRef.current!.height);
  
      if (nearestFrame.keypoints) {
        drawKeypoints({
          ctx,
          keypoints: nearestFrame.keypoints,
          mirror: false,
          pointRadius: keypointRadiusBase * (scaleFactorRef.current ?? 1),
        });
  
        drawKeypointConnections({
          ctx,
          keypoints: nearestFrame.keypoints,
          keypointPairs,
          mirror: false,
          lineWidth: 2 * (scaleFactorRef.current ?? 1),
        });
      }
    }
  }, [processingStatus]);     

  const handleNewVideo = () => {
    fileInputRef.current?.click();
  };

  const nextTick = () => new Promise(resolve => setTimeout(resolve, 0));

  const playFrames = useCallback(async () => {
    if (!allFramesDataRef.current.length) return;
  
    isPlayingRef.current = true;
    setIsPlaying(true);
    onPause?.(false);
  
    for (
      let i = currentFrameIndexRef.current;
      i < allFramesDataRef.current.length;
      i++
    ) {
      const frame = allFramesDataRef.current[i];
      nearestFrameRef.current = frame;

      updateDisplayedAngles(frame, selectedJointsRef.current);
  
      if (!isPlayingRef.current) {
        currentFrameIndexRef.current = i;
  
        // Redibuja el frame en pausa
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
          ctx.drawImage(frame.frameImage, 0, 0, canvasRef.current!.width, canvasRef.current!.height);
  
          if (frame.keypoints) {
            drawKeypoints({
              ctx,
              keypoints: frame.keypoints,
              mirror: false,
              pointRadius: keypointRadiusBase * (scaleFactorRef.current ?? 1),
            });
  
            drawKeypointConnections({
              ctx,
              keypoints: frame.keypoints,
              keypointPairs,
              mirror: false,
              lineWidth: 2 * (scaleFactorRef.current ?? 1),
            });
          }
        }
  
        isPlayingRef.current = false;
        setIsPlaying(false);
        onPause?.(true);

        return;
      }
  
      // Bloquea handleVerticalLineChange mientras cambia verticalLineValue
      isPlayingUpdateRef.current = true;
      currentFrameIndexRef.current = i;
      setVerticalLineValue(frame.videoTime * 1000);
      await nextTick();
      isPlayingUpdateRef.current = false;
  
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
        ctx.drawImage(frame.frameImage, 0, 0, canvasRef.current!.width, canvasRef.current!.height);
      }
  
      await new Promise(resolve =>
        setTimeout(resolve, frameIntervalRef.current * 1000)
      );
    }
  
    currentFrameIndexRef.current = 0;
    
    isPlayingRef.current = false;
    setIsPlaying(false);
    onPause?.(true);
  }, []);

  const updateDisplayedAngles = (frame: VideoFrame, selectedJoints: CanvasKeypointName[]) => {
    const newAngles: string[] = [];
  
    selectedJoints.forEach((jointName) => {
      const updatedData = frame.jointData?.[jointName];
      const label = formatJointName(jointName);
  
      if (updatedData) {
        jointDataRef.current[jointName] = updatedData;
        const angle = `${label}: ${updatedData.angle.toFixed(0)}º`;
        newAngles.push(angle);
      } else {
        newAngles.push(`${label}: -`);
      }
    });
  
    setAnglesToDisplay((prev) => {
      const hasChanged =
        prev.length !== newAngles.length ||
        prev.some((val, i) => val !== newAngles[i]);
  
      return hasChanged ? newAngles : prev;
    });
  };     

  useEffect(() => {
    const updateScale = () => {
      if (!canvasRef.current || !videoRef.current) return;
  
      const scale = getCanvasScaleFactor({
        canvas: canvasRef.current,
        sourceDimensions: {
          width: videoRef.current.videoWidth,
          height: videoRef.current.videoHeight,
        },
      }) ?? 1;
  
      if (!scaleFactor) {
        setScaleFactor(scale);
        scaleFactorRef.current = scale;
      }
    };
  
    updateScale();
  }, [videoRef.current?.videoWidth, videoRef.current?.videoHeight]);
  
  useEffect(() => {
    if (videoLoaded && videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;

      const aspectRatio = video.videoWidth / video.videoHeight;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      setAspectRatio(aspectRatio);

      video.addEventListener('loadedmetadata', () => {
        canvasRef.current!.width = video.videoWidth;
        canvasRef.current!.height = video.videoHeight;
      });
    }
  }, [videoLoaded]);  

  useEffect(() => {
      if (!isDetectorReady) {
        setIsPoseSettingsModalOpen(false);
      }
    }, [isDetectorReady]);

  useEffect(() => {
    if (!hasTriggeredRef.current) {
      hasTriggeredRef.current = true;

      onWorkerInit?.();
      
      handleNewVideo();
    }
  }, []);

  useImperativeHandle(ref, () => ({
    handleVideoProcessing,
    isVideoLoaded: () => videoLoaded,
    isVideoProcessed: () => processingStatus === "processed",
    downloadJSON,
    removeVideo,
    handleNewVideo,
  }));

  useEffect(() => {
    selectedJointsRef.current = selectedJoints;

    if (nearestFrameRef.current) {
      updateDisplayedAngles(nearestFrameRef.current, selectedJointsRef.current);
    }
  }, [selectedJoints]);


  useEffect(() => {
    const {range: {start, end}, markerPosition} = trimmerRange;
    if (start !== trimmerRangeRef.current.range.start || 
        end !== trimmerRangeRef.current.range.end ||
        markerPosition !== trimmerRangeRef.current.markerPosition
    ) {
      trimmerRangeRef.current = {range: {start, end}, markerPosition};

      if (videoRef.current) {
        videoRef.current.currentTime = markerPosition;
      }
    }
  }, [trimmerRange]);

  return (
    <>
      {fileInputPortal}

      {(!isDetectorReady || !detector) && (
        <div className="fixed w-full h-dvh z-50 text-white bg-black/80 flex flex-col items-center justify-center gap-4">
          <p>
            {!detector 
              ? "Setting up Tensorflow..."
              : !isDetectorReady 
              ? "Setting up the model..."
              : ""}
          </p>
          {!detector 
            ? <CloudArrowDownIcon className="w-8 h-8 animate-bounce"/>
            : <ArrowPathIcon className="w-8 h-8 animate-spin"/>}
        </div>
      )}

      {(videoLoaded && !trimmerReady) && (
        <div className="fixed w-full h-dvh z-50 text-white bg-black/80 flex flex-col items-center justify-center gap-4">
          <p>Loading video...</p>
          <ArrowPathIcon className="w-8 h-8 animate-spin"/>
        </div>
      )}

      <div 
        {...(videoLoaded && { "data-element": "non-swipeable" })}
        onClick={handleClickOnCanvas}
        className='relative w-full h-dvh flex flex-col'>

        {!videoLoaded && (
          <div 
            data-element="non-swipeable"
            onClick={handleNewVideo}
            className='absolute z-40 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center'>
            <PhotoIcon className='w-16 aspect-square text-white animate-bounce'/>
            <p className='text-white font-bold'>Pick a video!</p>
          </div>
        )}

        <div className="relative flex-1 w-full bg-black flex justify-center items-center" >
          {videoLoaded && processingStatus === "idle" && (
            <div className={`absolute left-0 bottom-2 w-[84%] h-20 z-10 pl-6 py-3`}
            style={{
              background: `linear-gradient(to left, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.6) 80%)`
            }}>
              <VideoTrimmer
                videoRef={videoRef}
                onTrimChange={({range, markerPosition}) => { 
                  if (range.start !== trimmerRange.range.start || 
                    range.end !== trimmerRange.range.end || 
                    markerPosition !== trimmerRange.markerPosition
                  ) {
                    setTrimmerRange({
                      range: {start: range.start, end: range.end},
                      markerPosition,
                    });                    
                  }
                }}
                onReady={({range, markerPosition}) => {
                  if (videoLoaded && !trimmerReady) {
                    setTrimmerReady(true);
                  }
                  if (range.start !== trimmerRange.range.start || 
                    range.end !== trimmerRange.range.end || 
                    markerPosition !== trimmerRange.markerPosition
                  ) {
                    setTrimmerRange({
                      range: {start: range.start, end: range.end},
                      markerPosition,
                    });
                  }
                }}
              />
            </div>
          )}
          <video         
            ref={videoRef} 
            className={
              !videoLoaded || ['processing', 'cancelRequested', 'processed'].includes(processingStatus)
                ? 'hidden'
                : 'w-full h-dvh object-cover'
            } 
            muted />
          <canvas ref={inputCanvasRef} className="hidden" />
          <canvas
            ref={canvasRef}
            onClick={() => {
              if (processingStatus !== "processed") return;
              
              if (isPlaying) {
                isPlayingRef.current = false;
                setIsPlaying(false);
                onPause?.(true);
              }
              else {
                playFrames();
              }
            }}
            className="h-full"
            style={{
              display: processingStatus === "processed" ? 'block' : 'none',
              aspectRatio,
              maxHeight: '50dvh',
              objectFit: 'contain', // Opcional: para que el contenido no se deforme
            }} />
          
          {processingStatus === "processed" && hiddenLegendsRef.current.size < selectedJoints.length ? (
            <section 
              className="absolute z-10 bottom-2 left-0 font-bold w-40 p-2"
              style={{
                background: `linear-gradient(to left, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.6) 80%)`
              }}> 
              {
                anglesToDisplay
                  .filter((_, index) => !hiddenLegendsRef.current.has(index))
                  .map((angle, index) => (
                    <p key={index} className="text-white">{angle}</p>
                  ))
              }
            </section> 
          ) : null }

          {processingStatus === "processed" && zoomStatus === "in" ? (
            <MagnifyingGlassPlusIcon 
              onClick={() => {
                const canvas = canvasRef.current;
                if (!canvas) return;

                const scaleX = window.innerWidth / canvas.getBoundingClientRect().width;
                canvas.style.transform = `scale(${scaleX})`;

                setZoomStatus('out');
              }}  
              className='absolute right-0 bottom-0 pr-2 pb-2 w-10 h-10 text-white'/> 
          ) : null }
          {processingStatus === "processed" && zoomStatus === "out" ? (
            <MagnifyingGlassMinusIcon 
              onClick={() => {
                const canvas = canvasRef.current;
                if (!canvas) return;

                canvas.style.transform = `scale(${1})`;

                setZoomStatus('in');
              }}  
              className='absolute right-0 bottom-0 pr-2 pb-2 w-10 h-10 text-white'/>
          ) : null }          

        </div>

        {processingStatus === "processed" && recordedPositions ? (
          <PoseChart
            joints={selectedJoints}
            valueTypes={[Kinematics.ANGLE]} // Solo queremos ángulos
            recordedPositions={recordedPositions} // Tus datos
            onVerticalLineChange={handleVerticalLineChange}
            verticalLineValue={verticalLineValue}
            parentStyles="z-10 flex-1 w-full max-w-5xl mx-auto" // Opcional
            hiddenLegendsRef={hiddenLegendsRef}
            onToggleLegend={(index, hidden) => {
              if (!hiddenLegendsRef.current) {
                hiddenLegendsRef.current = new Set();
              }
            
              if (hidden) {
                hiddenLegendsRef.current.add(index);
              } else {
                hiddenLegendsRef.current.delete(index);
              }   

              forceUpdateUI();
            }} />
        ) : null }
      </div>

      {processingStatus === 'processing' || processingStatus === "cancelRequested" ? (
        <div 
          data-element="non-swipeable"
          className="fixed top-1/2 -translate-y-1/2 w-full max-w-5xl mx-auto text-center px-12 flex flex-col items-center gap-8" >
          <div className="h-40 bg-[url('/processing-video.png')] bg-center bg-contain bg-no-repeat aspect-[1/1] animate-pulse"></div>
          <CubeTransparentIcon className='w-8 h-8 animate-spin'/>
          <div className="w-full">
            <div className="text-sm text-gray-400 mb-4">
              Processing video... {processingProgress.toFixed(0)}%
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-[#5dadec] h-2 rounded-full transition-all duration-300"
                style={{ width: `${processingProgress}%` }}
              ></div>
            </div>
          </div>
          <button 
            className="bg-black/0 border-white/40 hover:border-white border-2 text-white font-light rounded-lg px-4 py-2"
            onClick={() => setProcessingStatus('cancelRequested')} >
              Cancel Analysis
          </button> 
        </div>
      ) : null }

      {processingStatus === 'cancelRequested' ? (
        <div 
          data-element="non-swipeable"
          className="absolute top-0 h-dvh w-full z-50 flex items-center justify-center bg-black/60"
          onClick={() => setProcessingStatus('processing')}
          >
          <div className="dark:bg-gray-800 rounded-lg px-12 py-6 flex flex-col gap-2">
            <p className="text-xl">Are you sure?</p>
            <button 
              className="bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg p-2"
              onClick={() => {
                processingCancelledRef.current = true;
                setProcessingStatus('cancelled');
                setProcessingProgress(0);
              }} >
                Cancel now
              </button>
          </div>
        </div>
      ) : null }

      {processingStatus === 'durationExceeded' ? (
        <div 
          data-element="non-swipeable"
          className="absolute top-0 h-dvh w-full z-50 flex items-center justify-center bg-black/60"
          onClick={() => setProcessingStatus('idle')}
          >
          <div className="dark:bg-gray-800 rounded-lg px-12 py-6 flex flex-col gap-2">
            <p className="text-xl">{`Max. ${maxDuration} seconds`}</p>
            <button 
              className="bg-[#5dadec] hover:bg-gray-600 text-white font-bold rounded-lg p-2"
              onClick={() => setProcessingStatus('idle')} >
                Got it!
              </button>
          </div>
        </div>
      ) : null }
    </>
  );
}); 

Index.displayName = 'VideoAnalysis';

export default Index;

// IMPORTANTE:
// No centralizar esta lógica:
//
// isPlayingRef.current = true;
// setIsPlaying(true);
// onPause?.(false);
//
// ... en un useEffect del tipo:
// useEffect(() => {
//   isPlayingRef.current = isPlaying;
//   onPause?.(!isPlaying);
// }, [isPlaying])
//
// Esa solución reactiva es asíncrona y se ejecuta *después* del render,
// por lo que `isPlayingRef.current` no se actualiza a tiempo al llamar a `playFrames()`,
// provocando que el bucle de reproducción se interrumpa inmediatamente.
//
// En su lugar, usamos esta secuencia directa y síncrona para garantizar
// que el ref y el estado estén sincronizados en el mismo ciclo:
// - actualizamos `isPlayingRef.current`
// - actualizamos el estado con `setIsPlaying`
// - notificamos con `onPause(...)` si es necesario

