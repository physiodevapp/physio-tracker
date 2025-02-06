"use client";

import { Fragment, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Webcam from "react-webcam"; // Importación del convertidor de modelos
import * as poseDetection from "@tensorflow-models/pose-detection";
import { JointDataMap, JointConfigMap, CanvasKeypointName, CanvasKeypointData, PoseSettings, Kinematics } from "@/interfaces/pose";
import { drawKeypointConnections, drawKeypoints } from "@/services/draw";
import { updateKeypointVelocity } from "@/services/keypoint";
import { updateJoint } from "@/services/joint";
import { RealTimeGraph } from "../../components/RealTimeGraph";
import { VideoConstraints } from "@/interfaces/camera";
import { usePoseDetector } from "@/providers/PoseDetectorContext";
import { ChevronDoubleDownIcon, CameraIcon, PresentationChartBarIcon, UserIcon } from "@heroicons/react/24/solid";
import PoseModal from "@/modals";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

const PoseDetector = () => {
  const [videoConstraints, setVideoConstraints] = useState<VideoConstraints>({
    facingMode: "user",
  });

  const [poseSettings] = useState<PoseSettings>({ scoreThreshold: 0.3 });
  const [selectedKeypoint] = useState<CanvasKeypointName | null>(null);
  const [jointVelocityHistorySize, setJointVelocityHistorySize] = useState(5);
  const [jointAngleHistorySize, setJointAngleHistorySize] = useState(5);

  const [visibleJoints, setVisibleJoints] = useState<CanvasKeypointName[]>([]);
  const [visibleKinematics, setVisibleKinematics] = useState<Kinematics[]>([Kinematics.ANGLE]);
  const [displayGraphs, setDisplayGraphs] = useState(false);

  const jointVelocityHistorySizeRef = useRef(jointVelocityHistorySize);
  const jointAngleHistorySizeRef = useRef(jointAngleHistorySize);
  
  const selectedKeypointRef = useRef(selectedKeypoint);
  const jointDataRef = useRef<JointDataMap>({});
  const keypointDataRef = useRef<CanvasKeypointData | null>(null);

  const visibleJointsRef = useRef(visibleJoints);
  const visibleKinematicsRef = useRef(visibleKinematics);

  const canvasRef = useRef<HTMLCanvasElement>(null);
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
  
  const maxKinematicsAllowed = useMemo(() => {
    return visibleJoints.length > 0 ? Math.floor(6 / visibleJoints.length) : 2;
  }, [visibleJoints]);
  
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

  const handleAngularHistorySizeChange = (newSize: number) => {
    if (newSize >= 1 && newSize <= 20) {
      setJointAngleHistorySize(newSize);
    }
  };
  
  const handleVelocityHistorySizeChange = (newSize: number) => {
    if (newSize >= 1 && newSize <= 20) {
      setJointVelocityHistorySize(newSize);
    }
  };

  const handleJointSelection = useCallback((selectedJoints: string[]) => {
    setVisibleJoints(selectedJoints as CanvasKeypointName[]);
  }, []);

  const handleKinematicsSelection = (selectedKinematic: Kinematics) => {
    // setVisibleKinematics(selectedKinematics as Kinematics[]);
    setVisibleKinematics((prevKinematics) =>
      prevKinematics.includes(selectedKinematic)
        ? prevKinematics.filter((kinematic) => kinematic !== selectedKinematic)
        : [...prevKinematics, selectedKinematic]
    );
  };

  const handleGrahpsVisibility = () => {
    setDisplayGraphs((prev) =>!prev);
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
    selectedKeypointRef.current = selectedKeypoint;
    jointVelocityHistorySizeRef.current = jointVelocityHistorySize;
    jointAngleHistorySizeRef.current = jointAngleHistorySize;
  }, [selectedKeypoint, jointVelocityHistorySize, jointAngleHistorySize]);

  useEffect(() => {
    visibleJointsRef.current = visibleJoints;
  }, [visibleJoints])

  useEffect(() => {
    visibleKinematicsRef.current = visibleKinematics;
  }, [visibleKinematics])

  useEffect(() => {
    videoConstraintsRef.current = videoConstraints;
  }, [videoConstraints]);

  useEffect(() => {
    if (!detector || !webcamRef.current) return;

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

              // if (jointOptions.length > 0) {

              // }
              
              // Mostrar velocidad en píxeles de un keypoint seleccionado (virtual)
              keypointDataRef.current = updateKeypointVelocity(
                keypoints,
                selectedKeypointRef.current,
                keypointDataRef.current,
                jointVelocityHistorySizeRef.current,
                2 // Umbral opcional para ignorar fluctuaciones pequeñas
              );

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

  }, [detector]);

  useEffect(() => {
    showMyWebcam();
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const handleModal = () => {
    setIsModalOpen((prev) => !prev);
  }

  return (
    <>
      {
        !detector && (
          <div className="fixed w-full h-dvh z-10 text-white bg-black/80 flex flex-col items-center justify-center gap-4">
            <p>Setting up...</p>
            <ArrowPathIcon className="w-8 h-8 animate-spin"/>
          </div>
        )
      }
      <div className={`relative z-0 flex flex-col items-center justify-start ${displayGraphs ? "h-[50dvh]" : "h-dvh"} border border-solid border-red-500`}>
        <Webcam
          ref={webcamRef}
          className="relative object-cover h-full"
          videoConstraints={videoConstraints}
          muted
          mirrored={videoConstraints.facingMode === "user"}
        />
        <canvas ref={canvasRef} className="absolute object-cover h-full" />

        <section className="absolute top-2 left-0 p-2 flex flex-col justify-between gap-4">
          <CameraIcon className="h-6 w-6 text-white cursor-pointer" onClick={toggleCamera}/>
          <PresentationChartBarIcon className="h-6 w-6 text-white cursor-pointer" onClick={handleGrahpsVisibility}/>
        </section>
        
        <section className="absolute top-2 right-0 p-2 flex flex-col justify-between gap-4">
          <UserIcon className="h-6 w-6 text-white cursor-pointer" onClick={handleModal}/>
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
        </section>

        <PoseModal 
          isModalOpen={isModalOpen} 
          handleModal={handleModal} 
          jointOptions={jointOptions}
          maxSelected={maxJointsAllowed }
          onSelectionChange={handleJointSelection} 
          onAngleSmoothingChange={handleAngularHistorySizeChange}
          onAngularVelocitySmoothingChange={handleVelocityHistorySizeChange}
          />
      </div> 

      {
        displayGraphs && (
          <RealTimeGraph
            joints={visibleJoints}
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
            timeWindow={10000}
            updateInterval={100}
            maxPoints={50}
            maxPointsThreshold={80}
            parentStyles="z-0 h-[50dvh] border border-solid border-green-500"
            />
        )
      }
    </>
  );
};

export default PoseDetector;
