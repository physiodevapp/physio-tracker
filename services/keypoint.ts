import { CanvasKeypointName, CanvasKeypointData } from "@/interfaces/pose";
// import { RefObject } from "react";
import * as poseDetection from "@tensorflow-models/pose-detection";


export const updateKeypointVelocity = (
    keypoints: poseDetection.Keypoint[],
    selectedKeypoint: CanvasKeypointName | null,
    keypointData: CanvasKeypointData | null,
    velocityHistorySize: number,
    movementThreshold: number = 2 // Umbral para ignorar fluctuaciones pequeñas
  ): CanvasKeypointData | null => {
    let velocity = null;
    let smoothedVelocity = null;
  
    // Encontrar el keypoint seleccionado
    const keypoint = keypoints.find((kp) => kp.name === selectedKeypoint);
  
    if (keypoint) {
      const currentPosition = { x: keypoint.x, y: keypoint.y };
      const currentTimestamp = performance.now();
  
      if (!keypointData) {
        // Inicializar el estado del keypoint si no existe
        keypointData = {
          position: currentPosition,
          lastTimestamp: currentTimestamp,
          velocityInPixels: 0,
          velocityInPixelsHistory: [],
        };
      } else {
        const prevData = keypointData;

        velocity = 0;
        smoothedVelocity = 0;
  
        // Calcular la distancia recorrida desde el último frame
        const dx = currentPosition.x - prevData.position.x;
        const dy = currentPosition.y - prevData.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
  
        // Calcular el tiempo transcurrido
        const deltaTime = (currentTimestamp - prevData.lastTimestamp) / 1000;
  
        // Calcular la velocidad si el movimiento supera el umbral
        if (distance > movementThreshold && deltaTime > 0) {
          velocity = distance / deltaTime;
        }
  
        // Actualizar el historial de velocidades
        prevData.velocityInPixelsHistory.push(velocity);
        if (prevData.velocityInPixelsHistory.length > velocityHistorySize) {
          prevData.velocityInPixelsHistory.shift();
        }
  
        // Calcular la media móvil de las velocidades
        smoothedVelocity =
          prevData.velocityInPixelsHistory.reduce((sum, v) => sum + v, 0) /
          prevData.velocityInPixelsHistory.length;
  
        // Actualizar el estado del keypoint
        keypointData = {
          position: currentPosition,
          lastTimestamp: currentTimestamp,
          velocityInPixels: smoothedVelocity,
          velocityInPixelsHistory: prevData.velocityInPixelsHistory,
        };
      }
    }
  
    return keypointData;
  };