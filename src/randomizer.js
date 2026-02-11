// ═══ Fair Randomizer ═══
// Seeded Fisher-Yates shuffle — same filters + session = same order

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSeed(filters, searchQuery, sessionId) {
  const str = JSON.stringify({ ...filters, q: searchQuery, sid: sessionId });
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function fairShuffle(shoes, filters = {}, searchQuery = "", sessionId = "") {
  const seed = generateSeed(filters, searchQuery, sessionId);
  const rng = mulberry32(seed);
  const arr = [...shoes];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
