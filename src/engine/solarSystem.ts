import * as THREE from 'three';
import { audio } from './audio';
import { noise3, clamp01 } from './noise';
import {
  generatePlanetTextures,
  generateEarthClouds,
  generateRingTexture,
} from './textures';
import { createLunarGrid, GhostDef, GridBuildingSync } from './lunarGrid';
import { LunarBaseScene, LunarStateSnapshot } from './lunar/LunarBaseScene';
import { BuildingType } from './lunar/BuildingBase';
import { BUILDINGS, BLOCKED_RECTS } from '../game/buildings';
import type { AstronautSnapshot, RoomId, ViewMode } from './astronaut';
import type { ControlSettings } from './controls';
import { createArtemisVoyage, ARTEMIS_MILESTONES } from './artemisVoyage';

/**
 * Initialise toute la scène (système solaire + voyage vers la Lune + base lunaire).
 * Les éléments HTML de l'interface (rendus par App.tsx) sont récupérés par id.
 * Retourne une fonction de nettoyage (démontage React / HMR).
 */
export interface SolarSystemCallbacks {
  onPhaseChange?: (phase: 'space' | 'flying_to_moon' | 'lunar_base') => void;
  /** Appelé quand le joueur clique un bâtiment d'origine : React pose le quiz. */
  onRequestUpgrade?: (key: string) => void;
  /** Appelé quand le joueur clique un module posé sur la grille. */
  onBuildingClick?: (id: string | null) => void;
  /** Le joueur a cliqué sur une case libre en mode construction (ancre coin haut-gauche). */
  onPlaceRequest?: (cell: { x: number; z: number }) => void;
  /** Clic sur une case invalide (occupée / hors plateau verrouillé). */
  onPlaceRejected?: (reason: string) => void;
  /** Information de prévisualisation (pour afficher un statut dans le HUD). */
  onGhostChange?: (info: { x: number; z: number; valid: boolean; reason?: string } | null) => void;
  /** Le mode construction a été quitté (Échap, clic droit, pose réussie). */
  onCancelBuild?: () => void;
  /** Avancement du déploiement / des niveaux de la base (bannière d'entrée). */
  onLunarStateChange?: (snapshot: LunarStateSnapshot) => void;
  /** Interaction du mode astronaute (id de l'objet ; `cooldown` si en recharge). */
  onAstronautInteract?: (id: string, info?: { cooldown?: number }) => void;
}

export interface GameSyncPayload {
  buildings: GridBuildingSync[];
  tier: number;
  daylight: number;
  selectedId: string | null;
}

export interface SolarSystemApi {
  dispose: () => void;
  upgradeBuilding: (key: string) => void;
  getLevels: () => Record<string, number>;
  getPhase: () => 'space' | 'flying_to_moon' | 'lunar_base';
  /** Synchronise la grille 3D (plateau, modules, sélection, lumière) avec le jeu React. */
  syncGame: (payload: GameSyncPayload) => void;
  /** Entre/sort du mode construction ; le fantôme suit la souris. */
  setBuildMode: (def: GhostDef | null) => void;
  /** Revient au système solaire (bouton de la station). */
  returnToSpace: () => void;
  /** Remet la base dans son état abandonné (nouvelle mission). */
  resetBase: () => void;
  /** Relance immédiatement le déploiement sur place (nouvelle mission). */
  restartMission: (levels: Partial<Record<BuildingType, number>>) => void;
  /** Reprend une base sauvegardée sans cinématique (retour de session). */
  resumeMission: (levels: Partial<Record<BuildingType, number>>, tier?: number) => void;
  // ---- Mode astronaute (3ᵉ personne) ----
  setViewMode: (mode: ViewMode, room?: RoomId) => void;
  getViewMode: () => ViewMode;
  getAstronautSnapshot: () => AstronautSnapshot;
  setAstronautSettings: (s: ControlSettings) => void;
  setAstronautInputEnabled: (enabled: boolean) => void;
  setMoveStick: (x: number, y: number) => void;
  setLookStick: (x: number, y: number) => void;
  setSpeedFactor: (f: number) => void;
  astronautInteract: () => void;
  astronautJump: () => void;
  astronautSprint: (on: boolean) => void;
}

