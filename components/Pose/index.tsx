"use client";

import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Webcam from "react-webcam";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { JointDataMap, JointConfigMap, CanvasKeypointName, PoseSettings, Kinematics, JointColors } from "@/interfaces/pose";
import { drawKeypointConnections, drawKeypoints } from "@/services/draw";
import { updateJoint } from "@/services/joint";
import PoseGraph from "./Graph";
import { VideoConstraints } from "@/interfaces/camera";
import { DetectorType, usePoseDetector } from "@/providers/PoseDetector";
import { CameraIcon, PresentationChartBarIcon, UserIcon, Cog6ToothIcon, VideoCameraIcon, TrashIcon, CubeTransparentIcon, CloudArrowDownIcon, Bars3Icon, XMarkIcon, ArrowUpTrayIcon, ArrowPathIcon } from "@heroicons/react/24/solid";
import { BackwardIcon, ForwardIcon, PauseIcon } from "@heroicons/react/24/outline";
import { useSettings } from "@/providers/Settings";
import PoseModal from "@/modals/Pose";
import PoseGraphSettingsModal from "@/modals/PoseGraphSettings";
import PoseSettingsModal from "@/modals/PoseSettings";
import { motion } from "framer-motion";

interface IndexProps {
  handleMainMenu: (visibility?: boolean) => void;
  isMainMenuOpen: boolean
}

