import * as THREE from 'three';
import { ControlSettings, DEFAULT_CONTROLS } from './controls';
import { LunarMaterials } from './lunar/LunarMaterials';

// =========================================================================
// MODE ASTRONAUTE — caméra 3ᵉ personne « épaule » (type Granny / Scary Teacher)
// · Extérieur : sol lunaire de la scène existante (1 unité = 1 m).
// · Intérieur : niveau connecté (hub, couloirs, pépinière, purificateur,
//   contrôle solaire) construit très en dessous du terrain (y = -300).
// · Interactions de proximité : le moteur désigne la plus proche, React
//   applique les effets de jeu (faim, soif, sommeil, QCM…).
// =========================================================================

export type ViewMode = 'build' | 'exterior' | 'interior';
export type RoomId = 'exterior' | 'hub' | 'nursery' | 'purifier' | 'solar';

export interface InteractionInfo {
  id: string;
  label: string;
  hint: string;
}

export interface AstronautSnapshot {
  mode: ViewMode;
  room: RoomId;
  interaction: InteractionInfo | null;
}

export interface ObstacleRect {
  x: number;
  z: number;
  w: number;
  d: number;
}

interface AstronautCallbacks {
  /** Une interaction est déclenchée (id) ; `cooldown` = secondes restantes si indisponible. */
  onInteract: (id: string, info?: { cooldown?: number }) => void;
}

interface Interactable {
  id: string;
  room: RoomId;
  x: number;
  z: number;
  radius: number;
  label: string;
  hint: string;
  ring: THREE.Mesh;
  sprite: THREE.Sprite;
}

interface Rect2 {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Porte automatique : ouverte à l'approche, fermée sinon (bloque le passage). */
interface SlidingDoor {
  id: string;
  /** Centre de l'ouverture. */
  x: number;
  z: number;
  /** Axe normal au plan de la porte : 'x' = porte dans un mur x = const. */
  axis: 'x' | 'z';
  /** Largeur de l'ouverture (m). */
  width: number;
  /** 0 = fermée, 1 = ouverte. */
  open: number;
  panels: THREE.Mesh[];
  lamp: THREE.MeshStandardMaterial;
}

const INTERIOR_Y = -300;
const WALL_H = 3.2;
const EXTERIOR_RADIUS = 26;
const COOLDOWNS: Record<string, number> = {
  harvest_0: 45,
  harvest_1: 45,
  harvest_2: 45,
  purify: 25,
  solar_check: 30,
};

/** Zones praticables de l'intérieur (hub, couloirs, modules). */
const ROOMS: Record<string, Rect2> = {
  hub: { x0: -6, x1: 6, z0: -4, z1: 4 },
  corE: { x0: 6, x1: 10, z0: -1.5, z1: 1.5 },
  solar: { x0: 10, x1: 16, z0: -3, z1: 3 },
  corW: { x0: -10, x1: -6, z0: -1.5, z1: 1.5 },
  purifier: { x0: -16, x1: -10, z0: -3, z1: 3 },
  corN: { x0: -1.5, x1: 1.5, z0: -8, z1: -4 },
  nursery: { x0: -4, x1: 4, z0: -14, z1: -8 },
};

function roomAt(x: number, z: number): RoomId {
  const inside = (r: Rect2) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  if (inside(ROOMS.solar)) return 'solar';
  if (inside(ROOMS.purifier)) return 'purifier';
  if (inside(ROOMS.nursery)) return 'nursery';
  return 'hub';
}

function makeLabel(text: string, depthTest: boolean): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const r = 26;
  const w = 508;
  const h = 124;
  ctx.fillStyle = 'rgba(5, 14, 30, 0.88)';
  ctx.strokeStyle = 'rgba(93, 255, 158, 0.9)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(2 + r, 2);
  ctx.arcTo(2 + w, 2, 2 + w, 2 + h, r);
  ctx.arcTo(2 + w, 2 + h, 2, 2 + h, r);
  ctx.arcTo(2, 2 + h, 2, 2, r);
  ctx.arcTo(2, 2, 2 + w, 2, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e8fff2';
  ctx.font = 'bold 50px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66, 480);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest, fog: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.3, 0.325, 1);
  sprite.renderOrder = 20;
  return sprite;
}

export class AstronautController {
  private scene: THREE.Scene;
  private callbacks: AstronautCallbacks;
  readonly camera: THREE.PerspectiveCamera;

  private mode: ViewMode = 'build';
  private room: RoomId = 'exterior';
  private yaw = 0;
  private pitch = 0.28;
  private facing = 0;
  private height = 0;
  private vy = 0;
  private time = 0;
  private walkPhase = 0;
  private snapCamera = true;

  private readonly pos = new THREE.Vector3();
  private readonly character = new THREE.Group();
  private legL!: THREE.Group;
  private legR!: THREE.Group;
  private armL!: THREE.Group;
  private armR!: THREE.Group;

  private interior = new THREE.Group();
  private exteriorMarkers = new THREE.Group();
  private wallMeshes: THREE.Mesh[] = [];
  private wallMatCache = new Map<string, THREE.MeshStandardMaterial>();
  private doors: SlidingDoor[] = [];
  private pulses: Array<{ mat: THREE.MeshStandardMaterial; base: number; speed: number; phase: number }> = [];
  private interactables: Interactable[] = [];
  private cooldownUntil = new Map<string, number>();
  private nearest: Interactable | null = null;
  private obstacles: ObstacleRect[] = [];

  private keys = new Set<string>();
  private stickMove = { x: 0, y: 0 };
  private stickLook = { x: 0, y: 0 };
  private inputEnabled = true;
  private settings: ControlSettings = { ...DEFAULT_CONTROLS };
  private speedFactor = 1;
  private sprintHeld = false;
  private canvas: HTMLElement | null = null;
  private cleanup: Array<() => void> = [];
  private raycaster = new THREE.Raycaster();

