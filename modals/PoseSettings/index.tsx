import { useSettings } from '@/providers/Settings';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import React from 'react'

interface IndexProps {
  isModalOpen: boolean;
  showExtraSettings: boolean;
}

const Index = ({
  isModalOpen,
  showExtraSettings = false,
}: IndexProps) => {
  const { 
    settings, 
    setAngularHistorySize, 
    setPoseVelocityHistorySize,
    setPoseUpdateInterval,
    setProcessingSpeed,
    resetPoseSettings,
  } = useSettings();
  const {
    angularHistorySize,
    velocityHistorySize,
    poseUpdateInterval,
    processingSpeed,
  } = settings.pose;

  const handleAngleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);

    setAngularHistorySize(value);

    setAngularHistorySize(value);
  };
  
  const handleAngularVelocityChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);

    setPoseVelocityHistorySize(value);

    setPoseVelocityHistorySize(value);
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

  if (!isModalOpen) return null;

  return (
    <div 
      className='fixed z-10 bottom-0 left-0 w-full px-4 pt-[1rem] pb-[2rem] flex flex-col items-center bg-gradient-to-b from-black/40 to-black rounded-t-lg'
      data-element="non-swipeable"
      >
        <div
        className="w-full h-9 flex justify-end text-white/60 italic font-light cursor-pointer"
        onClick={() => resetPoseSettings(showExtraSettings)}
        >
        Set default values{" "}
        <ArrowPathIcon className="ml-2 w-6 h-6" />
      </div>
        <form className='w-full flex flex-col justify-center gap-6'>
          <div className='flex w-full gap-6'>
            <div className='flex-1 flex flex-col justify-between gap-2'>
              <label
                htmlFor='angular-history'
                className='text-white'
                >
                Angle<span className='align-sub uppercase text-[0.6rem]'> Smth</span>: {angularHistorySize}
              </label>
              <input
                id='angular-history'
                type='range'
                value={angularHistorySize}
                min="5"
                max="20"
                onChange={handleAngleChange}
                />
            </div>
            <div className='flex-1 flex flex-col justify-between gap-2'>
              <label
                htmlFor='velocity-history'
                className='text-white'
                >
                Velocity<span className='align-sub uppercase text-[0.6rem]'> Smth</span>: {velocityHistorySize}
              </label>
              <input
                id='velocity-history'
                type='range'
                value={velocityHistorySize}
                min="5"
                max="20"
                onChange={handleAngularVelocityChange}
                />
            </div>
          </div>
          {showExtraSettings ? (
            <div className='flex w-full gap-6'>
              <div className='flex-1 flex flex-col justify-between gap-2'>
                <label
                  htmlFor='processing-speed'
                  className='text-white'
                  >
                  Processing<span className='align-sub uppercase text-[0.6rem]'> speed</span>: {processingSpeed}
                </label>
                <input
                  id='processing-speed'
                  type='range'
                  value={processingSpeed}
                  min="0.1"
                  max="1"
                  step="0.1"
                  onChange={handleProcessingSpeedChange}
                  />
              </div>
              <div className='flex-1 flex flex-col justify-between gap-2'>
                <label
                  htmlFor='update-interval'
                  className='text-white'
                  >
                  Update<span className='align-sub uppercase text-[0.6rem]'> freq</span>: {(1000 / poseUpdateInterval).toFixed(0)} Hz
                </label>
                <input
                  id='update-interval'
                  type='range'
                  min="2"
                  max="10"
                  step="1"
                  value={1000 / poseUpdateInterval}
                  onChange={handleUpdateIntervalChange}
                  />
              </div>
            </div>
          ) : null}
        </form>
    </div>
  )
}

export default Index