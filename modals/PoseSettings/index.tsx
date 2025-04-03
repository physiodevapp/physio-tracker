import { useSettings } from '@/providers/Settings';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import React from 'react'

interface IndexProps {
  isModalOpen: boolean;
}

const Index = ({
  isModalOpen,
}: IndexProps) => {
  const { 
    settings, 
    setAngularHistorySize, 
    setPoseVelocityHistorySize,
    resetPoseSettings,
  } = useSettings();

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

  if (!isModalOpen) return null;

  return (
    <div 
      className='fixed z-10 bottom-0 left-0 w-full px-4 pt-[1rem] pb-[2rem] flex flex-col items-center bg-gradient-to-b from-black/40 to-black rounded-t-lg'
      data-element="non-swipeable"
      >
        <div
        className="w-full h-9 flex justify-end text-white/60 italic font-light cursor-pointer"
        onClick={resetPoseSettings}
        >
        Set default values{" "}
        <ArrowPathIcon className="ml-2 w-6 h-6" />
      </div>
        <form className='w-full flex flex-col justify-center'>
          <div className='flex w-full gap-6'>
            <div className='flex-1 flex flex-col justify-between gap-2'>
              <label
                htmlFor='time-window'
                className='text-white'
                >
                Angle<span className='align-sub uppercase text-[0.6rem]'> Smth</span>: {settings.pose.angularHistorySize}
              </label>
              <input
                id='time-window'
                type='range'
                value={settings.pose.angularHistorySize}
                min="5"
                max="20"
                onChange={handleAngleChange}
                />
            </div>
            <div className='flex-1 flex flex-col justify-between gap-2'>
              <label
                htmlFor='update-interval'
                className='text-white'
                >
                Velocity<span className='align-sub uppercase text-[0.6rem]'> Smth</span>: {settings.pose.velocityHistorySize}
              </label>
              <input
                id='update-interval'
                type='range'
                value={settings.pose.velocityHistorySize}
                min="5"
                max="20"
                onChange={handleAngularVelocityChange}
                />
            </div>
          </div>
        </form>
    </div>
  )
}

export default Index