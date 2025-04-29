"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Webcam from "react-webcam";
import * as poseDetection from "@tensorflow-models/pose-detection";
import * as tf from '@tensorflow/tfjs-core';
import { motion } from "framer-motion";
import { JointDataMap, CanvasKeypointName, Kinematics } from "@/interfaces/pose";
import { VideoConstraints } from "@/interfaces/camera";
import { usePoseDetector } from "@/providers/PoseDetector";
import { useSettings } from "@/providers/Settings";
import PoseModal from "@/modals/Poses";
import PoseSettingsModal from "@/modals/PoseSettings";
import { drawKeypointConnections, drawKeypoints } from "@/utils/draw";
import { updateMultipleJoints } from "@/utils/pose";
import { keypointPairs } from '@/utils/pose';
import { jointConfigMap, jointOptions } from '@/utils/joint';
import { PauseIcon } from "@heroicons/react/24/outline";
import { CameraIcon, UserIcon, Cog6ToothIcon, CloudArrowDownIcon, Bars3Icon, XMarkIcon, ArrowPathIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/solid";

interface IndexProps {
  handleMainMenu: (visibility?: boolean) => void;
  isMainMenuOpen: boolean
}

const Index = ({ handleMainMenu, isMainMenuOpen }: IndexProps) => {
  const { 
    settings, 
    setSelectedJoints 
  } = useSettings();
  const {
    selectedJoints,
    angularHistorySize,
    poseModel,
  } = settings.pose;

  const [showOrthogonalOption, setShowOrthogonalOption] = useState(false);
  const [orthogonalReference, setOrthogonalReference] = useState<'vertical' | 'horizontal' | undefined>(undefined);
  const orthogonalReferenceRef = useRef(orthogonalReference);

  const [anglesToDisplay, setAnglesToDisplay] = useState<string[]>([]);
  const anglesToDisplayRef = useRef<string[]>(anglesToDisplay);

  const [isCameraReady, setIsCameraReady] = useState(false);

  const [videoConstraints, setVideoConstraints] = useState<VideoConstraints>({
    facingMode: "user",
  });
  
  const [visibleKinematics] = useState<Kinematics[]>([Kinematics.ANGLE]);
  
  const [isPoseModalOpen, setIsPoseModalOpen] = useState(false);
  const [isPoseSettingsModalOpen, setIsPoseSettingsModalOpen] = useState(false);
  
  const jointAngleHistorySizeRef = useRef(angularHistorySize);
  
  const jointDataRef = useRef<JointDataMap>({});
  
  const selectedJointsRef = useRef(selectedJoints);
  const visibleKinematicsRef = useRef(visibleKinematics);
  
  const [isFrozen, setIsFrozen] = useState(false);
  const animationRef = useRef<number | null>(null);

  const referenceScaleRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputCanvasRef = useRef<HTMLCanvasElement>(null);
  const webcamRef = useRef<Webcam>(null);
  const videoConstraintsRef = useRef(videoConstraints);

  const toggleCamera = useCallback(() => {
    setVideoConstraints((prev) => ({
      facingMode: prev.facingMode === "user" ? "environment" : "user",
    }));
  }, []);

  const maxJointsAllowed = useMemo(() => {
    return visibleKinematics.length === 2 ? 3 : 6;
  }, [visibleKinematics]);
  
  const { detector, detectorModel, minPoseScore } = usePoseDetector();
  const prevPoseModel = useRef<poseDetection.SupportedModels>(detectorModel);

  const excludedParts = [
    'left_eye', 'right_eye',
    'left_eye_inner', 'right_eye_inner', 
    'left_eye_outer', 'right_eye_outer',
    'left_ear', 'right_ear',
    'nose', 
    'mouth_left', 'mouth_right',
    'left_thumb', 'right_thumb',
    'left_index', 'right_index', 
    'left_pinky', 'right_pinky', 
  ];

  const handleClickOnCanvas = () => { 
    if (isPoseSettingsModalOpen || isMainMenuOpen) {
      setIsPoseSettingsModalOpen(false);
  
      handleMainMenu(false);
    }
    else {
      setIsFrozen(prev => !prev);
    }
  }

  const handleJointSelection = useCallback((selectedJoints: string[]) => {
    setSelectedJoints(selectedJoints as CanvasKeypointName[]);

    setShowOrthogonalOption(selectedJoints.some(joint =>
      joint.includes('shoulder') || joint.includes('hip')
    ));

    setAnglesToDisplay((prevAngles) => {
      const result: string[] = [];

      selectedJoints.forEach((joint) => {
        const formatted = formatJointName(joint); // ej. "R Elbow"
        const existing = prevAngles.find((a) => a.startsWith(formatted));

        if (existing) {
          result.push(existing); // mantener el actual
        } else {
          result.push(`${formatted}: - °`); // añadir por defecto
        }
      });

      anglesToDisplayRef.current = [...result]

      return result;
    });
  }, []); 

  const formatJointName = (jointName: string): string => {
    const sideMap: Record<string, string> = {
      left: "L",
      right: "R",
    };
  
    const [side, part] = jointName.split("_");
  
    const sideShort = sideMap[side] ?? side;
    const capitalizedPart = part.charAt(0).toUpperCase() + part.slice(1);
  
    return `${sideShort} ${capitalizedPart}`;
  };

  const jointWorkerRef = useRef<Worker | null>(null);
  useEffect(() => {
    jointWorkerRef.current = new Worker('/workers/jointWorker.js');

    return () => {
      jointWorkerRef.current?.terminate();
    };
  }, []); 

  const getCanvasScaleFactor = ({canvas, video}: {
    canvas: HTMLCanvasElement | null,
    video: HTMLVideoElement | null
  }): number => {
    if (!canvas || !video) return 1;
  
    const canvasDisplayWidth = canvas.clientWidth;
    const canvasDisplayHeight = canvas.clientHeight;
  
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
  
    if (!videoWidth || !videoHeight) return 1;
  
    const scaleX = canvasDisplayWidth / videoWidth;
    const scaleY = canvasDisplayHeight / videoHeight;
  
    return (scaleX + scaleY) / 2;
  };

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

  useEffect(() => {
    orthogonalReferenceRef.current = orthogonalReference;
  }, [orthogonalReference])
  
  useEffect(() => {
    jointAngleHistorySizeRef.current = angularHistorySize;
    selectedJointsRef.current = selectedJoints;
  }, [settings])

  useEffect(() => {
    visibleKinematicsRef.current = visibleKinematics;
  }, [visibleKinematics])

  useEffect(() => {
    videoConstraintsRef.current = videoConstraints;
  }, [videoConstraints]);  

  useEffect(() => {
    prevPoseModel.current = poseModel;
  }, [poseModel]);

  useEffect(() => {    
    if (
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
            video: videoElement
          });

          referenceScaleRef.current = scaleFactor;
          const referenceScale = referenceScaleRef.current ?? 1;
          // ---------------------------------------------------

          if (poses.length > 0) {
            const ctx = canvasRef.current.getContext("2d");

            if (ctx) {
              ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

              // Filtrar keypoints con score mayor a scoreThreshold
              const keypoints = poses[0].keypoints.filter(
                (kp) => 
                  kp.score && 
                  kp.score > minPoseScore &&
                  !excludedParts.includes(kp.name!)
              );

              // Dibujar keypoints en el canvas
              drawKeypoints({
                ctx, 
                keypoints, 
                mirror: videoConstraintsRef.current.facingMode === "user", 
                pointRadius: 4 * (referenceScale / scaleFactor),
              });

              // Dibujar conexiones entre puntos clave
              drawKeypointConnections({
                ctx, 
                keypoints, 
                keypointPairs, 
                mirror: videoConstraintsRef.current.facingMode === "user", 
                lineWidth: 2 * (referenceScale / scaleFactor), 
              });

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

  }, [detector, isFrozen]);

  useEffect(() => {
    showMyWebcam();
  }, []);

  return (
    <>
      {(!detector && !isCameraReady) ? (
          <div className="fixed w-full h-dvh z-50 text-white bg-black/80 flex flex-col items-center justify-center gap-4">
            <p>{(!isCameraReady && detector) ? "Initializing camera..." : "Setting up Tensorflow..."}</p>
            {(!isCameraReady && detector) ? 
              <ArrowPathIcon className="w-8 h-8 animate-spin"/>
              : <CloudArrowDownIcon className="w-8 h-8 animate-bounce"/>
            }
          </div>
        ) : null
      }
      <div
        className={`relative z-30 flex flex-col items-center justify-start h-dvh`}>
        <motion.h1
          initial={{ y: 0, opacity: 1 }}
          animate={{ y: isMainMenuOpen ? -48 : 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 100, damping: 15 }}
          className={`absolute z-10 inset-x-0 mx-auto w-[50vw] text-center text-xl text-white bg-[#5dadec] dark:bg-black/40 
          rounded-full py-2 pl-4 font-bold mt-2 whitespace-nowrap transition-[padding] ${
            isFrozen ? "pr-8" : "pr-4"
          }`}>
          Kinematics
          <PauseIcon className={`absolute top-1/2 -translate-y-1/2 right-4 h-6 w-6 animate-pulse ${
            !isFrozen ? "hidden" : ""
          }`}/>
        </motion.h1>

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
          className={`absolute object-cover h-full w-full ${
            !isCameraReady ? "hidden" : ""
          }`} 
          onClick={handleClickOnCanvas}/> 

        <section 
          data-element="non-swipeable"
          className="absolute top-1 left-1 z-10 p-2 flex flex-col justify-between gap-6 bg-[#5dadec] dark:bg-black/40 rounded-full">
          {isMainMenuOpen ?
            <XMarkIcon 
              className="w-6 h-6 text-white"
              onClick={() => handleMainMenu()}
              />
            : <Bars3Icon 
                className="w-6 h-6 text-white"
                onClick={() => handleMainMenu()}
                />
          }
        </section>
        <section 
          data-element="non-swipeable"
          className="absolute top-1 right-1 p-2 z-10 flex flex-col justify-between gap-6 bg-[#5dadec] dark:bg-black/40 rounded-full"
          >
          <div 
            className={`relative cursor-pointer text-white`}
            onClick={toggleCamera}
            >
            <CameraIcon 
              className={`h-6 w-6 cursor-pointer`}
              />
            <ArrowPathIcon className="absolute top-[60%] -right-1 h-4 w-4 text-[#5dadec] dark:text-white bg-white/80 dark:bg-black/80 rounded-full p-[0.1rem]"/>
          </div>
          <UserIcon 
            className={`h-6 w-6 cursor-pointer text-white`}
            onClick={() => setIsPoseModalOpen((prev) => !prev)}
            />
          <Cog6ToothIcon 
            className={`h-6 w-6 cursor-pointer text-white`}
            onClick={() => setIsPoseSettingsModalOpen(prev => !prev)}
            />
        </section>

        {isCameraReady ? (
          <section 
            className="absolute z-10 bottom-2 right-0 font-bold w-40 p-2"
            style={{
              background: `linear-gradient(to right, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.6) 80%)`
            }}
            >{
            anglesToDisplay.map((angle, index) => (
              <p key={index} className="text-white">{angle}</p>
            ))
          }
          </section> ) : null
        }
      </div> 

      <PoseModal 
        isModalOpen={isPoseModalOpen} 
        handleModal={() => setIsPoseModalOpen((prev) => !prev)} 
        jointOptions={jointOptions}
        maxSelected={maxJointsAllowed }
        initialSelectedJoints={selectedJoints} 
        onSelectionChange={handleJointSelection} 
        />

      <PoseSettingsModal 
        isModalOpen={isPoseSettingsModalOpen}
        />

      <ArrowTopRightOnSquareIcon 
        className={`absolute bottom-2 left-1 z-30 w-8 h-8 text-white transition-transform ${(!showOrthogonalOption || orthogonalReference === undefined)
          ? '-rotate-0 opacity-50'
          : orthogonalReference === 'horizontal'
          ? 'rotate-45'
          : '-rotate-45'
        }`}
        onClick={() => { 
          if (!showOrthogonalOption) return;
                    
          setOrthogonalReference(prev => {
            if (prev === 'vertical') return 'horizontal';
            if (prev === 'horizontal') return undefined;
            return 'vertical';
          })
        }}
        />
    </>
  );
};

export default Index;
