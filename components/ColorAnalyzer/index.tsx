import { Mat, MatVector } from '@/global';
import { useOpenCv } from '@/providers/OpenCv';
import React, { useRef, useState } from 'react';
import Webcam from 'react-webcam';

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

const Index: React.FC = () => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { cv, loading, error } = useOpenCv();
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  // Función auxiliar para analizar contornos, calcular áreas y un índice de dispersión
  const analyzeContours = (mask: Mat, colorPixels: number): { 
    count: number; 
    totalArea: number; 
    averageArea: number; 
    dispersionIndex: number;
  } => {
    const contours: MatVector = new cv!.MatVector();
    const hierarchy: Mat = new cv!.Mat();
    cv!.findContours(mask, contours, hierarchy, cv!.RETR_EXTERNAL, cv!.CHAIN_APPROX_SIMPLE);

    let totalArea = 0;
    const contourCount = contours.size();
    for (let i = 0; i < contourCount; i++) {
      const contour: Mat = contours.get(i);
      const area = cv!.contourArea(contour);
      totalArea += area;
      contour.delete();
    }
    const averageArea = contourCount > 0 ? totalArea / contourCount : 0;
    // Normalizamos el total del área de contornos respecto a la cantidad total de píxeles detectados para ese color.
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
      alert('OpenCV se está cargando');
      return;
    }
    if (error || !cv) {
      alert('Error al cargar OpenCV');
      return;
    }

    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      const img = new Image();
      img.src = imageSrc;
      img.onload = () => {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, img.width, img.height);

            // Leer la imagen del canvas y convertir a HSV
            const src: Mat = cv.imread(canvas);
            const hsv: Mat = new cv.Mat();
            cv.cvtColor(src, src, cv.COLOR_RGBA2RGB);
            cv.cvtColor(src, hsv, cv.COLOR_RGB2HSV);

            // Crear máscaras para rojo, verde y azul

            // Para rojo se definen dos rangos por el wrap-around del hue
            const lowerRed1: Mat = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 70, 50, 0]);
            const upperRed1: Mat = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [10, 255, 255, 255]);
            const lowerRed2: Mat = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [170, 70, 50, 0]);
            const upperRed2: Mat = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 255, 255, 255]);

            const redMask1: Mat = new cv.Mat();
            const redMask2: Mat = new cv.Mat();
            cv.inRange(hsv, lowerRed1, upperRed1, redMask1);
            cv.inRange(hsv, lowerRed2, upperRed2, redMask2);
            const redMask: Mat = new cv.Mat();
            cv.add(redMask1, redMask2, redMask);

            // Verde: ajustar rangos HSV (por ejemplo, [36, 70, 50] a [89, 255, 255])
            const lowerGreen: Mat = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [36, 70, 50, 0]);
            const upperGreen: Mat = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [89, 255, 255, 255]);
            const greenMask: Mat = new cv.Mat();
            cv.inRange(hsv, lowerGreen, upperGreen, greenMask);

            // Azul: ajustar rangos HSV (por ejemplo, [90, 70, 50] a [128, 255, 255])
            const lowerBlue: Mat = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [90, 70, 50, 0]);
            const upperBlue: Mat = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [128, 255, 255, 255]);
            const blueMask: Mat = new cv.Mat();
            cv.inRange(hsv, lowerBlue, upperBlue, blueMask);

            // Calcular píxeles de cada color
            const totalPixels = hsv.rows * hsv.cols;
            const redPixels = cv.countNonZero(redMask);
            const greenPixels = cv.countNonZero(greenMask);
            const bluePixels = cv.countNonZero(blueMask);
            const coloredPixels = redPixels + greenPixels + bluePixels;
            const othersPixels = totalPixels - coloredPixels;

            // Analizamos cada máscara
            const redAnalysis = analyzeContours(redMask, redPixels);
            const greenAnalysis = analyzeContours(greenMask, greenPixels);
            const blueAnalysis = analyzeContours(blueMask, bluePixels);

            // Armamos el resultado con los datos de porcentaje, contornos y dispersión
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
          }
        }
      };
    }
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h1>Analizador de Bodychart con OpenCV (Incluye Índice de Dispersión)</h1>
      <Webcam
        audio={false}
        ref={webcamRef}
        screenshotFormat="image/jpeg"
        videoConstraints={{ width: 640, height: 480 }}
      />
      <div style={{ marginTop: '1rem' }}>
        <button onClick={captureAndAnalyze}>Capturar y Analizar</button>
      </div>
      {/* Canvas oculto para procesamiento */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {analysisResult && (
        <div style={{ marginTop: '1rem' }}>
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
          <p>*El índice de dispersión indica qué tan concentrado o disperso se encuentra el color (valores más bajos indican mayor dispersión).</p>
        </div>
      )}
    </div>
  );
};

export default Index;
