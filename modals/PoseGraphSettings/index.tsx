import React, { useState } from 'react'

interface IndexProps {
  isModalOpen: boolean;
  initialTimeWindow: number;
  initialUpdateInterval: number;
  handleModal: () => void;
  onTimeWindowChange?: (value: number) => void;
  onUpdateIntervalChange?: (value: number) => void;
}

const Index = ({
  isModalOpen,
  handleModal,
  onTimeWindowChange,
  onUpdateIntervalChange,
  initialTimeWindow = 10,
  initialUpdateInterval = 300,
}: IndexProps) => {
  const [timeWindow, setTimeWindow] = useState(initialTimeWindow);
  const [updateInterval, setUpdateInterval] = useState(initialUpdateInterval);

  const handleTimeWindowChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);

    setTimeWindow(value);

    if (onTimeWindowChange) {
      onTimeWindowChange(value);
    }
  };

  const handleUpdateIntervalChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);

    setUpdateInterval(value);

    if (onUpdateIntervalChange) {
      onUpdateIntervalChange(value);
    }
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
              Time window: {timeWindow} sec
            </label>
            <input
              id='time-window'
              type='range'
              value={timeWindow}
              min="5"
              max="10"
              onChange={handleTimeWindowChange}
              />
          </div>
          <div className='w-full flex justify-between'>
            <label
              htmlFor='update-interval'
              className='text-white'
              >
              Update interval: {updateInterval} ms
            </label>
            <input
              id='update-interval'
              type='range'
              value={updateInterval}
              step="50"
              min="100"
              max="500"
              onChange={handleUpdateIntervalChange}
              />
          </div>
        </form>
    </div>
  )
}

export default Index