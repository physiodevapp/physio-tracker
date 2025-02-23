import { useSettings } from '@/providers/Settings';
import React, { useState } from 'react'

interface IndexProps {
  isModalOpen: boolean;
  handleModal: () => void;
}

const Index = ({
  isModalOpen,
  handleModal,
}: IndexProps) => {
  const { settings, setAngularHistorySize, setPoseVelocityHistorySize } = useSettings();

  const [angleSmoothing, setAngleSmoothing] = useState(settings.pose.angularHistorySize);
  const [angleVelocitySmoothing, setVelocitySmoothing] = useState(settings.pose.velocityHistorySize);

  const handleAngleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);

    setAngleSmoothing(value);

    setAngularHistorySize(value);
  };
  
  const handleAngularVelocityChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);

    setVelocitySmoothing(value);

    setPoseVelocityHistorySize(value);
  };

  if (!isModalOpen) return null;

  return (
    <div 
      className='fixed z-10 bottom-0 left-0 w-full px-4 pb-[2rem] flex items-center bg-gradient-to-b from-black/40 to-black rounded-t-lg'
      data-element="non-swipeable"
      onClick={handleModal}
      >
        <form className='w-full flex flex-col justify-center px-8 py-2 gap-4'>
          <div className='w-full flex flex-col justify-between gap-2'>
            <label
              htmlFor='time-window'
              className='text-white'
              >
              Angle<span className='align-sub uppercase text-[0.6rem]'> smoothing</span>: {angleSmoothing}
            </label>
            <input
              id='time-window'
              type='range'
              value={angleSmoothing}
              min="5"
              max="20"
              onChange={handleAngleChange}
              />
          </div>
          <div className='w-full flex flex-col justify-between gap-2'>
            <label
              htmlFor='update-interval'
              className='text-white'
              >
              Velocity<span className='align-sub uppercase text-[0.6rem]'> smoothing</span>: {angleVelocitySmoothing}
            </label>
            <input
              id='update-interval'
              type='range'
              value={angleVelocitySmoothing}
              min="5"
              max="20"
              onChange={handleAngularVelocityChange}
              />
          </div>
        </form>
    </div>
  )
}

export default Index