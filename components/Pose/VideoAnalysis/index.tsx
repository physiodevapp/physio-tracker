"use client";
// VideoAnalysis component

import { useRef, useState, useEffect, forwardRef, useImperativeHandle, useCallback, useMemo, useReducer } from 'react';
import { createPortal } from 'react-dom';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs-core';
import { CanvasKeypointName, JointDataMap, JumpEvents, JumpEventType, Kinematics } from '@/interfaces/pose';
import { usePoseDetector } from '@/providers/PoseDetector';
import { OrthogonalReference, useSettings } from '@/providers/Settings';
import { excludedDrawableKeypoints, excludedKeypoints, filterRepresentativeFrames, updateMultipleJoints, VideoFrame } from '@/utils/pose';
import { formatJointName, jointConfigMap } from '@/utils/joint';
import { drawKeypointConnections, drawKeypoints, getCanvasScaleFactor } from '@/utils/draw';
import { keypointPairs } from '@/utils/pose';
import PoseChart, { RecordedPositions } from '@/components/Pose/Graph';
import VideoTrimmer from '@/components/Pose/VideoTrimmer';
import { TrimmerProps } from '../VideoTrimmer/CustomRangeSlider';
import { ArrowPathIcon, CloudArrowDownIcon, CubeTransparentIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon, PhotoIcon } from '@heroicons/react/24/solid';
import { ArrowUturnDownIcon, DocumentIcon, EyeIcon, EyeSlashIcon, ViewfinderCircleIcon } from '@heroicons/react/24/outline';
import { motion } from "framer-motion";
import PoseJumpDataModal from "@/modals/PoseJumpData";
import PoseJumpEventModal from "@/modals/PoseJumpEvent";

