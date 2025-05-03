"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import type * as cv from "@techstark/opencv-js";
import Webcam from "react-webcam";
import { ArrowPathIcon, Bars3Icon, CameraIcon, Cog6ToothIcon, DocumentArrowDownIcon, PresentationChartBarIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { VideoConstraints } from "@/interfaces/camera";
import { useSettings } from "@/providers/Settings";
import ColorAnalyzerSettings from "@/modals/ColorAnalyzerSettings";
import Script from "next/script";
import { motion } from "framer-motion";


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
    facingMode: "environment",
  });

  const [infoMessage, setInfoMessage] = useState({
    show: false,
    message:""
  })

  const [videoReady, setVideoReady] = useState(false);
  
  const [showSettings, setShowSettings] = useState(false);
  const [showData, setShowData] = useState(false);
  
  const { settings } = useSettings();
  const { 
    redHueLower1, redHueLower2,
    redHueUpper1, redHueUpper2,
    greenHueLower, greenHueUpper,
    blueHueLower, blueHueUpper,
    minSaturation, minValue,
    minVisibleAreaFactor 
  } = settings.color;
  
  const webcamRef = useRef<Webcam>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewIntervalRef = useRef<number | null>(null);
  const [aspectRatio, setAspectRatio] = useState<number | null>();

  // Estado para OpenCV y análisis
  const [loading, setLoading] = useState<boolean>(true);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [cvInstance, setCvInstance] = useState<typeof cv | null>(null);
  const cvInstanceRef = useRef<typeof cv | null>(cvInstance);
  const [captured, setCaptured] = useState<boolean>(false);

  // Verificamos la inicialización de OpenCV
  useEffect(() => {
    if (!scriptLoaded && !window.cv) return; 

    if (window.cv && typeof window.cv.getBuildInformation === "function") {
      setCvInstance(window.cv);
      setLoading(false);
    } else {
      window.cv.onRuntimeInitialized = () => {
        setCvInstance(window.cv);
        setLoading(false);
      };
    }

    const timeoutId = setTimeout(() => {
      if (loading) {
        setError("Timeout: OpenCV no se inicializó en el tiempo esperado.");
        setLoading(false);
      }
    }, 16_000);

    return () => clearTimeout(timeoutId);
  }, [scriptLoaded, loading]);

  // Función para analizar contornos y calcular Areas
  const analyzeContours = (mask: InstanceType<typeof cv.Mat>, colorPixels: number): { 
    count: number; 
    totalArea: number; 
    averageArea: number; 
    dispersionIndex: number;
  } => {
    const contours = new cvInstance!.MatVector();
    const hierarchy = new cvInstance!.Mat();
    cvInstance!.findContours(mask, contours, hierarchy, cvInstance!.RETR_EXTERNAL, cvInstance!.CHAIN_APPROX_SIMPLE);

    let totalArea = 0;
    const contourCount = contours.size();
    for (let i = 0; i < contourCount; i++) {
      const contour = contours.get(i);
      const area = cvInstance!.contourArea(contour);
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

  const previewFolioDetection = () => {
    const cvInstance = cvInstanceRef.current;
    if (!cvInstance || !webcamRef.current || !overlayCanvasRef.current) return;
    
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;
  
    const img = new Image();
    img.src = imageSrc;
  
    img.onload = () => {
      const overlayCanvas = overlayCanvasRef.current;
      const video = webcamRef.current?.video;
      if (!overlayCanvas || !video) return;

      const ctx = overlayCanvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      // Tamaño real de la imagen capturada
      const imgWidth = img.naturalWidth;
      const imgHeight = img.naturalHeight;

      // Tamaño visible del video en pantalla
      const displayWidth = video.offsetWidth;
      const displayHeight = video.offsetHeight;

      // Aspect ratios
      const imgAspect = imgWidth / imgHeight;
      const displayAspect = displayWidth / displayHeight;

      // Recorte estilo object-cover
      let sx = 0, sy = 0, sw = imgWidth, sh = imgHeight;
      if (imgAspect > displayAspect) {
        sw = imgHeight * displayAspect;
        sx = (imgWidth - sw) / 2;
      } else {
        sh = imgWidth / displayAspect;
        sy = (imgHeight - sh) / 2;
      }
  
      // Dibujamos la imagen en un canvas temporal
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = displayWidth;
      tempCanvas.height = displayHeight;
      const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
      
      if (!tempCtx) return;

      // Dibujar solo la parte visible en el canvas temporal
      tempCtx.drawImage(
        img,
        sx, sy, sw, sh,
        0, 0, displayWidth, displayHeight
      );
  
      // Leer desde el canvas temporal a Mat
      const src = cvInstance.imread(tempCanvas);
      const gray = new cvInstance.Mat();
      const blurred = new cvInstance.Mat();
      const edges = new cvInstance.Mat();

      cvInstance.cvtColor(src, gray, cvInstance.COLOR_RGBA2GRAY);
      cvInstance.GaussianBlur(gray, blurred, new cvInstance.Size(3, 3), 0);
      cvInstance.Canny(blurred, edges, 30, 80);

      const contours = new cvInstance.MatVector();
      const hierarchy = new cvInstance.Mat();
      cvInstance.findContours(edges, contours, hierarchy, cvInstance.RETR_EXTERNAL, cvInstance.CHAIN_APPROX_SIMPLE);

      let biggest = null;
      let maxArea = 0;
  
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const peri = cvInstance.arcLength(contour, true);
        const approx = new cvInstance.Mat();
        cvInstance.approxPolyDP(contour, approx, 0.02 * peri, true);
  
        if (approx.rows === 4) {
          const area = cvInstance.contourArea(approx);
          if (area > maxArea) {
            biggest = approx.clone();
            maxArea = area;
          }
          approx.delete();
        }
      }
  
      // Limpiar overlay y dibujar si hay folio válido
      overlayCanvas.width = displayWidth;
      overlayCanvas.height = displayHeight;
      ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  
      const minVisibleArea = src.cols * src.cols;
      if (biggest && maxArea >= minVisibleAreaFactor * minVisibleArea) {
        const ordered = [];
        for (let i = 0; i < 4; i++) {
          ordered.push({
            x: biggest.data32S[i * 2],
            y: biggest.data32S[i * 2 + 1],
          });
        }
  
        ordered.sort((a, b) => a.y - b.y);
        const top = ordered.slice(0, 2).sort((a, b) => a.x - b.x);
        const bottom = ordered.slice(2, 4).sort((a, b) => a.x - b.x);
        const finalPoints = [...top, ...bottom.reverse()];
  
        ctx.beginPath();
        ctx.moveTo(finalPoints[0].x, finalPoints[0].y);
        for (let i = 1; i < finalPoints.length; i++) {
          ctx.lineTo(finalPoints[i].x, finalPoints[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(88, 158, 244, 0.2)";
        ctx.fill();
        ctx.strokeStyle = "rgb(88, 158, 244)";
        ctx.lineWidth = 2;
        ctx.stroke();

        const distance = (p1: { x: number; y: number; }, p2: { x: number; y: number; }) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
        // Ancho: distancia entre top-left y top-right
        const width = distance(finalPoints[0], finalPoints[1]);
        // Alto: distancia entre top-left y bottom-left
        const height = distance(finalPoints[0], finalPoints[3]);
        // Ratio ancho / alto
        setAspectRatio(width / height);
        
        // captureAndAnalyze();
        const videoElement = webcamRef.current?.video;
        videoElement?.click();
      }
  
      // Limpieza
      src.delete(); gray.delete(); blurred.delete(); edges.delete();
      contours.delete(); hierarchy.delete(); biggest?.delete();
    };
  };

  useEffect(() => {
    previewIntervalRef.current = window.setInterval(previewFolioDetection, 250);
  
    return () => {
      if (previewIntervalRef.current) {
        clearInterval(previewIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    cvInstanceRef.current = cvInstance;
  }, [cvInstance])

  const captureAndAnalyze = () => {
    if (loading) {
      // alert("OpenCV se está cargando");
      setInfoMessage({
        show: true,
        message: "OpenCV is loading..."
      });

      return;
    }
    if (error || !cvInstance) {
      // alert("Error al cargar OpenCV");
      setInfoMessage({
        show: true,
        message: "Error loading OpenCV"
      });
      return;
    }
  
    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc) return;
  
    const img = new Image();
    img.src = imageSrc;
  
    img.onload = () => {
      const captureCanvas = captureCanvasRef.current;
      const video = webcamRef.current?.video;
  
      if (!captureCanvas || !video) return;
  
      const ctx = captureCanvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
  
      const imgWidth = img.naturalWidth;
      const imgHeight = img.naturalHeight;
  
      const displayWidth = video.offsetWidth;
      const displayHeight = video.offsetHeight;
  
      const imgAspect = imgWidth / imgHeight;
      const displayAspect = displayWidth / displayHeight;
  
      let sx = 0, sy = 0, sw = imgWidth, sh = imgHeight;
  
      if (imgAspect > displayAspect) {
        sw = imgHeight * displayAspect;
        sx = (imgWidth - sw) / 2;
      } else {
        sh = imgWidth / displayAspect;
        sy = (imgHeight - sh) / 2;
      }
  
      captureCanvas.width = displayWidth;
      captureCanvas.height = displayHeight;
  
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, displayWidth, displayHeight);
  
      const src = cvInstance.imread(captureCanvas);
  
      // Detección del folio DIN A4
      const gray = new cvInstance.Mat();
      const blurred = new cvInstance.Mat();
      const edges = new cvInstance.Mat();
      
      cvInstance.cvtColor(src, gray, cvInstance.COLOR_RGBA2GRAY);
      cvInstance.GaussianBlur(gray, blurred, new cvInstance.Size(3, 3), 0);
      cvInstance.Canny(blurred, edges, 30, 100);
  
      const contours = new cvInstance.MatVector();
      const hierarchy = new cvInstance.Mat();
      cvInstance.findContours(edges, contours, hierarchy, cvInstance.RETR_EXTERNAL, cvInstance.CHAIN_APPROX_SIMPLE);
  
      let biggest = null;
      let maxArea = 0;
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const peri = cvInstance.arcLength(contour, true);
        const approx = new cvInstance.Mat();
        cvInstance.approxPolyDP(contour, approx, 0.02 * peri, true);
  
        if (approx.rows === 4) {
          const area = cvInstance.contourArea(approx);
          if (area > maxArea) {
            biggest = approx.clone();
            maxArea = area;
          }
          approx.delete();
        }
      }
  
      const minVisibleArea = src.cols * src.cols;
      if (!biggest || maxArea < (minVisibleAreaFactor * 0.96) * minVisibleArea) {
        console.log("No se detectó un folio DIN A4 suficientemente grande.");
        gray.delete(); blurred.delete(); edges.delete();
        contours.delete(); hierarchy.delete(); src.delete();
        if (!previewIntervalRef.current) {
          previewIntervalRef.current = window.setInterval(previewFolioDetection, 250);
        }
        return;
      }
  
      const reorderPoints = (ptsMat: cv.Mat) => {
        const pts = [];
        for (let i = 0; i < 4; i++) {
          pts.push({ x: ptsMat.data32S[i * 2], y: ptsMat.data32S[i * 2 + 1] });
        }
        pts.sort((a, b) => a.y - b.y);
        const top = pts.slice(0, 2).sort((a, b) => a.x - b.x);
        const bottom = pts.slice(2, 4).sort((a, b) => a.x - b.x);
        return [...top, ...bottom.reverse()];
      };
  
      const ordered = reorderPoints(biggest);
      const warpWidth = 600;
      const warpHeight = 848;
  
      const srcTri = cvInstance.matFromArray(4, 1, cvInstance.CV_32FC2, ordered.flatMap(p => [p.x, p.y]));
      const dstTri = cvInstance.matFromArray(4, 1, cvInstance.CV_32FC2, [
        0, 0,
        warpWidth, 0,
        warpWidth, warpHeight,
        0, warpHeight
      ]);
  
      let warpMat = new cvInstance.Mat();
      const M = cvInstance.getPerspectiveTransform(srcTri, dstTri);
      cvInstance.warpPerspective(src, warpMat, M, new cvInstance.Size(warpWidth, warpHeight));

      // --- Recorte interno para eliminar bordes residuales del fondo ---
      const cropMargin = 10; // píxeles a recortar por cada lado
      if (
        warpMat.cols > cropMargin * 2 &&
        warpMat.rows > cropMargin * 2
      ) {
        const cropRect = new cvInstance.Rect(
          cropMargin,
          cropMargin,
          warpMat.cols - cropMargin * 2,
          warpMat.rows - cropMargin * 2
        );
        const croppedWarp = warpMat.roi(cropRect);
        warpMat.delete(); // eliminamos el anterior
        warpMat = croppedWarp; // usamos el recortado
      }
  
      const hsv = new cvInstance.Mat();
      cvInstance.cvtColor(warpMat, hsv, cvInstance.COLOR_RGBA2RGB);
      cvInstance.cvtColor(hsv, hsv, cvInstance.COLOR_RGB2HSV);
  
      const lowerRed1 = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [redHueLower1, minSaturation, minValue, 0]);
      const upperRed1 = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [redHueUpper1, 255, 255, 255]);
      const lowerRed2 = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [redHueLower2, minSaturation, minValue, 0]);
      const upperRed2 = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [redHueUpper2, 255, 255, 255]);
      const redMask1 = new cvInstance.Mat();
      const redMask2 = new cvInstance.Mat();
      cvInstance.inRange(hsv, lowerRed1, upperRed1, redMask1);
      cvInstance.inRange(hsv, lowerRed2, upperRed2, redMask2);
      const redMask = new cvInstance.Mat();
      cvInstance.add(redMask1, redMask2, redMask);
  
      const lowerGreen = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [greenHueLower, minSaturation, minValue, 0]);
      const upperGreen = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [greenHueUpper, 255, 255, 255]);
      const greenMask = new cvInstance.Mat();
      cvInstance.inRange(hsv, lowerGreen, upperGreen, greenMask);
  
      const lowerBlue = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [blueHueLower, minSaturation, minValue, 0]);
      const upperBlue = new cvInstance.Mat(hsv.rows, hsv.cols, hsv.type(), [blueHueUpper, 255, 255, 255]);
      const blueMask = new cvInstance.Mat();
      cvInstance.inRange(hsv, lowerBlue, upperBlue, blueMask);
  
      const totalPixels = hsv.rows * hsv.cols;
      const redPixels = cvInstance.countNonZero(redMask);
      const greenPixels = cvInstance.countNonZero(greenMask);
      const bluePixels = cvInstance.countNonZero(blueMask);
      const othersPixels = totalPixels - (redPixels + greenPixels + bluePixels);
  
      const redAnalysis = analyzeContours(redMask, redPixels);
      const greenAnalysis = analyzeContours(greenMask, greenPixels);
      const blueAnalysis = analyzeContours(blueMask, bluePixels);
  
      setAnalysisResult({
        red: {
          percentage: (redPixels / totalPixels) * 100,
          contours: redAnalysis.count,
          totalArea: (redAnalysis.totalArea / totalPixels) * 100,
          averageArea: (redAnalysis.averageArea / totalPixels) * 100,
          dispersionIndex: redAnalysis.dispersionIndex,
        },
        green: {
          percentage: (greenPixels / totalPixels) * 100,
          contours: greenAnalysis.count,
          totalArea: (greenAnalysis.totalArea / totalPixels) * 100,
          averageArea: (greenAnalysis.averageArea / totalPixels) * 100,
          dispersionIndex: greenAnalysis.dispersionIndex,
        },
        blue: {
          percentage: (bluePixels / totalPixels) * 100,
          contours: blueAnalysis.count,
          totalArea: (blueAnalysis.totalArea / totalPixels) * 100,
          averageArea: (blueAnalysis.averageArea / totalPixels) * 100,
          dispersionIndex: blueAnalysis.dispersionIndex,
        },
        others: {
          percentage: (othersPixels / totalPixels) * 100,
          contours: 0,
          totalArea: 0,
          averageArea: 0,
          dispersionIndex: 0,
        },
      });
  
      // ---- Mostrar contornos dentro del folio ----
      const resultImage = warpMat.clone();

      const redContours = new cvInstance.MatVector();
      const redHierarchy = new cvInstance.Mat();
      cvInstance.findContours(redMask, redContours, redHierarchy, cvInstance.RETR_EXTERNAL, cvInstance.CHAIN_APPROX_SIMPLE);
      cvInstance.drawContours(resultImage, redContours, -1, new cvInstance.Scalar(255, 0, 0, 255), 1);
      redContours.delete();
      redHierarchy.delete();
  
      const greenContours = new cvInstance.MatVector();
      const greenHierarchy = new cvInstance.Mat();
      cvInstance.findContours(greenMask, greenContours, greenHierarchy, cvInstance.RETR_EXTERNAL, cvInstance.CHAIN_APPROX_SIMPLE);
      cvInstance.drawContours(resultImage, greenContours, -1, new cvInstance.Scalar(0, 255, 0, 255), 1);
      greenContours.delete();
      greenHierarchy.delete();
  
      const blueContours = new cvInstance.MatVector();
      const blueHierarchy = new cvInstance.Mat();
      cvInstance.findContours(blueMask, blueContours, blueHierarchy, cvInstance.RETR_EXTERNAL, cvInstance.CHAIN_APPROX_SIMPLE);
      cvInstance.drawContours(resultImage, blueContours, -1, new cvInstance.Scalar(0, 0, 255, 255), 1);
      blueContours.delete();
      blueHierarchy.delete();
  
      // Mostrar contornos de la imagen procesada en overlayCanvas
      const overlayCanvas = overlayCanvasRef.current;
      if (overlayCanvas) {
        overlayCanvas.width = resultImage.cols;
        overlayCanvas.height = resultImage.rows;

        const ctx = overlayCanvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

          // Mostrar imagen con contornos
          const imgData = new ImageData(
            new Uint8ClampedArray(resultImage.data),
            resultImage.cols,
            resultImage.rows
          );
          ctx.putImageData(imgData, 0, 0);
        }
      }
      resultImage.delete();
  
      setCaptured(true);
  
      // Liberar memoria
      src.delete(); gray.delete(); blurred.delete(); edges.delete();
      contours.delete(); hierarchy.delete(); biggest?.delete();
      warpMat.delete(); hsv.delete();
      lowerRed1.delete(); upperRed1.delete(); lowerRed2.delete(); upperRed2.delete();
      redMask1.delete(); redMask2.delete(); redMask.delete();
      lowerGreen.delete(); upperGreen.delete(); greenMask.delete();
      lowerBlue.delete(); upperBlue.delete(); blueMask.delete();
      srcTri.delete(); dstTri.delete(); M.delete();
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
    if (!previewIntervalRef.current) {
      previewIntervalRef.current = window.setInterval(previewFolioDetection, 250);
    }
    setAspectRatio(null);
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
      <Script 
        src="/opencv.js" 
        strategy="afterInteractive" 
        onLoad={() => setScriptLoaded(true)}
        />
      <motion.h1
        data-element="non-swipeable"
        initial={{ y: 0, opacity: 1 }}
        animate={{ y: isMainMenuOpen ? -48 : 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 100, damping: 15 }}
        className="absolute z-10 inset-x-0 mx-auto w-[50vw] text-center text-xl text-white bg-[#5dadec] dark:bg-black/40 
        rounded-full py-2 px-4 font-bold mt-2 whitespace-nowrap"
      >
        BodyChart
      </motion.h1>
      <div 
        className="relative w-full h-dvh"
        onClick={handleMainLayer}
        >
        {/* Video de Webcam */}
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          className={`relative h-dvh object-cover border-0 border-blue-500 ${
            captured ? 'opacity-0' : 'unset'
          }`}
          videoConstraints={videoConstraints}
          mirrored={videoConstraints.facingMode === "user"}
          onUserMedia={() => setVideoReady(true)}
          onClick={() => {
            if (captured) return;
            // console.log('captureAndAnalyze')

            if (previewIntervalRef.current) {
              clearInterval(previewIntervalRef.current);
              previewIntervalRef.current = null;
            }
            captureAndAnalyze();
          }}
        />
        {/* Canvas para mostrar contornos (superpuesto al video) */}
        <canvas
          ref={overlayCanvasRef}
          className={`absolute top-1/2 -translate-y-1/2 w-full h-dvh border-0 border-green-500 pointer-events-none`}
          style={{ 
            aspectRatio: (captured && aspectRatio) ? aspectRatio.toFixed(3) : "unset",
            height: (captured && aspectRatio) ? 'unset' : 'h-dvh' 
          }}
          />
        {/* Canvas para análisis y descarga*/}
        <canvas 
          ref={captureCanvasRef} 
          className="hidden absolute top-1/2 -translate-y-1/2 w-full border-2 border-red-500" 
          style={{ 
            aspectRatio: (captured && aspectRatio) ? aspectRatio.toFixed(3) : "unset",
            height: (captured && aspectRatio) ? 'unset' : 'h-dvh' 
          }}
          />
        {(loading || (!loading && error)) && (
          <div className="absolute top-0 z-50 w-full h-dvh flex flex-col items-center justify-center text-white bg-black/40">
            {loading && (
              <p className="flex flex-col items-center gap-4">
                {(!videoReady && !loading) ? "Initializing camera..." : "Loading OpenCV..."} {!error && <ArrowPathIcon className="w-8 h-8 animate-spin"/>}
              </p>
            )}
            {error && <p className="p-4 text-center">Error: {error}</p>}
          </div>
        )}          
      </div>
      <section 
        data-element="non-swipeable"
        className="absolute top-1 left-1 p-2 z-10 flex flex-col justify-between gap-6 bg-[#5dadec] dark:bg-black/40 rounded-full"
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
        className="absolute top-1 right-1 p-2 z-10 flex flex-col justify-between gap-6 bg-[#5dadec] dark:bg-black/40 rounded-full"
        >
        <>
          <div 
            className="relative cursor-pointer"
            onClick={() => toggleCamera()}
            >
              <CameraIcon className="h-6 w-6 text-white cursor-pointer"/>
              <ArrowPathIcon className="absolute top-[60%] -right-1 h-4 w-4 text-white bg-[#5d91ec] dark:bg-black/80 rounded-full p-[0.1rem]"/>
          </div>
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
        <section className="absolute bottom-0 w-full px-4 pt-[1rem] pb-[2rem] bg-gradient-to-b from-black/40 to-black rounded-t-lg text-white space-y-2">
          <div className="bg-red-400/60 p-2 rounded-md space-y-2">
            <div className="flex justify-between">
              <p className="flex-1"><strong>Red:</strong> <span className="underline underline-offset-4">{analysisResult.red.percentage.toFixed(2)}%</span></p>
              <p className="flex-[0.6]">Idx<span className="align-sub uppercase text-[0.6rem]"> spread</span>: <span className="underline underline-offset-4">{analysisResult.red.dispersionIndex.toFixed(2)}</span></p>
            </div>
            <div className="flex justify-between gap-2 flex-1">
              <p className="flex-[0.6]">A<span className="align-sub uppercase text-[0.6rem]"> #</span>: {analysisResult.red.contours}</p>
              <p className="flex-1">A <span className="align-sub uppercase text-[0.6rem]">tot</span>: {analysisResult.red.totalArea.toFixed(2)}%</p>
              <p className="flex-1">A <span className="align-sub uppercase text-[0.6rem]">avg</span>: {analysisResult.red.averageArea.toFixed(2)}%</p>
            </div>
          </div>
          <div className="bg-green-400/60 p-2 rounded-md space-y-2">
            <div className="flex justify-between gap-2 flex-1">
              <p className="flex-1"><strong>Green:</strong> <span className="underline underline-offset-4">{analysisResult.green.percentage.toFixed(2)}%</span></p>
              <p className="flex-[0.6]">Idx<span className="align-sub uppercase text-[0.6rem]"> spread</span>: <span className="underline underline-offset-4">{analysisResult.green.dispersionIndex.toFixed(2)}</span></p>
            </div>
            <div className="flex justify-between gap-2 flex-1">
              <p className="flex-[0.6]">A<span className="align-sub uppercase text-[0.6rem]"> #</span>: {analysisResult.green.contours}</p>
              <p className="flex-1">A <span className="align-sub uppercase text-[0.6rem]">tot</span>: {analysisResult.green.totalArea.toFixed(2)}%</p>
              <p className="flex-1">A <span className="align-sub uppercase text-[0.6rem]">avg</span>: {analysisResult.green.averageArea.toFixed(2)}%</p>
            </div>
          </div>
          <div className="bg-blue-400/60 p-2 rounded-md space-y-2">
            <div className="flex justify-between">
              <p className="flex-1"><strong>Blue:</strong> <span className="underline underline-offset-4">{analysisResult.blue.percentage.toFixed(2)}%</span></p>
              <p className="flex-[0.6]">Idx<span className="align-sub uppercase text-[0.6rem]"> spread</span>: <span className="underline underline-offset-4">{analysisResult.blue.dispersionIndex.toFixed(2)}</span></p>
            </div>
            <div className="flex justify-between gap-2 flex-1">
              <p className="flex-[0.6]">A<span className="align-sub uppercase text-[0.6rem]"> #</span>: {analysisResult.blue.contours}</p>
              <p className="flex-1">A <span className="align-sub uppercase text-[0.6rem]">tot</span>: {analysisResult.blue.totalArea.toFixed(2)}%</p>
              <p className="flex-1">A <span className="align-sub uppercase text-[0.6rem]">avg</span>: {analysisResult.blue.averageArea.toFixed(2)}%</p>
            </div>
          </div>
          <div className="px-2">
            <strong>Others:</strong> {analysisResult.others.percentage.toFixed(2)}%
            <p className="text-[0.8rem] italic">*The dispersion index is normalized based on the total number of pixels detected for the color.</p>
          </div>
        </section>
      )}
      {infoMessage.show ? (
          <div 
            data-element="non-swipeable"
            className="absolute top-0 h-dvh w-full z-40 flex items-center justify-center"
            onClick={() => setInfoMessage({show: false, message: ""})}
            >
            <div className="dark:bg-gray-800 rounded-lg px-10 py-6 flex flex-col gap-2">
              <p className="text-lg">{infoMessage.message}</p>
              <button 
                className="bg-[#5dadec] hover:bg-gray-600 text-white font-bold rounded-lg p-2"
                onClick={() => setInfoMessage({show: false, message: ""})}
                >
                  Got it!
                </button>
            </div>
          </div>
        ) : null
      }
    </>
  );
};

export default Index;
