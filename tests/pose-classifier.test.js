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

test('requires a front-facing pose before recognizing attacks', () => {
  const pose = standingPose();
  Object.assign(pose[11], { x: 0.48 });
  Object.assign(pose[12], { x: 0.52 });
  Object.assign(pose[23], { x: 0.49 });
  Object.assign(pose[24], { x: 0.51 });
  Object.assign(pose[13], { z: -0.05 });
  Object.assign(pose[15], { z: -0.22 });
  const result = classifyPose(pose);
  assert.equal(result.facingCamera, false);
  assert.equal(result.punch, false);
  assert.equal(result.kick, false);
});

test('accepts a front-facing pose with a narrow camera crop', () => {
  const pose = standingPose();
  Object.assign(pose[11], { x: 0.455 });
  Object.assign(pose[12], { x: 0.545 });
  Object.assign(pose[23], { x: 0.475 });
  Object.assign(pose[24], { x: 0.525 });
  assert.equal(classifyPose(pose).facingCamera, true);
});

test('recognizes a front-facing fist extended toward the camera', () => {
  const pose = standingPose();
  Object.assign(pose[13], { z: -0.05 });
  Object.assign(pose[15], { z: -0.22 });
  assert.equal(classifyPose(pose).punch, true);
});

test('recognizes a front-facing foot extended toward the camera', () => {
  const pose = standingPose();
  Object.assign(pose[25], { z: -0.03 });
  Object.assign(pose[27], { z: -0.2 });
  assert.equal(classifyPose(pose).kick, true);
});

test('drops control when essential landmarks are low-confidence', () => {
  const pose = standingPose();
  pose[11].visibility = 0.2;
  assert.deepEqual(classifyPose(pose), {
    tracked: false, facingCamera: false, punch: false, kick: false,
  });
});

test('requires repeated frames and suppresses a held gesture', () => {
  const gate = createGestureGate({ confirmationFrames: 3, cooldownMs: 650 });
  assert.equal(gate.observe('punch', true, 0), false);
  assert.equal(gate.observe('punch', true, 33), false);
  assert.equal(gate.observe('punch', true, 66), true);
  assert.equal(gate.observe('punch', true, 99), false);
});

test('does not retrigger when a held gesture flickers inactive briefly', () => {
  const gate = createGestureGate({ confirmationFrames: 3, cooldownMs: 650, releaseFrames: 4 });
  assert.equal(gate.observe('punch', true, 0), false);
  assert.equal(gate.observe('punch', true, 33), false);
  assert.equal(gate.observe('punch', true, 66), true);
  gate.observe('punch', false, 99);
  gate.observe('punch', true, 132);
  assert.equal(gate.observe('punch', true, 165), false);
  gate.observe('punch', false, 198);
  gate.observe('punch', false, 231);
  gate.observe('punch', false, 264);
  gate.observe('punch', false, 297);
  assert.equal(gate.observe('punch', true, 1000), false);
  assert.equal(gate.observe('punch', true, 1033), false);
  assert.equal(gate.observe('punch', true, 1066), true);
});

test('does not replay an extended gesture immediately after tracking returns', () => {
  const gate = createGestureGate({ confirmationFrames: 3, cooldownMs: 650 });
  gate.resetForTrackingLoss();
  assert.equal(gate.observe('kick', true, 1000), false);
  assert.equal(gate.observe('kick', true, 1033), false);
  assert.equal(gate.observe('kick', true, 1066), false);
  gate.observe('kick', false, 1099);
  gate.observe('kick', false, 1100);
  gate.observe('kick', false, 1101);
  gate.observe('kick', false, 1102);
  assert.equal(gate.observe('kick', true, 1132), false);
  assert.equal(gate.observe('kick', true, 1165), false);
  assert.equal(gate.observe('kick', true, 1198), true);
});
