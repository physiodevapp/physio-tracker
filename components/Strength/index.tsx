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

const Index = () => {
  const [device, setDevice] = useState<BluetoothDevice | null>(null);
  const [sensorData, setSensorData] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  const [cycles, setCycles] = useState<Array<{ duration: number; peakForce: number }>>([]);
  const [controlCharacteristic, setControlCharacteristic] = useState<BluetoothRemoteGATTCharacteristic | null>(null);

  const calibrationThreshold = 5000; // En milisegundos

  // Estados para los valores calculados tras la calibración
  const [computedBaselineThreshold, setComputedBaselineThreshold] = useState<number | null>(null);
  const [computedMinPeakForce, setComputedMinPeakForce] = useState<number | null>(null);

  // UUIDs según la documentación de Progressor
  const PROGRESSOR_SERVICE_UUID = "7e4e1701-1ea6-40c9-9dcc-13d34ffead57";
  const DATA_CHAR_UUID = "7e4e1702-1ea6-40c9-9dcc-13d34ffead57";
  const CTRL_POINT_CHAR_UUID = "7e4e1703-1ea6-40c9-9dcc-13d34ffead57";

  // --- Variables de calibración (usando refs para evitar re-renderizados en cada dato) ---
  // Estas variables se usarán para almacenar datos durante los primeros 5 segundos.
  const calibrationActiveRef = useRef<boolean>(true);
  const calibrationStartRef = useRef<number>(0); // Almacenaremos el tiempo (en ms) del inicio de la calibración.
  const calibrationDataRef = useRef<number[]>([]);

  // --- Estado interno para el autómata de detección de ciclos ---
  // Se añade 'startTime' para marcar el inicio del ciclo.
  const detectionStateRef = useRef({
    phase: "waiting", // Fases: "waiting", "ascending" o "descending"
    startTime: 0,     // Tiempo en que se inició el ciclo (en segundos, proveniente del sensor)
    peakForce: 0,     // Fuerza máxima alcanzada durante el ciclo
    peakTime: 0,      // Tiempo en que se alcanzó el pico
  });

  // Función para procesar cada medición y detectar ciclos
  const processMeasurement = (force: number, sensorTime: number) => {
    // Durante la calibración (primeros 5 segundos), se acumulan datos para calcular los umbrales
    if (calibrationActiveRef.current) {
      calibrationDataRef.current.push(force);
      // Usamos el tiempo del sistema para determinar cuándo han pasado 5 segundos
      if (Date.now() - calibrationStartRef.current >= calibrationThreshold) {
        // Calcular la media (baseline) y la desviación estándar de los datos recopilados
        const data = calibrationDataRef.current;
        const avg = data.reduce((acc, val) => acc + val, 0) / data.length;

        // Calcular el valor máximo obtenido durante la calibración
        const maxVal = Math.max(...data);

        // Calcular la diferencia entre el pico y la media
        const diff = maxVal - avg;

        // Calcular la varianza y la desviación estándar
        const variance = data.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / data.length;
        const std = Math.sqrt(variance);

        // Decidir qué fórmula usar basándose en la variabilidad de los datos
        let computedMinPeak;
        if (diff < 0.5 || std < 0.1) {
          // Si la diferencia entre el pico y la media es muy baja, o la desviación estándar es muy pequeña,
          // asumimos que la señal tiene poca variabilidad y usamos un incremento pequeño.
          computedMinPeak = avg + 0.5;
        } else {
          // Si hay mayor variabilidad, se utiliza la fórmula original.
          computedMinPeak = avg + Math.max(2, 2 * std);
        }

        // Ajuste adicional: si el umbral calculado es mayor que el máximo observado, lo ajustamos
        if (computedMinPeak > maxVal) {
          // Por ejemplo, podemos usar el baseline más el 90% de la diferencia entre el máximo y la media
          computedMinPeak = avg + diff * 0.9;
        }

        console.log("Media (avg):", avg);
        console.log("Máximo (maxVal):", maxVal);
        console.log("Diferencia (diff):", diff);
        console.log("Desviación estándar (std):", std);
        console.log("Umbral calculado (computedMinPeak):", computedMinPeak);

        setComputedBaselineThreshold(avg);
        setComputedMinPeakForce(computedMinPeak);

        calibrationActiveRef.current = false;

        console.log("Calibración completada. Baseline:", avg, "Min Peak:", computedMinPeak);
      }
      // Durante la calibración no se realiza detección de ciclos.
      return;
    }

    // Una vez finalizada la calibración, usamos los umbrales calculados;
    // en caso de algún error, se usan valores por defecto.
    const baseline = computedBaselineThreshold !== null ? computedBaselineThreshold : 1.0;
    const minPeak = computedMinPeakForce !== null ? computedMinPeakForce : 5.0;

    // --- Autómata para la detección de ciclos ---
    const state = detectionStateRef.current;

    switch (state.phase) {
      case "waiting":
        // Si la fuerza supera el baseline, se inicia el ciclo
        if (force > baseline) {
          state.phase = "ascending";
          state.startTime = sensorTime;  // Se marca el inicio del ciclo
          state.peakForce = force;
          state.peakTime = sensorTime;
        }
        break;

      case "ascending":
        if (force > state.peakForce) {
          // Se actualiza el pico si la fuerza sigue aumentando
          state.peakForce = force;
          state.peakTime = sensorTime;
        } else if (force < state.peakForce) {
          // Si la fuerza empieza a descender, se valida que el pico sea significativo
          if (state.peakForce >= minPeak) {
            state.phase = "descending";
          } else {
            // Si el pico no alcanza el mínimo, se descarta el ciclo y se reinicia
            state.phase = "waiting";
          }
        }
        break;

      case "descending":
        // Cuando la fuerza cae nuevamente por debajo del baseline se considera finalizado el ciclo
        if (force < baseline) {
          const cycleDuration = sensorTime - state.startTime;
          setCycles((prevCycles) => [
            ...prevCycles,
            { duration: cycleDuration, peakForce: state.peakForce },
          ]);
          setCycleCount((prevCount) => prevCount + 1);
          console.log("Ciclo completo detectado. Duración:", cycleDuration, "segundos. Total:", cycleCount + 1);
          // Reiniciar el estado para el siguiente ciclo
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
      // Se asume que cada bloque de medición ocupa 8 bytes:
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
      // Reiniciamos la calibración cada vez que iniciamos la medición:
      calibrationActiveRef.current = true;
      calibrationDataRef.current = [];
      calibrationStartRef.current = Date.now();
      setComputedBaselineThreshold(null);
      setComputedMinPeakForce(null);
      // Reiniciamos el autómata de ciclos si es necesario:
      detectionStateRef.current = { phase: "waiting", startTime: 0, peakForce: 0, peakTime: 0 };

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
