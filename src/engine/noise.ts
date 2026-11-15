// =========================================================================
// 1. DETERMINISTIC 3D SIMPLEX-STYLE NOISE FOR SEAMLESS PLANETARY TEXTURES
// =========================================================================
const PERM = new Uint8Array(512);
{
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let seed = 42197;
  for (let i = 255; i > 0; i--) {
    seed = (seed * 16807) % 2147483647;
    const j = seed % (i + 1);
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}

export function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
export function lerp(a, b, t) { return a + t * (b - a); }
export function grad(hash, x, y, z) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

export function noise3(x, y, z) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z;
  const B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
  return lerp(
    lerp(lerp(grad(PERM[AA], x, y, z), grad(PERM[BA], x - 1, y, z), u),
         lerp(grad(PERM[AB], x, y - 1, z), grad(PERM[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad(PERM[AA + 1], x, y, z - 1), grad(PERM[BA + 1], x - 1, y, z - 1), u),
         lerp(grad(PERM[AB + 1], x, y - 1, z - 1), grad(PERM[BB + 1], x - 1, y - 1, z - 1), u), v),
    w
  ) * 0.5 + 0.5;
}

export function fbm3(x, y, z, octaves = 5, lacunarity = 2.05, gain = 0.5) {
  let sum = 0, amp = 0.5, freq = 1.0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
export function mixRGB(c1, c2, t) {
  t = clamp01(t);
  return [
    c1[0] + (c2[0] - c1[0]) * t,
    c1[1] + (c2[1] - c1[1]) * t,
    c1[2] + (c2[2] - c1[2]) * t
  ];
}

export function easeOutBack(x) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export function makeCraters(count, minR, maxR, seedVal) {
  const craters = [];
  let s = seedVal;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < count; i++) {
    const theta = rnd() * Math.PI * 2;
    const cosPhi = rnd() * 2 - 1;
    const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
    craters.push({
      x: sinPhi * Math.cos(theta),
      y: cosPhi,
      z: sinPhi * Math.sin(theta),
      r: minR + rnd() * (maxR - minR),
      depth: 0.4 + rnd() * 0.6
    });
  }
  return craters;
}

export function craterDelta(nx, ny, nz, craters) {
  let h = 0;
  for (let i = 0; i < craters.length; i++) {
    const c = craters[i];
    const dx = nx - c.x, dy = ny - c.y, dz = nz - c.z;
    const dSq = dx * dx + dy * dy + dz * dz;
    const rSq = c.r * c.r * 2.2;
    if (dSq < rSq) {
      const d = Math.sqrt(dSq) / c.r;
      if (d < 1.0) h -= (1.0 - d * d) * 0.38 * c.depth;
      if (d > 0.72 && d < 1.38) {
        const rim = 1.0 - Math.abs(d - 1.02) / 0.34;
        if (rim > 0) h += rim * rim * 0.24 * c.depth;
      }
    }
  }
  return h;
}

