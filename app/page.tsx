"use client";

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useSwipeable } from 'react-swipeable';
const Pose = dynamic(() => import('./pose/page').then(mod => mod.default), { ssr: false });
const Strength = dynamic(() => import('./strength/page').then(mod => mod.default), { ssr: false });

export default function Home() {
  const [activePage, setActivePage] = useState<'pose' | 'strength'>('pose');

  const handlers = useSwipeable({
    onSwipedLeft: () => {
      if (activePage === 'pose') setActivePage('strength');
    },
    onSwipedRight: () => {
      if (activePage === 'strength') setActivePage('pose');
    },
    preventScrollOnSwipe: true,
    trackMouse: true,
  });

  const togglePage = () => {
    setActivePage(prev => (prev === 'pose' ? 'strength' : 'pose'));
  };
  
  return (
    <main {...handlers} className='h-screen overflow-hidden relative'>
      {activePage === 'pose' && <Pose />}
      {activePage === 'strength' && <Strength />}
        <button onClick={togglePage} className="absolute bottom-0 right-0 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-full w-12 h-12 flex items-center justify-center shadow-md transition duration-150">
          {activePage === 'pose' ? 'S' : 'P'}
        </button>
    </main>
  );
}
