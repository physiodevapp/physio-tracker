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

  const [timeWindow, setTimeWindow] = useState(settings.poseTimeWindow);
  const [updateInterval, setUpdateInterval] = useState(settings.poseUpdateInterval);
  const [sample, setSample] = useState(settings.poseGraphSample ?? 50);
  const [threshold, setThreshold] = useState(settings.poseGraphSampleThreshold ?? 60);

  const handleTimeWindowChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setTimeWindow(value);
    setPoseTimeWindow(value);
  };

  const handleUpdateIntervalChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
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
      className="fixed z-10 bottom-0 left-0 w-full pb-2 flex items-center bg-gradient-to-b from-black/40 to-black rounded-t-lg"
      data-element="non-swipeable"
      onClick={handleModal}
    >
      <form className="w-full flex flex-col justify-center px-8 py-2 gap-4">
        <div className="w-full flex justify-between">
          <label htmlFor="time-window" className="text-white">
            Time window: {timeWindow} sec
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
        <div className="w-full flex justify-between">
          <label htmlFor="update-interval" className="text-white">
            Update interval: {updateInterval} ms
          </label>
          <input
            id="update-interval"
            type="range"
            value={updateInterval}
            step="50"
            min="100"
            max="500"
            onChange={handleUpdateIntervalChange}
          />
        </div>
        {videoProcessed && (
          <>
            <div className="w-full flex justify-between">
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
            <div className="w-full flex justify-between">
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
          </>
        )}
      </form>
    </div>
  );
};

export default Index;
