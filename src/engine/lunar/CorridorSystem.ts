import * as THREE from 'three';
import { BuildingBase, DOCK_CENTER_Y } from './BuildingBase';
import { LunarMaterials } from './LunarMaterials';

export class PressurizedCorridor extends THREE.Group {
  private segments: THREE.Group[] = [];
  private struts: THREE.Group[] = [];
  progress = 0;
  isAnimating = true;

  constructor(buildingA: BuildingBase, buildingB: BuildingBase, animate = true) {
    super();
    LunarMaterials.init();
    this.progress = animate ? 0 : 1;
    this.isAnimating = animate;
    this.buildConnection(buildingA, buildingB);
    this.setProgress(this.progress);
  }

  private pickBestPortPair(a: BuildingBase, b: BuildingBase) {
    const portsA = a.getWorldDockingPorts();
    const portsB = b.getWorldDockingPorts();
    let best: { pa: (typeof portsA)[number]; pb: (typeof portsB)[number] } | null = null;
    let bestScore = Infinity;

    for (const pa of portsA) {
      for (const pb of portsB) {
        const vec = pb.worldPos.clone().sub(pa.worldPos);
        const dist = vec.length();
        if (dist < 0.4) continue;
        vec.normalize();

        const alignA = 1 - pa.worldNormal.dot(vec);
        const alignB = 1 - pb.worldNormal.dot(vec.clone().negate());
        const penalty = (pa.occupied ? 8 : 0) + (pb.occupied ? 8 : 0);
        const score = dist + (alignA + alignB) * 5 + penalty;
        if (score < bestScore) {
          bestScore = score;
          best = { pa, pb };
        }
      }
    }
    return best;
  }

  private buildConnection(a: BuildingBase, b: BuildingBase) {
    const pair = this.pickBestPortPair(a, b);
    if (!pair) return;

    const { pa, pb } = pair;
    pa.occupied = true;
    pb.occupied = true;
    if (pa.hatch) pa.hatch.visible = false;
    if (pb.hatch) pb.hatch.visible = false;

    const startStub = pa.worldPos.clone().addScaledVector(pa.worldNormal, 0.5);
    const endStub = pb.worldPos.clone().addScaledVector(pb.worldNormal, 0.5);

    this.add(this.createBellows(pa.worldPos, startStub));
    this.add(this.createBellows(pb.worldPos, endStub));

    const span = endStub.clone().sub(startStub).normalize();
    const needsElbow = pa.worldNormal.dot(span) < 0.72 || pb.worldNormal.dot(span.clone().negate()) < 0.72;

    if (!needsElbow) {
      this.addTunnelSegment(startStub, endStub);
    } else {
      const mid = startStub.clone().lerp(endStub, 0.5);
      mid.y = DOCK_CENTER_Y;
      this.add(this.createJunctionNode(mid));
      this.addTunnelSegment(startStub, mid);
      this.addTunnelSegment(mid, endStub);
    }
  }

  private createBellows(p1: THREE.Vector3, p2: THREE.Vector3) {
    const grp = new THREE.Group();
    const len = p1.distanceTo(p2);
    const mid = p1.clone().lerp(p2, 0.5);
    const dir = p2.clone().sub(p1).normalize();

    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.84, 0.84, len, 16),
      LunarMaterials.materials.bellows
    );
    tube.rotation.x = Math.PI / 2;
    grp.add(tube);

    for (const f of [-0.28, 0, 0.28]) {
      const rib = new THREE.Mesh(
        new THREE.TorusGeometry(0.86, 0.04, 8, 16),
        LunarMaterials.materials.frameDark
      );
      rib.position.z = f * len;
      grp.add(rib);
    }

    grp.position.copy(mid);
    grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    return grp;
  }

  private createJunctionNode(pos: THREE.Vector3) {
    const node = new THREE.Group();
    node.position.set(pos.x, 0, pos.z);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(1.08, 1.08, 2.1, 16),
      LunarMaterials.materials.hullWhite
    );
    body.position.y = DOCK_CENTER_Y;

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.06, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45),
      LunarMaterials.materials.titanium
    );
    dome.position.y = DOCK_CENTER_Y + 1.0;

    for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 0.65, 8),
        LunarMaterials.materials.frameDark
      );
      leg.position.set(Math.cos(a) * 0.82, 0.32, Math.sin(a) * 0.82);
      node.add(leg);
    }

    node.add(body, dome);
    return node;
  }

  private addTunnelSegment(pStart: THREE.Vector3, pEnd: THREE.Vector3) {
    const length = pStart.distanceTo(pEnd);
    if (length < 0.2) return;

    const dir = pEnd.clone().sub(pStart).normalize();
    const pivot = new THREE.Group();
    pivot.position.copy(pStart);
    pivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

    const tunnel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.82, 0.82, length, 16),
      LunarMaterials.materials.hullWhite
    );
    tunnel.rotation.x = Math.PI / 2;
    tunnel.position.z = length * 0.5;
    pivot.add(tunnel);

    const conduit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, length, 8),
      LunarMaterials.materials.titanium
    );
    conduit.rotation.x = Math.PI / 2;
    conduit.position.set(0, -0.88, length * 0.5);
    pivot.add(conduit);

    const midCount = Math.max(1, Math.floor(length / 2.2));
    for (let i = 1; i <= midCount; i++) {
      const z = (i / (midCount + 1)) * length;

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.85, 0.055, 8, 16),
        LunarMaterials.materials.frameDark
      );
      ring.position.z = z;
      pivot.add(ring);

      for (const sx of [-0.82, 0.82]) {
        const port = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.32, 0.46),
          LunarMaterials.materials.viewportGlow
        );
        port.position.set(sx, 0.1, z);
        pivot.add(port);
      }

      const strutGrp = new THREE.Group();
      strutGrp.position.set(0, 0, z);
      const strut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.085, 0.68, 8),
        LunarMaterials.materials.frameDark
      );
      strut.position.y = -1.16;
      const foot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.22, 0.07, 10),
        LunarMaterials.materials.titanium
      );
      foot.position.y = -1.465;
      strutGrp.add(strut, foot);
      pivot.add(strutGrp);
      this.struts.push(strutGrp);
    }

    pivot.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });

    this.add(pivot);
    this.segments.push(pivot);
  }

  setProgress(p: number) {
    this.progress = THREE.MathUtils.clamp(p, 0, 1);
    const ease = 1 - Math.pow(1 - this.progress, 3);
    for (const seg of this.segments) {
      seg.scale.set(1, 1, Math.max(0.01, ease));
    }
    for (const s of this.struts) {
      s.scale.y = Math.max(0.1, THREE.MathUtils.clamp((this.progress - 0.35) / 0.65, 0, 1));
    }
    this.isAnimating = this.progress < 0.999;
  }

  update(dt: number) {
    if (this.isAnimating) {
      this.setProgress(this.progress + dt * 0.72);
    }
  }

  dispose() {
    this.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.isMesh && m.geometry) m.geometry.dispose();
    });
  }
}