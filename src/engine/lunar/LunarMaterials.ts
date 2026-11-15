import * as THREE from 'three';
import { fbm3, clamp01 } from '../noise';

class LunarMaterialLibrary {
  private initialized = false;
  textures: Record<string, THREE.CanvasTexture> = {};
  materials: Record<string, THREE.Material> = {};

  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.textures.hull = this.createHullTexture();
    this.textures.hullBump = this.createHullBumpTexture();
    this.textures.solar = this.createSolarTexture();
    this.textures.hazard = this.createHazardTexture();
    this.textures.mliBump = this.createMliBumpTexture();
    this.textures.regolith = this.createRegolithTexture();
    // Textures intérieures : panneaux composites, joints, rivets, sol technique.
    // Générées une seule fois puis partagées par tous les modules (perf).
    this.textures.interiorWall = this.createInteriorWallTexture();
    this.textures.interiorFloor = this.createInteriorFloorTexture();
    this.textures.interiorCeiling = this.createInteriorCeilingTexture();

    this.materials.hullWhite = new THREE.MeshStandardMaterial({
      map: this.textures.hull,
      bumpMap: this.textures.hullBump,
      bumpScale: 0.018,
      color: 0xe2e6ec,
      roughness: 0.46,
      metalness: 0.22,
    });

    this.materials.frameDark = new THREE.MeshStandardMaterial({
      color: 0x4a5260,
      roughness: 0.5,
      metalness: 0.42,
    });

    this.materials.titanium = new THREE.MeshStandardMaterial({
      color: 0x949ea9,
      roughness: 0.36,
      metalness: 0.82,
    });

    this.materials.mliGold = new THREE.MeshStandardMaterial({
      color: 0xc8922b,
      bumpMap: this.textures.mliBump,
      bumpScale: 0.03,
      roughness: 0.32,
      metalness: 0.9,
    });

    this.materials.solarCell = new THREE.MeshStandardMaterial({
      map: this.textures.solar,
      color: 0xffffff,
      roughness: 0.22,
      metalness: 0.58,
    });

    this.materials.bellows = new THREE.MeshStandardMaterial({
      color: 0x454b54,
      roughness: 0.82,
      metalness: 0.14,
    });

    this.materials.hazard = new THREE.MeshStandardMaterial({
      map: this.textures.hazard,
      roughness: 0.55,
      metalness: 0.18,
    });

    this.materials.viewportGlow = new THREE.MeshStandardMaterial({
      color: 0xbcd4e6,
      emissive: 0xffcf8c,
      emissiveIntensity: 0.65,
      roughness: 0.15,
      metalness: 0.2,
    });

    this.materials.greenhouseGlass = new THREE.MeshPhysicalMaterial({
      color: 0xd9eef8,
      transparent: true,
      opacity: 0.32,
      roughness: 0.1,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });

    this.materials.growLight = new THREE.MeshStandardMaterial({
      color: 0xf4c8e8,
      emissive: 0xe06cb8,
      emissiveIntensity: 1.15,
      roughness: 0.25,
    });

    this.materials.foliage = new THREE.MeshStandardMaterial({
      color: 0x3b7d45,
      roughness: 0.78,
      metalness: 0.02,
    });

    this.materials.waterPipe = new THREE.MeshStandardMaterial({
      color: 0x3b79a8,
      roughness: 0.38,
      metalness: 0.45,
    });

    this.materials.oxygenPipe = new THREE.MeshStandardMaterial({
      color: 0x488f64,
      roughness: 0.4,
      metalness: 0.42,
    });

    this.materials.beaconActive = new THREE.MeshStandardMaterial({
      color: 0x5ae6ff,
      emissive: 0x22c8ee,
      emissiveIntensity: 1.1,
    });

    this.materials.beaconBuilding = new THREE.MeshStandardMaterial({
      color: 0xffaa33,
      emissive: 0xe07b00,
      emissiveIntensity: 1.0,
    });

    this.materials.regolith = new THREE.MeshStandardMaterial({
      map: this.textures.regolith,
      bumpMap: this.textures.regolith,
      bumpScale: 0.22,
      color: 0x9aa0a8,
      roughness: 0.96,
      metalness: 0.04,
    });

