import React, { useEffect, useRef, useState } from 'react';
import { motion } from "framer-motion";
import { JumpEvents } from '@/interfaces/pose';

interface IndexProps {
  isSettingsModalOpen: boolean;
  isDataModalOpen: boolean;
  jumpDetected?: JumpEvents | null;
}

const Index = ({
  isSettingsModalOpen,
  isDataModalOpen,
  jumpDetected,
}: IndexProps) => {
  const [isModalReady, setIsModalReady] = useState(false);

  const isAnimationRunningRef = useRef(false);

  const [thighLength, setThighLength] = useState(10);
  const [legLength, setLegLength] = useState(10);
  const [weight, setWeight] = useState(50);

  const [flightTime, setFlightTime] = useState(0);
  const [jumpHeight, setJumpHeight] = useState(0);
  const [maxVelocity, setMaxVelocity] = useState(0);

  const getFlightTime = () => {
    const flightTime = (jumpDetected?.landing?.videoTime ?? 0) - (jumpDetected?.takeoff?.videoTime ?? 0)

    return flightTime;
  }

  const getJumpHeight = () => {
    const jumpHeight = Math.pow(getFlightTime(), 2) * 9.81 / 8;

    return jumpHeight;
  }

  const getMaxVelocity = () => {
    const maxVelocity = Math.pow((2 * 9.81 * getJumpHeight()), 1/2);

    return maxVelocity;
  }

  const handleAnimationStart = () => {
    isAnimationRunningRef.current = true;
  }

  const handleAnimationComplete = () => {
    isAnimationRunningRef.current = false;

    if (!isSettingsModalOpen) {
      setIsModalReady(false);
    }
  }

  useEffect(() => {
    if (isSettingsModalOpen) {
      setIsModalReady(true);
    }
    else if (!isAnimationRunningRef.current) {
      setIsModalReady(false);
    }
  }, [isSettingsModalOpen]);

  useEffect(() => {
    if (jumpDetected?.takeoff?.videoTime != null && jumpDetected?.landing?.videoTime != null) {
      const flight = getFlightTime();
      const height = getJumpHeight();
      const velocity = getMaxVelocity();

      setFlightTime(flight);
      setJumpHeight(height);
      setMaxVelocity(velocity);
    }
  }, [jumpDetected]); 

  return isModalReady ? (
    <motion.div
      data-element="non-swipeable"
      initial={{ y: 0, opacity: 0 }}
      animate={{ y: isDataModalOpen ? 0 : "100%", opacity: isDataModalOpen ? 1 : 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 18 }}
      onAnimationStart={handleAnimationStart}
      onAnimationComplete={handleAnimationComplete}
      className="fixed z-40 bottom-0 left-0 w-full h-1/2 px-4 pt-[1rem] pb-[2rem] border-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-black/40 to-black shadow-[0_0_3px_rgba(0,0,0,0.2)] dark:shadow-[0_0_3px_rgba(0,0,0,0.46)]">
      {/* block 1 */}
      <section className="w-full flex flex-col justify-center gap-4 border-[#5dadec] border-2 dark:bg-black/60 p-4 rounded-lg">
        <div className='flex w-full gap-4'>
          {/* flight time */}
          <div className='flex-1 flex flex-col justify-between gap-2'>
            Flight time: {flightTime.toFixed(2)} s
          </div>
          {/* landing */}
          <div className='flex-1 flex flex-col justify-between gap-2'>
            Height: {(jumpHeight * 100).toFixed(2)} cm
          </div>
        </div>
        <div className='flex flex-row w-full gap-4'>
          {/* max velocity */}
          <div className='flex-1 block'>
            Max<span className='align-sub uppercase text-[0.6rem]'> vel</span>: {maxVelocity.toFixed(2)} m/s
          </div>
          {/* mean velocity */}
          <div className='flex-1 block'>
            Mean<span className='align-sub uppercase text-[0.6rem]'> vel</span>: {(maxVelocity / 2).toFixed(2)} m/s
          </div>
        </div>
      </section>
      {/* block 2 */}
      <section className="w-full flex flex-col justify-center gap-4 border-[#5dadec] border-2 dark:bg-black/60 p-4 rounded-lg">
        <div className='flex flex-row flex-1 gap-6'>
          {/* thigh length */}
          <div className='flex-1 flex flex-col justify-between gap-2'>
            <label
              htmlFor='thigh-length'
              className={`text-white`} >
              Thigh: {thighLength} cm
            </label>
            <input
              id='thigh-length'
              type='range'
              value={thighLength}
              min="10"
              max="100"
              step="1"              
              onChange={(e) => setThighLength(Number(e.target.value))} />
          </div>
          {/* leg length */}
          <div className='flex-1 flex flex-col justify-between gap-2'>
            <label
              htmlFor='leg-length'
              className={`text-white`} >
              Leg: {legLength} cm
            </label>
            <input
              id='leg-length'
              type='range'
              value={legLength}
              min="10"
              max="100"
              step="1"              
              onChange={(e) => setLegLength(Number(e.target.value))} />
          </div>
        </div>
        <div className='flex flex-row flex-1 gap-6'>
          {/* body weight */}
          <div className='flex-1 flex flex-col justify-between gap-2'>
            <label
              htmlFor='body-weight'
              className={`text-white`} >
              Weight: {legLength} kg
            </label>
            <input
              id='body-weight'
              type='range'
              value={weight}
              min="0"
              max="200"
              step="0.5"              
              onChange={(e) => setWeight(Number(e.target.value))} />
          </div>
        </div>
      </section>
    </motion.div>
  ) : null;
};

export default Index;
