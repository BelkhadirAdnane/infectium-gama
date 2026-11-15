import * as THREE from 'three';
import { BuildingBase } from '../BuildingBase';
import { LunarMaterials } from '../LunarMaterials';

export class NurseryBuilding extends BuildingBase {
  private arches: THREE.Mesh[] = [];
  private canopy?: THREE.Mesh;

  constructor(level = 1, autoBuild = false) {
    super('nursery', level, autoBuild);
    this.buildCore();
    this.buildLevel1();
    this.buildLevel2();
    this.buildLevel3();
    this.buildLevel4();
    this.finalizeStructure();
  }

  private buildCore() {
    for (const x of [-3.2, 0, 3.2]) {
      for (const z of [-2.3, 2.3]) {
        this.createLunarLeg(x, z, 0.56);
      }
    }

    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(7.5, 0.72, 5.5),
      LunarMaterials.materials.hullWhite
    );
    plinth.position.y = 0.92;
    this.phaseFoundations.add(plinth);

    // Pignons demi-cylindriques orientés vers +Y (thetaStart = 0, thetaLength = PI)
    for (const side of [-1, 1]) {
      const endWall = new THREE.Mesh(
        new THREE.CylinderGeometry(2.45, 2.45, 0.28, 18, 1, false, 0, Math.PI),
        LunarMaterials.materials.hullWhite
      );
      endWall.rotation.z = Math.PI / 2;
      endWall.position.set(side * 3.6, 1.28, 0);
      this.phaseHull.add(endWall);
    }

    // Port orienté face au Hub (+Z)
    this.createDockingPort('nursery_south', 0, 2.82, 0, 1);
    this.createStatusBeacon(-3.3, 1.42, 2.5);
  }

  private createHydroponicRack(x: number, z: number, length: number) {
    const rack = new THREE.Group();
    rack.position.set(x, 1.3, z);

    const tray = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.22, 0.92),
      LunarMaterials.materials.titanium
    );
    rack.add(tray);

    for (let px = -length * 0.4; px <= length * 0.4; px += 0.58) {
      const plant = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.22, 1),
        LunarMaterials.materials.foliage
      );
      plant.position.set(px, 0.26, ((px * 13) % 0.16) - 0.08);
      rack.add(plant);
    }

    const led = new THREE.Mesh(
      new THREE.BoxGeometry(length - 0.2, 0.045, 0.14),
      LunarMaterials.materials.growLight
    );
    led.position.y = 0.78;
    rack.add(led);

    return rack;
  }

  private buildLevel1() {
    const g = this.levelGroups[1];

    // Verrière voûtée orientée vers +Y (thetaStart = 0, thetaLength = PI)
    this.canopy = new THREE.Mesh(
      new THREE.CylinderGeometry(2.45, 2.45, 7.0, 20, 1, true, 0, Math.PI),
      LunarMaterials.materials.greenhouseGlass
    );
    this.canopy.rotation.z = Math.PI / 2;
    this.canopy.position.y = 1.28;
    g.add(this.canopy);

    for (let x = -3.0; x <= 3.0; x += 1.5) {
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(2.5, 0.075, 8, 20, Math.PI),
        LunarMaterials.materials.hullWhite
      );
      arch.rotation.y = Math.PI / 2;
      arch.position.set(x, 1.28, 0);
      g.add(arch);
      this.arches.push(arch);
    }

    g.add(this.createHydroponicRack(0, -1.0, 5.6));
    g.add(this.createHydroponicRack(0, 1.0, 5.6));
  }

  override setBuildProgress(progress: number) {
    super.setBuildProgress(progress);

    // Déploiement séquentiel des arceaux puis de la verrière
    if (this.arches.length > 0) {
      this.arches.forEach((arch, idx) => {
        const start = 0.54 + idx * 0.04;
        const t = THREE.MathUtils.clamp((this.buildProgress - start) / 0.16, 0, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        arch.position.y = 0.4 + ease * 0.88;
        arch.visible = t > 0.02;
      });
    }
    if (this.canopy) {
      const ct = THREE.MathUtils.clamp((this.buildProgress - 0.72) / 0.18, 0, 1);
      this.canopy.visible = ct > 0.02;
    }
  }

  private buildLevel2() {
    const g = this.levelGroups[2];
    const lab = new THREE.Group();
    lab.position.set(5.2, 1.85, 0);
    lab.userData.base_x = 5.2;

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(3.1, 2.55, 3.5),
      LunarMaterials.materials.hullWhite
    );
    const vp = this.createViewport(2.2, 1.25);
    vp.position.set(0, 0.2, 1.77);
    lab.add(box, vp);
    g.add(lab);
    this.registerUpgradeSlide(2, lab, 'x', -2.6);
  }

  private buildLevel3() {
    const g = this.levelGroups[3];
    const dome = new THREE.Group();
    dome.position.set(0, 0, -5.5);
    dome.userData.base_y = 0;

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(3.0, 3.2, 0.5, 20),
      LunarMaterials.materials.hullWhite
    );
    base.position.y = 0.28;

    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(2.95, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      LunarMaterials.materials.greenhouseGlass
    );
    glass.position.y = 0.52;

    const ribs = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.98, 2),
      new THREE.MeshStandardMaterial({ color: 0xcfd6de, wireframe: true })
    );
    ribs.position.y = 0.52;

    const inner = this.createHydroponicRack(0, 0, 3.4);
    inner.position.y = 0.65;
    dome.add(base, glass, ribs, inner);
    g.add(dome);
    this.registerUpgradeSlide(3, dome, 'y', -1.8);
  }

  private buildLevel4() {
    const g = this.levelGroups[4];
    const twin = new THREE.Group();
    twin.position.set(-5.8, 0, -4.4);
    twin.userData.base_x = -5.8;

    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(5.8, 0.68, 3.4),
      LunarMaterials.materials.hullWhite
    );
    plinth.position.y = 0.88;

    const vault = new THREE.Mesh(
      new THREE.CylinderGeometry(1.65, 1.65, 5.4, 16, 1, true, 0, Math.PI),
      LunarMaterials.materials.greenhouseGlass
    );
    vault.rotation.z = Math.PI / 2;
    vault.position.y = 1.22;

    const rack = this.createHydroponicRack(0, 0, 4.4);
    rack.position.y = 1.25;
    twin.add(plinth, vault, rack);
    g.add(twin);
    this.registerUpgradeSlide(4, twin, 'x', 2.8);
  }
}