    this.materials.rock = new THREE.MeshStandardMaterial({
      color: 0x61656c,
      roughness: 0.92,
      metalness: 0.06,
    });

    // ---------------------- Intérieur pressurisé ----------------------
    // Surfaces composites : panneaux clairs, joints sombres, légère rugosité.
    this.materials.interiorWall = new THREE.MeshStandardMaterial({
      map: this.textures.interiorWall,
      bumpMap: this.textures.interiorWall,
      bumpScale: 0.012,
      color: 0xf4f7fb,
      roughness: 0.58,
      metalness: 0.18,
    });

    this.materials.interiorWallTrim = new THREE.MeshStandardMaterial({
      color: 0x8c96a6,
      roughness: 0.42,
      metalness: 0.55,
    });

    this.materials.interiorPanel = new THREE.MeshStandardMaterial({
      color: 0x39434f,
      roughness: 0.35,
      metalness: 0.62,
    });

    this.materials.interiorFloor = new THREE.MeshStandardMaterial({
      map: this.textures.interiorFloor,
      bumpMap: this.textures.interiorFloor,
      bumpScale: 0.01,
      color: 0xb9c2cc,
      roughness: 0.72,
      metalness: 0.35,
    });

    this.materials.interiorCeiling = new THREE.MeshStandardMaterial({
      map: this.textures.interiorCeiling,
      bumpMap: this.textures.interiorCeiling,
      bumpScale: 0.008,
      color: 0xc2cad4,
      roughness: 0.82,
      metalness: 0.22,
    });
  }

  /** Blindage des modules : panneaux, joints, rivets, traces d'usage. */
  private createHullTexture() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;

    const base = ctx.createLinearGradient(0, 0, 0, size);
    base.addColorStop(0, '#eef2f7');
    base.addColorStop(0.6, '#dfe5ec');
    base.addColorStop(1, '#c9d1da');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    // Micro-rayures.
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.strokeStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.04})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 4 + Math.random() * 26, y + (Math.random() - 0.5) * 1.5);
      ctx.stroke();
    }

    // Panneaux 4 × 4 avec joints sombres et lèvre claire.
    const cells = 4;
    const cw = size / cells;
    for (let i = 0; i <= cells; i++) {
      const x = i * cw;
      ctx.fillStyle = 'rgba(140,152,168,0.5)';
      ctx.fillRect(x - 1.5, 0, 3, size);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(x + 1.5, 0, 1, size);
      const y = i * cw;
      ctx.fillStyle = 'rgba(140,152,168,0.42)';
      ctx.fillRect(0, y - 1.5, size, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(0, y + 1.5, size, 1);
    }

    // Rivets aux intersections.
    for (let i = 0; i <= cells; i++) {
      for (let j = 0; j <= cells; j++) {
        const x = i * cw;
        const y = j * cw;
        for (const [ox, oy] of [[-7, -7], [7, -7], [-7, 7], [7, 7]] as const) {
          const g = ctx.createRadialGradient(x + ox - 1, y + oy - 1, 0.4, x + ox, y + oy, 3);
          g.addColorStop(0, 'rgba(255,255,255,0.9)');
          g.addColorStop(0.6, 'rgba(150,160,174,0.8)');
          g.addColorStop(1, 'rgba(80,90,104,0.1)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x + ox, y + oy, 2.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Plaques techniques et petits marquages.
    ctx.fillStyle = 'rgba(70,80,94,0.55)';
    ctx.fillRect(cw * 0.35, cw * 1.35, cw * 0.5, cw * 0.12);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(cw * 1.55, cw * 2.2, cw * 0.34, cw * 0.05);
    ctx.strokeStyle = 'rgba(90,102,118,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cw * 2.15, cw * 0.2, cw * 0.6, cw * 0.45);

    // Légère poussière de régolithe en bas.
    const dust = ctx.createLinearGradient(0, size * 0.8, 0, size);
    dust.addColorStop(0, 'rgba(90,92,98,0)');
    dust.addColorStop(1, 'rgba(85,88,95,0.2)');
    ctx.fillStyle = dust;
    ctx.fillRect(0, size * 0.8, size, size * 0.2);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  /** Relief des joints et rivets pour le blindage. */
  private createHullBumpTexture() {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    const cells = 4;
    const cw = size / cells;
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 3;
    for (let i = 0; i <= cells; i++) {
      ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cw); ctx.lineTo(size, i * cw); ctx.stroke();
    }
    ctx.fillStyle = '#d0d0d0';
    for (let i = 0; i <= cells; i++) {
      for (let j = 0; j <= cells; j++) {
        for (const [ox, oy] of [[-4, -4], [4, -4], [-4, 4], [4, 4]] as const) {
          ctx.beginPath();
          ctx.arc(i * cw + ox, j * cw + oy, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  private createSolarTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#0c1d40';
    ctx.fillRect(0, 0, 256, 256);

    const cols = 6, rows = 12;
    const w = 256 / cols, h = 256 / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        ctx.fillStyle = (i + j) % 2 === 0 ? '#112854' : '#142f63';
        ctx.fillRect(i * w + 2, j * h + 2, w - 4, h - 4);
      }
    }
    ctx.strokeStyle = 'rgba(180,210,245,0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < cols; i++) {
      ctx.beginPath(); ctx.moveTo(i * w + w * 0.5, 0); ctx.lineTo(i * w + w * 0.5, 256); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private createHazardTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 32;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#d49b24';
    ctx.fillRect(0, 0, 128, 32);
    ctx.fillStyle = '#202226';
    for (let x = -32; x < 160; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 32); ctx.lineTo(x + 12, 32);
      ctx.lineTo(x + 28, 0); ctx.lineTo(x + 16, 0);
      ctx.closePath();
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(3, 1);
    return tex;
  }

  private createMliBumpTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * 128, y = Math.random() * 128;
      const v = Math.floor(85 + Math.random() * 90);
      ctx.strokeStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 18, y + (Math.random() - 0.5) * 18);
      ctx.stroke();
    }
    return new THREE.CanvasTexture(c);
  }

  /** Panneaux muraux intérieurs : joints, rivets, inserts techniques, traces. */
  private createInteriorWallTexture() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;

    // Base composite légèrement dégradée (haut plus clair, bas plus sombre).
    const base = ctx.createLinearGradient(0, 0, 0, size);
    base.addColorStop(0, '#e4e9f0');
    base.addColorStop(0.55, '#d6dce4');
    base.addColorStop(1, '#c3cad4');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    // Micro-texture brossée (fines stries horizontales irrégulières).
    for (let i = 0; i < 1400; i++) {
      const y = Math.random() * size;
      const x = Math.random() * size;
      const w = 12 + Math.random() * 70;
      const v = Math.random() < 0.5 ? 255 : 150;
      ctx.strokeStyle = `rgba(${v},${v},${v},0.045)`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + (Math.random() - 0.5) * 0.8);
      ctx.stroke();
    }

    // Trame de panneaux : 4 colonnes × 3 rangées.
    const cols = 4;
    const rows = 3;
    const cw = size / cols;
    const ch = size / rows;

    // Variation subtile de teinte par panneau (matériaux légèrement différents).
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const tint = ((i * 7 + j * 11) % 5) - 2; // -2..2
        ctx.fillStyle = tint === 0
          ? 'rgba(255,255,255,0)'
          : tint > 0
            ? `rgba(255,255,255,${0.012 * tint})`
            : `rgba(60,74,92,${0.01 * -tint})`;
        ctx.fillRect(i * cw + 2, j * ch + 2, cw - 4, ch - 4);
      }
    }

    // Joints verticaux et horizontaux (creux sombre + lèvre claire).
    for (let i = 0; i <= cols; i++) {
      const x = i * cw;
      ctx.fillStyle = 'rgba(92,104,122,0.55)';
      ctx.fillRect(x - 2, 0, 4, size);
      ctx.fillStyle = 'rgba(255,255,255,0.38)';
      ctx.fillRect(x + 2, 0, 1.5, size);
    }
    for (let j = 0; j <= rows; j++) {
      const y = j * ch;
      ctx.fillStyle = 'rgba(96,108,126,0.45)';
      ctx.fillRect(0, y - 1.5, size, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(0, y + 1.5, size, 1);
    }

    // Rivets aux intersections (petits disques métalliques).
    for (let i = 0; i <= cols; i++) {
      for (let j = 0; j <= rows; j++) {
        const x = i * cw;
        const y = j * ch;
        for (const [ox, oy] of [[-9, -9], [9, -9], [-9, 9], [9, 9]] as const) {
          const g = ctx.createRadialGradient(x + ox - 1, y + oy - 1, 0.5, x + ox, y + oy, 3.4);
          g.addColorStop(0, 'rgba(250,252,255,0.85)');
          g.addColorStop(0.55, 'rgba(140,150,164,0.75)');
          g.addColorStop(1, 'rgba(70,80,94,0.15)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x + ox, y + oy, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Inserts techniques discrets : grille de ventilation et plaque gravée.
    ctx.fillStyle = 'rgba(58,68,80,0.85)';
    ctx.fillRect(cw * 0.55, ch * 1.55, cw * 0.28, ch * 0.3);
    ctx.strokeStyle = 'rgba(180,195,212,0.5)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 7; k++) {
      const y = ch * 1.57 + (k * ch * 0.28) / 7;
      ctx.beginPath();
      ctx.moveTo(cw * 0.57, y);
      ctx.lineTo(cw * 0.81, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(120,132,148,0.5)';
    ctx.fillRect(cw * 2.2, ch * 0.18, cw * 0.5, ch * 0.07);

    // Traces d'usure très légères près du sol.
    const dust = ctx.createLinearGradient(0, size * 0.78, 0, size);
    dust.addColorStop(0, 'rgba(80,88,100,0)');
    dust.addColorStop(1, 'rgba(70,78,90,0.16)');
    ctx.fillStyle = dust;
    ctx.fillRect(0, size * 0.78, size, size * 0.22);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  /** Sol technique : tôles métalliques, bords chanfreinés, trame antidérapante. */
  private createInteriorFloorTexture() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#59626f';
    ctx.fillRect(0, 0, size, size);

    const cell = size / 4;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const x = i * cell;
        const y = j * cell;
        const v = ((i * 5 + j * 3) % 4) * 4;
        ctx.fillStyle = `rgb(${84 + v},${92 + v},${104 + v})`;
        ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
        ctx.strokeStyle = 'rgba(30,36,44,0.75)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
        // Trame antidérapante en losange.
        ctx.strokeStyle = 'rgba(200,212,226,0.07)';
        ctx.lineWidth = 1;
        for (let k = -cell; k < cell; k += 7) {
          ctx.beginPath();
          ctx.moveTo(x + k, y);
          ctx.lineTo(x + k + cell, y + cell);
          ctx.stroke();
        }
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  /** Plafond : caissons sombres + rainures pour les bandeaux lumineux. */
  private createInteriorCeilingTexture() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#7e8794';
    ctx.fillRect(0, 0, size, size);

    const cell = size / 4;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const x = i * cell;
        const y = j * cell;
        ctx.fillStyle = (i + j) % 2 === 0 ? '#909aa7' : '#858f9c';
        ctx.fillRect(x + 3, y + 3, cell - 6, cell - 6);
        ctx.strokeStyle = 'rgba(44,52,62,0.8)';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 3, y + 3, cell - 6, cell - 6);
        ctx.fillStyle = 'rgba(40,47,56,0.55)';
        ctx.fillRect(x + cell * 0.5 - 4, y + 6, 8, cell * 0.18);
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  private createRegolithTexture() {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = (x / size) * 8;
        const ny = (y / size) * 8;
        const v = clamp01(fbm3(nx, ny, 2.3, 3) * 0.7 + ((Math.sin(x * 12.9 + y * 78.2) * 43758.5) % 1) * 0.14 + 0.12);
        const shade = Math.floor(68 + v * 95);
        const idx = (y * size + x) * 4;
        img.data[idx] = shade;
        img.data[idx + 1] = shade + 1;
        img.data[idx + 2] = shade + 3;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    return tex;
  }

  dispose() {
    Object.values(this.textures).forEach((t) => t.dispose());
    Object.values(this.materials).forEach((m) => m.dispose());
    this.textures = {};
    this.materials = {};
    this.initialized = false;
  }
}

export const LunarMaterials = new LunarMaterialLibrary();