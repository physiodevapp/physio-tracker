// types for bluetooth connection

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
  // Puedes agregar otros miembros que necesites según la documentación
}

// types for opencv
export interface Mat {
  rows: number;
  cols: number;
  type(): number;
  delete(): void;
  // Puedes agregar otros métodos que necesites
}

export interface MatConstructor {
  new (): Mat;
  new (rows: number, cols: number, type: number, scalar?: number[]): Mat;
}

export interface MatVector {
  size(): number;
  delete(): void;
  get(i: number): Mat;
}

export interface MatVectorConstructor {
  new (): MatVector;
}

export interface CVModule {
  onRuntimeInitialized?: () => void;
  imread(canvas: HTMLCanvasElement): Mat;
  cvtColor(src: Mat, dst: Mat, code: number, dstCn?: number): void;
  inRange(src: Mat, lowerb: Mat, upperb: Mat, dst: Mat): void;
  countNonZero(src: Mat): number;
  add(src1: Mat, src2: Mat, dst: Mat): void;
  findContours(
    image: Mat,
    contours: MatVector,
    hierarchy: Mat,
    mode: number,
    method: number
  ): void;
  contourArea(contour: Mat): number;
  // Constantes
  COLOR_RGBA2RGB: number;
  COLOR_RGB2HSV: number;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
  // Clases
  Mat: MatConstructor;
  MatVector: MatVectorConstructor;
}

declare global {
  interface Window {
    cv: CVModule;
  }
}
