"use client";

import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useSwipeable } from 'react-swipeable';
import MainMenu from "../components/MainMenu";
import { MainMenuOption } from '@/interfaces/menu';

const Pose = dynamic(() => import('../components/Pose').then(mod => mod.default), { ssr: false });
const Strength = dynamic(() => import('../components/Force').then(mod => mod.default), { ssr: false });

export default function Home() {
  const [page, setPage] = useState<MainMenuOption>('pose');

  const [isMainMenuOpen, setIsMainMenuOpen] = useState(false);

  const handlers = useSwipeable({
    onSwipedLeft: (eventData) => {
      const targetElement = eventData.event.target as HTMLElement;
      const isSwipeable = !Boolean(targetElement.closest('[data-element="non-swipeable"]'));

      if (!isSwipeable) return;

      setPage('strength');
    },
    onSwipedRight: (eventData) => {
      const targetElement = eventData.event.target as HTMLElement;
      const isSwipeable = !Boolean(targetElement.closest('[data-element="non-swipeable"]'));

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

  const navigateTo = (page: MainMenuOption) => { 
    setPage(page);
  };

  const handleMainMenu = () => {
    setIsMainMenuOpen(!isMainMenuOpen);
  }
  
  return (
    <main {...handlers} className='h-dvh overflow-hidden relative'>
      <AnimatePresence mode="wait">
        {(() => {
          switch (page) {
            case 'pose':
              return (
                <motion.div
                  key="pose"
                  variants={variants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ ease: "easeInOut", duration: 0.25 }}
                  >
                  <Pose handleMainMenu={handleMainMenu} />
                </motion.div>
              );
            case 'strength':
              return (
                <motion.div
                  key="strength"
                  variants={variants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ ease: "easeInOut", duration: 0.25 }}
                  >
                  <Strength handleMainMenu={handleMainMenu} />
                </motion.div>
              );
            default:
              return null;
          }
        })()}
      </AnimatePresence>

      <MainMenu isMainMenuOpen={isMainMenuOpen} navigateTo={navigateTo} currentPage={page} />
    </main>
  );
}
