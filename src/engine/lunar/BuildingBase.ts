import * as THREE from 'three';
import { LunarMaterials } from './LunarMaterials';

export const DOCK_CENTER_Y = 1.5;

export interface DockingPort {
  id: string;
  localPos: THREE.Vector3;
  normal: THREE.Vector3;
  hatch: THREE.Mesh;
  occupied: boolean;
}

export interface DeployablePart {
  object: THREE.Object3D;
  prop: 'rotation' | 'position';
  axis: 'x' | 'y' | 'z';
  from: number;
  to: number;
  start: number;
  end: number;
}

export type BuildingType = 'hub' | 'solar' | 'purifier' | 'nursery';

export class BuildingBase extends THREE.Group {
  buildingType: BuildingType;
  level = 1;
  dockingPorts: DockingPort[] = [];

  protected phaseFoundations = new THREE.Group();
  protected phaseHull = new THREE.Group();
  protected phaseEquipment = new THREE.Group();
  protected phaseDetails = new THREE.Group();

  protected levelGroups: Record<1 | 2 | 3 | 4, THREE.Group> = {
    1: new THREE.Group(),
    2: new THREE.Group(),
    3: new THREE.Group(),
    4: new THREE.Group(),
  };

  protected deployables: DeployablePart[] = [];
  protected animators: Array<(dt: number, elapsed: number) => void> = [];
  protected beacons: THREE.Mesh[] = [];
  protected upgradeTargets: Record<number, Array<{ obj: THREE.Object3D; axis: 'x' | 'y' | 'z'; offset: number }>> = {
    2: [],
    3: [],
    4: [],
  };

  buildProgress = 1;
  isBuilding = false;
  buildDuration = 3.2;

  private upgradingLevel: number | null = null;
  private upgradeTimer = 0;
  private readonly upgradeDuration = 1.25;

  constructor(type: BuildingType, level = 1, autoBuild = false) {
    super();
    LunarMaterials.init();
    this.buildingType = type;
    this.level = THREE.MathUtils.clamp(level, 1, 4);

    this.add(this.phaseFoundations, this.phaseHull, this.phaseEquipment, this.phaseDetails);
    ([1, 2, 3, 4] as const).forEach((lvl) => this.phaseEquipment.add(this.levelGroups[lvl]));

    if (autoBuild) {
      this.buildProgress = 0;
      this.isBuilding = true;
    }
  }

  protected finalizeStructure() {
    this.applyLevelVisibility();
    this.enableShadows(this);
    this.setBuildProgress(this.buildProgress);
  }

