"use client";
// Parent component

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as poseDetection from "@tensorflow-models/pose-detection";
import { motion } from "framer-motion";
import { CanvasKeypointName, JointDataMap, Kinematics } from "@/interfaces/pose";
import { VideoConstraints } from "@/interfaces/camera";
import { usePoseDetector } from "@/providers/PoseDetector";
import { OrthogonalReference, useSettings } from "@/providers/Settings";
import PoseModal from "@/modals/Poses";
import PoseSettingsModal from "@/modals/PoseSettings";
import { jointOptions, formatJointName } from '@/utils/joint';
import { PauseIcon } from "@heroicons/react/24/outline";
import { CameraIcon, UserIcon, Cog6ToothIcon, Bars3Icon, XMarkIcon, ArrowPathIcon, ArrowTopRightOnSquareIcon, ArrowUpTrayIcon, VideoCameraIcon, CubeTransparentIcon, DocumentArrowDownIcon, TrashIcon, PlusIcon, Bars2Icon } from "@heroicons/react/24/solid";
import LiveAnalysis from "@/components/Pose/LiveAnalysis";
import VideoAnalysis, { ProcessingStatus, VideoAnalysisHandle } from "@/components/Pose/VideoAnalysis";

interface IndexProps {
  handleMainMenu: (visibility?: boolean) => void;
  isMainMenuOpen: boolean
}

