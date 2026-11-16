import { seededRandom } from './solo-model.js';

// Keyboard rhythm from the Windows app: blocks fall in a left (S, D) and a right (K, L) lane
// and must be pressed as they reach the hit line. Runs on a fixed clock so the server can replay a run.
export const tickRate = 120;
export const maxTicks = 30 * 60 * tickRate;
export const keys = ['S', 'D', 'K', 'L'];
export const laneOf = key => key >> 1;
export const judgements = ['PERFECT', 'GREAT', 'GOOD', 'MISS'];
const [PERFECT, GREAT, GOOD, MISS] = judgements.keys();
const windows = [.05, .1, .16];
// A press this early still takes the block, as a MISS, so mashing keys cannot farm GOOD.
const earlyMissWindow = .25;

// Blocks fall 20% faster and come 20% more often than the Windows app.
const pace = 1.2;
const minGap = .12 / pace;
export const noteInterval = seconds => Math.max(.25, .75 / (1 + seconds / 40)) / pace;
// Fall time shrinks steadily: 1.2x speed at the start, 2.4x at 60s, 3.6x at 120s, capped near 3.9x.
export const travelTime = seconds => Math.max(.55, 1.8 / (1 + seconds / 60)) / pace;
export const speedMultiplier = seconds => 1.8 / travelTime(seconds);
// Share of beats that drop one note in each lane at the same moment.
const bothHandsChance = seconds => Math.min(.45, .2 + seconds / 300);

export function makeRhythm(seed) {
  return {
    random: seededRandom(seed), tick: 0, seconds: 0, over: false, nextNoteTime: 2, notes: [],
    score: 0, combo: 0, maxCombo: 0, counts: [0, 0, 0, 0], life: 100,
    lastJudgement: [null, null], lastJudgementTime: [-Infinity, -Infinity], lastPressTime: [-Infinity, -Infinity],
  };
}

export function stepRhythm(state) {
  if (state.over) return;
  state.tick++;
  state.seconds = state.tick / tickRate;
  while (state.nextNoteTime < state.seconds + travelTime(state.seconds)) spawnPattern(state);
  for (let index = state.notes.length - 1; index >= 0 && !state.over; index--) {
    const note = state.notes[index];
    if (state.seconds - note.time <= windows[GOOD]) continue;
    state.notes.splice(index, 1);
    judge(state, MISS, note.lane);
  }
  if (state.tick >= maxTicks) state.over = true;
}

// Judgement for pressing `key` (0-3) now, or null when no block of that key is in reach; a press before the GOOD window is a MISS.
export function hitRhythm(state, key) {
  if (state.over || !Number.isInteger(key) || key < 0 || key >= keys.length) return null;
  state.lastPressTime[laneOf(key)] = state.seconds;
  let note = null;
  for (const item of state.notes) {
    if (item.key === key && item.time - state.seconds <= earlyMissWindow && (!note || item.time < note.time)) note = item;
  }
  if (!note) return null;
  state.notes.splice(state.notes.indexOf(note), 1);
  const delta = Math.abs(note.time - state.seconds);
  const judgement = delta <= windows[PERFECT] ? PERFECT : delta <= windows[GREAT] ? GREAT : delta <= windows[GOOD] ? GOOD : MISS;
  judge(state, judgement, note.lane);
  return judgement;
}

function judge(state, judgement, lane) {
  state.counts[judgement]++;
  // Whole points avoid floating drift: ten misses from full always end the run.
  state.life += [2, 1, 0, -10][judgement];
  if (judgement === MISS) state.combo = 0;
  else {
    state.score += [300, 200, 100][judgement] + Math.min(state.combo, 100) * 2;
    state.combo++;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
  }
  state.life = Math.max(0, Math.min(100, state.life));
  if (state.life <= 0) state.over = true;
  state.lastJudgement[lane] = judgement;
  state.lastJudgementTime[lane] = state.seconds;
}

const randomLane = state => Math.floor(state.random() * 2);

function addNote(state, lane) {
  const key = lane * 2 + Math.floor(state.random() * 2);
  state.notes.push({ lane, key, time: state.nextNoteTime, travel: travelTime(state.seconds) });
}

// Mixes on-beat notes with off-beats, quick doubles and short runs; busier patterns grow more common over time.
function spawnPattern(state) {
  const beat = noteInterval(state.seconds);
  const quick = fraction => Math.max(minGap, beat * fraction);
  const busy = Math.min(1, state.seconds / 90);
  const roll = state.random();
  if (roll < .12 + .1 * busy) {
    // Double tap: two notes in quick succession, then a breather.
    addNote(state, randomLane(state)); state.nextNoteTime += quick(.3);
    addNote(state, randomLane(state)); state.nextNoteTime += beat * 1.25;
  } else if (roll < .2 + .18 * busy) {
    // Run: 3-5 quick notes, sometimes alternating hands.
    const count = 3 + Math.floor(state.random() * 3);
    const alternate = state.random() < .5;
    const lane = randomLane(state);
    for (let index = 0; index < count; index++) {
      addNote(state, alternate ? (lane + index) % 2 : randomLane(state));
      state.nextNoteTime += index < count - 1 ? quick(.4) : beat * 1.5;
    }
  } else if (roll < .38 + .2 * busy) {
    // Off-beat: lands half a beat early or late against the pulse.
    addNote(state, randomLane(state));
    state.nextNoteTime += beat * (state.random() < .5 ? .5 : 1.5);
  } else {
    const bothHands = state.random() < bothHandsChance(state.seconds);
    if (bothHands) { addNote(state, 0); addNote(state, 1); } else addNote(state, randomLane(state));
    // A two-hand beat gets a little more room before the next one.
    state.nextNoteTime += beat * (bothHands ? 1.25 : 1);
  }
}

// Events are [tick, key] for presses that took a block, early MISSes included; presses that hit nothing do not change the score.
// An early MISS can end the run, so the last event may fall on `endTick` itself.
export function replayRhythm(seed, endTick, events) {
  if (!Number.isInteger(endTick) || endTick < 1 || endTick > maxTicks || !Array.isArray(events) || events.length > 50_000) return null;
  const state = makeRhythm(seed);
  let previous = 0;
  for (const event of events) {
    if (!Array.isArray(event) || event.length !== 2) return null;
    const [tick, key] = event;
    if (!Number.isInteger(tick) || tick < previous || tick > endTick || !Number.isInteger(key) || key < 0 || key >= keys.length) return null;
    while (state.tick < tick && !state.over) stepRhythm(state);
    if (state.over || hitRhythm(state, key) === null) return null;
    previous = tick;
  }
  while (state.tick < endTick && !state.over) stepRhythm(state);
  return state.over && state.tick === endTick ? state.score : null;
}
