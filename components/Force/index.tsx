"use client";

import { ArrowPathIcon, Battery0Icon, CheckCircleIcon, LinkIcon, LinkSlashIcon, PlayIcon, ScaleIcon, StopIcon } from "@heroicons/react/24/solid";
import { useState, useRef, useEffect } from "react";
import ForceChart, { DataPoint } from "./Graph";
import ForceCycleDetector from "./CycleDetector"

// ----------------- Comandos y Códigos -----------------
const CMD_TARE_SCALE = 100;
const CMD_START_WEIGHT_MEAS = 101;
const CMD_STOP_WEIGHT_MEAS = 102;
const CMD_ENTER_SLEEP = 110;
const CMD_GET_BATTERY_VOLTAGE = 111

const RES_CMD_RESPONSE = 0;
const RES_WEIGHT_MEAS = 1;
const RES_RFD_PEAK = 2;
const RES_RFD_PEAK_SERIES = 3;
const RES_LOW_PWR_WARNING = 4;

const Index = () => {
  const [sensorData, setSensorData] = useState<DataPoint[]>([]);
  const [maxForce, setMaxForce] = useState<number | null>(null);
  const [calibratedThresholds, setCalibratedThresholds] = useState({low: 0, high: 0})
  const [cycleCount, setCycleCount] = useState<number | null>(null);

  // ------------ Referencia para almacenar las líneas del CSV ---------------
  const sensorRawDataLogRef = useRef<string[]>([]);
  const sensorProcessedDataLogRef = useRef<string[]>([]);

  // --------------- Estados de conexión y datos básicos -----------------
  const [device, setDevice] = useState<BluetoothDevice | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [controlCharacteristic, setControlCharacteristic] = useState<BluetoothRemoteGATTCharacteristic | null>(null);
  const [taringStatus, setTaringStatus] = useState<0 | 1 | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isBatteryDead, setIsBatteryDead] = useState(false);
  const [isDeviceAvailable, setIsDeviceAvailable] = useState(true);

  // -------------- UUIDs según la documentación de Progressor ------------
  const PROGRESSOR_SERVICE_UUID = "7e4e1701-1ea6-40c9-9dcc-13d34ffead57";
  const DATA_CHAR_UUID = "7e4e1702-1ea6-40c9-9dcc-13d34ffead57";
  const CTRL_POINT_CHAR_UUID = "7e4e1703-1ea6-40c9-9dcc-13d34ffead57";

  // ----------------- Refs para Filtrado y Derivada -----------------
  const previousFilteredForceRef = useRef<number | null>(null);

  // ----------------- Función de Procesamiento de Medición -----------------
  const processMeasurement = (sensorForce: number, sensorTime: number) => {
    // 1. Filtrado avanzado con EMA
    const alpha = 0.1; // Factor de suavizado (ajustable)
    const filteredForce =
      previousFilteredForceRef.current === null
        ? sensorForce
        : alpha * sensorForce + (1 - alpha) * previousFilteredForceRef.current;
    previousFilteredForceRef.current = filteredForce;

    // Ventana de tiempo de 10 segundos en milisegundos
    const timeWindow = 10000;

    // Actualizar sensorData y el valor máximo: conservar solo datos de los últimos 10 segundos
    setSensorData((prev) => {
      // Filtrar los datos para conservar solo los últimos 10 segundos
      const newData = prev.filter((dataPoint) => dataPoint.time >= (sensorTime / 1000) - timeWindow);
      // Agregar el nuevo dato
      const updatedData = [...newData, { time: sensorTime, force: filteredForce }];

      // Actualizar el estado del máximo con el valor máximo de updatedData
      if (updatedData.length > 0) {
        const currentMax = Math.max(...updatedData.map((point) => point.force));
        setMaxForce(prev => Math.max(prev ?? 0, currentMax));
      } else {
        setMaxForce(null);
      }
      return updatedData;
    });
  }

  // ----------------- Recepción de Datos del Sensor -----------------
  const handleCharacteristicValueChanged = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    const dataView = new DataView(value.buffer);
    const responseCode = dataView.getUint8(0);

    if (responseCode === RES_WEIGHT_MEAS) {
      // Se asume que los datos vienen empaquetados en bloques de 8 bytes
      for (let i = 2; i < dataView.byteLength; i += 8) {
        if (i + 7 < dataView.byteLength) {
          const force = dataView.getFloat32(i, true);
          const sensorTime = dataView.getUint32(i + 4, true);
          processMeasurement(force, sensorTime);
        }
      }
    } else if (responseCode === RES_CMD_RESPONSE) {
      // Procesar respuesta a comandos
    } else if (responseCode === RES_RFD_PEAK) {
      // Procesar datos del pico RFD
    } else if (responseCode === RES_RFD_PEAK_SERIES) {
      // Procesar la serie de picos RFD
    } else if (responseCode === RES_LOW_PWR_WARNING) {
      // Manejar advertencia de baja potencia
      console.log('Potencia demasiado baja. Apagando dispositivo...');
      setIsBatteryDead(true);
      setTimeout(async () => {
        await shutdown();
      }, 1000);
    }
  };

  // ----------------- Funciones de Conexión y Control -----------------

  const connectToSensor = async () => {
    try {
      const options = {
        filters: [{ namePrefix: "Progressor" }],
        optionalServices: [PROGRESSOR_SERVICE_UUID],
      };
      console.log("Requesting Bluetooth device...");
      const device = await navigator.bluetooth.requestDevice(options);
      setDevice(device);
      console.log("Connecting to GATT server...");
      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService(PROGRESSOR_SERVICE_UUID);
      const dataCharacteristic = await service.getCharacteristic(DATA_CHAR_UUID);
      await dataCharacteristic.startNotifications();
      dataCharacteristic.addEventListener("characteristicvaluechanged", handleCharacteristicValueChanged);
      const controlChar = await service.getCharacteristic(CTRL_POINT_CHAR_UUID);
      setControlCharacteristic(controlChar);
      console.log("Connected and listening for notifications...");
      setIsConnected(true);
      setIsDeviceAvailable(false);
    } catch (error) {
      console.error("Error connecting to sensor:", error);
    }
  };

  const tareSensor = async () => {
    if (!controlCharacteristic) {
      console.error("Control characteristic not available");
      setTaringStatus(0);
      return;
    }
    try {
      setTaringStatus(0);
      await stopMeasurement();
      await controlCharacteristic.writeValue(new Uint8Array([CMD_TARE_SCALE]));
      console.log('Tared');
      setTaringStatus(1);
    } catch (error) {
      console.error("Error taring sensor:", error);
      setTaringStatus(0);
    }
  };

  const startMeasurement = async () => {
    if (taringStatus !== 1) return;
    if (!controlCharacteristic) {
      console.error("Control characteristic not available");
      return;
    }
    try {      
      previousFilteredForceRef.current = null;     
      setSensorData([]); 
      setMaxForce(0);
      sensorRawDataLogRef.current = ["timestamp,force"];
      sensorProcessedDataLogRef.current = ["timestamp,force,derivative"];
      await controlCharacteristic.writeValue(new Uint8Array([CMD_START_WEIGHT_MEAS]));
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting measurement:", error);
    }
  };

  // Generar el archivo CSV y disparar la descarga
  const downloadRawData = () => {
    const csvContent = sensorRawDataLogRef.current.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "sensor_raw_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Generar el archivo CSV y disparar la descarga
  const downloadProcessedData = () => {
    const csvContent = sensorProcessedDataLogRef.current.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "sensor_processed_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const stopMeasurement = async () => {
    if (!controlCharacteristic) {
      console.error("Control characteristic not available");
      return;
    }
    try {
      await controlCharacteristic.writeValue(new Uint8Array([CMD_STOP_WEIGHT_MEAS]));
      setIsRecording(false);
    } catch (error) {
      console.error("Error stopping measurement:", error);
    }
  };

  const disconnectSensor = () => {
    if (device && device.gatt?.connected) {
      console.log('device disconnected');
      device.gatt.disconnect();
      setIsConnected(false);
      setDevice(null);
      setSensorData([]);
      setControlCharacteristic(null);
    }
  };

  const shutdown = async () => {
    if (!controlCharacteristic) {
      console.error("Control characteristic not available");
      return;
    }
    try {
      await controlCharacteristic.writeValue(new Uint8Array([CMD_ENTER_SLEEP]));    
      setIsConnected(false);
      setDevice(null);
      setSensorData([]);
      setControlCharacteristic(null);
      setIsDeviceAvailable(false);
      setTimeout(() => {
        setIsDeviceAvailable(true);
      }, 12000);
      console.log('Device shut down');

    } catch (error) {
      console.error("Error shutting down the device:", error);
    }
  }

  const handleCalibrationComplete = (thresholdLow: number, thresholdHigh: number) => {
    // Guarda estos valores en el estado o pásalos al componente de gráfico
    console.log("Umbrales calibrados recibidos:", thresholdLow, thresholdHigh);
    setCalibratedThresholds({ low: thresholdLow, high: thresholdHigh });
  };

  const handleCycleDetected = (cycleCount: number) => {
    setCycleCount(cycleCount)
  }

  // ----------------- Renderizado de la UI -----------------
  return (
    <div 
      data-element="non-swipeable"
      className="p-5 font-sans space-y-2"
      >
      {/* Conexión del dispositivo */}
      <div className="flex justify-between items-start">
        <div className="flex-col">
          <h1 className="text-2xl font-bold">Strength tracker</h1>
          {device && isConnected && (
            <div className="flex-1 flex items-center gap-2">
              {isBatteryDead && (
                <Battery0Icon className="w-8 h-8 text-red-500 animate-pulse"/>
              )}
              <p><strong>{device.name}</strong> <span>{isConnected ? "connected" : "disconnected"}</span></p>
            </div>
          )}
        </div>
        <div className="flex gap-4">
          {isConnected && (
            <LinkSlashIcon
              className="w-8 h-8 bg-red-500 hover:bg-red-700 text-white font-bold p-1 rounded"
              onClick={shutdown}
              />
          )}
          {(isConnected || (isDeviceAvailable && !device)) && (
            <LinkIcon
              className="w-8 h-8 bg-blue-500 hover:bg-blue-700 text-white font-bold p-1 rounded"
              onClick={connectToSensor}
              />
          )}
          {(!isConnected && (!isDeviceAvailable || device)) && (
            <ArrowPathIcon className="w-8 h-8 text-gray-500 animate-spin"/>
          )}
        </div>
      </div>
      {/* Tara e inicio del registro de ciclos */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        {device && isConnected && (
          <div className="flex-1 flex justify-between items-center gap-4">
            <div className="relative" onClick={tareSensor} >
              <ScaleIcon
                className={`w-8 h-8 bg-purple-500 hover:bg-purple-700 text-white font-bold p-1 rounded ${taringStatus === 0 ? 'animate-pulse' : ''}`}
                />
              {taringStatus === 1 && (
                <CheckCircleIcon className="absolute -bottom-2 -right-2 w-5 h-5 text-white rounded-full bg-green-500 font-bold"/>
              )}
            </div>
            {!isRecording && (
              <PlayIcon
                className={`w-8 h-8 ${taringStatus === 1 ? 'bg-green-500 hover:bg-green-700' : 'bg-gray-300'} text-white font-bold p-1 rounded`}
                onClick={startMeasurement}
                />
            )}
            {isRecording && (
              <StopIcon
                className="w-8 h-8 bg-orange-500 hover:bg-orange-700 text-white font-bold p-1 rounded"
                onClick={stopMeasurement}
                />
            )}
            <div className="flex-[0.6]">
              <p>
                Now: {sensorData.length > 0 
                ? `${sensorData[sensorData.length - 1].force.toFixed(1)}` 
                : "0.0"} kg
              </p>
              <p>
                Max: {maxForce
                ? `${maxForce.toFixed(1)}`
                : '0.0'} kg
              </p>
            </div>
            <div className="flex-[1]">
              {cycleCount && (
                <span className="font-bold text-3xl">{cycleCount} {cycleCount > 1 ? ' reps' : 'rep'}</span>
              )}
              {isRecording && cycleCount === null && (
                <div className="flex flex-wrap justify-center items-center animate-pulse">
                  <span className="font-bold text-blue-600 text-base">Calibrando...</span>
                  <span className="text-center text-xs text-blue-600">
                    (Haz varias repeticiones)
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
        {!isConnected && (
          <p className="text-gray-500">No device is connected</p>
        )}
      </div>
      {/* Gráfico */}
      <ForceChart 
        sensorData={sensorData} 
        thresholdHigh={calibratedThresholds.high}
        thresholdLow={calibratedThresholds.low}
        />
      {/* Ciclos */}
      {isConnected && (
        <ForceCycleDetector 
          dataPoint={sensorData[sensorData.length - 1]} 
          reset={sensorData.length === 0} 
          calibrationTime={8000}
          isRecording={isRecording}
          onCalibrationComplete={handleCalibrationComplete}
          onCycleDetected={handleCycleDetected}
          />
      )}
    </div>
  );
};

export default Index;
