"use client";

// import { PoseDector } from "@/components/PoseDetector";

import dynamic from 'next/dynamic';
const PoseDetector = dynamic(() => import('../components/PoseDetector').then(mod => mod.PoseDetector), { ssr: false });

export default function Home() {
  
  return (
    <main>
      <PoseDetector/>
    </main>
  );
}
