import React, { useState } from 'react'

interface IndexProps {
  isModalOpen: boolean;
  initialAngleSmoothing: number;
  initialVelocitySmoothing: number;
  handleModal: () => void;
  onAngleSmoothingChange?: (value: number) => void;
  onAngularVelocitySmoothingChange?: (value: number) => void;
}

const Index = ({
  isModalOpen,
  handleModal,
  onAngleSmoothingChange,
  onAngularVelocitySmoothingChange,
  initialAngleSmoothing = 5,
  initialVelocitySmoothing = 5,
}: IndexProps) => {
  const [angleSmoothing, setAngleSmoothing] = useState(initialAngleSmoothing);
    const [angleVelocitySmoothing, setVelocitySmoothing] = useState(initialVelocitySmoothing);

  const handleAngleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);

    setAngleSmoothing(value);

    if (onAngleSmoothingChange) onAngleSmoothingChange(value);
  };
  
  const handleAngularVelocityChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);

    setVelocitySmoothing(value);

    if (onAngularVelocitySmoothingChange) onAngularVelocitySmoothingChange(value);
  };

  if (!isModalOpen) return null;

  return (
    <div 
      className='fixed z-10 bottom-0 left-0 w-full h-[15dvh] bg-gradient-to-b from-black/40 to-black rounded-t-lg'
      data-element="modal"
      onClick={handleModal}
      >
        <form className='flex flex-col justify-center px-4 py-2 gap-4'>
          <div className='w-full flex justify-between'>
            <label
              htmlFor='time-window'
              className='text-white'
              >
              Angle smoothing: {angleSmoothing}
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
          <div className='w-full flex justify-between'>
            <label
              htmlFor='update-interval'
              className='text-white'
              >
              Velocity smoothing: {angleVelocitySmoothing}
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