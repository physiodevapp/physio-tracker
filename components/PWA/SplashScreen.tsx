"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export default function SplashScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    const handleLoad = () => {
      setIsFading(true);
      setTimeout(() => setIsLoading(false), 500); // Ensure smooth fade-out
    };

    if (document.readyState === "complete") {
      handleLoad();
    } else {
      window.addEventListener("load", handleLoad);
      return () => window.removeEventListener("load", handleLoad);
    }
  }, []);

  if (!isLoading) return null;

  return (
    <div className={`flex flex-col splash-screen ${isFading ? "hidden" : ""}`}>
      <Image 
        src="/android-chrome-512x512.png" 
        alt="Loading..." 
        width={100} 
        height={100} 
        priority 
        quality={80}
      />
      <p className="text-2xl text-[#5dadec] font-semibold my-2 animate-pulse">PhysiQ</p>
    </div>
  );
}
