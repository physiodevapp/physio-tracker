import { useRef, useState, useEffect } from 'react';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs-core';
import { CanvasKeypointName, JointDataMap, Kinematics } from '@/interfaces/pose';
import { usePoseDetector } from '@/providers/PoseDetector';
import { useSettings } from '@/providers/Settings';
import { updateMultipleJoints } from '@/utils/pose';
import { jointConfigMap } from '@/utils/joint';
import PoseChart, { RecordedPositions } from '@/components/Pose/Graph';

interface VideoFrame {
  videoTime: number; // Tiempo relativo en segundos dentro del vídeo
  jointData: JointDataMap; // Datos de las articulaciones para ese frame
  frameImage: HTMLCanvasElement;
}

const Index = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputCanvasRef = useRef<HTMLCanvasElement>(null);

  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoProcessed, setVideoProcessed] = useState(false);

  const [aspectRatio, setAspectRatio] = useState(1);

  const { detector, detectorModel, minPoseScore } = usePoseDetector();
  const { settings } = useSettings();
  const { selectedJoints, angularHistorySize } = settings.pose;

  const [processingProgress, setProcessingProgress] = useState<number>(0);

  const jointWorkerRef = useRef<Worker | null>(null);

  const jointDataRef = useRef<JointDataMap>({});
  const allFramesDataRef = useRef<VideoFrame[]>([]);

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && videoRef.current) {
      console.log('handleVideoUpload');
  
      const video = videoRef.current;
      video.src = URL.createObjectURL(file);
  
      video.onloadedmetadata = () => {
        console.log('✅ Metadata cargada');
        setVideoLoaded(true);
      };
  
      video.load();
    }
  }

  const smartFrameInterval = (videoDuration: number, maxFrames: number = 300): number => {
    const idealInterval = videoDuration / maxFrames;
    return Math.max(idealInterval, 1 / 120); 
  }

  const processFrame = async () => {
    setProcessingProgress(0);
    setVideoProcessed(false);

    if (!videoRef.current || !canvasRef.current || !detector) return;

    allFramesDataRef.current = [];

    const video = videoRef.current;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    if (video.readyState < 2) return;

    const duration = video.duration;
    const frameInterval = smartFrameInterval(videoRef.current!.duration, 400);
    const steps = Math.floor(duration / frameInterval);

    console.log(`Procesando ${steps} frames en total...`);

    for (let i = 0; i < steps; i++) {
      await new Promise<void>((resolve) => {
        video.currentTime = i * frameInterval;
        
        video.onseeked = async () => {
          try {
            let poses = [];

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

              // Escalar keypoints
              poses.forEach(pose => {
                pose.keypoints.forEach(kp => {
                  kp.x /= scale;
                  kp.y /= scale;
                });
              });
            } else {
              poses = await detector.estimatePoses(video);
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

              updateMultipleJoints({
                keypoints,
                selectedJoints,
                jointDataRef,
                jointConfigMap, // o el real si quieres
                jointWorker: jointWorkerRef.current!,
                jointAngleHistorySize: angularHistorySize, // si tienes este dato
                orthogonalReference: undefined, // si no usas referencia ortogonal en vídeos
                formatJointName: (jointName) => jointName, // o tu formato real
              });

              allFramesDataRef.current.push({
                videoTime: video.currentTime,
                jointData: { ...jointDataRef.current }, 
                frameImage: frameCanvas,
              });  
              
              const percent = ((i + 1) / steps) * 100;
              setProcessingProgress(percent);              
            }

          } catch (error) {
            console.error('Error analyzing frame:', error);
          }
          resolve();
        };
      });

      if (i < steps - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, frameInterval * 1000));
      }
    }

    console.log('✅ Procesamiento finalizado.');
    console.log(`Frames procesados: ${allFramesDataRef.current.length}`);
    console.log('Preview de datos:', allFramesDataRef.current);
    setVideoProcessed(true);

  };

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

  const handleVerticalLineChange = (newValue: { x: number; values: { label: string; y: number }[] }) => {
    if (videoProcessed) {
      const nearestFrame = findNearestFrame(allFramesDataRef.current, newValue.x);

      if (canvasRef.current && nearestFrame) {
        const ctx = canvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx?.drawImage(nearestFrame.frameImage, 0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  };   

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
    jointWorkerRef.current = new Worker('/workers/jointWorker.js');
  
    return () => {
      jointWorkerRef.current?.terminate();
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className='fixed top-0 flex flex-col'>
        <input type="file" accept="video/*" onChange={handleVideoUpload} />
        <div className='flex flex-row'>
          <button onClick={processFrame} className={`flex-1 p-2 bg-blue-500 text-white rounded ${videoLoaded ? '' : 'none'}`}>Procesar Vídeo</button>
          <button onClick={downloadJSON} className="flex-1 bg-green-500 text-white px-4 py-2 rounded">
            Descargar JSON
          </button>
        </div>
      </div>
      <div className="absolute top-0 w-full bg-black flex justify-center items-center h-[50dvh]">
        <video ref={videoRef} className="hidden" muted />
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
          parentStyles="absolute bottom-0 w-full h-[50dvh] max-w-5xl mx-auto" // Opcional
        />
      ) : null }

      {!videoProcessed && processingProgress > 0 && processingProgress < 100 ? (
        <div className="w-full max-w-5xl mx-auto text-center mt-4">
          <div className="text-sm text-gray-600 mb-2">
            Procesando: {processingProgress.toFixed(0)}%
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${processingProgress}%` }}
            ></div>
          </div>
        </div>
      ) : null }
    </div>
  );
};

export default Index;
