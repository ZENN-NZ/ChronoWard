import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRoundedHours } from '../src/timers.js';

test('calculateRoundedHours rounds up to nearest increment', () => {
  // 1 hour elapsed, 0.5 increment
  assert.equal(calculateRoundedHours(3600 * 1000, 0.5), 1.0);
  
  // 1 hour 15 mins elapsed, 0.5 increment -> 1.5
  assert.equal(calculateRoundedHours((3600 + 15 * 60) * 1000, 0.5), 1.5);

  // 1 hour 30 mins elapsed, 0.5 increment -> 1.5
  assert.equal(calculateRoundedHours((3600 + 30 * 60) * 1000, 0.5), 1.5);

  // 1 hour 31 mins elapsed, 0.5 increment -> 2.0
  assert.equal(calculateRoundedHours((3600 + 31 * 60) * 1000, 0.5), 2.0);

  // Default increment 0.5 fallback
  assert.equal(calculateRoundedHours((3600 + 15 * 60) * 1000, null), 1.5);
  assert.equal(calculateRoundedHours((3600 + 15 * 60) * 1000, 'invalid'), 1.5);
  assert.equal(calculateRoundedHours((3600 + 15 * 60) * 1000, -1), 1.5);
});
