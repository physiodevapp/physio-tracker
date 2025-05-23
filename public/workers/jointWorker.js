// jointWorker.js

self.onmessage = (e) => {
  const {
    keypoints,
    jointNames,
    jointConfigMap,
    jointDataMap = {},
    angleHistorySize,
    orthogonalReference,
  } = e.data;

  const updatedJointData = {};

  jointNames.forEach((jointName) => {
    const jointConfig = jointConfigMap[jointName] ?? { invert: false };
    const history = jointDataMap[jointName]?.angleHistory ?? [];
    const jointKeypoints = getJointKeypoints(jointName, keypoints);
    if (!jointKeypoints) return;

    const [kpA, kpB, kpC] = jointKeypoints;
    const angleNow = calculateJointAngleDegrees(kpA, kpB, kpC, jointConfig.invert, orthogonalReference);

    const newHistory = angleHistorySize > 0 
      ? [...history, angleNow]
      : [];
    if (newHistory.length > angleHistorySize) {
      newHistory.shift();
    } 

    const smoothedAngle = angleHistorySize > 0 
      ? newHistory.reduce((a, b) => a + b, 0) / newHistory.length
      : angleNow;

    updatedJointData[jointName] = {
      angle: smoothedAngle,
      angleHistory: newHistory,
      color: getColorsForJoint(jointName),
      timestamp: Date.now(),
    };
  });

  self.postMessage({ updatedJointData });
};

// === Funciones auxiliares ===

function calculateJointAngleDegrees(A, B, C, invert = false, orthogonalReference) {
  const isShoulder = B.name?.includes('shoulder');
  const isHip = B.name?.includes('hip');

  if ((orthogonalReference === 'vertical' || orthogonalReference === 'horizontal') && (isShoulder || isHip)) {
    const targetName = isShoulder ? 'elbow' : 'knee';
    const referencePoint = A.name?.includes(targetName) ? A : C.name?.includes(targetName) ? C : null;
    if (!referencePoint) return 0;

    const jointVector = { x: referencePoint.x - B.x, y: referencePoint.y - B.y };

    if (orthogonalReference === 'vertical') {
      const referenceVector = { x: 0, y: 1 };
      const dot = referenceVector.x * jointVector.x + referenceVector.y * jointVector.y;
      const magJoint = Math.hypot(jointVector.x, jointVector.y);
      if (magJoint === 0) return 0;
      const angleDeg = Math.acos(dot / magJoint) * (180 / Math.PI);
      return invert ? 180 - angleDeg : angleDeg;
    }

    if (orthogonalReference === 'horizontal') {
      const isRight = referencePoint.x > B.x;
      const referenceVector = { x: isRight ? 1 : -1, y: 0 };
      const angleRad = Math.atan2(referenceVector.y, referenceVector.x) - Math.atan2(jointVector.y, jointVector.x);
      let angleDeg = angleRad * (180 / Math.PI);
      if (angleDeg > 180) angleDeg -= 360;
      if (angleDeg < -180) angleDeg += 360;
      if (referenceVector.x < 0) angleDeg = -angleDeg;
      return invert ? -angleDeg : angleDeg;
    }
  }

  const BA = { x: A.x - B.x, y: A.y - B.y };
  const BC = { x: C.x - B.x, y: C.y - B.y };
  const dot = BA.x * BC.x + BA.y * BC.y;
  const magBA = Math.hypot(BA.x, BA.y);
  const magBC = Math.hypot(BC.x, BC.y);
  if (magBA === 0 || magBC === 0) return 0;
  let angleDeg = Math.acos(dot / (magBA * magBC)) * (180 / Math.PI);
  return invert ? 180 - angleDeg : angleDeg;
}

function getJointKeypoints(jointName, keypoints) {
  const map = {
    right_elbow: ['right_shoulder', 'right_elbow', 'right_wrist'],
    right_knee: ['right_hip', 'right_knee', 'right_ankle'],
    right_shoulder: ['right_hip', 'right_shoulder', 'right_elbow'],
    right_hip: ['right_shoulder', 'right_hip', 'right_knee'],
    left_elbow: ['left_shoulder', 'left_elbow', 'left_wrist'],
    left_knee: ['left_hip', 'left_knee', 'left_ankle'],
    left_shoulder: ['left_hip', 'left_shoulder', 'left_elbow'],
    left_hip: ['left_shoulder', 'left_hip', 'left_knee'],
  };

  const jointPoints = map[jointName];
  if (!jointPoints) return null;

  const [a, b, c] = jointPoints;
  const kpA = keypoints.find(kp => kp.name === a);
  const kpB = keypoints.find(kp => kp.name === b);
  const kpC = keypoints.find(kp => kp.name === c);
  return kpA && kpB && kpC ? [kpA, kpB, kpC] : null;
}

function getColorsForJoint(jointName) {
  if (!jointName) return { borderColor: 'white', backgroundColor: 'white' };
  let hash = 0;
  for (let i = 0; i < jointName.length; i++) {
    hash = jointName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const absHash = Math.abs(hash);
  const lower = jointName.toLowerCase();
  const isRight = lower.includes('right') && !lower.includes('left');
  const isLeft = lower.includes('left') && !lower.includes('right');
  const baseHue = isRight ? absHash % 180 : isLeft ? (absHash % 180) + 180 : absHash % 360;
  return {
    borderColor: `hsl(${baseHue}, 70%, 50%)`,
    backgroundColor: `hsla(${baseHue}, 70%, 50%, 0.2)`,
  };
}
