export function detectJumpWindowsByAngle({
  frames,
  side = "right",
  joint = "knee",
  minJumpTrendingFlexion = 15,
  minFlightTrendingFlexion = 25,
  minFlightFlexion = 20,
  minSingleStepFlexion = 5,
  maxLandingFlexion = 20,
  minFlexionBeforeJump = 45,
  minFlexionAfterLanding = 45,
  slidingAvgWindow = 3,
  searchWindow = 15,
  trendWindow = 3,
}: {
  frames: VideoFrame[];
  side?: "left" | "right";
  joint?: "knee" | "hip";
  // Asegura que el ángulo del candidato haya aumentado lo suficiente 
  // con respecto al punto más bajo durante el vuelo 
  // (referenceAngle, que normalmente es curr).
  // Esto garantiza una flexión real, no solo una oscilación mínima
  minJumpTrendingFlexion?:number;
  minFlightTrendingFlexion?: number;
  // Si el ángulo está por debajo de minFlightFlexion, 
  // es muy probable que el pie no haya tocado aún el suelo
  minFlightFlexion?: number;
  minSingleStepFlexion?: number;
  maxLandingFlexion?: number;
  minFlexionBeforeJump?: number;
  minFlexionAfterLanding?: number;
  slidingAvgWindow?: number;
  searchWindow?: number;
  trendWindow?: number;
}): {
  impulsePoint: AnglePoint;
  takeoffPoint: AnglePoint; 
  landingPoint: AnglePoint; 
  cushionPoint: AnglePoint;
}[] {
  if (!frames.length) return [];

  const jointName =
    joint === "hip"
      ? side === "right"
        ? CanvasKeypointName.RIGHT_HIP
        : CanvasKeypointName.LEFT_HIP
      : side === "right"
      ? CanvasKeypointName.RIGHT_KNEE
      : CanvasKeypointName.LEFT_KNEE;

  const angleValues = frames.map((f) => ({
    angle: f.jointData?.[jointName]?.angle ?? null,
    yValue: f.keypoints.find(kp => kp.name === jointName)?.y ?? null,
    videoTime: f.videoTime,
  }));
  const validAngles = angleValues
    .map((a, i) => ({
      index: i,
      angle: a.angle,
      yValue: a.yValue,
      videoTime: a.videoTime,
    }))
    .filter((a) => a.angle !== null) as AnglePoint[];
  const smoothedAngles: AnglePoint[] = validAngles.map((p, i, arr) => {
    const start = Math.max(0, i - Math.floor(slidingAvgWindow / 2));
    const end = Math.min(arr.length, i + Math.ceil(slidingAvgWindow / 2));
    const window = arr.slice(start, end).map((a) => ({
      angle: a.angle,
      yValue: a.yValue,
    }));
    const avgAngle = window.reduce((sum, val) => sum + val.angle, 0) / window.length;
    const avgY = window.reduce((sum, val) => sum + val.yValue, 0) / window.length;

    return {
      index: p.index,
      angle: avgAngle,
      yValue: avgY,
      videoTime: p.videoTime, // ✅ Mantenemos el mismo timestamp
    };
  });
  // console.log('angleValues ', angleValues)
  console.log('validAngles ',validAngles)
  console.log('smoothedAngles ', smoothedAngles)

  const results: { 
    impulsePoint: AnglePoint; 
    takeoffPoint: AnglePoint;
    landingPoint: AnglePoint;  
    cushionPoint: AnglePoint; 
  }[] = [];

  for (let i = 1; i < smoothedAngles.length - 1; i++) {
    const prev = smoothedAngles[i - 1].angle;
    const curr = smoothedAngles[i].angle;
    const next = smoothedAngles[i + 1].angle;

    // Detectar mínimo local (centro del vuelo)
    if (curr < minFlightFlexion && curr < prev && curr < next) {
      const preWindowSmoothed = smoothedAngles.slice(Math.max(0, i - searchWindow), i);
      const postWindowSmoothed = smoothedAngles.slice(i + 1, i + 1 + searchWindow);

      const impulsePoint = findImpulsePoint(
        preWindowSmoothed, 
        trendWindow
      );
      if (!impulsePoint) continue; // saltamos si no hay tendencia válida

      const cushionPoint = findCushionPoint(
        postWindowSmoothed, 
        trendWindow,
      );
      if (!cushionPoint) continue;

      const fromImpulseToMin = smoothedAngles.slice(
        validAngles.findIndex(p => p.index === impulsePoint.index),
        i // i = índice del mínimo local (centro del salto)
      );
      const takeoffPoint = findTakeoffPoint(
        fromImpulseToMin,
        trendWindow,
        minFlightFlexion,
        minFlightTrendingFlexion,
        impulsePoint.angle,
      );     
      if (!takeoffPoint) continue;

      const fromMinToCushion = validAngles.slice(
        i + 1,
        validAngles.findIndex(p => p.index === cushionPoint.index)
      );
      const landingPoint = findLandingPoint(
        fromMinToCushion,
        trendWindow,
        minFlightFlexion,
        minFlightTrendingFlexion,
        curr, // ángulo mínimo del salto, en el frame i
        minSingleStepFlexion,
        maxLandingFlexion,
      );
      if (!landingPoint) continue;

      const angleChange = Math.abs(impulsePoint.angle - curr);

      if (
        impulsePoint.angle >= minFlexionBeforeJump &&
        cushionPoint.angle >= minFlexionAfterLanding &&
        angleChange >= minJumpTrendingFlexion
      ) {
        results.push({
          impulsePoint,
          takeoffPoint,
          landingPoint,
          cushionPoint,
        });
        i += searchWindow;
      }
    }
  }

  return results;
}