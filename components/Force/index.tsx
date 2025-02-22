"use client";

import { ArrowPathIcon, Battery0Icon, CheckCircleIcon, ChevronDoubleDownIcon, Cog6ToothIcon, LinkIcon, LinkSlashIcon, PlayIcon, ScaleIcon, StopIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { useState, useRef, useEffect } from "react";
import ForceChart, { DataPoint } from "./Graph";
import { BookmarkIcon, DocumentArrowDownIcon } from "@heroicons/react/24/outline";
import { Bars3Icon, BookmarkIcon as BookmarkIconSolid } from "@heroicons/react/24/solid";
import { useSettings } from "@/providers/Settings";
import ForceSettings from "@/modals/ForceGraphSettings";
// import { BluetoothDevice, BluetoothRemoteGATTCharacteristic } from "@/global";

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
  handleMainMenu: (visibility?: boolean) => void;
  isMainMenuOpen: boolean
}

const Index = ({ handleMainMenu, isMainMenuOpen }: IndexProps) => {
  const { settings } = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [showMassCalibration, setShowMassCalibration] = useState(false);
  const showMassCalibrationRef = useRef(showMassCalibration)

  const [workLoad, setWorkLoad] = useState<number | null>(null);
  const [updatedWorkLoad, setUpdatedWorkLoad] = useState<number | null>(null);
  const [isEstimatingMass, setIsEstimatingMass] = useState(false);
  
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
          if (showMassCalibrationRef.current) {
            setWorkLoad(force);
          } else {
            processMeasurement(force, sensorTime);
          }
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

  const startMassEstimation = async() => {
    if (taringStatus !== 1) return;
    if (!controlCharacteristic) {
      console.error("Control characteristic not available");
      return;
    }
    try { 
      await controlCharacteristic.writeValue(new Uint8Array([CMD_START_WEIGHT_MEAS]));  
      setIsEstimatingMass(true); 
    } catch (error) {
      console.error("Error starting measurement:", error);
    }
  }

  const stopMassEstimation = async () => {
    if (!controlCharacteristic) {
      console.error("Control characteristic not available");
      return;
    }
    try {
      await controlCharacteristic.writeValue(new Uint8Array([CMD_STOP_WEIGHT_MEAS]));
      setIsEstimatingMass(false);  
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

  const toggleSettings = (visibility?: boolean) => {
    if (visibility === undefined && showMassCalibration) {
      setShowMassCalibration(false);
    }
    setShowSettings(visibility === undefined ? !showSettings : visibility);
  }

  const toggleMassCalibration = (visibility?: boolean) => {
    if (taringStatus !== 1) return
    if (visibility === undefined && showSettings) {
      setShowSettings(false);
    }
    setShowMassCalibration(visibility === undefined ? !showMassCalibration : visibility);
  }

  const handleMainLayer = async () => {
    await stopMassEstimation();
    handleMainMenu(false);
    toggleSettings(false);
    toggleMassCalibration(false);
  }

  const handleUpdateWorkLoad = async () => {
    setUpdatedWorkLoad(updatedWorkLoad ? null : workLoad);
    if (updatedWorkLoad !== null) await stopMassEstimation()
  }

  useEffect(() => {
    showMassCalibrationRef.current = showMassCalibration;
  }, [showMassCalibration]);

  // ----------------- Renderizado de la UI -----------------
  return (
    <>
      <div
        className={`relative h-dvh p-5 transition-all duration-300 ease-in-out ${
          isMainMenuOpen ? "pt-16" : "pt-16"
        }`}
        onClick={handleMainLayer}
        >
        <h1 className={`absolute left-1/2 -translate-x-1/2 z-10 text-2xl text-white bg-black/40 rounded-full py-1 px-4 font-bold mt-2 transition-[top] duration-300 ease-in-out whitespace-nowrap  ${
          isMainMenuOpen ? '-top-12' : 'top-0'
        }`}>Force tracker</h1>
        {/* Conexión del dispositivo */}
        <div className="flex flex-col justify-center items-center">
          {device && isConnected && (
            <div className="flex-1 flex items-center gap-2">
              {isBatteryDead && (
                <Battery0Icon className="w-8 h-8 text-red-500 animate-pulse"/>
              )}
              <p className="italic">{device.name}</p>
            </div>
          )}
        </div>
        {/* Tara y métricas */}
        <div className="flex justify-center items-center flex-wrap gap-4">
          {device && isConnected && (
            <div className={`flex-1 flex justify-center items-center mt-2`}
              >
              <p className={`text-2xl ${
                  showMassCalibration ? 'opacity-40' : ''
                }`}
                >
                Now: {sensorData.length > 0 
                ? <span className={isRecording ? 'animate-pulse' : ''}>{sensorData[sensorData.length - 1].force.toFixed(1)} kg</span> 
                : "0.0 kg"}
              </p>
            </div>
          )}
          {!isConnected && (
            <p className="text-gray-500">No device is connected</p>
          )}
        </div>
        {isConnected && (
          <div>
            {/* Gráfico */}
            <ForceChart 
              sensorData={sensorData}
              displayAnnotations={isConnected}
              isEstimatingMass={showMassCalibration}
              workLoad={updatedWorkLoad}
              isMainMenuOpen={isMainMenuOpen}
              movingAverageWindow={settings.force.movingAverageWindow}
              minAvgAmplitude={settings.force.minAvgAmplitude}
              maxAvgDuration={settings.force.maxAvgDuration}
              forceDropThreshold={settings.force.forceDropThreshold}
              cyclesToAverage={settings.force.cyclesToAverage}
              hysteresis={settings.force.hysteresis}
              />
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
          {device && isConnected && (
            <>
              <div 
                className="relative" 
                onClick={() => !showMassCalibration && tareSensor()}
                >
                <ScaleIcon
                  className={`w-6 h-6 text-white ${
                    taringStatus === 0 ? 'animate-pulse' : ''
                  } ${
                    showMassCalibration ? 'opacity-40' : ''
                  }`}
                  />
                {taringStatus === 1 && (
                  <CheckCircleIcon className={`absolute -bottom-2 -right-1 w-5 h-5 rounded-full ${
                    showMassCalibration ? 'text-gray-300' : 'text-white'
                  }`}/>
                )}
              </div>
              {(!isRecording || showMassCalibration) && (
                <>
                  <PlayIcon
                    className={`w-6 h-6 text-white ${
                      taringStatus !== 1 || showMassCalibration ? 'opacity-40' : ''
                    }`}
                    onClick={() => !showMassCalibration && startMeasurement()}
                    />
                  {Boolean(sensorData.length && !isRecording) && (
                    <DocumentArrowDownIcon 
                      className={`w-6 h-6 text-white ${
                        showMassCalibration ? 'opacity-40' : ''
                      }`}
                      onClick={() => !showMassCalibration && downloadRawData()}/>
                  )}
                </>
              )}
              {(isRecording && !showMassCalibration) && (
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
            <ChevronDoubleDownIcon 
              className={`w-6 h-6 text-white ${
                taringStatus !== 1 ? 'opacity-40' : ''
              } ${
                updatedWorkLoad !== null ? 'border-2 rounded-full p-[0.1rem] animate-pulse' : ''
              }`}
              onClick={() => !isRecording && toggleMassCalibration()}
              />
            <Cog6ToothIcon 
              className="w-6 h-6 text-white"
              onClick={() => !isRecording && toggleSettings()}
              />
          </>
        )}
        {(!isConnected && (!isDeviceAvailable || device)) && (
          <ArrowPathIcon className="w-6 h-6 text-white animate-spin"/>
        )}
      </section>
      {(showSettings && isConnected) && (
        <ForceSettings />
      )}
      {(showMassCalibration && isConnected) && (
         <section
         data-element="non-swipeable"
         className="absolute bottom-0 w-full h-[12vh] flex justify-center items-center gap-8 bg-gradient-to-b from-black/60 to-black rounded-t-lg p-4 text-white"
         >
          <p className="flex-1 text-right text-4xl font-semibold">{(workLoad ?? 0).toFixed(1)} kg</p>
          <div className="flex-1 flex justify-start gap-4">
            {isEstimatingMass ? 
              <StopIcon 
                className="w-14 h-14"
                onClick={stopMassEstimation}
                />
              : <PlayIcon 
                  className="w-14 h-14"
                  onClick={startMassEstimation}
                  />
            }
            {updatedWorkLoad ? 
              <BookmarkIconSolid 
                className="w-14 h-14 text-white font-semibold rounded p-1"
                onClick={handleUpdateWorkLoad} 
                />
              : <BookmarkIcon 
                  className="w-14 h-14 text-white font-semibold rounded p-1"  
                  onClick={handleUpdateWorkLoad}          
                  /> 
            }             
          </div>
        </section>
      )}
    </>
  );
};

export default Index;
