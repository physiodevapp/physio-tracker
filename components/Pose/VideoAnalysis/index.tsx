"use client";
// VideoAnalysis component

import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs-core';
import { CanvasKeypointName, JointDataMap, Kinematics } from '@/interfaces/pose';
import { usePoseDetector } from '@/providers/PoseDetector';
import { useSettings } from '@/providers/Settings';
import { filterRepresentativeFrames, updateMultipleJoints, VideoFrame } from '@/utils/pose';
import { jointConfigMap } from '@/utils/joint';
import PoseChart, { RecordedPositions } from '@/components/Pose/Graph';
import { drawKeypointConnections, drawKeypoints } from '@/utils/draw';
import { keypointPairs } from '@/utils/pose';
import { CubeTransparentIcon } from '@heroicons/react/24/solid';

export type VideoAnalysisHandle = {
  handleVideoProcessing: () => void;
  isVideoLoaded: () => boolean;
  isVideoProcessed: () => boolean;  
  downloadJSON: () => void;
  removeVideo: () => void;
  handleNewVideo: () => void;
};

interface IndexProps {
  orthogonalReference: 'vertical' | 'horizontal' | undefined;
  jointWorkerRef: React.RefObject<Worker | null>;
  jointDataRef: React.RefObject<JointDataMap>;
  onExit?: () => void;
  onWorkerInit?: () => void;
  onProcessed?: (value: boolean) => void;
  onLoaded?: (value: boolean) => void;
  onProcessing?: (value: boolean) => void;
}

