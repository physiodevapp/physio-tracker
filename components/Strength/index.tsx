"use client";

import { useState, useRef } from "react";

// Definición de comandos
const CMD_TARE_SCALE = 100;
const CMD_START_WEIGHT_MEAS = 101;
const CMD_STOP_WEIGHT_MEAS = 102;
// Otros comandos comentados...

// Definición de códigos de respuesta
const RES_CMD_RESPONSE = 0;
const RES_WEIGHT_MEAS = 1;
const RES_RFD_PEAK = 2;
const RES_RFD_PEAK_SERIES = 3;
const RES_LOW_PWR_WARNING = 4;

// Parámetros para la validación del ciclo
const MIN_CYCLE_DURATION = 0.3; // Duración mínima del ciclo (segundos)
const MAX_CYCLE_DURATION = 5.0; // Duración máxima del ciclo (segundos)

// Parámetros para el filtrado
const FILTER_WINDOW_SIZE = 5; // Número de muestras para la media móvil

const Index = () => {
  const [device, setDevice] = useState<BluetoothDevice | null>(null);
  const [sensorData, setSensorData] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  const [cycles, setCycles] = useState<Array<{ duration: number; peakForce: number }>>([]);
  const [controlCharacteristic, setControlCharacteristic] = useState<BluetoothRemoteGATTCharacteristic | null>(null);

  // Estados para los valores calculados tras la calibración
  const [computedBaselineThreshold, setComputedBaselineThreshold] = useState<number | null>(null);
  const [computedMinPeakForce, setComputedMinPeakForce] = useState<number | null>(null);

  // UUIDs según la documentación de Progressor
  const PROGRESSOR_SERVICE_UUID = "7e4e1701-1ea6-40c9-9dcc-13d34ffead57";
  const DATA_CHAR_UUID = "7e4e1702-1ea6-40c9-9dcc-13d34ffead57";
  const CTRL_POINT_CHAR_UUID = "7e4e1703-1ea6-40c9-9dcc-13d34ffead57";

  // --- Variables y refs para la calibración ---
  // Durante los primeros 5 segundos se acumulan datos para determinar los umbrales.
  const calibrationActiveRef = useRef<boolean>(true);
  const calibrationStartRef = useRef<number>(0); // Tiempo de inicio de la calibración (ms)
  const calibrationDataRef = useRef<number[]>([]);

  // --- Refs para el filtrado y cálculo de derivada ---
  const filterWindowRef = useRef<number[]>([]);
  const previousForceRef = useRef<number | null>(null);

  // --- Estado interno para el autómata de detección de ciclos ---
  // Se registra la fase, el tiempo de inicio del ciclo y el pico alcanzado.
  const detectionStateRef = useRef({
    phase: "waiting", // Puede ser "waiting", "ascending" o "descending"
    startTime: 0,     // Tiempo de inicio del ciclo (segundos)
    peakForce: 0,     // Fuerza máxima alcanzada durante el ciclo
    peakTime: 0,      // Tiempo en que se alcanzó el pico
  });

  /**
   * Función para procesar cada medición:
   * - Aplica un filtro de media móvil.
   * - Durante la calibración, acumula datos.
   * - Después, utiliza la señal filtrada para detectar ciclos, validando la duración.
   */
  const processMeasurement = (force: number, sensorTime: number) => {
    // --- FILTRADO: Media móvil ---
    filterWindowRef.current.push(force);
    if (filterWindowRef.current.length > FILTER_WINDOW_SIZE) {
      filterWindowRef.current.shift();
    }
    const filteredForce =
      filterWindowRef.current.reduce((acc, val) => acc + val, 0) /
      filterWindowRef.current.length;

    // Cálculo de la derivada (cambio entre la muestra actual y la anterior)
    let derivative = 0;
    if (previousForceRef.current !== null) {
      derivative = filteredForce - previousForceRef.current;
    }
    previousForceRef.current = filteredForce;

    // --- CALIBRACIÓN ---
    if (calibrationActiveRef.current) {
      calibrationDataRef.current.push(filteredForce);
      // Verifica si han pasado 5 segundos desde el inicio de la calibración.
      if (Date.now() - calibrationStartRef.current >= 5000) {
        // Calcular la media (baseline) de los datos de calibración.
        const data = calibrationDataRef.current;
        const avg = data.reduce((acc, val) => acc + val, 0) / data.length;
        // Calcular el valor máximo.
        const maxVal = Math.max(...data);
        const diff = maxVal - avg;
        // Calcular la desviación estándar.
        const variance = data.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / data.length;
        const std = Math.sqrt(variance);

        // Seleccionar la fórmula de umbral en función de la variabilidad.
        let computedMinPeak;
        if (diff < 0.5 || std < 0.1) {
          computedMinPeak = avg + 0.5;
        } else {
          computedMinPeak = avg + Math.max(2, 2 * std);
        }
        // Ajuste adicional: si computedMinPeak es mayor que el máximo observado, lo adaptamos.
        if (computedMinPeak > maxVal) {
          computedMinPeak = avg + diff * 0.9;
        }

        setComputedBaselineThreshold(avg);
        setComputedMinPeakForce(computedMinPeak);
        calibrationActiveRef.current = false;

        console.log("===========");
        console.log("CALIBRATION");
        console.log("===========");
        console.log("Media (avg):", avg);
        console.log("Máximo (maxVal):", maxVal);
        console.log("Diferencia (diff):", diff);
        console.log("Desviación estándar (std):", std);
        console.log("Umbral calculado (computedMinPeak):", computedMinPeak);
        console.log("Calibración completada. Baseline:", avg, "Min Peak:", computedMinPeak);
      }
      // Durante la calibración no se detectan ciclos.
      return;
    }

    // --- DETECCIÓN DE CICLOS ---
    // Utiliza los umbrales calculados (o valores por defecto si algo falla)
    const baseline = computedBaselineThreshold !== null ? computedBaselineThreshold : 0.5;
    const minPeak = computedMinPeakForce !== null ? computedMinPeakForce : 1.0;

    const state = detectionStateRef.current;

    switch (state.phase) {
      case "waiting":
        // Si la señal filtrada supera el baseline, se inicia el ciclo.
        if (filteredForce > baseline) {
          state.phase = "ascending";
          state.startTime = sensorTime;
          state.peakForce = filteredForce;
          state.peakTime = sensorTime;
        }
        break;

      case "ascending":
        // Actualizamos el pico mientras la fuerza siga aumentando.
        if (filteredForce > state.peakForce) {
          state.peakForce = filteredForce;
          state.peakTime = sensorTime;
        }
        // Si la derivada es negativa (la señal empieza a descender), consideramos haber alcanzado el pico.
        else if (derivative < 0) {
          if (state.peakForce >= minPeak) {
            state.phase = "descending";
          } else {
            // Si el pico no es significativo, reiniciamos el ciclo.
            state.phase = "waiting";
          }
        }
        break;

      case "descending":
        // Cuando la señal cae por debajo del baseline, consideramos finalizado el ciclo.
        if (filteredForce < baseline) {
          // Capturamos el valor actual en variables locales antes de reiniciar
          const detectedPeakForce = state.peakForce;
          const detectedCycleDuration = sensorTime - state.startTime;
          // Creamos un nuevo objeto (copia inmutable) con esos valores
          const newCycle = {
            duration: detectedCycleDuration,
            peakForce: detectedPeakForce,
          };
          // Validamos que la duración esté dentro de un rango razonable.
          if (detectedCycleDuration >= MIN_CYCLE_DURATION && detectedCycleDuration <= MAX_CYCLE_DURATION) {
            setCycles((prevCycles) => [
              ...prevCycles,
              newCycle,
            ]);
            setCycleCount((prevCount) => prevCount + 1);
            console.log(
              "Ciclo válido detectado. Duración:",
              detectedCycleDuration,
              "segundos. Peak Force: ",
              detectedPeakForce,
              " Total de ciclos:",
              cycleCount + 1,
            );
          } else {
            console.log("Ciclo descartado por duración no válida:", detectedCycleDuration, "segundos");
          }
          // Reiniciamos el estado para detectar el siguiente ciclo.
          state.phase = "waiting";
          state.startTime = 0;
          state.peakForce = 0;
          state.peakTime = 0;
        }
        break;

      default:
        state.phase = "waiting";
        break;
    }
  };

  // Función que recibe los datos del sensor
  const handleCharacteristicValueChanged = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    const dataView = new DataView(value.buffer);

    // Leer el primer byte como código de respuesta
    const responseCode = dataView.getUint8(0);

    if (responseCode === RES_WEIGHT_MEAS) {
      // Cada bloque de medición ocupa 8 bytes:
      // - Bytes 2 a 5: valor de fuerza (float32)
      // - Bytes 6 a 9: timestamp (uint32) en microsegundos
      for (let i = 2; i < dataView.byteLength; i += 8) {
        if (i + 7 < dataView.byteLength) {
          const force = dataView.getFloat32(i, true); // Valor de fuerza (por ejemplo, en kg o N)
          const rawTimestamp = dataView.getUint32(i + 4, true); // Timestamp en microsegundos
          const timeSec = rawTimestamp / 1000000.0; // Convertir a segundos

          // Actualizamos el estado con la última fuerza recibida
          setSensorData(force);
          // Procesamos la medición (calibración o detección de ciclo)
          processMeasurement(force, timeSec);
        }
      }
    } else if (responseCode === RES_CMD_RESPONSE) {
      // Procesar respuesta a comandos según se requiera
    } else if (responseCode === RES_RFD_PEAK) {
      // Procesar datos del pico RFD
    } else if (responseCode === RES_RFD_PEAK_SERIES) {
      // Procesar la serie de picos RFD
    } else if (responseCode === RES_LOW_PWR_WARNING) {
      // Manejar advertencia de baja potencia
    } else {
      // Otros casos
    }
  };

  // Función para conectar al sensor
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
      setIsConnected(true);

      const service = await server.getPrimaryService(PROGRESSOR_SERVICE_UUID);

      // Suscribirse a las notificaciones de la característica de datos
      const dataCharacteristic = await service.getCharacteristic(DATA_CHAR_UUID);
      await dataCharacteristic.startNotifications();
      dataCharacteristic.addEventListener("characteristicvaluechanged", handleCharacteristicValueChanged);

      // Obtener la característica de control para enviar comandos
      const controlChar = await service.getCharacteristic(CTRL_POINT_CHAR_UUID);
      setControlCharacteristic(controlChar);

      console.log("Connected and listening for notifications...");
    } catch (error) {
      console.error("Error connecting to sensor:", error);
    }
  };

  // Función para tarar el sensor usando CMD_TARE_SCALE (valor 100)
  const tareSensor = async () => {
    if (!controlCharacteristic) {
      console.error("Control characteristic not available");
      return;
    }
    try {
      await controlCharacteristic.writeValue(new Uint8Array([CMD_TARE_SCALE]));
      console.log("Sensor tared");
    } catch (error) {
      console.error("Error taring sensor:", error);
    }
  };

  // Función para iniciar la medición usando CMD_START_WEIGHT_MEAS (valor 101)
  const startMeasurement = async () => {
    if (!controlCharacteristic) {
      console.error("Control characteristic not available");
      return;
    }
    try {
      // Reiniciamos la calibración cada vez que se inicie la medición.
      calibrationActiveRef.current = true;
      calibrationDataRef.current = [];
      calibrationStartRef.current = Date.now();
      setComputedBaselineThreshold(null);
      setComputedMinPeakForce(null);
      // Reiniciamos el autómata de detección de ciclos.
      detectionStateRef.current = { phase: "waiting", startTime: 0, peakForce: 0, peakTime: 0 };

      // También reiniciamos el filtro.
      filterWindowRef.current = [];
      previousForceRef.current = null;

      await controlCharacteristic.writeValue(new Uint8Array([CMD_START_WEIGHT_MEAS]));
    } catch (error) {
      console.error("Error starting measurement:", error);
    }
  };

  // Función para detener la medición usando CMD_STOP_WEIGHT_MEAS (valor 102)
  const stopMeasurement = async () => {
    if (!controlCharacteristic) {
      console.error("Control characteristic not available");
      return;
    }
    try {
      await controlCharacteristic.writeValue(new Uint8Array([CMD_STOP_WEIGHT_MEAS]));
    } catch (error) {
      console.error("Error stopping measurement:", error);
    }
  };

  // Función para desconectar el sensor
  const disconnectSensor = () => {
    if (device && device.gatt?.connected) {
      device.gatt.disconnect();
      setIsConnected(false);
      setDevice(null);
      setSensorData(null);
      setControlCharacteristic(null);
    }
  };

  return (
    <div className="p-5 font-sans">
      <h1 className="text-2xl font-bold mb-4">Next.js MVP with Web Bluetooth</h1>
      <div className="flex flex-wrap gap-4 mb-4">
        <button
          onClick={connectToSensor}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Connect to Progressor Sensor
        </button>
        {isConnected && (
          <>
            <button
              onClick={tareSensor}
              className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded"
            >
              Tare
            </button>
            <button
              onClick={startMeasurement}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
              Start
            </button>
            <button
              onClick={stopMeasurement}
              className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded"
            >
              Stop
            </button>
            <button
              onClick={disconnectSensor}
              className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
            >
              Disconnect
            </button>
          </>
        )}
      </div>
      {device && (
        <div className="mb-4">
          <p>
            <strong>Device:</strong> {device.name}
          </p>
          <p>
            <strong>Status:</strong> {isConnected ? "Connected" : "Disconnected"}
          </p>
        </div>
      )}
      {sensorData !== null && (
        <div>
          <p>
            <strong>Received Force (last value):</strong> {sensorData} kg
          </p>
          <p>
            <strong>Cycle Count:</strong> {cycleCount}
          </p>
          {cycles.length > 0 && (
            <div>
              <h2 className="font-bold mt-4">Detalles de cada ciclo:</h2>
              <ul>
                {cycles.map((cycle, index) => (
                  <li key={index}>
                    Ciclo {index + 1}: Duración = {cycle.duration.toFixed(2)} seg, Pico = {cycle.peakForce.toFixed(2)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {computedBaselineThreshold !== null && computedMinPeakForce !== null && (
            <div className="mt-4">
              <p>
                <strong>Calibración:</strong> Baseline = {computedBaselineThreshold.toFixed(2)}; Min Peak = {computedMinPeakForce.toFixed(2)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Index;
