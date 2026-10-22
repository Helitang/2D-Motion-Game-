const REQUIRED_LANDMARKS = [11, 12, 23, 24];
const ACTIONS = ['leftPunch', 'rightPunch', 'leftKick', 'rightKick'];
const VISIBILITY_THRESHOLD = 0.6;

function visible(landmarks, indices, threshold = VISIBILITY_THRESHOLD) {
  return indices.every((index) => {
    const point = landmarks[index];
    return point && Number.isFinite(point.x) && Number.isFinite(point.y)
      && (point.visibility ?? 0) >= threshold;
  });
}

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function distance3d(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y, (first.z ?? 0) - (second.z ?? 0));
}

function midpoint(first, second) {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function angleAt(first, vertex, last) {
  const firstVector = { x: first.x - vertex.x, y: first.y - vertex.y, z: (first.z ?? 0) - (vertex.z ?? 0) };
  const lastVector = { x: last.x - vertex.x, y: last.y - vertex.y, z: (last.z ?? 0) - (vertex.z ?? 0) };
  const magnitude = Math.hypot(firstVector.x, firstVector.y, firstVector.z)
    * Math.hypot(lastVector.x, lastVector.y, lastVector.z);
  if (magnitude === 0) return 0;
  const cosine = (firstVector.x * lastVector.x + firstVector.y * lastVector.y + firstVector.z * lastVector.z) / magnitude;
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
}

function emptyPose(tracked = false) {
  return {
    tracked,
    facingCamera: false,
    leftPunch: false,
    rightPunch: false,
    leftKick: false,
    rightKick: false,
    leftPunchExtension: 0,
    rightPunchExtension: 0,
  };
}

export function classifyPose(landmarks) {
  if (!landmarks || !visible(landmarks, REQUIRED_LANDMARKS)) return emptyPose();

  const shoulderCenter = midpoint(landmarks[11], landmarks[12]);
  const hipCenter = midpoint(landmarks[23], landmarks[24]);
  const torsoHeight = distance(shoulderCenter, hipCenter);
  if (torsoHeight < 0.12) return emptyPose();

  const shoulderWidth = distance(landmarks[11], landmarks[12]) / torsoHeight;
  const hipWidth = distance(landmarks[23], landmarks[24]) / torsoHeight;
  const shoulderSkew = Math.abs(landmarks[11].y - landmarks[12].y) / torsoHeight;
  const hipSkew = Math.abs(landmarks[23].y - landmarks[24].y) / torsoHeight;
  const shoulderDepthSkew = Math.abs((landmarks[11].z ?? 0) - (landmarks[12].z ?? 0)) / torsoHeight;
  const hipDepthSkew = Math.abs((landmarks[23].z ?? 0) - (landmarks[24].z ?? 0)) / torsoHeight;
  const facingCamera = shoulderWidth >= 0.3 && hipWidth >= 0.15
    && shoulderSkew <= 0.45 && hipSkew <= 0.45
    && shoulderDepthSkew <= 0.55 && hipDepthSkew <= 0.55;

  const extendedArm = (shoulder, elbow, wrist, thresholds = {}) => {
    const {
      visibility = VISIBILITY_THRESHOLD,
      depthRatio = 0.28,
      minimumAngle = 135,
      lengthRatio = 0.78,
    } = thresholds;
    if (!visible(landmarks, [shoulder, elbow, wrist], visibility)) return false;
    const points = [landmarks[shoulder], landmarks[elbow], landmarks[wrist]];
    return (points[2].z ?? 0) < (points[0].z ?? 0) - torsoHeight * depthRatio
      && angleAt(points[0], points[1], points[2]) >= minimumAngle
      && distance3d(points[0], points[2]) / torsoHeight >= lengthRatio;
  };

  const armExtension = (shoulder, wrist, visibility = VISIBILITY_THRESHOLD) => {
    if (!visible(landmarks, [shoulder, wrist], visibility)) return 0;
    return Math.max(0, ((landmarks[shoulder].z ?? 0) - (landmarks[wrist].z ?? 0)) / torsoHeight);
  };

  const kneeAboveWaist = (hip, knee) => {
    return visible(landmarks, [hip, knee], 0.35)
      && landmarks[knee].y < landmarks[hip].y;
  };

  return {
    tracked: true,
    facingCamera,
    leftPunch: facingCamera && extendedArm(11, 13, 15),
    rightPunch: facingCamera && extendedArm(12, 14, 16, {
      visibility: 0.4,
      depthRatio: 0.18,
      minimumAngle: 115,
      lengthRatio: 0.62,
    }),
    leftKick: facingCamera && kneeAboveWaist(23, 25),
    rightKick: facingCamera && kneeAboveWaist(24, 26),
    leftPunchExtension: armExtension(11, 15),
    rightPunchExtension: armExtension(12, 16, 0.4),
  };
}

export function createPunchMotionDetector({ windowMs = 220, minimumAdvance = 0.12, minimumAdvanceByAction = {} } = {}) {
  const history = { leftPunch: [], rightPunch: [] };

  return {
    reset() {
      history.leftPunch = [];
      history.rightPunch = [];
    },
    observe(action, extension, poseActive, now) {
      const samples = history[action];
      const oldest = samples[0];
      while (samples.length && now - samples[0].time > windowMs) samples.shift();
      const baseline = samples[0]?.extension;
      samples.push({ time: now, extension });
      if (!poseActive || baseline === undefined) return false;
      return extension - baseline >= (minimumAdvanceByAction[action] ?? minimumAdvance);
    },
  };
}

export function createGestureGate({ confirmationFrames = 4, cooldownMs = 800, releaseFrames = 8 } = {}) {
  const frames = Object.fromEntries(ACTIONS.map((action) => [action, 0]));
  const latched = Object.fromEntries(ACTIONS.map((action) => [action, false]));
  const inactiveFrames = Object.fromEntries(ACTIONS.map((action) => [action, 0]));
  let lastAcceptedAt = -Infinity;

  return {
    resetForTrackingLoss() {
      for (const action of ACTIONS) {
        frames[action] = 0;
        latched[action] = true;
        inactiveFrames[action] = 0;
      }
    },
    observe(kind, active, now) {
      if (!ACTIONS.includes(kind)) return false;
      if (!active) {
        frames[kind] = 0;
        if (latched[kind]) {
          inactiveFrames[kind] += 1;
          if (inactiveFrames[kind] >= releaseFrames) {
            latched[kind] = false;
            inactiveFrames[kind] = 0;
          }
        }
        return false;
      }
      inactiveFrames[kind] = 0;
      frames[kind] += 1;
      if (frames[kind] < confirmationFrames || latched[kind] || now - lastAcceptedAt < cooldownMs) return false;
      latched[kind] = true;
      lastAcceptedAt = now;
      return true;
    },
  };
}