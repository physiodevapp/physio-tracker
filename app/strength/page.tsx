"use client";

import { useState } from "react";

// Definición de comandos
const CMD_TARE_SCALE = 100;
const CMD_START_WEIGHT_MEAS = 101;
const CMD_STOP_WEIGHT_MEAS = 102;
const CMD_START_PEAK_RFD_MEAS = 103;
const CMD_START_PEAK_RFD_MEAS_SERIES = 104;
const CMD_ADD_CALIBRATION_POINT = 105;
const CMD_SAVE_CALIBRATION = 106;
const CMD_GET_APP_VERSION = 107;
const CMD_GET_ERROR_INFORMATION = 108;
const CMD_CLR_ERROR_INFORMATION = 109;
const CMD_ENTER_SLEEP = 110;
const CMD_GET_BATTERY_VOLTAGE = 111;

// Definición de códigos de respuesta
const RES_CMD_RESPONSE = 0;
const RES_WEIGHT_MEAS = 1;
const RES_RFD_PEAK = 2;
const RES_RFD_PEAK_SERIES = 3;
const RES_LOW_PWR_WARNING = 4;

export const StrengthDetector = () => {
  const [device, setDevice] = useState<BluetoothDevice | null>(null);
  const [sensorData, setSensorData] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [controlCharacteristic, setControlCharacteristic] = useState<BluetoothRemoteGATTCharacteristic | null>(null);

  // UUIDs según la documentación de Progressor
  const PROGRESSOR_SERVICE_UUID = "7e4e1701-1ea6-40c9-9dcc-13d34ffead57";
  const DATA_CHAR_UUID = "7e4e1702-1ea6-40c9-9dcc-13d34ffead57";
  const CTRL_POINT_CHAR_UUID = "7e4e1703-1ea6-40c9-9dcc-13d34ffead57";

  const handleCharacteristicValueChanged = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    const dataView = new DataView(value.buffer);

    // Leer el primer byte como código de respuesta
    const responseCode = dataView.getUint8(0);

    // Procesar según el código de respuesta
    if (responseCode === RES_WEIGHT_MEAS) {
      // Leer el tamaño del payload (segundo byte)
      const payloadSize = dataView.getUint8(1);

      // Iterar sobre los bloques de datos: cada medición ocupa 8 bytes
      // Se asume que a partir del byte 2 está el peso (float32) y
      // a partir del byte 6 el timestamp (uint32) en microsegundos
      for (let i = 2; i < dataView.byteLength; i += 8) {
        if (i + 7 < dataView.byteLength) {
          const weight = dataView.getFloat32(i, true);       // peso en kg (float32)
          const rawTimestamp = dataView.getUint32(i + 4, true); // timestamp en microsegundos
          const timeSec = rawTimestamp / 1000000.0;            // convertir a segundos

          // Actualizamos el estado con el último peso recibido
          setSensorData(weight);
        }
      }
    } else if (responseCode === RES_CMD_RESPONSE) {
      // Aquí se puede procesar la respuesta a comandos según sea necesario
    } else if (responseCode === RES_RFD_PEAK) {
      // Procesa los datos del pico RFD según la documentación
    } else if (responseCode === RES_RFD_PEAK_SERIES) {
      // Procesa la serie de picos RFD
    } else if (responseCode === RES_LOW_PWR_WARNING) {
    } else {
    }
  };

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
            <strong>Received Data (last weight):</strong> {sensorData} kg
          </p>
        </div>
      )}
    </div>
  );
};
