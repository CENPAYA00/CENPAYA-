import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVideoRating } from '../.test-build/video.js';
test('video ratings accept only integer stars from one through five', () => {
  for (const value of [1,2,3,4,5]) assert.equal(normalizeVideoRating(value),value);
  for (const value of [0,6,-1,1.5,'3',null,undefined,'bad']) assert.equal(normalizeVideoRating(value),null);
});
