import { useSettings } from '@/providers/Settings';
import React, { useState } from 'react';

interface IndexProps {
  isModalOpen: boolean;
  handleModal: () => void;
  videoProcessed?: boolean;
}

const Index = ({
  isModalOpen,
  handleModal,
  videoProcessed = false,
}: IndexProps) => {
  const {
    settings,
    setPoseTimeWindow,
    setPoseUpdateInterval,
    setPoseGraphSample,
    setPoseGraphSampleThreshold,
  } = useSettings();

  const [timeWindow, setTimeWindow] = useState(settings.pose.poseTimeWindow);
  const [updateInterval, setUpdateInterval] = useState(settings.pose.poseUpdateInterval);
  const [sample, setSample] = useState(settings.pose.poseGraphSample ?? 50);
  const [threshold, setThreshold] = useState(settings.pose.poseGraphSampleThreshold ?? 60);

  const handleTimeWindowChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setTimeWindow(value);
    setPoseTimeWindow(value);
  };

  const handleUpdateIntervalChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newHz = parseInt(event.target.value, 10); // Obtenemos el valor en Hz desde el slider
    const value = Number((1000 / newHz).toFixed(0)); // Convertimos Hz a ms antes de almacenarlo
    setUpdateInterval(value);
    setPoseUpdateInterval(value);
  };

  const handleSampleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    // Si el nuevo valor de sample supera el valor de threshold, se ajusta threshold a ese valor
    if (value > threshold) {
      setThreshold(value);
      setPoseGraphSampleThreshold(value);
    }
    setSample(value);
    setPoseGraphSample(value);
  };
  
  const handleSampleThresholdChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    // Si el nuevo valor de threshold es menor que el valor actual de sample, se ajusta sample a ese valor
    if (value < sample) {
      setSample(value);
      setPoseGraphSample(value);
    }
    setThreshold(value);
    setPoseGraphSampleThreshold(value);
  };  

  if (!isModalOpen) return null;

  return (
    <div
      className="fixed z-10 bottom-0 left-0 w-full px-4 pt-[1rem] pb-[2rem] flex items-center bg-gradient-to-b from-black/40 to-black rounded-t-lg"
      data-element="non-swipeable"
      onClick={handleModal}
    >
      <form className="w-full flex flex-col justify-center gap-4">
        <div className='flex w-full gap-2'>
          <div className=" flex-1 flex flex-col justify-between gap-2">
            <label htmlFor="time-window" className="text-white">
              Window: {timeWindow} s
            </label>
            <input
              id="time-window"
              type="range"
              value={timeWindow}
              min="5"
              max="10"
              onChange={handleTimeWindowChange}
              />
          </div>
          <div className=" flex-1 flex flex-col justify-between gap-2">
          <label htmlFor="update-interval" className="text-white">
            Frequency: {(1000 / updateInterval).toFixed(0)} Hz
          </label>
          <input
            id="update-interval"
            type="range"
            min="2"   // 2 Hz (equivalente a 500 ms)
            max="10"  // 10 Hz (equivalente a 100 ms)
            step="1"  // Paso en Hz para que siempre sean valores enteros
            value={1000 / updateInterval} // Mostramos Hz en la UI
            onChange={handleUpdateIntervalChange} // Usamos la función de manejo de cambios
            className="w-full"
          />
          </div>
        </div>
        {videoProcessed && (
          <div className='flex w-full gap-2'>
            <div className="flex-1 flex justify-between">
              <label htmlFor="sample" className="text-white">
                Sample (lttb): {sample}
              </label>
              <input
                id="sample"
                type="range"
                value={sample}
                min="50"
                max="80"
                onChange={handleSampleChange}
              />
            </div>
            <div className="flex-1 flex justify-between">
              <label htmlFor="sample-threshold" className="text-white">
                Threshold (lttb): {threshold}
              </label>
              <input
                id="sample-threshold"
                type="range"
                value={threshold}
                min="60"
                max="100"
                onChange={handleSampleThresholdChange}
              />
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

export default Index;
