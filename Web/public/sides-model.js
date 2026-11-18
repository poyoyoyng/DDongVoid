import { seededRandom } from './solo-model.js';

// 니편내편: six characters stand three on each side, and the one at the front of the line is sent
// to its side with ← or →. Runs on a fixed clock so the server can replay a run.
export const tickRate = 60;
export const maxTicks = 30 * 60 * tickRate;
export const kinds = 6;
export const queueLength = 8;
// Every 30 seconds of play the clock stops, the six swap places and play resumes.
export const shuffleEvery = 30 * tickRate;
export const startTicks = tickRate;
export const shuffleTicks = Math.round(2.6 * tickRate);
// The first part of a shuffle shows "섞어!!" while they move, the rest "다시 시작!".
export const mixTicks = Math.round(1.6 * tickRate);
export const lifeGain = 4;
export const missPenalty = 12;
// Life drains 6 per second at the start and 6 more every minute of play, capped at 36 after five minutes.
export const drainRate = seconds => Math.min(36, 6 * (1 + seconds / 60));
export const sortPoints = combo => 100 + Math.min(combo, 100) * 10;

// Slots 0-2 are the left column top to bottom, 3-5 the right one.
export const sideOfSlot = slot => slot < 3 ? 0 : 1;
export const sideOf = (state, kind) => sideOfSlot(state.slots.indexOf(kind));

function shuffle(random, items) {
  for (let index = items.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
}

const leftTeam = slots => slots.slice(0, 3).sort().join();

export function makeSides(seed) {
  const state = {
    random: seededRandom(seed), tick: 0, playTicks: 0, seconds: 0, over: false,
    life: 100, score: 0, combo: 0, maxCombo: 0, sorted: 0, misses: 0, shuffles: 0,
    slots: [0, 1, 2, 3, 4, 5], previousSlots: null, queue: [],
    pause: { kind: 'start', left: startTicks, total: startTicks },
    lastSort: null, lastMiss: null,
  };
  shuffle(state.random, state.slots);
  while (state.queue.length < queueLength) state.queue.push(Math.floor(state.random() * kinds));
  return state;
}

// A shuffle always moves at least one character to the other side, so the old answers stop working.
function startShuffle(state) {
  state.previousSlots = state.slots.slice();
  const before = leftTeam(state.slots);
  do shuffle(state.random, state.slots); while (leftTeam(state.slots) === before);
  state.shuffles++;
  state.pause = { kind: 'shuffle', left: shuffleTicks, total: shuffleTicks };
}

export function stepSides(state) {
  if (state.over) return;
  state.tick++;
  if (state.pause) {
    if (--state.pause.left <= 0) state.pause = null;
  } else {
    state.playTicks++;
    state.seconds = state.playTicks / tickRate;
    state.life = Math.max(0, state.life - drainRate(state.seconds) / tickRate);
    if (state.life <= 0) state.over = true;
    else if (state.playTicks % shuffleEvery === 0) startShuffle(state);
  }
  if (state.tick >= maxTicks) state.over = true;
}

// Sends the front character left (0) or right (1). Returns whether it was its side,
// or null when presses are ignored (paused, shuffling or over).
export function pressSides(state, side) {
  if (state.over || state.pause || (side !== 0 && side !== 1)) return null;
  const kind = state.queue[0];
  if (sideOf(state, kind) !== side) {
    // A wrong press keeps the character at the front.
    state.misses++;
    state.combo = 0;
    state.life = Math.max(0, state.life - missPenalty);
    state.lastMiss = { side, tick: state.tick };
    if (state.life <= 0) state.over = true;
    return false;
  }
  state.score += sortPoints(state.combo);
  state.combo++;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  state.sorted++;
  state.life = Math.min(100, state.life + lifeGain);
  state.queue.shift();
  state.queue.push(Math.floor(state.random() * kinds));
  state.lastSort = { kind, side, tick: state.tick };
  return true;
}

// Seconds of play left before the next shuffle.
export const nextShuffleIn = state => Math.ceil((shuffleEvery - state.playTicks % shuffleEvery) / tickRate);

// Events are [tick, side] for every press that was judged; a wrong press can end the run, so the last
// event may fall on `endTick` itself.
export function replaySides(seed, endTick, events) {
  if (!Number.isInteger(endTick) || endTick < 1 || endTick > maxTicks || !Array.isArray(events) || events.length > 50_000) return null;
  const state = makeSides(seed);
  let previous = 0;
  for (const event of events) {
    if (!Array.isArray(event) || event.length !== 2) return null;
    const [tick, side] = event;
    if (!Number.isInteger(tick) || tick < previous || tick > endTick) return null;
    while (state.tick < tick && !state.over) stepSides(state);
    if (state.over || pressSides(state, side) === null) return null;
    previous = tick;
  }
  while (state.tick < endTick && !state.over) stepSides(state);
  return state.over && state.tick === endTick ? state.score : null;
}
