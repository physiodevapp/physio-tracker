"use client";
// Pose component

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
import { ArrowUturnDownIcon, PauseIcon } from "@heroicons/react/24/outline";
import { CameraIcon, UserIcon, Cog6ToothIcon, Bars3Icon, XMarkIcon, ArrowPathIcon, ArrowTopRightOnSquareIcon, ArrowUpTrayIcon, VideoCameraIcon, CubeTransparentIcon, DocumentArrowDownIcon, TrashIcon, PlusIcon, Bars2Icon } from "@heroicons/react/24/solid";
import LiveAnalysis, { LiveAnalysisHandle } from "@/components/Pose/LiveAnalysis";
import VideoAnalysis, { ProcessingStatus, VideoAnalysisHandle } from "@/components/Pose/VideoAnalysis";
import { PoseOrientation } from "@/utils/pose";

interface IndexProps {
  handleMainMenu: (visibility?: boolean) => void;
  isMainMenuOpen: boolean
}

const Index = ({ handleMainMenu, isMainMenuOpen }: IndexProps) => {
  const { 
    settings, 
    setSelectedJoints,
    setOrthogonalReference, 
    setPoseOrientation,
  } = useSettings();
  const {
    selectedJoints,
    angularHistorySize,
    poseModel,
    orthogonalReference,
    poseOrientation,
  } = settings.pose;

  const videoAnalysisRef = useRef<VideoAnalysisHandle>(null);
  const liveAnalysisRef = useRef<LiveAnalysisHandle>(null);
  const [isLiveRecording, setIsLiveRecording] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);

  const [isCleanView, setIsCleanView] = useState(false);

  const [mode, setMode] = useState<'live' | 'video'>('live');

  const [videoLoaded, setVideoLoaded] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('idle');

  const [showGrid, setShowGrid] = useState(false);

  const [isFrozen, setIsFrozen] = useState(false);

  const poseOrientations: PoseOrientation[] = ["front", "back", "left", "right", "auto"];
  const [showPoseOrientationModal, setShowPoseOrientationModal] = useState(false);
  const shouldResumeRef = useRef(false);

  const [anglesToDisplay, setAnglesToDisplay] = useState<string[]>([]);

  const [videoConstraints, setVideoConstraints] = useState<VideoConstraints>({
    facingMode: "user",
  });
  
  const [visibleKinematics] = useState<Kinematics[]>([Kinematics.ANGLE]);
  
  const [isPoseModalOpen, setIsPoseModalOpen] = useState(false);
  const [isPoseSettingsModalOpen, setIsPoseSettingsModalOpen] = useState(false);
  const [isPoseJumpSettingsModalOpen, setIsPoseJumpSettingsModalOpen] = useState(false);
  
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

    setAnglesToDisplay((prevAngles) => {
      const jointAngles: Record<string, { L?: string; R?: string }> = {};
      const result: string[] = [];

      selectedJoints.forEach((joint) => {
        const formatted = formatJointName(joint); // ej. "R Elbow"
        const existing = prevAngles.find((a) => a.startsWith(formatted));
        if (!existing) return;

        const match = formatted.match(/^(R|L) (.+)$/);
        if (match) {
          const [, side, baseName] = match;
          if (!jointAngles[baseName]) jointAngles[baseName] = {};
          jointAngles[baseName][side as 'L' | 'R'] = existing.split(":")[1].trim(); // valor: "30º"
        } else {
          // No tiene lado (e.g. "Head")
          jointAngles[formatted] = { L: existing.split(":")[1].trim() };
        }
      });

      Object.entries(jointAngles).forEach(([baseName, { L, R }]) => {
        if (L && R) {
          result.push(`${baseName}: ${L} / ${R}`);
        } else if (L) {
          result.push(`L ${baseName}: ${L}`);
        } else if (R) {
          result.push(`R ${baseName}: ${R}`);
        } else {
          result.push(`${baseName}: - °`);
        }
      });

      return result;
    });
  }, []); 

  const handleSwitchToVideoMode = () => {
    setIsFrozen(false);
    setShowPoseOrientationModal(false);
    handleWorkerLifecycle(false);
    setShowGrid(false);
    setMode("video");
  };

  const handleLiveRecord = () => {
    const ref = liveAnalysisRef.current;
    if (!ref) return;

    if (ref.isRecording) {
      ref.stopRecording();
    } else {
      setIsPoseSettingsModalOpen(false);
      handleMainMenu(false);

      ref.startRecording();
    }
  }
  
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
    if (recordedVideoUrl) {
      handleSwitchToVideoMode();
    }
  }, [recordedVideoUrl]);

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
          animate={{ y: (isMainMenuOpen || isCleanView) ? -52 : 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 100, damping: 15 }}
          className={`absolute z-10 inset-x-0 mx-auto w-[50vw] text-center text-xl text-white bg-[#5dadec] dark:bg-black/40 
          rounded-full py-2 pl-4 font-bold mt-2 whitespace-nowrap transition-[padding] select-none ${
            isFrozen ? "pr-8" : "pr-4" // isFrozen
          }`}>
          Kinematics
          <PauseIcon className={`absolute top-1/2 -translate-y-1/2 right-4 h-6 w-6 animate-pulse ${
            !isFrozen ? "hidden" : "" // isFrozen
          }`}/>
        </motion.h1>
        <motion.button
          data-element="non-swipeable"
          initial={{ y: 80, opacity: 1 }}
          animate={{ y: isCleanView ? 0 : 80, opacity: 1 }}
          transition={{ type: "spring", stiffness: 100, damping: 15 }}
          className="absolute z-10 bottom-4 w-16 h-16 border-[0.2rem] rounded-full p-[0.8rem]"
          onClick={handleLiveRecord}>
            <div className="w-full h-full rounded-md bg-red-500 animate-pulse"/>
        </motion.button>

        <div 
          {...(isLiveRecording && { "data-element": "non-swipeable" })}
          className="relative w-full flex-1">
          {mode === "live" && (
            <LiveAnalysis 
              ref={liveAnalysisRef}
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
              onChangeIsFrozen={(isFrozen) => {
                setIsFrozen(isFrozen);

                if (!isFrozen) {
                  setShowPoseOrientationModal(false);
                }
              }}
              onWorkerInit={() => handleWorkerLifecycle(true)}
              showGrid={showGrid}
              setShowGrid={setShowGrid}
              onRecordingChange={(value) => {
                setIsLiveRecording(value);

                setShowPoseOrientationModal(false);

                setIsCleanView(value);
              }}
              onRecordingFinish={(url) => {
                // console.log("🧪 URL que se pasa:", url);
                setRecordedVideoUrl(url);
              }} 
              showPoseOrientationModal={showPoseOrientationModal}
              setShowPoseOrientationModal={setShowPoseOrientationModal}/>
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
              onLoaded={(value) => {
                setVideoLoaded(value);

                setPoseOrientation(null);
              }}
              onStatusChange={(value) => setProcessingStatus(value)}
              onWorkerInit={() => {
                handleWorkerLifecycle(true);

                setProcessingStatus("idle");
              }} 
              onPause={(value) => {
                setIsFrozen(value);

                if (!value) {
                  setShowPoseOrientationModal(false);
                }
              }} 
              initialUrl={recordedVideoUrl} 
              isPoseJumpSettingsModalOpen={isPoseJumpSettingsModalOpen}
              setIsPoseJumpSettingsModalOpen={setIsPoseJumpSettingsModalOpen}
              onCleanView={(value) => {
                setIsCleanView(value);

                setShowPoseOrientationModal(false);
              }}
              showPoseOrientationModal={showPoseOrientationModal}
              setShowPoseOrientationModal={setShowPoseOrientationModal}/>
          )}
        </div>

        {processingStatus !== "processing" && (
          <>
            <motion.section 
              data-element="non-swipeable"
              initial={{ x: 0, opacity: 1 }}
              animate={{ x: isCleanView ? -48 : 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 100, damping: 15 }}
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
                <>
                  <ArrowUpTrayIcon 
                    className="w-6 h-6 text-white"
                    onClick={handleSwitchToVideoMode}/> 
                  <div 
                    className="w-6 h-6 rounded-full border-2 p-[0.2rem] flex items-center justify-center"
                    onClick={handleLiveRecord} >
                    <div className="bg-red-500 h-full w-full rounded-full"/>
                  </div>
                </> ) : (
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

                          if (!poseOrientation) {
                            setPoseOrientation("auto")
                          }
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
                        setIsPoseSettingsModalOpen(false);

                        if (poseOrientation) {
                          if (showPoseOrientationModal) {
                            setShowPoseOrientationModal(false);
                          }

                          videoAnalysisRef.current?.handleVideoProcessing();  
                        }
                        else {
                          setShowPoseOrientationModal(true);
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
            </motion.section>
            <motion.section 
              data-element="non-swipeable"
              initial={{ x: 0, opacity: 1 }}
              animate={{ x: (isCleanView || showPoseOrientationModal) ? 48 : 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 100, damping: 15 }}
              className="absolute top-1 right-1 p-2 z-10 flex flex-col justify-between gap-6 bg-[#5dadec] dark:bg-black/40 rounded-full"
              >
              {mode === "live" ? (
                <div 
                  className={`relative cursor-pointer ${isFrozen
                    ? 'opacity-40'
                    : 'opacity-100'
                  }`}
                  onClick={() => !isFrozen && !videoLoaded && toggleCamera()}
                  >
                  <CameraIcon className={`h-6 w-6 cursor-pointer`}/>
                  <ArrowPathIcon className="absolute top-[60%] -right-1 h-4 w-4 text-[#5dadec] dark:text-white bg-white/80 dark:bg-black/80 rounded-full p-[0.1rem]"/>
                </div>
              ) : null }
              <UserIcon 
                className={`h-6 w-6 cursor-pointer text-white`}
                onClick={() => setIsPoseModalOpen((prev) => !prev)} />
              <div className='w-6 flex justify-center items-center z-10'>
                <button 
                  className={`h-6 w-6 rounded-md text-center text-[1.2rem] font-bold leading-none uppercase ${processingStatus === "processed"
                    ? 'border text-[1.0rem]' : poseOrientation === "auto"
                    ? 'bg-green-500' : poseOrientation 
                    ? 'bg-[#5dadec]'
                    : 'bg-red-500 animate-pulse'
                  }`}
                  onClick={() => {
                    if (processingStatus === "processed") return;

                    setShowPoseOrientationModal((prev) => !prev);
                    
                    if (mode === "live") {
                      shouldResumeRef.current = !isFrozen;
                      liveAnalysisRef.current?.setIsFrozen(!showPoseOrientationModal);
                    }
                  }}
                >{poseOrientation === "auto" 
                  ? liveAnalysisRef.current?.poseOrientationInferredRef.current?.[0] ?? "?"
                  : poseOrientation ? poseOrientation[0]
                  : "?"
                }</button>
              </div>
              {processingStatus !== "processed" ? (
                <Cog6ToothIcon 
                  className={`h-6 w-6 cursor-pointer text-white`}
                  onClick={() => setIsPoseSettingsModalOpen(prev => !prev)} />
              ) : null }
              {processingStatus === "processed" ? (
                <ArrowUturnDownIcon
                  className={`h-6 w-6 cursor-pointer text-white`}
                  onClick={() => setIsPoseJumpSettingsModalOpen(prev => !prev) } />
              ) : null }

              <motion.section
                data-element="non-swipeable"
                initial={{ x: "100%", opacity: 0 }}
                animate={{ x: (isCleanView || !showPoseOrientationModal) ? "100%" : "-130%", opacity: (isCleanView || !showPoseOrientationModal) ? 0 : 1 }}
                transition={{ type: "spring", stiffness: 100, damping: 15 }}
                className="absolute top-[0.2rem] flex flex-col gap-2">
                  {poseOrientations
                    .filter(orientation => mode !== "video" || orientation !== "auto")
                    .map(orientation => (
                      <div key={orientation} className='w-[3.8rem] flex-1'>
                        <button 
                          className={`rounded-md w-full py-1 ${(orientation === poseOrientation && poseOrientation === "auto")
                            ? 'bg-green-500' : orientation === poseOrientation 
                            ? 'bg-[#5dadec]'
                            : 'bg-black/40'
                          }`}
                          onClick={(ev) => {
                            if (processingStatus === "processed") return;

                            ev.stopPropagation();

                            setPoseOrientation(orientation);
                            
                            setShowPoseOrientationModal(false);

                            if (mode === "live" && shouldResumeRef.current) {
                              shouldResumeRef.current = false;
                              liveAnalysisRef.current?.setIsFrozen(false);
                            }
                          }}><span className="uppercase">{orientation[0]}</span>{orientation.slice(1, orientation.length)}</button>
                      </div>
                  ))}
              </motion.section>
            </motion.section>
            
            {processingStatus === "idle" && (
              <motion.div 
                data-element="non-swipeable"
                initial={{ x: 0, opacity: 1 }}
                animate={{ x: isCleanView && !showPoseOrientationModal ? "56%" : 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 100, damping: 15 }}
                className="absolute bottom-2 right-1 z-30 flex flex-row-reverse items-center gap-2">
                <ArrowTopRightOnSquareIcon 
                  className={`w-8 h-8 text-white transition-transform ${(orthogonalReference === undefined)
                    ? '-rotate-0 opacity-50'
                    : '-rotate-45'
                  }`}
                  onClick={() => {                               
                    const next: OrthogonalReference = orthogonalReference === "vertical" ? undefined : "vertical";

                    setOrthogonalReference(next);
                  }} />
                {mode === "live" && ( 
                  <div 
                    className={`relative ${showGrid
                      ? "opacity-100"
                      : "opacity-40"
                    }`}
                    onClick={() => setShowGrid((prev) => !prev)}>
                    <Bars2Icon className="h-8 w-8 text-white"/>
                    <Bars2Icon className="absolute top-[0.025rem] left-[0.026rem] rotate-90 h-8 w-8 text-white"/>
                  </div> 
                )}
              </motion.div>
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
