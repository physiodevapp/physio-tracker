"use client";

import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Webcam from "react-webcam"; // Importación del convertidor de modelos
import * as poseDetection from "@tensorflow-models/pose-detection";
import { JointDataMap, JointConfigMap, Keypoint, KeypointData, PoseSettings, Kinematics } from "@/interfaces/pose";
import { drawKeypointConnections, drawKeypoints } from "@/services/draw";
import { updateKeypointVelocity } from "@/services/keypoint";
import { updateJoint } from "@/services/joint";
import { DropdwonSelector } from "../../components/DropdownSelector";
import { CheckboxSelector } from "../../components/CheckboxSelector";
import { DisplayGraphsButton } from "../../components/DisplayGraphsButton";
import { RealTimeGraph } from "../../components/RealTimeGraph";
import { VideoConstraints } from "@/interfaces/camera";
import { usePoseDetector } from "@/providers/PoseDetectorContext";

const PoseDetector = () => {
  const [videoConstraints, setVideoConstraints] = useState<VideoConstraints>({
    facingMode: "user",
  });

  const [poseSettings] = useState<PoseSettings>({ scoreThreshold: 0.3 });
  const [selectedKeypoint] = useState<Keypoint | null>(null);
  const [jointVelocityHistorySize, setJointVelocityHistorySize] = useState(5);
  const [jointAngleHistorySize, setJointAngleHistorySize] = useState(5);

  const [visibleJoints, setVisibleJoints] = useState<Keypoint[]>([]);
  const [visibleKinematics, setVisibleKinematics] = useState<Kinematics[]>([]);
  const [displayGraphs, setDisplayGraphs] = useState(false);

  const jointVelocityHistorySizeRef = useRef(jointVelocityHistorySize);
  const jointAngleHistorySizeRef = useRef(jointAngleHistorySize);
  
  const selectedKeypointRef = useRef(selectedKeypoint);
  const jointDataRef = useRef<JointDataMap>({});
  const keypointDataRef = useRef<KeypointData | null>(null);

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

  const keypointPairs: [Keypoint, Keypoint][] = [
    [Keypoint.LEFT_SHOULDER, Keypoint.RIGHT_SHOULDER],
    [Keypoint.LEFT_SHOULDER, Keypoint.LEFT_ELBOW],
    [Keypoint.LEFT_ELBOW, Keypoint.LEFT_WRIST],
    [Keypoint.RIGHT_SHOULDER, Keypoint.RIGHT_ELBOW],
    [Keypoint.RIGHT_ELBOW, Keypoint.RIGHT_WRIST],
    [Keypoint.LEFT_HIP, Keypoint.RIGHT_HIP],
    [Keypoint.LEFT_HIP, Keypoint.LEFT_KNEE],
    [Keypoint.LEFT_KNEE, Keypoint.LEFT_ANKLE],
    [Keypoint.RIGHT_HIP, Keypoint.RIGHT_KNEE],
    [Keypoint.RIGHT_KNEE, Keypoint.RIGHT_ANKLE],
  ];

  const jointConfigMap: JointConfigMap = {
    [Keypoint.RIGHT_ELBOW]: { invert: true },
    [Keypoint.RIGHT_SHOULDER]: { invert: false },
    [Keypoint.RIGHT_HIP]: { invert: false },
    [Keypoint.RIGHT_KNEE]: { invert: true },
    [Keypoint.LEFT_ELBOW]: { invert: true },
    [Keypoint.LEFT_SHOULDER]: { invert: false },
    [Keypoint.LEFT_HIP]: { invert: false },
    [Keypoint.LEFT_KNEE]: { invert: true },
  };

  const jointOptions = [
    { label: "Right Shoulder", value: Keypoint.RIGHT_SHOULDER },
    { label: "Left Shoulder", value: Keypoint.LEFT_SHOULDER },
    { label: "Right Elbow", value: Keypoint.RIGHT_ELBOW },
    { label: "Left Elbow", value: Keypoint.LEFT_ELBOW },
    { label: "Right Hip", value: Keypoint.RIGHT_HIP },
    { label: "Left Hip", value: Keypoint.LEFT_HIP },
    { label: "Right Knee", value: Keypoint.RIGHT_KNEE },
    { label: "Left Knee", value: Keypoint.LEFT_KNEE },
  ];

  const kinematicOptions = [
    { label: "Angle", value: Kinematics.ANGLE, defaultChecked: true, disabled: true },
    { label: "Angular velocity", value: Kinematics.ANGULAR_VELOCITY },
  ];

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

  const handleJointSelection = (selectedJoints: string[]) => {
    setVisibleJoints(selectedJoints as Keypoint[]);
  };

  const handleKinematicsSelection = (selectedCinematics: string[]) => {
    setVisibleKinematics(selectedCinematics as Kinematics[]);
  };

  const handleGrahpsVisibility = (isVisible: boolean) => {
    setDisplayGraphs(isVisible);
  };

  const updateMultipleJoints = (
    ctx: CanvasRenderingContext2D,
    keypoints: poseDetection.Keypoint[],
    jointNames: Keypoint[],
    jointAngleDataRef: RefObject<JointDataMap>,
    jointConfigMap: JointConfigMap
  ) => {
    if (!visibleJointsRef.current.length) return; 

    jointNames.forEach((jointName) => {
      const jointConfig = jointConfigMap[jointName] ?? { invert: false };

      const jointData = jointAngleDataRef.current[jointName] ?? null;

      jointAngleDataRef.current[jointName] = updateJoint({
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

              if (jointOptions.length > 0) {

              }
              
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

  return (
    <>
      <div className={`relative z-0 w-full flex flex-col items-center justify-center ${displayGraphs ? "h-[50vh]" : "h-screen"}`}>
        <Webcam
          ref={webcamRef}
          className="w-full relative"
          videoConstraints={videoConstraints}
          muted
          mirrored={videoConstraints.facingMode === "user"}
        />
        <canvas ref={canvasRef} className="absolute w-full" />

        <div className="absolute top-2 right-1 p-[0.2rem] text-[1.4rem] font-medium text-gray-700"><p>{detector ? "✅" : "⏳"}</p></div>

        <DisplayGraphsButton 
          onVisibilityChange={handleGrahpsVisibility} 
          parentStyles="absolute top-2 right-[3rem] p-2 bg-transparent text-black rounded flex items-center space-x-2"
          />
      </div> 

      <button
        className="absolute top-[0.6rem] left-[0.6rem] w-10 aspect-square bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 active:bg-red-700 transition"
        onClick={toggleCamera}
        disabled={false}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-6 h-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"
          />
        </svg>
      </button>

      <div className="fixed z-10 bottom-1 flex flex-row justify-center items-center gap-[0.6rem] h-[6rem] left-0 right-0 px-6">
        <CheckboxSelector
          items={jointOptions}
          onSelectionChange={handleJointSelection}
          headerText="Marks"
          buttonLabel="Joints"
          maxSelected={maxJointsAllowed}
          />

        <CheckboxSelector
          items={kinematicOptions}
          onSelectionChange={handleKinematicsSelection}
          headerText="Metrics"
          buttonLabel="A / V"
          maxSelected={maxKinematicsAllowed}
          />

        <DropdwonSelector
          title="Angle"
          value={jointAngleHistorySize}
          onChange={(value) => handleAngularHistorySizeChange(value)}
        />

        <DropdwonSelector
          title="Velocity"
          value={jointVelocityHistorySize}
          onChange={(value) => handleVelocityHistorySizeChange(value)}
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
                ? { timestamp: data.lastTimestamp, angle: data.angle, angularVelocity: data.angularVelocity }
                : null;
            }}
            timeWindow={10000}
            updateInterval={250}
            maxPoints={50}
            parentStyles="z-0 h-[calc(50vh-10rem)]"
            />
        )
      }
    </>
  );
};

export default PoseDetector;
