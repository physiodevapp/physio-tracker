import { MainMenuOption } from '@/interfaces/menu';
import { DevicePhoneMobileIcon, PaintBrushIcon, UserIcon } from '@heroicons/react/24/solid';
import React from 'react';

interface IndexProps {
  isMainMenuOpen: boolean;
  currentPage: MainMenuOption;
  navigateTo: (path: MainMenuOption) => void;
}

const Index: React.FC<IndexProps> = ({ isMainMenuOpen, navigateTo, currentPage }) => {
  const handleClick = (page: MainMenuOption) => {
    navigateTo(page);
  }

  return (
    <div
      className={`
        fixed z-10 left-1/2 -translate-x-1/2 w-[50vw] h-12  rounded-b-3xl bg-gray-800 text-white 
        flex items-center justify-center gap-6 
        transform transition-transform duration-300
        ${isMainMenuOpen ? 'translate-y-0 top-0' : '-translate-y-full top-0'}
      `}
      >
      <UserIcon 
        className={`w-6 h-6 text-white ${currentPage === 'pose' ? 'opacity-100' : 'opacity-40'}`}        
        onClick={() => handleClick('pose')}
        />
      <DevicePhoneMobileIcon 
        className={`w-6 h-6 text-white ${currentPage === 'force' ? 'opacity-100' : 'opacity-40'}`}
        onClick={() => handleClick('force')}
        />
      <PaintBrushIcon 
        className={`w-6 h-6 text-white ${currentPage === 'bodychart' ? 'opacity-100' : 'opacity-40'}`}
        onClick={() => handleClick('bodychart')}
        />
    </div>
  );
};

export default Index;
