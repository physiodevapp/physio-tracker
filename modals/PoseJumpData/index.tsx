import React, { useEffect, useRef, useState } from 'react';
import { motion } from "framer-motion";
import { JumpEvents } from '@/interfaces/pose';

interface IndexProps {
  isSettingsModalOpen: boolean;
  isDataModalOpen: boolean;
  jumpDetected?: JumpEvents | null;
}

const Index = ({
  isSettingsModalOpen,
  isDataModalOpen,
  jumpDetected,
}: IndexProps) => {
  const [isModalReady, setIsModalReady] = useState(false);

  const isAnimationRunningRef = useRef(false);

  const g = 9.81; // m/s²
  const [thighLength, setThighLength] = useState(10); // cm
  const [legLength, setLegLength] = useState(10); // cm
  const [weight, setWeight] = useState(50); // kg
  const [boxHeight, setBoxHeight] = useState(20); // cm

  const [flightTime, setFlightTime] = useState(0); // seg
  const [jumpHeight, setJumpHeight] = useState(0); // cm
  const [maxVelocity, setMaxVelocity] = useState(0); // m/s
  const [RSI, setRSI] = useState(0);
  const [jumpPower, setJumpPower] = useState(0); // W
  const [impulseDistance, setImpulseDistance] = useState(0); // cm
  const [eccentricPowerAfterDrop, setEccentricPowerAfterDrop] = useState(0);

  const getFlightTime = () => {
    const flightTime = (jumpDetected?.landing?.videoTime ?? 0) - (jumpDetected?.takeoff?.videoTime ?? 0)

    return flightTime;
  }

  const getJumpHeight = () => {
    const jumpHeight = Math.pow(getFlightTime(), 2) * g / 8;

    return (jumpHeight * 100);
  }

  const getMaxVelocity = () => {
    const height = (getJumpHeight() / 100); // meters
    const maxVelocity = Math.pow((2 * g * height), 1/2);

    return maxVelocity;
  }

  const getImpulseDistance = () => {
    let impulseDistance;
    if (
      jumpDetected?.impulse.hipAngle &&
      jumpDetected?.impulse.kneeAngle && 
      jumpDetected?.takeoff.hipAngle &&
      jumpDetected?.takeoff.hipAngle
    ) {
      const impulseRadHip = Math.abs(jumpDetected.impulse.hipAngle ?? 0) * Math.PI / 180;
      const impulseRadKnee = Math.abs(jumpDetected.impulse.kneeAngle ?? 0) * Math.PI / 180;
      const takeoffRadHip = Math.abs(jumpDetected.takeoff.hipAngle ?? 0) * Math.PI / 180;
      const takeoffRadKnee = Math.abs(jumpDetected.takeoff.kneeAngle ?? 0) * Math.PI / 180;

      const impulseHeight = (thighLength * Math.cos(impulseRadHip)) + (legLength * Math.cos(impulseRadKnee));
      const takeoffHeight = (thighLength * Math.cos(takeoffRadHip)) + (legLength * Math.cos(takeoffRadKnee));

      impulseDistance = takeoffHeight - impulseHeight;
      // console.log('impulse hipAngle - kneeAngle -> ', Math.abs(jumpDetected.impulse.hipAngle ?? 0), ' - ', Math.abs(jumpDetected.impulse.kneeAngle ?? 0))
      // console.log('takeoff hipAngle - kneeAngle -> ', Math.abs(jumpDetected.takeoff.hipAngle ?? 0), ' - ', Math.abs(jumpDetected.takeoff.kneeAngle ?? 0))
      // console.log('takeoffHeight ', takeoffHeight)
      // console.log('impulseHeight ', impulseHeight)
      // console.log('impulse distance --> ', impulseDistance)
    }

    return impulseDistance;
  }

  const getRSI = () => {
    let reactiveStrengthIndex;
    if (
      jumpDetected?.takeoff.videoTime &&
      jumpDetected?.groundContact.videoTime
    ) {
      const timeContact = jumpDetected?.takeoff.videoTime - jumpDetected?.groundContact.videoTime
      const height = getJumpHeight();

      reactiveStrengthIndex = (height / 100) / timeContact;
    }

    return reactiveStrengthIndex;
  }

  const getJumpPower = () => {
    let power;

    if (
      jumpDetected?.takeoff.videoTime &&
      jumpDetected?.impulse?.videoTime
    ) {
      const impulseTime = jumpDetected?.takeoff.videoTime - jumpDetected?.impulse?.videoTime;
      const impulseDistance = getImpulseDistance() ?? 0;

      if (impulseTime > 0 && impulseDistance > 0) {
        const acceleration = (2 * (impulseDistance / 100)) / (impulseTime ** 2);
        const netForce = weight * (acceleration + g);
  
        power = (netForce * (impulseDistance / 100)) / impulseTime;
        // console.log(impulseTime)
        // console.log(impulseDistance)
        // console.log(netForce)
        // console.log('///')
      }
    }
    
    return power;
  }

  const getEccentricPowerAfterDrop = () => {
    let eccentricPowerAfterDrop;

    if (
      jumpDetected?.groundContact.videoTime &&
      jumpDetected?.impulse.videoTime
    ) {
      const brakingTime = jumpDetected?.impulse.videoTime - jumpDetected?.groundContact.videoTime
    
      if (brakingTime > 0) {
        const energyPotential = weight * g * boxHeight;
        
        eccentricPowerAfterDrop = energyPotential / brakingTime;
      }
    }
    
    return eccentricPowerAfterDrop;
  }

  const handleAnimationStart = () => {
    isAnimationRunningRef.current = true;
  }

  const handleAnimationComplete = () => {
    isAnimationRunningRef.current = false;

    if (!isSettingsModalOpen) {
      setIsModalReady(false);
    }
  }

  useEffect(() => {
    if (isSettingsModalOpen) {
      setIsModalReady(true);
    }
    else if (!isAnimationRunningRef.current) {
      setIsModalReady(false);
    }
  }, [isSettingsModalOpen]);

  useEffect(() => {
    if (
      jumpDetected?.takeoff?.videoTime != null && 
      jumpDetected?.landing?.videoTime != null
    ) {
      const flight = getFlightTime();
      const height = getJumpHeight();
      const velocity = getMaxVelocity();
      const RSI = getRSI();

      setFlightTime(flight);
      setJumpHeight(height);
      setMaxVelocity(velocity);
      setRSI(RSI ?? 0);
    }
    else {
      setFlightTime(0);
      setJumpHeight(0);
      setMaxVelocity(0);
      setRSI(0);
    }

    if (
      jumpDetected?.impulse?.videoTime != null &&
      jumpDetected?.takeoff?.videoTime != null 
    ) {
      const jumpPower = getJumpPower();
      const impulseDistance = getImpulseDistance();

      setJumpPower(jumpPower ?? 0);
      setImpulseDistance(impulseDistance ?? 0);
    }
    else {
      setJumpPower(0);
      setImpulseDistance(0);
    }

    if (
      jumpDetected?.groundContact?.videoTime != null &&
      jumpDetected?.impulse?.videoTime != null 
    ) {
      const eccentricPowerAfterDrop = getEccentricPowerAfterDrop();

      setEccentricPowerAfterDrop(eccentricPowerAfterDrop ?? 0);
    }
    else {
      setEccentricPowerAfterDrop(0);
    }
  }, [jumpDetected]); 

  useEffect(() => {
    const jumpPowerUpdated = getJumpPower();
    const impulseDistanceUpdated = getImpulseDistance();

    if (jumpPowerUpdated){
      setJumpPower(jumpPowerUpdated);
    }
    if (impulseDistanceUpdated){
      setImpulseDistance(impulseDistanceUpdated);
    }
  }, [thighLength, legLength, weight]);

  useEffect(() => {
    const eccentricPowerAfterDropUpdated = getEccentricPowerAfterDrop();

    if (eccentricPowerAfterDropUpdated) {
      setEccentricPowerAfterDrop(eccentricPowerAfterDropUpdated);
    }
  }, [boxHeight, weight])

  return isModalReady ? (
    <motion.div
      data-element="non-swipeable"
      initial={{ y: 0, opacity: 0 }}
      animate={{ y: isDataModalOpen ? 0 : "100%", opacity: isDataModalOpen ? 1 : 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 18 }}
      onAnimationStart={handleAnimationStart}
      onAnimationComplete={handleAnimationComplete}
      className="fixed z-40 bottom-0 left-0 w-full h-1/2 px-4 pt-[1rem] pb-[2rem] border-0 flex flex-col items-center justify-center gap-0 bg-gradient-to-b from-black/40 to-black shadow-[0_0_3px_rgba(0,0,0,0.2)] dark:shadow-[0_0_3px_rgba(0,0,0,0.46)]">
      {/* block 1 */}
      <section className="w-full flex flex-col justify-center gap-2 border-[#5dadec] border-2 dark:bg-black/60 p-4 rounded-lg">
        <div className='flex w-full gap-2'>
          {/* flight time */}
          <div className='flex-1 flex flex-col justify-between gap-2'>
            Flight: {flightTime.toFixed(2)} s
          </div>
          {/* hump height */}
          <div className='flex-1 flex flex-col justify-between gap-2'>
            Height: {jumpHeight.toFixed(2)} cm
          </div>
        </div>
        <div className='flex flex-row w-full gap-2'>
          {/* max velocity */}
          <div className='flex-1 block'>
            Max: {maxVelocity.toFixed(2)} m/s
          </div>
          {/* mean velocity */}
          <div className='flex-1 block'>
            Mean: {(maxVelocity / 2).toFixed(2)} m/s
          </div>
        </div>
        <div className='flex flex-row w-full gap-2'>
          {/* impulse distance */}
          <div className='flex-1 block'>
            Impulse: {impulseDistance.toFixed(2)} cm
          </div>
          {/* jump power */}
          <div className='flex-1 block'>
            Jump: {jumpPower.toFixed(2)} W
          </div>
        </div>
        <div className='flex flex-row w-full gap-2'>
          {/* reactive strength index */}
          <div className='flex-1 block'>
            RSI: {RSI.toFixed(2)}
          </div>
          {/* eccentric power after drop */}
          <div className='flex-1 block'>
            Brake: {eccentricPowerAfterDrop.toFixed(2)} W
          </div>
        </div>
      </section>
      {/* block 2 */}
      <section className="w-full flex flex-col justify-center gap-4 border-[#5dadec] border-0 dark:bg-black/0 p-4 rounded-lg">
        <div className='flex flex-row flex-1 gap-6'>
          {/* thigh length */}
          <div className='flex-1 flex flex-col justify-between gap-2'>
            <label
              htmlFor='thigh-length'
              className={`text-white`} >
              Thigh: {thighLength} cm
            </label>
            <input
              id='thigh-length'
              type='range'
              value={thighLength}
              min="10"
              max="100"
              step="1"              
              onChange={(e) => setThighLength(Number(e.target.value))} />
          </div>
          {/* leg length */}
          <div className='flex-1 flex flex-col justify-between gap-2'>
            <label
              htmlFor='leg-length'
              className={`text-white`} >
              Leg: {legLength} cm
            </label>
            <input
              id='leg-length'
              type='range'
              value={legLength}
              min="10"
              max="100"
              step="1"              
              onChange={(e) => setLegLength(Number(e.target.value))} />
          </div>
        </div>
        <div className='flex flex-row flex-1 gap-6'>
          {/* body weight */}
          <div className='flex-1 flex flex-col justify-between gap-2'>
            <label
              htmlFor='body-weight'
              className={`text-white`} >
              Weight: {weight} kg
            </label>
            <input
              id='body-weight'
              type='range'
              value={weight}
              min="0"
              max="200"
              step="1"              
              onChange={(e) => setWeight(Number(e.target.value))} />
          </div>
          {/* drop height */}
          <div className='flex-1 flex flex-col justify-between gap-2'>
            <label
              htmlFor='drop-height'
              className={`text-white`} >
              Drop <span className="align-sub text-[0.6rem] uppercase"> height</span>: {boxHeight} cm
            </label>
            <input
              id='drop-height'
              type='range'
              value={boxHeight}
              min="0"
              max="200"
              step="1"              
              onChange={(e) => setBoxHeight(Number(e.target.value))} />
          </div>
        </div>
      </section>
    </motion.div>
  ) : null;
};

export default Index;
