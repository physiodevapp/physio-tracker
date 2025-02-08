"use client";

import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Webcam from "react-webcam"; // Importación del convertidor de modelos
import * as poseDetection from "@tensorflow-models/pose-detection";
import { JointDataMap, JointConfigMap, CanvasKeypointName, CanvasKeypointData, PoseSettings, Kinematics } from "@/interfaces/pose";
import { drawKeypointConnections, drawKeypoints } from "@/services/draw";
import { updateKeypointVelocity } from "@/services/keypoint";
import { updateJoint } from "@/services/joint";
import PoseGraph from "../PoseGraph";
import { VideoConstraints } from "@/interfaces/camera";
import { usePoseDetector } from "@/providers/PoseDetector";
import { ChevronDoubleDownIcon, CameraIcon, PresentationChartBarIcon, UserIcon, Cog6ToothIcon, DevicePhoneMobileIcon, VideoCameraIcon, XMarkIcon, PlayPauseIcon, PlayIcon, PauseIcon } from "@heroicons/react/24/solid";
import { ArrowPathIcon, BackwardIcon, ForwardIcon } from "@heroicons/react/24/outline";
import { useSettings } from "@/providers/Settings";
import PoseModal from "@/modals/Pose";
import PoseGraphSettingsModal from "@/modals/PoseGraphSettings";
import PoseSettingsModal from "@/modals/PoseSettings";

interface IndexProps {
  navigateTo: (path: 'pose' | 'strength') => void;
}

