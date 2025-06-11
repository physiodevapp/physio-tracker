import React, { useEffect, useRef, useState } from 'react';
import { motion } from "framer-motion";
import { JumpEventType } from '@/interfaces/pose';

interface IndexProps {
  isSettingsModalOpen: boolean;
  isDataModalOpen: boolean;
  isEventModalOpen: boolean;
  onJumpEventSelected: (value: JumpEventType) => void;
}

const Index = ({
  isSettingsModalOpen,
  isDataModalOpen,
  isEventModalOpen,
  onJumpEventSelected,
}: IndexProps) => {
  const [isModalReady, setIsModalReady] = useState(false);

  const isAnimationRunningRef = useRef(false);

  const handleAnimationStart = () => {
    isAnimationRunningRef.current = true;
  }

  const handleAnimationComplete = () => {
    isAnimationRunningRef.current = false;

    if (!isSettingsModalOpen) {
      setIsModalReady(false);
    }
  }

  const handleJumpEventValue = (type: JumpEventType) => {
    onJumpEventSelected(type);
  }

  useEffect(() => {
    if (isSettingsModalOpen) {
      setIsModalReady(true);
    }
    else if (!isAnimationRunningRef.current) {
      setIsModalReady(false);
    }
  }, [isSettingsModalOpen]);

  return isModalReady ? (
    <motion.section 
      data-element="non-swipeable"
      className='absolute bottom-[3.6rem] left-0 flex flex-col items-start gap-1 rounded-sm'
      initial={{x: '-100%', opacity: 0}}
      animate={{x: (isEventModalOpen && isSettingsModalOpen && !isDataModalOpen) ? 8 : '-100%', opacity: (isEventModalOpen && isSettingsModalOpen && !isDataModalOpen) ? 1 : 0}}
      transition={{ type: "spring", stiffness: 100, damping: 15 }}
      onAnimationStart={handleAnimationStart}
      onAnimationComplete={handleAnimationComplete}
      >
        {/* bg-[#5dadec] */}
        <div className='w-full'>
          <button 
            className='rounded-full p-[0.2rem] px-2 border w-full'
            onClick={(ev) => {
              ev.stopPropagation();

              handleJumpEventValue("groundContact");
            }}>1<sup>st</sup> contact</button>
        </div>
        <div className='w-full'>
          <button 
            className='rounded-full p-[0.2rem] px-2 border w-full'
            onClick={(ev) => {
              ev.stopPropagation();

              handleJumpEventValue("impulse");
            }}>Impulse</button>
        </div>
        <div className='w-full'>
          <button 
            className='rounded-full p-[0.2rem] px-2 border w-full'
            onClick={(ev) => {
              ev.stopPropagation();

              handleJumpEventValue("takeoff");

            }}>Take off</button>
        </div>
        <div className='w-full'>
          <button 
            className='rounded-full p-[0.2rem] px-2 border w-full'
            onClick={(ev) => {
              ev.stopPropagation();

              handleJumpEventValue("landing");
            }}>Landing</button>  
        </div>
        <div className='w-full'>
          <button 
            className='rounded-full p-[0.2rem] px-2 border w-full'
            onClick={(ev) => {
              ev.stopPropagation();

              handleJumpEventValue("cushion");
            }}>Cushion</button>            
        </div>
    </motion.section>
  ) : null;
};

export default Index;
