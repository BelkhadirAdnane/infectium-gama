import * as THREE from 'three';
import { fbm3, makeCraters } from '../noise';
import { generatePlanetTextures } from '../textures';
import { BuildingBase, BuildingType } from './BuildingBase';
import { HubBuilding } from './buildings/HubBuilding';
import { SolarBuilding } from './buildings/SolarBuilding';
import { PurifierBuilding } from './buildings/PurifierBuilding';
import { NurseryBuilding } from './buildings/NurseryBuilding';
import { PressurizedCorridor } from './CorridorSystem';
import { LunarMaterials } from './LunarMaterials';
import { AstronautController, AstronautSnapshot, ObstacleRect, RoomId, ViewMode } from '../astronaut';
import { ControlSettings } from '../controls';

export interface LunarStateSnapshot {
  levels: Record<BuildingType, number>;
  deploying: boolean;
  banner: string;
  /** 0..1 pendant la chorégraphie d'implantation. */
  progress: number;
}

export class LunarBaseScene {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;

  private buildings = new Map<BuildingType, BuildingBase>();
  private corridors: Array<{ mesh: PressurizedCorridor; triggerAt: number; started: boolean }> = [];
  private padMarkers = new THREE.Group();

  private sequenceTime = 0;
  private isDeploying = false;
  private elapsed = 0;

  // Contrôles orbitaux amortis
  private yaw = 0.58;
  private pitch = 0.55;
  private distance = 42;
  private targetYaw = 0.58;
  private targetPitch = 0.55;
  private targetDistance = 42;
  private lookCurrent = new THREE.Vector3(0, 2.0, -2.0);
  private lookTarget = new THREE.Vector3(0, 2.0, -2.0);

  private onStateChange?: (snap: LunarStateSnapshot) => void;
  private bannerText = 'Implantation du secteur Shackleton-01';

  private terrainGeo?: THREE.BufferGeometry;
  private sunLight!: THREE.DirectionalLight;
  private earthShine!: THREE.HemisphereLight;
  private daylight = 1;
  private viewportAspect = 1;
  private lander!: THREE.Group;
  private landerFlame!: THREE.Mesh;
  private landerScorch!: THREE.Mesh;
  private landerStartY = 28;
  private landingDuration = 4.2;
  private landingDone = false;
  private rockInstanced?: THREE.InstancedMesh;
  private earthMesh?: THREE.Mesh;
  private siteProps?: THREE.Group;
  private dish?: THREE.Group;
  private beaconMats: THREE.MeshStandardMaterial[] = [];
  private roverWheels: THREE.Mesh[] = [];
  private dust?: THREE.Points;
  private dustBase?: Float32Array;
  private siteLights: THREE.PointLight[] = [];
  readonly astronaut: AstronautController;

  constructor(
    aspect: number,
    onStateChange?: (snap: LunarStateSnapshot) => void,
    onAstronautInteract?: (id: string, info?: { cooldown?: number }) => void
  ) {
    LunarMaterials.init();
    this.onStateChange = onStateChange;
    this.viewportAspect = aspect;
    this.camera = new THREE.PerspectiveCamera(46, aspect, 0.2, 600);
    if (aspect < 0.8) {
      this.distance = 80;
      this.targetDistance = 80;
    }
    this.scene.background = new THREE.Color(0x020308);
    this.scene.fog = new THREE.FogExp2(0x03040a, 0.0042);

    this.setupLighting();
    this.buildSkyAndEarth();
    this.buildLunarTerrain();
    this.buildSiteMarkers();
    this.buildLander();
    this.buildSiteProps();
    this.buildDust();
    this.astronaut = new AstronautController(this.scene, aspect, {
      onInteract: (id, info) => onAstronautInteract?.(id, info),
    });
  }

