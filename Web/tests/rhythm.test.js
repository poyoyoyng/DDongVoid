import assert from 'node:assert/strict';
import test from 'node:test';
import { hitRhythm, makeRhythm, replayRhythm, stepRhythm, tickRate } from '../public/rhythm-model.js';

// Presses every block as it reaches the hit line until `until` seconds, then lets the rest fall.
function play(seed, until) {
  const state = makeRhythm(seed);
  const events = [];
  while (!state.over) {
    stepRhythm(state);
    if (state.seconds > until) continue;
    for (const note of state.notes.filter(item => item.time <= state.seconds)) {
      if (hitRhythm(state, note.key) !== null) events.push([state.tick, note.key]);
    }
  }
  return { state, events };
}

test('blocks start two seconds in and four misses end the run', () => {
  const { state, events } = play(7, -1);
  assert.equal(events.length, 0);
  assert.equal(state.counts[3], 4);
  assert.equal(state.life, 0);
  assert.equal(state.score, 0);
  assert.ok(state.tick > 2 * tickRate);
});

test('on-time presses score perfect with combo bonus and keep life full', () => {
  const { state, events } = play(7, 30);
  assert.ok(events.length > 30);
  assert.equal(state.counts[0], events.length);
  assert.equal(state.maxCombo, events.length);
  const combo = Math.min(events.length, 101);
  assert.equal(state.score, events.length * 300 + combo * (combo - 1) + Math.max(0, events.length - 101) * 200);
});

test('the server replay matches the browser run', () => {
  const { state, events } = play(1234, 45);
  assert.equal(replayRhythm(1234, state.tick, events), state.score);
  assert.equal(replayRhythm(1234, state.tick + 1, events), null);
  assert.equal(replayRhythm(4321, state.tick, events), null);
  assert.equal(replayRhythm(1234, state.tick, [[0, 1]]), null);
  assert.equal(replayRhythm(1234, state.tick, [[events[0][0], 4]]), null);
});

test('a press just before the GOOD window takes the block as a MISS', () => {
  const state = makeRhythm(99);
  while (!state.notes.some(note => note.time - state.seconds <= .2)) stepRhythm(state);
  const note = state.notes.find(item => item.time - state.seconds <= .2);
  assert.equal(hitRhythm(state, note.key), 3);
  assert.ok(!state.notes.includes(note));
  assert.equal(state.life, 75);
  assert.equal(state.score, 0);
});

test('mashing every key misses most blocks and ends the run', () => {
  const state = makeRhythm(7);
  const events = [];
  while (!state.over) {
    stepRhythm(state);
    if (state.tick % 10) continue;
    for (let key = 0; key < 4; key++) if (hitRhythm(state, key) !== null) events.push([state.tick, key]);
  }
  assert.ok(state.counts[3] > state.counts[0] + state.counts[1] + state.counts[2]);
  assert.ok(state.seconds < 30);
  assert.equal(replayRhythm(7, state.tick, events), state.score);
});

test('a key only hits blocks of the same letter', () => {
  const state = makeRhythm(99);
  while (!state.notes.some(note => note.time <= state.seconds)) stepRhythm(state);
  const note = state.notes.find(item => item.time <= state.seconds);
  const other = note.key ^ 1;
  if (!state.notes.some(item => item.key === other && item.time - state.seconds <= .25)) {
    assert.equal(hitRhythm(state, other), null);
  }
  assert.equal(hitRhythm(state, note.key), 0);
  assert.equal(state.combo, 1);
});
