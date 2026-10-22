const REQUIRED_LANDMARKS = [11, 12, 23, 24];
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

function midpoint(first, second) {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function angleAt(first, vertex, last) {
  const firstVector = { x: first.x - vertex.x, y: first.y - vertex.y };
  const lastVector = { x: last.x - vertex.x, y: last.y - vertex.y };
  const magnitude = Math.hypot(firstVector.x, firstVector.y) * Math.hypot(lastVector.x, lastVector.y);
  if (magnitude === 0) return 0;
  const cosine = (firstVector.x * lastVector.x + firstVector.y * lastVector.y) / magnitude;
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
}

export function classifyPose(landmarks, referenceX = null) {
  if (!landmarks || !visible(landmarks, REQUIRED_LANDMARKS)) {
    return { tracked: false, direction: 0, punch: false, kick: false, centerX: null };
  }

  const shoulderCenter = midpoint(landmarks[11], landmarks[12]);
  const hipCenter = midpoint(landmarks[23], landmarks[24]);
  const torsoHeight = distance(shoulderCenter, hipCenter);
  if (torsoHeight < 0.12) {
    return { tracked: false, direction: 0, punch: false, kick: false, centerX: null };
  }

  const centerX = (shoulderCenter.x + hipCenter.x) / 2;
  const movementDelta = referenceX === null ? 0 : centerX - referenceX;
  const direction = movementDelta < -0.11 ? 1 : movementDelta > 0.11 ? -1 : 0;
  const extendedArm = (shoulder, elbow, wrist) => {
    if (!visible(landmarks, [shoulder, elbow, wrist])) return false;
    const points = [landmarks[shoulder], landmarks[elbow], landmarks[wrist]];
    const wristHeightValid = points[2].y > shoulderCenter.y - torsoHeight * 0.55
      && points[2].y < hipCenter.y + torsoHeight * 0.2;
    return wristHeightValid
      && angleAt(points[0], points[1], points[2]) >= 148
      && distance(points[0], points[2]) / torsoHeight >= 0.82;
  };
  const extendedLeg = (hip, knee, ankle) => {
    if (!visible(landmarks, [hip, knee, ankle])) return false;
    const points = [landmarks[hip], landmarks[knee], landmarks[ankle]];
    return angleAt(points[0], points[1], points[2]) >= 145
      && distance(points[1], points[2]) / torsoHeight >= 0.55
      && Math.abs(points[2].x - points[0].x) / torsoHeight >= 0.58
      && points[2].y < points[0].y + torsoHeight * 1.25;
  };

  return {
    tracked: true,
    direction,
    punch: extendedArm(11, 13, 15) || extendedArm(12, 14, 16),
    kick: extendedLeg(23, 25, 27) || extendedLeg(24, 26, 28),
    centerX,
  };
}

export function createGestureGate({ confirmationFrames = 3, cooldownMs = 650 } = {}) {
  const frames = { punch: 0, kick: 0 };
  const latched = { punch: false, kick: false };
  let lastAcceptedAt = -Infinity;

  return {
    resetForTrackingLoss() {
      frames.punch = 0;
      frames.kick = 0;
      latched.punch = true;
      latched.kick = true;
    },
    observe(kind, active, now) {
      if (!active) {
        frames[kind] = 0;
        latched[kind] = false;
        return false;
      }
      frames[kind] += 1;
      if (frames[kind] < confirmationFrames || latched[kind] || now - lastAcceptedAt < cooldownMs) return false;
      latched[kind] = true;
      lastAcceptedAt = now;
      return true;
    },
  };
}

export function createDirectionFilter({ confirmationFrames = 3 } = {}) {
  let direction = 0;
  let candidate = 0;
  let candidateFrames = 0;

  return {
    reset() {
      direction = 0;
      candidate = 0;
      candidateFrames = 0;
      return direction;
    },
    observe(nextDirection) {
      if (nextDirection === direction) {
        candidate = direction;
        candidateFrames = 0;
        return direction;
      }
      if (nextDirection === candidate) candidateFrames += 1;
      else {
        candidate = nextDirection;
        candidateFrames = 1;
      }
      if (candidateFrames >= confirmationFrames) {
        direction = candidate;
        candidateFrames = 0;
      }
      return direction;
    },
  };
}