declare module "dsp.js-browser" {
  export class FFT {
    constructor(size: number, sampleRate: number);
    forward(signal: number[]): void;
    real: number[];
    imag: number[];
  }
}