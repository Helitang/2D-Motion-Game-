import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPose, createGestureGate, createPunchMotionDetector } from '../src/pose-classifier.js';

function standingPose() {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  Object.assign(points[11], { x: 0.4, y: 0.3 });
  Object.assign(points[12], { x: 0.6, y: 0.3 });
  Object.assign(points[13], { x: 0.34, y: 0.37 });
  Object.assign(points[14], { x: 0.66, y: 0.37 });
  Object.assign(points[15], { x: 0.31, y: 0.43 });
  Object.assign(points[16], { x: 0.69, y: 0.43 });
  Object.assign(points[23], { x: 0.44, y: 0.56 });
  Object.assign(points[24], { x: 0.56, y: 0.56 });
  Object.assign(points[25], { x: 0.44, y: 0.73 });
  Object.assign(points[26], { x: 0.56, y: 0.73 });
  Object.assign(points[27], { x: 0.44, y: 0.92 });
  Object.assign(points[28], { x: 0.56, y: 0.92 });
  return points;
}

test('rejects attacks while the person is side-facing', () => {
  const pose = standingPose();
  Object.assign(pose[11], { x: 0.48 });
  Object.assign(pose[12], { x: 0.52 });
  Object.assign(pose[23], { x: 0.49 });
  Object.assign(pose[24], { x: 0.51 });
  Object.assign(pose[13], { z: -0.05 });
  Object.assign(pose[15], { z: -0.22 });
  const result = classifyPose(pose);
  assert.equal(result.facingCamera, false);
  assert.equal(result.leftPunch, false);
});

test('rejects a turned torso even when the shoulder span looks frontal', () => {
  const pose = standingPose();
  pose[11].z = -0.18;
  pose[23].z = -0.14;
  Object.assign(pose[13], { z: -0.05 });
  Object.assign(pose[15], { z: -0.22 });
  const result = classifyPose(pose);
  assert.equal(result.facingCamera, false);
  assert.equal(result.leftPunch, false);
});

test('accepts a front-facing pose with a narrow camera crop', () => {
  const pose = standingPose();
  Object.assign(pose[11], { x: 0.455 });
  Object.assign(pose[12], { x: 0.545 });
  Object.assign(pose[23], { x: 0.475 });
  Object.assign(pose[24], { x: 0.525 });
  assert.equal(classifyPose(pose).facingCamera, true);
});

test('distinguishes left and right straight punches', () => {
  const leftPose = standingPose();
  Object.assign(leftPose[13], { z: -0.05 });
  Object.assign(leftPose[15], { z: -0.22 });
  assert.equal(classifyPose(leftPose).leftPunch, true);
  assert.equal(classifyPose(leftPose).rightPunch, false);

  const rightPose = standingPose();
  Object.assign(rightPose[14], { z: -0.05 });
  Object.assign(rightPose[16], { z: -0.22 });
  assert.equal(classifyPose(rightPose).leftPunch, false);
  assert.equal(classifyPose(rightPose).rightPunch, true);
});

test('accepts a slightly bent, lower-confidence right punch without relaxing left-punch rules', () => {
  const pose = standingPose();
  Object.assign(pose[14], { x: 0.7, y: 0.34, z: -0.07, visibility: 0.45 });
  Object.assign(pose[16], { x: 0.82, y: 0.4, z: -0.18, visibility: 0.45 });
  assert.equal(classifyPose(pose).rightPunch, true);
  assert.equal(classifyPose(pose).leftPunch, false);
});

test('requires forward hand motion, not a static extended hand, for punches', () => {
  const detector = createPunchMotionDetector({ windowMs: 220, minimumAdvance: 0.12 });
  for (let time = 0; time <= 440; time += 55) {
    assert.equal(detector.observe('leftPunch', 0.34, true, time), false);
  }

  detector.reset();
  assert.equal(detector.observe('leftPunch', 0.02, false, 0), false);
  assert.equal(detector.observe('leftPunch', 0.08, false, 80), false);
  assert.equal(detector.observe('leftPunch', 0.19, false, 150), false);
  assert.equal(detector.observe('leftPunch', 0.3, true, 180), true);
});