export function initSolarSystem(callbacks: SolarSystemCallbacks = {}): SolarSystemApi {
  const disposers: Array<() => void> = [];
  const on = (
    target: EventTarget,
    type: string,
    fn: (e: any) => void,
    opts?: boolean | AddEventListenerOptions
  ) => {
    target.addEventListener(type, fn as EventListener, opts);
    disposers.push(() => target.removeEventListener(type, fn as EventListener, opts));
  };

  // =========================================================================
  // 4. THREE.JS SCENE, RENDERER & VIBRANT COSMIC LIGHTING
  // =========================================================================
  const scene = new THREE.Scene();

  // near = 0.015 so up-close lunar base animations never clip!
  const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.015, 3000);
  camera.position.set(0, 48, 125);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  // =========================================================================
  // SITE LUNAIRE DÉTAILLÉ (nouvelle séquence d'entrée + bâtiments évolutifs)
  // Rendu avec le même WebGLRenderer, caméra et scène dédiées.
  // =========================================================================
  const lunarScene = new LunarBaseScene(window.innerWidth / window.innerHeight, (snapshot) => {
    callbacks.onLunarStateChange?.(snapshot);
    if (!snapshot.deploying && lunarScene.getViewMode() === 'build') lunarGameGrid.setVisible(true);
    try {
      if (snapshot.deploying) sessionStorage.removeItem('infectium.entrySeen');
      else sessionStorage.setItem('infectium.entrySeen', '1');
    } catch {
      /* stockage indisponible */
    }
  }, (id, info) => callbacks.onAstronautInteract?.(id, info));
  lunarScene.astronaut.attach(renderer.domElement);
  const lunarPickables: THREE.Object3D[] = [];
  const lunarGridAnchor = new THREE.Group();
  // La grille de jeu travaille en « cases » (1 case = 1 m) ; l'échelle 20 la
  // projette dans le monde métrique de la scène lunaire.
  lunarGridAnchor.scale.setScalar(20);
  lunarGridAnchor.position.y = -0.6;
  lunarScene.scene.add(lunarGridAnchor);
  const lunarGameGrid = createLunarGrid(lunarGridAnchor, lunarPickables);

  const sunLight = new THREE.PointLight(0xfff1d6, 4.2, 600, 0.35);
  scene.add(sunLight);
  const ambientLight = new THREE.AmbientLight(0x5265a8, 0.72);
  scene.add(ambientLight);
  const hemiLight = new THREE.HemisphereLight(0x70a5ff, 0x9b4dca, 0.55);
  scene.add(hemiLight);

  // =========================================================================
  // 5. COLORFUL NEBULA SKYDOME & SCATTERED TWINKLING STARS EVERYWHERE
  // =========================================================================
  const nebulaMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform float uTime;
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }
      float fbm(vec3 p) {
        float v = 0.0; float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = p * 2.05 + vec3(1.7, 9.2, 4.3);
          a *= 0.5;
        }
        return v;
      }
      void main() {
        vec3 d = normalize(vDir);
        float drift = uTime * 0.012;
        float n1 = fbm(d * 2.5 + vec3(drift, 0.0, -drift));
        float n2 = fbm(d * 4.2 + vec3(-drift, drift, 1.5));
        float milky = exp(-abs(d.y + 0.15 * sin(d.x * 2.5)) * 4.2);

        vec3 deepSpace = vec3(0.012, 0.015, 0.055);
        vec3 violet = vec3(0.32, 0.06, 0.48);
        vec3 cyan = vec3(0.04, 0.36, 0.56);
        vec3 magenta = vec3(0.55, 0.10, 0.38);
        vec3 gold = vec3(0.45, 0.25, 0.08);

        vec3 col = deepSpace;
        col += violet * smoothstep(0.35, 0.85, n1) * 0.65;
        col += cyan * smoothstep(0.42, 0.88, n2) * 0.55;
        col += magenta * smoothstep(0.48, 0.90, n1 * n2 * 2.1) * 0.60;
        col += mix(cyan, gold, n2) * milky * 0.32;
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  const nebulaDome = new THREE.Mesh(new THREE.SphereGeometry(1400, 48, 32), nebulaMat);
  scene.add(nebulaDome);

  const starCount = 7500;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  const starCol = new Float32Array(starCount * 3);
  const starSize = new Float32Array(starCount);
  const starPhase = new Float32Array(starCount);

  const starPalette = [
    new THREE.Color(0xffffff),
    new THREE.Color(0x9be2ff),
    new THREE.Color(0xfff1a8),
    new THREE.Color(0xffb478),
    new THREE.Color(0xe6b8ff),
    new THREE.Color(0x7afcff)
  ];

  for (let i = 0; i < starCount; i++) {
    const radius = (i < 1800) ? 45 + Math.random() * 280 : 320 + Math.random() * 900;
    const theta = Math.random() * Math.PI * 2;
    const cosPhi = Math.random() * 2 - 1;
    const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);

    starPos[i * 3] = radius * sinPhi * Math.cos(theta);
    starPos[i * 3 + 1] = radius * cosPhi;
    starPos[i * 3 + 2] = radius * sinPhi * Math.sin(theta);

    const c = starPalette[Math.floor(Math.random() * starPalette.length)];
    starCol[i * 3] = c.r; starCol[i * 3 + 1] = c.g; starCol[i * 3 + 2] = c.b;
    starSize[i] = 1.2 + Math.pow(Math.random(), 2.5) * 6.5;
    starPhase[i] = Math.random() * Math.PI * 2;
  }

  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('aColor', new THREE.BufferAttribute(starCol, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhase, 1));

  const starMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
    },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aPhase;
      varying vec3 vColor;
      varying float vTwinkle;
      uniform float uTime;
      uniform float uPixelRatio;
      void main() {
        vColor = aColor;
        vTwinkle = 0.55 + 0.45 * sin(uTime * (1.5 + aPhase * 0.5) + aPhase * 6.2831);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (260.0 / max(-mvPosition.z, 20.0));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        if (d > 0.5) discard;
        float core = smoothstep(0.5, 0.05, d);
        float spark = smoothstep(0.2, 0.0, abs(uv.x)) * smoothstep(0.45, 0.0, abs(uv.y))
                    + smoothstep(0.2, 0.0, abs(uv.y)) * smoothstep(0.45, 0.0, abs(uv.x));
        float alpha = clamp(core * 0.9 + spark * 0.45, 0.0, 1.0) * vTwinkle;
        gl_FragColor = vec4(vColor * (1.2 + core * 0.5), alpha);
      }
    `
  });
  scene.add(new THREE.Points(starGeo, starMat));

  // =========================================================================
  // 6. ATMOSPHERE FRESNEL SHADER & SUN PLASMA SHADER
  // =========================================================================
  function createAtmosphereMesh(radius, colorHex, intensity = 0.85) {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(colorHex) },
        uIntensity: { value: intensity }
      },
      vertexShader: `
        varying vec3 vNormal; varying vec3 vViewPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewPos = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal; varying vec3 vViewPos;
        uniform vec3 uColor; uniform float uIntensity;
        void main() {
          vec3 viewDir = normalize(vViewPos);
          float rim = pow(clamp(0.68 - dot(vNormal, -viewDir), 0.0, 1.0), 2.8);
          gl_FragColor = vec4(uColor, rim * uIntensity);
        }
      `
    });
    return new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), mat);
  }

  const sunMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPulse: { value: 0 } },
    vertexShader: `
      varying vec3 vPos; varying vec3 vNormal; varying vec3 vViewPos;
      void main() {
        vPos = position;
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vPos; varying vec3 vNormal; varying vec3 vViewPos;
      uniform float uTime; uniform float uPulse;
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1); p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 x) {
        vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }
      float fbm(vec3 p) {
        float v = 0.0; float a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.15; a *= 0.5; }
        return v;
      }
      void main() {
        vec3 p = normalize(vPos) * 3.8;
        float t = uTime * 0.35;
        float n1 = fbm(p + vec3(t, -t * 0.7, t * 0.5));
        float n2 = fbm(p * 2.2 - vec3(t * 1.2, t * 0.8, -t));
        float heat = clamp(n1 * 0.65 + n2 * 0.45 + uPulse * 0.35, 0.0, 1.0);
        vec3 darkOrange = vec3(0.95, 0.22, 0.02);
        vec3 brightOrange = vec3(1.0, 0.58, 0.08);
        vec3 yellowWhite = vec3(1.0, 0.96, 0.65);
        vec3 col = mix(darkOrange, brightOrange, smoothstep(0.15, 0.6, heat));
        col = mix(col, yellowWhite, smoothstep(0.55, 0.95, heat));
        vec3 viewDir = normalize(vViewPos);
        float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.5);
        col += vec3(1.0, 0.45, 0.05) * fresnel * 0.9;
        gl_FragColor = vec4(col * 1.25, 1.0);
      }
    `
  });


  // =========================================================================
  // 8. BUILD THE SOLAR SYSTEM (IDENTICAL RENDERING + MOON BASE ATTACHED)
  // =========================================================================
  const bodies = [];
  const clickableMeshes = [];

  function createSunGlowSprite() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 15, 128, 128, 128);
    g.addColorStop(0.0, 'rgba(255, 240, 160, 0.95)');
    g.addColorStop(0.25, 'rgba(255, 150, 30, 0.65)');
    g.addColorStop(0.55, 'rgba(255, 70, 10, 0.22)');
    g.addColorStop(1.0, 'rgba(255, 40, 0, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(42, 42, 1);
    return sprite;
  }

  // Rayons calibrés sur une échelle racine-cubique des rayons réels (km), compressée pour
  // rester jouable, mais qui respecte l'ordre et les écarts relatifs : le Soleil domine
  // nettement, Jupiter/Saturne sont clairement plus grosses que les telluriques, etc.
  const sunGroup = new THREE.Group();
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(11.3, 64, 48), sunMat);
  sunMesh.userData.bodyIndex = 0;
  sunGroup.add(sunMesh);
  sunGroup.add(createSunGlowSprite());
  scene.add(sunGroup);
  clickableMeshes.push(sunMesh);
  bodies.push({
    index: 0, group: sunGroup, mesh: sunMesh, radius: 11.3,
    orbitRadius: 0, orbitSpeed: 0, angle: 0, rotSpeed: 0.08, viewDist: 30
  });

  const planetSpecs = [
    { type: 'mercury', radius: 1.70, orbitR: 18,  speed: 0.38, angle: 0.4, tilt: 0.03, rot: 0.15, atmo: null,     atmoInt: 0,    texW: 384, texH: 192, orbitColor: 0xffe0b2 },
    { type: 'venus',   radius: 2.30, orbitR: 26,  speed: 0.28, angle: 1.9, tilt: 0.05, rot: -0.08,atmo: 0xffb347, atmoInt: 0.7,  texW: 512, texH: 256, orbitColor: 0xffcc80 },
    { type: 'earth',   radius: 2.35, orbitR: 36,  speed: 0.22, angle: 3.1, tilt: 0.41, rot: 0.45, atmo: 0x38b6ff, atmoInt: 0.95, texW: 640, texH: 320, orbitColor: 0x64d2ff },
    { type: 'mars',    radius: 1.90, orbitR: 46,  speed: 0.17, angle: 5.0, tilt: 0.44, rot: 0.42, atmo: 0xff6a33, atmoInt: 0.5,  texW: 512, texH: 256, orbitColor: 0xff8a65 },
    { type: 'jupiter', radius: 5.25, orbitR: 68,  speed: 0.10, angle: 0.9, tilt: 0.05, rot: 0.85, atmo: 0xffc68a, atmoInt: 0.45, texW: 640, texH: 320, orbitColor: 0xffb74d },
    { type: 'saturn',  radius: 4.90, orbitR: 92,  speed: 0.075,angle: 2.5, tilt: 0.47, rot: 0.78, atmo: 0xffe3a3, atmoInt: 0.4,  texW: 512, texH: 256, orbitColor: 0xffe082, rings: 'saturn' },
    { type: 'uranus',  radius: 3.75, orbitR: 114, speed: 0.055,angle: 4.2, tilt: 1.70, rot: -0.6, atmo: 0x5ef7ff, atmoInt: 0.75, texW: 384, texH: 192, orbitColor: 0x80deea, rings: 'uranus' },
    { type: 'neptune', radius: 3.70, orbitR: 134, speed: 0.042,angle: 5.7, tilt: 0.49, rot: 0.65, atmo: 0x3377ff, atmoInt: 0.85, texW: 512, texH: 256, orbitColor: 0x648fff }
  ];

  const saturnRingTex = generateRingTexture('saturn');
  const uranusRingTex = generateRingTexture('uranus');
  const moonTextures = generatePlanetTextures('moon', 384, 192);
  const earthCloudTex = generateEarthClouds(512, 256);

  const dynamicUpdaters = [];
  let moonMeshRef = null;
  let gameDaylight = 1;
  let lightSmooth = 1;
  let buildMode: GhostDef | null = null;
  let lastGamePayload: GameSyncPayload | null = null;
  let lunarReady = false;
  const artemisVoyage = createArtemisVoyage();
  scene.add(artemisVoyage.group);

  planetSpecs.forEach((spec, idx) => {
    const bodyIndex = idx + 1;

    const orbitPts = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      orbitPts.push(new THREE.Vector3(Math.cos(a) * spec.orbitR, 0, Math.sin(a) * spec.orbitR));
    }
    scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(orbitPts),
      new THREE.LineBasicMaterial({ color: spec.orbitColor, transparent: true, opacity: 0.16 })
    ));

    const group = new THREE.Group();
    const tiltGroup = new THREE.Group();
    tiltGroup.rotation.z = spec.tilt;
    group.add(tiltGroup);

    const tex = generatePlanetTextures(spec.type, spec.texW, spec.texH);
    const mat = new THREE.MeshStandardMaterial({
      map: tex.map,
      bumpMap: tex.bumpMap,
      bumpScale: spec.type === 'mercury' || spec.type === 'mars' ? 0.08 : 0.03,
      roughnessMap: tex.roughnessMap || null,
      roughness: spec.type === 'earth' ? 0.85 : 0.72,
      metalness: 0.05
    });

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(spec.radius, 56, 40), mat);
    mesh.userData.bodyIndex = bodyIndex;
    tiltGroup.add(mesh);
    clickableMeshes.push(mesh);

    if (spec.atmo) {
      tiltGroup.add(createAtmosphereMesh(spec.radius * 1.11, spec.atmo, spec.atmoInt));
    }

    if (spec.type === 'earth') {
      const cloudMesh = new THREE.Mesh(
        new THREE.SphereGeometry(spec.radius * 1.022, 48, 32),
        new THREE.MeshStandardMaterial({
          map: earthCloudTex, transparent: true, opacity: 0.9, depthWrite: false, roughness: 0.9
        })
      );
      tiltGroup.add(cloudMesh);
      dynamicUpdaters.push((dt) => { cloudMesh.rotation.y += dt * 0.14; });

      // Moon + Abandoned Lunar Base attached cleanly
      const moonRadius = 0.95;
      const moonPivot = new THREE.Group();
      const moonMesh = new THREE.Mesh(
        new THREE.SphereGeometry(moonRadius, 48, 36),
        new THREE.MeshStandardMaterial({
          map: moonTextures.map, bumpMap: moonTextures.bumpMap, bumpScale: 0.04, roughness: 0.9
        })
      );
      moonMesh.position.set(5.4, 0.4, 0);
      moonMesh.userData.bodyIndex = 9;
      moonPivot.add(moonMesh);
      clickableMeshes.push(moonMesh);
      moonMeshRef = moonMesh;

      group.add(moonPivot);
      dynamicUpdaters.push((dt) => {
        moonPivot.rotation.y += dt * 0.16;
      });
    }

    if (spec.type === 'jupiter') {
      const moonColors = [0xffdf78, 0xd8f0ff, 0xc7b8a8, 0x9fa8c4];
      moonColors.forEach((col, mi) => {
        const mp = new THREE.Group();
        mp.rotation.x = (mi - 1.5) * 0.06;
        mp.rotation.y = mi * 1.7;
        const mm = new THREE.Mesh(
          new THREE.SphereGeometry(0.24 + mi * 0.05, 16, 12),
          new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 })
        );
        mm.position.set(6.8 + mi * 1.45, 0, 0);
        mp.add(mm);
        group.add(mp);
        dynamicUpdaters.push((dt) => { mp.rotation.y += dt * (1.1 - mi * 0.2); });
      });
    }

    if (spec.rings) {
      const innerR = spec.rings === 'saturn' ? spec.radius * 1.28 : spec.radius * 1.38;
      const outerR = spec.rings === 'saturn' ? spec.radius * 2.38 : spec.radius * 1.85;
      const ringGeo = new THREE.RingGeometry(innerR, outerR, 128, 1);
      const pos = ringGeo.attributes.position;
      const uv = ringGeo.attributes.uv;
      const v3 = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v3.fromBufferAttribute(pos, i);
        const u = (v3.length() - innerR) / (outerR - innerR);
        uv.setXY(i, u, 0.5);
      }
      const ringMat = new THREE.MeshStandardMaterial({
        map: spec.rings === 'saturn' ? saturnRingTex : uranusRingTex,
        transparent: true, side: THREE.DoubleSide, roughness: 0.65, depthWrite: false
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      tiltGroup.add(ringMesh);
    }

    scene.add(group);
    bodies.push({
      index: bodyIndex, group, mesh, radius: spec.radius,
      orbitRadius: spec.orbitR, orbitSpeed: spec.speed,
      angle: spec.angle, rotSpeed: spec.rot,
      viewDist: spec.rings ? spec.radius * 5.2 : Math.max(spec.radius * 3.8, 6.8)
    });
  });

  // =========================================================================
  // 9. ASTEROID BELT, COMETS & CLICK PULSE RING
  // =========================================================================
  const asteroidCount = 650;
  const astGeo = new THREE.IcosahedronGeometry(0.28, 0);
  const astPosAttr = astGeo.attributes.position;
  for (let i = 0; i < astPosAttr.count; i++) {
    const vx = astPosAttr.getX(i), vy = astPosAttr.getY(i), vz = astPosAttr.getZ(i);
    const scale = 0.75 + 0.45 * noise3(vx * 3 + 1, vy * 3 + 2, vz * 3 + 3);
    astPosAttr.setXYZ(i, vx * scale, vy * scale * 0.8, vz * scale);
  }
  astGeo.computeVertexNormals();

  const asteroidBelt = new THREE.InstancedMesh(
    astGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.15 }),
    asteroidCount
  );
  const asteroidData = [];
  const dummy = new THREE.Object3D();
  const astColors = [
    new THREE.Color(0xb89f8d), new THREE.Color(0xd4a373),
    new THREE.Color(0x8e9aaf), new THREE.Color(0xe5989b), new THREE.Color(0xa3b18a)
  ];
  for (let i = 0; i < asteroidCount; i++) {
    asteroidData.push({
      r: 52 + Math.random() * 9.5, a: Math.random() * Math.PI * 2,
      y: (Math.random() - 0.5) * 3.8, scale: 0.4 + Math.random() * 1.6,
      rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      speed: 0.09 + Math.random() * 0.06, tumble: (Math.random() - 0.5) * 1.8
    });
    asteroidBelt.setColorAt(i, astColors[i % astColors.length]);
  }
  asteroidBelt.instanceColor.needsUpdate = true;
  scene.add(asteroidBelt);

  const comets = [];
  for (let i = 0; i < 4; i++) {
    const cGroup = new THREE.Group();
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 12, 12),
      new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0x7ef9ff : 0xffd166 })
    );
    const tailGeo = new THREE.ConeGeometry(0.45, 14, 12, 1, true);
    tailGeo.translate(0, -7, 0); tailGeo.rotateX(Math.PI / 2);
    const tail = new THREE.Mesh(
      tailGeo,
      new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x38b6ff : 0xff9f1c,
        transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide, depthWrite: false
      })
    );
    cGroup.add(head); cGroup.add(tail); scene.add(cGroup);
    comets.push({ group: cGroup, pos: new THREE.Vector3(), vel: new THREE.Vector3(), timer: i * 3.5, active: false });
  }

  function launchComet(c) {
    const side = Math.random() * Math.PI * 2;
    c.pos.set(Math.cos(side) * 180, (Math.random() - 0.5) * 90 + 25, Math.sin(side) * 180);
    const target = new THREE.Vector3((Math.random() - 0.5) * 90, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 90);
    c.vel.subVectors(target, c.pos).normalize().multiplyScalar(85 + Math.random() * 45);
    c.group.position.copy(c.pos);
    c.group.lookAt(c.pos.clone().add(c.vel));
    c.active = true; c.timer = 0;
  }

  const pulseRingMat = new THREE.MeshBasicMaterial({
    color: 0x99eeff, transparent: true, opacity: 0,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
  });
  const pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.15, 48), pulseRingMat);
  scene.add(pulseRing);
  let pulseScale = 1, pulseLife = 0;
  function triggerPulse(worldPos, baseRadius) {
    pulseRing.position.copy(worldPos);
    pulseRing.lookAt(camera.position);
    pulseScale = baseRadius * 1.1;
    pulseLife = 1.0;
  }

  // =========================================================================
  // 10. FLOW CONTROLLER: SPACE NAVIGATION -> SOLO LEVELING BOX -> LUNAR BASE
  // =========================================================================
  let appPhase: 'space' | 'flying_to_moon' | 'lunar_base' = 'space';
  let flightT = 0;
  let flightStartPos = new THREE.Vector3();
  let flightStartLook = new THREE.Vector3();

  let focusedIndex = -1;
  let tourProgress = 0.0;
  let tourTarget = 0.0;
  let isPaused = false;

  const pointerNDC = new THREE.Vector2(0, 0);
  const smoothParallax = new THREE.Vector2(0, 0);

  let orbitYaw = 0.55, orbitPitch = 0.35, orbitZoom = 1.0;
  let targetYaw = 0.55, targetPitch = 0.35, targetZoom = 1.0;
  let isDragging = false, dragDist = 0, lastPointer = { x: 0, y: 0 };

  const camLookCurrent = new THREE.Vector3(0, 0, 0);
  const camPosCurrent = new THREE.Vector3().copy(camera.position);

  // UI Elements
  const systemOverlay = document.getElementById('system-overlay');
  const planetDock = document.getElementById('planet-dock');
  const lunarBanner = document.getElementById('lunar-banner');
  const lunarDock = document.getElementById('lunar-dock');
  void lunarBanner;
  void lunarDock;
  const dockButtons = document.querySelectorAll<HTMLElement>('.orb-btn');
  const artemisHud = document.getElementById('artemis-hud');
  const artemisDateEl = document.getElementById('artemis-date');
  const artemisTitleEl = document.getElementById('artemis-title');
  const artemisDetailEl = document.getElementById('artemis-detail');
  const cinemaFlash = document.getElementById('cinema-flash');

  let systemPromptShownOnce = false;
  let systemPromptTimers: ReturnType<typeof setTimeout>[] = [];

  // Séquence Solo Leveling : barre flottante -> glitch pixelisé -> scission haut/bas + son.
  function openSystemPrompt() {
    systemPromptShownOnce = true;
    systemPromptTimers.forEach(clearTimeout);
    systemOverlay.classList.remove('visible', 'glitching');
    systemOverlay.classList.add('sysmsg-active');
    systemPromptTimers = [
      setTimeout(() => systemOverlay.classList.add('glitching'), 300),
      setTimeout(() => {
        systemOverlay.classList.remove('glitching');
        systemOverlay.classList.add('visible');
        audio.playSystemPing();
      }, 600),
    ];
  }
  function closeSystemPrompt() {
    systemPromptTimers.forEach(clearTimeout);
    systemOverlay.classList.remove('visible', 'glitching', 'sysmsg-active');
  }

  // Réponse NON : on recule la caméra (réutilise le zoom existant) puis fondu au noir,
  // sans toucher au reste de la navigation.
  const exitFade = document.getElementById('exit-fade');
  function exitSolarSystem() {
    closeSystemPrompt();
    targetZoom = 6.5;
    setTimeout(() => exitFade?.classList.add('active'), 150);
  }

  // Le message système ne se déclenche plus sur un délai fixe : il apparaît
  // quand le joueur, en explorant librement (scroll/glissement), approche la
  // Terre pendant le tour cosmique. Voir EARTH_TOUR_T plus bas, dans animate().

  on(document.getElementById('btn-system'), 'click', (e) => {
    e.stopPropagation();
    openSystemPrompt();
  });

  on(document.getElementById('btn-sys-no'), 'click', (e) => {
    e.stopPropagation();
    exitSolarSystem();
  });

  on(document.getElementById('btn-sys-yes'), 'click', (e) => {
    e.stopPropagation();
    closeSystemPrompt();
    startLunarVoyage();
  });

  function startLunarVoyage() {
    appPhase = 'flying_to_moon';
    callbacks.onPhaseChange?.(appPhase);
    flightT = 0;
    focusedIndex = -1;
    flightStartPos.copy(camPosCurrent);
    flightStartLook.copy(camLookCurrent);
    lunarReady = false;
    buildMode = null;
    lunarGameGrid.setGhost(null);

    artemisVoyage.setVisible(true);
    planetDock.classList.add('hidden');
    lunarBanner?.classList.remove('visible');
    lunarDock?.classList.remove('visible');
    artemisHud?.classList.add('visible');
    cinemaFlash?.classList.remove('active');
    audio.playWhoosh();
  }

  function returnToSpace() {
    appPhase = 'space';
    lunarReady = false;
    renderer.shadowMap.enabled = false;
    artemisVoyage.setVisible(false);
    artemisHud?.classList.remove('visible');
    cinemaFlash?.classList.remove('active');
    callbacks.onPhaseChange?.(appPhase);
    focusedIndex = -1;
    updateDockUI(-1);
    lunarBanner?.classList.remove('visible');
    lunarDock?.classList.remove('visible');
    planetDock?.classList.remove('hidden');
    camera.fov = 54;
    camera.updateProjectionMatrix();
    // Retour sur une vue large du système solaire.
    tourTarget = 0.4;
    tourProgress = 0.4;
    audio.playWhoosh();
  }

  /** Bascule vers le site lunaire détaillé et lance le déploiement. */
  function enterLunarBase() {
    if (appPhase === 'lunar_base') return;
    renderer.shadowMap.enabled = false;
    const levels = legacyLevelsFromPayload();
    if (!lunarScene.hasBase()) {
      let seen = false;
      try { seen = sessionStorage.getItem('infectium.entrySeen') === '1'; } catch { seen = false; }
      if (seen) {
        lunarScene.createBaseInstant(levels);
        lunarGameGrid.setVisible(true);
      } else {
        // Aucun plateau pendant l'arrivée : le module se pose sur le régolithe nu.
        lunarGameGrid.setVisible(false);
        lunarScene.startInitialDeployment(levels);
      }
      lunarScene.frameTier(lastGamePayload?.tier ?? 1);
      lunarGameGrid.sync(lastGamePayload?.buildings ?? []);
      lunarGameGrid.setTier(lastGamePayload?.tier ?? 1);
      lunarGameGrid.setDaylight(gameDaylight);
    } else {
      lunarScene.setLevels(levels, false);
      lunarScene.focusBuilding('overview');
      lunarGameGrid.setVisible(true);
    }
    appPhase = 'lunar_base';
    callbacks.onPhaseChange?.(appPhase);
    artemisHud?.classList.remove('visible');
    cinemaFlash?.classList.remove('active');
    planetDock?.classList.add('hidden');
    audio.playSystemPing();
  }

  function legacyLevelsFromPayload(): Partial<Record<BuildingType, number>> {
    const levels: Partial<Record<BuildingType, number>> = { hub: 1, solar: 1, purifier: 1, nursery: 1 };
    lastGamePayload?.buildings.forEach((b) => {
      if (!BUILDINGS[b.key]?.existing) return;
      levels[b.key as BuildingType] = Math.max(1, b.level);
    });
    return levels;
  }

  function requestUpgrade(key: string) {
    if (callbacks.onRequestUpgrade) {
      callbacks.onRequestUpgrade(key);
    } else {
      lunarScene.setLevel(key as BuildingType, (lunarScene.getLevels()[key as BuildingType] ?? 1) + 1, true);
    }
  }

  function updateDockUI(activeIdx) {
    dockButtons.forEach((btn) => {
      const val = btn.dataset.target;
      const match = (activeIdx === -1 && val === 'tour') || (Number(val) === activeIdx);
      btn.classList.toggle('active', match);
    });
  }

  function focusBody(index) {
    if (appPhase !== 'space') return;
    focusedIndex = index;
    updateDockUI(index);
    if (index === -1) {
      audio.playWhoosh();
    } else {
      targetZoom = 1.0;
      const b = bodies[index];
      triggerPulse(b.group.position, b.radius);
      audio.playPlanetChime(index);
      if (index === 0) sunMat.uniforms.uPulse.value = 1.0;
    }
  }

  dockButtons.forEach((btn) => {
    on(btn, 'click', (e) => {
      e.stopPropagation();
      const t = btn.dataset.target;
      focusBody(t === 'tour' ? -1 : Number(t));
    });
  });

  // Sound & Play/Pause Buttons
  const iconSoundOn = document.getElementById('icon-sound-on');
  const iconSoundOff = document.getElementById('icon-sound-off');
  on(document.getElementById('btn-sound'), 'click', (e) => {
    e.stopPropagation();
    audio.enabled = !audio.enabled;
    iconSoundOn.style.display = audio.enabled ? 'block' : 'none';
    iconSoundOff.style.display = audio.enabled ? 'none' : 'block';
    if (audio.enabled) audio.playPlanetChime(3);
  });

  const iconPause = document.getElementById('icon-pause');
  const iconPlay = document.getElementById('icon-play');
  on(document.getElementById('btn-play'), 'click', (e) => {
    e.stopPropagation();
    isPaused = !isPaused;
    iconPause.style.display = isPaused ? 'none' : 'block';
    iconPlay.style.display = isPaused ? 'block' : 'none';
  });

  // Wheel Navigation
  on(window, 'wheel', (e) => {
    e.preventDefault();
    if (appPhase === 'space') {
      if (focusedIndex === -1) {
        tourTarget = clamp01(tourTarget + e.deltaY * 0.00042);
      } else {
        targetZoom = Math.min(2.6, Math.max(0.55, targetZoom + e.deltaY * 0.001));
      }
    } else if (appPhase === 'lunar_base') {
      if (lunarScene.getViewMode() === 'build') lunarScene.zoomBy(e.deltaY);
    }
  }, { passive: false });

  on(window, 'keydown', (e) => {
    // Raccourci de démonstration : atterrissage immédiat sur la Lune.
    if (appPhase === 'space' && (e.key === 'l' || e.key === 'L')) {
      startLunarVoyage();
      flightT = 0.999;
      return;
    }
    if (appPhase === 'lunar_base' && e.key === 'Escape' && buildMode) {
      setBuildMode(null);
      callbacks.onCancelBuild?.();
      return;
    }
    if (appPhase !== 'space') return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      if (focusedIndex === -1) tourTarget = clamp01(tourTarget + 0.04);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      if (focusedIndex === -1) tourTarget = clamp01(tourTarget - 0.04);
    } else if (e.key === 'Escape' || e.key === ' ') {
      focusBody(-1);
    }
  });

  const raycaster = new THREE.Raycaster();
  let hoveredIndex = -1;

  on(renderer.domElement, 'contextmenu', (e) => {
    if (buildMode) e.preventDefault();
  });

  on(renderer.domElement, 'pointerdown', (e) => {
    if (e.button === 2 && buildMode) {
      e.preventDefault();
      setBuildMode(null);
      callbacks.onCancelBuild?.();
      return;
    }
    // Tactile : le pointermove n'existe pas avant le tap, on met à jour le
    // fantôme dès l'appui pour que le placement fonctionne au doigt.
    if (appPhase === 'lunar_base' && buildMode) {
      pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(pointerNDC, lunarScene.getCamera());
      callbacks.onGhostChange?.(lunarGameGrid.updateGhost(raycaster));
    }
    audio.init();
    // Mode astronaute : la souris pilote la caméra 3ᵉ personne (verrouillage du pointeur).
    if (appPhase === 'lunar_base' && lunarScene.getViewMode() !== 'build') return;
    isDragging = true;
    dragDist = 0;
    lastPointer = { x: e.clientX, y: e.clientY };
  });

  on(window, 'pointermove', (e) => {
    if (appPhase === 'lunar_base' && lunarScene.getViewMode() !== 'build') return;
    pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;

    if (appPhase === 'lunar_base' && buildMode && !isDragging) {
      raycaster.setFromCamera(pointerNDC, lunarScene.getCamera());
      const info = lunarGameGrid.updateGhost(raycaster);
      callbacks.onGhostChange?.(info);
      renderer.domElement.style.cursor = info ? (info.valid ? 'crosshair' : 'not-allowed') : 'crosshair';
      return;
    }

    if (isDragging) {
      const dx = e.clientX - lastPointer.x;
      const dy = e.clientY - lastPointer.y;
      dragDist += Math.hypot(dx, dy);
      lastPointer = { x: e.clientX, y: e.clientY };

      if (appPhase === 'lunar_base') {
        lunarScene.orbitBy(dx, dy);
      } else if (appPhase === 'space') {
        if (focusedIndex !== -1) {
          targetYaw -= dx * 0.007;
          targetPitch = Math.max(-1.25, Math.min(1.25, targetPitch + dy * 0.007));
        } else {
          tourTarget = clamp01(tourTarget - dy * 0.0016);
        }
      }
    } else if (appPhase === 'lunar_base') {
      raycaster.setFromCamera(pointerNDC, lunarScene.getCamera());
      const gridId = lunarGameGrid.pickBuildingId(raycaster);
      const legacy = gridId ? null : lunarScene.pickBuildingAt(pointerNDC, raycaster);
      renderer.domElement.style.cursor = gridId || legacy ? 'pointer' : 'grab';
    } else {
      raycaster.setFromCamera(pointerNDC, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        const obj = hits[0].object;
        if (appPhase === 'space' && obj.userData.bodyIndex !== undefined) {
          hoveredIndex = obj.userData.bodyIndex;
          renderer.domElement.style.cursor = 'pointer';
        } else {
          hoveredIndex = -1;
          renderer.domElement.style.cursor = 'grab';
        }
      } else {
        hoveredIndex = -1;
        renderer.domElement.style.cursor = 'grab';
      }
    }
  });

  on(window, 'pointerup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    if (dragDist < 8) {
      if (appPhase === 'lunar_base' && buildMode) {
        const info = lunarGameGrid.currentGhost();
        if (info?.valid) {
          callbacks.onPlaceRequest?.({ x: info.x, z: info.z });
        } else {
          callbacks.onPlaceRejected?.(info?.reason ?? 'no-target');
        }
        return;
      }
      pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;

      if (appPhase === 'lunar_base') {
        raycaster.setFromCamera(pointerNDC, lunarScene.getCamera());
        const gridId = lunarGameGrid.pickBuildingId(raycaster);
        if (gridId) {
          callbacks.onBuildingClick?.(gridId);
          return;
        }
        const legacy = lunarScene.pickBuildingAt(pointerNDC, raycaster);
        if (legacy) requestUpgrade(legacy);
        else callbacks.onBuildingClick?.(null);
        return;
      }

      raycaster.setFromCamera(pointerNDC, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        const obj = hits[0].object;
        if (appPhase === 'space' && obj.userData.bodyIndex !== undefined) {
          if (obj.userData.bodyIndex === 9) {
            // Clicking the Moon directly offers the Solo Leveling Mission!
            openSystemPrompt();
          } else {
            focusBody(obj.userData.bodyIndex);
          }
        }
      } else if (appPhase === 'space' && focusedIndex !== -1) {
        focusBody(-1);
      }
    }
  });

  on(window, 'resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    lunarScene.resize(window.innerWidth / window.innerHeight);
    renderer.setSize(window.innerWidth, window.innerHeight);
    starMat.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
  });

  // =========================================================================
  // 11. DYNAMIC TOUR WAYPOINTS + LUNAR FLIGHT TRAJECTORY
  // =========================================================================
  function getTourCameraPose(t, outPos, outLook) {
    const totalStops = 11;
    const scaled = t * (totalStops - 1);
    const i0 = Math.min(totalStops - 2, Math.floor(scaled));
    const frac = scaled - i0;
    const s = frac * frac * (3 - 2 * frac);

    const getStop = (idx) => {
      if (idx === 0) return { pos: new THREE.Vector3(0, 56, 138), look: new THREE.Vector3(0, -4, 0) };
      if (idx === 10) return { pos: new THREE.Vector3(-85, 68, -145), look: new THREE.Vector3(0, 0, 0) };
      const b = bodies[idx - 1];
      const bPos = b.group.position;
      const dirFromSun = b.index === 0 ? new THREE.Vector3(0.4, 0.25, 1.0).normalize() : bPos.clone().normalize();
      const side = new THREE.Vector3(-dirFromSun.z, 0, dirFromSun.x).normalize();
      const dist = b.viewDist * 1.18;
      const camOffset = dirFromSun.clone().multiplyScalar(-dist * 0.55)
        .add(side.multiplyScalar(dist * 0.85))
        .add(new THREE.Vector3(0, dist * 0.34, 0));
      return { pos: bPos.clone().add(camOffset), look: bPos.clone() };
    };

    const a = getStop(i0);
    const b = getStop(i0 + 1);
    outPos.lerpVectors(a.pos, b.pos, s);
    outLook.lerpVectors(a.look, b.look, s);
  }

  // =========================================================================
  // 12. MAIN ANIMATION LOOP
  // =========================================================================
  const clock = new THREE.Clock();
  const desiredCamPos = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();

  let rafId = 0;
  function animate() {
    rafId = requestAnimationFrame(animate);
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    const elapsed = clock.getElapsedTime();

    // ---------------------------------------------------------------------
    // SITE LUNAIRE : rendu dédié (caméra propre, terrain, chorégraphie)
    // ---------------------------------------------------------------------
    if (appPhase === 'lunar_base') {
      // Les animations lunaires utilisent le temps réel (borné) pour ne pas
      // durer une éternité sur une machine lente.
      const lunarDt = Math.min(rawDt, 0.5);
      lunarScene.update(lunarDt);
      lunarGameGrid.update(lunarDt, elapsed);
      renderer.render(lunarScene.getScene(), lunarScene.getActiveCamera());
      return;
    }

    nebulaMat.uniforms.uTime.value = elapsed;
    starMat.uniforms.uTime.value = elapsed;
    sunMat.uniforms.uTime.value = elapsed;
    sunMat.uniforms.uPulse.value = Math.max(0, sunMat.uniforms.uPulse.value - dt * 1.4);

    // Sur la base lunaire, on gèle le système solaire : sinon la Lune (et donc
    // le plateau de construction) défile sous le curseur pendant le placement.
    const simDt = isPaused ? 0 : dt;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (b.orbitRadius > 0) {
        b.angle += b.orbitSpeed * simDt;
        b.group.position.set(
          Math.cos(b.angle) * b.orbitRadius,
          Math.sin(b.angle * 2.0 + b.index) * 0.8,
          Math.sin(b.angle) * b.orbitRadius
        );
      }
      b.mesh.rotation.y += b.rotSpeed * simDt;
      const targetScale = (appPhase === 'space' && hoveredIndex === b.index) ? 1.07 : 1.0;
      b.mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.12);
    }

    for (let i = 0; i < dynamicUpdaters.length; i++) {
      dynamicUpdaters[i](simDt, elapsed);
    }
    // Les animations de la grille (apparition des modules, halo, lumière) doivent
    // continuer même quand la simulation spatiale est gelée sur la base.

    // Cycle jour / nuit : la lumière du site suit le Soleil lunaire.
    const targetLight = 1;
    lightSmooth += (targetLight - lightSmooth) * Math.min(1, dt * 1.6);
    sunLight.intensity = 4.2 * (0.3 + 0.7 * lightSmooth);
    ambientLight.intensity = 0.72 * (0.42 + 0.58 * lightSmooth);
    hemiLight.intensity = 0.55 * (0.45 + 0.55 * lightSmooth);

    // Keep Earth + Moon + Lunar Base world matrices synced before camera tracking!
    bodies[3].group.updateMatrixWorld(true);

    for (let i = 0; i < asteroidCount; i++) {
      const ad = asteroidData[i];
      ad.a += ad.speed * simDt;
      ad.rot.x += ad.tumble * dt;
      ad.rot.y += ad.tumble * 0.7 * dt;
      dummy.position.set(Math.cos(ad.a) * ad.r, ad.y, Math.sin(ad.a) * ad.r);
      dummy.rotation.copy(ad.rot);
      dummy.scale.setScalar(ad.scale);
      dummy.updateMatrix();
      asteroidBelt.setMatrixAt(i, dummy.matrix);
    }
    asteroidBelt.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < comets.length; i++) {
      const c = comets[i];
      c.timer += dt;
      if (!c.active && c.timer > 5.5 + i * 2.2) {
        launchComet(c);
      } else if (c.active) {
        c.pos.addScaledVector(c.vel, dt);
        c.group.position.copy(c.pos);
        if (c.pos.length() > 360) { c.active = false; c.timer = 0; }
      }
    }

    if (pulseLife > 0) {
      pulseLife = Math.max(0, pulseLife - dt * 1.4);
      const s = pulseScale * (1 + (1 - pulseLife) * 1.5);
      pulseRing.scale.set(s, s, 1);
      pulseRing.lookAt(camera.position);
      pulseRingMat.opacity = pulseLife * 0.85;
    }

    smoothParallax.lerp(pointerNDC, 0.05);

    if (appPhase === 'space') {
      if (focusedIndex === -1) {
        tourProgress += (tourTarget - tourProgress) * 0.065;
        getTourCameraPose(tourProgress, desiredCamPos, desiredLook);
        desiredCamPos.x += smoothParallax.x * 7.5;
        desiredCamPos.y += smoothParallax.y * 5.0;
        desiredLook.x += smoothParallax.x * 2.0;
        desiredLook.y += smoothParallax.y * 1.5;

        // Déclenchement par POSITION, pas par temps : la Terre est l'arrêt n°4
        // sur 11 (0 = vue large, 10 = profondeur d'espace) dans getTourCameraPose,
        // donc t ≈ 4/10 = 0.40. Le message système s'ouvre une seule fois quand
        // le joueur, en explorant librement au scroll/glissement, entre dans
        // cette fenêtre — jamais après un délai fixe.
        const EARTH_TOUR_T = 4 / 10;
        const EARTH_TOUR_WINDOW = 0.045;
        if (
          !systemPromptShownOnce &&
          appPhase === 'space' &&
          Math.abs(tourProgress - EARTH_TOUR_T) < EARTH_TOUR_WINDOW
        ) {
          openSystemPrompt();
        }
      } else {
        const b = bodies[focusedIndex];
        const bPos = b.group.position;
        orbitYaw += (targetYaw - orbitYaw) * 0.09;
        orbitPitch += (targetPitch - orbitPitch) * 0.09;
        orbitZoom += (targetZoom - orbitZoom) * 0.09;
        const r = b.viewDist * orbitZoom;
        const cosP = Math.cos(orbitPitch);
        desiredCamPos.set(
          bPos.x + r * cosP * Math.sin(orbitYaw) + smoothParallax.x * 0.8,
          bPos.y + r * Math.sin(orbitPitch) + smoothParallax.y * 0.8,
          bPos.z + r * cosP * Math.cos(orbitYaw)
        );
        desiredLook.copy(bPos);
      }
      camPosCurrent.lerp(desiredCamPos, 0.08);
      camLookCurrent.lerp(desiredLook, 0.1);
    }
    else if (appPhase === 'flying_to_moon') {
      // ~14s : 0->0.68 voyage Artemis II (1er->10 avril), 0.68->1.0 approche/alunissage
      flightT = Math.min(1, flightT + dt * 0.072);

      const earthPos = bodies[3].group.position;
      const moonWorld = new THREE.Vector3();
      moonMeshRef.getWorldPosition(moonWorld);

      if (flightT < 0.68) {
        // ---- PHASE A : Voyage Artemis II avec vaisseau Orion + trajectoire ----
        const artT = flightT / 0.68;

        artemisVoyage.updateTrajectory(
          earthPos, moonWorld, artT, elapsed,
          desiredCamPos, desiredLook
        );

        // Mise à jour du HUD télémétrique
        const mIdx = artemisVoyage.getMilestoneIndex(artT);
        const ms = ARTEMIS_MILESTONES[mIdx];
        if (artemisDateEl) artemisDateEl.textContent = `ARTEMIS II • ${ms.date}`;
        if (artemisTitleEl) artemisTitleEl.textContent = ms.label;
        if (artemisDetailEl) artemisDetailEl.textContent = ms.detail;

        // Flash optique juste avant l'approche lunaire
        if (flightT > 0.63) {
          cinemaFlash?.classList.add('active');
        }

        // Warp FOV pendant le voyage
        const warpPulse = Math.sin(clamp01(artT * 1.1) * Math.PI);
        camera.fov = 54 + warpPulse * 10;
        camera.updateProjectionMatrix();

      } else {
        // ---- PHASE B : Approche finale + atterrissage (réutilise la caméra existante) ----
        // Masquer le vaisseau Artemis lors du passage en approche
        if (artemisVoyage.group.visible) {
          artemisVoyage.setVisible(false);
          setTimeout(() => cinemaFlash?.classList.remove('active'), 180);
        }

        const landT = (flightT - 0.68) / 0.32;

        // Mise à jour HUD pendant l'alunissage
        if (artemisDateEl) artemisDateEl.textContent = 'ALUNISSAGE • CRATÈRE';
        if (artemisTitleEl) {
          artemisTitleEl.textContent = landT < 0.5
            ? 'Descente propulsée sur le régolithe'
            : 'Stabilisation & sortie — Découverte de la base';
        }
        if (artemisDetailEl) {
          artemisDetailEl.textContent = landT < 0.5
            ? 'Souffle des rétrofusées et poussière lunaire'
            : 'Module posé, base abandonnée en vue';
        }

        // Caméra : approche directe du site lunaire (Lune nue, sans base).
        const landedPos = new THREE.Vector3();
        const landedLook = new THREE.Vector3();
        const siteNormal = new THREE.Vector3(-0.36, 0.933, 0).normalize();
        const siteWorld = moonWorld.clone().addScaledVector(siteNormal, 0.95 * 1.01);
        landedLook.copy(siteWorld);
        landedPos.copy(siteWorld)
          .addScaledVector(siteNormal, 1.15)
          .add(new THREE.Vector3(0.45, 0.35, 0.55));

        const moonOrbitPos = moonWorld.clone().add(
          moonWorld.clone().sub(earthPos).normalize().multiplyScalar(3.2)
        ).add(new THREE.Vector3(0, 1.8, 1.4));
        const s = landT * landT * (3 - 2 * landT);
        desiredCamPos.lerpVectors(moonOrbitPos, landedPos, s);
        desiredLook.lerpVectors(moonWorld, landedLook, s);

        // Warp FOV à l'atterrissage
        camera.fov = 54 + (1 - landT) * 8;
        camera.updateProjectionMatrix();
      }

      camPosCurrent.lerp(desiredCamPos, 0.16);
      camLookCurrent.lerp(desiredLook, 0.18);

      if (flightT >= 1 && !lunarReady) {
        lunarReady = true;
        // Fondu optique puis bascule sur le site lunaire détaillé, où démarre
        // la chorégraphie d'implantation (hub → énergie → eau → serre → couloirs).
        cinemaFlash?.classList.add('active');
        window.setTimeout(() => enterLunarBase(), 480);
      }
    }

    camera.position.copy(camPosCurrent);
    camera.lookAt(camLookCurrent);

    renderer.render(scene, camera);
  }

  animate();

  const dispose = () => {
    cancelAnimationFrame(rafId);
    systemPromptTimers.forEach(clearTimeout);
    disposers.forEach((d) => d());
    lunarGameGrid.dispose();
    lunarScene.dispose();
    artemisVoyage.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };

  function setBuildMode(def: GhostDef | null) {
    buildMode = def;
    lunarGameGrid.setGhost(def);
    renderer.domElement.style.cursor = def ? 'crosshair' : 'grab';
    if (!def) callbacks.onGhostChange?.(null);
  }

  let syncedTier = 1;

  function syncGame(payload: GameSyncPayload) {
    lastGamePayload = payload;
    if (payload.tier !== syncedTier) {
      syncedTier = payload.tier;
      lunarScene.frameTier(payload.tier);
    }
    lunarGameGrid.sync(payload.buildings);
    lunarGameGrid.setTier(payload.tier);
    lunarGameGrid.setDaylight(payload.daylight);
    lunarGameGrid.select(payload.selectedId);
    gameDaylight = payload.daylight;
    lunarScene.setDaylight(payload.daylight);
    lunarScene.setAstronautObstacles([
      ...payload.buildings.map((b) => ({ x: b.x, z: b.z, w: BUILDINGS[b.key]?.w ?? 1, d: BUILDINGS[b.key]?.d ?? 1 })),
      ...BLOCKED_RECTS,
    ]);

    // Applique les niveaux des 4 modules d'origine. Une hausse déclenche
    // l'animation d'extension du bâtiment (composants qui viennent se fixer).
    if (lunarScene.hasBase() && !lunarScene.isDeployingNow()) {
      const current = lunarScene.getLevels();
      payload.buildings.forEach((b) => {
        if (!BUILDINGS[b.key]?.existing) return;
        const type = b.key as BuildingType;
        if (b.level > (current[type] ?? 1)) {
          lunarScene.setLevel(type, Math.min(4, b.level), true);
          lunarScene.focusBuilding(type);
          audio.playRebuildFanfare(b.level);
        }
      });
    }
  }

  return {
    dispose,
    upgradeBuilding: (key: string) => {
      lunarScene.setLevel(key as BuildingType, (lunarScene.getLevels()[key as BuildingType] ?? 1) + 1, true);
    },
    getLevels: () => (lunarScene.hasBase() ? { ...lunarScene.getLevels() } : {}),
    getPhase: () => appPhase,
    syncGame,
    setBuildMode,
    returnToSpace,
    setViewMode: (mode, room) => {
      lunarScene.setViewMode(mode, room ?? 'hub');
      if (mode !== 'build') setBuildMode(null);
      lunarGameGrid.setVisible(mode === 'build' && lunarScene.hasBase() && !lunarScene.isDeployingNow());
      renderer.domElement.style.cursor = mode === 'build' ? 'grab' : 'default';
    },
    getViewMode: () => lunarScene.getViewMode(),
    getAstronautSnapshot: () => lunarScene.getAstronautSnapshot(),
    setAstronautSettings: (s) => lunarScene.setAstronautSettings(s),
    setAstronautInputEnabled: (enabled) => lunarScene.astronaut.setInputEnabled(enabled),
    setMoveStick: (x, y) => lunarScene.astronaut.setMoveStick(x, y),
    setLookStick: (x, y) => lunarScene.astronaut.setLookStick(x, y),
    setSpeedFactor: (f) => lunarScene.astronaut.setSpeedFactor(f),
    astronautInteract: () => lunarScene.astronaut.triggerInteraction(),
    astronautJump: () => lunarScene.astronaut.jump(),
    astronautSprint: (on) => lunarScene.astronaut.setSprint(on),
    resetBase: () => {
      lunarScene.reset();
      lunarGameGrid.setTier(1);
      lunarGameGrid.sync([]);
      lunarGameGrid.setGhost(null);
      lunarGameGrid.setVisible(false);
      buildMode = null;
      gameDaylight = 1;
      lunarReady = false;
      },
    resumeMission: (levels, tier = 1) => {
      renderer.shadowMap.enabled = false;
      lunarScene.createBaseInstant(levels);
      lunarScene.frameTier(tier);
      lunarGameGrid.sync(lastGamePayload?.buildings ?? []);
      lunarGameGrid.setTier(tier);
      lunarGameGrid.setDaylight(gameDaylight);
      lunarGameGrid.setVisible(true);
      appPhase = 'lunar_base';
      lunarReady = true;
      try { sessionStorage.setItem('infectium.entrySeen', '1'); } catch { /* ignore */ }
      callbacks.onPhaseChange?.(appPhase);
      planetDock?.classList.add('hidden');
      artemisHud?.classList.remove('visible');
    },
    restartMission: (levels) => {
      renderer.shadowMap.enabled = false;
      try { sessionStorage.removeItem('infectium.entrySeen'); } catch { /* ignore */ }
      lunarScene.reset();
      lunarGameGrid.setVisible(false);
      lunarGameGrid.sync(lastGamePayload?.buildings ?? []);
      lunarScene.startInitialDeployment(levels);
      appPhase = 'lunar_base';
        lunarReady = true;
      callbacks.onPhaseChange?.(appPhase);
      planetDock?.classList.add('hidden');
      artemisHud?.classList.remove('visible');
    },
  };
}
