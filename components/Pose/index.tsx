"use client";

import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Webcam from "react-webcam"; // Importación del convertidor de modelos
import * as poseDetection from "@tensorflow-models/pose-detection";
import { JointDataMap, JointConfigMap, CanvasKeypointName, CanvasKeypointData, PoseSettings, Kinematics, JointColors } from "@/interfaces/pose";
import { drawKeypointConnections, drawKeypoints } from "@/services/draw";
import { updateJoint } from "@/services/joint";
import PoseGraph from "./Graph";
import { VideoConstraints } from "@/interfaces/camera";
import { usePoseDetector } from "@/providers/PoseDetector";
import { ChevronDoubleDownIcon, CameraIcon, PresentationChartBarIcon, UserIcon, Cog6ToothIcon, DevicePhoneMobileIcon, VideoCameraIcon, TrashIcon, CubeTransparentIcon, CloudArrowDownIcon } from "@heroicons/react/24/solid";
import { BackwardIcon, ForwardIcon } from "@heroicons/react/24/outline";
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
  const [estimatedFps, setEstimatedFps] = useState<number | null>(null);
  const [processVideo, setProcessVideo] = useState(0);
  const [videoProcessed, setVideoProcessed] = useState(false);
  const videoProcessedRef = useRef(videoProcessed);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  
  const [poseSettings] = useState<PoseSettings>({ scoreThreshold: 0.3 });
  
  const [visibleKinematics, setVisibleKinematics] = useState<Kinematics[]>([Kinematics.ANGLE]);
  const [displayGraphs, setDisplayGraphs] = useState(false);
  
  const [isPoseModalOpen, setIsPoseModalOpen] = useState(false);
  const [isPoseSettingsModalOpen, setIsPoseSettingsModalOpen] = useState(false);
  const [isPoseGraphSettingsModalOpen, setIsPoseGraphSettingsModalOpen] = useState(false);
  
  const jointVelocityHistorySizeRef = useRef(settings.velocityHistorySize);
  const jointAngleHistorySizeRef = useRef(settings.angularHistorySize);
  
  const jointDataRef = useRef<JointDataMap>({});
  const keypointDataRef = useRef<CanvasKeypointData | null>(null);
  
  const visibleJointsRef = useRef(settings.selectedJoints);
  const visibleKinematicsRef = useRef(visibleKinematics);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webcamRef = useRef<Webcam>(null);
  const videoConstraintsRef = useRef(videoConstraints);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
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

  const handleClickOnCanvas = () => {
    if (videoProcessed && videoUrl) {
      togglePlayback();
    }

    setIsPoseSettingsModalOpen(false);

    setIsPoseGraphSettingsModalOpen(false);
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

  const handleSettingsModal = () => {
    if (displayGraphs) {
      setIsPoseGraphSettingsModalOpen((prev) => !prev);
    } else {
      setIsPoseSettingsModalOpen((prev) => !prev);
    }
  }

  const handleStartRecording = async () => {
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
    setTimeout(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        handleStopRecording();
      }
    }, 10000);
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

      setIsPoseModalOpen(true);
    }
  };

  const handleProcessVideo = () => {
    if (visibleJointsRef.current.length > 0 && videoRef.current) {  
      setProcessVideo((prev) => prev * (-1));
    } else {
      setIsPoseModalOpen(true);
    }
  }

  const togglePlayback = (restart: boolean = false) => {
    if (videoRef.current) {
      if (restart) {
        videoRef.current.currentTime = 0;
      }

      if (videoRef.current.paused) {
        videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    }
  };

  const handleEnded = () => {
    if (!videoProcessed) {
      setVideoProcessed(true);
    }
  };

  const handleChartValueX = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
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
      });
      jointDataRef.current[jointName] = updatedData;
  
      if (videoRef.current && !videoProcessedRef.current) {
        // Almacenamos el dato actualizado en recordedPositionsRef.
        if (!recordedPositionsRef.current[jointName]) {
          recordedPositionsRef.current[jointName] = [];
        }
        recordedPositionsRef.current[jointName]!.push({
          timestamp: updatedData.lastTimestamp,
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
      handlePreview();
    }
  }, [capturedChunks, recording]);

  useEffect(() => {    
    if (videoRef.current) {
      setDisplayGraphs(false);

      setVideoProcessed(false);

      recordedPositionsRef.current = {};

      togglePlayback(true);
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
    if (!detector || (videoUrl ? !videoRef.current : !webcamRef.current)) return;

    const analyzeFrame = async () => {
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

          if (poses.length > 0) {
            const ctx = canvasRef.current.getContext("2d");

            if (ctx) {
              ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

              // Filtrar keypoints con score mayor a scoreThreshold
              const keypoints = poses[0].keypoints.filter(
                (kp) => kp.score && kp.score > poseSettings.scoreThreshold
              );

              // Dibujar keypoints en el canvas
              drawKeypoints({ctx, keypoints, mirror: videoConstraintsRef.current.facingMode === "user"});

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

  }, [detector, videoUrl]);

  useEffect(() => {
    showMyWebcam();
  }, []);

  return (
    <>
      {
        !detector && (
          <div className="fixed w-full h-dvh z-50 text-white bg-black/80 flex flex-col items-center justify-center gap-4">
            <CloudArrowDownIcon className="w-8 h-8 animate-bounce"/>
            <p>Setting up...</p>
          </div>
        )
      }
      <div className={`relative z-10 flex flex-col items-center justify-start ${displayGraphs ? "h-[50dvh]" : "h-dvh"}`}>
        {
          !videoUrl && (
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
          videoUrl && (
            <video 
              ref={videoRef}
              src={videoUrl}               
              className={`relative object-cover h-full w-full ${videoConstraints.facingMode === "user" ? 'scale-x-[-1]' : 'scale-x-[1]'}`}
              onTimeUpdate={(e: React.SyntheticEvent<HTMLVideoElement, Event>) => setVideoCurrentTime(e.currentTarget.currentTime)}
              onEnded={handleEnded}
              />
          )
        }
        <canvas 
          ref={canvasRef} 
          className={`absolute object-cover h-full w-full`} 
          onClick={handleClickOnCanvas}/>
        {
          (!videoUrl || (videoProcessed || videoRef.current?.paused)) && (
            <>
              <section 
                data-element="non-swipeable"
                className="absolute top-1 left-1 z-10 p-2 flex flex-col justify-between gap-6 bg-black/40 rounded-full">
                <DevicePhoneMobileIcon 
                  className="h-6 w-6 text-white cursor-pointer rotate-90" 
                  onClick={() => navigateTo('strength')}
                />
                {
                  !videoUrl && (
                    <div 
                      className="relative cursor-pointer"
                      onClick={recording ? handleStopRecording : handleStartRecording}
                    >
                      <VideoCameraIcon 
                        className={`h-6 w-6 cursor-pointer ${recording ? 'text-green-500 animate-pulse ' : 'text-white'}`}
                      />
                      <p className="absolute top-[60%] bg-black/40 rounded-[0.2rem] px-[0.2rem] py-0 text-white text-xs text-center">
                        {(recording ? estimatedFps : undefined) ?? "FPS"}
                      </p>
                    </div>
                  )
                }
                {
                  videoUrl && (
                    <TrashIcon 
                      className="h-6 w-6 text-red-500 cursor-pointer"
                      onClick={handleRemoveRecord}
                    />
                  )
                }
                {
                  videoUrl && (
                    <CubeTransparentIcon 
                      className="h-6 w-6 text-white cursor-pointer"
                      onClick={handleProcessVideo}
                    />
                  )
                }
                {
                  ((videoUrl && videoProcessed) || !videoUrl) && (
                    <PresentationChartBarIcon 
                      data-element="non-swipeable"
                      className="h-6 w-6 text-white cursor-pointer" 
                      onClick={handleGrahpsVisibility}
                    />
                  )
                }
              </section>
              <section 
                data-element="non-swipeable"
                className="absolute top-1 right-1 p-2 z-10 flex flex-col justify-between gap-6 bg-black/40 rounded-full"
              >
                <CameraIcon 
                  className="h-6 w-6 text-white cursor-pointer" 
                  onClick={toggleCamera}
                />
                <UserIcon 
                  className="h-6 w-6 text-white cursor-pointer" 
                  onClick={handlePoseModal}
                />
                { 
                  maxKinematicsAllowed > 1 && (
                    <ChevronDoubleDownIcon 
                      className={`h-6 w-6 text-white cursor-pointer ${visibleKinematics.length > 1 ? 'border-2 rounded-full p-[0.1rem] animate-pulse' : ''}`}
                      onClick={() => handleKinematicsSelection(Kinematics.ANGULAR_VELOCITY)}
                    />
                  )
                }
                <Cog6ToothIcon 
                  className="h-6 w-6 text-white cursor-pointer"
                  onClick={handleSettingsModal}
                />
              </section>
            </>
          )
        }
        {
          videoUrl && (
            <section 
              data-element="non-swipeable"
              className="absolute bottom-2 z-10 flex gap-4 bg-black/40 rounded-full p-2"
              >
                {
                  videoProcessed && (
                    <>
                      <BackwardIcon 
                        className="h-8 w-8 text-white cursor-pointer"
                        onClick={rewindStep}/>
                        <p className="flex items-center text-white">{ videoCurrentTime.toFixed(2) } s</p>
                      <ForwardIcon 
                        className="h-8 w-8 text-white cursor-pointer"
                        onClick={forwardStep}/>
                    </>
                  )
                }
                {
                  (!videoProcessed && !videoRef.current?.paused) && (
                    <CubeTransparentIcon className="w-8 h-8 text-white animate-spin"/>
                  )
                }
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
              recordedPositions={videoProcessed ? recordedPositionsRef.current : undefined}
              onPointClick={handleChartValueX}
              onVerticalLineChange={handleChartValueX}
              verticalLineValue={videoCurrentTime}
              parentStyles="relative z-0 h-[50dvh]"
              />

            <PoseGraphSettingsModal 
              isModalOpen={isPoseGraphSettingsModalOpen}
              handleModal={handleSettingsModal}
              videoProcessed={videoProcessed}
              />
          </>
        )
      }
    </>
  );
};

export default Index;
