"use client";

import { useSettings } from '@/providers/Settings';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import React from 'react'

const Index = () => {
  const {
    resetBalanceSettings
  } = useSettings();

  return (
    <section
      data-element="non-swipeable"
      className="absolute bottom-0 w-full px-4 pt-[1rem] pb-[2rem] bg-gradient-to-b from-black/40 to-black rounded-t-lg"
      >
      <div
        className="w-full h-9 flex justify-end text-white/60 italic font-light cursor-pointer"
        onClick={resetBalanceSettings}
        >
        Set default values{" "}
        <ArrowPathIcon className="ml-2 w-6 h-6" />
      </div>
      <></>
      
    </section>
  )
}

export default Index