const Index = ({ navigateTo }: IndexProps) => {
  const { settings, setSelectedJoints } = useSettings();

  const [videoConstraints, setVideoConstraints] = useState<VideoConstraints>({
    facingMode: "user",
  });

  const [recording, setRecording] = useState(false);
  const [capturedChunks, setCapturedChunks] = useState<Blob[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [estimatedFps, setEstimatedFps] = useState<number | null>(null);
  const [supportedMediaRecorderType, setSupportedMediaRecorderType] = useState<string>("");
  
  const [poseSettings] = useState<PoseSettings>({ scoreThreshold: 0.3 });
  const [selectedKeypoint] = useState<CanvasKeypointName | null>(null);
  
  const [visibleKinematics, setVisibleKinematics] = useState<Kinematics[]>([Kinematics.ANGLE]);
  const [displayGraphs, setDisplayGraphs] = useState(false);
  
  const [isPoseModalOpen, setIsPoseModalOpen] = useState(false);
  const [isPoseSettingsModalOpen, setIsPoseSettingsModalOpen] = useState(false);
  const [isPoseGraphSettingsModalOpen, setIsPoseGraphSettingsModalOpen] = useState(false);
  
  const jointVelocityHistorySizeRef = useRef(settings.velocityHistorySize);
  const jointAngleHistorySizeRef = useRef(settings.angularHistorySize);
  
  const selectedKeypointRef = useRef(selectedKeypoint);
  const jointDataRef = useRef<JointDataMap>({});
  const keypointDataRef = useRef<CanvasKeypointData | null>(null);
  
  const visibleJointsRef = useRef(settings.selectedJoints);
  const visibleKinematicsRef = useRef(visibleKinematics);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webcamRef = useRef<Webcam>(null);
  const videoConstraintsRef = useRef(videoConstraints);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const toggleCamera = useCallback(() => {
    setVideoConstraints((prev) => ({
      facingMode: prev.facingMode === "user" ? "environment" : "user",
    }));
  }, []);

  const maxJointsAllowed = useMemo(() => {
    return visibleKinematics.length === 2 ? 3 : 6;
  }, [visibleKinematics]);
  
  const maxKinematicsAllowed = useMemo(() => {
    return settings.selectedJoints.length > 0 ? Math.floor(6 / settings.selectedJoints.length) : 2;
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

  const handleSettingsModal = () => {
    console.log('object -> ', displayGraphs);
    if (displayGraphs) {
      setIsPoseGraphSettingsModalOpen((prev) => !prev);
    } else {
      setIsPoseSettingsModalOpen((prev) => !prev);
    }
  }

  const handleStartRecording = async () => {
    setVideoUrl(null);

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
    setSupportedMediaRecorderType(recorderType);

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
  
  const handlePreview = () => {
    if (capturedChunks.length) {
      const blob = new Blob(capturedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
    }
  };

  const togglePlayback = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
  };

  const rewindStep = () => {
    if (videoRef.current && estimatedFps) {
      const stepTime = 1 / estimatedFps;

      videoRef.current.currentTime = Math.max(videoRef.current.currentTime - stepTime, 0);
    }
  };

  const forwardStep = () => {
    if (videoRef.current && estimatedFps) {
      const stepTime = 1 / estimatedFps;

      videoRef.current.currentTime = Math.min(videoRef.current.currentTime + stepTime, videoRef.current.duration);
    }
  };

  const handleRemoveRecord = () => {
    setShowVideo(false);

    setVideoUrl(null);
  };

  const updateMultipleJoints = (
    ctx: CanvasRenderingContext2D,
    keypoints: poseDetection.Keypoint[],
    jointNames: CanvasKeypointName[],
    jointDataRef: RefObject<JointDataMap>,
    jointConfigMap: JointConfigMap
  ) => {
    if (!visibleJointsRef.current.length) return; 

    jointNames.forEach((jointName) => {
      const jointConfig = jointConfigMap[jointName] ?? { invert: false };

      const jointData = jointDataRef.current[jointName] ?? null;

      jointDataRef.current[jointName] = updateJoint({
        ctx,
        keypoints,
        jointData,
        jointName,
        invert: jointConfig.invert,
        velocityHistorySize: jointVelocityHistorySizeRef.current,
        angleHistorySize: jointAngleHistorySizeRef.current,
        withVelocity: visibleKinematicsRef.current.includes(Kinematics.ANGULAR_VELOCITY),
        mirror: videoConstraintsRef.current.facingMode === "user",
      });
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
      handlePreview();
    }
  }, [capturedChunks, recording]);

  useEffect(() => {
    selectedKeypointRef.current = selectedKeypoint;
  }, [selectedKeypoint]);
  
  useEffect(() => {
    jointVelocityHistorySizeRef.current = settings.velocityHistorySize;
    jointAngleHistorySizeRef.current = settings.angularHistorySize;
    visibleJointsRef.current = settings.selectedJoints;
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
    } else {
      setIsPoseGraphSettingsModalOpen(false);
    }
  }, [displayGraphs]);

  useEffect(() => {
    if (!detector || !webcamRef.current || showVideo) return;

    const analyzeFrame = async () => {
      if (!detector || !webcamRef.current || !canvasRef.current) return;
      
      try {
        // Captura el fotograma actual de la webcam
        const videoElement = webcamRef.current.video;
        
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

          if (poses.length > 0) {
            const ctx = canvasRef.current.getContext("2d");

            if (ctx) {
              ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

              // Filtrar keypoints con score mayor a scoreThreshold
              const keypoints = poses[0].keypoints.filter(
                (kp) => kp.score && kp.score > poseSettings.scoreThreshold
              );
              
              // Mostrar velocidad en píxeles de un keypoint seleccionado (virtual)
              if (selectedKeypointRef.current) {
                keypointDataRef.current = updateKeypointVelocity(
                  keypoints,
                  selectedKeypointRef.current,
                  keypointDataRef.current,
                  jointVelocityHistorySizeRef.current,
                  2 // Umbral opcional para ignorar fluctuaciones pequeñas
                );
              }

              // Dibujar keypoints en el canvas
              drawKeypoints({ctx, keypoints, selectedKeypoint, keypointData: keypointDataRef.current, mirror: videoConstraintsRef.current.facingMode === "user"});

              // Dibujar conexiones entre puntos clave
              drawKeypointConnections({ctx, keypoints, keypointPairs, mirror: videoConstraintsRef.current.facingMode === "user"});

              // Calcular ángulo entre tres keypoints
              updateMultipleJoints(ctx, keypoints, visibleJointsRef.current, jointDataRef, jointConfigMap);
            }
          }
        }

      } catch (error) {
        console.error("Error analyzing frame:", error);
      }
      requestAnimationFrame(analyzeFrame);
    };

    analyzeFrame();

  }, [detector, showVideo]);

  useEffect(() => {
    showMyWebcam();
  }, []);

  return (
    <>
      {
        !detector && (
          <div className="fixed w-full h-dvh z-50 text-white bg-black/80 flex flex-col items-center justify-center gap-4">
            <p>Setting up...</p>
            <ArrowPathIcon className="w-8 h-8 animate-spin"/>
          </div>
        )
      }
      <div className={`relative z-0 flex flex-col items-center justify-start ${displayGraphs ? "h-[50dvh]" : "h-dvh"}`}>
        {
          !showVideo && (
            <Webcam
              ref={webcamRef}
              className={`relative object-cover h-full w-full`}
              videoConstraints={videoConstraints}
              muted
              mirrored={videoConstraints.facingMode === "user"}
              />
          )
        }
        {
          showVideo && videoUrl && (
            <video 
              ref={videoRef}
              src={videoUrl}               
              className={`relative object-cover h-full w-full ${videoConstraints.facingMode === "user" ? 'scale-x-[-1]' : 'scale-x-[1]'}`}
              onEnded={handleEnded}
              />
          )
        }
        <canvas ref={canvasRef} className={`absolute object-cover h-full w-full`} />

        <section className="absolute top-1 left-1 z-10 p-2 flex flex-col justify-between gap-6 bg-black/40 rounded-full">
          <DevicePhoneMobileIcon 
            className="h-6 w-6 text-white cursor-pointer rotate-90" 
            onClick={() => navigateTo('strength')}
            />
          {
            !showVideo && (
              <div>
                <VideoCameraIcon 
                  className={`h-6 w-6 cursor-pointer ${recording ? 'text-red-500 animate-pulse ' : 'text-white'}`}
                  onClick={recording ? handleStopRecording : handleStartRecording}
                  />
                  <p className="text-white text-xs text-center">{estimatedFps ?? "FPS"}</p>
              </div>
            )
          }
          {
            videoUrl && !showVideo && (
              <PlayPauseIcon 
                className="h-6 w-6 text-white cursor-pointer"
                onClick={() => setShowVideo(true)}
                />
            )
          }
          {
            videoUrl && showVideo && (
              <XMarkIcon 
                className="h-6 w-6 text-white cursor-pointer"
                onClick={handleRemoveRecord}
                />
            )
          }
          <PresentationChartBarIcon 
            className="h-6 w-6 text-white cursor-pointer" 
            onClick={handleGrahpsVisibility}
            />
        </section>
        
        <section className="absolute top-1 right-1 p-2 z-10 flex flex-col justify-between gap-6 bg-black/40 rounded-full">
          <CameraIcon className="h-6 w-6 text-white cursor-pointer" onClick={toggleCamera}/>
          <UserIcon className="h-6 w-6 text-white cursor-pointer" onClick={handlePoseModal}/>
          { 
            maxKinematicsAllowed > 1 && (
              <ChevronDoubleDownIcon 
                className={`h-6 w-6 text-white cursor-pointer ${
                  visibleKinematics.length > 1 ? 'border-2 rounded-full p-[0.1rem] animate-pulse' : ''
                }`} 
                onClick={() => handleKinematicsSelection(Kinematics.ANGULAR_VELOCITY)}
                />
            )
          }
          <Cog6ToothIcon 
            className="h-6 w-6 text-white cursor-pointer"
            onClick={handleSettingsModal}
            />
        </section>
        {
          videoUrl && showVideo && (
            <section className="absolute bottom-2 z-10 flex gap-4 bg-black/40 rounded-full p-2">
              <BackwardIcon 
                className="h-8 w-8 text-white cursor-pointer"
                onClick={rewindStep}/>
              {
                isPlaying
                ? <PauseIcon 
                className="h-8 w-8 text-white cursor-pointer"
                onClick={togglePlayback}
                />
                : <PlayIcon 
                className="h-8 w-8 text-white cursor-pointer"
                onClick={togglePlayback}
                />
              }              
              <ForwardIcon 
                className="h-8 w-8 text-white cursor-pointer"
                onClick={forwardStep}/>
            </section>
          )
        }

        <PoseModal 
          isModalOpen={isPoseModalOpen} 
          handleModal={handlePoseModal} 
          jointOptions={jointOptions}
          maxSelected={maxJointsAllowed }
          initialSelectedJoints={settings.selectedJoints} 
          onSelectionChange={handleJointSelection} 
          />

        <PoseSettingsModal 
          isModalOpen={isPoseSettingsModalOpen}
          handleModal={handleSettingsModal}
          />
      </div> 

      {
        displayGraphs && (
          <>
            <PoseGraph 
              joints={settings.selectedJoints}
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
              maxPoints={50}
              maxPointsThreshold={60}
              parentStyles="z-0 h-[50dvh]"
              />

            <PoseGraphSettingsModal 
              isModalOpen={isPoseGraphSettingsModalOpen}
              handleModal={handleSettingsModal}
              />
          </>
        )
      }
    </>
  );
};

export default Index;
