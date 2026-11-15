import * as THREE from 'three';
import { fbm3, clamp01, mixRGB, makeCraters, craterDelta } from './noise';

// =========================================================================
// 2. PROCEDURAL PLANET TEXTURE FACTORY
// =========================================================================
export function generatePlanetTextures(type, w = 512, h = 256) {
  const colCanvas = document.createElement('canvas');
  colCanvas.width = w; colCanvas.height = h;
  const colCtx = colCanvas.getContext('2d');
  const colImg = colCtx.createImageData(w, h);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = w; bumpCanvas.height = h;
  const bumpCtx = bumpCanvas.getContext('2d');
  const bumpImg = bumpCtx.createImageData(w, h);

  let specImg = null, specCanvas = null, specCtx = null;
  if (type === 'earth') {
    specCanvas = document.createElement('canvas');
    specCanvas.width = w; specCanvas.height = h;
    specCtx = specCanvas.getContext('2d');
    specImg = specCtx.createImageData(w, h);
  }

  const craters = type === 'mercury'
    ? makeCraters(85, 0.04, 0.16, 1337)
    : (type === 'mars' ? makeCraters(45, 0.03, 0.12, 7711)
    : (type === 'moon' ? makeCraters(95, 0.04, 0.18, 9912) : null));

  for (let py = 0; py < h; py++) {
    const v = (py + 0.5) / h;
    const phi = v * Math.PI;
    const sinPhi = Math.sin(phi);
    const ny = Math.cos(phi);

    for (let px = 0; px < w; px++) {
      const u = (px + 0.5) / w;
      const theta = u * Math.PI * 2;
      const nx = sinPhi * Math.cos(theta);
      const nz = sinPhi * Math.sin(theta);

      const idx = (py * w + px) * 4;
      let rgb = [128, 128, 128];
      let bump = 0.5;
      let spec = 0.05;

      if (type === 'mercury' || type === 'moon') {
        const base = fbm3(nx * 3.2 + 2, ny * 3.2, nz * 3.2, 5);
        const detail = fbm3(nx * 14, ny * 14 + 5, nz * 14, 3);
        const crat = craterDelta(nx, ny, nz, craters);
        const val = clamp01(base * 0.65 + detail * 0.25 + crat + 0.1);
        bump = val;
        if (type === 'mercury') {
          rgb = mixRGB([92, 82, 75], [225, 206, 184], val);
          if (crat > 0.05) rgb = mixRGB(rgb, [245, 232, 215], 0.45);
        } else {
          rgb = mixRGB([80, 84, 92], [228, 232, 238], val);
        }
      }
      else if (type === 'venus') {
        const warp = fbm3(nx * 2.2, ny * 2.2, nz * 2.2, 4) * 1.4;
        const swirl = fbm3(nx * 3.0 + warp, ny * 6.5, nz * 3.0 - warp, 5);
        const band = Math.sin(ny * 10 + swirl * 5.0) * 0.5 + 0.5;
        const vMix = clamp01(swirl * 0.7 + band * 0.3);
        rgb = mixRGB([168, 88, 32], [255, 224, 155], vMix);
        rgb = mixRGB(rgb, [255, 165, 85], fbm3(nx * 7, ny * 7, nz * 7, 3) * 0.4);
        bump = vMix * 0.6;
      }
      else if (type === 'earth') {
        const cont = fbm3(nx * 2.1 + 4.3, ny * 2.1 + 1.2, nz * 2.1 + 3.1, 6);
        const moisture = fbm3(nx * 4.5 + 10, ny * 4.5, nz * 4.5 + 8, 4);
        const detail = fbm3(nx * 14, ny * 14, nz * 14, 3);
        const polar = Math.abs(ny) + (cont - 0.5) * 0.18;

        if (polar > 0.87) {
          rgb = [242, 250, 255]; bump = 0.72; spec = 0.35;
        } else if (cont < 0.49) {
          const depth = clamp01(cont / 0.49);
          rgb = mixRGB([8, 42, 130], [22, 145, 235], Math.pow(depth, 1.8));
          if (depth > 0.85) rgb = mixRGB(rgb, [56, 225, 230], (depth - 0.85) / 0.15);
          bump = 0.15; spec = 0.85;
        } else {
          const elev = clamp01((cont - 0.49) / 0.45);
          const lush = mixRGB([34, 155, 68], [218, 185, 92], clamp01(moisture * 1.4 - 0.25));
          rgb = mixRGB(lush, [138, 102, 72], clamp01((elev - 0.42) * 2.2));
          if (elev > 0.72) rgb = mixRGB(rgb, [245, 248, 252], clamp01((elev - 0.72) * 4.0));
          rgb = mixRGB(rgb, [rgb[0] * 1.15, rgb[1] * 1.15, rgb[2] * 1.15], detail * 0.25);
          bump = 0.35 + elev * 0.65; spec = 0.08;
        }
      }
      else if (type === 'mars') {
        const terrain = fbm3(nx * 2.8 + 1.5, ny * 2.8, nz * 2.8 + 7.2, 5);
        const crat = craterDelta(nx, ny, nz, craters);
        const detail = fbm3(nx * 11, ny * 11, nz * 11, 3);
        const elev = clamp01(terrain * 0.7 + detail * 0.25 + crat);
        const polar = Math.abs(ny) + (terrain - 0.5) * 0.15;
        if (polar > 0.91) {
          rgb = [252, 244, 240]; bump = 0.75;
        } else {
          rgb = mixRGB([115, 36, 18], [242, 118, 56], elev);
          rgb = mixRGB(rgb, [255, 168, 92], clamp01((elev - 0.58) * 2.0));
          bump = elev;
        }
      }
      else if (type === 'jupiter') {
        const turb = fbm3(nx * 4.0, ny * 4.0, nz * 4.0, 5);
        const fine = fbm3(nx * 10 + turb * 1.5, ny * 18, nz * 10 - turb * 1.5, 4);
        const lat = ny + (turb - 0.5) * 0.16 + (fine - 0.5) * 0.05;
        const bands = Math.sin(lat * 26.0) * 0.5 + 0.5;
        const bands2 = Math.cos(lat * 13.0 + 1.2) * 0.5 + 0.5;

        rgb = mixRGB([248, 232, 208], [212, 118, 62], bands);
        rgb = mixRGB(rgb, [146, 82, 54], bands2 * 0.55);
        if (Math.abs(ny) > 0.65) {
          rgb = mixRGB(rgb, [118, 128, 156], clamp01((Math.abs(ny) - 0.65) * 2.2));
        }
        const spotDx = (u - 0.35), spotDy = (ny + 0.33);
        const spotDist = Math.sqrt((spotDx * 4.8) ** 2 + (spotDy * 8.5) ** 2);
        if (spotDist < 1.0) {
          const swirlSpot = Math.sin(spotDist * 9.0 + Math.atan2(spotDy, spotDx) * 2.0) * 0.15;
          const spotMask = clamp01(1.0 - spotDist * spotDist);
          rgb = mixRGB(rgb, [238, 72, 42], spotMask * (0.85 + swirlSpot));
        }
        bump = 0.4 + bands * 0.25;
      }
      else if (type === 'saturn') {
        const turb = fbm3(nx * 3.0, ny * 6.0, nz * 3.0, 4);
        const lat = ny + (turb - 0.5) * 0.06;
        const b1 = Math.sin(lat * 32.0) * 0.5 + 0.5;
        const b2 = Math.cos(lat * 16.0) * 0.5 + 0.5;
        rgb = mixRGB([250, 236, 188], [212, 168, 98], b1);
        rgb = mixRGB(rgb, [196, 146, 98], b2 * 0.38);
        if (Math.abs(ny) > 0.72) {
          rgb = mixRGB(rgb, [135, 168, 178], clamp01((Math.abs(ny) - 0.72) * 2.5));
        }
        bump = 0.45 + b1 * 0.15;
      }
      else if (type === 'uranus') {
        const turb = fbm3(nx * 2.5, ny * 5.0, nz * 2.5, 4);
        const band = Math.sin((ny + turb * 0.05) * 18.0) * 0.5 + 0.5;
        rgb = mixRGB([86, 224, 235], [182, 252, 255], band * 0.7 + turb * 0.3);
        bump = 0.5;
      }
      else if (type === 'neptune') {
        const turb = fbm3(nx * 3.5, ny * 6.0, nz * 3.5, 5);
        const streak = fbm3(nx * 2.2 + turb, ny * 18.0, nz * 2.2, 4);
        const band = Math.sin((ny + turb * 0.08) * 16.0) * 0.5 + 0.5;
        rgb = mixRGB([18, 56, 185], [58, 138, 255], band * 0.65 + turb * 0.35);
        if (streak > 0.66) rgb = mixRGB(rgb, [195, 240, 255], (streak - 0.66) * 2.6);
        const dx = (u - 0.55) * 5.5, dy = (ny + 0.25) * 8.0;
        const sd = Math.sqrt(dx * dx + dy * dy);
        if (sd < 1.0) rgb = mixRGB(rgb, [12, 28, 118], (1 - sd * sd) * 0.75);
        bump = 0.45 + streak * 0.25;
      }

      colImg.data[idx] = clamp01(rgb[0] / 255) * 255;
      colImg.data[idx + 1] = clamp01(rgb[1] / 255) * 255;
      colImg.data[idx + 2] = clamp01(rgb[2] / 255) * 255;
      colImg.data[idx + 3] = 255;

      const bVal = clamp01(bump) * 255;
      bumpImg.data[idx] = bVal;
      bumpImg.data[idx + 1] = bVal;
      bumpImg.data[idx + 2] = bVal;
      bumpImg.data[idx + 3] = 255;

      if (specImg) {
        const sVal = clamp01(spec) * 255;
        specImg.data[idx] = sVal;
        specImg.data[idx + 1] = sVal;
        specImg.data[idx + 2] = sVal;
        specImg.data[idx + 3] = 255;
      }
    }
  }

  colCtx.putImageData(colImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);

  const map = new THREE.CanvasTexture(colCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;

  let roughnessMap = null;
  if (specCtx && specImg) {
    specCtx.putImageData(specImg, 0, 0);
    const rCanvas = document.createElement('canvas');
    rCanvas.width = w; rCanvas.height = h;
    const rCtx = rCanvas.getContext('2d');
    const rImg = rCtx.createImageData(w, h);
    for (let i = 0; i < specImg.data.length; i += 4) {
      const rVal = 255 - specImg.data[i] * 0.78;
      rImg.data[i] = rVal; rImg.data[i+1] = rVal; rImg.data[i+2] = rVal; rImg.data[i+3] = 255;
    }
    rCtx.putImageData(rImg, 0, 0);
    roughnessMap = new THREE.CanvasTexture(rCanvas);
    roughnessMap.wrapS = THREE.RepeatWrapping;
  }

  return { map, bumpMap, roughnessMap };
}

export function generateEarthClouds(w = 512, h = 256) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let py = 0; py < h; py++) {
    const phi = ((py + 0.5) / h) * Math.PI;
    const sinPhi = Math.sin(phi), ny = Math.cos(phi);
    for (let px = 0; px < w; px++) {
      const theta = ((px + 0.5) / w) * Math.PI * 2;
      const nx = sinPhi * Math.cos(theta), nz = sinPhi * Math.sin(theta);
      const n = fbm3(nx * 3.8 + 12, ny * 4.5 + 3, nz * 3.8 + 5, 5);
      const alpha = clamp01((n - 0.47) * 3.4);
      const idx = (py * w + px) * 4;
      img.data[idx] = 255; img.data[idx + 1] = 255; img.data[idx + 2] = 255;
      img.data[idx + 3] = alpha * 235;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

export function generateRingTexture(type = 'saturn') {
  const w = 512, h = 16;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);

  for (let x = 0; x < w; x++) {
    const t = x / (w - 1);
    let r = 240, g = 215, b = 170, a = 0;

    if (type === 'saturn') {
      const fine = Math.sin(t * 210) * 0.25 + Math.sin(t * 85) * 0.35 + Math.cos(t * 42) * 0.4;
      const fadeIn = clamp01(t / 0.12);
      const fadeOut = clamp01((1.0 - t) / 0.14);
      const cassini = (t > 0.61 && t < 0.67) ? 0.08 : 1.0;
      const encke = (t > 0.87 && t < 0.888) ? 0.15 : 1.0;

      a = clamp01((0.55 + fine * 0.35) * fadeIn * fadeOut * cassini * encke);
      const hueShift = Math.sin(t * 26) * 0.5 + 0.5;
      const col = mixRGB([250, 224, 172], [188, 212, 232], hueShift * 0.38);
      r = col[0]; g = col[1]; b = col[2];
    } else {
      const ring1 = Math.exp(-Math.pow((t - 0.35) / 0.04, 2));
      const ring2 = Math.exp(-Math.pow((t - 0.65) / 0.06, 2));
      const ring3 = Math.exp(-Math.pow((t - 0.88) / 0.03, 2));
      a = clamp01((ring1 * 0.45 + ring2 * 0.55 + ring3 * 0.7) * 0.75);
      r = 165; g = 240; b = 255;
    }

    for (let y = 0; y < h; y++) {
      const idx = (y * w + x) * 4;
      img.data[idx] = r; img.data[idx + 1] = g; img.data[idx + 2] = b; img.data[idx + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

