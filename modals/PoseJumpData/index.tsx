import { Jump } from '@/interfaces/pose';
import React, { useState } from 'react';

interface IndexProps {
  isModalOpen: boolean;
  jumpDetected?: Jump | null;
  videoMode?: boolean;
  videoProcessed?: boolean;
}

const Index = ({
  isModalOpen,
  jumpDetected,
}: IndexProps) => {
  const [flightTime, setFlightTime] = useState(0);
  const [jumpHeight, setJumpHeight] = useState(0);
  const [maxVelocity, setMaxVelocity] = useState(0);

  const getFlightTime = () => {
    const flightTime = (jumpDetected?.landingPoint?.videoTime ?? 0) - (jumpDetected?.takeoffPoint?.videoTime ?? 0)

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

  useEffect(() => {
    if (jumpDetected?.takeoffPoint?.videoTime != null && jumpDetected?.landingPoint?.videoTime != null) {
      const flight = getFlightTime();
      const height = getJumpHeight();
      const velocity = getMaxVelocity();

      setFlightTime(flight);
      setJumpHeight(height);
      setMaxVelocity(velocity);
    }
  }, [jumpDetected]); 

  return isModalOpen ? (
    <div
      data-element="non-swipeable"
      className="fixed z-40 bottom-0 left-0 w-full h-1/2 px-4 pt-[1rem] pb-[2rem] border-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-black/40 to-black shadow-[0_0_3px_rgba(0,0,0,0.2)] dark:shadow-[0_0_3px_rgba(0,0,0,0.46)]">
      {/* <div
        className="w-full h-9 flex justify-end text-white italic font-bold cursor-pointer"
        >
        Jump metrics
      </div> */}
      {/* block 1 */}
      <section className="w-full flex flex-col justify-center gap-8 border-[#5dadec] border-2 dark:bg-gray-800/60 p-6 rounded-lg">
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
      </section>
      {/* block 2 */}
      <section className="w-full flex flex-col justify-center gap-8 border-[#5dadec] border-2 dark:bg-gray-800/60 p-6 rounded-lg">
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
      <section className="w-full flex flex-col justify-center gap-8 border-[#5dadec] border-2 dark:bg-gray-800/60 p-6 rounded-lg">
        {/* block 1 */}
        <div className='flex w-full gap-4'>
          {/* takeoff */}
          <div className='flex-1 flex flex-col justify-between gap-2'>
            Take off at: {jumpDetected?.takeoffPoint?.videoTime?.toFixed(2)} s
          </div>
          {/* landing */}
          <div className='flex-1 flex flex-col justify-between gap-2'>
            Landing at: {jumpDetected?.landingPoint?.videoTime?.toFixed(2)} s
          </div>
        </div>
      </section>
    </div>
  ) : null;
};

export default Index;
