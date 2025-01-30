import { useEffect, useState } from 'react';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';

export function useTensorFlow() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initializeTensorFlow = async () => {
      await tf.setBackend('webgl');  // O 'wasm' si prefieres WebAssembly
      await tf.ready();
      setIsReady(true);
    };

    if (typeof window !== 'undefined') {
      initializeTensorFlow();
    }
  }, []);

  return isReady;  // Indica cuándo TensorFlow está listo
}
