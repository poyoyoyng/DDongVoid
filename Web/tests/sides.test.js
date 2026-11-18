import assert from 'node:assert/strict';
import test from 'node:test';
import {
  drainRate, lifeGain, makeSides, missPenalty, mixTicks, pressSides, replaySides, shuffleEvery, shuffleTicks,
  sideOf, sortPoints, startTicks, stepSides, tickRate,
} from '../public/sides-model.js';

const leftTeam = slots => slots.slice(0, 3).sort().join();

// Sends the front character the right way every `every` ticks until `until` seconds of play, then waits for the end.
function play(seed, { until = Infinity, every = 12 } = {}) {
  const state = makeSides(seed);
  const events = [];
  while (!state.over) {
    stepSides(state);
    if (state.over || state.pause || state.seconds > until || state.tick % every) continue;
    const side = sideOf(state, state.queue[0]);
    if (pressSides(state, side) !== null) events.push([state.tick, side]);
  }
  return { state, events };
}

test('six characters stand three on each side and the line is eight long', () => {
  const state = makeSides(7);
  assert.deepEqual([...state.slots].sort(), [0, 1, 2, 3, 4, 5]);
  assert.equal(state.queue.length, 8);
  assert.ok(state.queue.every(kind => kind >= 0 && kind < 6));
  assert.equal(state.pause.kind, 'start');
});

test('presses wait for the start and life drains faster over time', () => {
  const state = makeSides(7);
  assert.equal(pressSides(state, 0), null);
  for (let tick = 0; tick < startTicks; tick++) stepSides(state);
  assert.equal(state.pause, null);
  assert.equal(state.life, 100);
  assert.ok(drainRate(60) > drainRate(0));
  assert.equal(drainRate(0), 6);
  assert.equal(drainRate(10_000), 36);
});

test('a right press scores with combo and refills life, a wrong one keeps the character and costs life', () => {
  const state = makeSides(11);
  while (state.pause) stepSides(state);
  for (let tick = 0; tick < 2 * tickRate; tick++) stepSides(state);
  const life = state.life;
  const front = state.queue[0];
  const side = sideOf(state, front);
  const second = state.queue[1];
  assert.equal(pressSides(state, side), true);
  assert.equal(state.score, sortPoints(0));
  assert.equal(state.combo, 1);
  assert.ok(Math.abs(state.life - Math.min(100, life + lifeGain)) < 1e-9);
  assert.equal(state.queue[0], second);
  assert.equal(state.queue.length, 8);
  assert.equal(pressSides(state, sideOf(state, state.queue[0])), true);
  assert.equal(state.score, sortPoints(0) + sortPoints(1));
  const before = state.life;
  const kept = state.queue[0];
  assert.equal(pressSides(state, 1 - sideOf(state, kept)), false);
  assert.equal(state.queue[0], kept);
  assert.equal(state.combo, 0);
  assert.ok(Math.abs(state.life - (before - missPenalty)) < 1e-9);
  assert.equal(pressSides(state, 2), null);
});

test('every 30 seconds of play the clock stops and someone changes sides', () => {
  const state = makeSides(5);
  while (state.pause) stepSides(state);
  state.life = Infinity;
  const before = leftTeam(state.slots);
  while (state.playTicks < shuffleEvery) stepSides(state);
  assert.equal(state.pause.kind, 'shuffle');
  assert.notEqual(leftTeam(state.slots), before);
  assert.equal(pressSides(state, 0), null);
  const life = state.life;
  const tick = state.tick;
  for (let index = 0; index < mixTicks; index++) stepSides(state);
  assert.equal(state.pause.kind, 'shuffle');
  while (state.pause) stepSides(state);
  assert.equal(state.tick - tick, shuffleTicks);
  assert.equal(state.playTicks, shuffleEvery);
  assert.equal(state.life, life);
});

test('doing nothing ends the run, and fast sorting outlasts several shuffles', () => {
  const idle = play(3, { until: -1 });
  assert.equal(idle.events.length, 0);
  assert.equal(idle.state.score, 0);
  assert.ok(idle.state.seconds < 20);
  const busy = play(3, { every: 12 });
  assert.ok(busy.state.shuffles >= 3, 'shuffles ' + busy.state.shuffles);
  assert.equal(busy.state.misses, 0);
  assert.equal(busy.state.maxCombo, busy.events.length);
});

test('mashing both ways loses life faster than sorting', () => {
  const state = makeSides(9);
  const events = [];
  let side = 0;
  while (!state.over) {
    stepSides(state);
    if (state.over || state.pause || state.tick % 6) continue;
    side ^= 1;
    if (pressSides(state, side) !== null) events.push([state.tick, side]);
  }
  assert.ok(state.misses > 0);
  assert.ok(state.seconds < 30);
  assert.equal(replaySides(9, state.tick, events), state.score);
});

test('the server replay matches the browser run', () => {
  const { state, events } = play(1234, { until: 50 });
  assert.equal(replaySides(1234, state.tick, events), state.score);
  assert.equal(replaySides(1234, state.tick + 1, events), null);
  assert.equal(replaySides(4321, state.tick, events), null);
  assert.equal(replaySides(1234, state.tick, [[0, 1]]), null);
  assert.equal(replaySides(1234, state.tick, [[events[0][0], 2]]), null);
  assert.equal(replaySides(1234, state.tick, [[events[1][0], 0], [events[0][0], 0]]), null);
});

test('character art is valid standalone SVG for the canvas', async () => {
  const { critterSvg, critters } = await import('../public/sides-art.js');
  assert.equal(critters.length, 6);
  for (const kind of critters.keys()) {
    // An image only loads strict XML, where a repeated attribute breaks the whole picture.
    for (const tag of critterSvg(kind).match(/<[^/!][^>]*>/g)) {
      const names = [...tag.matchAll(/\s([\w-]+)=/g)].map(match => match[1]);
      assert.equal(new Set(names).size, names.length, critters[kind].name + ': ' + tag);
    }
  }
});
