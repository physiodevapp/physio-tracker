"use client";

import React from "react";
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

  return (
    <div className="relative w-full h-dvh overflow-hidden text-white bg-black bg-[url('/start-menu.png')] bg-cover bg-center bg-no-repeat">
      
      {/* Header fader */}
      <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-black/100 to-transparent z-10 flex justify-center items-center">
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
      <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-black/100 to-transparent z-10 flex justify-center items-center pointer-events-none">
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
