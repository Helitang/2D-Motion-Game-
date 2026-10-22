const REQUIRED_LANDMARKS = [11, 12, 23, 24];
const ACTIONS = ['leftPunch', 'rightPunch', 'leftKick', 'rightKick'];
const VISIBILITY_THRESHOLD = 0.6;

function visible(landmarks, indices) {
  return indices.every((index) => {
    const point = landmarks[index];
    return point && Number.isFinite(point.x) && Number.isFinite(point.y)
      && (point.visibility ?? 0) >= VISIBILITY_THRESHOLD;
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
  const facingCamera = shoulderWidth >= 0.3 && hipWidth >= 0.15 && shoulderSkew <= 0.45 && hipSkew <= 0.45;

  const extendedArm = (shoulder, elbow, wrist) => {
    if (!visible(landmarks, [shoulder, elbow, wrist])) return false;
    const points = [landmarks[shoulder], landmarks[elbow], landmarks[wrist]];
    return (points[2].z ?? 0) < (points[0].z ?? 0) - torsoHeight * 0.28
      && angleAt(points[0], points[1], points[2]) >= 135
      && distance3d(points[0], points[2]) / torsoHeight >= 0.78;
  };

  const extendedLeg = (hip, knee, ankle) => {
    if (!visible(landmarks, [hip, knee, ankle])) return false;
    const points = [landmarks[hip], landmarks[knee], landmarks[ankle]];
    return (points[2].z ?? 0) < (points[0].z ?? 0) - torsoHeight * 0.3
      && angleAt(points[0], points[1], points[2]) >= 135
      && distance3d(points[1], points[2]) / torsoHeight >= 0.55;
  };

  return {
    tracked: true,
    facingCamera,
    leftPunch: facingCamera && extendedArm(11, 13, 15),
    rightPunch: facingCamera && extendedArm(12, 14, 16),
    leftKick: facingCamera && extendedLeg(23, 25, 27),
    rightKick: facingCamera && extendedLeg(24, 26, 28),
  };
}

export function createGestureGate({ confirmationFrames = 3, cooldownMs = 650, releaseFrames = 4 } = {}) {
  const frames = Object.fromEntries(ACTIONS.map((action) => [action, 0]));
  const latched = Object.fromEntries(ACTIONS.map((action) => [action, false]));
  const inactiveFrames = Object.fromEntries(ACTIONS.map((action) => [action, 0]));
  const lastAcceptedAt = Object.fromEntries(ACTIONS.map((action) => [action, -Infinity]));

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
      if (frames[kind] < confirmationFrames || latched[kind] || now - lastAcceptedAt[kind] < cooldownMs) return false;
      latched[kind] = true;
      lastAcceptedAt[kind] = now;
      return true;
    },
  };
}