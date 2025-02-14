"use client";

import { CheckCircleIcon, CheckIcon, LinkIcon, LinkSlashIcon, PlayIcon, ScaleIcon, StopIcon } from "@heroicons/react/24/solid";
import { useState, useRef, useEffect } from "react";

// ----------------- Comandos y Códigos -----------------
const CMD_TARE_SCALE = 100;
const CMD_START_WEIGHT_MEAS = 101;
const CMD_STOP_WEIGHT_MEAS = 102;

const RES_CMD_RESPONSE = 0;
const RES_WEIGHT_MEAS = 1;
const RES_RFD_PEAK = 2;
const RES_RFD_PEAK_SERIES = 3;
const RES_LOW_PWR_WARNING = 4;

// ----------------- Parámetros de Validación y Filtrado -----------------
const MIN_CYCLE_DURATION = 0.3; // segundos
const MAX_CYCLE_DURATION = 5.0; // segundos
// const FILTER_WINDOW_SIZE = 5;   // número de muestras para la media móvil

// ----------------- Parámetros de Gravedad -----------------
const GRAVITY = 9.81; // m/s²

// Nota: En modo "fixed" el sensor devuelve kg (masa) y se convierte a newtons multiplicando por GRAVITY.
// En modo "elastic" se usan las tensiones (en kg, que se convierten a newtons) en la posición mínima y máxima.

