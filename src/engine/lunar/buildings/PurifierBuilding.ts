import * as THREE from 'three';
import { BuildingBase } from '../BuildingBase';
import { LunarMaterials } from '../LunarMaterials';

export class PurifierBuilding extends BuildingBase {
  constructor(level = 1, autoBuild = false) {
    super('purifier', level, autoBuild);
    this.buildCore();
    this.buildLevel1();
    this.buildLevel2();
    this.buildLevel3();
    this.buildLevel4();
    this.finalizeStructure();
  }

  private buildCore() {
    for (const x of [-2.3, 0, 2.3]) {
      for (const z of [-1.8, 1.8]) {
        this.createLunarLeg(x, z, 0.56);
      }
    }

    const skid = new THREE.Mesh(
      new THREE.BoxGeometry(5.5, 0.2, 4.3),
      LunarMaterials.materials.frameDark
    );
    skid.position.y = 0.54;
    this.phaseFoundations.add(skid);

    const techBox = new THREE.Mesh(
      new THREE.BoxGeometry(3.7, 2.7, 3.9),
      LunarMaterials.materials.hullWhite
    );
    techBox.position.set(0.75, 1.98, 0);
    this.phaseHull.add(techBox);

    const roofFrame = new THREE.Mesh(
      new THREE.BoxGeometry(3.84, 0.22, 4.04),
      LunarMaterials.materials.titanium
    );
    roofFrame.position.set(0.75, 3.28, 0);
    this.phaseHull.add(roofFrame);

    const vp = this.createViewport(0.95, 0.52);
    vp.position.set(0.75, 2.02, 1.97);
    this.phaseDetails.add(vp);

    // Port orienté face au Hub (+X)
    this.createDockingPort('purifier_east', 2.66, 0, 1, 0);
    this.createStatusBeacon(2.3, 3.48, 1.75);
  }

  private createTank(x: number, z: number, r: number, h: number) {
    const grp = new THREE.Group();
    grp.position.set(x, 0.64, z);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 16),
      LunarMaterials.materials.hullWhite
    );
    body.position.y = h * 0.5;

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
      LunarMaterials.materials.titanium
    );
    cap.position.y = h;

    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(r + 0.03, r + 0.03, 0.14, 16),
      LunarMaterials.materials.hazard
    );
    band.position.y = 0.32;

    grp.add(body, cap, band);
    return grp;
  }

  private buildLevel1() {
    const g = this.levelGroups[1];

    // Grand réservoir vertical pressurisé (Image 1 à gauche du module)
    const mainTank = this.createTank(-1.85, 0.15, 0.9, 2.7);
    g.add(mainTank);

    this.deployables.push({
      object: mainTank,
      prop: 'position',
      axis: 'y',
      from: 1.9,
      to: 0.64,
      start: 0.52,
      end: 0.82,
    });

    const pipeWater = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 1.55, 8),
      LunarMaterials.materials.waterPipe
    );
    pipeWater.rotation.z = Math.PI / 2;
    pipeWater.position.set(-1.05, 1.25, 0.4);

    const pipeO2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 1.55, 8),
      LunarMaterials.materials.oxygenPipe
    );
    pipeO2.rotation.z = Math.PI / 2;
    pipeO2.position.set(-1.05, 2.55, -0.2);

    g.add(pipeWater, pipeO2);
  }

  private buildLevel2() {
    const g = this.levelGroups[2];
    const silos = new THREE.Group();
    silos.position.set(0, 0, 0);
    silos.userData.base_y = 0;

    for (const [x, z] of [[-1.85, -1.6], [-2.95, -0.5], [-2.95, 1.1]]) {
      silos.add(this.createTank(x, z, 0.5, 3.15));
    }
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.16, 1.3),
      LunarMaterials.materials.frameDark
    );
    bridge.position.set(-1.75, 3.3, -0.35);
    silos.add(bridge);

    g.add(silos);
    this.registerUpgradeSlide(2, silos, 'y', -2.4);
  }

  private buildLevel3() {
    const g = this.levelGroups[3];
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.92, 0.92, 0.52, 16),
      LunarMaterials.materials.titanium
    );
    drum.position.set(0.75, 3.62, 0);
    drum.userData.base_y = 3.62;
    g.add(drum);
    this.registerUpgradeSlide(3, drum, 'y', -0.7);

    this.animators.push((dt) => {
      drum.rotation.y += dt * 1.1;
    });
  }

  private buildLevel4() {
    const g = this.levelGroups[4];
    const towers = new THREE.Group();
    towers.position.set(0, 0, 0);
    towers.userData.base_y = 0;

    for (const z of [-1.05, 1.05]) {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.42, 4.9, 12),
        LunarMaterials.materials.titanium
      );
      col.position.set(-2.0, 3.05, z);
      towers.add(col);
    }
    g.add(towers);
    this.registerUpgradeSlide(4, towers, 'y', -3.2);
  }
}