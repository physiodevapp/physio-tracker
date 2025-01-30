"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Webcam from "react-webcam"; // Importación del convertidor de modelos
import * as poseDetection from "@tensorflow-models/pose-detection";
import { useTensorFlow } from "../hooks/useTensorFlow";
// import { load as cocoSSDLoad } from '@tensorflow-models/coco-ssd'

interface PoseSettings {
  scoreThreshold: number;
}

export const PoseDetector = () => {
  const [detector, setDetector] = useState<poseDetection.PoseDetector | null>( null);

  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [settings, setSettings] = useState<PoseSettings>({ scoreThreshold: 0.3 });
  const [selectedKeypoint, setSelectedKeypoint] = useState(null);

  const selectedKeypointRef = useRef(selectedKeypoint);

  const keypointDataRef = useRef<{
    position: { x: number; y: number };
    lastTimestamp: number;
    velocityInPixels: number;
  } | null>(null);
  const velocityHistoryRef = useRef<number[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webcamRef = useRef<Webcam>(null);

  const isTfReady = useTensorFlow();
  const videoConstraints = {
    facingMode: facingMode,
  };

  const keypointPairs: [string, string][] = [
    ['left_shoulder', 'right_shoulder'],
    ['left_shoulder', 'left_elbow'],
    ['left_elbow', 'left_wrist'],
    ['right_shoulder', 'right_elbow'],
    ['right_elbow', 'right_wrist'],
    ['left_hip', 'right_hip'],
    ['left_hip', 'left_knee'],
    ['left_knee', 'left_ankle'],
    ['right_hip', 'right_knee'],
    ['right_knee', 'right_ankle'],
  ];
  
  const calculateAngleDegrees = (A: poseDetection.Keypoint, B: poseDetection.Keypoint, C: poseDetection.Keypoint, invert = false) => {
    // Vectores BA y BC
    const BA = { x: A.x - B.x, y: A.y - B.y };
    const BC = { x: C.x - B.x, y: C.y - B.y };
  
    // Producto punto BA · BC
    const dot = BA.x * BC.x + BA.y * BC.y;
  
    // Magnitudes de BA y BC
    const magBA = Math.sqrt(BA.x ** 2 + BA.y ** 2);
    const magBC = Math.sqrt(BC.x ** 2 + BC.y ** 2);
  
    // Evitar división por cero
    if (magBA === 0 || magBC === 0) {
      return 0;
    }
  
    // Ángulo en radianes
    const angleRad = Math.acos(dot / (magBA * magBC));
    // Convertir a grados
    let angleDeg = (angleRad * 180) / Math.PI;

    if (invert) {
      angleDeg = 180 - angleDeg;
    }
  
    return angleDeg;
  }


  const toggleCamera = useCallback(() => {
    setFacingMode((prevMode) => (prevMode === "user" ? "environment" : "user"));
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

  // Sincronizar los valores en los refs
  useEffect(() => {
    selectedKeypointRef.current = selectedKeypoint;
  }, [selectedKeypoint]);

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
        
        if (videoElement && videoElement.readyState === 4) {
          const poses = await detector.estimatePoses(videoElement, {
            maxPoses: 1,
            flipHorizontal: false,
          });
          
          canvasRef.current.width = videoElement.videoWidth;
          canvasRef.current.height = videoElement.videoHeight;

          if (poses.length > 0) {
            const ctx = canvasRef.current.getContext("2d");

            if (ctx) {
              ctx.clearRect(
                0,
                0,
                canvasRef.current.width,
                canvasRef.current.height
              );

              // Obtener los valores actualizados desde las referencias
              const currentSelectedKeypoint = selectedKeypointRef.current;

              // Filtrar keypoints con score mayor a scoreThreshold
              const keypoints = poses[0].keypoints.filter(
                (kp) => kp.score && kp.score > settings.scoreThreshold
              );

              // Dibujar conexiones entre puntos clave
              ctx.strokeStyle = "white";
              ctx.lineWidth = 2;

              keypointPairs.forEach(([pointA, pointB]) => {
                const kpA = keypoints.find((kp) => kp.name === pointA);
                const kpB = keypoints.find((kp) => kp.name === pointB);

                if (kpA && kpB) {
                  ctx.beginPath();
                  ctx.moveTo(kpA.x, kpA.y);
                  ctx.lineTo(kpB.x, kpB.y);
                  ctx.stroke();
                }
              });

              // Calcular ángulo entre tres keypoints
              const rShoulder = keypoints.find((kp) => kp.name === "right_shoulder");
              const rElbow   = keypoints.find((kp) => kp.name === "right_elbow");
              const rWrist   = keypoints.find((kp) => kp.name === "right_wrist");
              const rHip     = keypoints.find((kp) => kp.name === "right_hip");
              const rKnee    = keypoints.find((kp) => kp.name === "right_knee");
              const rAnkle   = keypoints.find((kp) => kp.name === "right_ankle");

              //-> Ángulo del hombro (Shoulder)
              let shoulderAngle = 0;
              if (rShoulder && rElbow && rHip) {
                shoulderAngle = calculateAngleDegrees(rElbow, rShoulder, rHip);
              }

              //-> Ángulo del codo (Elbow)
              let elbowAngle = 0;
              if (rShoulder && rElbow && rWrist) {
                elbowAngle = calculateAngleDegrees(rShoulder, rElbow, rWrist, true);
              }

              //-> Ángulo de la cadera (Hip)
              let hipAngle = 0;
              if (rShoulder && rHip && rKnee) {
                hipAngle = calculateAngleDegrees(rShoulder, rHip, rKnee);
              }

              //-> Ángulo de la rodilla (Knee)
              let kneeAngle = 0;
              if (rHip && rKnee && rAnkle) {
                kneeAngle = calculateAngleDegrees(rHip, rKnee, rAnkle,true);
              }

              // Dibujar texto con los ángulos en el canvas
              ctx.font = "18px Arial";
              ctx.fillStyle = "yellow";

              if (rShoulder) {
                ctx.fillText(`${shoulderAngle.toFixed(1)}°`, rShoulder.x + 10, rShoulder.y - 10);
              }
              if (rElbow) {
                ctx.fillText(`${elbowAngle.toFixed(1)}°`, rElbow.x + 10, rElbow.y - 10);
              }
              if (rHip) {
                ctx.fillText(`${hipAngle.toFixed(1)}°`, rHip.x + 10, rHip.y - 10);
              }
              if (rKnee) {
                ctx.fillText(`${kneeAngle.toFixed(1)}°`, rKnee.x + 10, rKnee.y - 10);
              }

              // Mostrar velocidad en píxeles de un keypoint seleccionado (virtual)
              let velocity = 0;
              let smoothedVelocity = 0;
              const keypointInPixels = keypoints.find(kp => kp.name === currentSelectedKeypoint);

              if (keypointInPixels) {
                const currentPosition = { x: keypointInPixels.x, y: keypointInPixels.y };
                const currentTimestamp = performance.now();

                if (!keypointDataRef.current) {
                  // Inicializar el estado
                  keypointDataRef.current = {
                    position: currentPosition,
                    lastTimestamp: currentTimestamp,
                    velocityInPixels: 0,
                  };
                } else {
                  // Utiliza valores locales para el cálculo
                  const lastPosition = keypointDataRef.current.position;
                  const lastTimestamp = keypointDataRef.current.lastTimestamp;

                  // Calcular la distancia recorrida desde el último frame
                  const dx = currentPosition.x - lastPosition.x;
                  const dy = currentPosition.y - lastPosition.y;
                  const distance = Math.sqrt(dx * dx + dy * dy);

                  // Umbral para ignorar fluctuaciones pequeñas
                  const movementThreshold = 2; // en píxeles

                  // Calcular el tiempo transcurrido entre frames
                  const deltaTime = (currentTimestamp - lastTimestamp) / 1000;

                  // Calcular la velocidad
                  if (distance > movementThreshold && deltaTime > 0) {
                    velocity = distance / deltaTime;
                  }

                  // Actualizar el historial de velocidades
                  velocityHistoryRef.current.push(velocity);
                  if (velocityHistoryRef.current.length > 5) {
                    velocityHistoryRef.current.shift(); // Mantener las últimas 5 velocidades
                  }

                  // Calcular la media móvil de las últimas velocidades
                  smoothedVelocity =
                  velocityHistoryRef.current.reduce((sum, v) => sum + v, 0) /
                  velocityHistoryRef.current.length;

                  // Actualizar el estado
                  keypointDataRef.current = {
                    position: currentPosition,
                    lastTimestamp: currentTimestamp,
                    velocityInPixels: smoothedVelocity,
                  };
                }
              }

              // Dibujar keypoints en el canvas
              keypoints.forEach((kp) => {
                if (kp.name === selectedKeypoint) {
                  ctx.font = '16px Arial';
                  ctx.fillText(`Velocity: ${smoothedVelocity.toFixed(0)} px/s`, kp.x + 10, kp.y);
                }
                ctx.beginPath();
                ctx.arc(kp.x, kp.y, 5, 0, 2 * Math.PI);
                ctx.fillStyle = "white";
                ctx.fill();
              });
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

      {/* {model ? <p>Modelo cargado ✅</p> : <p>Cargando modelo...</p>} */}
    </div>
  );
};
