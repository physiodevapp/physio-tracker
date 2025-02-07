"use client";

import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useSwipeable } from 'react-swipeable';
const Pose = dynamic(() => import('./pose/page').then(mod => mod.default), { ssr: false });
const Strength = dynamic(() => import('./strength/page').then(mod => mod.default), { ssr: false });

export default function Home() {
  const [page, setPage] = useState('pose');

  const handlers = useSwipeable({
    onSwipedLeft: (eventData) => {
      const targetElement = eventData.event.target as HTMLElement;
      const isSwipeable = !Boolean(targetElement.closest('[data-element="modal"]'));


      if (!isSwipeable) return;

      setPage('strength');
    },
    onSwipedRight: (eventData) => {
      const targetElement = eventData.event.target as HTMLElement;
      const isSwipeable = !Boolean(targetElement.closest('[data-element="modal"]'));

      if (!isSwipeable) return;

      setPage('pose');
    },
    trackMouse: true
  });

  const variants = {
    initial: { opacity: 0, x: 10 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 10 }
  };
  
  return (
    <main {...handlers} className='h-dvh overflow-hidden relative'>
      <AnimatePresence mode="wait">
        {page === 'pose' ? (
          <motion.div
            key="pose"
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ ease: "easeInOut", duration: 0.25 }}
          >
            <Pose navigateTo={() => setPage('strength')}/>
          </motion.div>
        ) : (
          <motion.div
            key="strength"
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ ease: "easeInOut", duration: 0.25 }}
          >
            <Strength />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
