declare global {
  interface Navigator {
    bluetooth: Bluetooth;
  }

  interface BluetoothRemoteGATTCharacteristic extends EventTarget {
    writeValue(value: BufferSource): Promise<void>;
    value: DataView;
    startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
    addEventListener(
      type: string,
      listener: (this: BluetoothRemoteGATTCharacteristic, ev: Event) => void,
      options?: boolean | AddEventListenerOptions
    ): void;
  }

  interface BluetoothDevice extends EventTarget {
    readonly id: string;
    readonly name?: string;
    readonly gatt?: BluetoothRemoteGATTServer;
  }
}

export {}; // Asegura que TypeScript lo reconozca como un módulo
