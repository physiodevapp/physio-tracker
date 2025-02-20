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

export interface IndexProps {
  handleMainMenu: (visibility?: boolean) => void;
}

const Index: React.FC<IndexProps> = ({ handleMainMenu }) => {
  const [videoConstraints, setVideoConstraints] = useState<VideoConstraints>({
    facingMode: "user",
  });

  const [captured, setCaptured] = useState<boolean>(false);

  const webcamRef = useRef<Webcam>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [cvInstance, setCvInstance] = useState<typeof cv | null>(null);

  // Verificamos la inicialización de OpenCV
  useEffect(() => {
    // Si OpenCV ya está inicializado, lo usamos directamente.
    if (window.cv && typeof window.cv.getBuildInformation === "function") {
      setCvInstance(window.cv);
      setLoading(false);
      return;
    }
    // Si no, asignamos el callback.
    window.cv.onRuntimeInitialized = () => {
      setCvInstance(window.cv);
      setLoading(false);
    };
    const timeoutId = setTimeout(() => {
      if (loading) {
        setError("Timeout: OpenCV no se inicializó en el tiempo esperado.");
        setLoading(false);
      }
    }, 15000);
    return () => clearTimeout(timeoutId);
  }, [loading]);

  // Función para analizar contornos y calcular áreas
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
      // Usamos el canvas de captura para procesar la imagen
      const captureCanvas = captureCanvasRef.current;
      if (!captureCanvas) return;
      captureCanvas.width = img.width;
      captureCanvas.height = img.height;
      const captureCtx = captureCanvas.getContext("2d", { willReadFrequently: true });
      if (!captureCtx) return;
      captureCtx.drawImage(img, 0, 0, img.width, img.height);

      // Procesar la imagen: convertirla a Mat, pasar a HSV y crear máscaras
      const src: cv.Mat = cvInstance.imread(captureCanvas);
      const hsv = new cvInstance.Mat();
      cvInstance.cvtColor(src, src, cvInstance.COLOR_RGBA2RGB);
      cvInstance.cvtColor(src, hsv, cvInstance.COLOR_RGB2HSV);

      // Máscara para rojo (dos rangos para cubrir el wrap-around)
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

      // Máscara para verde
      const lowerGreen = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [36, 70, 50, 0]);
      const upperGreen = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [89, 255, 255, 255]);
      const greenMask = new cvInstance.Mat();
      cvInstance.inRange(hsv, lowerGreen, upperGreen, greenMask);

      // Máscara para azul
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

      // Dibujar contornos sobre la imagen de análisis en el capture canvas
      const resultImage = src.clone();

      // Dibujar contornos rojos
      const redContours = new cvInstance.MatVector();
      const redHierarchy = new cvInstance.Mat();
      cvInstance.findContours(redMask, redContours, redHierarchy, cvInstance.RETR_EXTERNAL, cvInstance.CHAIN_APPROX_SIMPLE);
      cvInstance.drawContours(resultImage, redContours, -1, new cvInstance.Scalar(255, 0, 0, 255), 2);
      redContours.delete();
      redHierarchy.delete();

      // Dibujar contornos verdes
      const greenContours = new cvInstance.MatVector();
      const greenHierarchy = new cvInstance.Mat();
      cvInstance.findContours(greenMask, greenContours, greenHierarchy, cvInstance.RETR_EXTERNAL, cvInstance.CHAIN_APPROX_SIMPLE);
      cvInstance.drawContours(resultImage, greenContours, -1, new cvInstance.Scalar(0, 255, 0, 255), 2);
      greenContours.delete();
      greenHierarchy.delete();

      // Dibujar contornos azules
      const blueContours = new cvInstance.MatVector();
      const blueHierarchy = new cvInstance.Mat();
      cvInstance.findContours(blueMask, blueContours, blueHierarchy, cvInstance.RETR_EXTERNAL, cvInstance.CHAIN_APPROX_SIMPLE);
      cvInstance.drawContours(resultImage, blueContours, -1, new cvInstance.Scalar(0, 0, 255, 255), 2);
      blueContours.delete();
      blueHierarchy.delete();

      // Mostrar la imagen con contornos en el capture canvas
      // Mostrar la imagen con contornos en el canvas de captura
      cvInstance.imshow(captureCanvas, resultImage);
      resultImage.delete();

      // --- Dibujar solo los contornos en el overlayCanvas ---
      // Creamos una imagen en blanco del mismo tamaño que la imagen original
      const blankMat = new cvInstance.Mat(src.rows, src.cols, cvInstance.CV_8UC4, new cvInstance.Scalar(0, 0, 0, 0));

      // Recalculamos los contornos para cada máscara y dibujamos en el blankMat

      // Para rojo
      const redContoursOverlay = new cvInstance.MatVector();
      const redHierarchyOverlay = new cvInstance.Mat();
      cvInstance.findContours(redMask, redContoursOverlay, redHierarchyOverlay, cvInstance.RETR_EXTERNAL, cvInstance.CHAIN_APPROX_SIMPLE);
      cvInstance.drawContours(blankMat, redContoursOverlay, -1, new cvInstance.Scalar(255, 0, 0, 255), 2);
      redContoursOverlay.delete();
      redHierarchyOverlay.delete();

      // Para verde
      const greenContoursOverlay = new cvInstance.MatVector();
      const greenHierarchyOverlay = new cvInstance.Mat();
      cvInstance.findContours(greenMask, greenContoursOverlay, greenHierarchyOverlay, cvInstance.RETR_EXTERNAL, cvInstance.CHAIN_APPROX_SIMPLE);
      cvInstance.drawContours(blankMat, greenContoursOverlay, -1, new cvInstance.Scalar(0, 255, 0, 255), 2);
      greenContoursOverlay.delete();
      greenHierarchyOverlay.delete();

      // Para azul
      const blueContoursOverlay = new cvInstance.MatVector();
      const blueHierarchyOverlay = new cvInstance.Mat();
      cvInstance.findContours(blueMask, blueContoursOverlay, blueHierarchyOverlay, cvInstance.RETR_EXTERNAL, cvInstance.CHAIN_APPROX_SIMPLE);
      cvInstance.drawContours(blankMat, blueContoursOverlay, -1, new cvInstance.Scalar(0, 0, 255, 255), 2);
      blueContoursOverlay.delete();
      blueHierarchyOverlay.delete();

      // Mostrar solo los contornos en el overlayCanvas
      const overlayCanvas = overlayCanvasRef.current;
      if (overlayCanvas) {
        overlayCanvas.width = src.cols;
        overlayCanvas.height = src.rows;
        cvInstance.imshow(overlayCanvas, blankMat);
      }
      blankMat.delete();

      setCaptured(true);

      // Liberar memoria de las matrices utilizadas
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

  // Función para limpiar ambos canvases
  const clearCanvases = () => {
    const captureCanvas = captureCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (captureCanvas) {
      const ctx = captureCanvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.clearRect(0, 0, captureCanvas.width, captureCanvas.height);
      }
    }
    if (overlayCanvas) {
      const ctx = overlayCanvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      }
    }
    setAnalysisResult(null);
    setCaptured(false);
  };

  return (
    <div 
      className="relative w-full h-dvh"
      onClick={() => handleMainMenu(false)}
      >
      {/* Video de Webcam */}
      <Webcam
        audio={false}
        ref={webcamRef}
        screenshotFormat="image/jpeg"
        className={`relative object-cover h-full w-full`}
        videoConstraints={videoConstraints}
        mirrored={videoConstraints.facingMode === "user"}
      />
      {/* Canvas overlay para contornos (superpuesto al video) */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-full pointer-events-none"
        />
      {/* Canvas de análisis visible para descarga */}
      <canvas 
        ref={captureCanvasRef} 
        className="absolute hidden top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-full border-red-500 border-2" 
        />
      <div className="absolute top-0 z-10 w-full flex justify-between">
        <button className=" bg-black/40 text-white p-2" onClick={captureAndAnalyze} disabled={loading || !!error}>
          Capturar y Analizar
        </button>
        {captured && (
          <button onClick={clearCanvases} className="bg-black/40 text-white p-2">
            Limpiar
          </button>
        )}
        {loading && <p>Cargando OpenCV...</p>}
        {error && <p>Error: {error}</p>}
      </div>
      {analysisResult && (
        <div style={{ marginTop: "10px" }}>
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
