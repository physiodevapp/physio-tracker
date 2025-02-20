"use client";

import React, { useEffect, useState, useRef } from "react";
import Webcam from "react-webcam";
import cv from "@techstark/opencv-js";

interface ColorAnalysis {
  percentage: number;
  contours: number;
  totalArea: number;
  averageArea: number;
  dispersionIndex: number;
}

interface AnalysisResult {
  red: ColorAnalysis;
  green: ColorAnalysis;
  blue: ColorAnalysis;
  others: ColorAnalysis;
}

interface IndexProps {
  handleMainMenu: (visibility?: boolean) => void;
}

const Index = ({handleMainMenu}: IndexProps) => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  // Estado local para guardar la instancia de cv
  const [cvInstance, setCvInstance] = useState<typeof cv | null>(null);

  useEffect(() => {
    // Si window.cv ya está inicializado, lo usamos directamente
    if (window.cv && typeof window.cv.getBuildInformation === "function") {
      setCvInstance(window.cv);
      setLoading(false);
      return;
    }

    // Asignamos el callback solo si no está inicializado
    window.cv.onRuntimeInitialized = () => {
      setCvInstance(window.cv);
      setLoading(false);
    };

    // Timeout para detectar si la inicialización falla
    const timeoutId = setTimeout(() => {
      if (loading) {
        console.error("Timeout: No se pudo inicializar OpenCV en el tiempo esperado.");
        setError("Timeout: OpenCV no se inicializó en el tiempo esperado.");
        setLoading(false);
      }
    }, 15000);

    return () => clearTimeout(timeoutId);
  }, [loading]);

  // Función auxiliar para analizar contornos y calcular áreas
  const analyzeContours = (mask: cv.Mat, colorPixels: number): { 
    count: number; 
    totalArea: number; 
    averageArea: number; 
    dispersionIndex: number;
  } => {
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let totalArea = 0;
    const contourCount = contours.size();
    for (let i = 0; i < contourCount; i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      totalArea += area;
      contour.delete();
    }
    const averageArea = contourCount > 0 ? totalArea / contourCount : 0;
    const dispersionIndex = colorPixels > 0 ? totalArea / colorPixels : 0;

    contours.delete();
    hierarchy.delete();

    return { 
      count: contourCount, 
      totalArea, 
      averageArea, 
      dispersionIndex 
    };
  };

  const captureAndAnalyze = () => {
    if (loading) {
      alert("OpenCV se está cargando");
      return;
    }
    if (error || !cvInstance) {
      alert("Error al cargar OpenCV");
      return;
    }

    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc) return;

    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, img.width, img.height);

      // Leer imagen del canvas y convertirla a HSV
      const src: cv.Mat = cvInstance.imread(canvas);
      const hsv = new cvInstance.Mat();
      cvInstance.cvtColor(src, src, cvInstance.COLOR_RGBA2RGB);
      cvInstance.cvtColor(src, hsv, cvInstance.COLOR_RGB2HSV);

      // Crear máscaras para cada color (ejemplo para rojo, verde y azul)
      // Rojo: dos rangos para cubrir el wrap-around del hue
      const lowerRed1 = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 70, 50, 0]);
      const upperRed1 = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [10, 255, 255, 255]);
      const lowerRed2 = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [170, 70, 50, 0]);
      const upperRed2 = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 255, 255, 255]);
      const redMask1 = new cvInstance.Mat();
      const redMask2 = new cvInstance.Mat();
      cvInstance.inRange(hsv, lowerRed1, upperRed1, redMask1);
      cvInstance.inRange(hsv, lowerRed2, upperRed2, redMask2);
      const redMask = new cvInstance.Mat();
      cvInstance.add(redMask1, redMask2, redMask);

      // Verde
      const lowerGreen = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [36, 70, 50, 0]);
      const upperGreen = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [89, 255, 255, 255]);
      const greenMask = new cvInstance.Mat();
      cvInstance.inRange(hsv, lowerGreen, upperGreen, greenMask);

      // Azul
      const lowerBlue = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [90, 70, 50, 0]);
      const upperBlue = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [128, 255, 255, 255]);
      const blueMask = new cvInstance.Mat();
      cvInstance.inRange(hsv, lowerBlue, upperBlue, blueMask);

      const totalPixels = hsv.rows * hsv.cols;
      const redPixels = cvInstance.countNonZero(redMask);
      const greenPixels = cvInstance.countNonZero(greenMask);
      const bluePixels = cvInstance.countNonZero(blueMask);
      const coloredPixels = redPixels + greenPixels + bluePixels;
      const othersPixels = totalPixels - coloredPixels;

      const redAnalysis = analyzeContours(redMask, redPixels);
      const greenAnalysis = analyzeContours(greenMask, greenPixels);
      const blueAnalysis = analyzeContours(blueMask, bluePixels);

      const result: AnalysisResult = {
        red: {
          percentage: (redPixels / totalPixels) * 100,
          contours: redAnalysis.count,
          totalArea: redAnalysis.totalArea,
          averageArea: redAnalysis.averageArea,
          dispersionIndex: redAnalysis.dispersionIndex,
        },
        green: {
          percentage: (greenPixels / totalPixels) * 100,
          contours: greenAnalysis.count,
          totalArea: greenAnalysis.totalArea,
          averageArea: greenAnalysis.averageArea,
          dispersionIndex: greenAnalysis.dispersionIndex,
        },
        blue: {
          percentage: (bluePixels / totalPixels) * 100,
          contours: blueAnalysis.count,
          totalArea: blueAnalysis.totalArea,
          averageArea: blueAnalysis.averageArea,
          dispersionIndex: blueAnalysis.dispersionIndex,
        },
        others: {
          percentage: (othersPixels / totalPixels) * 100,
          contours: 0,
          totalArea: 0,
          averageArea: 0,
          dispersionIndex: 0,
        },
      };

      setAnalysisResult(result);

      // Liberar memoria
      src.delete();
      hsv.delete();
      lowerRed1.delete();
      upperRed1.delete();
      lowerRed2.delete();
      upperRed2.delete();
      redMask1.delete();
      redMask2.delete();
      redMask.delete();
      lowerGreen.delete();
      upperGreen.delete();
      greenMask.delete();
      lowerBlue.delete();
      upperBlue.delete();
      blueMask.delete();
    };
  };

  return (
    <div 
      style={{ padding: "1rem" }}
      onClick={() => handleMainMenu(false)}
      >
      <h1>Analizador de Bodychart con OpenCV (Local)</h1>
      {loading && <p>Cargando OpenCV...</p>}
      {error && <p>Error: {error}</p>}
      <Webcam
        audio={false}
        ref={webcamRef}
        screenshotFormat="image/jpeg"
        videoConstraints={{ width: 640, height: 480 }}
      />
      <div style={{ marginTop: "1rem" }}>
        <button onClick={captureAndAnalyze} disabled={loading || !!error}>
          Capturar y Analizar
        </button>
      </div>
      {/* Canvas oculto para procesamiento */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
      {analysisResult && (
        <div style={{ marginTop: "1rem" }}>
          <h2>Resultados del análisis:</h2>
          <div>
            <strong>Rojo:</strong> {analysisResult.red.percentage.toFixed(2)}% - Contornos: {analysisResult.red.contours} - Total Área: {analysisResult.red.totalArea.toFixed(0)} - Área Promedio: {analysisResult.red.averageArea.toFixed(0)} - Índice de Dispersión: {analysisResult.red.dispersionIndex.toFixed(2)}
          </div>
          <div>
            <strong>Verde:</strong> {analysisResult.green.percentage.toFixed(2)}% - Contornos: {analysisResult.green.contours} - Total Área: {analysisResult.green.totalArea.toFixed(0)} - Área Promedio: {analysisResult.green.averageArea.toFixed(0)} - Índice de Dispersión: {analysisResult.green.dispersionIndex.toFixed(2)}
          </div>
          <div>
            <strong>Azul:</strong> {analysisResult.blue.percentage.toFixed(2)}% - Contornos: {analysisResult.blue.contours} - Total Área: {analysisResult.blue.totalArea.toFixed(0)} - Área Promedio: {analysisResult.blue.averageArea.toFixed(0)} - Índice de Dispersión: {analysisResult.blue.dispersionIndex.toFixed(2)}
          </div>
          <div>
            <strong>Otros:</strong> {analysisResult.others.percentage.toFixed(2)}%
          </div>
          <p>*El índice de dispersión se normaliza según el total de píxeles detectados para el color.</p>
        </div>
      )}
    </div>
  );
};

export default Index;
