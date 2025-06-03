import { Jump } from '@/interfaces/pose';
import { useSettings } from '@/providers/Settings';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import React, { useEffect } from 'react';

interface IndexProps {
  isModalOpen: boolean;
  jumpsDetected: Jump[] | null;
  onHandleFrames: (mode: "detect" | "dismiss") => void;
  videoMode?: boolean;
  videoProcessed?: boolean;
}

const Index = ({
  isModalOpen,
  jumpsDetected,
  onHandleFrames,
}: IndexProps) => {
  const {
    settings,
    setJumpSide,
    setJumpJoint,
    setJumpMode,
    setMaxTakeoffFlexion,
    setMaxLandingFlexion,
    setMinFlexionBeforeJump,
    setMinFlexionAfterLanding,
    setSearchWindow,
    resetPoseJumpSettings, // revisar y hacer un setting especifico solo para la parte del jump
  } = useSettings();
  const { jump } = settings.pose;
  const {
    side,
    joint,
    mode,
    maxTakeoffFlexion,
    maxLandingFlexion,
    minFlexionBeforeJump,
    minFlexionAfterLanding,
    searchWindow,
  } = jump;

  return isModalOpen ? (
    <div
      data-element="non-swipeable"
      className="fixed z-40 bottom-0 left-0 w-full px-4 pt-[1rem] pb-[2rem] flex flex-col items-center bg-gradient-to-b from-black/40 to-black rounded-t-lg shadow-[0_0_3px_rgba(0,0,0,0.2)] dark:shadow-[0_0_3px_rgba(0,0,0,0.46)]"
      >
      <div
        className="w-full h-9 flex justify-end text-white italic font-bold cursor-pointer"
        onClick={resetPoseJumpSettings}
        >
        Set default values{" "}
        <ArrowPathIcon className="ml-2 w-6 h-6" />
      </div>
      <form className="w-full flex flex-col justify-center gap-8 mt-2">
        {/* block 1 */}
        <div className='flex w-full gap-2'> 
          {/* joint side */}
          <div className="flex-1 flex flex-col justify-end gap-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                value="" 
                className="sr-only peer" 
                checked={side === "right"}
                onChange={() => {
                  const next: "right" | "left" = side === "right" ? "left" : "right";

                  setJumpSide(next);
                }}
                />
              <div
                className="w-11 h-6 bg-[#5dadec] peer-focus:outline-none peer-focus:ring-0 peer-focus:ring-[#5dadec]
                rounded-full peer peer-checked:bg-[#5dadec] transition-all duration-200"
              ></div>
              <div
                className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full shadow peer-checked:translate-x-full transform transition-all duration-200 bg-white`}
              ></div>
              <span 
                className={`text-white text-sm pl-2 uppercase`}
                >
                  {side}
              </span>
            </label>
          </div>
          {/* jump joint */}
          <div className="flex-1 flex flex-col justify-end gap-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                value="" 
                className="sr-only peer" 
                checked={joint === "knee"}
                onChange={() => {
                  const next: "hip" | "knee" = joint === "hip" ? "knee" : "hip";

                  setJumpJoint(next);
                }}
                />
              <div
                className="w-11 h-6 bg-[#5dadec] peer-focus:outline-none peer-focus:ring-0 peer-focus:ring-[#5dadec]
                rounded-full peer peer-checked:bg-[#5dadec] transition-all duration-200"
              ></div>
              <div
                className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full shadow peer-checked:translate-x-full transform transition-all duration-200 bg-white`}
              ></div>
              <span 
                className={`text-white text-sm pl-2 uppercase`}
                >
                  {joint}
              </span>
            </label>
          </div>          
          {/* mode */}
          <div className="flex-1 flex flex-col justify-end gap-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                value="" 
                className="sr-only peer" 
                checked={mode === "smoothed"}
                onChange={() => {
                  const next: "strict" | "smoothed" = mode === "strict" ? "smoothed" : "strict";

                  setJumpMode(next);
                }}
                />
              <div
                className="w-11 h-6 bg-gray-600 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-0 peer-focus:ring-[#5dadec]
                rounded-full peer peer-checked:bg-[#5dadec] transition-all duration-200"
              ></div>
              <div
                className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full shadow peer-checked:translate-x-full transform transition-all duration-200 bg-white`}
              ></div>
              <span 
                className={`text-white text-sm pl-2 uppercase`}
                >
                  {mode === "strict" ? "strict" : "soft"}
              </span>
            </label>
          </div>
        </div>
        {/* block 3 */}
        <div className='flex w-full gap-4'>
          {/* takeoff flexion */}
          <div className='flex-1 flex flex-col justify-between gap-2'>
            <label
              htmlFor='takeoff-flexion'
              >
              Take off<span className='align-sub uppercase text-[0.6rem]'> max</span>: {maxTakeoffFlexion}º
            </label>
            <input
              id='takeoff-flexion'
              type='range'
              value={maxTakeoffFlexion}
              min="0"
              max="30"
              step="1"              
              onChange={(e) => setMaxTakeoffFlexion(Number(e.target.value))}
              />
          </div>
          {/* landing flexion */}
          <div className='flex-1 flex flex-col justify-between gap-2'>
            <label
              htmlFor='landing-flexion'
              >
              Landing<span className='align-sub uppercase text-[0.6rem]'> max</span>: {maxLandingFlexion}º
            </label>
            <input
              id='landing-flexion'
              type='range'
              value={maxLandingFlexion}
              min="0"
              max="30"
              step="1"              
              onChange={(e) => setMaxLandingFlexion(Number(e.target.value))}
              />
          </div>
        </div>
        {/* block 4 */}
        <div className='flex w-full gap-6'>
          {/* before jump */}
          <div className='flex-1 flex flex-col justify-between gap-2'>
            <label
              htmlFor='before-jump'
              >
              Pre jumping<span className='align-sub uppercase text-[0.6rem]'> min</span>: {minFlexionBeforeJump}º
            </label>
            <input
              id='before-jump'
              type='range'
              value={minFlexionBeforeJump}
              min="0"
              max="90"
              step="1"              
              onChange={(e) => setMinFlexionBeforeJump(Number(e.target.value))}
              />
          </div>
          {/* after landing */}
          <div className='flex-1 flex flex-col justify-between gap-2'>
            <label
              htmlFor='after-landing'
              >
              Post landing<span className='align-sub uppercase text-[0.6rem]'> min</span>: {minFlexionAfterLanding}º
            </label>
            <input
              id='after-landing'
              type='range'
              value={minFlexionAfterLanding}
              min="0"
              max="90"
              step="1"              
              onChange={(e) => setMinFlexionAfterLanding(Number(e.target.value))}
              />
          </div>
        </div>
        {/* block 5 */}
        <div className='flex w-full gap-6'>
          {/* search window */}
          <div className='flex-1 flex flex-col justify-between gap-2'>
            <label
              htmlFor='search-window'
              >
              Search<span className='align-sub uppercase text-[0.6rem]'> window</span>: {searchWindow} frames
            </label>
            <input
              id='search-window'
              type='range'
              value={searchWindow}
              min="10"
              max="100"
              step="1"              
              onChange={(e) => setSearchWindow(Number(e.target.value))}
              />
          </div>
        </div>
        {/* block 6 */}
        <div className='flex w-full gap-6'>
          <button
            type="button"
            className="flex-1 bg-[#5dadec] hover:bg-gray-600 text-xl text-white font-bold px-2 py-4 rounded-lg transition"
            onClick={() => onHandleFrames("detect")}>
            Detect jumps
          </button>
          <button
            type="button"
            className="flex-1 bg-red-500 hover:bg-gray-600 disabled:bg-gray-400 disabled:opacity-80 text-xl text-white font-bold px-2 py-4 rounded-lg transition"
            disabled={!jumpsDetected || jumpsDetected.length === 0}
            onClick={() => onHandleFrames("dismiss")}>
            Dismiss jumps
          </button>
        </div>
      </form>
    </div>
  ) : null;
};

export default Index;
