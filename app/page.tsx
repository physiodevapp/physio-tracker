"use client";

import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useSwipeable } from 'react-swipeable';
import MainMenu from "../components/MainMenu";
import { MainMenuOption } from '@/interfaces/menu';

const Pose = dynamic(() => import('../components/Pose').then(mod => mod.default), { ssr: false });
const Force = dynamic(() => import('../components/Force').then(mod => mod.default), { ssr: false });
const ColorAnalyzer = dynamic(() => import('../components/ColorAnalyzer').then(mod => mod.default), { ssr: false });
const Balance = dynamic(() => import('../components/Balance').then(mod => mod.default), { ssr: false });

export default function Home() {
  const [page, setPage] = useState<MainMenuOption>('force');

  const [isMainMenuOpen, setIsMainMenuOpen] = useState(false);

  const handlers = useSwipeable({
    onSwipedLeft: (eventData) => {
      const targetElement = eventData.event.target as HTMLElement;
      const isSwipeable = !Boolean(targetElement.closest('[data-element="non-swipeable"]'));

      if (!isSwipeable) return;

      if (page === 'pose') setPage('force');
      if (page === 'force') setPage('bodychart');
      if (page === 'bodychart') setPage('balance');
    },
    onSwipedRight: (eventData) => {
      const targetElement = eventData.event.target as HTMLElement;
      const isSwipeable = !Boolean(targetElement.closest('[data-element="non-swipeable"]'));

      if (!isSwipeable) return;

      if (page === 'balance') setPage('bodychart');
      if (page === 'bodychart') setPage('force');
      if (page === 'force') setPage('pose');
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

  const handleMainMenu = (visibility?: boolean) => {
    setIsMainMenuOpen(visibility === undefined ? !isMainMenuOpen : false);
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
                  <Pose handleMainMenu={handleMainMenu} isMainMenuOpen={isMainMenuOpen} />
                </motion.div>
              );
            case 'force':
              return (
                <motion.div
                  key="force"
                  variants={variants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ ease: "easeInOut", duration: 0.25 }}
                  >
                  <Force handleMainMenu={handleMainMenu} isMainMenuOpen={isMainMenuOpen} />
                </motion.div>
              );
            case 'bodychart':
              return (
                <motion.div
                  key="bodychart"
                  variants={variants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ ease: "easeInOut", duration: 0.25 }}
                  >
                  <ColorAnalyzer handleMainMenu={handleMainMenu} isMainMenuOpen={isMainMenuOpen} />
                </motion.div>
              );
            case 'balance':
              return (
                <motion.div
                  key="balance"
                  variants={variants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ ease: "easeInOut", duration: 0.25 }}
                  >
                  <Balance handleMainMenu={handleMainMenu} isMainMenuOpen={isMainMenuOpen} />
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