  private setupLighting() {
    this.sunLight = new THREE.DirectionalLight(0xfff6e9, 3.0);
    const sun = this.sunLight;
    sun.position.set(38, 22, 26);
    // Ombres douces désactivées : sur un plateau de 32 m, la carte d'ombre
    // provoque de l'auto-ombrage (bandes noires) très visible. L'éclairage
    // directionnel + hémisphérique suffit et reste net sur toutes les machines.
    sun.castShadow = false;

    // Faible lumière cendrée terrestre pour garder les ombres lunaires réalistes
    this.earthShine = new THREE.HemisphereLight(0x6d84a8, 0x191a1f, 0.38);
    this.scene.add(sun, this.earthShine);
  }

  private buildSkyAndEarth() {
    // Étoiles sobres haute netteté
    const count = 1400;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 180 + Math.random() * 160;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 0.92 + 0.05);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xdce6f5, size: 0.75, sizeAttenuation: true })
    );
    this.scene.add(stars);

    // Terre basse sur l'horizon lunaire
    const earthTex = generatePlanetTextures('earth', 256, 128);
    this.earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(7.2, 32, 24),
      new THREE.MeshStandardMaterial({
        map: earthTex.map,
        roughness: 0.75,
        emissive: 0x0d213d,
        emissiveIntensity: 0.35,
      })
    );
    this.earthMesh.position.set(-48, 28, -110);
    this.scene.add(this.earthMesh);
  }

  private terrainHeight(x: number, z: number) {
    const r = Math.hypot(x, z);
    if (r < 35) return 0; // Plateforme nivelée : base + plateau constructible (jusqu'à 48 m)
    const blend = THREE.MathUtils.smoothstep(r, 35, 46);
    const hills = (fbm3(x * 0.032, z * 0.032, 1.4, 3) - 0.48) * 5.2;
    const rim = THREE.MathUtils.smoothstep(r, 42, 68) * 7.5;
    return (hills + rim) * blend;
  }

  private buildLunarTerrain() {
    const geo = new THREE.PlaneGeometry(150, 150, 84, 84);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;

    const craters = makeCraters(24, 2.2, 7.5, 505);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      let y = this.terrainHeight(x, z);

      const distCenter = Math.hypot(x, z);
      if (distCenter > 22) {
        for (let c = 0; c < craters.length; c++) {
          const cx = craters[c].x * 55;
          const cz = craters[c].z * 55;
          const cr = craters[c].r * 1.1;
          const d = Math.hypot(x - cx, z - cz) / cr;
          if (d < 1.35) {
            if (d < 1.0) y -= (1 - d * d) * 0.85;
            else y += Math.sin(((d - 1.0) / 0.35) * Math.PI) * 0.28;
          }
        }
      }
      pos.setY(i, y);
    }
    geo.computeVertexNormals();
    this.terrainGeo = geo;

    const ground = new THREE.Mesh(geo, LunarMaterials.materials.regolith);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Quelques roches basaltiques légères hors de la zone d'implantation
    const rockGeo = new THREE.DodecahedronGeometry(0.45, 0);
    const rockCount = 70;
    const inst = new THREE.InstancedMesh(rockGeo, LunarMaterials.materials.rock, rockCount);
    const dummy = new THREE.Object3D();
    let placed = 0;
    for (let i = 0; i < 200 && placed < rockCount; i++) {
      const angle = i * 2.39996;
      const rad = 21 + ((i * 7.3) % 34);
      const rx = Math.cos(angle) * rad;
      const rz = Math.sin(angle) * rad;
      const ry = this.terrainHeight(rx, rz);
      dummy.position.set(rx, ry + 0.08, rz);
      dummy.rotation.set(i * 0.7, i * 1.3, 0);
      dummy.scale.set(0.6 + (i % 5) * 0.25, 0.45 + (i % 3) * 0.2, 0.7 + (i % 4) * 0.2);
      dummy.updateMatrix();
      inst.setMatrixAt(placed++, dummy.matrix);
    }
    inst.castShadow = true;
    inst.receiveShadow = true;
    this.rockInstanced = inst;
    this.scene.add(inst);
  }

  /** Décors du site : antenne, balises, caisses, rover — profondeur et échelle. */
  private buildSiteProps() {
    const g = new THREE.Group();
    g.name = 'site-props';
    const hull = LunarMaterials.materials.hullWhite as THREE.MeshStandardMaterial;
    const titanium = LunarMaterials.materials.titanium as THREE.MeshStandardMaterial;
    const dark = LunarMaterials.materials.frameDark as THREE.MeshStandardMaterial;
    const hazard = LunarMaterials.materials.hazard as THREE.MeshStandardMaterial;

    // --- Antenne de communication ---
    const dishPivot = new THREE.Group();
    dishPivot.position.set(8.5, 0, 9.5);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 2.2, 10), titanium);
    mast.position.y = 1.1;
    dishPivot.add(mast);
    const dishGrp = new THREE.Group();
    dishGrp.position.y = 2.3;
    dishGrp.rotation.x = -0.7;
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42),
      new THREE.MeshStandardMaterial({ color: 0xe8edf3, roughness: 0.35, metalness: 0.65, side: THREE.DoubleSide })
    );
    dishGrp.add(dish);
    const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 8), dark);
    feed.position.y = 0.55;
    dishGrp.add(feed);
    dishPivot.add(dishGrp);
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.7, 6), dark);
      const a = (i / 3) * Math.PI * 2;
      leg.position.set(Math.cos(a) * 0.7, 0.32, Math.sin(a) * 0.7);
      dishPivot.add(leg);
    }
    dishPivot.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        (o as THREE.Mesh).castShadow = true;
        (o as THREE.Mesh).receiveShadow = true;
      }
    });
    g.add(dishPivot);
    this.dish = dishGrp;

    // --- Caisses de ravitaillement ---
    const crateSpots: Array<[number, number, number, number]> = [
      [-3.2, 0, 10.2, 0.2],
      [-1.9, 0, 10.6, -0.35],
      [-2.6, 0.85, 10.4, 0.1],
    ];
    crateSpots.forEach(([x, y, z, ry]) => {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.9), hull);
      crate.position.set(x, y + 0.4, z);
      crate.rotation.y = ry;
      crate.castShadow = true;
      crate.receiveShadow = true;
      g.add(crate);
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.12, 0.92), hazard);
      band.position.set(x, y + 0.42, z);
      band.rotation.y = ry;
      g.add(band);
    });

    // --- Balises de périmètre ---
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = 18.5;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.5, 6), dark);
      pole.position.set(Math.cos(a) * r, 0.75, Math.sin(a) * r);
      pole.castShadow = true;
      g.add(pole);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x8fe8ff,
        emissive: 0x2fc8ee,
        emissiveIntensity: 1,
        roughness: 0.3,
      });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), mat);
      lamp.position.set(Math.cos(a) * r, 1.55, Math.sin(a) * r);
      g.add(lamp);
      this.beaconMats.push(mat);
    }

    // --- Rover d'exploration ---
    const rover = new THREE.Group();
    rover.position.set(14.5, 0, 8.5);
    rover.rotation.y = -0.6;
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 1.2), hull);
    body.position.y = 0.72;
    body.castShadow = true;
    rover.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 1.0), new THREE.MeshStandardMaterial({ color: 0x1a2b3a, roughness: 0.2, metalness: 0.7 }));
    cab.position.set(0.55, 1.1, 0);
    rover.add(cab);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 1.0), LunarMaterials.materials.solarCell as THREE.Material);
    panel.position.set(-0.4, 1.08, 0);
    panel.rotation.z = 0.06;
    rover.add(panel);
    for (const [x, z] of [[-0.7, -0.65], [0.7, -0.65], [-0.7, 0.65], [0.7, 0.65], [0, -0.65], [0, 0.65]] as const) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 12), dark);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.36, z);
      wheel.castShadow = true;
      rover.add(wheel);
      this.roverWheels.push(wheel);
    }
    g.add(rover);

    // Lumières de site : elles prennent le relais la nuit lunaire.
    const lightSpots: Array<[number, number, number, number]> = [
      [4, 3.0, 8, 0x9fd8ff],
      [-5, 2.6, 6.5, 0xffd9a0],
      [13.5, 2.4, 6.5, 0x8fe8ff],
    ];
    for (const [x, y, z, color] of lightSpots) {
      const light = new THREE.PointLight(color, 0, 18, 2);
      light.position.set(x, y, z);
      g.add(light);
      this.siteLights.push(light);
    }

    this.scene.add(g);
    this.siteProps = g;
  }

  /** Poussière de régolithe en suspension : profondeur et échelle du site. */
  private buildDust() {
    const count = 180;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 22;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = 0.2 + Math.random() * 6.5;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }
    this.dustBase = positions.slice();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xbfd6ea,
      size: 0.06,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.dust = new THREE.Points(geo, mat);
    this.scene.add(this.dust);
  }

  private buildSiteMarkers() {
    this.padMarkers.clear();
    const spots: Array<[number, number, number, number]> = [
      [0, 0, 12, 8],
      [10, 0, 6, 6],
      [-10, 0, 6, 6],
      [0, -9, 8, 6],
    ];
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x3ec8e8,
      transparent: true,
      opacity: 0.45,
    });
    for (const [x, z, w, d] of spots) {
      const hw = w * 0.5, hd = d * 0.5;
      const pts = [
        new THREE.Vector3(x - hw, 0.04, z - hd),
        new THREE.Vector3(x + hw, 0.04, z - hd),
        new THREE.Vector3(x + hw, 0.04, z + hd),
        new THREE.Vector3(x - hw, 0.04, z + hd),
        new THREE.Vector3(x - hw, 0.04, z - hd),
      ];
      this.padMarkers.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    }
    this.scene.add(this.padMarkers);
  }


  // -------------------------------------------------------------------
  // Module lunaire : arrivée directe sur le régolithe, sans base ni plateau
  // -------------------------------------------------------------------
  private buildLander() {
    const g = new THREE.Group();
    g.position.set(-9.5, this.landerStartY, 11.5);

    const bodyMat = LunarMaterials.materials.hullWhite as THREE.MeshStandardMaterial;
    const dark = LunarMaterials.materials.frameDark as THREE.MeshStandardMaterial;
    const titanium = LunarMaterials.materials.titanium as THREE.MeshStandardMaterial;

    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.85, 3.4, 18), bodyMat);
    body.position.y = 3.0;
    g.add(body);

    const upper = new THREE.Mesh(new THREE.CylinderGeometry(1.22, 1.55, 1.15, 16), titanium);
    upper.position.y = 5.1;
    g.add(upper);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.22, 1.55, 16), bodyMat);
    nose.position.y = 6.45;
    g.add(nose);

    const windowMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.5, 0.12),
      LunarMaterials.materials.viewportGlow as THREE.MeshStandardMaterial
    );
    windowMesh.position.set(0, 4.35, 1.55);
    g.add(windowMesh);

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 3.3, 8), dark);
      leg.position.set(Math.cos(a) * 1.9, 1.7, Math.sin(a) * 1.9);
      leg.rotation.z = Math.cos(a) * 0.32;
      leg.rotation.x = -Math.sin(a) * 0.32;
      g.add(leg);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.14, 10), titanium);
      foot.position.set(Math.cos(a) * 2.5, 0.08, Math.sin(a) * 2.5);
      g.add(foot);
    }

    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 1.05, 0.8, 14), dark);
    engine.position.y = 0.95;
    g.add(engine);

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.62, 2.6, 14),
      new THREE.MeshBasicMaterial({
        color: 0xffc46b,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    flame.rotation.x = Math.PI;
    flame.position.y = -0.8;
    g.add(flame);
    this.landerFlame = flame;

    const scorch = new THREE.Mesh(
      new THREE.CircleGeometry(3.1, 28),
      new THREE.MeshBasicMaterial({ color: 0x1b1714, transparent: true, opacity: 0.5, depthWrite: false })
    );
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.set(-9.5, 0.02, 11.5);
    scorch.visible = false;
    this.landerScorch = scorch;
    this.scene.add(scorch);
    this.lander = g;
    this.scene.add(g);
  }

  private updateLander() {
    if (!this.lander) return;
    if (this.landingDone) {
      this.lander.position.y = 0;
      this.landerFlame.visible = false;
      this.landerScorch.visible = true;
      return;
    }
    const t = THREE.MathUtils.clamp(this.sequenceTime / this.landingDuration, 0, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    this.lander.position.y = this.landerStartY * (1 - ease);
    this.landerFlame.visible = t < 0.98;
    this.landerFlame.scale.set(1, 0.7 + Math.sin(this.elapsed * 34) * 0.25, 1);
    this.landerScorch.visible = t > 0.9;
    if (t >= 1) this.landingDone = true;
  }

  startInitialDeployment(initialLevels?: Partial<Record<BuildingType, number>>) {
    this.clearBase();

    const hub = new HubBuilding(1, true);
    hub.position.set(0, 0, 0);

    const solar = new SolarBuilding(1, true);
    solar.position.set(10, 0, 0);

    const purifier = new PurifierBuilding(1, true);
    purifier.position.set(-10, 0, 0);

    const nursery = new NurseryBuilding(1, true);
    nursery.position.set(0, 0, -9);

    this.buildings.set('hub', hub);
    this.buildings.set('solar', solar);
    this.buildings.set('purifier', purifier);
    this.buildings.set('nursery', nursery);

    if (initialLevels) {
      (['hub', 'solar', 'purifier', 'nursery'] as BuildingType[]).forEach((type) => {
        const lvl = initialLevels[type];
        const b = this.buildings.get(type);
        if (b && lvl && lvl > 1) b.setLevel(Math.min(4, lvl), false);
      });
    }

    hub.buildDuration = 2.6;
    solar.buildDuration = 2.4;
    purifier.buildDuration = 2.4;
    nursery.buildDuration = 2.6;

    // Chaque bâtiment reste caché tant que son créneau n'a pas démarré
    hub.visible = false;
    solar.visible = false;
    purifier.visible = false;
    nursery.visible = false;

    this.scene.add(hub, solar, purifier, nursery);

    // Couloirs pressurisés créés prêts, déclenchés juste après l'ancrage de chaque module
    const cSolar = new PressurizedCorridor(hub, solar, true);
    const cPurifier = new PressurizedCorridor(hub, purifier, true);
    const cNursery = new PressurizedCorridor(hub, nursery, true);
    cSolar.visible = false;
    cPurifier.visible = false;
    cNursery.visible = false;
    this.scene.add(cSolar, cPurifier, cNursery);

    this.corridors = [
      { mesh: cSolar, triggerAt: 7.3, started: false },
      { mesh: cPurifier, triggerAt: 8.2, started: false },
      { mesh: cNursery, triggerAt: 9.1, started: false },
    ];

    this.sequenceTime = 0;
    this.isDeploying = true;
    this.padMarkers.visible = true;
    this.landingDone = false;
    this.bannerText = 'Phase 0/3 — Descente du module lunaire vers le site Shackleton-01';
    if (this.lander) this.lander.position.y = this.landerStartY;
    if (this.landerFlame) this.landerFlame.visible = true;
    if (this.landerScorch) this.landerScorch.visible = false;

    // Plan d'ensemble fluide pendant l'implantation
    this.yaw = -0.35;
    this.targetYaw = 0.52;
    this.pitch = 0.44;
    this.targetPitch = 0.36;
    const portrait = this.viewportAspect < 0.8;
    this.distance = portrait ? 80 : 48;
    this.targetDistance = portrait ? 80 : 40;
    this.lookTarget.set(0, 2.0, -2.0);

    this.bannerText = 'Phase 1/3 — Ancrage du module d’habitation central';
    this.emitState();
  }

  private disposeSiteProps() {
    if (!this.siteProps) return;
    this.scene.remove(this.siteProps);
    this.siteProps.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry?.dispose?.();
    });
    this.siteProps = undefined;
    this.dish = undefined;
    this.beaconMats = [];
    this.roverWheels = [];
  }

  private clearBase() {
    this.buildings.forEach((b) => {
      this.scene.remove(b);
      b.dispose();
    });
    this.buildings.clear();
    this.corridors.forEach((c) => {
      this.scene.remove(c.mesh);
      c.mesh.dispose();
    });
    this.corridors = [];
  }

  upgradeBuilding(type: BuildingType) {
    const b = this.buildings.get(type);
    if (!b || b.buildProgress < 0.99) return;
    if (b.level < 4) {
      b.setLevel(b.level + 1, true);
      this.focusBuilding(type);
      this.bannerText = `Module ${type.toUpperCase()} évolué au niveau ${b.level}`;
      this.emitState();
    }
  }

  upgradeAll() {
    let anyUpgraded = false;
    this.buildings.forEach((b) => {
      if (b.level < 4 && b.buildProgress >= 0.99) {
        b.setLevel(b.level + 1, true);
        anyUpgraded = true;
      }
    });
    if (anyUpgraded) {
      this.focusBuilding('overview');
      this.bannerText = 'Extension globale de la colonie lunaire';
      this.emitState();
    }
  }

  focusBuilding(target: BuildingType | 'overview') {
    if (target === 'overview') {
      this.lookTarget.set(0, 2.0, -2.0);
      this.targetDistance = 40;
      this.targetPitch = 0.55;
      return;
    }
    const b = this.buildings.get(target);
    if (!b) return;
    this.lookTarget.set(b.position.x, 1.9, b.position.z);
    this.targetDistance = target === 'hub' ? 22 : 17;
    this.targetPitch = 0.38;
  }

  orbitBy(dx: number, dy: number) {
    this.targetYaw -= dx * 0.006;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + dy * 0.005, 0.14, 1.15);
  }

  zoomBy(delta: number) {
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + delta * 0.02, 12, 70);
  }

  pickBuildingAt(ndc: THREE.Vector2, raycaster: THREE.Raycaster): BuildingType | null {
    raycaster.setFromCamera(ndc, this.camera);
    const roots = Array.from(this.buildings.values());
    const hits = raycaster.intersectObjects(roots, true);
    if (hits.length === 0) return null;
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj) {
      if ((obj as BuildingBase).buildingType) {
        return (obj as BuildingBase).buildingType;
      }
      obj = obj.parent;
    }
    return null;
  }

  update(dt: number) {
    this.elapsed += dt;

    if (this.earthMesh) {
      this.earthMesh.rotation.y += dt * 0.025;
    }
    // Antenne de communication : balayage lent.
    if (this.dish) this.dish.rotation.y += dt * 0.16;
    // Balises de périmètre : clignotement doux.
    this.beaconMats.forEach((m, i) => {
      m.emissiveIntensity = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(this.elapsed * 1.8 + i * 1.3));
    });
    // Rover : roues en rotation continue très lente (patrouille).
    this.roverWheels.forEach((w) => { w.rotation.x += dt * 0.4; });

    // Poussière : dérive lente et continue, sans allocation par frame.
    if (this.dust && this.dustBase) {
      const attr = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        const bx = this.dustBase[i * 3];
        const by = this.dustBase[i * 3 + 1];
        const bz = this.dustBase[i * 3 + 2];
        attr.setX(i, bx + Math.sin(this.elapsed * 0.06 + i * 0.7) * 0.7);
        attr.setY(i, 0.2 + (((by - 0.2 + this.elapsed * 0.05 + i * 0.013) % 6.5) + 6.5) % 6.5);
        attr.setZ(i, bz + Math.cos(this.elapsed * 0.05 + i * 0.4) * 0.7);
      }
      attr.needsUpdate = true;
    }

    if (this.isDeploying) {
      this.sequenceTime += dt;
      this.updateLander();

      if (!this.landingDone) {
        this.bannerText = this.sequenceTime < 2.2
          ? 'Phase 0/3 — Descente propulsée du module lunaire'
          : 'Phase 0/3 — Contact imminent avec le régolithe';
      }

      const schedule: Array<[BuildingType, number, string]> = [
        ['hub', 4.3, 'Phase 1/3 — Assemblage de l’habitat central (12 × 8 × 4 m)'],
        ['solar', 5.8, 'Phase 2/3 — Déploiement énergétique & panneaux PV'],
        ['purifier', 6.9, 'Phase 2/3 — Station de purification & réservoir pressurisé'],
        ['nursery', 7.9, 'Phase 3/3 — Serre biologique & chambres hydroponiques'],
      ];

      for (const [type, startAt, msg] of schedule) {
        const b = this.buildings.get(type);
        if (b && !b.visible && this.sequenceTime >= startAt) {
          b.visible = true;
          b.startConstruction(b.buildDuration);
          this.bannerText = msg;
          this.emitState();
        }
      }

      for (const c of this.corridors) {
        if (!c.started && this.sequenceTime >= c.triggerAt) {
          c.started = true;
          c.mesh.visible = true;
          this.bannerText = 'Phase 3/3 — Pressurisation des couloirs inter-modules';
          this.emitState();
        }
        if (c.started) c.mesh.update(dt);
      }

      if (this.sequenceTime >= 11.8) {
        this.isDeploying = false;
        this.padMarkers.visible = false;
        this.bannerText = 'Base lunaire Niveau 1 opérationnelle';
        this.emitState();
      }
    }

    this.buildings.forEach((b) => {
      if (b.visible) b.update(dt, this.elapsed);
    });
    if (!this.isDeploying) {
      this.corridors.forEach((c) => c.mesh.update(dt));
    }

    // Mode astronaute : la caméra 3ᵉ personne remplace la caméra orbitale.
    if (this.astronaut.getMode() !== 'build') {
      this.astronaut.update(dt);
      return;
    }

    // Mouvement de caméra amorti (60 FPS fluide)
    const damp = 1 - Math.exp(-5.5 * dt);
    this.yaw = THREE.MathUtils.lerp(this.yaw, this.targetYaw, damp);
    this.pitch = THREE.MathUtils.lerp(this.pitch, this.targetPitch, damp);
    this.distance = THREE.MathUtils.lerp(this.distance, this.targetDistance, damp);
    this.lookCurrent.lerp(this.lookTarget, damp);

    const cosP = Math.cos(this.pitch);
    this.camera.position.set(
      this.lookCurrent.x + this.distance * cosP * Math.sin(this.yaw),
      this.lookCurrent.y + this.distance * Math.sin(this.pitch),
      this.lookCurrent.z + this.distance * cosP * Math.cos(this.yaw)
    );
    this.camera.lookAt(this.lookCurrent);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.viewportAspect = aspect;
    this.astronaut.resize(aspect);
    if (aspect < 0.8) {
      this.targetDistance = Math.max(this.targetDistance, 78);
      this.targetPitch = Math.max(this.targetPitch, 0.5);
    }
  }

  getSnapshot(): LunarStateSnapshot {
    return {
      levels: {
        hub: this.buildings.get('hub')?.level ?? 1,
        solar: this.buildings.get('solar')?.level ?? 1,
        purifier: this.buildings.get('purifier')?.level ?? 1,
        nursery: this.buildings.get('nursery')?.level ?? 1,
      },
      deploying: this.isDeploying,
      banner: this.bannerText,
      progress: this.isDeploying ? Math.min(1, this.sequenceTime / 11.8) : 1,
    };
  }

  private emitState() {
    this.onStateChange?.(this.getSnapshot());
  }



  /** Reconstruit la base immédiatement (reprise de partie, sans cinématique). */
  createBaseInstant(initialLevels?: Partial<Record<BuildingType, number>>) {
    this.startInitialDeployment(initialLevels);
    this.isDeploying = false;
    this.landingDone = true;
    if (this.lander) this.lander.position.y = 0;
    if (this.landerFlame) this.landerFlame.visible = false;
    if (this.landerScorch) this.landerScorch.visible = true;
    this.sequenceTime = 7.8;
    this.padMarkers.visible = false;
    this.buildings.forEach((b) => {
      b.visible = true;
      b.buildProgress = 1;
      b.setBuildProgress(1);
      b.level = Math.min(4, b.level);
      b.setLevel(b.level, false);
    });
    this.corridors.forEach((c) => {
      c.mesh.visible = true;
      c.started = true;
      c.mesh.setProgress(1);
    });
    this.bannerText = 'Base lunaire opérationnelle';
    this.emitState();
  }

  /** Applique la lumière du cycle jour/nuit au site lunaire. */
  setDaylight(factor: number) {
    this.daylight = THREE.MathUtils.clamp(factor, 0, 1);
    const f = this.daylight;
    if (this.sunLight) this.sunLight.intensity = 3.1 * (0.22 + 0.78 * f);
    if (this.earthShine) this.earthShine.intensity = 0.38 * (0.45 + 0.55 * f);
    (this.scene.background as THREE.Color | null)?.setRGB(0.006 + f * 0.006, 0.008 + f * 0.008, 0.018 + f * 0.01);
    // Les projecteurs du site s'allument quand le soleil descend.
    this.siteLights.forEach((light, i) => {
      light.intensity = (1 - f) * (i === 1 ? 9 : 14);
    });
  }

  /** Cadre la caméra pour un palier de plateau (32 / 40 / 48 m). */
  frameTier(tier: number) {
    const portrait = this.viewportAspect < 0.8;
    const base = tier >= 3 ? 62 : tier === 2 ? 50 : 42;
    this.targetDistance = Math.min(100, base * (portrait ? 1.9 : 1));
    this.lookTarget.set(0, 2.0, -2.0);
    this.targetPitch = tier >= 3 ? 0.6 : 0.55;
  }

  hasBase() {
    return this.buildings.size > 0;
  }

  isDeployingNow() {
    return this.isDeploying;
  }

  getLevels(): Record<BuildingType, number> {
    return this.getSnapshot().levels;
  }

  /** Applique des niveaux (sauvegarde / synchronisation jeu). */
  setLevels(levels: Partial<Record<BuildingType, number>>, animate = false) {
    (['hub', 'solar', 'purifier', 'nursery'] as BuildingType[]).forEach((type) => {
      const b = this.buildings.get(type);
      const target = levels[type];
      if (!b || !target) return;
      b.setLevel(target, animate && b.buildProgress >= 0.99);
    });
    this.emitState();
  }

  setLevel(type: BuildingType, level: number, animate = true) {
    const b = this.buildings.get(type);
    if (!b) return;
    b.setLevel(level, animate && b.buildProgress >= 0.99);
    if (animate) this.focusBuilding(type);
    this.bannerText = `${type.toUpperCase()} — niveau ${b.level}`;
    this.emitState();
  }

  /** Prépare une nouvelle base (le déploiement sera rejoué à l'atterrissage). */
  reset() {
    this.astronaut.setMode('build');
    this.clearBase();
    this.padMarkers.visible = true;
    this.isDeploying = false;
    this.landingDone = false;
    if (this.lander) this.lander.position.y = this.landerStartY;
    if (this.landerFlame) this.landerFlame.visible = true;
    if (this.landerScorch) this.landerScorch.visible = false;
    this.sequenceTime = 0;
    this.bannerText = 'Site Shackleton-01 prêt pour implantation';
    this.emitState();
  }

  getCamera() {
    return this.camera;
  }

  /** Caméra réellement affichée : orbitale (construction) ou 3ᵉ personne. */
  getActiveCamera(): THREE.PerspectiveCamera {
    return this.astronaut.getMode() === 'build' ? this.camera : this.astronaut.getCamera();
  }

  getViewMode(): ViewMode {
    return this.astronaut.getMode();
  }

  setViewMode(mode: ViewMode, room: RoomId = 'hub') {
    this.astronaut.setMode(mode, room);
  }

  getAstronautSnapshot(): AstronautSnapshot {
    return this.astronaut.getSnapshot();
  }

  setAstronautSettings(s: ControlSettings) {
    this.astronaut.setSettings(s);
  }

  setAstronautObstacles(rects: ObstacleRect[]) {
    this.astronaut.setObstacles(rects);
  }

  getScene() {
    return this.scene;
  }

  dispose() {
    this.astronaut.dispose();
    this.disposeSiteProps();
    this.clearBase();
    if (this.dust) {
      this.scene.remove(this.dust);
      this.dust.geometry.dispose();
      (this.dust.material as THREE.Material).dispose();
      this.dust = undefined;
      this.dustBase = undefined;
    }
    this.terrainGeo?.dispose();
    this.rockInstanced?.geometry.dispose();
  }
}