const Index = ({ handleMainMenu, isMainMenuOpen }: IndexProps) => {
  const { 
    settings, 
    setSelectedJoints,
    setOrthogonalReference, 
  } = useSettings();
  const {
    selectedJoints,
    angularHistorySize,
    poseModel,
    orthogonalReference,
  } = settings.pose;

  const videoAnalysisRef = useRef<VideoAnalysisHandle>(null);

  const [mode, setMode] = useState<'live' | 'video'>('live');

  const [videoLoaded, setVideoLoaded] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('idle');

  const [showGrid, setShowGrid] = useState(false);

  const [isFrozen, setIsFrozen] = useState(false);

  const [showOrthogonalOption, setShowOrthogonalOption] = useState(false);

  const [anglesToDisplay, setAnglesToDisplay] = useState<string[]>([]);

  const [videoConstraints, setVideoConstraints] = useState<VideoConstraints>({
    facingMode: "user",
  });
  
  const [visibleKinematics] = useState<Kinematics[]>([Kinematics.ANGLE]);
  
  const [isPoseModalOpen, setIsPoseModalOpen] = useState(false);
  const [isPoseSettingsModalOpen, setIsPoseSettingsModalOpen] = useState(false);
  
  const jointAngleHistorySizeRef = useRef(angularHistorySize);
    
  const selectedJointsRef = useRef(selectedJoints);
  const visibleKinematicsRef = useRef(visibleKinematics);

  const toggleCamera = () => {
    setVideoConstraints((prev) => ({
      facingMode: prev.facingMode === "user" ? "environment" : "user",
    }));
  }

  const maxJointsAllowed = useMemo(() => {
    return visibleKinematics.length === 2 ? 3 : 6;
  }, [visibleKinematics]);
  
  const { 
    detectorModel, 
  } = usePoseDetector();
  const prevPoseModel = useRef<poseDetection.SupportedModels>(detectorModel);

  const jointDataRef = useRef<JointDataMap>({});
  const jointWorkerRef = useRef<Worker | null>(null);

  const handleWorkerLifecycle = (start: boolean) => {
    if (start && !jointWorkerRef.current) {
      jointWorkerRef.current = new Worker('/workers/jointWorker.js');
    } else if (!start && jointWorkerRef.current) {
      jointWorkerRef.current.terminate();
      jointWorkerRef.current = null;
    }
  };

  const handleJointSelection = useCallback((selectedJoints: string[]) => {
    setSelectedJoints(selectedJoints as CanvasKeypointName[]);

    setShowOrthogonalOption(selectedJoints.some(joint =>
      joint.includes('shoulder') || joint.includes('hip')
    ));

    setAnglesToDisplay((prevAngles) => {
      const result: string[] = [];

      selectedJoints.forEach((joint) => {
        const formatted = formatJointName(joint); // ej. "R Elbow"
        const existing = prevAngles.find((a) => a.startsWith(formatted));

        if (existing) {
          result.push(existing); // mantener el actual
        } else {
          result.push(`${formatted}: - °`); // añadir por defecto
        }
      });

      return result;
    });
  }, []); 
  
  useEffect(() => {
    jointAngleHistorySizeRef.current = angularHistorySize;
    selectedJointsRef.current = selectedJoints;
  }, [settings])

  useEffect(() => {
    visibleKinematicsRef.current = visibleKinematics;
  }, [visibleKinematics])

  useEffect(() => {
    prevPoseModel.current = poseModel;
  }, [poseModel]);

  useEffect(() => {
    handleWorkerLifecycle(true);

    return () => {
      handleWorkerLifecycle(false);
    };
  }, []); 

  return (
    <>
      <div
        className={`relative z-30 flex flex-col items-center justify-start h-dvh`}>
        <motion.h1
          data-element="non-swipeable"
          initial={{ y: 0, opacity: 1 }}
          animate={{ y: isMainMenuOpen ? -48 : 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 100, damping: 15 }}
          className={`absolute z-10 inset-x-0 mx-auto w-[50vw] text-center text-xl text-white bg-[#5dadec] dark:bg-black/40 
          rounded-full py-2 pl-4 font-bold mt-2 whitespace-nowrap transition-[padding] ${
            isFrozen ? "pr-8" : "pr-4" // isFrozen
          }`}>
          Kinematics
          <PauseIcon className={`absolute top-1/2 -translate-y-1/2 right-4 h-6 w-6 animate-pulse ${
            !isFrozen ? "hidden" : "" // isFrozen
          }`}/>
        </motion.h1>

        <div className="relative w-full flex-1">
          {mode === "live" && (
            <LiveAnalysis 
              handleMainMenu={handleMainMenu}
              isMainMenuOpen={isMainMenuOpen}
              jointWorkerRef={jointWorkerRef}
              jointDataRef={jointDataRef}
              orthogonalReference={orthogonalReference}
              videoConstraints={videoConstraints}
              anglesToDisplay={anglesToDisplay}
              setAnglesToDisplay={setAnglesToDisplay}
              isPoseSettingsModalOpen={isPoseSettingsModalOpen}
              setIsPoseSettingsModalOpen={setIsPoseSettingsModalOpen}
              onChangeIsFrozen={(isFrozen) => setIsFrozen(isFrozen)}
              onWorkerInit={() => handleWorkerLifecycle(true)}
              showGrid={showGrid}
              setShowGrid={setShowGrid}
              />
          )}
          {mode === "video" && (
            <VideoAnalysis
              ref={videoAnalysisRef}
              handleMainMenu={handleMainMenu}
              isMainMenuOpen={isMainMenuOpen}
              jointWorkerRef={jointWorkerRef}
              jointDataRef={jointDataRef}
              orthogonalReference={orthogonalReference}
              anglesToDisplay={anglesToDisplay}
              setAnglesToDisplay={setAnglesToDisplay}
              isPoseSettingsModalOpen={isPoseSettingsModalOpen}
              setIsPoseSettingsModalOpen={setIsPoseSettingsModalOpen}
              onLoaded={(value) => setVideoLoaded(value)}
              onStatusChange={(value) => setProcessingStatus(value)}
              onWorkerInit={() => {
                handleWorkerLifecycle(true);

                setProcessingStatus("idle");
              }} 
              onPause={(value) => setIsFrozen(value)} />
          )}
        </div>

        {processingStatus !== "processing" && (
          <>
            <section 
            data-element="non-swipeable"
            className="absolute top-1 left-1 z-10 p-2 flex flex-col justify-between gap-6 bg-[#5dadec] dark:bg-black/40 rounded-full">
            {isMainMenuOpen ?
              <XMarkIcon 
                className="w-6 h-6 text-white"
                onClick={() => handleMainMenu()}
                />
              : <Bars3Icon 
                  className="w-6 h-6 text-white"
                  onClick={() => handleMainMenu()}
                  />
            }
            {mode === "live" ? ( 
              <ArrowUpTrayIcon 
                className="w-6 h-6 text-white"
                onClick={() => {
                  setIsFrozen(false);

                  handleWorkerLifecycle(false);
                  
                  setMode("video");
                }}/> ) : (
              <>
                {videoLoaded ? (
                  <TrashIcon 
                    className={`w-6 h-6 ${processingStatus === "processed" 
                      ? "text-orange-300"
                      : "text-red-500"
                    }`}
                    onClick={() => {
                      if (videoAnalysisRef.current?.isVideoLoaded()) {
                        videoAnalysisRef.current?.removeVideo();
                      }
                    }}
                    >
                  </TrashIcon> ) : (  
                  <>
                    <VideoCameraIcon
                      className="w-6 h-6 text-white"
                      onClick={() => {
                        handleWorkerLifecycle(false);
                        
                        setMode("live");
                      }} />
                    <PlusIcon
                      className="w-6 h-6 text-white"
                      onClick={() => {
                        if (videoAnalysisRef.current) {
                          videoAnalysisRef.current.handleNewVideo();
                        }
                      }}
                      />
                  </>    
                )}
                {videoLoaded && processingStatus !== "processed" && ( 
                  <CubeTransparentIcon
                    className="w-6 h-6 text-white"
                    onClick={() => {
                      if (selectedJoints.length) {
                        if (videoAnalysisRef.current?.isVideoLoaded()) {
                          videoAnalysisRef.current.handleVideoProcessing();
                        }
                      }
                      else {
                        setIsPoseModalOpen(true);
                      }
                    }} /> 
                )}
                {processingStatus === "processed" && (
                  <DocumentArrowDownIcon
                    className="w-6 h-6 text-white"
                    onClick={() => {
                      if (videoAnalysisRef.current?.isVideoProcessed()) {
                        videoAnalysisRef.current.downloadJSON();
                      }
                    }} /> 
                )}
              </>
            )}
            </section>
            <section 
              data-element="non-swipeable"
              className="absolute top-1 right-1 p-2 z-10 flex flex-col justify-between gap-6 bg-[#5dadec] dark:bg-black/40 rounded-full"
              >
              <div 
                className={`relative cursor-pointer ${isFrozen || mode === "video"
                  ? 'opacity-40'
                  : 'opacity-100'
                }`}
                onClick={() => !isFrozen && !videoLoaded && toggleCamera()}
                >
                <CameraIcon 
                  className={`h-6 w-6 cursor-pointer`}
                  />
                <ArrowPathIcon className="absolute top-[60%] -right-1 h-4 w-4 text-[#5dadec] dark:text-white bg-white/80 dark:bg-black/80 rounded-full p-[0.1rem]"/>
              </div>
              <UserIcon 
                className={`h-6 w-6 cursor-pointer text-white ${processingStatus === "processed" 
                  ? "opacity-40"
                  : "opacity-100"
                }`}
                onClick={() => processingStatus !== "processed" && setIsPoseModalOpen((prev) => !prev)} />
              <Cog6ToothIcon 
                className={`h-6 w-6 cursor-pointer text-white ${processingStatus === "processed" 
                  ? "opacity-40"
                  : "opacity-100"
                }`}
                onClick={() => processingStatus !== "processed" && setIsPoseSettingsModalOpen(prev => !prev)} />
              {mode === "live" && ( 
                <div 
                  className="relative"
                  onClick={() => setShowGrid((prev) => !prev)}>
                  <Bars2Icon className="h-6 w-6 text-white"/>
                  <Bars2Icon className="absolute top-[0.025rem] left-[0.026rem] rotate-90 h-6 w-6 text-white"/>
                </div> 
              )}
            </section>
            {processingStatus === "idle" && (
              <ArrowTopRightOnSquareIcon 
                className={`absolute bottom-2 right-1 z-30 w-8 h-8 text-white transition-transform ${(!showOrthogonalOption || orthogonalReference === undefined)
                  ? '-rotate-0 opacity-50'
                  : orthogonalReference === 'horizontal'
                  ? 'rotate-45'
                  : '-rotate-45'
                }`}
                onClick={() => { 
                  if (!showOrthogonalOption) return;
                            
                  const next: OrthogonalReference = orthogonalReference === "vertical" ? "horizontal" : orthogonalReference === "horizontal" ? undefined : "vertical";

                  setOrthogonalReference(next);
                }} /> 
            )}
          </>
        )}
      </div> 

      <PoseModal 
        isModalOpen={isPoseModalOpen} 
        handleModal={() => setIsPoseModalOpen((prev) => !prev)} 
        jointOptions={jointOptions}
        maxSelected={maxJointsAllowed }
        initialSelectedJoints={selectedJoints} 
        onSelectionChange={handleJointSelection} 
        />

      <PoseSettingsModal 
        isModalOpen={isPoseSettingsModalOpen}
        videoMode={mode === "video"}
        videoProcessed={processingStatus === "processed"}
        />
    </>
  );
};

export default Index;
