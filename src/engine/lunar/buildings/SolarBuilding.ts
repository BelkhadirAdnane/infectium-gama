import * as THREE from 'three';
import { BuildingBase } from '../BuildingBase';
import { LunarMaterials } from '../LunarMaterials';

export class SolarBuilding extends BuildingBase {
  constructor(level = 1, autoBuild = false) {
    super('solar', level, autoBuild);
    this.buildCore();
    this.buildLevel1();
    this.buildLevel2();
    this.buildLevel3();
    this.buildLevel4();
    this.finalizeStructure();
  }

  private buildCore() {
    for (const x of [-2.0, 2.0]) {
      for (const z of [-1.6, 1.6]) {
        this.createLunarLeg(x, z, 0.58);
      }
    }

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 0.18, 3.9),
      LunarMaterials.materials.frameDark
    );
    deck.position.y = 0.55;
    this.phaseFoundations.add(deck);

    const hull = this.createOctagonalHull(4.6, 3.7, 2.3, 0.52);
    hull.position.y = 1.78;
    this.phaseHull.add(hull);

    const batteryMli = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 1.35, 3.82),
      LunarMaterials.materials.mliGold
    );
    batteryMli.position.y = 1.62;
    this.phaseHull.add(batteryMli);

    const hazard = new THREE.Mesh(
      new THREE.BoxGeometry(4.65, 0.14, 3.76),
      LunarMaterials.materials.hazard
    );
    hazard.position.y = 0.84;
    this.phaseDetails.add(hazard);

    // Port orienté face au Hub (-X)
    this.createDockingPort('solar_west', -2.38, 0, -1, 0);
    this.createStatusBeacon(1.9, 2.98, 1.4);
  }

  private createWing(w: number, l: number) {
    const grp = new THREE.Group();
    grp.add(
      new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, l), LunarMaterials.materials.frameDark),
      new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.075, l - 0.1), LunarMaterials.materials.solarCell)
    );
    return grp;
  }

  private buildLevel1() {
    const g = this.levelGroups[1];

    // Mâts d'élévation & volets photovoltaïques articulés sur ±Z (libres du couloir sur -X)
    for (const side of [-1, 1]) {
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.15, 1.25, 10),
        LunarMaterials.materials.titanium
      );
      mast.position.set(0, 2.42, side * 2.15);
      g.add(mast);

      const hinge = new THREE.Group();
      hinge.position.set(0, 3.05, side * 2.2);

      const wing = this.createWing(2.4, 3.1);
      wing.position.set(0, 0, side * 1.6);
      hinge.add(wing);
      g.add(hinge);

      this.deployables.push({
        object: hinge,
        prop: 'rotation',
        axis: 'x',
        from: -side * Math.PI * 0.48,
        to: -side * 0.18,
        start: 0.56,
        end: 0.86,
      });

      this.animators.push((_dt, elapsed) => {
        hinge.rotation.z = Math.sin(elapsed * 0.22) * 0.22;
      });
    }
  }

  private buildLevel2() {
    const g = this.levelGroups[2];
    const bridge = new THREE.Group();
    bridge.position.set(4.8, 3.15, 0);
    bridge.userData.base_x = 4.8;

    const truss = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 0.28, 1.8),
      LunarMaterials.materials.frameDark
    );
    const panel = this.createWing(4.6, 2.1);
    panel.position.y = 0.2;
    panel.rotation.x = 0.35;
    bridge.add(truss, panel);
    g.add(bridge);
    this.registerUpgradeSlide(2, bridge, 'x', -3.2);
  }

  private buildLevel3() {
    const g = this.levelGroups[3];
    const farm = new THREE.Group();
    farm.position.set(4.5, 0, -4.4);
    farm.userData.base_y = 0;

    for (let i = 0; i < 4; i++) {
      const px = -1.8 + i * 1.45;
      const stand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.11, 1.1, 8),
        LunarMaterials.materials.frameDark
      );
      stand.position.set(px, 0.55, 0);
      const pv = this.createWing(1.25, 1.5);
      pv.position.set(px, 1.15, 0);
      pv.rotation.x = 0.48;
      farm.add(stand, pv);
    }
    g.add(farm);
    this.registerUpgradeSlide(3, farm, 'y', -0.9);
  }

  private buildLevel4() {
    const g = this.levelGroups[4];
    const towers = new THREE.Group();
    towers.position.set(0, 0, 0);
    towers.userData.base_y = 0;

    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.22, 3.1, 10),
        LunarMaterials.materials.titanium
      );
      pylon.position.set(0, 4.4, side * 2.2);
      const wing = this.createWing(4.4, 2.9);
      wing.position.set(0, 5.95, side * 2.2);
      wing.rotation.x = 0.26;
      towers.add(pylon, wing);
    }
    g.add(towers);
    this.registerUpgradeSlide(4, towers, 'y', -2.6);
  }
}