  protected createLunarLeg(x: number, z: number, topY = 0.62) {
    const leg = new THREE.Group();
    leg.position.set(x, 0, z);

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.31, 0.08, 10),
      LunarMaterials.materials.frameDark
    );
    pad.position.y = 0.04;

    const piston = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.095, topY, 8),
      LunarMaterials.materials.titanium
    );
    piston.position.y = topY * 0.5;

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.16, 8),
      LunarMaterials.materials.frameDark
    );
    collar.position.y = topY - 0.1;

    leg.add(pad, piston, collar);
    this.phaseFoundations.add(leg);
    return leg;
  }

  protected createDockingPort(id: string, x: number, z: number, nx: number, nz: number) {
    const normal = new THREE.Vector3(nx, 0, nz).normalize();
    const grp = new THREE.Group();
    grp.position.set(x, DOCK_CENTER_Y, z);
    grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(0.92, 0.96, 0.3, 16),
      LunarMaterials.materials.frameDark
    );
    ring.rotation.x = Math.PI / 2;

    const seal = new THREE.Mesh(
      new THREE.TorusGeometry(0.82, 0.06, 8, 18),
      LunarMaterials.materials.titanium
    );
    seal.position.z = 0.15;

    const hatch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.74, 0.74, 0.08, 14),
      LunarMaterials.materials.hullWhite
    );
    hatch.rotation.x = Math.PI / 2;
    hatch.position.z = 0.1;

    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.94, 0.94, 0.07, 16, 1, true),
      LunarMaterials.materials.hazard
    );
    stripe.rotation.x = Math.PI / 2;
    stripe.position.z = 0.03;

    grp.add(ring, seal, hatch, stripe);
    this.phaseHull.add(grp);

    const port: DockingPort = {
      id,
      localPos: new THREE.Vector3(x, DOCK_CENTER_Y, z),
      normal,
      hatch,
      occupied: false,
    };
    this.dockingPorts.push(port);
    return port;
  }

  protected createOctagonalHull(length: number, width: number, height: number, chamfer = 0.85) {
    const hw = width * 0.5;
    const hh = height * 0.5;
    const c = Math.min(chamfer, hw * 0.45, hh * 0.45);

    const shape = new THREE.Shape();
    shape.moveTo(-hw + c, -hh);
    shape.lineTo(hw - c, -hh);
    shape.lineTo(hw, -hh + c);
    shape.lineTo(hw, hh - c);
    shape.lineTo(hw - c, hh);
    shape.lineTo(-hw + c, hh);
    shape.lineTo(-hw, hh - c);
    shape.lineTo(-hw, -hh + c);
    shape.closePath();

    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: length,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.05,
      bevelSegments: 1,
    });
    geom.center();
    geom.rotateY(Math.PI / 2);
    return new THREE.Mesh(geom, LunarMaterials.materials.hullWhite);
  }

  protected createViewport(w = 1.25, h = 0.62) {
    const grp = new THREE.Group();
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.12),
      LunarMaterials.materials.frameDark
    );
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 0.14),
      LunarMaterials.materials.viewportGlow
    );
    grp.add(frame, glass);
    return grp;
  }

  protected createStatusBeacon(x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      this.isBuilding ? LunarMaterials.materials.beaconBuilding : LunarMaterials.materials.beaconActive
    );
    mesh.position.set(x, y, z);
    this.phaseDetails.add(mesh);
    this.beacons.push(mesh);
    return mesh;
  }

  protected registerUpgradeSlide(level: 2 | 3 | 4, obj: THREE.Object3D, axis: 'x' | 'y' | 'z', offset: number) {
    this.upgradeTargets[level].push({ obj, axis, offset });
  }

  startConstruction(duration = 3.2) {
    this.buildDuration = duration;
    this.buildProgress = 0;
    this.isBuilding = true;
    this.setBuildProgress(0);
  }

  /**
   * Assemblage mécanique fluide sans écrasement plastique ni rebond enfantin :
   * les modules glissent en place le long de leurs axes de montage.
   */
  setBuildProgress(progress: number) {
    this.buildProgress = THREE.MathUtils.clamp(progress, 0, 1);
    const cubicOut = (t: number) => 1 - Math.pow(1 - THREE.MathUtils.clamp(t, 0, 1), 3);

    // Phase 1 : Fondations & vérins (0.00 -> 0.24)
    const p1 = cubicOut(this.buildProgress / 0.24);
    this.phaseFoundations.visible = p1 > 0.01;
    this.phaseFoundations.position.y = (1 - p1) * 0.45;
    this.phaseFoundations.scale.y = Math.max(0.15, p1);

    // Phase 2 : Mise en place de la coque principale (0.20 -> 0.58)
    const p2 = cubicOut((this.buildProgress - 0.2) / 0.38);
    this.phaseHull.visible = p2 > 0.01;
    this.phaseHull.position.y = (1 - p2) * 1.15;

    // Phase 3 : Équipements techniques & déploiement articulé (0.50 -> 0.85)
    const p3 = cubicOut((this.buildProgress - 0.5) / 0.35);
    this.phaseEquipment.visible = p3 > 0.01;
    this.phaseEquipment.position.y = (1 - p3) * 0.65;

    for (const d of this.deployables) {
      const dp = cubicOut((this.buildProgress - d.start) / (d.end - d.start));
      d.object[d.prop][d.axis] = THREE.MathUtils.lerp(d.from, d.to, dp);
    }

    // Phase 4 : Finitions, hublots & mise en service (0.80 -> 1.00)
    const p4 = cubicOut((this.buildProgress - 0.8) / 0.2);
    this.phaseDetails.visible = p4 > 0.05;

    const ready = this.buildProgress >= 0.999;
    this.isBuilding = !ready;
    for (const b of this.beacons) {
      b.material = ready
        ? LunarMaterials.materials.beaconActive
        : LunarMaterials.materials.beaconBuilding;
    }
  }

  setLevel(newLevel: number, animate = true) {
    const target = THREE.MathUtils.clamp(newLevel, 1, 4);
    if (target === this.level) return;
    const prev = this.level;
    this.level = target;
    this.applyLevelVisibility();

    if (animate && target > prev && this.buildProgress >= 0.99) {
      this.upgradingLevel = target;
      this.upgradeTimer = this.upgradeDuration;
      for (const item of this.upgradeTargets[target]) {
        item.obj.position[item.axis] = item.obj.userData[`base_${item.axis}`] + item.offset;
      }
    }
  }

  private applyLevelVisibility() {
    for (let lvl = 1 as 1 | 2 | 3 | 4; lvl <= 4; lvl = (lvl + 1) as 1 | 2 | 3 | 4) {
      this.levelGroups[lvl].visible = lvl <= this.level;
    }
  }

  getWorldDockingPorts() {
    this.updateMatrixWorld(true);
    return this.dockingPorts.map((p) => ({
      ...p,
      worldPos: p.localPos.clone().applyMatrix4(this.matrixWorld),
      worldNormal: p.normal.clone().transformDirection(this.matrixWorld).normalize(),
      building: this,
    }));
  }

  update(dt: number, elapsed = 0) {
    if (this.isBuilding) {
      this.setBuildProgress(this.buildProgress + dt / this.buildDuration);
    }

    if (this.upgradingLevel !== null) {
      this.upgradeTimer -= dt;
      const t = 1 - THREE.MathUtils.clamp(this.upgradeTimer / this.upgradeDuration, 0, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      for (const item of this.upgradeTargets[this.upgradingLevel]) {
        const base = item.obj.userData[`base_${item.axis}`] ?? 0;
        item.obj.position[item.axis] = base + item.offset * (1 - ease);
      }
      if (this.upgradeTimer <= 0) {
        this.upgradingLevel = null;
      }
    }

    if (this.buildProgress >= 0.95) {
      for (const fn of this.animators) fn(dt, elapsed);
    }
  }

  private enableShadows(root: THREE.Object3D) {
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }

  dispose() {
    this.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.isMesh && m.geometry) m.geometry.dispose();
    });
  }
}