const Index = () => {
  // --------------- Estados de conexión y datos básicos -----------------
  const [device, setDevice] = useState<BluetoothDevice | null>(null);
  const [sensorData, setSensorData] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  const [cycles, setCycles] = useState<Array<{
    duration: number;
    peakForce: number;
    avgNetForce: number;
    avgAcceleration: number;
    deltaV: number;
  }>>([]);
  const [controlCharacteristic, setControlCharacteristic] = useState<BluetoothRemoteGATTCharacteristic | null>(null);
  const [taringStatus, setTaringStatus] = useState<-1 | 0 | 1>(-1)

  // ------------- Estados para calibración en modo "fixed" -------------
  const [computedBaselineThreshold, setComputedBaselineThreshold] = useState<number | null>(null);
  const [computedMinPeakForce, setComputedMinPeakForce] = useState<number | null>(null);
  const [calibratedMass, setCalibratedMass] = useState<number | null>(null);

  // ----------------- Estados para calibración en modo "elastic" -----------------
  const [elasticMinForce, setElasticMinForce] = useState<number | null>(null);
  const [elasticMaxForce, setElasticMaxForce] = useState<number | null>(null);

  // Estado para elegir el tipo de calibración: "fixed" (movimiento libre) o "elastic" (goma elástica)
  const [calibrationType, setCalibrationType] = useState<"fixed" | "elastic">("fixed");

  // Estado para mostrar en la UI el estado actual de calibración (instrucciones y referencias)
  const [calibrationStatus, setCalibrationStatus] = useState<string>("Mass calibration...");

  // -------------- UUIDs según la documentación de Progressor ------------
  const PROGRESSOR_SERVICE_UUID = "7e4e1701-1ea6-40c9-9dcc-13d34ffead57";
  const DATA_CHAR_UUID = "7e4e1702-1ea6-40c9-9dcc-13d34ffead57";
  const CTRL_POINT_CHAR_UUID = "7e4e1703-1ea6-40c9-9dcc-13d34ffead57";

  // ----------------- Parámetros Ajustables (con sliders) -----------------
  const [toleranceMargin, setToleranceMargin] = useState(0.05); // margen en kg
  const [requiredStableCount, setRequiredStableCount] = useState(3); // muestras consecutivas requeridas
  const [filterWindowSizeState, setFilterWindowSizeState] = useState(5); // tamaño de la ventana para media móvil


  // ----------------- Refs para la Calibración -----------------
  // Para "fixed": fases "mass" y "movement"
  // Para "elastic": fases "elastic-min" y "elastic-max"
  const calibrationActiveRef = useRef<boolean>(true);
  const calibrationPhaseRef = useRef<string>(""); // Se asignará según el modo
  const calibrationStartRef = useRef<number>(0); // Tiempo de inicio de la fase actual (ms)
  const calibrationDataRef = useRef<number[]>([]); // Datos para la fase actual
  const massCalibrationDataRef = useRef<number[]>([]); // Datos para calibración de masa (modo fixed)

  // ----------------- Refs para Filtrado y Derivada -----------------
  const filterWindowRef = useRef<number[]>([]);
  const previousForceRef = useRef<number | null>(null);

  // ----------------- Estado interno para Detección de Ciclos -----------------
  const detectionStateRef = useRef({
    phase: "waiting", // "waiting", "ascending" o "descending"
    startTime: 0,     // tiempo de inicio del ciclo (segundos)
    peakForce: 0,     // pico de fuerza del ciclo
    peakTime: 0,      // tiempo en que se alcanzó el pico
    measurementHistory: [] as Array<{ time: number; force: number }>,
    peakStableCount: 0, // nuevo contador para asegurar que el pico se mantiene
  });

  // ----------------- Función de Procesamiento de Medición -----------------
  const processMeasurement = (force: number, sensorTime: number) => {
    // FILTRADO: Media móvil
    filterWindowRef.current.push(force);
    if (filterWindowRef.current.length > filterWindowSizeState) {
      filterWindowRef.current.shift();
    }
    const filteredForce =
      filterWindowRef.current.reduce((acc, val) => acc + val, 0) /
      filterWindowRef.current.length;

    // Cálculo de la derivada
    let derivative = 0;
    if (previousForceRef.current !== null) {
      derivative = filteredForce - previousForceRef.current;
    }
    previousForceRef.current = filteredForce;

    // CALIBRACIÓN
    if (calibrationActiveRef.current) {
      if (calibrationType === "fixed") {
        // Modo "fixed": Fases "mass" y "movement"
        if (calibrationPhaseRef.current === "") {
          calibrationPhaseRef.current = "mass";
          setCalibrationStatus("Mass calibration. Hold the weight...");
          calibrationStartRef.current = Date.now();
          massCalibrationDataRef.current = [];
        }
        if (calibrationPhaseRef.current === "mass") {
          massCalibrationDataRef.current.push(filteredForce);
          if (Date.now() - calibrationStartRef.current >= 5000) {
            const avgMassForce = massCalibrationDataRef.current.reduce((acc, val) => acc + val, 0) /
              massCalibrationDataRef.current.length;
            // Dado que el sensor ya devuelve kg, la masa se toma como avgMassForce
            const deducedMass = avgMassForce; // sensor devuelve kg
            setCalibratedMass(deducedMass);
            setCalibrationStatus("Movement calibration...");
            calibrationPhaseRef.current = "movement";
            calibrationDataRef.current = [];
            calibrationStartRef.current = Date.now();
          }
        } else if (calibrationPhaseRef.current === "movement") {
          calibrationDataRef.current.push(filteredForce);
          if (Date.now() - calibrationStartRef.current >= 5000) {
            const data = calibrationDataRef.current;
            const avg = data.reduce((acc, val) => acc + val, 0) / data.length;
            const maxVal = Math.max(...data);
            const diff = maxVal - avg;
            const variance = data.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / data.length;
            const std = Math.sqrt(variance);
            let computedMinPeak;
            console.log('===============');
            console.log('computedMinPeak');
            console.log('===============');
            if (diff < 0.5 || std < 0.1) {
              console.log('diff < 0.5 || std < 0.1');
              computedMinPeak = avg + 0.5;
            } else {
              console.log('diff > 0.5 && std > 0.1');
              computedMinPeak = avg + Math.max(2, 2 * std);
            }
            if (computedMinPeak > maxVal) {
              console.log('computedMinPeak > maxVal');
              computedMinPeak = avg + diff * 0.9;
            }
            setComputedBaselineThreshold(avg);
            setComputedMinPeakForce(computedMinPeak);
            calibrationActiveRef.current = false;
            setCalibrationStatus("Calibration completed. Collecting data...");
            console.log("Calibración de movimiento completada. Baseline:", avg, "Min Peak:", computedMinPeak);
          }
        }
      } else if (calibrationType === "elastic") {
        // Modo "elastic": Fases "elastic-min" y "elastic-max"
        if (calibrationPhaseRef.current === "") {
          calibrationPhaseRef.current = "elastic-min";
          setCalibrationStatus("Elastic band calibration: minimum position...");
          calibrationStartRef.current = Date.now();
          calibrationDataRef.current = [];
        }
        if (calibrationPhaseRef.current === "elastic-min") {
          calibrationDataRef.current.push(filteredForce);
          if (Date.now() - calibrationStartRef.current >= 5000) {
            const avgMin = calibrationDataRef.current.reduce((acc, val) => acc + val, 0) / calibrationDataRef.current.length;
            setElasticMinForce(avgMin);
            // Guardamos el valor en una variable local para mostrarlo
            const minRef = avgMin;
            setCalibrationStatus(`Minimun position: ${minRef.toFixed(2)}. Now, maximum position...`);
            calibrationPhaseRef.current = "elastic-max";
            calibrationDataRef.current = [];
            calibrationStartRef.current = Date.now();
          }
        } else if (calibrationPhaseRef.current === "elastic-max") {
          calibrationDataRef.current.push(filteredForce);
          if (Date.now() - calibrationStartRef.current >= 5000) {
            const avgMax = calibrationDataRef.current.reduce((acc, val) => acc + val, 0) / calibrationDataRef.current.length;
            setElasticMaxForce(avgMax);
            calibrationActiveRef.current = false;
            // Se usa el valor mínimo ya calibrado para mostrar las referencias
            setCalibrationStatus(`Calibration completed. References: Min = ${elasticMinForce?.toFixed(2) || "?"} y Max = ${avgMax.toFixed(2)}. Start...`);
            console.log("Elastic band calibration completed. Min Force:", elasticMinForce, "Max Force:", avgMax);
          }
        }
      }
      // Durante la calibración no se detectan ciclos.
      return;
    }

    // ACUMULACIÓN de muestras durante el ciclo
    const state = detectionStateRef.current;
    if (state.phase !== "waiting") {
      state.measurementHistory.push({ time: sensorTime, force: filteredForce });
    }

    // DETECCIÓN de CICLOS
    let baseline = 0.5, minPeak = 1.0;
    if (calibrationType === "fixed") {
      baseline = computedBaselineThreshold !== null ? computedBaselineThreshold : 0.5;
      minPeak = computedMinPeakForce !== null ? computedMinPeakForce : 1.0;
    } else if (calibrationType === "elastic") {
      baseline = elasticMinForce !== null ? elasticMinForce : 0.5;
      if (elasticMinForce !== null && elasticMaxForce !== null) {
        const diffElastic = elasticMaxForce - elasticMinForce;
        minPeak = elasticMinForce + diffElastic * 0.8; // umbral al 80% del rango
      }
    }

    switch (state.phase) {
      case "waiting":
        if (filteredForce > baseline) {
          state.phase = "ascending";
          state.startTime = sensorTime;
          state.peakForce = filteredForce;
          state.peakTime = sensorTime;
          state.measurementHistory = [{ time: sensorTime, force: filteredForce }];
          state.peakStableCount = 1;
        }
        break;
      case "ascending":
        if (filteredForce > state.peakForce) {
          // Si se alcanza un nuevo pico, actualizamos y reiniciamos el contador
          state.peakForce = filteredForce;
          state.peakTime = sensorTime;
          state.peakStableCount = 1;
        }  else {
          // Si la fuerza es muy cercana al pico actual (dentro de un margen de tolerancia)
          if (Math.abs(filteredForce - state.peakForce) < toleranceMargin && filteredForce >= minPeak) {
            state.peakStableCount += 1;
          } else {
            // Opcional: si la señal se aleja, se podría no resetear a 0 sino disminuir el contador.
            state.peakStableCount = Math.max(0, state.peakStableCount - 1);
          }
          // Si la derivada es negativa y el pico se ha mantenido estable durante suficientes muestras, transicionamos a descending
          if (derivative < 0 && state.peakStableCount >= requiredStableCount) {
            state.phase = "descending";
          }
        }
        break;
      case "descending":
        if (filteredForce < baseline) {
          // Verificación adicional: si el pico acumulado es menor que minPeak, descartamos el ciclo.
          if (state.peakForce < minPeak) {
            console.log("Ciclo descartado por no alcanzar el minPeak:", state.peakForce, "<", minPeak);
            state.phase = "waiting";
            state.startTime = 0;
            state.peakForce = 0;
            state.peakTime = 0;
            state.measurementHistory = [];
            break;
          }
          const cycleDuration = sensorTime - state.startTime;
          if (cycleDuration >= MIN_CYCLE_DURATION && cycleDuration <= MAX_CYCLE_DURATION) {
            let netForceSum = 0;
            state.measurementHistory.forEach(sample => {
              if (calibrationType === "fixed") {
                const currentMass = calibratedMass !== null ? calibratedMass : 1.0;
                // Convertir la muestra a newtons (kg * GRAVITY) y restar el peso
                const Fg = currentMass * GRAVITY;
                netForceSum += ((sample.force * GRAVITY) - Fg);
              } else if (calibrationType === "elastic") {
                // En modo elastic se resta la tensión mínima (en kg * GRAVITY)
                netForceSum += ((sample.force * GRAVITY) - (elasticMinForce !== null ? elasticMinForce * GRAVITY : 0));
              }
            });
            const avgNetForce = netForceSum / state.measurementHistory.length;
            const currentMass = calibrationType === "fixed"
              ? (calibratedMass !== null ? calibratedMass : 1.0)
              : 1.0; // Para elastic se puede usar un valor de referencia
            const avgAcceleration = avgNetForce / currentMass;
            const deltaV = avgAcceleration * cycleDuration;
      
            const newCycle = {
              duration: cycleDuration,
              peakForce: state.peakForce,
              avgNetForce: avgNetForce,
              avgAcceleration: avgAcceleration,
              deltaV: deltaV,
            };
      
            setCycles((prevCycles) => [...prevCycles, newCycle]);
            setCycleCount((prevCount) => prevCount + 1);
            console.log("newCycle -> ", newCycle);
          } else {
            console.log("Ciclo descartado por duración no válida:", cycleDuration, "segundos");
          }
          state.phase = "waiting";
          state.startTime = 0;
          state.peakForce = 0;
          state.peakTime = 0;
          state.measurementHistory = [];
          state.peakStableCount = 0;
        }
        break;        
      default:
        state.phase = "waiting";
        break;
    }
  };

  // ----------------- Recepción de Datos del Sensor -----------------
  const handleCharacteristicValueChanged = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    const dataView = new DataView(value.buffer);
    const responseCode = dataView.getUint8(0);

    if (responseCode === RES_WEIGHT_MEAS) {
      for (let i = 2; i < dataView.byteLength; i += 8) {
        if (i + 7 < dataView.byteLength) {
          const force = dataView.getFloat32(i, true);
          const rawTimestamp = dataView.getUint32(i + 4, true);
          const timeSec = rawTimestamp / 1000000.0;
          setSensorData(force);
          processMeasurement(force, timeSec);
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
    }
  };

  // ----------------- Funciones de Conexión y Control -----------------
  const connectToSensor = async () => {
    try {
      const options = {
        filters: [{ namePrefix: "Progressor" }],
        optionalServices: [ PROGRESSOR_SERVICE_UUID ],
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
    } catch (error) {
      console.error("Error connecting to sensor:", error);
    }
  };

  const tareSensor = async () => {
    setTaringStatus(0);
    if (!controlCharacteristic) {
      console.error("Control characteristic not available");
      setTaringStatus(-1);
      return;
    }
    try {
      await controlCharacteristic.writeValue(new Uint8Array([CMD_TARE_SCALE]));
      console.log("Sensor tared");
      setTaringStatus(1);
    } catch (error) {
      console.error("Error taring sensor:", error);
      setTaringStatus(-1);
    }
  };

  const startMeasurement = async () => {
    if (!controlCharacteristic) {
      console.error("Control characteristic not available");
      return;
    }
    try {
      setIsRecording(true);
      calibrationActiveRef.current = true;
      // Reiniciamos las variables de calibración según el modo seleccionado
      calibrationPhaseRef.current = "";
      massCalibrationDataRef.current = [];
      calibrationDataRef.current = [];
      calibrationStartRef.current = Date.now();
      setComputedBaselineThreshold(null);
      setComputedMinPeakForce(null);
      setCalibratedMass(null);
      setCalibrationStatus(calibrationType === "fixed" ? "Mass calibration..." : "Elastic band: minimun position...");
      detectionStateRef.current = { phase: "waiting", startTime: 0, peakForce: 0, peakTime: 0, measurementHistory: [], peakStableCount: 0 };
      filterWindowRef.current = [];
      previousForceRef.current = null;
      await controlCharacteristic.writeValue(new Uint8Array([CMD_START_WEIGHT_MEAS]));
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
      setIsRecording(false);
      setCalibrationStatus("Data collection completed");
      await controlCharacteristic.writeValue(new Uint8Array([CMD_STOP_WEIGHT_MEAS]));
    } catch (error) {
      console.error("Error stopping measurement:", error);
    }
  };

  const disconnectSensor = () => {
    if (device && device.gatt?.connected) {
      device.gatt.disconnect();
      setIsConnected(false);
      setDevice(null);
      setSensorData(null);
      setControlCharacteristic(null);
    }
  };

  useEffect(() => {
    if (isRecording) {
      setCycleCount(0);
      setCycles([]);
    }
  }, [isRecording])

  // ----------------- Renderizado de la UI -----------------
  return (
    <div 
      className="p-5 font-sans"
      >
      {/* Conexión del dispositivo */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Strength tracker</h1>
          {!isConnected && (
            <LinkIcon
              className="w-10 h-10 bg-blue-500 hover:bg-blue-700 text-white font-bold p-2 rounded"
              onClick={connectToSensor}
              />        
          )}
          {isConnected && (
            <LinkSlashIcon
              className="w-10 h-10 bg-red-500 hover:bg-red-700 text-white font-bold p-2 rounded"
              onClick={disconnectSensor}
              />
          )}
      </div>
      {/* Selector para elegir el tipo de calibración */}
      <div className="flex justify-between items-center mb-4">
        <label className="mr-2 font-bold">Calibration type:</label>
        <select
          value={calibrationType}
          onChange={(e) => setCalibrationType(e.target.value as "fixed" | "elastic")}
          className="border p-1"
          disabled={isRecording}
        >
          <option value="fixed">Free weight</option>
          <option value="elastic">Elastic band</option>
        </select>
      </div>
      {/* Tara e inicio del registro de ciclos */}
      <div className="flex justify-between items-center flex-wrap gap-4 mb-4">
        {isConnected && (
          <>
            {!isRecording && (
              <div className="flex gap-4 flex-[0.6]">
                <div className="relative" onClick={tareSensor} >
                  <ScaleIcon
                    className={`w-10 h-10 bg-purple-500 hover:bg-purple-700 text-white font-bold p-2 rounded ${taringStatus === 0 ? 'animate-pulse' : ''}`}
                    />
                  {taringStatus === 1 && (
                    <CheckCircleIcon className="absolute -bottom-2 -right-2 w-6 h-6 text-white rounded-full bg-green-500 font-bold"/>
                  )}
                </div>
                <PlayIcon
                  className={`w-10 h-10 ${taringStatus === 1 ? 'bg-green-500 hover:bg-green-700' : 'bg-gray-500'} text-white font-bold p-2 rounded`}
                  onClick={() => taringStatus === 1 && startMeasurement()}
                  />
              </div>
            )}
            {isRecording && (
              <div className="flex flex-[0.6]">
                <StopIcon
                  className="w-10 h-10 bg-yellow-500 hover:bg-yellow-600 text-white font-bold p-2 rounded"
                  onClick={stopMeasurement} 
                  />
              </div>
            )}
            {device && (
              <div className="flex-1">
                <p><strong>Device:</strong> {device.name}</p>
                <p><strong>Status:</strong> {isConnected ? "Connected" : "Disconnected"}</p>
              </div>
            )}
          </>
        )}
        {!isConnected && (
          <p className="text-gray-500">No device is connected</p>
        )}
      </div>
      {/* Controles para ajustar umbrales de detección de ciclos*/}
      {(isConnected) && (
        <div 
          data-element="non-swipeable"
          className="flex flex-wrap justify-between"
          >
          <div className="mb-4 flex justify-between items-center flex-1">
            <label className="mr-2 font-bold flex-[1]">Tolerance (kg):</label>
            <div className="flex-[0.8] flex items-center">
              <input
                type="range"
                min="0.01"
                max="0.2"
                step="0.01"
                value={toleranceMargin}
                onChange={(e) => setToleranceMargin(parseFloat(e.target.value))}
              />
              <span className="ml-2">{toleranceMargin.toFixed(2)}</span>
            </div>
          </div>
          <div className="mb-4 flex justify-between items-center flex-1">
            <label className="mr-2 font-bold flex-[1]">Stability <span className="align-sub uppercase text-[0.6rem]">peak</span> :</label>
            <div className="flex-[0.8] flex items-center">
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={requiredStableCount}
                onChange={(e) => setRequiredStableCount(parseInt(e.target.value))}
              />
              <span className="ml-2">{requiredStableCount}</span>
            </div>
          </div>
          <div className="mb-4 flex justify-between items-center flex-1">
            <label className="mr-2 font-bold flex-[1]">Smoothness:</label>
            <div className="flex-[0.8] flex items-center">
              <input
                type="range"
                min="3"
                max="10"
                step="1"
                value={filterWindowSizeState}
                onChange={(e) => setFilterWindowSizeState(parseInt(e.target.value))}
              />
              <span className="ml-2">{filterWindowSizeState}</span>
            </div>
          </div>
        </div>
      )}
      {/* Datos de los ciclos registrados y calibraciones iniciales*/}
      {sensorData !== null && (
        <div className="mb-4">
          {calibrationStatus && (
            <div>
              <p><strong>Calibration status:</strong></p>
              <p>{calibrationStatus}</p>
            </div>
          )}
          <div className="flex gap-6 mt-4">
            <p><strong>Nº of cycles:</strong> {cycleCount}</p>
            <p><strong>Current force:</strong> {sensorData.toFixed(2)} kg</p>
          </div>
          {cycles.length > 0 && (
            <div className="h-[20vh] mt-4 pb-6">
              <h2 className="font-bold">Cycle details:</h2>
              <ul className="h-full overflow-y-scroll">
                {cycles.map((cycle, index) => (
                  <li key={index}>
                    <p className="italic">
                      <span className="underlined">Cycle {index + 1}:</span> Duration = {cycle.duration.toFixed(2)} s, Peak = {cycle.peakForce.toFixed(2)} kg, 
                    </p>
                    <p>
                      Δv = {cycle.deltaV.toFixed(2)} m/s
                    </p> 
                    {/* <p>
                      F<span className="align-sub text-sm">prom</span> = {cycle.avgNetForce.toFixed(2)} N, a<span className="align-sub text-sm">prom</span> = {cycle.avgAcceleration.toFixed(2)} m/s²
                    </p> */}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {calibrationType === "fixed" && (
            <div className="mt-4">
              <p><strong>Calibration (kg):</strong></p>
              <div className="flex justify-between gap-2">
                {calibratedMass !== null && (
                  <p>Mass {calibratedMass.toFixed(2)}</p>
                )}
                {(computedBaselineThreshold !== null && computedMinPeakForce !== null) && (
                  <>
                    <p>Baseline = {computedBaselineThreshold.toFixed(2)}</p> 
                    <p>Min <span className="align-sub text-[0.6rem] uppercase">peak</span> = {computedMinPeakForce.toFixed(2)}</p>
                  </>
                )}
              </div>
            </div>
          )}
          {calibrationType === "elastic" && elasticMinForce !== null && elasticMaxForce !== null && (
            <div className="mt-4">
              <p>
                <strong>Calibración de goma elástica:</strong> Posición mínima = {elasticMinForce.toFixed(2)}; Posición máxima = {elasticMaxForce.toFixed(2)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Index;