const Index = ({ handleMainMenu, isMainMenuOpen }: IndexProps) => {
  const { settings, setSelectedJoints } = useSettings();

  const [videoReady, setVideoReady] = useState(false);

  const isSeekingFromChart  = useRef(false);

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
  
  const [visibleKinematics, setVisibleKinematics] = useState<Kinematics[]>([Kinematics.ANGLE]);
  const [displayGraphs, setDisplayGraphs] = useState(false);
  
  const [isPoseModalOpen, setIsPoseModalOpen] = useState(false);
  const [isPoseSettingsModalOpen, setIsPoseSettingsModalOpen] = useState(false);
  const [isPoseGraphSettingsModalOpen, setIsPoseGraphSettingsModalOpen] = useState(false);
  
  const jointVelocityHistorySizeRef = useRef(settings.pose.velocityHistorySize);
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
      angularVelocity: number;
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
  
  const maxKinematicsAllowed = useMemo(() => {
    return settings.pose.selectedJoints.length > 0 ? Math.floor(6 / settings.pose.selectedJoints.length) : 2;
  }, [settings]);
  
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
    if (isPoseSettingsModalOpen || isPoseGraphSettingsModalOpen || isMainMenuOpen) {
      setIsPoseSettingsModalOpen(false);
  
      setIsPoseGraphSettingsModalOpen(false);
  
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
  }, []);

  const handleKinematicsSelection = (selectedKinematic: Kinematics) => {
    setVisibleKinematics((prevKinematics) =>
      prevKinematics.includes(selectedKinematic)
        ? prevKinematics.filter((kinematic) => kinematic !== selectedKinematic)
        : [...prevKinematics, selectedKinematic]
    );
  };

  const handleGrahpsVisibility = () => {
    setDisplayGraphs((prev) =>!prev);
  };
  
  const handlePoseModal = () => {
    setIsPoseModalOpen((prev) => !prev);
  }

  const handleSettingsModal = ({hide}: {hide?: boolean}) => {
    if (displayGraphs) {
      setIsPoseGraphSettingsModalOpen((prev) => hide ? false : !prev);
    } else {
      setIsPoseSettingsModalOpen((prev) => hide ? false : !prev);
    }
  }

  const handleStartRecording = async () => {
    console.log('handleStartRecording');
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

    // Establece un límite de grabación de 10 segundos
    // const videoDurationThreshold = 10_000;
    // const rate = videoRef.current?.playbackRate ?? 1;
    // const adjustedDelay = videoDurationThreshold / rate;
    // setTimeout(() => {
    //   if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
    //     handleStopRecording();
    //   }
    // }, adjustedDelay);
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

    // if ((videoRef.current?.currentTime ?? 0) >= 10_000) {
    // }
    // videoRef.current?.pause();
    // handleEnded();
  };
  
  const handlePreview = ({uploadedUrl}: {uploadedUrl?: string}) => {
    console.log('handlePreview ', Boolean(videoRef.current))
    if (capturedChunks.length || uploadedUrl) {
      const blob = new Blob(capturedChunks, { type: 'video/webm' });
      const url = uploadedUrl ?? URL.createObjectURL(blob);

      setVideoUrl(url);
    }
  };

  const handleProcessVideo = () => {
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
      video.playbackRate = 0.2;

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

  const handleChartValueX = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      isSeekingFromChart.current = true;

      setTimeout(() => {
        analyzeSingleFrame();
      }, 200);
    }
  };

  const rewindStep = () => {
    if (videoRef.current!.currentTime <= 0) return;

    togglePlayback({action: "pause"});

    const fps = (estimatedFps ?? 0) < 30 ? 30 : estimatedFps;
    if (videoRef.current && fps) {
      const stepTime = 1 / fps;

      videoRef.current.currentTime = Math.max(videoRef.current.currentTime - stepTime, 0);

      setTimeout(() => {
        analyzeSingleFrame();
      }, 100);
    }
  };

  const forwardStep = () => {
    if (videoRef.current!.currentTime >= videoRef.current!.duration) return;

    togglePlayback({action: "pause"});

    const fps = (estimatedFps ?? 0) < 30 ? 30 : estimatedFps;
    if (videoRef.current && fps) {
      const stepTime = 1 / fps;
      
      videoRef.current.currentTime = Math.min(videoRef.current.currentTime + stepTime, videoRef.current.duration);

      setTimeout(() => {
        analyzeSingleFrame();
      }, 100);
    }
  };

  const handleRemoveRecord = () => {
    setVideoUrl(null);

    setEstimatedFps(null);

    setIsFrozen(false);
  };

  const updateMultipleJoints = ({ctx, keypoints, jointNames, jointDataRef, jointConfigMap}: {
    ctx: CanvasRenderingContext2D,
    keypoints: poseDetection.Keypoint[],
    jointNames: CanvasKeypointName[],
    jointDataRef: RefObject<JointDataMap>,
    jointConfigMap: JointConfigMap
  }) => {
    if (!visibleJointsRef.current.length) return; 

    jointNames.forEach((jointName) => {
      const jointConfig = jointConfigMap[jointName] ?? { invert: false };

      const jointData = jointDataRef.current[jointName] ?? null;

      const updatedData = updateJoint({
        ctx,
        keypoints,
        jointData,
        jointName,
        invert: jointConfig.invert,
        velocityHistorySize: jointVelocityHistorySizeRef.current,
        angleHistorySize: jointAngleHistorySizeRef.current,
        withVelocity: visibleKinematicsRef.current.includes(Kinematics.ANGULAR_VELOCITY),
        mirror: videoConstraintsRef.current.facingMode === "user",
        drawVelocity: !videoProcessed,
      });
      jointDataRef.current[jointName] = updatedData;
  
      if (videoRef.current && !videoProcessedRef.current) {
        // Almacenamos el dato actualizado en recordedPositionsRef.
        if (!recordedPositionsRef.current[jointName]) {
          recordedPositionsRef.current[jointName] = [];
        }
        recordedPositionsRef.current[jointName]!.push({
          timestamp: videoRef.current!.currentTime * 1000, // updatedData.lastTimestamp,
          angle: updatedData.angle,
          angularVelocity: updatedData.angularVelocity,
          color: updatedData.color
        });
      }
    });
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

      setVideoProcessed(false);

      togglePlayback({restart: true});
    }
  }, [processVideo]);

  useEffect(() => {
    if (videoUrl === null) {
      recordedPositionsRef.current = {};

      setVideoProcessed(false);

      setDisplayGraphs(false);
    }
  }, [videoUrl]);

  useEffect(() => {
    videoProcessedRef.current = videoProcessed;
  }, [videoProcessed])
  
  useEffect(() => {
    jointVelocityHistorySizeRef.current = settings.pose.velocityHistorySize;
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
      setIsPoseSettingsModalOpen(false);

      if (!videoUrl) {
        setIsFrozen(false);
      }
    } else {
      setIsPoseGraphSettingsModalOpen(false);
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
  
    const scaleFactor = getCanvasScaleFactor({ 
      canvas: canvasRef.current, 
      video: videoElement 
    });
  
    if (referenceScaleRef.current === null) {
      referenceScaleRef.current = scaleFactor;
    }
    const referenceScale = referenceScaleRef.current ?? 1;
  
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
          ctx,
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

          if (referenceScaleRef.current === null) {
            referenceScaleRef.current = scaleFactor;
          }
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
              updateMultipleJoints({ctx, keypoints, jointNames: visibleJointsRef.current, jointDataRef, jointConfigMap});
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
    setVideoCurrentTime(e.currentTarget.currentTime);
  };

  useEffect(() => {
    if (isSeekingFromChart.current) {
      // Acaba de cambiar por un click en el gráfico, no hagas nada extra
      isSeekingFromChart.current = false;
      return;
    }
  }, [videoCurrentTime]);

  return (
    <>
      {(!detector && !videoReady) ? (
          <div className="fixed w-full h-dvh z-50 text-white bg-black/80 flex flex-col items-center justify-center gap-4">
            <p>{(!videoReady && detector) ? "Initializing camera..." : "Setting up Tensorflow..."}</p>
            {(!videoReady && detector) ? 
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
          className={`absolute z-10 inset-x-0 mx-auto w-[50vw] text-center text-xl text-white bg-black/40 
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
            onUserMedia={() => setVideoReady(true)}
            />
        )}
        <canvas 
          ref={canvasRef} 
          className={`absolute object-cover h-full w-full`} 
          onClick={handleClickOnCanvas}/>

        {(!videoUrl || (videoProcessed || videoRef.current?.paused)) && (
          <>
            <section 
              data-element="non-swipeable"
              className="absolute top-1 left-1 z-10 p-2 flex flex-col justify-between gap-6 bg-black/40 rounded-full">
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
                    <p className="absolute top-[60%] -right-1 bg-black/80 rounded-[0.2rem] px-[0.2rem] py-0 text-white text-xs text-center">
                      {(recording ? estimatedFps : undefined) ?? "FPS"}
                    </p>
                  </div>
                  <>
                    <ArrowUpTrayIcon 
                      className={`h-6 w-6 cursor-pointer ${
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
                  className="h-6 w-6 text-red-500 cursor-pointer"
                  onClick={handleRemoveRecord}
                  />
              )}
              {videoUrl && (
                <CubeTransparentIcon 
                  className={`h-6 w-6 text-white cursor-pointer ${
                    (!isFrozen && videoProcessed) ? "opacity-40" : ""
                  }`}
                  onClick={() => (isFrozen || !videoProcessed) && handleProcessVideo()}
                  />
              )}
              {((videoUrl && videoProcessed) || !videoUrl) && (
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
              className="absolute top-1 right-1 p-2 z-10 flex flex-col justify-between gap-6 bg-black/40 rounded-full"
              >
              <div 
                className={`relative cursor-pointer ${
                  recording ? 'opacity-40' : ''
                }`}
                onClick={() => !recording && toggleCamera()}
                >
                <CameraIcon 
                  className={`h-6 w-6 text-white cursor-pointer`}
                  />
                <ArrowPathIcon className="absolute top-[60%] -right-1 h-4 w-4 bg-black/80 rounded-full p-[0.1rem]"/>
              </div>
              <UserIcon 
                className={`h-6 w-6 text-white cursor-pointer  ${
                  recording ? 'opacity-40' : ''
                }`}
                onClick={() => !recording && handlePoseModal()}
                />
              {maxKinematicsAllowed > 1 && (
                <p 
                  className={`h-6 w-6 text-white text-center  cursor-pointer lowercase ${
                    visibleKinematics.length > 1 ? 'leading-[110%] border-2 rounded-full p-[0.1rem] animate-pulse' : 'text-[2rem] leading-6'
                  } ${
                    recording ? 'opacity-40' : ''
                  }`}
                  onClick={() => !recording && handleKinematicsSelection(Kinematics.ANGULAR_VELOCITY)}
                  >v̅</p>
              )}
              <Cog6ToothIcon 
                className={`h-6 w-6 text-white cursor-pointer ${
                  recording ? 'opacity-40' : ''
                }`}
                onClick={() => !recording && handleSettingsModal({})}
                />
            </section>
          </>
        )}
        {videoUrl && (
          <section 
            data-element="non-swipeable"
            className="absolute bottom-2 z-10 flex gap-4 bg-black/40 rounded-full p-2"
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
        )}

        <PoseSettingsModal 
          isModalOpen={isPoseSettingsModalOpen}
          />
      </div> 

      <PoseModal 
        isModalOpen={isPoseModalOpen} 
        handleModal={handlePoseModal} 
        jointOptions={jointOptions}
        maxSelected={maxJointsAllowed }
        initialSelectedJoints={settings.pose.selectedJoints} 
        onSelectionChange={handleJointSelection} 
        />

      {displayGraphs && (
        <>
          <PoseGraph 
            joints={settings.pose.selectedJoints}
            valueTypes={visibleKinematics}
            getDataForJoint={(joint) => {
              const data = jointDataRef.current[joint];
                return data
                  ? { 
                      timestamp: data.lastTimestamp, 
                      angle: data.angle, 
                      angularVelocity: data.angularVelocity ,
                      color: data.color
                    }
                  : null;
            }}
            recordedPositions={videoProcessed ? recordedPositionsRef.current : undefined}
            onPointClick={handleChartValueX}
            onVerticalLineChange={handleChartValueX}
            verticalLineValue={videoCurrentTime}
            parentStyles="relative z-0 h-[50dvh]"
            />

          <PoseGraphSettingsModal 
            isModalOpen={isPoseGraphSettingsModalOpen}
            videoProcessed={videoProcessed}
            />
        </>
      )}

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
