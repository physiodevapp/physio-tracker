"use client";

import { ArrowPathIcon, Battery0Icon, CheckCircleIcon, Cog6ToothIcon, LinkIcon, LinkSlashIcon, PlayIcon, ScaleIcon, StopIcon } from "@heroicons/react/24/solid";
import { useState, useRef } from "react";
import ForceChart, { DataPoint } from "./Graph";
import { DocumentArrowDownIcon } from "@heroicons/react/24/outline";
import { Bars3Icon } from "@heroicons/react/24/solid";
import { BluetoothDevice, BluetoothRemoteGATTCharacteristic } from "@/global";

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

interface IndexProps {
  handleMainMenu: () => void;
}

const Index = ({ handleMainMenu }: IndexProps) => {
  // Declaramos un estado y una ref para medir la frecuencia
  const measurementStartRef = useRef<number | null>(null);
  const sampleCount = useRef<number>(0);
  const maxSensorDataRef = useRef<number>(815); // Valor inicial aproximado

  const [sensorData, setSensorData] = useState<DataPoint[]>([]);
  
  // ------------ Referencia para almacenar las líneas del CSV ---------------
  const sensorRawDataLogRef = useRef<string[]>([]);

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
    // Almacena los datos crudos en el log
    sensorRawDataLogRef.current.push(`${sensorTime},${sensorForce}`);

    // Filtrado avanzado con EMA
    const alpha = 0.1; // Factor de suavizado (ajustable)
    const filteredForce =
      previousFilteredForceRef.current === null
        ? sensorForce
        : alpha * sensorForce + (1 - alpha) * previousFilteredForceRef.current;
    previousFilteredForceRef.current = filteredForce;

    // Inicia el contador en el primer dato recibido
    if (measurementStartRef.current === null) {
      measurementStartRef.current = sensorTime;
      sampleCount.current = 0;
    } else {
      sampleCount.current = sampleCount.current + 1;
    }
    
    // Comprueba si han pasado 10 segundos (en microsegundos)
    const timeWindow = 10_000_000;
    if (
      measurementStartRef.current &&
      (sensorTime - measurementStartRef.current) >= timeWindow
    ) {
      const samplesIn10Sec = sampleCount.current + 1; // Incluyendo el dato actual
      console.log("Muestras en 10 segundos:", samplesIn10Sec);
      // Actualiza el valor dinámico
      maxSensorDataRef.current = samplesIn10Sec;
      // Reinicia el contador y la marca de tiempo
      sampleCount.current = 0;
      measurementStartRef.current = sensorTime;
    }

    // Actualizar sensorData utilizando el buffer circular dinámico
    setSensorData((prev) => {
      // Agrega el nuevo dato
      const updatedData = [...prev, { time: sensorTime, force: filteredForce }];
      // Usa el valor dinámico en lugar de una constante fija
      if (updatedData.length > maxSensorDataRef.current) {
        updatedData.shift();
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
          const force = dataView.getFloat32(i, true); // kg
          const sensorTime = dataView.getUint32(i + 4, true); // microsegundos
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
      // shutdown();
      // stopMeasurement();
      setTimeout(async () => {
        shutdown();
      }, 3000);
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
      setTaringStatus(null);
    } catch (error) {
      console.error("Error connecting to sensor:", error);
      setIsConnected(false);
      setDevice(null);
      setIsDeviceAvailable(true);
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
      sensorRawDataLogRef.current = ["timestamp,force"];
      await controlCharacteristic.writeValue(new Uint8Array([CMD_START_WEIGHT_MEAS]));
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting measurement:", error);
    }
  };

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

  const shutdown = async () => {
    setIsConnected(false);
    setDevice(null);
    setSensorData([]);
    setControlCharacteristic(null);
    setIsDeviceAvailable(false);
    setTimeout(() => {
      setIsDeviceAvailable(true);
    }, 12000);
    console.log('Device shut down');
    if (!controlCharacteristic) {
      console.error("Control characteristic not available");
      return;
    }
    try {
      await controlCharacteristic.writeValue(new Uint8Array([CMD_ENTER_SLEEP]));    

    } catch (error) {
      console.error("Error shutting down the device:", error);
    }
  };

  // Generar el archivo CSV y disparar la descarga
  const downloadRawData = () => {
    const csvContent = sensorRawDataLogRef.current.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `sensor_raw_data_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ----------------- Renderizado de la UI -----------------
  return (
    <>
      <div 
        data-element="non-swipeable"
        className="p-5 font-sans space-y-6"
        >
        {/* Conexión del dispositivo */}
        <div className="flex flex-col justify-center items-center">
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
        {/* Tara y métricas */}
        <div className="flex justify-center items-center flex-wrap">
          {device && isConnected && (
            <div className="flex-1 flex justify-center items-center gap-3">
              <p className="text-2xl">
                Now: {sensorData.length > 0 
                ? <span className={isRecording ? 'animate-pulse' : ''}>{sensorData[sensorData.length - 1].force.toFixed(1)} kg</span> 
                : "0.0 kg"}
              </p>
              {Boolean(sensorData.length && !isRecording) && (
                <DocumentArrowDownIcon 
                  className="w-8 h-8 text-black"
                  onClick={downloadRawData}/>
              )}
            </div>
          )}
          {!isConnected && (
            <p className="text-gray-500">No device is connected</p>
          )}
        </div>
        {isConnected && (
          <>
            {/* Gráfico */}
            <ForceChart 
              sensorData={sensorData}
              displayAnnotations={isConnected}
              />
          </>
        )}
      </div>
      <section 
        data-element="non-swipeable"
        className="absolute top-1 left-1 p-2 z-10 flex flex-col justify-between gap-6 bg-black/40 rounded-full"
        >
        <>
          <Bars3Icon 
            className="w-6 h-6 text-white"
            onClick={handleMainMenu}
            />
          {device && isConnected && (
            <>
              <div className="relative" onClick={tareSensor} >
                <ScaleIcon
                  className={`w-6 h-6 text-white ${taringStatus === 0 ? 'animate-pulse' : ''}`}
                  />
                {taringStatus === 1 && (
                  <CheckCircleIcon className="absolute -bottom-2 -right-1 w-5 h-5 text-white rounded-full"/>
                )}
              </div>
              {!isRecording && (
                <PlayIcon
                  className={`w-6 h-6 text-white ${taringStatus !== 1 ? 'opacity-40' : ''}`}
                  onClick={startMeasurement}
                  />
              )}
              {isRecording && (
                <StopIcon
                  className={`w-6 h-6 text-white ${isRecording ? 'animate-pulse' : ''}`}
                  onClick={stopMeasurement}
                  />
              )}
            </>
          )}
        </>
      </section>
      <section 
        data-element="non-swipeable"
        className="absolute top-1 right-1 p-2 z-10 flex flex-col justify-between gap-6 bg-black/40 rounded-full"
      >
        {(isConnected || (isDeviceAvailable && !device)) && (
          <LinkIcon 
            className="w-6 h-6 text-white"
            onClick={connectToSensor}
            />
        )}
        {isConnected && (
          <>
            <LinkSlashIcon 
              className="w-6 h-6 text-white"
              onClick={shutdown}
              />
            <Cog6ToothIcon className="w-6 h-6 text-white"/>
          </>
        )}
        {(!isConnected && (!isDeviceAvailable || device)) && (
          <ArrowPathIcon className="w-6 h-6 text-white animate-spin"/>
        )}
      </section>
    </>
  );
};

export default Index;
