import { useSettings } from '@/providers/Settings';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import React from 'react';
import * as poseDetection from '@tensorflow-models/pose-detection';

interface IndexProps {
  isModalOpen: boolean;
  videoMode?: boolean;
  videoProcessed?: boolean;
}

const Index = ({
  isModalOpen,
  videoMode = false,
  videoProcessed = false,
}: IndexProps) => {
  const {
    settings,
    setAngularHistorySize,
    setPointsPerSecond,
    setMinAngleDiff,
    setPoseModel,
    resetPoseSettings,
  } = useSettings();
  const {
    angularHistorySize,
    pointsPerSecond,
    minAngleDiff,
    poseModel,
  } = settings.pose;

  const handleAngleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);

    setAngularHistorySize(value);

    setAngularHistorySize(value);
  };

  return isModalOpen ? (
    <div
      data-element="non-swipeable"
      className="fixed z-40 bottom-0 left-0 w-full px-4 pt-[1rem] pb-[2rem] flex flex-col items-center bg-gradient-to-b from-black/40 to-black rounded-t-lg shadow-[0_0_3px_rgba(0,0,0,0.2)] dark:shadow-[0_0_3px_rgba(0,0,0,0.46)]"
      >
      <div
        className="w-full h-9 flex justify-end text-white italic font-bold cursor-pointer"
        onClick={resetPoseSettings}
        >
        Set default values{" "}
        <ArrowPathIcon className="ml-2 w-6 h-6" />
      </div>
      <form className="w-full flex flex-col justify-center gap-8 mt-2">
        <div className='flex w-full gap-6'> 
          <div className='flex-1 flex flex-col justify-between gap-2'>
            <label
              htmlFor='angular-history'
              className={`${
                videoMode ? "text-white/60" : "text-white"
              }`}
              >
              Angle<span className='align-sub uppercase text-[0.6rem]'> Smooth</span>: {angularHistorySize}
            </label>
            <input
              id='angular-history'
              type='range'
              value={angularHistorySize}
              min="5"
              max="20"
              onChange={handleAngleChange}
              disabled={videoMode}
              />
          </div>
          <div className="flex-1 flex flex-col justify-end gap-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                value="" 
                className="sr-only peer" 
                checked={poseModel === poseDetection.SupportedModels.BlazePose}
                onChange={() => {
                  const next: poseDetection.SupportedModels = poseModel === poseDetection.SupportedModels.MoveNet ? poseDetection.SupportedModels.BlazePose : poseDetection.SupportedModels.MoveNet;

                  setPoseModel(next);
                }}
                disabled={videoProcessed}
                />
              <div
                className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-0 peer-focus:ring-[#5dadec]
                rounded-full peer dark:bg-gray-700 peer-checked:bg-[#5dadec] transition-all duration-200"
              ></div>
              <div
                className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full shadow peer-checked:translate-x-full transform transition-all duration-200 ${
                  videoProcessed ? "bg-white/40" : "bg-white"
                }`}
              ></div>
              <span 
                className={`text-white text-sm pl-2 ${
                  videoProcessed ? "text-white/60" : "text-white"
                }`}
                >
                  {poseModel === poseDetection.SupportedModels.BlazePose ? poseDetection.SupportedModels.BlazePose : poseDetection.SupportedModels.MoveNet}
              </span>
            </label>
          </div>
        </div>
        <div className='flex w-full gap-6'>
          <div className='flex-1 flex flex-col justify-between gap-2'>
            <label
              htmlFor='points-per-second'
              className={`${
                !videoMode ? "text-white/60" : "text-white"
              }`}
              >
              Sampling<span className='align-sub uppercase text-[0.6rem]'> Rate</span>: {pointsPerSecond} / s
            </label>
            <input
              id='points-per-second'
              type='range'
              value={pointsPerSecond}
              min="5"
              max="30"
              step="1"              
              onChange={(e) => setPointsPerSecond(Number(e.target.value))}
              disabled={!videoMode}
              />
          </div>
          <div className='flex-1 flex flex-col justify-between gap-2'>
            <label
              htmlFor='points-per-second'
              className={`${
                !videoMode ? "text-white/60" : "text-white"
              }`}
              >
              Δ Angle<span className='align-sub uppercase text-[0.6rem]'> Min</span>: {minAngleDiff}º
            </label>
            <input
              id='points-per-second'
              type='range'
              value={minAngleDiff}
              min="1"
              max="5"
              step="1"              
              onChange={(e) => setMinAngleDiff(Number(e.target.value))}
              disabled={!videoMode}
              />
          </div>
        </div>
      </form>
    </div>
  ) : null;
};

export default Index;
