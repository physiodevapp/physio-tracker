"use client";

import React, { useEffect, useState } from "react";
import { MainMenuOption } from "@/interfaces/menu";
import Image from "next/image";
import { HeartIcon } from "@heroicons/react/24/solid";

interface IndexProps {
  onSelect: (option: MainMenuOption) => void;
}

const Index: React.FC<IndexProps> = ({ onSelect }) => {
  const options: { label: string; value: MainMenuOption }[] = [
    { label: "Kinematics", value: "pose" },
    { label: "Force Tracker", value: "force" },
    { label: "Body Chart", value: "bodychart" },
    { label: "Balance", value: "balance" },
  ];

  const [paddingTop, setPaddingTop] = useState(96);
  const [paddingBottom, setPaddingBottom] = useState(96);

  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const aspectRatio = 1024 / 1536; // el ratio real de tu imagen
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    const imageHeight = screenWidth / aspectRatio;
    const blackFranja = Math.max(0, (screenHeight - imageHeight) / 2);

    // Añadimos 16px extra para que el degradado tape también el borde visible
    setPaddingTop(blackFranja + 100);
    setPaddingBottom(blackFranja + 100);

    setIsReady(true);
  }, []);

  if (!isReady) {
    return (
      <div className="flex items-center justify-center gap-2 h-dvh bg-black select-none">
        <Image
          src="/physiq-logo.png"
          alt="App Icon"
          width={32}
          height={32}
          // priority // si quieres que no se haga lazy load
          className="w-32 h-32" />
        {/* <p className="text-4xl font-bold">PhysiQ</p> */}
      </div>
    );
  }  

  return (
    <div className="relative w-full h-dvh overflow-hidden text-white bg-black bg-[url('/start-menu.png')] bg-contain bg-center bg-no-repeat">
      
      {/* Header fader */}
      <div 
        className="absolute top-0 left-0 w-full bg-gradient-to-b from-black/100 via-black to-transparent z-10 flex justify-center items-center"
        style={{height: paddingTop}}>
        <div className="flex items-center gap-2 select-none">
          <Image
            src="/android-chrome-192x192.png"
            alt="App Icon"
            width={32}
            height={32}
            // priority // si quieres que no se haga lazy load
            className="w-8 h-8 animate-pulse" />
          <p className="text-4xl font-bold">PhysiQ</p>
        </div>
      </div>

      {/* Footer fader */}
      <div 
        className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/100 via-black to-transparent z-10 flex justify-center items-center pointer-events-none"
        style={{height: paddingBottom}}>
        <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white flex items-center gap-1 z-20 pointer-events-auto select-none">
          Made with <span><HeartIcon className="h-4 text-white"/></span> by 
          <a
            href="https://github.com/physiodevapp?tab=overview"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-white/80 transition">
            physiodevapp
          </a>
        </p>
      </div>

      {/* Botones */}
      <div className="relative z-0 flex flex-col justify-center items-center h-full gap-6 px-4">
        {options.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => onSelect(value)}
            className="w-full max-w-xs py-5 text-lg font-semibold tracking-wide rounded-xl backdrop-blur-sm bg-white/10 border border-white/20 hover:bg-white/20 active:bg-white/30 transition-all duration-200 shadow-md select-none">
            {label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default Index;
