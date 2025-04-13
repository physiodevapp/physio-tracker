"use client";

import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Webcam from "react-webcam";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { JointDataMap, JointConfigMap, CanvasKeypointName, PoseSettings, Kinematics, JointColors } from "@/interfaces/pose";
import { drawKeypointConnections, drawKeypoints } from "@/utils/draw";
import { updateJoint } from "@/utils/joint";
import PoseGraph from "./Graph";
import { VideoConstraints } from "@/interfaces/camera";
import { DetectorType, usePoseDetector } from "@/providers/PoseDetector";
import { CameraIcon, PresentationChartBarIcon, UserIcon, Cog6ToothIcon, VideoCameraIcon, TrashIcon, CubeTransparentIcon, CloudArrowDownIcon, Bars3Icon, XMarkIcon, ArrowUpTrayIcon, ArrowPathIcon } from "@heroicons/react/24/solid";
import { BackwardIcon, ForwardIcon, PauseIcon } from "@heroicons/react/24/outline";
import { useSettings } from "@/providers/Settings";
import PoseModal from "@/modals/Pose";
import PoseSettingsModal from "@/modals/PoseSettings";
import { motion } from "framer-motion";

interface IndexProps {
  handleMainMenu: (visibility?: boolean) => void;
  isMainMenuOpen: boolean
}

