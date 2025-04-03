import { useSettings } from '@/providers/Settings';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import React from 'react';

interface IndexProps {
  isModalOpen: boolean;
  videoProcessed?: boolean;
}

const Index = ({
  isModalOpen,
  videoProcessed = false,
}: IndexProps) => {
  const {
    settings,
    setPoseTimeWindow,
    setPoseUpdateInterval,
    setPoseGraphSample,
    setPoseGraphSampleThreshold,
    resetPoseGraphSettings,
  } = useSettings();
  const {
    poseTimeWindow,
    poseUpdateInterval,
    poseGraphSample,
    poseGraphSampleThreshold,
  } = settings.pose;

  const handleTimeWindowChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);

    setPoseTimeWindow(value);
  };

  const handleUpdateIntervalChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newHz = parseInt(event.target.value, 10); // Obtenemos el valor en Hz desde el slider
    const value = Number((1000 / newHz).toFixed(0)); // Convertimos Hz a ms antes de almacenarlo

    setPoseUpdateInterval(value);
  };

  const handleSampleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    // Si el nuevo valor de sample supera el valor de threshold, se ajusta threshold a ese valor
    if (value > poseGraphSampleThreshold) {

      setPoseGraphSampleThreshold(value);
    }

    setPoseGraphSample(value);
  };
  
  const handleSampleThresholdChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    // Si el nuevo valor de threshold es menor que el valor actual de sample, se ajusta sample a ese valor
    if (value < poseGraphSample) {
      setPoseGraphSample(value);
    }
    
    setPoseGraphSampleThreshold(value);
  };  

  if (!isModalOpen) return null;

  return (
    <div
      className="fixed z-10 bottom-0 left-0 w-full px-4 pt-[1rem] pb-[2rem] flex flex-col items-center bg-gradient-to-b from-black/40 to-black rounded-t-lg"
      data-element="non-swipeable"
    >
      <div
        className="w-full h-9 flex justify-end text-white/60 italic font-light cursor-pointer"
        onClick={resetPoseGraphSettings}
        >
        Set default values{" "}
        <ArrowPathIcon className="ml-2 w-6 h-6" />
      </div>
      <form className="w-full flex flex-col justify-center gap-4">
        <div className='flex w-full gap-6'>
          <div className=" flex-1 flex flex-col justify-between gap-2">
            <label htmlFor="time-window" className="text-white">
              Window: {poseTimeWindow} s
            </label>
            <input
              id="time-window"
              type="range"
              value={poseTimeWindow}
              min="5"
              max="10"
              onChange={handleTimeWindowChange}
              />
          </div>
          <div className=" flex-1 flex flex-col justify-between gap-2">
            <label 
              htmlFor="update-interval" 
              className={`${
                videoProcessed ? "text-white/60" : "text-white"
              }`}
              >
              Update<span className='align-sub text-[0.6rem] uppercase'> freq</span>: {(1000 / poseUpdateInterval).toFixed(0)} Hz
            </label>
            <input
              id="update-interval"
              type="range"
              min="2"   // 2 Hz (equivalente a 500 ms)
              max="10"  // 10 Hz (equivalente a 100 ms)
              step="1"  // Paso en Hz para que siempre sean valores enteros
              value={1000 / poseUpdateInterval} // Mostramos Hz en la UI
              onChange={handleUpdateIntervalChange} // Usamos la función de manejo de cambios
              disabled={videoProcessed}
              />
          </div>
        </div>
        {videoProcessed && (
          <div className='flex w-full gap-6'>
            <div className="flex-1 flex flex-col justify-between gap-2">
              <label htmlFor="sample" className="text-white">
                Sample<span className='align-sub text-[0.6rem] uppercase'> lttb</span>: {poseGraphSample}
              </label>
              <input
                id="sample"
                type="range"
                value={poseGraphSample}
                min="50"
                max="120"
                onChange={handleSampleChange}
                />
            </div>
            <div className="flex-1 flex flex-col justify-between">
              <label htmlFor="sample-threshold" className="text-white">
                Threshold<span className='align-sub text-[0.6rem] uppercase'> lttb</span>: {poseGraphSampleThreshold}
              </label>
              <input
                id="sample-threshold"
                type="range"
                value={poseGraphSampleThreshold}
                min="60"
                max="140"
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