export type VideoAnalysisHandle = {
  handleVideoProcessing: () => Promise<void>;
  isVideoLoaded: () => boolean;
  isVideoProcessed: () => boolean;  
  downloadJSON: () => void;
  removeVideo: () => void;
  handleNewVideo: () => void;
  handleFrames: (mode: "detect" | "dismiss") => void;
  playFrames: () => Promise<void>;
  pauseFrames: () => void;
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
  initialUrl: string | null;
  onJumpsDetected?: (jumps: JumpEvents | null) => void;
  isPoseJumpSettingsModalOpen: boolean;
  setIsPoseJumpSettingsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onCleanView?: (value: boolean) => void;
  showPoseOrientationModal: boolean;
  setShowPoseOrientationModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const Index = forwardRef<VideoAnalysisHandle, IndexProps>(({
  handleMainMenu, 
  isMainMenuOpen,
  orthogonalReference,
  anglesToDisplay,
  setAnglesToDisplay,
  setIsPoseSettingsModalOpen,
  jointWorkerRef,
  jointDataRef,
  onPause,
  onWorkerInit,
  onLoaded,
  onStatusChange,
  initialUrl,
  onJumpsDetected,
  isPoseJumpSettingsModalOpen,
  setIsPoseJumpSettingsModalOpen,
  onCleanView,
  showPoseOrientationModal,
  setShowPoseOrientationModal,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputCanvasRef = useRef<HTMLCanvasElement>(null);

  const [isCleanView, setIsCleanView] = useState(false);

  const [isPoseJumpDataModalOpen, setIsPoseJumpDataModalOpen] = useState(false);
  const [isPoseJumpEventModalOpen, setIsPoseJumpEventModalOpen] = useState(true);
  const defaultJumpEvents = {
    groundContact:   { videoTime: null, hipAngle: null, kneeAngle: null },
    impulse:         { videoTime: null, hipAngle: null, kneeAngle: null },
    takeoff:         { videoTime: null, hipAngle: null, kneeAngle: null },
    landing:         { videoTime: null, hipAngle: null, kneeAngle: null },
    cushion:         { videoTime: null, hipAngle: null, kneeAngle: null },
  }
  const [jumpEvents, setJumpEvents] = useState<JumpEvents>(defaultJumpEvents);
  const jumpEventsRef = useRef<JumpEvents | null>(jumpEvents);

  const keypointRadiusBase = 8; // revisar

  const [zoomStatus, setZoomStatus] = useState<'in' | 'out'>('in');

  const currentFrameIndexRef = useRef(0);
  const frameResolveRef = useRef<(() => void) | null>(null);
  const totalStepsRef = useRef(0);
  const frameIntervalRef = useRef(60);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const hasTriggeredRef = useRef(false);

  const [videoLoaded, setVideoLoaded] = useState(false);

  const [trimmerRange, setTrimmerRange] = useState<TrimmerProps>({range: {start: 0, end: 0}, markerPosition: 0});
  const trimmerRangeRef = useRef<TrimmerProps>(trimmerRange);
  const [trimmerReady, setTrimmerReady] = useState(false);

  const processingCancelledRef = useRef(false);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('idle');

  const [aspectRatio, setAspectRatio] = useState(1);

  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [verticalLineValue, setVerticalLineValue] = useState(0);
  const hiddenLegendsRef = useRef<Set<number>>(new Set());
  const [, forceUpdateUI] = useReducer(x => x + 1, 0);

  const isVerticalLineUpdatedByUser = useRef(false);

  const { 
    detector, 
    detectorModel, 
    minPoseScore, 
    isDetectorReady,
  } = usePoseDetector();
  const { 
    settings,
  } = useSettings();
  const { 
    selectedJoints, 
    angularHistorySize,
    pointsPerSecond, 
    minAngleDiff,
    poseOrientation,
  } = settings.pose;
  const selectedJointsRef = useRef(selectedJoints);

  const maxDuration = 30; // segundos máximos del video

  const [processingProgress, setProcessingProgress] = useState<number>(0);

  const allFramesDataRef = useRef<VideoFrame[]>([]);
  const nearestFrameRef = useRef<VideoFrame>(null);
  const [recordedPositions, setRecordedPositions] = useState<RecordedPositions>();
  
  const handleClickOnCanvas = () => { 
    if (isPoseJumpDataModalOpen) setIsPoseJumpDataModalOpen(false);
    if (isMainMenuOpen) handleMainMenu(false);
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
        videoTime: video.currentTime - trimmerRangeRef.current.range.start,
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
    if (
      !videoRef.current ||
      !canvasRef.current ||
      !inputCanvasRef.current ||
      !detector ||
      !detectorModel
    )
      return;

    allFramesDataRef.current = [];
    setRecordedPositions(undefined);

    const video = videoRef.current;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const { start, end } = trimmerRangeRef.current.range;
    const selectedDuration = end - start;

    const desiredPoints = Math.floor(selectedDuration * pointsPerSecond);
    const frameInterval = smartFrameInterval(selectedDuration, desiredPoints);
    frameIntervalRef.current = frameInterval;

    const totalFrames = Math.floor(selectedDuration / frameInterval);
    totalStepsRef.current = totalFrames;

    const frameTimes = Array.from({ length: totalFrames }, (_, i) => start + i * frameInterval);

    video.onseeked = handleSeeked;

    for (let i = 0; i < frameTimes.length; i++) {
      if (processingCancelledRef.current) return;

      currentFrameIndexRef.current = i;

      await new Promise<void>((resolve) => {
        frameResolveRef.current = resolve;
        video.currentTime = frameTimes[i];
      });

      if (i < frameTimes.length - 1) {
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
  
    // console.log('allFramesDataRef ', allFramesDataRef.current)
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
          poseOrientation,
        });
  
        frame.jointData = structuredClone(updatedData);
  
      } catch (err) {
        console.error(`❌ Error analyzing frame ${index + 1}:`, err);
      }
    }
  };

  const handleFrames = (mode: "idle" | "detect" | "dismiss" = "detect") => {
    if (isPoseJumpSettingsModalOpen) {
      setIsPoseJumpSettingsModalOpen(false);
    }

    if (mode === "dismiss") {
      onJumpsDetected?.(null);

      return;
    }

    const framesWithJointData = allFramesDataRef.current.filter(
      (frame): frame is VideoFrame =>
        !!frame.jointData &&
        Object.values(frame.jointData).some(joint => typeof joint.angle === "number")
    );
    // console.log('framesWithJointData ', framesWithJointData)

    function tryReduceFrames(frames: VideoFrame[], threshold: number, minRequired: number = 80): VideoFrame[] {
      const reduced = filterRepresentativeFrames(frames, threshold);
      return reduced.length >= minRequired ? reduced : frames;
    }

    // Lógica de visualización adaptativa
    const framesToDisplay = tryReduceFrames(framesWithJointData, minAngleDiff, 80);

    const transformed = transformToRecordedPositions(framesToDisplay);
    setRecordedPositions(transformed);
  }
  
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

    // console.log(allFramesDataRef.current)
    await waitWithCancel(2_000);

    handleFrames("idle");

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

      pauseFrames();
    }
  };

  const removeVideo = () => {
    // console.log('removeVideo')
    setIsPoseJumpSettingsModalOpen(false);
    jumpEventsRef.current = defaultJumpEvents;
    setJumpEvents(defaultJumpEvents);

    allFramesDataRef.current = [];
    setRecordedPositions(undefined);
    setTrimmerRange({range: {start: 0, end: 0}, markerPosition: 0});

    isPlayingRef.current = false;
    setIsPlaying(false);
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
    const nearestFrame = findNearestFrame(allFramesDataRef.current, newValue.x);
    nearestFrameRef.current = nearestFrame;
    const index = allFramesDataRef.current.findIndex(f => f === nearestFrame);
    if (index !== -1) currentFrameIndexRef.current = index;
    
    updateDisplayedAngles(nearestFrame, selectedJointsRef.current);
  
    // Redibuja frame seleccionado
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && nearestFrame) {
      ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
      ctx.drawImage(nearestFrame.frameImage, 0, 0, canvasRef.current!.width,canvasRef.current!.height);
  
      if (nearestFrame.keypoints) {
        const drawableKeypoints = nearestFrame.keypoints.filter(kp => !excludedDrawableKeypoints.includes(kp.name!));   

        drawKeypoints({
          ctx,
          keypoints: drawableKeypoints,
          mirror: false,
          pointRadius: keypointRadiusBase * (scaleFactorRef.current ?? 1),
        });
  
        drawKeypointConnections({
          ctx,
          keypoints: drawableKeypoints,
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
  
  const pauseFrames = () => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    onPause?.(true);

    cancelWait();
  }
  
  const playFrames = useCallback(async () => {
    if (!allFramesDataRef.current.length) return;
  
    isVerticalLineUpdatedByUser.current = false;

    isPlayingRef.current = true;
    setIsPlaying(true);
    onPause?.(false);
  
    for (
      let i = currentFrameIndexRef.current;
      i < allFramesDataRef.current.length;
      i++
    ) {
      if (
        isVerticalLineUpdatedByUser.current &&
        !isPlayingRef.current
      ) {
        isVerticalLineUpdatedByUser.current = false;
        return;
      }

      const frame = allFramesDataRef.current[i];
      nearestFrameRef.current = frame;
      currentFrameIndexRef.current = i;

      setVerticalLineValue(frame.videoTime * 1_000);
      updateDisplayedAngles(frame, selectedJointsRef.current);
  
      // Redibuja el frame en pausa
      if (!isPlayingRef.current) {  
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
          ctx.drawImage(frame.frameImage, 0, 0, canvasRef.current!.width, canvasRef.current!.height);
          
          if (frame.keypoints) {
            const drawableKeypoints = frame.keypoints.filter(kp => !excludedDrawableKeypoints.includes(kp.name!));   
            
            drawKeypoints({
              ctx,
              keypoints: drawableKeypoints,
              mirror: false,
              pointRadius: keypointRadiusBase * (scaleFactorRef.current ?? 1),
            });
  
            drawKeypointConnections({
              ctx,
              keypoints: drawableKeypoints,
              keypointPairs,
              mirror: false,
              lineWidth: 2 * (scaleFactorRef.current ?? 1),
            });
          }
        }

        return;
      }
  
      // Dibuja el frame en movimiento
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
        ctx.drawImage(frame.frameImage, 0, 0, canvasRef.current!.width, canvasRef.current!.height);
      }
  
      await waitWithCancel(frameIntervalRef.current * 1_000);
    }
  
    // Al terminar de recorrer el video:
    currentFrameIndexRef.current = 0;    
    pauseFrames();
  }, []);

  const waitWithCancel = (ms: number) => {
    return new Promise<void>((resolve) => {
      timeoutRef.current = setTimeout(() => {
        resolve();
      }, ms);
    });
  };

  const cancelWait = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const updateDisplayedAngles = (frame: VideoFrame, selectedJoints: CanvasKeypointName[]) => {
    const jointAngles: Record<string, { L?: string; R?: string }> = {};

    selectedJoints.forEach((jointName) => {
      const updatedData = frame.jointData?.[jointName];
      const label = formatJointName(jointName); // Ej. "R Elbow"

      const match = label.match(/^(R|L) (.+)$/);
      if (match) {
        const [, side, baseName] = match;

        if (!jointAngles[baseName]) jointAngles[baseName] = {};

        if (updatedData) {
          jointDataRef.current[jointName] = updatedData;
          jointAngles[baseName][side as 'L' | 'R'] = `${updatedData.angle.toFixed(0)}º`;
        }
      } else {
        // No tiene lado (e.g., "Head")
        jointAngles[label] = {
          L: updatedData ? `${updatedData.angle.toFixed(0)}º` : "-",
        };
      }
    });

    const newAngles: string[] = [];

    Object.entries(jointAngles).forEach(([baseName, { L, R }]) => {
      if (L && R) {
        newAngles.push(`${baseName}: ${L} / ${R}`);
      } else if (L) {
        newAngles.push(`L ${baseName}: ${L}`);
      } else if (R) {
        newAngles.push(`R ${baseName}: ${R}`);
      } else {
        newAngles.push(`${baseName}: -`);
      }
    });

    setAnglesToDisplay((prev) => {
      const hasChanged =
        prev.length !== newAngles.length ||
        prev.some((val, i) => val !== newAngles[i]);

      return hasChanged ? newAngles : prev;
    });

  }; 
  
  const zoomFullWidth = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scaleX = window.innerWidth / canvas.getBoundingClientRect().width;
    canvas.style.transform = `scale(${scaleX})`;

    setZoomStatus('out');
  };

  const zoomFullHeight = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.style.transform = `scale(${1})`;

    setZoomStatus('in');
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

  useEffect(() => {
    if (!hasTriggeredRef.current) {
      hasTriggeredRef.current = true;

      onWorkerInit?.();
      
      if (!initialUrl) {
        handleNewVideo();
      }
      else if (initialUrl && videoRef.current) {
        const video = videoRef.current;
        video.src = initialUrl;

        const handleDuration = () => {
          // Forzamos una seek extrema para obligar al navegador a resolver duration
          const tryResolveDuration = () => {
            if (video.duration === Infinity || isNaN(video.duration)) {
              const onSeeked = () => {
                video.currentTime = 0; // vuelve al inicio después de forzar
                video.removeEventListener("seeked", onSeeked);

                finalizeLoad(); // ahora sí
              };

              video.addEventListener("seeked", onSeeked);
              video.currentTime = 1e101; // esta magia fuerza al navegador a "calcular" duración
            } else {
              finalizeLoad(); // duración ya válida
            }
          };

          setTimeout(tryResolveDuration, 50); // esperamos brevemente
        };

        const finalizeLoad = () => {
          // console.log("✅ Duración final:", video.duration);
          if (video.duration > maxDuration) {
            setProcessingStatus("durationExceeded");
            removeVideo();
          } else {
            setVideoLoaded(true);
            onLoaded?.(true);
          }
        };

        video.addEventListener("loadedmetadata", handleDuration);
        video.load();

        return () => {
          if (process.env.NODE_ENV === "production") {
            video.removeEventListener("loadedmetadata", handleDuration);
            URL.revokeObjectURL(initialUrl);
          }
        };
      }
    }
  }, [initialUrl]);

  useEffect(() => {
    setIsCleanView(isPoseJumpSettingsModalOpen);
    onCleanView?.(isPoseJumpSettingsModalOpen);
  }, [isPoseJumpSettingsModalOpen]);

  useEffect(() => {
    return () => {
      cancelWait(); // Limpieza al desmontar
    };
  }, []);

  useImperativeHandle(ref, () => ({
    handleVideoProcessing,
    isVideoLoaded: () => videoLoaded,
    isVideoProcessed: () => processingStatus === "processed",
    downloadJSON,
    removeVideo,
    handleNewVideo,
    handleFrames,
    playFrames,
    pauseFrames,
  }));

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
            <div 
              className={`absolute left-0 bottom-2 w-[82%] h-20 z-10 pl-8 py-3`}
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
            muted 
            onClick={() => {
              setShowPoseOrientationModal(false);
            }} />
          <canvas ref={inputCanvasRef} className="hidden" />
          <canvas
            ref={canvasRef}
            onClick={async () => {
              if (showPoseOrientationModal) setShowPoseOrientationModal(false);  
                         
              if (
                processingStatus !== "processed" ||
                isPoseJumpDataModalOpen
              ) return;
              
              if (isPlayingRef.current) {
                pauseFrames();
              }
              else {                
                await playFrames();
              }
            }}
            className="h-full"
            style={{
              display: processingStatus === "processed" ? 'block' : 'none',
              aspectRatio,
              maxHeight: '50dvh',
              objectFit: 'contain', // Opcional: para que el contenido no se deforme
            }} />
          
          {processingStatus === "processed" ? (
            <PoseJumpEventModal
              isSettingsModalOpen={isPoseJumpSettingsModalOpen}
              isDataModalOpen={isPoseJumpDataModalOpen}
              isEventModalOpen={isPoseJumpEventModalOpen}
              jumpEvents={jumpEvents}
              onJumpEventSelected={(jumpEvent: JumpEventType) => {
                // console.log(jumpEventsRef.current)
                const prev = jumpEventsRef.current;
                if (!prev) return defaultJumpEvents;

                let hipAngle: number | null = null;
                let kneeAngle: number | null = null;
                let videoTime: number | null = null;

                if (jumpEventsRef.current?.[jumpEvent].videoTime) {
                  jumpEventsRef.current = {
                    ...prev,
                    [jumpEvent]: {
                      hipAngle,
                      kneeAngle,
                      videoTime,
                    },
                  };
                  setJumpEvents(prev => {
                    if (!prev) return defaultJumpEvents;

                    return {
                      ...prev,
                      [jumpEvent]: {
                        hipAngle,
                        kneeAngle,
                        videoTime,
                      }
                    }
                  });

                  return;
                } 

                if (poseOrientation === "right") {
                  if (orthogonalReference === "vertical") {
                    hipAngle = nearestFrameRef.current?.jointData?.right_hip?.angle ?? null;
                    kneeAngle = nearestFrameRef.current?.jointData?.right_knee?.angle ?? null;                
                  }
                  else {
                    const A = nearestFrameRef.current?.keypoints.find(kp => kp.name === "right_hip");
                    const B = nearestFrameRef.current?.keypoints.find(kp => kp.name === "right_knee");

                    const AB = { x: (B?.x ?? 0) - (A?.x ?? 0), y: (B?.y ?? 0) - (A?.y ?? 0) };
                    const verticalVector = { x: 0, y: 1 };
                    const dot = AB.x * verticalVector.x + AB.y * verticalVector.y;
                    const magAB = Math.hypot(AB.x, AB.y);
                    const magVerticalVector = Math.hypot(verticalVector.x, verticalVector.y);

                    let angleDeg;
                    if (magAB === 0 || magVerticalVector === 0) angleDeg = 0;
                    angleDeg = Math.acos(dot / (magAB * magVerticalVector)) * (180 / Math.PI);

                    hipAngle = angleDeg;
                    kneeAngle = nearestFrameRef.current?.jointData?.right_knee?.angle ?? null;
                    if (kneeAngle) kneeAngle = 180 - (hipAngle + (180 - kneeAngle));
                  }
                }
                else if (poseOrientation === "left") {
                  if (orthogonalReference === "vertical") {
                    hipAngle = nearestFrameRef.current?.jointData?.left_hip?.angle ?? null;
                    kneeAngle = nearestFrameRef.current?.jointData?.left_knee?.angle ?? null;
                  }
                  else {
                    const A = nearestFrameRef.current?.keypoints.find(kp => kp.name === "left_hip");
                    const B = nearestFrameRef.current?.keypoints.find(kp => kp.name === "left_knee");

                    const AB = { x: (B?.x ?? 0) - (A?.x ?? 0), y: (B?.y ?? 0) - (A?.y ?? 0) };
                    const verticalVector = { x: 0, y: 1 };
                    const dot = AB.x * verticalVector.x + AB.y * verticalVector.y;
                    const magAB = Math.hypot(AB.x, AB.y);
                    const magVerticalVector = Math.hypot(verticalVector.x, verticalVector.y);

                    let angleDeg;
                    if (magAB === 0 || magVerticalVector === 0) angleDeg = 0;
                    angleDeg = Math.acos(dot / (magAB * magVerticalVector)) * (180 / Math.PI);

                    hipAngle = angleDeg;
                    kneeAngle = nearestFrameRef.current?.jointData?.right_knee?.angle ?? null;
                    if (kneeAngle) kneeAngle = 180 - (hipAngle + (180 - kneeAngle));
                  }
                }
                videoTime = nearestFrameRef.current?.videoTime ?? null;
                
                jumpEventsRef.current = {
                  ...prev,
                  [jumpEvent]: {
                    hipAngle,
                    kneeAngle,
                    videoTime,
                  },
                };
                setJumpEvents(prev => {
                  if (!prev) return defaultJumpEvents;

                  return {
                    ...prev,
                    [jumpEvent]: {
                      hipAngle,
                      kneeAngle,
                      videoTime,
                    }
                  }
                });
              }}
              />
          ) : null }
          
          {processingStatus === "processed" && hiddenLegendsRef.current.size < selectedJoints.length ? (
            <motion.section 
              initial={{ x: -6, opacity: 0 }}
              animate={{ x: isPoseJumpSettingsModalOpen ? '-100%' : -6, opacity: isPoseJumpSettingsModalOpen ? 0 : 1 }}
              transition={{ type: "spring", stiffness: 100, damping: 15 }}
              className={`absolute z-10 bottom-2 left-0 font-bold w-50 p-2 pl-4`}
              style={{
                background: `linear-gradient(to left, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.6) 80%)`
              }}> 
              {
                anglesToDisplay.length > 0 
                ? anglesToDisplay
                  .filter((_, index) => !hiddenLegendsRef.current.has(index))
                  .map((angle, index) => (
                    <p key={index} className="text-white">{angle}</p>
                  ))
                : "Nothing detected"
              }
            </motion.section> 
          ) : null }

          {processingStatus === "processed" ? (
            <motion.section 
              initial={{ x: -6, opacity: 0 }}
              animate={{ x: (!isPoseJumpSettingsModalOpen || isPoseJumpDataModalOpen) ? '-100%' : -6, opacity: (!isPoseJumpSettingsModalOpen || isPoseJumpDataModalOpen) ? 0 : 1 }}
              transition={{ type: "spring", stiffness: 100, damping: 15 }}
              className={`absolute left-0 bottom-0 p-4 py-1 pl-5 pb-2 flex justify-center items-center gap-[0.1rem] text-xl text-center bg-black/40 transition-opacity duration-300 opacity-0`}
              style={{
                background: `linear-gradient(to left, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.6) 80%)`
              }}>
              <ViewfinderCircleIcon 
                className={`w-10 h-10 text-white p-[0.3rem]`}
                onClick={(ev) => {
                  ev.stopPropagation();

                  setIsPoseJumpEventModalOpen((prev) => !prev);
                }}
                />
              <DocumentIcon 
                className='w-10 h-10 text-white p-[0.3rem]'
                onClick={(ev) => {
                  ev.stopPropagation();

                  setIsPoseJumpDataModalOpen(true);
                }}/>              
            </motion.section>   
          ) : null}

          {processingStatus === "processed" ? (
            <>
              <div className='absolute right-0 bottom-0 pr-2 pb-2 flex flex-row gap-1'>           
                <ArrowUturnDownIcon 
                  className='hidden w-10 h-10 p-[0.1rem] text-white'
                  onClick={() => handleFrames("detect")} /> 
                <section 
                  className={`flex justify-center items-center p-4 py-1 text-xl text-center bg-black/40 rounded-r-full transition-opacity duration-300 ${isCleanView 
                    ? 'opacity-0'
                    : 'opacity-100'
                  }`}
                  style={{
                    background: `linear-gradient(to right, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.6) 80%)`
                  }}>
                  {nearestFrameRef.current?.videoTime.toFixed(2)} s
                </section>             
                {isCleanView ? (
                  <EyeIcon
                    className='w-10 h-10 p-[0.1rem] text-white'
                    onClick={() => {
                      setIsCleanView(false);
                      onCleanView?.(false);
                      if (isPoseJumpSettingsModalOpen) setIsPoseJumpSettingsModalOpen(false);
                      // if (isPoseJumpEventModalOpen) setIsPoseJumpEventModalOpen(false);
                    }}
                  /> ) : (
                  <EyeSlashIcon
                    className='w-10 h-10 p-[0.2rem] text-white'
                    onClick={() => {
                      setIsCleanView(true);
                      onCleanView?.(true);
                    }}
                  /> )} 
                {((zoomStatus === "in" && aspectRatio < 1) ||
                (zoomStatus === "out" && aspectRatio >= 1)) ? (
                  <MagnifyingGlassPlusIcon 
                    onClick={(ev) => {                
                      ev.stopPropagation();
                      
                      if (aspectRatio < 1) { // portrait
                        zoomFullWidth();
                      }
                      else {
                        zoomFullHeight();
                      }
                    }}  
                    className='w-10 h-10 text-white p-[0.2rem]'/> 
                ) : null }
                {((zoomStatus === "out" && aspectRatio < 1) ||
                (zoomStatus === "in" && aspectRatio >= 1)) ? (
                  <MagnifyingGlassMinusIcon 
                    onClick={(ev) => {
                      ev.stopPropagation();
                      
                      if (aspectRatio < 1) { // portrait
                        zoomFullHeight();
                      }
                      else {
                        zoomFullWidth();
                      }
                    }}  
                    className='w-10 h-10 text-white p-[0.1rem]'/>
                ) : null }         
              </div> 
            </>
          ) : null}
        </div>

        {processingStatus === "processed" && recordedPositions ? (
          <div 
            data-element="non-swipeable"
            className='z-10 flex-1 w-full max-w-5xl mx-auto'>
            {isPlaying ? (
              <div
                className='absolute w-full h-full bg-red-500/0'
                onClick={() => {
                  pauseFrames();
                }}
                />
              ) : null}
            <PoseChart
              joints={selectedJoints}
              valueTypes={[Kinematics.ANGLE]} // Solo queremos ángulos
              recordedPositions={recordedPositions} // Los datos
              onVerticalLineChange={(newValue, clickEvent) => {
                // console.log('onVerticalLineChange ', newValue)
                if (clickEvent === null) {
                  isVerticalLineUpdatedByUser.current = false;
                  return;
                };
                // console.log('onVerticalLineChange ')
                isVerticalLineUpdatedByUser.current = true;

                if (isPlayingRef.current) {
                  pauseFrames();
                }

                handleVerticalLineChange(newValue);
              }}
              verticalLineValue={verticalLineValue}
              isPlayingVideo={isPlaying}
              parentStyles="h-full" 
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
              }} 
              />
          </div>
        ) : null }
      </div>

      {processingStatus === 'processed' ? (
        <PoseJumpDataModal
          isSettingsModalOpen={isPoseJumpSettingsModalOpen}
          isDataModalOpen={isPoseJumpDataModalOpen}
          jumpDetected={jumpEventsRef.current}
          />
        ) : null }

      {processingStatus === 'processing' || processingStatus === "cancelRequested" ? (
        <div 
          data-element="non-swipeable"
          className="fixed top-1/2 -translate-y-1/2 w-full max-w-5xl mx-auto text-center px-12 flex flex-col items-center gap-8">
          <div className="h-40 bg-[url('/processing-video.png')] bg-center bg-contain bg-no-repeat aspect-[1/1] animate-pulse"/>
          <CubeTransparentIcon className='w-8 h-8 animate-spin'/>
          <div className="w-full">
            <div className="text-sm text-gray-400 mb-4">
              {processingProgress === 100 ? 'Rendering charts...' 
                : `Processing video... ${processingProgress.toFixed(0)}%`
              }
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


