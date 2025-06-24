"use client";
// LiveAnalysis component

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Webcam from "react-webcam";
import * as poseDetection from "@tensorflow-models/pose-detection";
import * as tf from '@tensorflow/tfjs-core';
import { JointDataMap, Kinematics } from "@/interfaces/pose";
import { VideoConstraints } from "@/interfaces/camera";
import { usePoseDetector } from "@/providers/PoseDetector";
import { OrthogonalReference, useSettings } from "@/providers/Settings";
import { drawKeypointConnections, drawKeypoints, getCanvasScaleFactor } from "@/utils/draw";
import { adjustOrientationForMirror, excludedDrawableKeypoints, excludedKeypoints, inferPoseOrientation, PoseOrientation, updateMultipleJoints } from "@/utils/pose";
import { keypointPairs } from '@/utils/pose';
import { jointConfigMap } from '@/utils/joint';
import { CloudArrowDownIcon, ArrowPathIcon } from "@heroicons/react/24/solid";
import { formatJointName } from '@/utils/joint';

export type LiveAnalysisHandle = {
  startRecording: () => void;
  stopRecording: () => void;
  isRecording: boolean;  
  setIsFrozen: React.Dispatch<React.SetStateAction<boolean>>;
  // poseOrientationInferredRef: React.RefObject<PoseOrientation | null>;
};

interface IndexProps {
  handleMainMenu: (visibility?: boolean) => void;
  isMainMenuOpen: boolean;
  orthogonalReference: OrthogonalReference;
  videoConstraints: VideoConstraints;
  anglesToDisplay: string[];
  setAnglesToDisplay: React.Dispatch<React.SetStateAction<string[]>>;
  isPoseSettingsModalOpen: boolean;
  setIsPoseSettingsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  jointWorkerRef: React.RefObject<Worker | null>;
  jointDataRef: React.RefObject<JointDataMap>;
  onChangeIsFrozen: (isFrozen: boolean) => void;
  onWorkerInit?: () => void;
  showGrid?: boolean;
  setShowGrid?: React.Dispatch<React.SetStateAction<boolean>>;
  onRecordingChange?: (value: boolean) => void;
  onRecordingFinish?: (url: string) => void;
  showPoseOrientationModal: boolean;
  setShowPoseOrientationModal: React.Dispatch<React.SetStateAction<boolean>>;
  onPoseOrientationInferredChange: (value: PoseOrientation | null) => void;
}

