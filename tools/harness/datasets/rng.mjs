export function createRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randBetween(rng, min, max) {
  return min + (max - min) * rng();
}

export function randInt(rng, min, maxInclusive) {
  return Math.floor(randBetween(rng, min, maxInclusive + 1));
}
