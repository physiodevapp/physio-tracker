"use client";

import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Webcam from "react-webcam";
import * as poseDetection from "@tensorflow-models/pose-detection";
import * as tf from '@tensorflow/tfjs-core';
import { JointDataMap, JointConfigMap, CanvasKeypointName, PoseSettings, Kinematics, JointColors, JointData } from "@/interfaces/pose";
import { drawKeypointConnections, drawKeypoints } from "@/utils/draw";
import PoseGraph from "./Graph";
import { VideoConstraints } from "@/interfaces/camera";
import { DetectorType, usePoseDetector } from "@/providers/PoseDetector";
import { CameraIcon, PresentationChartBarIcon, UserIcon, Cog6ToothIcon, VideoCameraIcon, TrashIcon, CubeTransparentIcon, CloudArrowDownIcon, Bars3Icon, XMarkIcon, ArrowUpTrayIcon, ArrowPathIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/solid";
import { BackwardIcon, ForwardIcon, PauseIcon } from "@heroicons/react/24/outline";
import { useSettings } from "@/providers/Settings";
import PoseModal from "@/modals/Poses";
import PoseSettingsModal from "@/modals/PoseSettings";
import { motion } from "framer-motion";
//import { updateJoint } from "@/utils/joint";

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
    poseInitDelayMs,
    videoEndThresholdSec,
    poseModelLatency,
  } = settings.pose;

  const [showOrthogonalOption, setShowOrthogonalOption] = useState(false);
  const [orthogonalReference, setOrthogonalReference] = useState<'vertical' | 'horizontal' | undefined>(undefined);
  const orthogonalReferenceRef = useRef(orthogonalReference);

  const [anglesToDisplay, setAnglesToDisplay] = useState<string[]>([]);
  const anglesToDisplayRef = useRef<string[]>(anglesToDisplay);

  const [isCameraReady, setIsCameraReady] = useState(false);

  const lastXRef = useRef<number | null>(null);
  const ignoreNextVerticalLineChangeRef = useRef(false);

  const [infoMessage, setInfoMessage] = useState({
    show: false,
    message:""
  });

  const [videoConstraints, setVideoConstraints] = useState<VideoConstraints>({
    facingMode: "user",
  });

  const [recording, setRecording] = useState(false);
  const [capturedChunks, setCapturedChunks] = useState<Blob[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [estimatedFps, setEstimatedFps] = useState<number | null>(null);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [videoProcessed, setVideoProcessed] = useState(false);
  const videoProcessedRef = useRef(videoProcessed);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [isUploadedVideo, setIsUploadedVideo] = useState(false);
  const [isCancellationRequested, setIsCancellationRequested] = useState<boolean>(false);
  const cancelProcessingRef = useRef(false);
  const isVideoRemoved = useRef(false);

  const isSeekingRef = useRef(false);
  
  const [poseSettings] = useState<PoseSettings>({ scoreThreshold: 0.3 });
  
  const [
    visibleKinematics, 
  ] = useState<Kinematics[]>([Kinematics.ANGLE]);
  const [displayGraphs, setDisplayGraphs] = useState(false);
  
  const [isPoseModalOpen, setIsPoseModalOpen] = useState(false);
  const [isPoseSettingsModalOpen, setIsPoseSettingsModalOpen] = useState(false);
  
  const jointAngleHistorySizeRef = useRef(angularHistorySize);
  
  const jointDataRef = useRef<JointDataMap>({});
  
  const visibleJointsRef = useRef(selectedJoints);
  const visibleKinematicsRef = useRef(visibleKinematics);
  
  const [isFrozen, setIsFrozen] = useState(false);
  const animationRef = useRef<number | null>(null);

  const referenceScaleRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputCanvasRef = useRef<HTMLCanvasElement>(null);
  const webcamRef = useRef<Webcam>(null);
  const videoConstraintsRef = useRef(videoConstraints);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Definimos el contenedor para almacenar los datos por articulación.
  const recordedPositionsRef = useRef<{
    [joint in CanvasKeypointName]?: {
      timestamp: number;
      angle: number;
      color: JointColors;
    }[];
  }>({});

  const toggleCamera = useCallback(() => {
    setVideoConstraints((prev) => ({
      facingMode: prev.facingMode === "user" ? "environment" : "user",
    }));
  }, []);

  const maxJointsAllowed = useMemo(() => {
    return visibleKinematics.length === 2 ? 3 : 6;
  }, [visibleKinematics]);
  
  const { detector, detectorModel } = usePoseDetector();
  const prevPoseModel = useRef<poseDetection.SupportedModels>(detectorModel);

  const keypointPairs: [CanvasKeypointName, CanvasKeypointName][] = [
    [CanvasKeypointName.LEFT_SHOULDER, CanvasKeypointName.RIGHT_SHOULDER],
    [CanvasKeypointName.LEFT_SHOULDER, CanvasKeypointName.LEFT_ELBOW],
    [CanvasKeypointName.LEFT_ELBOW, CanvasKeypointName.LEFT_WRIST],
    [CanvasKeypointName.RIGHT_SHOULDER, CanvasKeypointName.RIGHT_ELBOW],
    [CanvasKeypointName.RIGHT_ELBOW, CanvasKeypointName.RIGHT_WRIST],
    [CanvasKeypointName.LEFT_HIP, CanvasKeypointName.RIGHT_HIP],
    [CanvasKeypointName.LEFT_HIP, CanvasKeypointName.LEFT_KNEE],
    [CanvasKeypointName.LEFT_KNEE, CanvasKeypointName.LEFT_ANKLE],
    [CanvasKeypointName.LEFT_ANKLE, CanvasKeypointName.LEFT_HEEL],
    [CanvasKeypointName.LEFT_ANKLE, CanvasKeypointName.LEFT_FOOT_INDEX],
    [CanvasKeypointName.LEFT_HEEL, CanvasKeypointName.LEFT_FOOT_INDEX],
    [CanvasKeypointName.RIGHT_HIP, CanvasKeypointName.RIGHT_KNEE],
    [CanvasKeypointName.RIGHT_KNEE, CanvasKeypointName.RIGHT_ANKLE],
    [CanvasKeypointName.RIGHT_ANKLE, CanvasKeypointName.RIGHT_HEEL],
    [CanvasKeypointName.RIGHT_ANKLE, CanvasKeypointName.RIGHT_FOOT_INDEX],
    [CanvasKeypointName.RIGHT_HEEL, CanvasKeypointName.RIGHT_FOOT_INDEX],
  ];

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

  const jointConfigMap: JointConfigMap = {
    [CanvasKeypointName.RIGHT_ELBOW]: { invert: true },
    [CanvasKeypointName.RIGHT_SHOULDER]: { invert: false },
    [CanvasKeypointName.RIGHT_HIP]: { invert: false },
    [CanvasKeypointName.RIGHT_KNEE]: { invert: true },
    [CanvasKeypointName.LEFT_ELBOW]: { invert: true },
    [CanvasKeypointName.LEFT_SHOULDER]: { invert: false },
    [CanvasKeypointName.LEFT_HIP]: { invert: false },
    [CanvasKeypointName.LEFT_KNEE]: { invert: true },
  };

  const jointOptions = useMemo(() => [
    { label: "Right Shoulder", value: CanvasKeypointName.RIGHT_SHOULDER },
    { label: "Right Elbow", value: CanvasKeypointName.RIGHT_ELBOW },
    { label: "Right Hip", value: CanvasKeypointName.RIGHT_HIP },
    { label: "Right Knee", value: CanvasKeypointName.RIGHT_KNEE },
    { label: "Left Shoulder", value: CanvasKeypointName.LEFT_SHOULDER },
    { label: "Left Elbow", value: CanvasKeypointName.LEFT_ELBOW },
    { label: "Left Hip", value: CanvasKeypointName.LEFT_HIP },
    { label: "Left Knee", value: CanvasKeypointName.LEFT_KNEE },
  ], []);

  const handleClickOnCanvas = () => { 
    if (isPoseSettingsModalOpen || isMainMenuOpen) {
      setIsPoseSettingsModalOpen(false);
  
      handleMainMenu(false);
    } 
    else {
      if (!videoUrl && !displayGraphs) {
        setIsFrozen(prev => !prev);
      }

      if (videoProcessed && videoUrl) {
        togglePlayback({});
      }
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

  const handleGrahpsVisibility = () => {
    setDisplayGraphs((prev) =>!prev);
  };
  
  const handlePoseModal = () => {
    setIsPoseModalOpen((prev) => !prev);
  }

  const handleSettingsModal = ({hide}: {hide?: boolean}) => {
    setIsPoseSettingsModalOpen((prev) => hide ? false : !prev);
  }

  const handleStartRecording = async () => {
    // console.log('handleStartRecording');
    setVideoUrl(null);

    setDisplayGraphs(false);

    // Reinicia los chunks grabados
    setCapturedChunks([]);

    // Solicita acceso a la cámara con ciertas restricciones
    await navigator.mediaDevices.getUserMedia({
      video: {
        frameRate: { ideal: 60, max: 60 }, // Intenta fijar a 60 fps
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    // Obtiene el stream desde el componente react-webcam
    const stream = webcamRef.current?.stream;
    if (!stream) {
      console.error("No se pudo acceder al stream de la cámara.");
      return;
    }

    // Obtiene la pista de video y sus settings para extraer el fps real
    const videoTrack = stream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    if (settings.frameRate) {
      setEstimatedFps(settings.frameRate);
    } else {
      setEstimatedFps(null);
    }

    // Verifica qué tipo de MediaRecorder es soportado y lo guarda en el estado
    let recorderType = "";
    if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
      recorderType = "video/webm;codecs=vp9";
    } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) {
      recorderType = "video/webm;codecs=vp8";
    } else {
      console.warn("Ningún formato compatible encontrado.");
      recorderType = "video/webm";
    }

    // Define las opciones del MediaRecorder (incluyendo el bitrate)
    const options = {
      mimeType: recorderType,
      videoBitsPerSecond: 2500000, // 2.5 Mbps
    };

    try {
      mediaRecorderRef.current = new MediaRecorder(stream, options);
    } catch (e) {
      console.error("Error al crear MediaRecorder:", e);
      return;
    }

    if (!mediaRecorderRef.current) {
      console.error("No se pudo acceder al MediaRecorder.");
      return;
    }

    mediaRecorderRef.current.addEventListener("dataavailable", handleDataAvailable);
    mediaRecorderRef.current.start();

    setRecording(true);
  };

  const handleDataAvailable = (event: BlobEvent) => {
    if (event.data && event.data.size > 0) {
      setCapturedChunks((prev) => prev.concat(event.data));
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    
    setRecording(false);
  };
  
  const handlePreview = ({uploadedUrl}: {uploadedUrl?: string}) => {
    if (capturedChunks.length || uploadedUrl) {
      const blob = new Blob(capturedChunks, { type: 'video/webm' });
      const url = uploadedUrl ?? URL.createObjectURL(blob);

      setVideoUrl(url);
      setIsUploadedVideo(!!uploadedUrl);
    }
  };

  const handleProcessVideo = () => {
    if (isPoseSettingsModalOpen || isMainMenuOpen) {
      setIsPoseSettingsModalOpen(false);
  
      handleMainMenu(false);
    }

    if (visibleJointsRef.current.length > 0 && videoRef.current) {  
      setIsProcessingVideo(true);
    } else {
      setIsPoseModalOpen(true);
    }
  }

  const togglePlayback = ({action, restart = false}: {action?: "play" | "pause"; restart?: boolean}) => {
    const video = videoRef.current;
    if (!video) return;

    const waitForFrameReady = async (video: HTMLVideoElement) => {
      while (video.readyState < 2) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };

    if (restart) {
      recordedPositionsRef.current = {};
      
      video.currentTime = 0;
      setVideoCurrentTime(0)
    }

    const shouldPlay = action === "play" || (action === undefined && video.paused);
    const shouldPause = action === "pause" || (action === undefined && !video.paused);

    if (shouldPlay) {
      // console.log('shouldPlay')
      // ------
      if (videoProcessed) {
        if (restart && isFrozen) {
          // Esperar a que el vídeo se reposicione a 0 antes de reproducir
          video.onseeked = () => {
            video.play();
            setIsFrozen(false);
            video.onseeked = null; // limpiar el listener
          };
        } else {
          // No es un reinicio, se puede reproducir directamente
          video.play();
          setIsFrozen(false);
        }
      }
      else if (!videoProcessed) {
        if (!videoRef.current?.paused) {
          video.pause();
        }
        setIsFrozen(false);

        let frameCount = 0;
        let FRAME_INTERVAL = 0.1; // valor temporal inicial

        // 🧠 Detectar el intervalo mínimo útil para avanzar de frame en este vídeo
        const findMinUsefulFrameInterval = async (
          video: HTMLVideoElement,
          maxTries = 10,
          startInterval = 1 / 60
        ): Promise<number> => {
          const baseTime = video.currentTime;
          let testInterval = startInterval;

          for (let i = 0; i < maxTries; i++) {
            await new Promise<void>((resolve) => {
              const onSeeked = () => {
                video.removeEventListener("seeked", onSeeked);
                resolve();
              };
              video.addEventListener("seeked", onSeeked);
              video.currentTime = baseTime + testInterval;
            });

            if (video.currentTime !== baseTime) {
              // console.log(`✅ FRAME_INTERVAL óptimo: ${testInterval.toFixed(4)}s`);
              return testInterval;
            }

            testInterval += 0.005;
          }

          console.warn("⚠️ No se detectó un intervalo mínimo útil. Usando 0.1s");
          return 0.1;
        };

        // 🔄 Bucle principal del análisis
        const loop = async () => {
          const video = videoRef.current;
          if (!video || video.ended || isFrozen || cancelProcessingRef.current) return;
          
          const isEnded = video.duration - video.currentTime < videoEndThresholdSec;

          if (isEnded) {
            // console.log("✅ Análisis terminado");          
            const allTimestamps = Object.values(recordedPositionsRef.current)
              .flatMap((arr) => arr?.map((entry) => entry.timestamp) ?? []);

            let firstTimeInSeconds = 0; // fallback por defecto

            if (allTimestamps.length > 0) {
              const minTimestamp = Math.min(...allTimestamps);
              const calculated = minTimestamp / 1000;
              if (Number.isFinite(calculated)) {
                firstTimeInSeconds = calculated;
              } else {
                console.warn("⚠️ El timestamp mínimo no es válido. Usando fallback 0.");
              }
            } else {
              console.warn("⚠️ No hay timestamps. Usando fallback 0.");
            }
          
            video.currentTime = firstTimeInSeconds;
          
            video.onseeked = async () => {
              video.onseeked = null;
          
              // 🔄 Esperar a que el nuevo frame esté listo
              await waitForFrameReady(video);
          
              // 🔄 Espera adicional si usas BlazePose
              if (detectorModel === poseDetection.SupportedModels.BlazePose) {
                await new Promise((resolve) => setTimeout(resolve, poseInitDelayMs));
              }
          
              // ✅ Analizar el primer frame real (posicionamiento)
              await analyzeSingleFrame(); 
          
              // 🧠 Calcular FPS estimado
              const fps = frameCount / video.duration;
              // console.log("🎯 FPS estimado:", fps.toFixed(2));
              setEstimatedFps(fps);
          
              // 🧹 Limpiar duplicados
              const removeDuplicateTimestamps = (
                dataRef: React.RefObject<Record<string, { timestamp: number }[]>>
              ) => {
                Object.keys(dataRef.current).forEach((key) => {
                  const seen = new Set<number>();
                  const filtered = dataRef.current[key].filter((entry) => {
                    if (!entry || typeof entry.timestamp !== "number") return false;
                    const rounded = parseFloat(entry.timestamp.toFixed(3));
                    if (seen.has(rounded)) return false;
                    seen.add(rounded);
                    return true;
                  });
                  dataRef.current[key] = filtered;
                });
              };
          
              // ❌ Quitar último valor añadido manualmente
              (Object.keys(recordedPositionsRef.current) as CanvasKeypointName[]).forEach((key) => {
                const arr = recordedPositionsRef.current[key];
                if (Array.isArray(arr) && arr.length > 0) {
                  arr.pop();
                }
              });
              
              removeDuplicateTimestamps(recordedPositionsRef);
              // console.log('✅ Análisis terminado y filtrado ', recordedPositionsRef.current);

              handleEnded();
              setVideoCurrentTime(firstTimeInSeconds);
            };
          
            return;
          }                           

          video.onseeked = async () => {
            if (cancelProcessingRef.current) return;

            video.onseeked = null;
          
            // 🕒 Esperar hasta que el vídeo haya cargado completamente el frame
            await waitForFrameReady(video);
          
            const actualTimestamp = video.currentTime * 1000;

            if (cancelProcessingRef.current) return;
          
            // 🧠 Espera extra si usas BlazePose
            if (detectorModel === poseDetection.SupportedModels.BlazePose) {
              await new Promise((resolve) => setTimeout(resolve, poseInitDelayMs));

              if (cancelProcessingRef.current) return;
            }
          
            await analyzeSingleFrame(actualTimestamp);
            frameCount++;
          
            loop(); // sigue con el siguiente paso
          };          
          
          video.currentTime += FRAME_INTERVAL; // esto se hace después de configurar onseeked
        };

        // ⏯️ Inicializar
        if (video) {
          // 🔍 Estimación de latencia del modelo en milisegundos
          const getEstimatedModelLatency = () => {
            switch (detectorModel) {
              case poseDetection.SupportedModels.BlazePose:
                return poseModelLatency; // Puedes ajustar: lite: ~40ms, full: ~80ms
              case poseDetection.SupportedModels.MoveNet:
              default:
                return 15; // Estimación para MoveNet
            }
          };

          findMinUsefulFrameInterval(video).then((interval) => {
            const estimatedProcessingTime = getEstimatedModelLatency() / 1000;
            // console.log('estimatedProcessingTime ', getEstimatedModelLatency() / 1000)

            // Ajustar con un margen, y poner un límite superior para evitar pasos muy grandes
            const modeMultiplier = false ? 0.5 : 1; // revisar: añadir a settings -> userPrefersHighFrequency
            FRAME_INTERVAL = Math.min(
              Math.max(interval, estimatedProcessingTime) * modeMultiplier,
              0.2 // límite superior: 5 fps máx.
            );
            console.log(`🧠 FRAME_INTERVAL ajustado dinámicamente: ${FRAME_INTERVAL.toFixed(4)}s`);

            loop();
          });
        }
      }
      // ------
    } 
    else if (shouldPause) {
      video.pause();
      video.onpause = async () => {
        await analyzeSingleFrame(video.currentTime)
        
        setIsFrozen(true);

        video.onpause = null;
      };
    }
  };

  const handleEnded = () => {
    // console.log('handleEnded')
    if (!videoProcessed) {
      setVideoProcessed(true);

      setIsProcessingVideo(false);

      setIsCancellationRequested(false);
      cancelProcessingRef.current = false;
    }

    setIsFrozen(true);

    if (videoRef.current && videoRef.current.playbackRate !== 1) {
      videoRef.current.playbackRate = 1;
    }
  };

  const handleChartValueX = (newValue: {
    x: number;
    values: { label: string; y: number }[];
  }) => {   
    // console.log('handleChartValueX ', ignoreNextVerticalLineChangeRef.current) 
    if (ignoreNextVerticalLineChangeRef.current || !isFrozen) return;

    // console.log('handleChartValueX ', newValue)

    const video = videoRef.current;
    if (!video) return;
  
    // Prevenir repeticiones innecesarias
    if (newValue.x === lastXRef.current) return;
    lastXRef.current = newValue.x;
  
    // Pausar si el vídeo estaba reproduciéndose
    if (!video.paused) {
      if (videoProcessed && videoUrl) {
        togglePlayback({});
      }
    }
  
    // Establecer nueva posición en el vídeo
    video.currentTime = newValue.x;
    
    // Analizar el frame una vez esté cargado
    video.onseeked = async () => {
      setVideoCurrentTime(newValue.x);
      video.onseeked = null; // evitar duplicación
  
      // Si usas BlazePose, espera un poco para asegurarte de que el frame se ha renderizado bien
      if (detectorModel === poseDetection.SupportedModels.BlazePose) {
        await new Promise((resolve) => setTimeout(resolve, 100)); // Ajusta si es necesario
      }
  
      await analyzeSingleFrame();
    };
  };  
  
  const rewindStep = () => {
    const video = videoRef.current;
    if (!video || video.currentTime <= 0 || isSeekingRef.current) return;
  
    isSeekingRef.current = true;
    ignoreNextVerticalLineChangeRef.current = true;
  
    togglePlayback({ action: "pause" });
  
    const stepTime = 1 / estimatedFps!;
    video.currentTime = Math.max(video.currentTime - stepTime, 0);
  
    video.onseeked = async () => {
      video.onseeked = null;
      setVideoCurrentTime(video.currentTime);
  
      if (detectorModel === poseDetection.SupportedModels.BlazePose) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
  
      await analyzeSingleFrame();
  
      ignoreNextVerticalLineChangeRef.current = false;
      isSeekingRef.current = false;
    };
  };  
  
  const forwardStep = () => {
    const video = videoRef.current;
    if (!video || video.currentTime >= video.duration || isSeekingRef.current) return;
  
    isSeekingRef.current = true;
    ignoreNextVerticalLineChangeRef.current = true;
  
    togglePlayback({ action: "pause" });
  
    const stepTime = 1 / estimatedFps!;
    video.currentTime = Math.min(video.currentTime + stepTime, video.duration);
  
    video.onseeked = async () => {
      video.onseeked = null;
      setVideoCurrentTime(video.currentTime);
  
      if (detectorModel === poseDetection.SupportedModels.BlazePose) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
  
      await analyzeSingleFrame();
  
      ignoreNextVerticalLineChangeRef.current = false;
      isSeekingRef.current = false;
    };
  };    

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
  
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
  
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  

  const handleRemoveRecord = () => { 
    isVideoRemoved.current = true;

    if (videoProcessed) {
      setVideoProcessed(false);
      
      togglePlayback({action: "pause", restart: true});
      
      setTimeout(() => {  
        setIsFrozen(false);
      }, 100);
      
      setDisplayGraphs(false);
    } else {
      if (cancelProcessingRef.current) {
        setIsCancellationRequested(false);

        setIsProcessingVideo(false);
      }

      setIsCameraReady(false);
      clearCanvas();
  
      setVideoUrl(null);
  
      setEstimatedFps(null);
  
      setIsFrozen(false);
    }
  };

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

  /**
  const updateMultipleJoints = ({
    keypoints, 
    jointNames, 
    jointDataRef, 
    jointConfigMap, 
    actualTimestamp,
  }: {
    keypoints: poseDetection.Keypoint[],
    jointNames: CanvasKeypointName[],
    jointDataRef: RefObject<JointDataMap>,
    jointConfigMap: JointConfigMap,
    actualTimestamp?: number,
  }) => {
    const anglesToDisplay: string[] = [];
    if (videoRef.current) {
      anglesToDisplayRef.current = [];
    }
    else {
      setAnglesToDisplay([])
    }
     
    if (!visibleJointsRef.current.length) return; 

    jointNames.forEach((jointName) => {
      const jointConfig = jointConfigMap[jointName] ?? { invert: false };

      const jointData = jointDataRef.current[jointName] ?? null;

      const updatedData = updateJoint({
        keypoints,
        jointData,
        jointName,
        invert: jointConfig.invert,
        angleHistorySize: jointAngleHistorySizeRef.current,
        graphAngle: null,
        orthogonalReference: orthogonalReferenceRef.current,
        // mirror: videoConstraintsRef.current.facingMode === "user",
        // ctx,
      });

      jointDataRef.current[jointName] = updatedData;

      if (updatedData && typeof updatedData.angle === "number") {
        const label = formatJointName(jointName);
        const angle = `${label}: ${updatedData.angle.toFixed(0)}°`;
        anglesToDisplay.push(angle);
        if (videoRef.current) {
          anglesToDisplayRef.current.push(angle);
        }
      }
  
      if (videoRef.current && !videoProcessedRef.current) {
        // Almacenamos el dato actualizado en recordedPositionsRef.
        if (!recordedPositionsRef.current[jointName]) {
          recordedPositionsRef.current[jointName] = [];
        }
        recordedPositionsRef.current[jointName]!.push({
          timestamp: actualTimestamp ?? videoRef.current!.currentTime * 1000,
          angle: updatedData.angle,
          color: updatedData.color
        });
      }
    });

    // Solo actualizar el estado si hay cambios
    if (!videoRef.current) {
      setAnglesToDisplay(anglesToDisplay);
    }
  };
  */
  const updateMultipleJoints = ({
    keypoints,
    jointNames,
    jointDataRef,
    jointConfigMap,
    actualTimestamp,
  }: {
    keypoints: poseDetection.Keypoint[];
    jointNames: CanvasKeypointName[];
    jointDataRef: RefObject<JointDataMap>;
    jointConfigMap: JointConfigMap;
    actualTimestamp?: number;
  }) => {
    if (!visibleJointsRef.current.length || !jointWorkerRef.current) return;
  
    const video = videoRef.current;
    const currentVideoTime = video?.currentTime ?? 0;
  
    if (video) {
      anglesToDisplayRef.current = [];
    } else {
      setAnglesToDisplay([]);
    }
  
    // Construir mapa de históricos actuales
    const jointDataMap = jointNames.reduce((acc, jointName) => {
      const data = jointDataRef.current[jointName];
      acc[jointName] = {
        angleHistory: data?.angleHistory ?? [],
      };
      return acc;
    }, {} as Record<string, { angleHistory: number[] }>);
  
    // Enviar datos al Worker
    jointWorkerRef.current.postMessage({
      keypoints,
      jointNames,
      jointConfigMap,
      jointDataMap,
      angleHistorySize: jointAngleHistorySizeRef.current,
      orthogonalReference: orthogonalReferenceRef.current,
    });
  
    // Esperar respuesta del Worker
    jointWorkerRef.current.onmessage = (e: MessageEvent<{ updatedJointData: Record<string, JointData> }>) => {
      const updatedJointData = e.data.updatedJointData;
      const anglesToDisplay: string[] = [];
  
      Object.entries(updatedJointData).forEach(([jointName, updatedData]) => {
        jointDataRef.current[jointName as CanvasKeypointName] = updatedData;
  
        const label = formatJointName(jointName);
        const angle = `${label}: ${updatedData.angle.toFixed(0)}°`;
        anglesToDisplay.push(angle);
        if (video) {
          anglesToDisplayRef.current.push(angle);
        }
  
        if (video && !videoProcessedRef.current) {
          if (!recordedPositionsRef.current[jointName as CanvasKeypointName]) {
            recordedPositionsRef.current[jointName as CanvasKeypointName] = [];
          }
  
          recordedPositionsRef.current[jointName as CanvasKeypointName]!.push({
            timestamp: actualTimestamp ?? currentVideoTime * 1000,
            angle: updatedData.angle,
            color: updatedData.color,
          });
        }
      });
  
      if (!video) {
        setAnglesToDisplay(anglesToDisplay);
      }
    };
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
    if (!recording && capturedChunks.length > 0) {
      // Se asegura de que la grabación haya terminado y que existan datos
      handlePreview({});
    }
  }, [capturedChunks, recording]);

  useEffect(() => {
    orthogonalReferenceRef.current = orthogonalReference;
  }, [orthogonalReference])

  useEffect(() => { 
    if (videoRef.current && isProcessingVideo) {
      setDisplayGraphs(false);
      
      videoProcessedRef.current = false;
      setVideoProcessed(false);

      cancelProcessingRef.current = false;

      togglePlayback({restart: true});
    }
  }, [isProcessingVideo]);

  useEffect(() => {
    if (videoUrl === null) {
      setDisplayGraphs(false);
  
      jointDataRef.current = {};
      recordedPositionsRef.current = {};
  
      setCapturedChunks([]);
      
      videoProcessedRef.current = false;
      setVideoProcessed(false);
    }
    else if (videoUrl) {
      if (videoRef.current && capturedChunks.length > 0) {
        const video = videoRef.current;
    
        const handleSeeked = () => {
          const duration = video.currentTime;
    
          if (duration <= 10) {
            setIsPoseModalOpen(true);
          } else {
            handleRemoveRecord();
            setInfoMessage({
              show: true,
              message: "Max. 10 seconds",
            });
          }
    
          // Limpieza
          video.removeEventListener("seeked", handleSeeked);
        };
    
        const handleLoadedMetadata = () => {
          video.currentTime = 999999; // Forzamos un seek al final
        };
    
        video.addEventListener("loadedmetadata", handleLoadedMetadata);
        video.addEventListener("seeked", handleSeeked);
    
        return () => {
          video.removeEventListener("loadedmetadata", handleLoadedMetadata);
          video.removeEventListener("seeked", handleSeeked);
        };
      }
    }
  }, [videoUrl]);

  useEffect(() => {
    videoProcessedRef.current = videoProcessed;
  }, [videoProcessed])
  
  useEffect(() => {
    jointAngleHistorySizeRef.current = angularHistorySize;
    visibleJointsRef.current = selectedJoints;
  }, [settings])

  useEffect(() => {
    visibleKinematicsRef.current = visibleKinematics;
  }, [visibleKinematics])

  useEffect(() => {
    videoConstraintsRef.current = videoConstraints;
  }, [videoConstraints]);

  useEffect(() => {
    if (displayGraphs) {
      if (!videoUrl) {
        setIsFrozen(false);
      }
    }
  }, [displayGraphs]);

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

  const drawOnSingleFrame = async ({
    videoElement,
    canvasRef,
    detector,
    poseSettings,
    videoConstraints,
    referenceScaleRef,
    jointDataRef,
    visibleJointsRef,
    keypointPairs,
    jointConfigMap,
    actualTimestamp,
  }: {
    videoElement: HTMLVideoElement;
    canvasRef: RefObject<HTMLCanvasElement | null>;
    detector: DetectorType;
    poseSettings: { scoreThreshold: number };
    videoConstraints: { facingMode: string };
    referenceScaleRef: RefObject<number | null>;
    jointDataRef: RefObject<JointDataMap>;
    visibleJointsRef: RefObject<CanvasKeypointName[]>;
    keypointPairs: [CanvasKeypointName, CanvasKeypointName][];
    jointConfigMap: JointConfigMap;
    actualTimestamp?: number;
  }) => {
    // const poses = await detector!.estimatePoses(videoElement, {
    //   maxPoses: 1,
    //   flipHorizontal: false,
    // });
    let poses = [];
    if (detectorModel === poseDetection.SupportedModels.BlazePose) {
      const inputCanvas = inputCanvasRef.current;
      if (!inputCanvas) return;
    
      inputCanvas.width = videoElement.videoWidth;
      inputCanvas.height = videoElement.videoHeight;
    
      const ctx = inputCanvas.getContext("2d");
      ctx?.drawImage(videoElement, 0, 0, inputCanvas.width, inputCanvas.height);
    
      const inputTensor = tf.browser.fromPixels(inputCanvas);
      poses = await detector!.estimatePoses(inputTensor);
      inputTensor.dispose();
    } else {
      poses = await detector!.estimatePoses(videoElement, {
        maxPoses: 1,
        flipHorizontal: false,
      });
    }
  
    canvasRef.current!.width = videoElement.videoWidth;
    canvasRef.current!.height = videoElement.videoHeight;
  
    // ---------------------------------------------------
    const scaleFactor = getCanvasScaleFactor({ 
      canvas: canvasRef.current, 
      video: videoElement 
    });

    referenceScaleRef.current = scaleFactor;
    const referenceScale = referenceScaleRef.current ?? 1;
    // ---------------------------------------------------
  
    if (poses.length > 0) {
      const ctx = canvasRef.current!.getContext("2d");
  
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
  
        const keypoints = poses[0].keypoints.filter(
          (kp) => 
            kp.score && 
            kp.score > poseSettings.scoreThreshold &&
            !excludedParts.includes(kp.name!)
        );
  
        // Dibujar keypoints en el canvas
        drawKeypoints({
          ctx,
          keypoints,
          mirror: videoConstraints.facingMode === "user",
          pointRadius: 4 * (referenceScale / scaleFactor),
        });
  
        // Dibujar conexiones entre puntos clave
        drawKeypointConnections({
          ctx,
          keypoints,
          keypointPairs,
          mirror: videoConstraints.facingMode === "user",
          lineWidth: 2 * (referenceScale / scaleFactor),
        });
        // if (!isProcessingVideo) {
        // }
  
        updateMultipleJoints({
          keypoints,
          jointNames: visibleJointsRef.current,
          jointDataRef,
          jointConfigMap,
          actualTimestamp,
        });
      }
    }
  };
  
  const analyzeSingleFrame = async (actualTimestamp?: number) => {
    if (!detector || !canvasRef.current || (videoUrl ? !videoRef.current : !webcamRef.current)) return;

    try {
      // Captura el fotograma actual de la webcam
      let videoElement;
      if (videoUrl && videoRef.current) {
        videoElement = videoRef.current;
      } else if (!videoUrl && webcamRef.current) {
        videoElement = webcamRef.current.video;
      }
      
      if (videoElement &&
          videoElement.videoWidth > 0 &&
          videoElement.videoHeight > 0
      ) {

        drawOnSingleFrame({
          videoElement,
          canvasRef,
          detector,
          poseSettings,
          videoConstraints,
          referenceScaleRef,
          jointDataRef,
          visibleJointsRef,
          keypointPairs,
          jointConfigMap,
          actualTimestamp,
        });
      }
    } catch (error) {
      console.error("Error analyzing frame:", error);
    }
  }

  useEffect(() => {
    prevPoseModel.current = poseModel;
  }, [poseModel]);

  useEffect(() => {    
    if (
      !detector || 
      (videoUrl ? !videoRef.current : !webcamRef.current)
    ) return;

    let poseModelChanged = prevPoseModel.current !== poseModel;
    let isMounted = true;
    
    const analyzeFrame = async () => {
      if (isFrozen || !isMounted) {
        if (
          animationRef.current && 
          !poseModelChanged && 
          !isVideoRemoved.current
        ) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }

        if (
          webcamRef.current && 
          webcamRef.current.video && 
          !poseModelChanged &&
          !isVideoRemoved.current
        ) {
          webcamRef.current.video.pause();  
        }
        
        if (isVideoRemoved.current) {
          clearCanvas(); 

          isVideoRemoved.current = false;
        }

        return;
      }

      if (
        !detector || 
        !canvasRef.current 
        || (videoUrl ? !videoRef.current : !webcamRef.current)
      ) return;
      
      try {
        // Captura el fotograma actual de la webcam
        let videoElement;
        if (videoUrl && videoRef.current) {
          videoElement = videoRef.current;
        } else if (!videoUrl && webcamRef.current) {
          videoElement = webcamRef.current.video;
        }
        
        if (videoElement &&
            videoElement.readyState === 4 &&
            videoElement.videoWidth > 0 &&
            videoElement.videoHeight > 0
        ) {          
          // const poses = await detector!.estimatePoses(videoElement, {
          //   maxPoses: 1,
          //   flipHorizontal: false,
          // });
          let poses = [];
          if (detectorModel === poseDetection.SupportedModels.BlazePose) {
            const inputCanvas = inputCanvasRef.current;
            if (!inputCanvas) return;
          
            inputCanvas.width = videoElement.videoWidth;
            inputCanvas.height = videoElement.videoHeight;
          
            const ctx = inputCanvas.getContext("2d");
            ctx?.drawImage(videoElement, 0, 0, inputCanvas.width, inputCanvas.height);
          
            const inputTensor = tf.browser.fromPixels(inputCanvas);
            poses = await detector.estimatePoses(inputTensor);
            inputTensor.dispose();
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
                  kp.score > poseSettings.scoreThreshold &&
                  !excludedParts.includes(kp.name!)
              );

              // Dibujar keypoints en el canvas
              drawKeypoints({ctx, keypoints, 
                mirror: videoConstraintsRef.current.facingMode === "user", 
                pointRadius: 4 * (referenceScale / scaleFactor),
              });

              // Dibujar conexiones entre puntos clave
              drawKeypointConnections({ctx, keypoints, keypointPairs, 
                mirror: videoConstraintsRef.current.facingMode === "user", 
                lineWidth: 2 * (referenceScale / scaleFactor), 
              });
              // if (!isProcessingVideo) {
              // }

              // Calcular ángulo entre tres keypoints
              updateMultipleJoints({
                keypoints, 
                jointNames: visibleJointsRef.current, 
                jointDataRef, 
                jointConfigMap
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

    // analyzeFrame();
    animationRef.current = requestAnimationFrame(analyzeFrame);

    return () => {
      isMounted = false;
      poseModelChanged = prevPoseModel.current !== poseModel;

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };

  }, [detector, videoUrl, isFrozen]);

  useEffect(() => {
    showMyWebcam();
  }, []);

  const handleUploadVideo = () => {
    if (recording) return;

    fileInputRef.current?.click()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);

      setIsUploadedVideo(true);      

      handlePreview({uploadedUrl: url});
      
      setDisplayGraphs(false);

      handleSettingsModal({hide: true});

      setIsFrozen(false);
    }
  };
  
  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video || !isUploadedVideo) return;
  
    const duration = video.duration;
  
    if (duration <= 10) {
      setIsPoseModalOpen(true);
    } else {
      handleRemoveRecord();
      setInfoMessage({
        show: true,
        message: "Max. 10 seconds",
      });
    }
  }; 

  const handleOnTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    // if (isSeekingManually.current) return;
    setVideoCurrentTime(e.currentTarget.currentTime);
  };

  useEffect(() => {
    if (videoProcessed) {
      const closestJointData = selectedJoints.map(joint => {
        const data = recordedPositionsRef.current[joint];
        if (!data || !data.length) return null;
      
        const currentMs = videoCurrentTime * 1000;
      
        // Encontrar el item con timestamp más cercano
        const closest = data.reduce((prev, curr) => {
          return Math.abs(curr.timestamp - currentMs) < Math.abs(prev.timestamp - currentMs)
            ? curr
            : prev;
        });

        const label = formatJointName(joint);
      
        return {
          angle: `${label}: ${closest.angle.toFixed(0)}°`,
          timestamp: closest.timestamp,
        };
      }).filter(Boolean); // para quitar los null
      // console.log('closestJointData ', recordedPositionsRef.current)
      // console.log('closestJointData ', closestJointData)
      const anglesToDisplay = [...closestJointData].map(a => a?.angle) as string[]
      setAnglesToDisplay(anglesToDisplay);
      
    } 
  }, [videoCurrentTime])

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
        data-element={(videoUrl && (!videoRef.current?.paused || !videoProcessed)) ? 'non-swipeable' : ''}
        className={`relative z-30 flex flex-col items-center justify-start ${
          displayGraphs ? "h-[50dvh]" : "h-dvh"
        }`}>
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

        {videoUrl ? (
          <video 
            ref={videoRef}
            src={videoUrl ?? undefined} 
            muted              
            className={`relative object-cover h-full w-full ${videoConstraints.facingMode === "user" ? 'scale-x-[-1]' : 'scale-x-[1]'}`}
            onTimeUpdate={handleOnTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
            />
        ) : (
          <Webcam
            ref={webcamRef}
            className={`relative object-cover h-full w-full`}
            videoConstraints={videoConstraints}
            muted
            mirrored={videoConstraints.facingMode === "user"}
            onUserMedia={() => setIsCameraReady(true)}
            />
        )}
        <canvas ref={inputCanvasRef} style={{ display: "none" }} />
        {/* {!isProcessingVideo ? (
          <canvas 
            ref={canvasRef} 
            className={`absolute object-cover h-full w-full ${
              !isCameraReady || isProcessingVideo ? "hidden" : ""
            }`} 
            onClick={handleClickOnCanvas}/> 
          ) : null
        } */}
        <canvas 
          ref={canvasRef} 
          className={`absolute object-cover h-full w-full ${
            !isCameraReady ? "hidden" : ""
          }`} 
          onClick={handleClickOnCanvas}/> 

        {!isProcessingVideo ? (
          <>
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
              {!videoUrl && (
                <>
                  <VideoCameraIcon 
                    className={`h-6 w-6 cursor-pointer ${recording ? 'text-green-500 animate-pulse ' : 'text-white'} ${
                      isFrozen ? "opacity-40" : ""
                    }`}
                    onClick={() => !isFrozen
                      ? recording 
                        ? handleStopRecording() 
                        : handleStartRecording() 
                      : null}
                  />
                  <>
                    <ArrowUpTrayIcon 
                      className={`h-6 w-6 cursor-pointer text-white ${
                        recording ? 'opacity-40' : ''
                      }`}
                      onClick={handleUploadVideo}
                      />
                    <input
                      type="file"
                      accept="video/*"
                      ref={fileInputRef}
                      className="hidden"
                      onChange={handleFileChange}
                      />
                  </>
                </>
              )}
              {videoUrl ? (
                  <TrashIcon 
                    className={`h-6 w-6 cursor-pointer ${
                      videoProcessed ? 'text-orange-300' : 'text-red-500'
                    }`}
                    onClick={handleRemoveRecord}
                    />
                ) : null
              }
              {(videoUrl && !videoProcessed) ? (
                  <CubeTransparentIcon 
                    className={`h-6 w-6 text-white cursor-pointer ${
                      ((!isFrozen && videoProcessed) || displayGraphs) ? "opacity-40" : ""
                    }`}
                    onClick={() => ((isFrozen || !videoProcessed) && !displayGraphs) && handleProcessVideo()}
                    />
                ) : null
              }
              {((videoUrl && videoProcessed)) ? (
                  <PresentationChartBarIcon 
                    data-element="non-swipeable"
                    className={`h-6 w-6 text-white cursor-pointer ${
                      recording ? 'opacity-40' : ''
                    }`} 
                    onClick={() => !recording && handleGrahpsVisibility()}
                    />
                ) : null
              }
            </section>
            <section 
              data-element="non-swipeable"
              className="absolute top-1 right-1 p-2 z-10 flex flex-col justify-between gap-6 bg-[#5dadec] dark:bg-black/40 rounded-full"
              >
              <div 
                className={`relative cursor-pointer ${
                  (recording || videoProcessed) ? "text-white/60" : "text-white"
                }`}
                onClick={() => !recording && !videoProcessed && toggleCamera()}
                >
                <CameraIcon 
                  className={`h-6 w-6 cursor-pointer`}
                  />
                <ArrowPathIcon className="absolute top-[60%] -right-1 h-4 w-4 text-[#5dadec] dark:text-white bg-white/80 dark:bg-black/80 rounded-full p-[0.1rem]"/>
              </div>
              <UserIcon 
                className={`h-6 w-6 cursor-pointer ${
                  (recording || videoProcessed) ? "text-white/60" : "text-white"
                }`}
                onClick={() => !recording && !videoProcessed && handlePoseModal()}
                />
              <Cog6ToothIcon 
                className={`h-6 w-6 text-white cursor-pointer ${
                  (recording || videoProcessed) ? "text-white/60" : "text-white"
                }`}
                onClick={() => !recording && !videoProcessed && handleSettingsModal({})}
                />
            </section>
          </> ) : null
        }
        {(videoUrl && videoProcessed) ? (
            <section 
              data-element="non-swipeable"
              className={`absolute bottom-2 z-10 flex gap-4 bg-[#5dadec] dark:bg-black/40 rounded-full p-2 left-1`}
              >
                <BackwardIcon 
                  className="h-8 w-8 text-white cursor-pointer"
                  onClick={rewindStep}/>
                  <p className="flex items-center text-white">{ videoCurrentTime.toFixed(2) } s</p>
                <ForwardIcon 
                  className="h-8 w-8 text-white cursor-pointer"
                  onClick={forwardStep}/>
            </section>
          ) : null
        }
        {(videoUrl && isProcessingVideo) ? (
            <>
              <section 
                data-element="non-swipeable"
                className={`absolute bottom-2 z-10 flex gap-4 bg-[#5dadec] dark:bg-black/40 rounded-full p-2 left-1/2 -translate-x-1/2`}
                onClick={() => setIsCancellationRequested(true)}
                >
                  <CubeTransparentIcon className="w-8 h-8 text-white animate-spin"/>
              </section>
              {isCancellationRequested ? (
                  <div 
                  data-element="non-swipeable"
                  className="absolute top-0 h-dvh w-full z-50 flex items-center justify-center bg-black/60"
                  onClick={() => setIsCancellationRequested(false)}
                  >
                    <div className=" dark:bg-gray-800 rounded-lg px-10 py-6 flex flex-col gap-2">
                      <p className="text-xl">Are you sure?</p>
                      <button 
                        className="bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl p-2"
                        onClick={() => {
                          cancelProcessingRef.current = true;

                          handleRemoveRecord();
                        }}
                        >
                          Cancel now
                        </button>
                    </div>
                  </div>
                ) : null
              }
            </>
          ) : null
        }
        {isCameraReady && !(videoUrl && !videoProcessed) ? (
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
        handleModal={handlePoseModal} 
        jointOptions={jointOptions}
        maxSelected={maxJointsAllowed }
        initialSelectedJoints={selectedJoints} 
        onSelectionChange={handleJointSelection} 
        />

      <PoseSettingsModal 
        displayGraphs={displayGraphs}
        isModalOpen={isPoseSettingsModalOpen}
        videoUrl={videoUrl}
        videoProcessed={videoProcessed}
        />

      {displayGraphs ? (
        <div className="relative">
          <PoseGraph 
            joints={selectedJoints}
            valueTypes={visibleKinematics}
            recordedPositions={videoProcessed ? recordedPositionsRef.current : undefined}
            onVerticalLineChange={handleChartValueX}
            parentStyles="relative z-0 h-[50dvh] bg-white"
            verticalLineValue={(videoCurrentTime * 1000)}
            />
        </div> ) : null
      }
      {infoMessage.show ? (
          <div 
            data-element="non-swipeable"
            className="absolute top-0 h-dvh w-full z-40 flex items-center justify-center"
            onClick={() => setInfoMessage({show: false, message: ""})}
            >
            <div className="dark:bg-gray-800 rounded-lg px-10 py-6 flex flex-col gap-2">
              <p className="text-lg">{infoMessage.message}</p>
              <button 
                className="bg-[#5dadec] hover:bg-gray-600 text-white font-bold rounded-lg p-2"
                onClick={() => setInfoMessage({show: false, message: ""})}
                >
                  Got it!
                </button>
            </div>
          </div>
        ) : null
      }
      {(!videoProcessed && !isProcessingVideo) ? ( <ArrowTopRightOnSquareIcon 
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
        /> ) : null
      }
    </>
  );
};

export default Index;