const Index = forwardRef<VideoAnalysisHandle, IndexProps>(({
  orthogonalReference,
  jointWorkerRef,
  jointDataRef,
  onExit,
  onWorkerInit,
  onProcessed,
  onLoaded,
  onProcessing,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputCanvasRef = useRef<HTMLCanvasElement>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const hasTriggeredRef = useRef(false);

  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoProcessed, setVideoProcessed] = useState(false);

  const [aspectRatio, setAspectRatio] = useState(1);

  const { detector, detectorModel, minPoseScore } = usePoseDetector();
  const { settings } = useSettings();
  const { selectedJoints, angularHistorySize } = settings.pose;

  const [processingProgress, setProcessingProgress] = useState<number>(0);

  const allFramesDataRef = useRef<VideoFrame[]>([]);
  const nearestFrameRef = useRef<VideoFrame>(null);

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && videoRef.current) { 
      const video = videoRef.current;
      video.src = URL.createObjectURL(file); 
  
      video.onloadedmetadata = () => {
        // console.log('✅ Metadata cargada');
        setVideoLoaded(true);
        onLoaded?.(true);
      };
  
      video.load();
    }
  }

  const smartFrameInterval = (videoDuration: number, maxFrames: number = 300): number => {
    const idealInterval = videoDuration / maxFrames;
    return Math.max(idealInterval, 1 / 120); 
  }

  const processFrames = async () => {
    setProcessingProgress(0);
    onProcessing?.(true);

    setVideoProcessed(false);
    onProcessed?.(false);    
  
    if (!videoRef.current || !canvasRef.current || !detector) return;
  
    allFramesDataRef.current = [];
  
    const video = videoRef.current;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
  
    const duration = video.duration;
    const frameInterval = smartFrameInterval(duration, 400);
    const steps = Math.floor(duration / frameInterval);
  
    for (let i = 0; i < steps; i++) {
      await new Promise<void>((resolve) => {
        video.currentTime = i * frameInterval;
        video.onseeked = async () => {
          try {
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
              ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
              ctx.drawImage(video, 0, 0, canvasRef.current.width, canvasRef.current.height);
  
              const frameCanvas = document.createElement('canvas');
              frameCanvas.width = canvasRef.current.width;
              frameCanvas.height = canvasRef.current.height;
              const frameCtx = frameCanvas.getContext('2d')!;
              frameCtx.drawImage(canvasRef.current, 0, 0);
  
              const keypoints = poses[0].keypoints.filter(kp =>
                kp.score && kp.score > minPoseScore
              );
  
              allFramesDataRef.current.push({
                videoTime: video.currentTime,
                frameImage: frameCanvas,
                keypoints,
              });
  
              setProcessingProgress(((i + 1) / steps) * 100);
            }
          } catch (err) {
            console.error('Error processing frame:', err);
          }
          resolve();
        };
      });
  
      if (i < steps - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, Math.max(60, frameInterval * 1000)));
      }
    }
  };

  const analyzeAllFrames = async () => {  
    for (const frame of allFramesDataRef.current) {
      const updatedData = await updateMultipleJoints({
        keypoints: frame.keypoints,
        selectedJoints,
        jointDataRef,
        jointConfigMap,
        jointWorker: jointWorkerRef.current!,
        orthogonalReference: orthogonalReference,
        formatJointName: (jointName) => jointName,
        jointAngleHistorySize: angularHistorySize,
        ignoreHistorySize: true,
      });
  
      frame.jointData = structuredClone(updatedData);
    }
  };
  
  const handleVideoProcessing = async () => {
    await processFrames();         // Primero captura frames + keypoints
    await analyzeAllFrames();      // Luego calcula ángulos

    const framesWithJointData = allFramesDataRef.current.filter(
      (frame): frame is VideoFrame => !!frame.jointData
    );    
    const reducedFrames = filterRepresentativeFrames(framesWithJointData, 2); // umbral de grados

    console.log("🟢 Frames representativos:", reducedFrames.length, "de", allFramesDataRef.current.length);

    allFramesDataRef.current = reducedFrames;

    setVideoProcessed(true);
    onProcessed?.(true);

    setProcessingProgress(0);
    onProcessing?.(false);
  };

  const removeVideo = () => {
    allFramesDataRef.current = [];

    if (videoProcessed) {
      setVideoProcessed(false);
      onProcessed?.(false);
    }
    else if (videoLoaded) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
  
      setVideoLoaded(false)
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

  const handleVerticalLineChange = async (newValue: { x: number; values: { label: string; y: number }[] }) => {
    if (videoProcessed) {
      const nearestFrame = findNearestFrame(allFramesDataRef.current, newValue.x);
      nearestFrameRef.current = nearestFrame;
      
      if (canvasRef.current && nearestFrame) {
        const ctx = canvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx?.drawImage(nearestFrame.frameImage, 0, 0, canvasRef.current.width, canvasRef.current.height);
        
        // Pintar puntos clave si existen
        if (ctx && nearestFrame.keypoints) {
          drawKeypoints({
            ctx,
            keypoints: nearestFrame.keypoints,
            mirror: false,
            pointRadius: 4,
          });
  
          drawKeypointConnections({
            ctx,
            keypoints: nearestFrame.keypoints,
            keypointPairs,
            mirror: false,
            lineWidth: 2,
          });
          
        }
      }

    }
  };   

  const handleNewVideo = () => {
    fileInputRef.current?.click();
  }

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
    if (!hasTriggeredRef.current) {
      hasTriggeredRef.current = true;

      onWorkerInit?.();

      handleNewVideo();
    }

  }, []);

  useImperativeHandle(ref, () => ({
    handleVideoProcessing,
    isVideoLoaded: () => videoLoaded,
    isVideoProcessed: () => videoProcessed,
    downloadJSON,
    removeVideo,
    handleNewVideo,
  }));

  return (
    <>
      <div className='absolute top-0 flex flex-col z-10'>
        <input ref={fileInputRef} type="file" accept="video/*" onChange={handleVideoUpload} className='hidden' />
      </div>

      <div className='relative w-full h-dvh flex flex-col'>
        <div className="flex-1 w-full bg-black flex justify-center items-center">
          <video 
            ref={videoRef} 
            className={`${!videoLoaded || processingProgress > 0 || videoProcessed
              ? 'hidden'
              : ''
            }`} 
            muted 
            />
          <canvas ref={inputCanvasRef} className="hidden" />
          <canvas
            ref={canvasRef}
            className="h-full"
            style={{
              display: videoProcessed ? 'block' : 'none',
              aspectRatio, // aquí sin comillas ni template string
              maxHeight: '50dvh',
              objectFit: 'contain', // Opcional: para que el contenido no se deforme
            }}
          />
        </div>

        {videoProcessed && allFramesDataRef.current.length > 0 ? (
          <PoseChart
            joints={selectedJoints} // o los joints que quieras mostrar
            valueTypes={[Kinematics.ANGLE]} // Solo queremos ángulos
            recordedPositions={transformToRecordedPositions(allFramesDataRef.current)} // Tus datos
            onVerticalLineChange={handleVerticalLineChange}
            parentStyles="flex-1 w-full max-w-5xl mx-auto" // Opcional
          />
        ) : null }
      </div>

      {!videoProcessed && processingProgress > 0 && processingProgress < 100 ? (
        <div className="fixed top-1/2 w-full max-w-5xl mx-auto text-center px-12 flex flex-col items-center">
          <CubeTransparentIcon className='w-8 h-8 animate-spin mb-8'/>
          <div className="text-sm text-gray-400 mb-2">
            Processing... {processingProgress.toFixed(0)}%
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-[#5dadec] h-2 rounded-full transition-all duration-300"
              style={{ width: `${processingProgress}%` }}
            ></div>
          </div>
        </div>
      ) : null }
    </>
  );
}); 

Index.displayName = 'VideoAnalysis';

export default Index;
