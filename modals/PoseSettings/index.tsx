import { useSettings } from '@/providers/Settings';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import React from 'react';

interface IndexProps {
  isModalOpen: boolean;
  displayGraphs: boolean;
  videoUrl: string | null;
  videoProcessed?: boolean;
}

const Index = ({
  isModalOpen,
  displayGraphs = false,
  videoUrl = null,
  videoProcessed = false,
}: IndexProps) => {
  const {
    settings,
    setAngularHistorySize,
    setPoseUpdateInterval,
    setProcessingSpeed,
    setPoseGraphSample,
    setPoseGraphSampleThreshold,
    resetPoseGraphSettings,
  } = useSettings();
  const {
    angularHistorySize,
    poseUpdateInterval,
    processingSpeed,
    poseGraphSample,
  } = settings.pose;

  const handleAngleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);

    setAngularHistorySize(value);

    setAngularHistorySize(value);
  };

  const handleUpdateIntervalChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newHz = parseInt(event.target.value, 10); // Obtenemos el valor en Hz desde el slider
    const value = Number((1000 / newHz).toFixed(0)); // Convertimos Hz a ms antes de almacenarlo

    setPoseUpdateInterval(value);
  };

  const handleProcessingSpeedChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);

    setProcessingSpeed(value);
  }

  const handleSampleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    
    setPoseGraphSampleThreshold(value);

    setPoseGraphSample(value);
  }; 

  return isModalOpen ? (
    <div
      data-element="non-swipeable"
      className="fixed z-40 bottom-0 left-0 w-full px-4 pt-[1rem] pb-[2rem] flex flex-col items-center bg-gradient-to-b from-black/40 to-black rounded-t-lg shadow-[0_0_3px_rgba(0,0,0,0.2)] dark:shadow-[0_0_3px_rgba(0,0,0,0.46)]"
      >
      <div
        className="w-full h-9 flex justify-end text-white italic font-bold cursor-pointer"
        onClick={resetPoseGraphSettings}
        >
        Set default values{" "}
        <ArrowPathIcon className="ml-2 w-6 h-6" />
      </div>
      <form className="w-full flex flex-col justify-center gap-4 mt-2">
        <div className='flex w-full gap-6'> 
          <div className='flex-1 flex flex-col justify-between gap-2'>
            <label
              htmlFor='angular-history'
              className={`${
                videoProcessed ? "text-white/60" : "text-white"
              }`}
              >
              Angle<span className='align-sub uppercase text-[0.6rem]'> Smooth</span>: {angularHistorySize}
            </label>
            <input
              id='angular-history'
              type='range'
              value={angularHistorySize}
              min="5"
              max="20"
              onChange={handleAngleChange}
              disabled={videoProcessed}
              />
          </div>
          <div className="flex-1 flex flex-col justify-between gap-2">
            <label 
              htmlFor="sample" 
              className={`${
                !videoProcessed || !displayGraphs ? "text-white/60" : "text-white"
              }`}
              >
              Sample<span className='align-sub text-[0.6rem] uppercase'> lttb</span>: {poseGraphSample}
            </label>
            <input
              id="sample"
              type="range"
              value={poseGraphSample}
              min="50"
              max="300"
              onChange={handleSampleChange}
              disabled={!videoProcessed || !displayGraphs}
              />
          </div>
        </div>          
        <div className='flex w-full gap-6'>
          <div className='flex-1 flex flex-col justify-between gap-2'>
            <label
              htmlFor='processing-speed'
              className={`${
                (!videoUrl || displayGraphs) 
                  ? "text-white/60" 
                  : "text-white"
              }`}
              >
              Processing<span className='align-sub uppercase text-[0.6rem]'> speed</span>: {processingSpeed.toFixed(1)}
            </label>
            <input
              id='processing-speed'
              type='range'
              value={processingSpeed}
              min="0.1"
              max="1"
              step="0.1"
              onChange={handleProcessingSpeedChange}
              disabled={!videoUrl || displayGraphs}
              />
          </div>
          <div className=" flex-1 flex flex-col justify-between gap-2">
            <label 
              htmlFor="update-interval"
              className={`${ displayGraphs 
                ? "text-white/60" 
                : "text-white"
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
              disabled={displayGraphs}
              />
          </div>
        </div>
      </form>
    </div>
  ) : null;
};

export default Index;
