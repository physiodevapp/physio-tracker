import { useSettings } from '@/providers/Settings';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import React from 'react';

interface IndexProps {
  isModalOpen: boolean;
  displayGraphs: boolean;
  videoUrl: string | null;
  videoProcessed?: boolean;
}

const Index = ({
  isModalOpen,
  videoProcessed = false,
}: IndexProps) => {
  const {
    settings,
    setAngularHistorySize,
    resetPoseGraphSettings,
  } = useSettings();
  const {
    angularHistorySize,
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
        onClick={resetPoseGraphSettings}
        >
        Set default values{" "}
        <ArrowPathIcon className="ml-2 w-6 h-6" />
      </div>
      <form className="w-full flex flex-col justify-center gap-4 mt-2">
        <div className='flex w-full gap-6'> 
          <div className='flex-1 flex flex-col justify-between gap-2'>
            <label
              htmlFor='angular-history'
              className={`${
                videoProcessed ? "text-white/60" : "text-white"
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
              disabled={videoProcessed}
              />
          </div>
        </div> 
      </form>
    </div>
  ) : null;
};

export default Index;