test('uses a lower motion threshold only for right punches', () => {
  const detector = createPunchMotionDetector({
    windowMs: 220,
    minimumAdvance: 0.12,
    minimumAdvanceByAction: { rightPunch: 0.08 },
  });
  for (const [time, extension] of [[0, 0], [70, 0.02], [140, 0.1]]) {
    const active = time === 140;
    assert.equal(detector.observe('leftPunch', extension, active, time), false);
  }
  detector.reset();
  assert.equal(detector.observe('rightPunch', 0, false, 0), false);
  assert.equal(detector.observe('rightPunch', 0.02, false, 70), false);
  assert.equal(detector.observe('rightPunch', 0.1, true, 140), true);
});

test('distinguishes left and right front kicks', () => {
  const leftPose = standingPose();
  Object.assign(leftPose[25], { y: 0.54 });
  assert.equal(classifyPose(leftPose).leftKick, true);
  assert.equal(classifyPose(leftPose).rightKick, false);

  const rightPose = standingPose();
  Object.assign(rightPose[26], { y: 0.54 });
  assert.equal(classifyPose(rightPose).leftKick, false);
  assert.equal(classifyPose(rightPose).rightKick, true);
});

test('recognizes a knee slightly above the waist without ankle landmarks', () => {
  const pose = standingPose();
  Object.assign(pose[25], { y: 0.559, visibility: 0.4 });
  pose[27].visibility = 0.05;
  assert.equal(classifyPose(pose).leftKick, true);
});

test('does not count a knee level with or below the waist', () => {
  const pose = standingPose();
  pose[25].y = pose[23].y;
  pose[26].y = pose[24].y + 0.02;
  const result = classifyPose(pose);
  assert.equal(result.leftKick, false);
  assert.equal(result.rightKick, false);
});

test('drops all actions when essential landmarks are low confidence', () => {
  const pose = standingPose();
  pose[11].visibility = 0.2;
  assert.deepEqual(classifyPose(pose), {
    tracked: false,
    facingCamera: false,
    leftPunch: false,
    rightPunch: false,
    leftKick: false,
    rightKick: false,
    leftPunchExtension: 0,
    rightPunchExtension: 0,
  });
});

test('requires repeated frames and suppresses a held action', () => {
  const gate = createGestureGate({ confirmationFrames: 4, cooldownMs: 800, releaseFrames: 8 });
  assert.equal(gate.observe('leftPunch', true, 0), false);
  assert.equal(gate.observe('leftPunch', true, 33), false);
  assert.equal(gate.observe('leftPunch', true, 66), false);
  assert.equal(gate.observe('leftPunch', true, 99), true);
  assert.equal(gate.observe('leftPunch', true, 132), false);
});

test('shares cooldown across all four action modes', () => {
  const gate = createGestureGate({ confirmationFrames: 1, cooldownMs: 650 });
  assert.equal(gate.observe('leftPunch', true, 1000), true);
  assert.equal(gate.observe('rightPunch', true, 1100), false);
  assert.equal(gate.observe('leftKick', true, 1200), false);
  assert.equal(gate.observe('rightKick', true, 1700), true);
});

test('ignores brief tracking flicker during a held action', () => {
  const gate = createGestureGate({ confirmationFrames: 4, releaseFrames: 8 });
  assert.equal(gate.observe('leftPunch', true, 0), false);
  assert.equal(gate.observe('leftPunch', true, 33), false);
  assert.equal(gate.observe('leftPunch', true, 66), false);
  assert.equal(gate.observe('leftPunch', true, 99), true);
  gate.observe('leftPunch', false, 132);
  gate.observe('leftPunch', true, 165);
  assert.equal(gate.observe('leftPunch', true, 198), false);
});

test('requires neutral frames after tracking returns', () => {
  const gate = createGestureGate({ confirmationFrames: 4, releaseFrames: 8 });
  gate.resetForTrackingLoss();
  assert.equal(gate.observe('rightKick', true, 1000), false);
  assert.equal(gate.observe('rightKick', true, 1033), false);
  assert.equal(gate.observe('rightKick', true, 1066), false);
  assert.equal(gate.observe('rightKick', true, 1099), false);
  for (let time = 1132; time <= 1363; time += 33) gate.observe('rightKick', false, time);
  assert.equal(gate.observe('rightKick', true, 1396), false);
  assert.equal(gate.observe('rightKick', true, 1429), false);
  assert.equal(gate.observe('rightKick', true, 1462), false);
  assert.equal(gate.observe('rightKick', true, 1495), true);
});