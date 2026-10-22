import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPose, createGestureGate } from '../src/pose-classifier.js';

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

test('distinguishes left and right front kicks', () => {
  const leftPose = standingPose();
  Object.assign(leftPose[25], { z: -0.03 });
  Object.assign(leftPose[27], { z: -0.2 });
  assert.equal(classifyPose(leftPose).leftKick, true);
  assert.equal(classifyPose(leftPose).rightKick, false);

  const rightPose = standingPose();
  Object.assign(rightPose[26], { z: -0.03 });
  Object.assign(rightPose[28], { z: -0.2 });
  assert.equal(classifyPose(rightPose).leftKick, false);
  assert.equal(classifyPose(rightPose).rightKick, true);
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
  });
});

test('requires repeated frames and suppresses a held action', () => {
  const gate = createGestureGate({ confirmationFrames: 3, cooldownMs: 650 });
  assert.equal(gate.observe('leftPunch', true, 0), false);
  assert.equal(gate.observe('leftPunch', true, 33), false);
  assert.equal(gate.observe('leftPunch', true, 66), true);
  assert.equal(gate.observe('leftPunch', true, 99), false);
});

test('ignores brief tracking flicker during a held action', () => {
  const gate = createGestureGate({ confirmationFrames: 3, releaseFrames: 4 });
  assert.equal(gate.observe('leftPunch', true, 0), false);
  assert.equal(gate.observe('leftPunch', true, 33), false);
  assert.equal(gate.observe('leftPunch', true, 66), true);
  gate.observe('leftPunch', false, 99);
  gate.observe('leftPunch', true, 132);
  assert.equal(gate.observe('leftPunch', true, 165), false);
});

test('requires neutral frames after tracking returns', () => {
  const gate = createGestureGate({ confirmationFrames: 3 });
  gate.resetForTrackingLoss();
  assert.equal(gate.observe('rightKick', true, 1000), false);
  assert.equal(gate.observe('rightKick', true, 1033), false);
  assert.equal(gate.observe('rightKick', true, 1066), false);
  for (let time = 1099; time < 1231; time += 33) gate.observe('rightKick', false, time);
  assert.equal(gate.observe('rightKick', true, 1232), false);
  assert.equal(gate.observe('rightKick', true, 1265), false);
  assert.equal(gate.observe('rightKick', true, 1298), true);
});