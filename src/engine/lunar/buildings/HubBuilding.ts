import * as THREE from 'three';
import { BuildingBase } from '../BuildingBase';
import { LunarMaterials } from '../LunarMaterials';

export class HubBuilding extends BuildingBase {
  constructor(level = 1, autoBuild = false) {
    super('hub', level, autoBuild);
    this.buildCore();
    this.buildLevel1();
    this.buildLevel2();
    this.buildLevel3();
    this.buildLevel4();
    this.finalizeStructure();
  }

  private buildCore() {
    for (const x of [-4.5, -1.5, 1.5, 4.5]) {
      for (const z of [-2.9, 2.9]) {
        this.createLunarLeg(x, z, 0.62);
      }
    }

    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(10.5, 0.2, 6.1),
      LunarMaterials.materials.frameDark
    );
    chassis.position.y = 0.56;
    this.phaseFoundations.add(chassis);

    const hull = this.createOctagonalHull(10.4, 6.4, 3.05, 0.9);
    hull.position.y = 2.15;
    this.phaseHull.add(hull);

    for (let x = -4.2; x <= 4.2; x += 2.1) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 3.18, 6.54),
        LunarMaterials.materials.frameDark
      );
      rib.position.set(x, 2.15, 0);
      this.phaseHull.add(rib);
    }

    for (const x of [-2.8, 2.8]) {
      for (const z of [-3.22, 3.22]) {
        const vp = this.createViewport(1.35, 0.64);
        vp.position.set(x, 2.18, z);
        if (z < 0) vp.rotation.y = Math.PI;
        this.phaseDetails.add(vp);
      }
    }

    // Sas EVA frontal avec escalier
    const vestibule = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 2.3, 1.25),
      LunarMaterials.materials.titanium
    );
    vestibule.position.set(0, 1.72, 3.55);
    this.phaseHull.add(vestibule);

    const evaDoor = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 1.9, 0.08),
      LunarMaterials.materials.frameDark
    );
    evaDoor.position.set(0, 1.65, 4.18);
    this.phaseDetails.add(evaDoor);

    for (let i = 0; i < 4; i++) {
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.07, 0.3),
        LunarMaterials.materials.frameDark
      );
      step.position.set(0, 0.54 - i * 0.14, 4.35 + i * 0.3);
      this.phaseDetails.add(step);
    }

    this.createDockingPort('hub_east', 5.26, 0, 1, 0);
    this.createDockingPort('hub_west', -5.26, 0, -1, 0);
    this.createDockingPort('hub_north', 0, -3.26, 0, -1);

    this.createStatusBeacon(0, 3.76, 3.05);
  }

  private buildLevel1() {
    const g = this.levelGroups[1];

    const rack = new THREE.Mesh(
      new THREE.BoxGeometry(8.4, 0.2, 3.6),
      LunarMaterials.materials.titanium
    );
    rack.position.y = 3.76;
    g.add(rack);

    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 2.3, 14),
      LunarMaterials.materials.titanium
    );
    tank.rotation.z = Math.PI / 2;
    tank.position.set(-2.1, 4.12, -0.8);
    g.add(tank);

    const dishPivot = new THREE.Group();
    dishPivot.position.set(2.1, 3.85, -0.5);
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.13, 0.68, 10),
      LunarMaterials.materials.frameDark
    );
    mast.position.y = 0.34;
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 16, 10, 0, Math.PI * 2, 0, 0.85),
      LunarMaterials.materials.hullWhite
    );
    dish.position.y = 0.82;
    dish.rotation.x = Math.PI * 0.72;
    dishPivot.add(mast, dish);
    g.add(dishPivot);

    this.deployables.push({
      object: dishPivot,
      prop: 'rotation',
      axis: 'x',
      from: -Math.PI * 0.42,
      to: 0,
      start: 0.62,
      end: 0.86,
    });
    this.animators.push((_dt, elapsed) => {
      dishPivot.rotation.y = Math.sin(elapsed * 0.3) * 0.48;
    });
  }

  private buildLevel2() {
    const g = this.levelGroups[2];
    const cupola = new THREE.Group();
    cupola.position.set(0, 3.88, 0);
    cupola.userData.base_y = 3.88;

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.75, 1.95, 0.42, 16),
      LunarMaterials.materials.titanium
    );
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(1.72, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
      LunarMaterials.materials.greenhouseGlass
    );
    glass.position.y = 0.18;
    cupola.add(collar, glass);
    g.add(cupola);
    this.registerUpgradeSlide(2, cupola, 'y', -0.9);
  }

  private buildLevel3() {
    const g = this.levelGroups[3];
    const annex = new THREE.Group();
    annex.position.set(4.1, 1.95, -4.6);
    annex.userData.base_z = -4.6;

    const hull = this.createOctagonalHull(3.6, 3.2, 2.25, 0.5);
    hull.rotation.y = Math.PI / 2;
    annex.add(hull);
    g.add(annex);
    this.registerUpgradeSlide(3, annex, 'z', 2.2);
  }

  private buildLevel4() {
    const g = this.levelGroups[4];
    const spire = new THREE.Group();
    spire.position.set(0, 5.7, 0);
    spire.userData.base_y = 5.7;

    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.72, 2.4, 12),
      LunarMaterials.materials.titanium
    );
    tower.position.y = 1.2;
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.18, 2.6, 8),
      LunarMaterials.materials.frameDark
    );
    antenna.position.y = 3.3;

    spire.add(tower, antenna);
    g.add(spire);
    this.registerUpgradeSlide(4, spire, 'y', -2.4);
  }
}