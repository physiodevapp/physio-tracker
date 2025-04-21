"use client";

import { DataPoint } from '@/components/Force/Graph';
import { Cycle } from '@/utils/force';
import React, { createContext, useState, useRef, useCallback, useContext } from 'react';

// -------------- UUIDs según la documentación de Progressor ------------
const PROGRESSOR_SERVICE_UUID = "7e4e1701-1ea6-40c9-9dcc-13d34ffead57";
const DATA_CHAR_UUID = "7e4e1702-1ea6-40c9-9dcc-13d34ffead57";
const CTRL_POINT_CHAR_UUID = "7e4e1703-1ea6-40c9-9dcc-13d34ffead57";

interface IBluetoothContext {
  device: BluetoothDevice | null;
  isConnected: boolean;
  controlCharacteristic: BluetoothRemoteGATTCharacteristic | null;
  dataCharacteristic: BluetoothRemoteGATTCharacteristic | null;
  isDeviceAvailable: boolean;
  taringStatus: number | null;
  sensorData: DataPoint[];
  rawSensorData: DataPoint[];
  cycles: Cycle[];
  liveCycles: Cycle[];
  setDevice: React.Dispatch<React.SetStateAction<BluetoothDevice | null>>;
  setControlCharacteristic: React.Dispatch<React.SetStateAction<BluetoothRemoteGATTCharacteristic | null>>;
  setDataCharacteristic: React.Dispatch<React.SetStateAction<BluetoothRemoteGATTCharacteristic | null>>;
  setIsConnected: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDeviceAvailable: React.Dispatch<React.SetStateAction<boolean>>;
  setTaringStatus: React.Dispatch<React.SetStateAction<0 | 1 | null>>;
  setSensorData: React.Dispatch<React.SetStateAction<DataPoint[]>>;
  setRawSensorData: React.Dispatch<React.SetStateAction<DataPoint[]>>;
  setCycles: React.Dispatch<React.SetStateAction<Cycle[]>>;
  setLiveCycles: React.Dispatch<React.SetStateAction<Cycle[]>>;
  connectToSensor: () => Promise<void>;
}

export const BluetoothContext = createContext<IBluetoothContext>({
  device: null,
  controlCharacteristic: null,
  dataCharacteristic: null,
  isConnected: false,
  isDeviceAvailable: true,
  taringStatus: null,
  sensorData: [],
  rawSensorData: [],
  cycles: [],
  liveCycles: [],
  setDevice: () => {},
  setControlCharacteristic: () => {},
  setDataCharacteristic: () => {},
  setIsConnected: () => {},
  setIsDeviceAvailable: () => {},
  setTaringStatus: () => {},
  setSensorData: () => {},
  setRawSensorData: () => {},
  setCycles: () => {},
  setLiveCycles: () => {},
  connectToSensor: async () => {
    throw new Error("connectToSensor no está implementado");
  },
});

interface BluetoothProviderProps {
  children: React.ReactNode;
}

export const BluetoothProvider: React.FC<BluetoothProviderProps> = ({ children }) => {
  const [device, setDevice] = useState<BluetoothDevice | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [controlCharacteristic, setControlCharacteristic] = useState<BluetoothRemoteGATTCharacteristic | null>(null);
  const [dataCharacteristic, setDataCharacteristic] = useState<BluetoothRemoteGATTCharacteristic | null>(null);
  const [isDeviceAvailable, setIsDeviceAvailable] = useState(true);
  const [taringStatus, setTaringStatus] = useState<0 | 1 | null>(null);
  const [sensorData, setSensorData] = useState<DataPoint[]>([]);
  const [rawSensorData, setRawSensorData] = useState<DataPoint[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [liveCycles, setLiveCycles] = useState<Cycle[]>([]);
  
  const bluetoothServerRef = useRef(null);

  const connectToSensor = useCallback(async () => {
    try {
      const options = {
        filters: [{ namePrefix: "Progressor" }],
        optionalServices: [PROGRESSOR_SERVICE_UUID],
      };
      console.log("Requesting Bluetooth device...");
      const newDevice = await navigator.bluetooth.requestDevice(options);
      setDevice(newDevice);
      console.log("Connecting to GATT server...");
      const server = await newDevice.gatt.connect();
      bluetoothServerRef.current = server;
      const service = await server.getPrimaryService(PROGRESSOR_SERVICE_UUID);
      const dataCharacteristic = await service.getCharacteristic(DATA_CHAR_UUID);
      await dataCharacteristic.startNotifications();
      setDataCharacteristic(dataCharacteristic);
      // dataCharacteristic.addEventListener("characteristicvaluechanged", handleCharacteristicValueChanged);
      const ctrlCharacteristic = await service.getCharacteristic(CTRL_POINT_CHAR_UUID);
      setControlCharacteristic(ctrlCharacteristic);

      console.log("Connected and listening for notifications...");
      setIsConnected(true);
    } catch (error) {
      console.log("Error connecting to sensor:", error);
      setIsConnected(false);
      setDevice(null);
    }
  }, []);

  const value = {
    device,
    controlCharacteristic,
    dataCharacteristic,
    isConnected,
    isDeviceAvailable,
    taringStatus,
    sensorData,
    rawSensorData,
    cycles,
    liveCycles,
    setDevice,
    setIsConnected,
    setControlCharacteristic,
    setDataCharacteristic,
    setIsDeviceAvailable,
    setTaringStatus,
    setSensorData,
    setRawSensorData,
    setCycles,
    setLiveCycles,
    connectToSensor,
  };

  return (
    <BluetoothContext.Provider value={value}>
      {children}
    </BluetoothContext.Provider>
  );
};

// Hook para usar el detector en cualquier componente
export const useBluetooth = (): IBluetoothContext => {
  const context = useContext(BluetoothContext);
  if (!context) {
    throw new Error('usePoseDetector must be used within a BluetoothProvider');
  }
  return context;
};
