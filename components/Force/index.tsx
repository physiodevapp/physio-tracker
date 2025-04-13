"use client";

import { useState, useRef, useEffect, useContext } from "react";
import { ArrowPathIcon, Battery0Icon, CheckCircleIcon, Cog6ToothIcon, LinkIcon, LinkSlashIcon, PlayIcon, ScaleIcon, StopIcon, TrashIcon, XMarkIcon, Bars3Icon, BookmarkIcon as BookmarkIconSolid } from "@heroicons/react/24/solid";
import { BookmarkIcon, DocumentArrowDownIcon } from "@heroicons/react/24/outline";
import ForceChart from "./Graph";
import { useSettings } from "@/providers/Settings";
import ForceSettings from "@/modals/ForceGraphSettings";
import Image from "next/image";
import { motion } from "framer-motion";
import { BluetoothContext } from "@/providers/Bluetooth";
import { DataPoint } from "./PostGraph";

// ----------------- Comandos y Códigos -----------------
const CMD_TARE_SCALE = 100;
const CMD_START_WEIGHT_MEAS = 101;
const CMD_STOP_WEIGHT_MEAS = 102;
const CMD_ENTER_SLEEP = 110;
// const CMD_GET_BATTERY_VOLTAGE = 111

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

  const autoStopTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Declaramos un estado y una ref para medir la frecuencia
  const measurementStartRef = useRef<number | null>(null);
  const sampleCount = useRef<number>(0);
  const maxSensorDataRef = useRef<number>(815); // Valor inicial aproximado para 10 segundos
  const timeWindow = 10_000_000; // 10 segundos en microsegundos
  
  // ------------ Referencia para almacenar las líneas del CSV ---------------
  const sensorRawDataLogRef = useRef<string[]>([]);

  // --------------- Estados de conexión y datos básicos -----------------
  const {
    device,
    controlCharacteristic,
    dataCharacteristic,
    isConnected,
    isDeviceAvailable,
    taringStatus,
    sensorData,
    rawSensorData,
    setDevice,
    setControlCharacteristic,
    setIsConnected,
    setIsDeviceAvailable,
    setTaringStatus,
    setSensorData,
    setRawSensorData,
    connectToSensor,
  } = useContext(BluetoothContext);

  const [isRecording, setIsRecording] = useState(false);
  const [isBatteryDead, setIsBatteryDead] = useState(false);

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
    
    // Comprueba si han pasado timeWindow segundos (en microsegundos)
    // const timeWindow = 10_000_000;
    if (
      measurementStartRef.current &&
      (sensorTime - measurementStartRef.current) >= timeWindow
    ) {
      const samplesIn10Sec = sampleCount.current + 1; // Incluyendo el dato actual
      // console.log("Muestras en 10 segundos:", samplesIn10Sec);
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
  useEffect(() => {
    // Solo añade el listener si la característica está disponible
    if (dataCharacteristic) {
      dataCharacteristic.addEventListener("characteristicvaluechanged", handleCharacteristicValueChanged);
      // Asegúrate de remover el listener en la limpieza
      return () => {
        dataCharacteristic.removeEventListener("characteristicvaluechanged", handleCharacteristicValueChanged);

        setSensorData([]);
      };
    }
  }, [dataCharacteristic]);

  const tareSensor = async () => {
    if (!controlCharacteristic) {
      console.log("Control characteristic not available");
      setTaringStatus(0);
      return;
    }
    try {
      setTaringStatus(0);
      // await stopMeasurement();
      await controlCharacteristic.writeValue(new Uint8Array([CMD_TARE_SCALE]));
      console.log('Tared');
      setTaringStatus(1);
    } catch (error) {
      console.log("Error taring sensor:", error);
      setTaringStatus(0);
    }
  };

  const startMeasurement = async () => {
    if (taringStatus !== 1) return;
    if (!controlCharacteristic) {
      console.log("Control characteristic not available");
      return;
    }
    try {      
      previousFilteredForceRef.current = null;     
      setSensorData([]); 
      measurementStartRef.current = null;
      sensorRawDataLogRef.current = [];
      setRawSensorData([]);
      setIsRecording(true);
      await controlCharacteristic.writeValue(new Uint8Array([CMD_START_WEIGHT_MEAS]));

      // ------ AUTO-STOP después de 30 segundos (30_000 ms) ------
      if (autoStopTimeoutRef.current) {
        clearTimeout(autoStopTimeoutRef.current);
      }
      autoStopTimeoutRef.current = setTimeout(() => {
        stopMeasurement();
      }, 30_000);
      } catch (error) {
        console.log("Error starting measurement:", error);
      }
  };

  const stopMeasurement = async () => {
    if (!controlCharacteristic) {
      console.log("Control characteristic not available");
      return;
    }
    try {
      setIsRecording(false);
      const parsedData = transformRawData(sensorRawDataLogRef.current);
      setRawSensorData(parsedData);
      if (autoStopTimeoutRef.current) {
        clearTimeout(autoStopTimeoutRef.current);
      }
      await controlCharacteristic.writeValue(new Uint8Array([CMD_STOP_WEIGHT_MEAS]));
    } catch (error) {
      console.log("Error stopping measurement:", error);
    }
  };

  const transformRawData = (rawCsvLines: string[]): DataPoint[] => {
    return rawCsvLines
      .slice(1) // Ignora el encabezado "timestamp,force"
      .map((line) => {
        const [rawTime, rawForce] = line.split(",");
        const time = Number(rawTime); // Mantener en µs 
        const force = Number(rawForce);
        return { time, force };
      })
      .filter((point) => !isNaN(point.time) && !isNaN(point.force)); // Filtrar valores inválidos
  };

  const startMassEstimation = async() => {
    if (taringStatus !== 1) return;
    if (!controlCharacteristic) {
      console.log("Control characteristic not available");
      return;
    }
    try { 
      await controlCharacteristic.writeValue(new Uint8Array([CMD_START_WEIGHT_MEAS]));  
      setIsEstimatingMass(true); 
    } catch (error) {
      console.log("Error starting measurement:", error);
    }
  }

  const stopMassEstimation = async () => {
    if (!controlCharacteristic) {
      console.log("Control characteristic not available");
      return;
    }
    try {
      await controlCharacteristic.writeValue(new Uint8Array([CMD_STOP_WEIGHT_MEAS]));
      setIsEstimatingMass(false);  
    } catch (error) {
      console.log("Error stopping measurement:", error);
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
    }, 12_000);
    console.log('Device shut down');
    if (!controlCharacteristic) {
      console.log("Control characteristic not available");
      return;
    }
    try {
      await controlCharacteristic.writeValue(new Uint8Array([CMD_ENTER_SLEEP]));   
    } catch (error) {
      console.log("Error shutting down the device:", error);
    }
  };

  // Generar el archivo CSV y disparar la descarga
  const downloadRawData = () => {
    const header = "timestamp,force";
    const linesWithHeader = [header, ...sensorRawDataLogRef.current];
    const csvContent = linesWithHeader.join("\n");
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
    if (taringStatus !== 1) return;
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
  };

  useEffect(() => {
    const executeStopMassEstimation = async () => {
      if (updatedWorkLoad !== null) {
        await stopMassEstimation();
      }
    };

    executeStopMassEstimation();

}, [updatedWorkLoad]);  

  useEffect(() => {
    showMassCalibrationRef.current = showMassCalibration;
  }, [showMassCalibration]);

  useEffect(() => {
    return () => {
      if (autoStopTimeoutRef.current) {
        clearTimeout(autoStopTimeoutRef.current);
      }
    }
  }, []);

  const handleStartTest= async () => {
    if (showMassCalibration) return;

    await startMeasurement();
  }
  const handleStopTest = async () => {
    await stopMeasurement();
  }

  // ----------------- Renderizado de la UI -----------------
  return (
    <>
      <motion.h1
        initial={{ y: 0, opacity: 1 }}
        animate={{ y: isMainMenuOpen ? -48 : 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 100, damping: 15 }}
        className="absolute z-10 inset-x-0 mx-auto w-[50vw] text-center text-xl text-white bg-[#5dadec]/60 dark:bg-black/40 
        rounded-full py-2 px-4 font-bold mt-2 whitespace-nowrap"
      >
        Force Tracker
      </motion.h1>
      <div
        className={`relative h-dvh pb-5 px-2 transition-all duration-300 ease-in-out ${
          isMainMenuOpen ? "pt-16" : "pt-16"
        }`}
        onClick={handleMainLayer}
        >
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
            <div className={`flex-1 flex justify-center items-center mt-1`}
              >
              <p className={`text-xl ${
                  showMassCalibration ? 'opacity-40' : ''
                }`}
                >
                Now: {(sensorData.length > 0 && isRecording) 
                ? <span className={isRecording ? 'animate-pulse' : ''}>{sensorData[sensorData.length - 1].force.toFixed(1)} kg</span> 
                : "0.0 kg"}
              </p>
            </div>
          )}
          {!isConnected && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-gray-500">No device is connected</p>
             <Image 
              className="rounded-xl"
              src="/tindeq.png"
              alt="tindeq logo"
              width={100}
              height={100}
              priority 
              /> 
            </div>
          )}
        </div>
        {isConnected && (
          <div>
            {/* Gráfico */}
            <ForceChart 
              sensorData={sensorData}
              rawSensorData={rawSensorData}
              displayAnnotations={isConnected}
              isEstimatingMass={showMassCalibration}
              workLoad={updatedWorkLoad}
              settings={settings.force}
              isRecording={isRecording}
              />
          </div>
        )}
      </div>
      <section 
        data-element="non-swipeable"
        className="absolute top-1 left-1 p-2 z-10 flex flex-col justify-between gap-6 bg-[#5dadec]/60 dark:bg-black/40 rounded-full"
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
          {(device && isConnected) && (
            <>
              {(sensorData.length === 0 || isRecording) && (
                <>
                  <div 
                    className="relative" 
                    onClick={() => !showMassCalibration && !isRecording && tareSensor()}
                    >
                    <ScaleIcon
                      className={`w-6 h-6 text-white ${
                        taringStatus === 0 ? 'animate-pulse' : ''
                      } ${
                        (showMassCalibration || isRecording) ? 'opacity-40' : ''
                      }`}
                      />
                    {taringStatus === 1 && (
                      <CheckCircleIcon className={`absolute -bottom-2 -right-1 w-5 h-5 rounded-full ${
                        showMassCalibration ? 'text-gray-300' : 'text-white'
                      }`}/>
                    )}
                  </div>
                  <p 
                    className={`w-6 h-6 text-white text-center leading-[normal] ${
                      taringStatus !== 1 || isRecording ? 'opacity-40' : ''
                    } ${
                      updatedWorkLoad !== null ? 'text-md border-2 rounded-full p-[0.1rem] animate-pulse' : 'text-2xl'
                    }`}
                    onClick={() => !isRecording && toggleMassCalibration()}
                    > N
                  </p>
                </>
              )}
              {(!isRecording || showMassCalibration) && (
                <>
                  {(sensorData.length === 0 && !showMassCalibration && !showSettings) ? (
                    <div className="fixed bottom-4 left-0 right-0 px-2 flex items-center">
                      <button
                        className={`w-full bg-[#5dadec] hover:bg-[#5dadec]/80 text-white font-bold text-lg px-6 py-2 rounded-lg uppercase transition ${
                          taringStatus !== 1 ? 'opacity-40' : ''
                        }`}
                        onClick={handleStartTest}
                        >
                        Start
                      </button>
                    </div> ) : null
                  }
                  {sensorData.length > 0 ? (
                    <TrashIcon
                      className="h-6 w-6 text-red-500 cursor-pointer"
                      onClick={() => {
                        setSensorData([]);
                      
                        sensorRawDataLogRef.current = [];
                        setRawSensorData([]);
                      }}
                      />
                    ) : null
                  }
                  {Boolean(sensorData.length && !isRecording) && (
                    <DocumentArrowDownIcon 
                      className={`w-6 h-6 text-white ${
                        showMassCalibration ? 'opacity-40' : ''
                      }`}
                      onClick={() => !showMassCalibration && downloadRawData()}/>
                  )}
                </>
              )}
              {(isRecording && !showMassCalibration) ? (
                <div className="fixed z-40 bottom-4 left-0 right-0 px-2 flex items-center">
                  <button
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold text-lg px-4 py-2 rounded-lg uppercase animate-pulse"
                    onClick={handleStopTest}
                    >
                    Stop
                  </button>
                </div> ) : null 
              }
            </>
          )}
        </>
      </section>
      <section 
        data-element="non-swipeable"
        className="absolute top-1 right-1 p-2 z-10 flex flex-col justify-between items-center gap-6 bg-[#5dadec]/60 dark:bg-black/40 rounded-full"
        >
        {((isDeviceAvailable && !device)) && (
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
            <Cog6ToothIcon 
              className={`w-6 h-6 ${
                (isRecording || sensorData.length) ? "text-white/60" : "text-white"
              }`}
              onClick={() => !isRecording && !sensorData.length && toggleSettings()}
              />
          </>
        )}
        {(!isConnected && (!isDeviceAvailable || device)) && (
          <ArrowPathIcon className="w-6 h-6 text-white animate-spin"/>
        )}
      </section>
      {(showSettings && isConnected) && (
        <ForceSettings/>
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
                className="w-14 h-14 text-green-500 animate-pulse"
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
                  className={`w-14 h-14 text-white font-semibold rounded p-1 ${
                    ((workLoad ?? 0) > 0.1) ? '' : 'opacity-40'
                  }`}  
                  onClick={() => ((workLoad ?? 0.1) > 0) && handleUpdateWorkLoad()}          
                  /> 
            }             
          </div>
        </section>
      )}
    </>
  );
};

export default Index;