const Index = ({ handleMainMenu, isMainMenuOpen }: IndexProps) => {
  const { settings, setSelectedJoints } = useSettings();

  const [anglesToDisplay, setAnglesToDisplay] = useState<string[]>([])

  const [isCameraReady, setIsCameraReady] = useState(false);

  const lastXRef = useRef<number | null>(null);
  const isSeekingFromChartRef  = useRef<{
    isSeeking: boolean;
    newValue: null | {
      x: number;
      values: { label: string; y: number }[];
    }
  }>({
    isSeeking: false,
    newValue: null,
  });

  const [infoMessage, setInfoMessage] = useState({
    show: false,
    message:""
  })

  const [videoConstraints, setVideoConstraints] = useState<VideoConstraints>({
    facingMode: "user",
  });

  const [recording, setRecording] = useState(false);
  const [capturedChunks, setCapturedChunks] = useState<Blob[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [estimatedFps, setEstimatedFps] = useState<number | null>(null);
  const [processVideo, setProcessVideo] = useState(1);
  const [videoProcessed, setVideoProcessed] = useState(false);
  const videoProcessedRef = useRef(videoProcessed);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  
  const [poseSettings] = useState<PoseSettings>({ scoreThreshold: 0.3 });
  
  const [
    visibleKinematics, 
  ] = useState<Kinematics[]>([Kinematics.ANGLE]);
  const [displayGraphs, setDisplayGraphs] = useState(false);
  
  const [isPoseModalOpen, setIsPoseModalOpen] = useState(false);
  const [isPoseSettingsModalOpen, setIsPoseSettingsModalOpen] = useState(false);
  
  const jointAngleHistorySizeRef = useRef(settings.pose.angularHistorySize);
  
  const jointDataRef = useRef<JointDataMap>({});
  
  const visibleJointsRef = useRef(settings.pose.selectedJoints);
  const visibleKinematicsRef = useRef(visibleKinematics);
  
  const [isFrozen, setIsFrozen] = useState(false);
  const animationRef = useRef<number | null>(null);

  const referenceScaleRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
  
  const detector = usePoseDetector();

  const keypointPairs: [CanvasKeypointName, CanvasKeypointName][] = [
    [CanvasKeypointName.LEFT_SHOULDER, CanvasKeypointName.RIGHT_SHOULDER],
    [CanvasKeypointName.LEFT_SHOULDER, CanvasKeypointName.LEFT_ELBOW],
    [CanvasKeypointName.LEFT_ELBOW, CanvasKeypointName.LEFT_WRIST],
    [CanvasKeypointName.RIGHT_SHOULDER, CanvasKeypointName.RIGHT_ELBOW],
    [CanvasKeypointName.RIGHT_ELBOW, CanvasKeypointName.RIGHT_WRIST],
    [CanvasKeypointName.LEFT_HIP, CanvasKeypointName.RIGHT_HIP],
    [CanvasKeypointName.LEFT_HIP, CanvasKeypointName.LEFT_KNEE],
    [CanvasKeypointName.LEFT_KNEE, CanvasKeypointName.LEFT_ANKLE],
    [CanvasKeypointName.RIGHT_HIP, CanvasKeypointName.RIGHT_KNEE],
    [CanvasKeypointName.RIGHT_KNEE, CanvasKeypointName.RIGHT_ANKLE],
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
        isSeekingFromChartRef.current = {
          isSeeking: false,
          newValue: null,
        };

        togglePlayback({});
      }
    }
  }

  const handleJointSelection = useCallback((selectedJoints: string[]) => {
    setSelectedJoints(selectedJoints as CanvasKeypointName[]);

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
    // console.log('handlePreview ', Boolean(videoRef.current))
    if (capturedChunks.length || uploadedUrl) {
      const blob = new Blob(capturedChunks, { type: 'video/webm' });
      const url = uploadedUrl ?? URL.createObjectURL(blob);

      setVideoUrl(url);
    }
  };

  const handleProcessVideo = () => {
    if (isPoseSettingsModalOpen || isMainMenuOpen) {
      setIsPoseSettingsModalOpen(false);
  
      handleMainMenu(false);
    }

    if (visibleJointsRef.current.length > 0 && videoRef.current) {  
      setProcessVideo((prev) => prev * (-1));
    } else {
      setIsPoseModalOpen(true);
    }
  }

  const togglePlayback = ({action, restart = false}: {action?: "play" | "pause"; restart?: boolean}) => {
    const video = videoRef.current;
    if (!video) return;

    if (restart) {
      video.playbackRate = settings.pose.processingSpeed;

      recordedPositionsRef.current = {};
      
      video.currentTime = 0;
    }

    const shouldPlay = action === "play" || (action === undefined && video.paused);
    const shouldPause = action === "pause" || (action === undefined && !video.paused);

    if (shouldPlay) {
      setTimeout(() => {
        video.play();
      }, (restart && isFrozen) ? 100 : 0);
      setIsFrozen(false);
    } else if (shouldPause) {
      video.pause();
      setTimeout(() => {
        setIsFrozen(true);
      }, 100);
    }
  };

  const handleEnded = () => {
    if (!videoProcessed) {
      setVideoProcessed(true);
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
    const video = videoRef.current;
    if (!video) return;

    if (newValue.x === lastXRef.current) return; 
    lastXRef.current = newValue.x;
    
    if (!video.paused) {
      if (videoProcessed && videoUrl) {
        isSeekingFromChartRef.current = {
          isSeeking: false,
          newValue: null,
        };
        
        togglePlayback({});
      }
    }
    
    video.currentTime = newValue.x;
    setVideoCurrentTime(video.currentTime);
    
    setTimeout(async () => {
      // console.log('newValue 1 ', newValue)
      if (video!.paused) {
        isSeekingFromChartRef.current = {
          isSeeking: true,
          newValue: newValue,
        };
      }

      await analyzeSingleFrame();
      
      // isSeekingManually.current = false;
    }, 400);
  };

  const updateIsSeekingFromCurrentVideoTime = (timestampMs: number) => {
    // Obtener el ángulo más cercano por articulación
    const values: { label: string; y: number }[] = [];
    Object.entries(recordedPositionsRef.current).forEach(([jointName, history]) => {
      if (!history?.length) return;

      // Buscar el ángulo con timestamp más cercano al tiempo actual
      const closest = history.reduce((prev, curr) =>
        Math.abs(curr.timestamp - timestampMs) < Math.abs(prev.timestamp - timestampMs)
          ? curr
          : prev
      );

      if (closest) {
        values.push({ label: jointName, y: closest.angle });
      }
    });
    // Actualizar isSeekingFromChartRef
    isSeekingFromChartRef.current = {
      isSeeking: true,
      newValue: {
        x: timestampMs,
        values,
      },
    };
  }

  const rewindStep = () => {
    if (videoRef.current!.currentTime <= 0) return;

    togglePlayback({action: "pause"});

    const fps = (estimatedFps ?? 0) < 30 ? 30 : estimatedFps;
    if (videoRef.current && fps) {
      const stepTime = 1 / fps;

      videoRef.current.currentTime = Math.max(videoRef.current.currentTime - stepTime, 0);

      // Obtener el ángulo más cercano por articulación
      const timestampMs = videoRef.current.currentTime * 1000;
      updateIsSeekingFromCurrentVideoTime(timestampMs);

      setTimeout(async () => {
        await analyzeSingleFrame();
      }, 200);
    }
  };

  const forwardStep = () => {
    if (videoRef.current!.currentTime >= videoRef.current!.duration) return;
    
    togglePlayback({action: "pause"});
    
    const fps = (estimatedFps ?? 0) < 30 ? 30 : estimatedFps;
    if (videoRef.current && fps) {
      const stepTime = 1 / fps;
      
      videoRef.current.currentTime = Math.min(videoRef.current.currentTime + stepTime, videoRef.current.duration);

      // Obtener el ángulo más cercano por articulación
      const timestampMs = videoRef.current.currentTime * 1000;
      updateIsSeekingFromCurrentVideoTime(timestampMs);      
      
      setTimeout(async () => {
        await analyzeSingleFrame();
      }, 200);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
  
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
  
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  

  const handleRemoveRecord = () => {
    if (videoProcessed) {
      setVideoProcessed(false);

      togglePlayback({action: "pause", restart: true});

      setTimeout(() => {
        setIsFrozen(false);
      }, 100);

      setDisplayGraphs(false);
    } else {
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

  const updateMultipleJoints = ({keypoints, jointNames, jointDataRef, jointConfigMap}: {
    keypoints: poseDetection.Keypoint[],
    jointNames: CanvasKeypointName[],
    jointDataRef: RefObject<JointDataMap>,
    jointConfigMap: JointConfigMap
  }) => {
    const anglesToDisplay: string[] = [];
    setAnglesToDisplay(anglesToDisplay);
    
    if (!visibleJointsRef.current.length) return; 

    jointNames.forEach((jointName) => {
      const jointConfig = jointConfigMap[jointName] ?? { invert: false };

      const jointData = jointDataRef.current[jointName] ?? null;

      const {
        isSeeking,
        newValue,
      } = isSeekingFromChartRef.current;

      const updatedData = updateJoint({
        keypoints,
        jointData,
        jointName,
        invert: jointConfig.invert,
        angleHistorySize: jointAngleHistorySizeRef.current,
        graphAngle: isSeeking 
          ? newValue?.values.find((value) => value.label === jointName)?.y 
          : null,
      });
      jointDataRef.current[jointName] = updatedData;
      if (updatedData && typeof updatedData.angle === "number") {
        const label = formatJointName(jointName);
        const angle = `${label}: ${updatedData.angle.toFixed(0)}°`;
        anglesToDisplay.push(angle);
      }
  
      if (videoRef.current && !videoProcessedRef.current) {
        // Almacenamos el dato actualizado en recordedPositionsRef.
        if (!recordedPositionsRef.current[jointName]) {
          recordedPositionsRef.current[jointName] = [];
        }
        recordedPositionsRef.current[jointName]!.push({
          timestamp: videoRef.current!.currentTime * 1000, // updatedData.lastTimestamp,
          angle: updatedData.angle,
          color: updatedData.color
        });
      }
    });

    if (anglesToDisplay.length) {
      setAnglesToDisplay(anglesToDisplay);
    }
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
    if (videoRef.current) {
      setDisplayGraphs(false);

      isSeekingFromChartRef.current = {
        isSeeking: false,
        newValue: null
      };
  
      // jointDataRef.current = {};
      // recordedPositionsRef.current = {};
  
      // setCapturedChunks([]);
      
      videoProcessedRef.current = false;
      setVideoProcessed(false);
      setProcessVideo(1);

      togglePlayback({restart: true});
    }
  }, [processVideo]);

  useEffect(() => {
    if (videoUrl === null) {
      setDisplayGraphs(false);

      isSeekingFromChartRef.current = {
        isSeeking: false,
        newValue: null
      };
  
      jointDataRef.current = {};
      recordedPositionsRef.current = {};
  
      setCapturedChunks([]);
      
      videoProcessedRef.current = false;
      setVideoProcessed(false);
      setProcessVideo(1);
    }
  }, [videoUrl]);

  useEffect(() => {
    videoProcessedRef.current = videoProcessed;
  }, [videoProcessed])
  
  useEffect(() => {
    jointAngleHistorySizeRef.current = settings.pose.angularHistorySize;
    visibleJointsRef.current = settings.pose.selectedJoints;
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
    jointConfigMap
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
  }) => {
    const poses = await detector!.estimatePoses(videoElement, {
      maxPoses: 1,
      flipHorizontal: false,
    });
  
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
          (kp) => kp.score && kp.score > poseSettings.scoreThreshold
        );
  
        drawKeypoints({
          ctx,
          keypoints,
          mirror: videoConstraints.facingMode === "user",
          pointRadius: 4 * (referenceScale / scaleFactor),
        });
  
        drawKeypointConnections({
          ctx,
          keypoints,
          keypointPairs,
          mirror: videoConstraints.facingMode === "user",
          lineWidth: 2 * (referenceScale / scaleFactor),
        });
  
        updateMultipleJoints({
          keypoints,
          jointNames: visibleJointsRef.current,
          jointDataRef,
          jointConfigMap,
        });
      }
    }
  };
  
  const analyzeSingleFrame = async () => {
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
          jointConfigMap
        });
      }
    } catch (error) {
      console.error("Error analyzing frame:", error);
    }
  }

  useEffect(() => {    
    if (!detector || (videoUrl ? !videoRef.current : !webcamRef.current)) return;
    
    const analyzeFrame = async () => {
      if (isFrozen) {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }

        if (webcamRef.current && webcamRef.current.video) {
          webcamRef.current.video.pause(); 
        }

        return;
      }

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
            videoElement.readyState === 4 &&
            videoElement.videoWidth > 0 &&
            videoElement.videoHeight > 0
        ) {
          const poses = await detector.estimatePoses(videoElement, {
            maxPoses: 1,
            flipHorizontal: false,
          });
          
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
                (kp) => kp.score && kp.score > poseSettings.scoreThreshold
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

              // Calcular ángulo entre tres keypoints
              if (videoRef.current && videoProcessedRef.current) {
                const timestampMs = videoRef.current.currentTime * 1000;
                updateIsSeekingFromCurrentVideoTime(timestampMs);
              }
              updateMultipleJoints({keypoints, jointNames: visibleJointsRef.current, jointDataRef, jointConfigMap});
            }
          }
        }

      } catch (error) {
        console.error("Error analyzing frame:", error);
      }

      if (!isFrozen) {
        animationRef.current = requestAnimationFrame(analyzeFrame);

        if (webcamRef.current && webcamRef.current.video && webcamRef.current.video.paused) {
          webcamRef.current.video.play(); 
        }
      }
    };

    analyzeFrame();

    return () => {
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

      handlePreview({uploadedUrl: url});
      
      setDisplayGraphs(false);

      handleSettingsModal({hide: true});

      setIsFrozen(false);
    }
  };

  const handleLoadedMetadata = () => {  
    if (videoRef.current) {
      const duration = videoRef.current.duration;
      if (duration <= 10) {
        setIsPoseModalOpen(true);
      } else {
        handleRemoveRecord();

        setInfoMessage({
          show: true,
          message: "Max. 10 seconds"
        })
      }
    }
  };

  const handleOnTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    // if (isSeekingManually.current) return;
    setVideoCurrentTime(e.currentTarget.currentTime);
  };

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
      <div className={`relative z-30 flex flex-col items-center justify-start ${
          displayGraphs ? "h-[50dvh]" : "h-dvh"
        }`}>
        <motion.h1
          initial={{ y: 0, opacity: 1 }}
          animate={{ y: isMainMenuOpen ? -48 : 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 100, damping: 15 }}
          className={`absolute z-10 inset-x-0 mx-auto w-[50vw] text-center text-xl text-white bg-[#5dadec]/60 dark:bg-black/40 
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
            src={videoUrl}               
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
        <canvas 
          ref={canvasRef} 
          className={`absolute object-cover h-full w-full ${
            !isCameraReady ? "hidden" : ""
          }`} 
          onClick={handleClickOnCanvas}/>

        {(!videoUrl || (videoProcessed || videoRef.current?.paused)) && (
          <>
            <section 
              data-element="non-swipeable"
              className="absolute top-1 left-1 z-10 p-2 flex flex-col justify-between gap-6 bg-[#5dadec]/60 dark:bg-black/40 rounded-full">
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
                  <div 
                    className={`relative cursor-pointer ${
                      isFrozen ? "opacity-40" : ""
                    }`}
                    onClick={() => !isFrozen
                      ? recording 
                          ? handleStopRecording() 
                          : handleStartRecording() 
                      : null}
                    >
                    <VideoCameraIcon 
                      className={`h-6 w-6 cursor-pointer ${recording ? 'text-green-500 animate-pulse ' : 'text-white'}`}
                      />
                    <p className="absolute top-[60%] -right-1 bg-[#5dadec] dark:bg-black/80 rounded-[0.2rem] px-[0.2rem] py-0 text-white text-xs text-center">
                      {(recording ? estimatedFps : undefined) ?? "FPS"}
                    </p>
                  </div>
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
              {videoUrl && (
                <TrashIcon 
                  className={`h-6 w-6 cursor-pointer ${
                    videoProcessed ? 'text-orange-300' : 'text-red-500'
                  }`}
                  onClick={handleRemoveRecord}
                  />
              )}
              {(videoUrl && !videoProcessed) && (
                <CubeTransparentIcon 
                  className={`h-6 w-6 text-white cursor-pointer ${
                    ((!isFrozen && videoProcessed) || displayGraphs) ? "opacity-40" : ""
                  }`}
                  onClick={() => ((isFrozen || !videoProcessed) && !displayGraphs) && handleProcessVideo()}
                  />
              )}
              {((videoUrl && videoProcessed)) && (
                <PresentationChartBarIcon 
                  data-element="non-swipeable"
                  className={`h-6 w-6 text-white cursor-pointer ${
                    recording ? 'opacity-40' : ''
                  }`} 
                  onClick={() => !recording && handleGrahpsVisibility()}
                  />
              )}
            </section>
            <section 
              data-element="non-swipeable"
              className="absolute top-1 right-1 p-2 z-10 flex flex-col justify-between gap-6 bg-[#5dadec]/60 dark:bg-black/40 rounded-full"
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
                <ArrowPathIcon className="absolute top-[60%] -right-1 h-4 w-4 text-white bg-[#5dadec] dark:bg-black/80 rounded-full p-[0.1rem]"/>
              </div>
              <UserIcon 
                className={`h-6 w-6 cursor-pointer ${
                  (recording || videoProcessed) ? "text-white/60" : "text-white"
                }`}
                onClick={() => !recording && !videoProcessed && handlePoseModal()}
                />
              <Cog6ToothIcon 
                className={`h-6 w-6 text-white cursor-pointer ${
                  recording ? "text-white/60" : "text-white"
                }`}
                onClick={() => !recording && handleSettingsModal({})}
                />
            </section>
          </>
        )}
        {videoUrl && (videoProcessed || (!videoProcessed && !videoRef.current?.paused)) ? (
            <section 
              data-element="non-swipeable"
              className={`absolute bottom-2 z-10 flex gap-4 bg-[#5dadec]/60 dark:bg-black/40 rounded-full p-2 ${
                videoProcessed || videoRef.current?.paused ? 'left-1' : ''
              }`}
              >
                {videoProcessed && (
                  <>
                    <BackwardIcon 
                      className="h-8 w-8 text-white cursor-pointer"
                      onClick={rewindStep}/>
                      <p className="flex items-center text-white">{ videoCurrentTime.toFixed(2) } s</p>
                    <ForwardIcon 
                      className="h-8 w-8 text-white cursor-pointer"
                      onClick={forwardStep}/>
                  </>
                )}
                {(!videoProcessed && !videoRef.current?.paused) && (
                  <CubeTransparentIcon className="w-8 h-8 text-white animate-spin"/>
                )}
            </section>
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
        initialSelectedJoints={settings.pose.selectedJoints} 
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
            joints={settings.pose.selectedJoints}
            valueTypes={visibleKinematics}
            recordedPositions={videoProcessed ? recordedPositionsRef.current : undefined}
            onVerticalLineChange={handleChartValueX}
            verticalLineValue={isFrozen ? videoCurrentTime : undefined}
            parentStyles="relative z-0 h-[50dvh] bg-white"
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
    </>
  );
};

export default Index;
