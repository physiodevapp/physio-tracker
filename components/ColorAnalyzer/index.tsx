"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import Webcam from "react-webcam";
import cv from "@techstark/opencv-js";
import { ArrowPathIcon, Bars3Icon, CameraIcon, Cog6ToothIcon, DocumentArrowDownIcon, PresentationChartBarIcon, SwatchIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { VideoConstraints } from "@/interfaces/camera";
import { useSettings } from "@/providers/Settings";
import ColorAnalyzerSettings from "@/modals/ColorAnalyzerSettings";

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
  isMainMenuOpen: boolean;
}

const Index: React.FC<IndexProps> = ({ handleMainMenu, isMainMenuOpen }) => {
  const [videoConstraints, setVideoConstraints] = useState<VideoConstraints>({
    facingMode: "user",
  });

  const [showSettings, setShowSettings] = useState(false);
  const [showData, setShowData] = useState(false);

  const { settings } = useSettings();
  
  const webcamRef = useRef<Webcam>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  // Estado para OpenCV y análisis
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [cvInstance, setCvInstance] = useState<typeof cv | null>(null);
  const [captured, setCaptured] = useState<boolean>(false);

  // Verificamos la inicialización de OpenCV
  useEffect(() => {
    // eslint-disable-next-line prefer-const
    let intervalId: NodeJS.Timeout;
    let timeoutId: NodeJS.Timeout;
  
    const pollForCv = () => {
      if (window.cv) {
        clearInterval(intervalId);
        // Si OpenCV ya está inicializado, lo usamos directamente.
        if (typeof window.cv.getBuildInformation === "function") {
          setCvInstance(window.cv);
          setLoading(false);
        } else {
          // Si aún no se ha inicializado, asignamos el callback.
          window.cv.onRuntimeInitialized = () => {
            setCvInstance(window.cv);
            setLoading(false);
          };
        }
      }
    };
  
    // Empezamos a verificar cada 100ms.
    intervalId = setInterval(pollForCv, 100);
  
    // Timeout de 15 segundos
    // eslint-disable-next-line prefer-const
    timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      if (loading) {
        setError("Timeout: OpenCV no se inicializó en el tiempo esperado.");
        setLoading(false);
      }
    }, 15000);
  
    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
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

      // Máscara para rojo (dos rangos)
      const lowerRed1 = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [settings.color.redHueLower1, settings.color.minSaturation, settings.color.minValue, 0]);
      const upperRed1 = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [settings.color.redHueUpper1, 255, 255, 255]);
      const lowerRed2 = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [settings.color.redHueLower2, settings.color.minSaturation, settings.color.minValue, 0]);
      const upperRed2 = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [settings.color.redHueUpper2, 255, 255, 255]);
      const redMask1 = new cvInstance.Mat();
      const redMask2 = new cvInstance.Mat();
      cvInstance.inRange(hsv, lowerRed1, upperRed1, redMask1);
      cvInstance.inRange(hsv, lowerRed2, upperRed2, redMask2);
      const redMask = new cvInstance.Mat();
      cvInstance.add(redMask1, redMask2, redMask);

      // Máscara para verde
      const lowerGreen = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [settings.color.greenHueLower, settings.color.minSaturation, settings.color.minValue, 0]);
      const upperGreen = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [settings.color.greenHueUpper, 255, 255, 255]);
      const greenMask = new cvInstance.Mat();
      cvInstance.inRange(hsv, lowerGreen, upperGreen, greenMask);

      // Máscara para azul
      const lowerBlue = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [settings.color.blueHueLower, settings.color.minSaturation, settings.color.minValue, 0]);
      const upperBlue = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [settings.color.blueHueUpper, 255, 255, 255]);
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
      cvInstance.drawContours(resultImage, redContours, -1, new cvInstance.Scalar(255, 0, 0, 255), 1);
      redContours.delete();
      redHierarchy.delete();

      // Dibujar contornos verdes
      const greenContours = new cvInstance.MatVector();
      const greenHierarchy = new cvInstance.Mat();
      cvInstance.findContours(greenMask, greenContours, greenHierarchy, cvInstance.RETR_EXTERNAL, cvInstance.CHAIN_APPROX_SIMPLE);
      cvInstance.drawContours(resultImage, greenContours, -1, new cvInstance.Scalar(0, 255, 0, 255), 1);
      greenContours.delete();
      greenHierarchy.delete();

      // Dibujar contornos azules
      const blueContours = new cvInstance.MatVector();
      const blueHierarchy = new cvInstance.Mat();
      cvInstance.findContours(blueMask, blueContours, blueHierarchy, cvInstance.RETR_EXTERNAL, cvInstance.CHAIN_APPROX_SIMPLE);
      cvInstance.drawContours(resultImage, blueContours, -1, new cvInstance.Scalar(0, 0, 255, 255), 1);
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
      cvInstance.drawContours(blankMat, redContoursOverlay, -1, new cvInstance.Scalar(255, 0, 0, 255), 1);
      redContoursOverlay.delete();
      redHierarchyOverlay.delete();

      // Para verde
      const greenContoursOverlay = new cvInstance.MatVector();
      const greenHierarchyOverlay = new cvInstance.Mat();
      cvInstance.findContours(greenMask, greenContoursOverlay, greenHierarchyOverlay, cvInstance.RETR_EXTERNAL, cvInstance.CHAIN_APPROX_SIMPLE);
      cvInstance.drawContours(blankMat, greenContoursOverlay, -1, new cvInstance.Scalar(0, 255, 0, 255), 1);
      greenContoursOverlay.delete();
      greenHierarchyOverlay.delete();

      // Para azul
      const blueContoursOverlay = new cvInstance.MatVector();
      const blueHierarchyOverlay = new cvInstance.Mat();
      cvInstance.findContours(blueMask, blueContoursOverlay, blueHierarchyOverlay, cvInstance.RETR_EXTERNAL, cvInstance.CHAIN_APPROX_SIMPLE);
      cvInstance.drawContours(blankMat, blueContoursOverlay, -1, new cvInstance.Scalar(0, 0, 255, 255), 1);
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
    setShowData(false);
  };

  // Función para descargar la imagen del canvas de captura
  const downloadImage = () => {
    const canvas = captureCanvasRef.current;
    if (canvas) {
      const imageUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = imageUrl;
      link.download = `analysis_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Función para descargar un CSV con los datos del análisis
  const downloadCSV = () => {
    if (!analysisResult) return;
    // Crear filas del CSV: encabezado y datos para cada color
    const csvRows = [];
    csvRows.push("Color,Percentage,Contornos,Total Area,Average Area,Dispersion Index");
    csvRows.push(
      `Rojo,${analysisResult.red.percentage},${analysisResult.red.contours},${analysisResult.red.totalArea},${analysisResult.red.averageArea},${analysisResult.red.dispersionIndex}`
    );
    csvRows.push(
      `Verde,${analysisResult.green.percentage},${analysisResult.green.contours},${analysisResult.green.totalArea},${analysisResult.green.averageArea},${analysisResult.green.dispersionIndex}`
    );
    csvRows.push(
      `Azul,${analysisResult.blue.percentage},${analysisResult.blue.contours},${analysisResult.blue.totalArea},${analysisResult.blue.averageArea},${analysisResult.blue.dispersionIndex}`
    );
    csvRows.push(
      `Otros,${analysisResult.others.percentage},${analysisResult.others.contours},${analysisResult.others.totalArea},${analysisResult.others.averageArea},${analysisResult.others.dispersionIndex}`
    );
    
    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `analysis_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadData = () => {
    downloadImage();
    downloadCSV();
  };

  const toggleCamera = useCallback(() => {
      setVideoConstraints((prev) => ({
        facingMode: prev.facingMode === "user" ? "environment" : "user",
      }));
    }, []);

  const toggleSettings = (visibility?: boolean) => {
    if (visibility === undefined && showData) {
      setShowData(false);
    }
    setShowSettings(visibility === undefined ? !showSettings : visibility);
  }

  const toggleShowData = (visibility?: boolean) => {
    if (visibility === undefined && showSettings) {
      setShowSettings(false);
    }
    setShowData(visibility === undefined ? !showData : visibility);
  }

  const handleMainLayer = () => {
    handleMainMenu(false);
    toggleSettings(false);
    toggleShowData(false);
  }

  return (
    <>
      <div 
        className="relative w-full h-dvh"
        onClick={handleMainLayer}
        >
        <h1 className={`absolute left-1/2 -translate-x-1/2 z-10 text-xl text-white bg-black/40 rounded-full py-1 px-4 font-bold mt-2 transition-[top] duration-300 ease-in-out whitespace-nowrap ${
          isMainMenuOpen ? '-top-12' : 'top-0'
        }`}>Color Analyzer</h1>
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
        {loading && (
          <div className="absolute top-0 z-50 w-full h-dvh flex flex-col items-center justify-center text-white bg-black/40">
            <p className="flex flex-col items-center gap-4">
              Cargando OpenCV... {!error && <ArrowPathIcon className="w-8 h-8 animate-spin"/>}
            </p>
            {error && <p>Error: {error}</p>}
          </div>
        )}          
      </div>
      <section 
        data-element="non-swipeable"
        className="absolute top-1 left-1 p-2 z-10 flex flex-col justify-between gap-6 bg-black/40 rounded-full"
        >
        <>
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
          <SwatchIcon 
            className="w-6 h-6 text-white"
            onClick={captureAndAnalyze}
            /> 
          {captured && (
            <>
              <TrashIcon 
                className="w-6 h-6 text-red-500"
                onClick={clearCanvases}
                />
              <PresentationChartBarIcon
                className="w-6 h-6 text-white"
                onClick={() => toggleShowData()}
                />
              <DocumentArrowDownIcon 
                className="w-6 h-6 text-white"
                onClick={downloadData}
                />
            </>
          )}
        </>
      </section>
      <section
        data-element="non-swipeable"
        className="absolute top-1 right-1 p-2 z-10 flex flex-col justify-between gap-6 bg-black/40 rounded-full"
        >
        <>
          <CameraIcon 
            className="h-6 w-6 text-white cursor-pointer" 
            onClick={toggleCamera}
            />
          <Cog6ToothIcon 
            className="w-6 h-6 text-white"
            onClick={() => toggleSettings()}
            />
        </> 
      </section>
      {showSettings && (
        <ColorAnalyzerSettings />
      )}
      {(showData && analysisResult) && (
        <section className="absolute bottom-0 w-full h-[54vh] bg-gradient-to-b from-black/40 to-black rounded-t-lg p-4 text-white">
          <div className="space-y-2">
            <div className="bg-red-400/60 p-2 rounded-md space-y-2">
              <div className="flex justify-between">
                <p><strong>Rojo:</strong> <span className="underline underline-offset-4">{analysisResult.red.percentage.toFixed(2)}%</span></p>
                <p>Índice de Dispersión: <span className="underline underline-offset-4">{analysisResult.red.dispersionIndex.toFixed(2)}</span></p>
              </div>
              <div className="flex justify-between gap-4 flex-1">
                <p className="flex-1">Nº<span className="align-sub uppercase text-[0.6rem]"> Áreas</span>: {analysisResult.red.contours}</p>
                <p className="flex-1">A <span className="align-sub uppercase text-[0.6rem]">tot</span>: {analysisResult.red.totalArea.toFixed(0)}</p>
                <p className="flex-1">A <span className="align-sub uppercase text-[0.6rem]">prom</span>: {analysisResult.red.averageArea.toFixed(0)}</p>
              </div>
            </div>
            <div className="bg-green-400/60 p-2 rounded-md space-y-2">
              <div className="flex justify-between gap-4 flex-1">
                <p><strong>Verde:</strong> <span className="underline underline-offset-4">{analysisResult.green.percentage.toFixed(2)}%</span></p>
                <p>Índice de Dispersión: <span className="underline underline-offset-4">{analysisResult.green.dispersionIndex.toFixed(2)}</span></p>
              </div>
              <div className="flex justify-between gap-4 flex-1">
                <p className="flex-1">Nº<span className="align-sub uppercase text-[0.6rem]"> Áreas</span>: {analysisResult.green.contours}</p>
                <p className="flex-1">A <span className="align-sub uppercase text-[0.6rem]">tot</span>: {analysisResult.green.totalArea.toFixed(0)}</p>
                <p className="flex-1">A <span className="align-sub uppercase text-[0.6rem]">prom</span>: {analysisResult.green.averageArea.toFixed(0)}</p>
              </div>
            </div>
            <div className="bg-blue-400/60 p-2 rounded-md space-y-2">
              <div className="flex justify-between">
                <p><strong>Azul:</strong> <span className="underline underline-offset-4">{analysisResult.blue.percentage.toFixed(2)}%</span></p>
                <p>Índice de Dispersión: <span className="underline underline-offset-4">{analysisResult.blue.dispersionIndex.toFixed(2)}</span></p>
              </div>
              <div className="flex justify-between gap-4 flex-1">
                <p className="flex-1">Nº<span className="align-sub uppercase text-[0.6rem]"> Áreas</span>: {analysisResult.blue.contours}</p>
                <p className="flex-1">A <span className="align-sub uppercase text-[0.6rem]">tot</span>: {analysisResult.blue.totalArea.toFixed(0)}</p>
                <p className="flex-1">A <span className="align-sub uppercase text-[0.6rem]">prom</span>: {analysisResult.blue.averageArea.toFixed(0)}</p>
              </div>
            </div>
            <div className="px-2 py-1">
              <strong>Otros:</strong> {analysisResult.others.percentage.toFixed(2)}%
              <p className="text-[0.8rem] italic">*El índice de dispersión se normaliza según el total de píxeles detectados para el color.</p>
            </div>
          </div>
        </section>
      )}
    </>
  );
};

export default Index;
