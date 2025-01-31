"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import Webcam from "react-webcam"; // Importación del convertidor de modelos
import * as poseDetection from "@tensorflow-models/pose-detection";
import { useTensorFlow } from "../hooks/useTensorFlow";
import { JointAngleDataMap, JointConfigMap, Keypoint, KeypointData, PoseSettings } from "@/interfaces/pose";
import { drawKeypointConnections, drawKeypoints } from "@/utils/drawUtils";
import { updateKeypointVelocity } from "@/utils/keypointUtils";
import { updateJoint } from "@/utils/jointUtils";
import { JointSelector } from "./JointSelector";
import { ThresholdSelector } from "./ThresholdSelector";
// import { load as cocoSSDLoad } from '@tensorflow-models/coco-ssd'

interface VideoConstraints {
  facingMode: "user" | "environment";
}

export const PoseDetector = () => {
  const [detector, setDetector] = useState<poseDetection.PoseDetector | null>( null);

  const [videoConstraints, setVideoConstraints] = useState<VideoConstraints>({
    facingMode: "user",
  });

  const [settings, setSettings] = useState<PoseSettings>({ scoreThreshold: 0.3 });
  const [selectedKeypoint, setSelectedKeypoint] = useState<Keypoint | null>(null);
  const [jointVelocityHistorySize, setJointVelocityHistorySize] = useState(5);
  const [jointAngleHistorySize, setJointAngleHistorySize] = useState(5);

  const [visibleJoints, setVisibleJoints] = useState<Keypoint[]>([]);

  const jointVelocityHistorySizeRef = useRef(jointVelocityHistorySize);
  const jointAngleHistorySizeRef = useRef(jointAngleHistorySize);
  
  const selectedKeypointRef = useRef(selectedKeypoint);
  const jointAngleDataRef = useRef<JointAngleDataMap>({});
  const keypointDataRef = useRef<KeypointData | null>(null);

  const visibleJointsRef = useRef(visibleJoints);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webcamRef = useRef<Webcam>(null);

  const isTfReady = useTensorFlow();

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

  const toggleCamera = useCallback(() => {
    setVideoConstraints((prev) => ({
      facingMode: prev.facingMode === "user" ? "environment" : "user",
    }));
  }, []);

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

  const updateMultipleJoints = (
    ctx: CanvasRenderingContext2D,
    keypoints: poseDetection.Keypoint[],
    jointNames: Keypoint[],
    jointAngleDataRef: RefObject<JointAngleDataMap>,
    jointConfigMap: JointConfigMap
  ) => {
    jointNames.forEach((jointName) => {
      const jointConfig = jointConfigMap[jointName] ?? { invert: false };

      const jointAngleData = jointAngleDataRef.current[jointName] ?? null;

      jointAngleDataRef.current[jointName] = updateJoint({
        ctx,
        keypoints,
        jointAngleData,
        jointName,
        invert: jointConfig.invert,
        velocityHistorySize: jointVelocityHistorySizeRef.current,
        angleHistorySize: jointAngleHistorySizeRef.current,
      });
    });
  };

  const handleJointSelection = (selectedJoints: string[]) => {
    setVisibleJoints(selectedJoints as Keypoint[]);
  };

  // Sincronizar los valores en los refs
  useEffect(() => {
    selectedKeypointRef.current = selectedKeypoint;
    jointVelocityHistorySizeRef.current = jointVelocityHistorySize;
    jointAngleHistorySizeRef.current = jointAngleHistorySize;
  }, [selectedKeypoint, jointVelocityHistorySize, jointAngleHistorySize]);

  useEffect(() => {
    visibleJointsRef.current = visibleJoints;
  }, [visibleJoints])

  useEffect(() => {
    const initializeDetector = async () => {
      if (!isTfReady) return;

      const detectorInstance = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
          minPoseScore: 0.3,
        }
      );
      setDetector(detectorInstance);
    };

    initializeDetector();
  }, [isTfReady]);

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
                (kp) => kp.score && kp.score > settings.scoreThreshold
              );

              // Mostrar velocidad en píxeles de un keypoint seleccionado (virtual)
              keypointDataRef.current = updateKeypointVelocity(
                keypoints,
                selectedKeypointRef.current,
                keypointDataRef.current,
                jointVelocityHistorySizeRef.current,
                2 // Umbral opcional para ignorar fluctuaciones pequeñas
              );

              // Dibujar keypoints en el canvas
              drawKeypoints(ctx, keypoints, selectedKeypoint, keypointDataRef.current);

              // Dibujar conexiones entre puntos clave
              drawKeypointConnections(ctx, keypoints, keypointPairs);

              // Calcular ángulo entre tres keypoints
              updateMultipleJoints(ctx, keypoints, visibleJointsRef.current, jointAngleDataRef, jointConfigMap);
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
    <div className="relative w-full flex flex-col items-center justify-center h-screen">
      <Webcam
        ref={webcamRef}
        className="w-full relative"
        videoConstraints={videoConstraints}
        muted
      />
      <canvas ref={canvasRef} className="absolute w-full" />

      <button
        className="absolute bottom-8 w-16 aspect-square bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 active:bg-red-700 transition"
        onClick={toggleCamera}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="size-8"
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

      <ThresholdSelector
        title="Angle"
        value={jointAngleHistorySize}
        onChange={(value) => handleAngularHistorySizeChange(value)}
        parentStyles="absolute bottom-8 ml-[10rem] text-lg font-medium text-gray-700"
      />

      <ThresholdSelector
        title="Velocity"
        value={jointVelocityHistorySize}
        onChange={(value) => handleVelocityHistorySizeChange(value)}
        parentStyles="absolute bottom-8 ml-[19rem] text-lg font-medium text-gray-700"
      />

      <div className="absolute bottom-8 -ml-36 mt-2 text-lg font-medium text-gray-700"><p>Model</p><p className="p-[0.4rem] pl-0 text-[1.4em] mt-[0.3em]">{detector ? "✅" : "⏳"}</p></div>

      <JointSelector parentStyles="absolute bottom-8 -ml-[19rem]" onSelectionChange={handleJointSelection} />
    </div>
  );
};