const Index = forwardRef<LiveAnalysisHandle, IndexProps>(({ 
  handleMainMenu, 
  isMainMenuOpen,
  orthogonalReference,
  videoConstraints,
  anglesToDisplay,
  setAnglesToDisplay,
  isPoseSettingsModalOpen,
  setIsPoseSettingsModalOpen,
  jointWorkerRef,
  jointDataRef,
  onChangeIsFrozen,
  onWorkerInit,
  showGrid,
  onRecordingChange,
  onRecordingFinish,
  showPoseOrientationModal,
  setShowPoseOrientationModal,
  onPoseOrientationInferredChange,
}, ref) => {
  const { settings } = useSettings();
  const {
    selectedJoints,
    angularHistorySize,
    poseModel,
    poseOrientation,
  } = settings.pose;

  const [isCameraReady, setIsCameraReady] = useState(false);

  const poseOrientationInferredRef = useRef<PoseOrientation>(null);
  const prevPoseOrientationInferredRef = useRef<PoseOrientation>(null);

  const [isRecording, setIsRecording] = useState(false);
  const recordedChunksRef = useRef<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [visibleKinematics] = useState<Kinematics[]>([Kinematics.ANGLE]);
  
  const jointAngleHistorySizeRef = useRef(angularHistorySize);
    
  const selectedJointsRef = useRef(selectedJoints);
  const visibleKinematicsRef = useRef(visibleKinematics);
  
  const [isFrozen, setIsFrozen] = useState(false);
  const animationRef = useRef<number | null>(null);

  const hasTriggeredRef = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputCanvasRef = useRef<HTMLCanvasElement>(null);
  const webcamRef = useRef<Webcam>(null);

  const keypointRadiusBase = 2; // revisar

  const orthogonalReferenceRef = useRef(orthogonalReference);
  const videoConstraintsRef = useRef(videoConstraints);
  
  const { 
    detector, 
    detectorModel, 
    minPoseScore,
    isDetectorReady, 
  } = usePoseDetector();
  const prevPoseModel = useRef<poseDetection.SupportedModels>(detectorModel);

  const handleClickOnCanvas = () => { 
    if (
      isPoseSettingsModalOpen || 
      isMainMenuOpen ||
      showPoseOrientationModal
    ) {
      setIsPoseSettingsModalOpen(false);
  
      handleMainMenu(false);

      setShowPoseOrientationModal(false);
    }
    else if (!isRecording){
      setIsFrozen(prev => !prev);
    }
  }

  const showMyWebcam = () => {
    if (
      webcamRef.current !== null &&
      webcamRef.current.video?.readyState === 4
    ) {
      const myVideoWidth = webcamRef.current.video.videoWidth;
      const myVideoHeight = webcamRef.current.video.videoHeight;

      webcamRef.current.video.width = myVideoWidth;
      webcamRef.current.video.height = myVideoHeight;
    }
  };

  const startRecording = () => {
    if (!webcamRef.current?.video?.srcObject) return;

    const stream = webcamRef.current.video.srcObject as MediaStream;

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm; codecs=vp8',
    });

    recordedChunksRef.current = [];
    mediaRecorderRef.current = mediaRecorder;
    setIsFrozen(false);
    setIsRecording(true);
    onRecordingChange?.(true);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      await new Promise((res) => setTimeout(res, 50));

      const chunks = recordedChunksRef.current;
      if (!chunks.length) {
        console.warn("🎥 No se grabó nada.");
        return;
      }

      const blob = new Blob(chunks, { type: 'video/webm' });
      if (blob.size === 0) {
        console.error("🛑 Blob está vacío. Grabación no válida.");
        return;
      }

      const url = URL.createObjectURL(blob);
      onRecordingFinish?.(url);
    };

    mediaRecorder.start();

    // Limitar la grabación a 30 segundos
    recordingTimeoutRef.current = setTimeout(() => {
      stopRecording();
    }, 30_000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.requestData(); // ← fuerza último chunk
      mediaRecorderRef.current.stop();
    }

    setIsRecording(false);
    onRecordingChange?.(false);
    
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
    }
  };
  
  useEffect(() => {
    jointAngleHistorySizeRef.current = angularHistorySize;
    selectedJointsRef.current = selectedJoints;
  }, [settings])

  useEffect(() => {
    visibleKinematicsRef.current = visibleKinematics;
  }, [visibleKinematics])

  useEffect(() => {
    prevPoseModel.current = poseModel;
  }, [poseModel]);

  useEffect(() => {
    orthogonalReferenceRef.current = orthogonalReference
  }, [orthogonalReference]);

  useEffect(() => {
    videoConstraintsRef.current = videoConstraints;
  }, [videoConstraints]);

  useEffect(() => {
    if (!isDetectorReady) {
      setIsPoseSettingsModalOpen(false);
    }
  }, [isDetectorReady]);

  useEffect(() => {    
    if (
      !isDetectorReady || 
      !detector || 
      !webcamRef.current || 
      !canvasRef.current
    ) return;

    let poseModelChanged = prevPoseModel.current !== poseModel;
    let isMounted = true;
    
    const analyzeFrame = async () => {
      if (isFrozen || !isMounted) {
        if (
          animationRef.current && 
          !poseModelChanged 
        ) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }

        if (
          webcamRef.current && 
          webcamRef.current.video && 
          !poseModelChanged
        ) {
          webcamRef.current.video.pause();  
        }

        return;
      }
      
      try {
        // Captura el fotograma actual de la webcam
        let videoElement;
        if ( webcamRef.current) {
          videoElement = webcamRef.current.video;
        }
        
        if (videoElement &&
            videoElement.readyState === 4 &&
            videoElement.videoWidth > 0 &&
            videoElement.videoHeight > 0
        ) {    
          let poses = [];
          if (detectorModel === poseDetection.SupportedModels.BlazePose) {
            const inputCanvas = inputCanvasRef.current;
            if (!inputCanvas) return;

            const realWidth = videoElement.videoWidth;
            const realHeight = videoElement.videoHeight;

            const maxInputSize = 320;
            const scale = realWidth > realHeight
              ? maxInputSize / realWidth
              : maxInputSize / realHeight;

            const reducedWidth = Math.round(realWidth * scale);
            const reducedHeight = Math.round(realHeight * scale);

            inputCanvas.width = reducedWidth;
            inputCanvas.height = reducedHeight;

            const ctx = inputCanvas.getContext("2d");
            ctx?.drawImage(videoElement, 0, 0, reducedWidth, reducedHeight);

            const inputTensor = tf.browser.fromPixels(inputCanvas);
            poses = await detector.estimatePoses(inputTensor);
            inputTensor.dispose();

            // 🔥 Ahora debes escalar de nuevo las coordenadas de BlazePose
            poses.forEach(pose => {
              pose.keypoints.forEach(kp => {
                kp.x = kp.x / scale;
                kp.y = kp.y / scale;
              });
            });
          } else {
            poses = await detector!.estimatePoses(videoElement, {
              maxPoses: 1,
              flipHorizontal: false,
            });
          }

          if (!canvasRef.current) return;

          canvasRef.current.width = videoElement.videoWidth;
          canvasRef.current.height = videoElement.videoHeight;

          // ---------------------------------------------------
          const scaleFactor = getCanvasScaleFactor({
            canvas: canvasRef.current, 
            sourceDimensions: {
              width: videoElement.videoWidth,
              height: videoElement.videoHeight,
            },
          });
          // ---------------------------------------------------

          if (poses.length > 0) {
            const ctx = canvasRef.current.getContext("2d");

            if (ctx) {
              ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

              // Filtrar keypoints con score mayor a scoreThreshold
              const keypoints = poses[0].keypoints.filter( kp => 
                kp.score && 
                kp.score > minPoseScore &&
                !excludedKeypoints.includes(kp.name!)
              );  
              const drawableKeypoints = keypoints.filter(kp => !excludedDrawableKeypoints.includes(kp.name!));            
              const isMirrored = videoConstraintsRef.current.facingMode === "user";

              // Dibujar keypoints en el canvas
              drawKeypoints({
                ctx, 
                keypoints: drawableKeypoints, 
                mirror: isMirrored, 
                pointRadius: (keypointRadiusBase) * (scaleFactor ?? 1),
              });

              // Dibujar conexiones entre puntos clave
              drawKeypointConnections({
                ctx, 
                keypoints: drawableKeypoints, 
                keypointPairs, 
                mirror: isMirrored, 
                lineWidth: (keypointRadiusBase / 2) * (scaleFactor ?? 1), 
              });
              
              // Ajustar orientación de la postura
              let orientationRaw: PoseOrientation | null = null;
              let orientationAdjusted: PoseOrientation | null = null;
              if (poseOrientation === "auto") {
                const inferred = inferPoseOrientation(keypoints);
                orientationRaw = inferred;
                orientationAdjusted = orientationRaw;
                const adjusted = adjustOrientationForMirror(inferred, isMirrored);

                if (poseOrientationInferredRef.current !== adjusted) {
                  poseOrientationInferredRef.current = adjusted;

                  // Solo emitir si el valor cambió
                  if (prevPoseOrientationInferredRef.current !== adjusted) {
                    prevPoseOrientationInferredRef.current = adjusted;
                    onPoseOrientationInferredChange?.(adjusted); // Emite al padre
                  }
                }
              } else {
                orientationRaw = poseOrientation;
                orientationAdjusted = adjustOrientationForMirror(poseOrientation, isMirrored);
              }
              
              // Calcular ángulo entre tres keypoints
              updateMultipleJoints({
                keypoints,
                selectedJoints: selectedJointsRef.current,
                jointDataRef,
                jointConfigMap,
                jointWorker: jointWorkerRef.current!,
                jointAngleHistorySize: jointAngleHistorySizeRef.current,
                orthogonalReference: orthogonalReferenceRef.current,
                formatJointName,
                setAnglesToDisplay,
                poseOrientation: orientationAdjusted,
              });
            }
          }        
        }
      } catch (error) {
        console.error("Error analyzing frame:", error);
      }

      if (!isFrozen) {
        animationRef.current = requestAnimationFrame(analyzeFrame);

        if (
          webcamRef.current && 
          webcamRef.current.video && 
          webcamRef.current.video.paused
        ) {
          webcamRef.current.video.play(); 
        }
      }
    };

    animationRef.current = requestAnimationFrame(analyzeFrame);

    return () => {
      isMounted = false;
      poseModelChanged = prevPoseModel.current !== poseModel;

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };

  }, [detector, isFrozen, isDetectorReady]);

  useEffect(() => {
    onChangeIsFrozen(isFrozen);
  }, [isFrozen]);

  useEffect(() => {
    if (!hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      
      onWorkerInit?.();
      
      showMyWebcam();
    }
  }, []);

  useImperativeHandle(ref, () => ({
    startRecording,
    stopRecording,
    isRecording,
    setIsFrozen,
    // poseOrientationInferredRef,
  }));

  return (
    <>
      {(!isCameraReady || !isDetectorReady || !detector) && (
        <div className="fixed w-full h-dvh z-50 text-white bg-black/80 flex flex-col items-center justify-center gap-4">
          <p>
            {!detector 
              ? "Setting up Tensorflow..."
              : !isDetectorReady 
              ? "Setting up the model..."
              : "Initializing camera..."}
          </p>
          {!detector 
            ? <CloudArrowDownIcon className="w-8 h-8 animate-bounce"/>
            : <ArrowPathIcon className="w-8 h-8 animate-spin"/>}
        </div>
      )}
      <>
        <Webcam
          ref={webcamRef}
          className={`relative object-cover h-full w-full`}
          videoConstraints={videoConstraints}
          muted
          mirrored={videoConstraints.facingMode === "user"}
          onUserMedia={() => setIsCameraReady(true)}
          />
        <canvas ref={inputCanvasRef} style={{ display: "none" }} />
        <canvas 
          ref={canvasRef} 
          className={`absolute top-0 object-cover h-full w-full ${
            !isCameraReady ? "hidden" : ""
          }`} 
          onClick={handleClickOnCanvas}/> 

        {showGrid && (
          <div className="pointer-events-none absolute inset-0 z-50 opacity-60">
            {/* Líneas verticales */}
            <div
              className="absolute top-0 bottom-0 left-1/4 w-px"
              style={{ background: 'linear-gradient(to bottom, transparent 0%, white 10%, white 90%, transparent 100%)' }}
            />
            <div
              className="absolute top-0 bottom-0 left-2/4 w-px"
              style={{ background: 'linear-gradient(to bottom, transparent 0%, white 10%, white 90%, transparent 100%)' }}
            />
            <div
              className="absolute top-0 bottom-0 left-3/4 w-px"
              style={{ background: 'linear-gradient(to bottom, transparent 0%, white 10%, white 90%, transparent 100%)' }}
            />

            {/* Líneas horizontales */}
            <div
              className="absolute left-0 right-0 top-1/4 h-px"
              style={{ background: 'linear-gradient(to right, transparent 0%, white 10%, white 90%, transparent 100%)' }}
            />
            <div
              className="absolute left-0 right-0 top-2/4 h-px"
              style={{ background: 'linear-gradient(to right, transparent 0%, white 10%, white 90%, transparent 100%)' }}
            />
            <div
              className="absolute left-0 right-0 top-3/4 h-px"
              style={{ background: 'linear-gradient(to right, transparent 0%, white 10%, white 90%, transparent 100%)' }}
            />
          </div>
        )}


        {isCameraReady && anglesToDisplay.length > 0 ? (
          <section 
            className="absolute z-10 bottom-2 left-0 font-bold w-40 p-2"
            style={{
              background: `linear-gradient(to left, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.6) 80%)`
            }}
            >{
            anglesToDisplay.map((angle, index) => (
              <p key={index} className="text-white">{angle}</p>
            ))
          }
          </section> ) : null
        }
      </> 
    </>
  );
});

Index.displayName = 'LiveAnalysis';

export default Index;