  constructor(scene: THREE.Scene, aspect: number, callbacks: AstronautCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.05, 700);
    this.buildCharacter();
    this.character.visible = false;
    scene.add(this.character);

    this.interior.position.y = INTERIOR_Y;
    this.interior.visible = false;
    scene.add(this.interior);
    LunarMaterials.init();
    this.buildInterior();

    this.exteriorMarkers.visible = false;
    scene.add(this.exteriorMarkers);
    this.buildExteriorMarkers();
  }

  // ----------------------------- Personnage -----------------------------

  private buildCharacter() {
    const white = new THREE.MeshStandardMaterial({ color: 0xf1f4f8, roughness: 0.55, metalness: 0.1 });
    const grey = new THREE.MeshStandardMaterial({ color: 0xb9c2cf, roughness: 0.6, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.5, metalness: 0.3 });
    const visor = new THREE.MeshStandardMaterial({
      color: 0x08131f,
      emissive: 0x1d637a,
      emissiveIntensity: 0.4,
      roughness: 0.08,
      metalness: 0.9,
    });
    const orange = new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.5 });
    const g = this.character;

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.3), white);
    torso.position.y = 1.15;
    g.add(torso);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.08, 0.32), orange);
    belt.position.y = 0.88;
    g.add(belt);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.2), grey);
    pack.position.set(0, 1.18, 0.25);
    g.add(pack);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.25, 20, 16), white);
    helmet.position.y = 1.67;
    g.add(helmet);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.17, 0.08), visor);
    glass.position.set(0, 1.66, -0.2);
    g.add(glass);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.02), dark);
    chest.position.set(0, 1.22, -0.16);
    g.add(chest);

    const makeLimb = (x: number, y: number, len: number, rad: number, mat: THREE.Material, boot: boolean) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const limb = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 0.9, len, 10), mat);
      limb.position.y = -len / 2;
      pivot.add(limb);
      if (boot) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(rad * 2.2, 0.1, rad * 3), dark);
        b.position.set(0, -len, -rad * 0.4);
        pivot.add(b);
      }
      g.add(pivot);
      return pivot;
    };
    this.legL = makeLimb(-0.13, 0.86, 0.86, 0.095, white, true);
    this.legR = makeLimb(0.13, 0.86, 0.86, 0.095, white, true);
    this.armL = makeLimb(-0.33, 1.4, 0.55, 0.07, white, false);
    this.armR = makeLimb(0.33, 1.4, 0.55, 0.07, white, false);
  }

  // ------------------------------- Intérieur -------------------------------

  private box(
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    color: number,
    x: number,
    y: number,
    z: number,
    emissive = 0
  ): THREE.Mesh {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.2 });
    if (emissive) {
      mat.emissive = new THREE.Color(emissive);
      mat.emissiveIntensity = 0.9;
    }
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  private wall(x1: number, z1: number, x2: number, z2: number) {
    const horizontal = Math.abs(z2 - z1) < 1e-6;
    const len = horizontal ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
    if (len < 0.01) return;
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(horizontal ? len : 0.2, WALL_H, horizontal ? 0.2 : len),
      this.wallMaterial(len, horizontal)
    );
    mesh.position.set(cx, WALL_H / 2, cz);
    this.interior.add(mesh);
    this.wallMeshes.push(mesh);

    // Structure apparente : montants verticaux tous les ~2,2 m + goulotte technique.
    const ribs = Math.max(1, Math.round(len / 2.2));
    for (let i = 1; i < ribs; i++) {
      const t = i / ribs;
      const px = horizontal ? x1 + (x2 - x1) * t : cx;
      const pz = horizontal ? cz : z1 + (z2 - z1) * t;
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(horizontal ? 0.07 : 0.26, WALL_H - 0.16, horizontal ? 0.26 : 0.07),
        LunarMaterials.materials.interiorWallTrim
      );
      rib.position.set(px, (WALL_H - 0.16) / 2, pz);
      this.interior.add(rib);
    }
    const conduit = new THREE.Mesh(
      new THREE.BoxGeometry(horizontal ? len : 0.3, 0.07, horizontal ? 0.3 : len),
      LunarMaterials.materials.interiorPanel
    );
    conduit.position.set(cx, 2.46, cz);
    this.interior.add(conduit);

    // Plinthe lumineuse (deux bandeaux : sol et mi-hauteur).
    this.box(
      this.interior,
      horizontal ? len : 0.24,
      0.08,
      horizontal ? 0.24 : len,
      0x2a8fb0,
      cx,
      0.06,
      cz,
      0x1aa6d0
    );
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(horizontal ? len : 0.04, 0.05, horizontal ? 0.04 : len),
      new THREE.MeshStandardMaterial({
        color: 0x9fe8ff,
        emissive: 0x4fc8ff,
        emissiveIntensity: 1.4,
        roughness: 0.3,
      })
    );
    strip.position.set(horizontal ? cx : cx + 0.105, 1.02, horizontal ? cz - 0.105 : cz);
    this.interior.add(strip);
  }

  /**
   * Matériau mural texturé, partagé par longueur pour que les panneaux gardent
   * une échelle constante et que les textures soient réutilisées entre modules.
   */
  private wallMaterial(len: number, horizontal: boolean): THREE.MeshStandardMaterial {
    const key = `${horizontal ? 'h' : 'v'}-${len.toFixed(1)}`;
    const cached = this.wallMatCache.get(key);
    if (cached) return cached;
    const base = LunarMaterials.materials.interiorWall as THREE.MeshStandardMaterial;
    const m = base.clone();
    m.side = THREE.DoubleSide;
    if (base.map) {
      const map = base.map.clone();
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(Math.max(1, len / 2.4), Math.max(1, WALL_H / 2.4));
      map.needsUpdate = true;
      m.map = map;
    }
    if (base.bumpMap) {
      const bump = base.bumpMap.clone();
      bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
      bump.repeat.set(Math.max(1, len / 2.4), Math.max(1, WALL_H / 2.4));
      bump.needsUpdate = true;
      m.bumpMap = bump;
    }
    this.wallMatCache.set(key, m);
    return m;
  }

  private buildInterior() {
    const baseFloor = LunarMaterials.materials.interiorFloor as THREE.MeshStandardMaterial;
    const baseCeil = LunarMaterials.materials.interiorCeiling as THREE.MeshStandardMaterial;
    Object.values(ROOMS).forEach((r) => {
      const w = r.x1 - r.x0;
      const d = r.z1 - r.z0;
      const cx = (r.x0 + r.x1) / 2;
      const cz = (r.z0 + r.z1) / 2;
      const floorMat = baseFloor.clone();
      if (floorMat.map) {
        floorMat.map = floorMat.map.clone();
        floorMat.map.wrapS = floorMat.map.wrapT = THREE.RepeatWrapping;
        floorMat.map.repeat.set(Math.max(1, w / 2), Math.max(1, d / 2));
        floorMat.map.needsUpdate = true;
      }
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(cx, 0.01, cz);
      this.interior.add(floor);
      const ceilMat = baseCeil.clone();
      if (ceilMat.map) {
        ceilMat.map = ceilMat.map.clone();
        ceilMat.map.wrapS = ceilMat.map.wrapT = THREE.RepeatWrapping;
        ceilMat.map.repeat.set(Math.max(1, w / 2), Math.max(1, d / 2));
        ceilMat.map.needsUpdate = true;
      }
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilMat);
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set(cx, WALL_H, cz);
      this.interior.add(ceil);
      // Rail lumineux central du plafond.
      this.box(this.interior, Math.min(w - 0.8, 4), 0.05, 0.25, 0xffffff, cx, WALL_H - 0.04, cz, 0xcfefff);
      const light = new THREE.PointLight(0xdff2ff, 22, 15, 2);
      light.position.set(cx, WALL_H - 0.5, cz);
      this.interior.add(light);
    });

    // Murs (avec ouvertures vers les couloirs)
    const W = (a: number, b: number, c: number, d: number) => this.wall(a, b, c, d);
    // Hub
    W(-6, 4, 6, 4);
    W(-6, -4, -1.5, -4);
    W(1.5, -4, 6, -4);
    W(6, -4, 6, -1.5);
    W(6, 1.5, 6, 4);
    W(-6, -4, -6, -1.5);
    W(-6, 1.5, -6, 4);
    // Couloirs est / ouest
    W(6, -1.5, 10, -1.5);
    W(6, 1.5, 10, 1.5);
    W(-10, -1.5, -6, -1.5);
    W(-10, 1.5, -6, 1.5);
    // Contrôle solaire
    W(10, -3, 16, -3);
    W(10, 3, 16, 3);
    W(16, -3, 16, 3);
    W(10, -3, 10, -1.5);
    W(10, 1.5, 10, 3);
    // Purificateur
    W(-16, -3, -10, -3);
    W(-16, 3, -10, 3);
    W(-16, -3, -16, 3);
    W(-10, -3, -10, -1.5);
    W(-10, 1.5, -10, 3);
    // Couloir nord + pépinière
    W(-1.5, -8, -1.5, -4);
    W(1.5, -8, 1.5, -4);
    W(-4, -8, -1.5, -8);
    W(1.5, -8, 4, -8);
    W(-4, -14, 4, -14);
    W(-4, -14, -4, -8);
    W(4, -14, 4, -8);

    this.buildHubProps();
    this.buildNurseryProps();
    this.buildPurifierProps();
    this.buildSolarProps();
    this.buildDoors();
    this.buildRoomDetails();
  }

  /**
   * Détails architecturaux propres à chaque module : bandeaux d'accent,
   * grilles de ventilation, conduits et équipements. Matériaux partagés,
   * géométries simples (coût de rendu négligeable).
   */
  private buildRoomDetails() {
    const accents: Record<RoomId, number> = {
      exterior: 0x5fe6ff,
      hub: 0x5fe6ff,
      nursery: 0x7dde7d,
      purifier: 0x3ea0ff,
      solar: 0xffd166,
    };
    const accentMats = new Map<number, THREE.MeshStandardMaterial>();
    const accentMat = (color: number) => {
      let m = accentMats.get(color);
      if (!m) {
        m = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 1.3,
          roughness: 0.3,
          metalness: 0.2,
        });
        accentMats.set(color, m);
        this.pulses.push({
          mat: m,
          base: m.emissiveIntensity,
          speed: 0.6 + (this.pulses.length % 3) * 0.18,
          phase: this.pulses.length * 1.7,
        });
      }
      return m;
    };
    const grilleMat = new THREE.MeshStandardMaterial({ color: 0x4a5566, roughness: 0.55, metalness: 0.5 });
    const ventMat = new THREE.MeshStandardMaterial({ color: 0x202a36, roughness: 0.7, metalness: 0.4 });

    (Object.keys(ROOMS) as RoomId[]).forEach((room) => {
      if (room === 'exterior') return;
      const r = ROOMS[room];
      const w = r.x1 - r.x0;
      const d = r.z1 - r.z0;
      const cx = (r.x0 + r.x1) / 2;
      const cz = (r.z0 + r.z1) / 2;
      const color = accents[room] ?? 0x5fe6ff;

      // Bandeau lumineux d'accent au ras du plafond, sur deux murs.
      const bandZ = new THREE.Mesh(new THREE.BoxGeometry(w - 0.6, 0.035, 0.035), accentMat(color));
      bandZ.position.set(cx, WALL_H - 0.22, cz - d / 2 + 0.16);
      this.interior.add(bandZ);
      const bandX = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, d - 0.6), accentMat(color));
      bandX.position.set(cx - w / 2 + 0.16, WALL_H - 0.22, cz);
      this.interior.add(bandX);

      // Grilles de ventilation et conduits verticaux.
      [-1, 1].forEach((side) => {
        const vent = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.04), ventMat);
        vent.position.set(cx + side * (w / 2 - 1.1), WALL_H - 0.62, cz + d / 2 - 0.11);
        this.interior.add(vent);
        for (let i = 0; i < 4; i++) {
          const slot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.012, 0.05), grilleMat);
          slot.position.set(cx + side * (w / 2 - 1.1), WALL_H - 0.7 + i * 0.05, cz + d / 2 - 0.1);
          this.interior.add(slot);
        }
      });

      const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, WALL_H - 0.4, 8), grilleMat);
      conduit.position.set(cx + w / 2 - 0.24, (WALL_H - 0.4) / 2, cz + d / 2 - 0.24);
      this.interior.add(conduit);
    });

    // Équipements spécifiques au hub : table centrale, casiers, écrans muraux.
    const hub = this.interior;
    this.box(hub, 2.0, 0.08, 0.9, 0x39434f, 0.6, 0.78, 0.4);
    this.box(hub, 0.12, 0.75, 0.12, 0x2b3445, -0.3, 0.38, 0.4);
    this.box(hub, 0.12, 0.75, 0.12, 0x2b3445, 1.5, 0.38, 0.4);
    for (let i = 0; i < 3; i++) {
      this.box(hub, 0.9, 0.45, 0.5, 0x3a4452, -5.2, 0.25 + i * 0.5, -1.2);
    }
    this.box(hub, 2.4, 0.9, 0.06, 0x0b2a3a, 0, 1.9, -3.86, 0x2a9ccc);

    // Contrôle solaire : baies de batteries et conduits.
    for (let i = 0; i < 3; i++) {
      this.box(this.interior, 0.5, 1.2, 0.8, 0x2b3445, 12.2, 0.6, -2 + i * 0.9);
      this.box(this.interior, 0.06, 0.9, 0.6, 0x0b2a3a, 12.5, 0.62, -2 + i * 0.9, 0xffd166);
    }
    // Purificateur : rampe de conduits entre les cuves.
    for (let i = 0; i < 2; i++) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.0, 10), LunarMaterials.materials.waterPipe as THREE.Material);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(-14.8, 1.6 + i * 0.35, 0);
      this.interior.add(pipe);
    }
    // Pépinière : étagères et bacs supplémentaires.
    for (const x of [-3.2, 3.2]) {
      this.box(this.interior, 0.6, 1.6, 4.4, 0x39434f, x, 0.8, -11);
      for (let k = 0; k < 3; k++) {
        this.box(this.interior, 0.55, 0.05, 1.1, 0x4a3524, x, 0.45 + k * 0.45, -12 + k * 1.1);
      }
    }
  }

  // ----------------------- Portes automatiques -----------------------
  /**
   * Portes coulissantes posées dans les ouvertures reliant le hub, les couloirs
   * et les modules. Elles s'ouvrent à l'approche de l'astronaute et bloquent
   * réellement le passage lorsqu'elles sont fermées (voir `walkable`).
   */
  private buildDoors() {
    const junctions: Array<{ id: string; x: number; z: number; axis: 'x' | 'z' }> = [
      { id: 'hub-corridorE', x: 6, z: 0, axis: 'x' },
      { id: 'corridorE-solar', x: 10, z: 0, axis: 'x' },
      { id: 'hub-corridorW', x: -6, z: 0, axis: 'x' },
      { id: 'corridorW-purifier', x: -10, z: 0, axis: 'x' },
      { id: 'hub-corridorN', x: 0, z: -4, axis: 'z' },
      { id: 'corridorN-nursery', x: 0, z: -8, axis: 'z' },
    ];
    const width = 3.0;
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0xdde4ee,
      roughness: 0.34,
      metalness: 0.55,
    });
    const panelDetail = new THREE.MeshStandardMaterial({
      color: 0x5b6678,
      roughness: 0.4,
      metalness: 0.6,
    });

    junctions.forEach((j) => {
      const panels: THREE.Mesh[] = [];
      const lamp = new THREE.MeshStandardMaterial({
        color: 0xffc46b,
        emissive: 0xffa23a,
        emissiveIntensity: 1.1,
        roughness: 0.3,
      });

      const build = (side: -1 | 1) => {
        const geo = j.axis === 'x'
          ? new THREE.BoxGeometry(0.1, 2.5, width / 2 - 0.06)
          : new THREE.BoxGeometry(width / 2 - 0.06, 2.5, 0.1);
        const panel = new THREE.Mesh(geo, doorMat);
        // Détail de panneau (hublot renforcé) sur chaque vantail.
        const inset = new THREE.Mesh(
          j.axis === 'x'
            ? new THREE.BoxGeometry(0.12, 0.9, width * 0.22)
            : new THREE.BoxGeometry(width * 0.22, 0.9, 0.12),
          panelDetail
        );
        inset.position.set(0, 0.35, 0);
        panel.add(inset);
        panel.position.set(
          j.axis === 'x' ? j.x : j.x + side * (width / 4),
          1.25,
          j.axis === 'x' ? j.z + side * (width / 4) : j.z
        );
        this.interior.add(panel);
        panels.push(panel);
      };
      build(-1);
      build(1);

      // Cadre : linteau + montants + seuil, intégrés au mur (pas posés devant).
      const frameMat = LunarMaterials.materials.interiorWallTrim;
      if (j.axis === 'x') {
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, width + 0.4), frameMat);
        lintel.position.set(j.x, 2.62, j.z);
        this.interior.add(lintel);
        for (const s of [-1, 1]) {
          const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.26, 2.5, 0.2), frameMat);
          jamb.position.set(j.x, 1.25, j.z + s * (width / 2 + 0.1));
          this.interior.add(jamb);
        }
      } else {
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.24, 0.26), frameMat);
        lintel.position.set(j.x, 2.62, j.z);
        this.interior.add(lintel);
        for (const s of [-1, 1]) {
          const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.5, 0.26), frameMat);
          jamb.position.set(j.x + s * (width / 2 + 0.1), 1.25, j.z);
          this.interior.add(jamb);
        }
      }
      // Seuil lumineux + voyant d'état.
      const threshold = new THREE.Mesh(
        j.axis === 'x'
          ? new THREE.BoxGeometry(0.4, 0.02, width)
          : new THREE.BoxGeometry(width, 0.02, 0.4),
        new THREE.MeshStandardMaterial({
          color: 0x9fe8ff,
          emissive: 0x4fc8ff,
          emissiveIntensity: 1.2,
          roughness: 0.3,
        })
      );
      threshold.position.set(j.x, 0.026, j.z);
      this.interior.add(threshold);
      const lampMesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), lamp);
      lampMesh.position.set(
        j.axis === 'x' ? j.x : j.x + width / 2 + 0.1,
        2.76,
        j.axis === 'x' ? j.z + width / 2 + 0.1 : j.z
      );
      this.interior.add(lampMesh);

      this.doors.push({ id: j.id, x: j.x, z: j.z, axis: j.axis, width, open: 0, panels, lamp });
    });
  }

  private updateDoors(dt: number) {
    const px = this.pos.x;
    const pz = this.pos.z;
    for (const door of this.doors) {
      const dist = Math.hypot(door.x - px, door.z - pz);
      // Ouverture automatique à l'approche (l'astronaute n'a jamais à cliquer).
      const target = dist < 2.8 ? 1 : 0;
      const speed = target > door.open ? 4.2 : 2.0;
      door.open += THREE.MathUtils.clamp(target - door.open, -dt * speed, dt * speed);
      // Courbe adoucie : départ franc puis fin de course amortie (pneumatique).
      const eased = door.open * door.open * (3 - 2 * door.open);
      const slide = (door.width / 2) * 0.94 * eased;
      door.panels.forEach((panel, i) => {
        const side = i === 0 ? -1 : 1;
        const base = side * (door.width / 4);
        if (door.axis === 'x') {
          panel.position.z = door.z + base + side * slide;
        } else {
          panel.position.x = door.x + base + side * slide;
        }
      });
      door.lamp.color.setHex(door.open > 0.85 ? 0x8dffb0 : 0xffc46b);
      door.lamp.emissive.setHex(door.open > 0.85 ? 0x3dff86 : 0xffa23a);
      // Respiration lumineuse du voyant (plus vive quand la porte s'ouvre).
      door.lamp.emissiveIntensity = 0.9 + 0.35 * Math.sin(this.time * 3 + door.x) + 0.4 * door.open;
    }
  }

  private addInteractable(
    parent: THREE.Object3D,
    room: RoomId,
    id: string,
    x: number,
    z: number,
    label: string,
    hint: string,
    radius = 2.1
  ) {
    const interior = parent === this.interior;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.7, 32),
      new THREE.MeshBasicMaterial({
        color: 0x5dff9e,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05, z);
    parent.add(ring);
    const sprite = makeLabel(label, interior);
    sprite.position.set(x, interior ? 2.1 : 2.6, z);
    parent.add(sprite);
    this.interactables.push({ id, room, x, z, radius, label, hint, ring, sprite });
  }

  private buildHubProps() {
    const h = this.interior;
    // Capsule de sommeil
    this.box(h, 2.3, 0.7, 1.1, 0xe9eef5, 4.2, 0.35, -2.8);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x7fd8ff,
      transparent: true,
      opacity: 0.35,
      emissive: 0x2a9ccc,
      emissiveIntensity: 0.4,
    });
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.1, 16, 1, false, 0, Math.PI), glassMat);
    lid.rotation.z = Math.PI / 2;
    lid.position.set(4.2, 0.75, -2.8);
    h.add(lid);
    this.addInteractable(h, 'hub', 'sleep', 4.2, -2.4, '😴 Dormir', 'Passer la nuit et restaurer le sommeil');
    // Terminal QCM
    this.box(h, 1.1, 1.0, 0.6, 0x2b3445, -3.4, 0.5, -3.5);
    this.box(h, 1.0, 0.7, 0.08, 0x0b2a3a, -3.4, 1.4, -3.55, 0x35b8ff);
    this.addInteractable(h, 'hub', 'quiz', -3.4, -2.9, '🎓 Terminal QCM', 'Répondre à un QCM pour gagner des points');
    // Réserve de nourriture
    this.box(h, 1.2, 1.8, 0.7, 0x4b5b46, -4.9, 0.9, 3.4);
    this.box(h, 0.9, 0.5, 0.05, 0x7dde7d, -4.9, 1.3, 3.02, 0x7dde7d);
    this.addInteractable(h, 'hub', 'food', -4.9, 2.6, '🍽 Vivres', 'Manger : −10 vivres → +40 faim');
    // Distributeur d'eau
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 1.6, 16),
      new THREE.MeshStandardMaterial({ color: 0x3ea0ff, emissive: 0x1a5fb0, emissiveIntensity: 0.5, roughness: 0.3 })
    );
    tank.position.set(4.9, 0.8, 3.1);
    h.add(tank);
    this.addInteractable(h, 'hub', 'water', 4.9, 2.4, '💧 Eau', 'Boire : −10 eau → +40 hydratation');
    // Console NASA
    this.box(h, 1.5, 0.9, 0.7, 0x2b3445, 2.4, 0.45, 3.4);
    this.box(h, 1.3, 0.6, 0.06, 0x0b2a3a, 2.4, 1.15, 3.1, 0x5dffb0);
    this.addInteractable(h, 'hub', 'nasa', 2.4, 2.6, '🛰 Console NASA', 'Briefing DONKI / APOD / NeoWs');
    // Console de liaison Terre : illustre le délai de communication.
    this.box(h, 1.3, 0.85, 0.6, 0x22303f, 0.4, 0.43, 3.5);
    this.box(h, 1.1, 0.5, 0.05, 0x081c28, 0.4, 1.05, 3.22, 0x53d7ff);
    this.addInteractable(h, 'hub', 'earth_comm', 0.4, 2.6, '📡 Liaison Terre', 'Demander une assistance (réponse différée)');
    // Console de gestion de mission (énergie, priorités, réparations).
    this.box(h, 1.6, 0.9, 0.7, 0x2b3445, -1.2, 0.45, 3.4);
    this.box(h, 1.4, 0.65, 0.06, 0x081c28, -1.2, 1.18, 3.1, 0x7fe8ff);
    this.addInteractable(h, 'hub', 'systems', -1.2, 2.6, '🛠 Gestion de mission', 'Énergie, priorités, réparations, objectifs');
    // Sas de sortie
    const hatch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 0.12, 24),
      new THREE.MeshStandardMaterial({ color: 0xe6eaf0, emissive: 0x1aa6d0, emissiveIntensity: 0.35 })
    );
    hatch.rotation.x = Math.PI / 2;
    hatch.position.set(0, 1.3, 3.88);
    h.add(hatch);
    this.addInteractable(h, 'hub', 'exit_base', 0, 3.1, '🚪 Sas de sortie', 'Sortir sur la surface lunaire');
  }

  private buildNurseryProps() {
    const h = this.interior;
    const leaf = new THREE.MeshStandardMaterial({ color: 0x4fd66a, emissive: 0x1d6b2a, emissiveIntensity: 0.4 });
    [-2.4, 0, 2.4].forEach((x, i) => {
      this.box(h, 1.6, 0.5, 1.2, 0x4a3524, x, 0.25, -12.6);
      for (let k = 0; k < 6; k++) {
        const plant = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6 + (k % 3) * 0.12, 7), leaf);
        plant.position.set(x - 0.6 + (k % 3) * 0.6, 0.8, -12.6 + (k < 3 ? -0.3 : 0.3));
        h.add(plant);
      }
      this.box(h, 1.7, 0.06, 0.4, 0xff4fd8, x, 2.1, -12.6, 0xff4fd8);
      this.addInteractable(h, 'nursery', `harvest_${i}`, x, -11.5, '🌱 Récolter', '+14 nourriture', 1.6);
    });
  }

  private buildPurifierProps() {
    const h = this.interior;
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x3ea0ff, emissive: 0x1a5fb0, emissiveIntensity: 0.45, roughness: 0.3 });
    [-1.6, 1.6].forEach((z) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.4, 18), tankMat);
      t.position.set(-14.8, 1.2, z);
      h.add(t);
    });
    this.box(h, 0.8, 1.0, 1.3, 0x2b3445, -14.6, 0.5, 0);
    this.box(h, 0.06, 0.6, 1.0, 0x0b2a3a, -14.2, 1.15, 0, 0x35b8ff);
    this.addInteractable(h, 'purifier', 'purify', -13.2, 0, '💧 Purifier', '+14 eau', 2.4);
  }

  private buildSolarProps() {
    const h = this.interior;
    this.box(h, 0.8, 1.0, 1.6, 0x2b3445, 14.6, 0.5, 0);
    this.box(h, 0.06, 0.8, 1.4, 0x3a2b0b, 14.2, 1.3, 0, 0xffd166);
    this.box(h, 0.1, 1.6, 4.0, 0x161d2b, 15.9, 1.7, 0, 0x2a6fb0);
    this.addInteractable(h, 'solar', 'solar_check', 13.4, 0, '☀ Panneaux', '+10 énergie · rendement +35 %', 2.4);
  }

  // ------------------------------- Extérieur -------------------------------

  private buildExteriorMarkers() {
    const e = this.exteriorMarkers;
    this.addInteractable(e, 'exterior', 'enter_hub', 0, 5.1, '🚪 Entrer — Hub', 'Entrer dans la base centrale', 2.6);
    this.addInteractable(e, 'exterior', 'enter_solar', 10, 4.2, '⚡ Contrôle solaire', 'Entrer dans le module solaire', 2.6);
    this.addInteractable(e, 'exterior', 'enter_purifier', -10, 4.2, '💧 Purificateur', "Entrer dans le module d'eau", 2.6);
    this.addInteractable(e, 'exterior', 'enter_nursery', 0, -5, '🌱 Pépinière', 'Entrer dans la pépinière', 2.6);
  }

  setObstacles(rects: ObstacleRect[]) {
    this.obstacles = rects;
  }

  // -------------------------------- Entrées --------------------------------

  attach(canvas: HTMLElement) {
    this.canvas = canvas;
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (this.mode === 'build' || !this.inputEnabled || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        e.preventDefault();
        if (!e.repeat) this.jump();
        return;
      }
      if (k === 'e') {
        if (!e.repeat) this.triggerInteraction();
        return;
      }
      if (k === 'shift') this.sprintHeld = true;
      this.keys.add(k);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'shift') this.sprintHeld = false;
      this.keys.delete(k);
    };
    const onBlur = () => {
      this.keys.clear();
      this.sprintHeld = false;
    };
    const onMouseDown = (e: MouseEvent) => {
      if (this.mode === 'build' || !this.inputEnabled || e.button !== 0) return;
      if (matchMedia('(pointer: coarse)').matches) return;
      canvas.requestPointerLock?.();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (this.mode === 'build' || !this.inputEnabled) return;
      // Pointeur verrouillé, ou glisser avec le bouton gauche en secours.
      if (document.pointerLockElement === canvas || (e.buttons & 1) === 1) {
        this.applyLookDelta(e.movementX, e.movementY);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    this.cleanup.push(
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('blur', onBlur),
      () => canvas.removeEventListener('mousedown', onMouseDown),
      () => window.removeEventListener('mousemove', onMouseMove)
    );
  }

  setSettings(s: ControlSettings) {
    this.settings = { ...s };
  }

  setInputEnabled(enabled: boolean) {
    this.inputEnabled = enabled;
    if (!enabled) {
      this.keys.clear();
      this.sprintHeld = false;
      this.stickMove = { x: 0, y: 0 };
      this.stickLook = { x: 0, y: 0 };
      if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
    }
  }

  setMoveStick(x: number, y: number) {
    this.stickMove = { x, y };
  }

  setLookStick(x: number, y: number) {
    this.stickLook = { x, y };
  }

  setSpeedFactor(f: number) {
    this.speedFactor = f;
  }

  setSprint(on: boolean) {
    this.sprintHeld = on;
  }

  applyLookDelta(dx: number, dy: number) {
    const s = 0.0024 * this.settings.lookSensitivity;
    this.yaw -= dx * s;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * s * (this.settings.invertY ? -1 : 1), -0.3, 1.05);
  }

  jump() {
    if (this.height <= 0.001 && this.mode !== 'build') this.vy = 3.1;
  }

  // --------------------------------- Modes ---------------------------------

  setMode(mode: ViewMode, room: RoomId = 'hub') {
    this.mode = mode;
    this.keys.clear();
    this.stickMove = { x: 0, y: 0 };
    this.stickLook = { x: 0, y: 0 };
    this.nearest = null;
    this.vy = 0;
    this.height = 0;
    this.snapCamera = true;
    const interior = mode === 'interior';
    const exterior = mode === 'exterior';
    this.character.visible = interior || exterior;
    this.interior.visible = interior;
    this.exteriorMarkers.visible = exterior;
    if (mode === 'build') {
      if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
      return;
    }
    if (exterior) {
      this.room = 'exterior';
      this.pos.set(room === 'hub' ? 1.5 : 2, 0, room === 'hub' ? 9 : 11);
      this.yaw = 0;
    } else {
      this.room = room;
      const spawns: Record<string, [number, number, number]> = {
        hub: [0, 0, 0],
        solar: [11.4, 0, -Math.PI / 2],
        purifier: [-11.4, 0, Math.PI / 2],
        nursery: [0, -9.6, 0],
      };
      const [x, z, yaw] = spawns[room] ?? spawns.hub;
      this.pos.set(x, INTERIOR_Y, z);
      this.yaw = yaw;
    }
    this.facing = this.yaw;
    this.pitch = 0.28;
    this.character.position.copy(this.pos);
    this.character.rotation.y = this.facing;
  }

  getMode(): ViewMode {
    return this.mode;
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------- Interaction -------------------------------

  private cooldownLeft(id: string): number {
    const until = this.cooldownUntil.get(id) ?? 0;
    return Math.max(0, until - this.time);
  }

  triggerInteraction() {
    const it = this.nearest;
    if (!it || this.mode === 'build' || !this.inputEnabled) return;
    const left = this.cooldownLeft(it.id);
    if (left > 0) {
      this.callbacks.onInteract('cooldown', { cooldown: left });
      return;
    }
    const cd = COOLDOWNS[it.id];
    if (cd) this.cooldownUntil.set(it.id, this.time + cd);
    this.callbacks.onInteract(it.id);
  }

  getSnapshot(): AstronautSnapshot {
    const it = this.nearest;
    let interaction: InteractionInfo | null = null;
    if (it) {
      const left = this.cooldownLeft(it.id);
      interaction = {
        id: it.id,
        label: it.label,
        hint: left > 0 ? `${it.hint} · recharge ${Math.ceil(left)} s` : it.hint,
      };
    }
    return { mode: this.mode, room: this.room, interaction };
  }

  // ---------------------------------- Boucle ----------------------------------

  private walkable(x: number, z: number): boolean {
    if (this.mode === 'interior') {
      const r = 0.32;
      const pts: Array<[number, number]> = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]];
      const inside = pts.every(([dx, dz]) =>
        Object.values(ROOMS).some((rc) => x + dx >= rc.x0 && x + dx <= rc.x1 && z + dz >= rc.z0 && z + dz <= rc.z1)
      );
      if (!inside) return false;
      // Une porte fermée est un vrai obstacle ; elle s'ouvre automatiquement.
      return !this.doors.some((d) => {
        if (d.open > 0.7) return false;
        const half = d.width / 2 - 0.12;
        return d.axis === 'x'
          ? Math.abs(x - d.x) < 0.38 && Math.abs(z - d.z) < half
          : Math.abs(z - d.z) < 0.38 && Math.abs(x - d.x) < half;
      });
    }
    if (Math.hypot(x, z) > EXTERIOR_RADIUS) return false;
    const r = 0.35;
    return !this.obstacles.some((o) => x > o.x - r && x < o.x + o.w + r && z > o.z - r && z < o.z + o.d + r);
  }

  update(dt: number) {
    if (this.mode === 'build') return;
    this.time += dt;
    const interior = this.mode === 'interior';
    const groundY = interior ? INTERIOR_Y : 0;
    if (interior) {
      this.updateDoors(dt);
      for (const p of this.pulses) {
        p.mat.emissiveIntensity = p.base * (0.82 + 0.18 * Math.sin(this.time * p.speed + p.phase));
      }
    }

    // Caméra (joystick droit)
    if (this.stickLook.x !== 0 || this.stickLook.y !== 0) {
      const rate = 2.4 * this.settings.joystickSensitivity;
      this.yaw -= this.stickLook.x * rate * dt;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch + this.stickLook.y * rate * 0.6 * dt * (this.settings.invertY ? -1 : 1),
        -0.3,
        1.05
      );
    }

    // Direction de déplacement
    let mx = this.stickMove.x;
    let my = this.stickMove.y;
    if (this.inputEnabled) {
      if (this.keys.has('w') || this.keys.has('z') || this.keys.has('arrowup')) my += 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) my -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1;
      if (this.keys.has('a') || this.keys.has('q') || this.keys.has('arrowleft')) mx -= 1;
    }
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    // forward = (-sin, -cos) ; right = (cos, -sin)
    const dirX = -sinY * my + cosY * mx;
    const dirZ = -cosY * my - sinY * mx;
    const moving = Math.hypot(dirX, dirZ) > 0.05;
    const speed = 3.2 * (this.sprintHeld ? 1.6 : 1) * this.speedFactor;

    if (moving) {
      const nx = this.pos.x + dirX * speed * dt;
      const nz = this.pos.z + dirZ * speed * dt;
      if (this.walkable(nx, nz)) {
        this.pos.x = nx;
        this.pos.z = nz;
      } else if (this.walkable(nx, this.pos.z)) {
        this.pos.x = nx;
      } else if (this.walkable(this.pos.x, nz)) {
        this.pos.z = nz;
      }
      const target = Math.atan2(-dirX, -dirZ);
      let diff = target - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * Math.min(1, dt * 12);
      this.walkPhase += speed * dt * 2.6;
    }

    // Saut (gravité lunaire stylisée)
    if (this.vy !== 0 || this.height > 0) {
      this.vy -= 5.2 * dt;
      this.height += this.vy * dt;
      if (this.height <= 0) {
        this.height = 0;
        this.vy = 0;
      }
    }

    this.pos.y = groundY;
    this.character.position.set(this.pos.x, groundY + this.height, this.pos.z);
    this.character.rotation.y = this.facing;
    const swing = moving ? Math.sin(this.walkPhase) * 0.7 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;

    if (interior) this.room = roomAt(this.pos.x, this.pos.z);
    else this.room = 'exterior';

    this.updateInteractions();
    this.updateCamera(dt, interior, groundY);
  }

  private updateInteractions() {
    const interior = this.mode === 'interior';
    let best: Interactable | null = null;
    let bestD = Infinity;
    this.interactables.forEach((it) => {
      const inContext = interior ? it.room !== 'exterior' : it.room === 'exterior';
      if (!inContext) return;
      const d = Math.hypot(it.x - this.pos.x, it.z - this.pos.z);
      const visible = d < (interior ? 11 : 18);
      it.sprite.visible = visible;
      it.ring.visible = visible;
      if (d < it.radius && d < bestD) {
        best = it;
        bestD = d;
      }
    });
    this.nearest = best;
    this.interactables.forEach((it) => {
      const active = it === best;
      (it.ring.material as THREE.MeshBasicMaterial).opacity = active ? 0.95 : 0.4;
      const base = it.room === 'exterior' ? 1.5 : 1.3;
      const s = active ? base * 1.15 : base;
      it.sprite.scale.set(s, s * 0.25, 1);
    });
  }

  private updateCamera(dt: number, interior: boolean, groundY: number) {
    const portrait = this.camera.aspect < 0.8;
    const dist = interior ? (portrait ? 3.1 : 2.7) : portrait ? 4.3 : 3.6;
    const shoulder = portrait ? 1.25 : 0.95;
    const head = new THREE.Vector3(this.pos.x, groundY + this.height + 1.55, this.pos.z);
    const horiz = Math.cos(this.pitch) * dist;
    const desired = new THREE.Vector3(
      head.x + Math.sin(this.yaw) * horiz + Math.cos(this.yaw) * shoulder,
      head.y + Math.sin(this.pitch) * dist + 0.3,
      head.z + Math.cos(this.yaw) * horiz - Math.sin(this.yaw) * shoulder
    );
    desired.y = Math.max(desired.y, groundY + 0.45);

    if (interior) {
      const dir = desired.clone().sub(head);
      const len = dir.length();
      dir.normalize();
      this.raycaster.set(head, dir);
      this.raycaster.far = len;
      const hits = this.raycaster.intersectObjects(this.wallMeshes, false);
      if (hits.length > 0) {
        desired.copy(head).addScaledVector(dir, Math.max(0.5, hits[0].distance - 0.3));
      }
    }

    if (this.snapCamera) {
      this.camera.position.copy(desired);
      this.snapCamera = false;
    } else {
      this.camera.position.lerp(desired, Math.min(1, dt * 14));
    }
    const look = new THREE.Vector3(
      head.x - Math.sin(this.yaw) * 4,
      head.y + 0.1,
      head.z - Math.cos(this.yaw) * 4
    );
    this.camera.lookAt(look);
  }

  dispose() {
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
    this.scene.remove(this.character, this.interior, this.exteriorMarkers);
  }
}
