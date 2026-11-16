export const tickRate = 60;
export const maxTicks = 30 * 60 * tickRate;
export const width = 900;
export const height = 450;
const step = 1 / tickRate;
const difficulty = 1.15;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function makeSolo(seed) {
  return { random: seededRandom(seed), tick: 0, score: 0, over: false, direction: 0, x: width / 2, hazards: [], spawnIn: .55, dodged: 0 };
}

export function applySoloInput(state, key) {
  if (state.over || state.direction === key) return false;
  state.direction = key;
  return true;
}

export function stepSolo(state) {
  if (state.over) return;
  state.tick++;
  updateDodge(state, (state.tick - .5) * step);
  if (!state.over) updateDodge(state, state.tick * step);
  if (state.tick >= maxTicks) state.over = true;
}

function updateDodge(state, seconds) {
  const delta = step / 2;
  state.x = clamp(state.x + state.direction * 390 * delta, 22, width - 22);
  state.spawnIn -= delta;
  if (state.spawnIn <= 0) {
    const radius = 13 + Math.floor(state.random() * 9);
    state.hazards.push({
      x: radius + state.random() * (width - 2 * radius), y: -30, radius,
      speed: (160 + state.random() * 60) * difficulty,
    });
    state.spawnIn += Math.max(.12, .7 / (1 + seconds / 30)) / difficulty * (.8 + state.random() * .4);
  }
  const multiplier = 1 + Math.min(seconds / 60, 3);
  for (let index = state.hazards.length - 1; index >= 0; index--) {
    const hazard = state.hazards[index];
    hazard.y += hazard.speed * multiplier * delta;
    const x = hazard.x - state.x;
    const y = hazard.y - (height - 39);
    if (x * x + y * y < (hazard.radius * .8 + 15) ** 2) {
      state.over = true;
      break;
    }
    if (hazard.y - hazard.radius > height) {
      state.hazards.splice(index, 1);
      state.dodged++;
    }
  }
  state.score = Math.floor(seconds * 10) + state.dodged * 25;
}

export function replayScore(seed, endTick, events) {
  if (!Number.isInteger(endTick) || endTick < 1 || endTick > maxTicks || !Array.isArray(events) || events.length > 50_000) return null;
  const state = makeSolo(seed);
  let previous = -1;
  for (const event of events) {
    if (!Array.isArray(event) || event.length !== 2) return null;
    const [tick, key] = event;
    if (!Number.isInteger(tick) || tick < 0 || tick < previous || tick >= endTick ||
        !Number.isInteger(key) || key < -1 || key > 1) return null;
    while (state.tick < tick && !state.over) stepSolo(state);
    if (state.over) return null;
    applySoloInput(state, key);
    previous = tick;
  }
  while (state.tick < endTick && !state.over) stepSolo(state);
  return state.over && state.tick === endTick ? state.score : null;
}
