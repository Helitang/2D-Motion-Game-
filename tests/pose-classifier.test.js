import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPose, createDirectionFilter, createGestureGate } from '../src/pose-classifier.js';

function standingPose() {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
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

test('maps mirrored camera body shifts to intuitive game directions', () => {
  const leftShift = standingPose().map((point) => ({ ...point, x: point.x + 0.16 }));
  const rightShift = standingPose().map((point) => ({ ...point, x: point.x - 0.16 }));
  assert.equal(classifyPose(leftShift, 0.5).direction, -1);
  assert.equal(classifyPose(rightShift, 0.5).direction, 1);
});

test('recognizes a straight arm extension as a punch', () => {
  const pose = standingPose();
  Object.assign(pose[13], { x: 0.28, y: 0.31 });
  Object.assign(pose[15], { x: 0.15, y: 0.31 });
  assert.equal(classifyPose(pose, 0.5).punch, true);
});

test('recognizes an extended lateral leg as a kick', () => {
  const pose = standingPose();
  Object.assign(pose[25], { x: 0.6, y: 0.6 });
  Object.assign(pose[27], { x: 0.77, y: 0.64 });
  assert.equal(classifyPose(pose, 0.5).kick, true);
});

test('drops control when essential landmarks are low-confidence', () => {
  const pose = standingPose();
  pose[11].visibility = 0.2;
  assert.deepEqual(classifyPose(pose, 0.5), {
    tracked: false, direction: 0, punch: false, kick: false, centerX: null,
  });
});

test('requires repeated frames and suppresses a held gesture', () => {
  const gate = createGestureGate({ confirmationFrames: 3, cooldownMs: 650 });
  assert.equal(gate.observe('punch', true, 0), false);
  assert.equal(gate.observe('punch', true, 33), false);
  assert.equal(gate.observe('punch', true, 66), true);
  assert.equal(gate.observe('punch', true, 99), false);
});

test('does not replay an extended gesture immediately after tracking returns', () => {
  const gate = createGestureGate({ confirmationFrames: 3, cooldownMs: 650 });
  gate.resetForTrackingLoss();
  assert.equal(gate.observe('kick', true, 1000), false);
  assert.equal(gate.observe('kick', true, 1033), false);
  assert.equal(gate.observe('kick', true, 1066), false);
  gate.observe('kick', false, 1099);
  assert.equal(gate.observe('kick', true, 1132), false);
  assert.equal(gate.observe('kick', true, 1165), false);
  assert.equal(gate.observe('kick', true, 1198), true);
});

test('smooths transient movement noise and releases after three neutral frames', () => {
  const filter = createDirectionFilter({ confirmationFrames: 3 });
  assert.equal(filter.observe(1), 0);
  assert.equal(filter.observe(0), 0);
  assert.equal(filter.observe(1), 0);
  assert.equal(filter.observe(1), 0);
  assert.equal(filter.observe(1), 1);
  assert.equal(filter.observe(0), 1);
  assert.equal(filter.observe(0), 1);
  assert.equal(filter.observe(0), 0);
});