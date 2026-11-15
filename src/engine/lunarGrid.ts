import * as THREE from 'three';
import { BUILDINGS, CELL_SIZE, tierDef } from '../game/buildings';
import { corridorLinkSignature, corridorNeighbours } from '../game/corridorLinks';
import { LunarMaterials } from './lunar/LunarMaterials';
import { anchorUnderCursor, canPlace, gridWorldSize, worldToCell } from '../game/grid';
import { BuildingInstance } from '../game/types';

// =========================================================================
// Plateau de construction lunaire (façon city-builder isométrique)
// -------------------------------------------------------------------------
// · plateau délimité + quadrillage qui s'étend à chaque palier
// · fantôme de placement vert/rouge aligné sur la grille
// · modules 3D construits/démolis/améliorés, avec éclairage de nuit
// Les bâtiments d'origine sont gérés par la scène lunaire dédiée :
// ici on ne crée QUE les nouveaux modules et le décor de la grille.
// =========================================================================

export interface GridBuildingSync {
  id: string;
  key: string;
  x: number;
  z: number;
  level: number;
}

export interface GhostDef {
  key: string;
  w: number;
  d: number;
}

export interface GhostInfo {
  x: number;
  z: number;
  valid: boolean;
  reason?: string;
}

export interface LunarGridApi {
  root: THREE.Group;
  setTier: (tier: number) => void;
  sync: (buildings: GridBuildingSync[]) => void;
  setGhost: (def: GhostDef | null) => void;
  updateGhost: (raycaster: THREE.Raycaster) => GhostInfo | null;
  currentGhost: () => GhostInfo | null;
  select: (id: string | null) => void;
  setVisible: (visible: boolean) => void;
  setDaylight: (factor: number) => void;
  pickBuildingId: (raycaster: THREE.Raycaster) => string | null;
  update: (dt: number, elapsed: number) => void;
  dispose: () => void;
}

interface BuiltEntry {
  def: ReturnType<typeof defOf>;
  group: THREE.Group;
  level: number;
  pop: number;
  glowMats: THREE.MeshStandardMaterial[];
  levelAdds: THREE.Object3D[];
  halo: THREE.Object3D | null;
  beacon: THREE.Mesh | null;
  x: number;
  z: number;
}

function defOf(key: string) {
  return BUILDINGS[key];
}

const PALETTE = {
  hull: 0xdde6f4,
  hullDark: 0x9aa8bd,
  dark: 0x2b3650,
  gold: 0xd9b45a,
  glass: 0x7fd8ee,
};

function mat(color: number, opts: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.45, ...opts });
}

function glowMat(color: number, intensity = 1) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.3,
    metalness: 0.2,
  });
}

export function createLunarGrid(
  parent: THREE.Group,
  clickable: THREE.Object3D[]
): LunarGridApi {
  const root = new THREE.Group();
  root.name = 'lunar-build-grid';
  parent.add(root);

  let tier = 1;
  let targetSize = gridWorldSize(1);
  let daylightTarget = 1;
  let daylight = 1;
  let ghostDef: GhostDef | null = null;
  let ghostInfo: GhostInfo | null = null;
  let selectedId: string | null = null;
  let gridFade = 0;

  const buildings: BuildingInstance[] = [];
  const entries = new Map<string, BuiltEntry>();
  const ownedMaterials: Array<THREE.Material> = [];
  const ownedGeometries: Array<THREE.BufferGeometry> = [];
  const ghostMeshes: THREE.Object3D[] = [];

  // ----------------------------- Plateau -----------------------------
  // Régolithe : on réutilise le matériau de sol de la scène lunaire pour que
  // le plateau se fonde parfaitement dans le terrain.
  LunarMaterials.init();
  const regolithBase = LunarMaterials.materials.regolith as THREE.MeshStandardMaterial;
  const plateauMat = regolithBase.clone();
  plateauMat.color = new THREE.Color(0xa8a49b);
  plateauMat.roughness = 1;
  plateauMat.metalness = 0.02;
  ownedMaterials.push(plateauMat);
  const plateauGeo = new THREE.BoxGeometry(1, 0.03, 1);
  ownedGeometries.push(plateauGeo);
  const plateau = new THREE.Mesh(plateauGeo, plateauMat);
  plateau.position.y = 0.015;
  root.add(plateau);

  // Bordure lumineuse du plateau.
  const borderMat = new THREE.MeshBasicMaterial({ color: 0x35b4d6, transparent: true, opacity: 0.38 });
  ownedMaterials.push(borderMat);
  const borderGroup = new THREE.Group();
  root.add(borderGroup);
  const borderGeo = new THREE.BoxGeometry(1, 0.008, 0.012);
  ownedGeometries.push(borderGeo);
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(borderGeo, borderMat);
    bar.userData.borderIndex = i;
    borderGroup.add(bar);
  }

  const buildBorder = (size: number) => {
    borderGroup.children.forEach((bar, i) => {
      const mesh = bar as THREE.Mesh;
      if (i < 2) {
        mesh.scale.set(size + 0.012, 1, 1);
        mesh.position.set(0, 0.034, i === 0 ? -size / 2 : size / 2);
      } else {
        mesh.scale.set(1, 1, size + 0.012);
        mesh.position.set(i === 2 ? -size / 2 : size / 2, 0.034, 0);
      }
    });
  };
  buildBorder(targetSize);

  // Quadrillage.
  const gridMat = new THREE.LineBasicMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0.1 });
  ownedMaterials.push(gridMat);
  const gridGroup = new THREE.Group();
  root.add(gridGroup);
  let gridGeometry: THREE.BufferGeometry | null = null;

  const buildGrid = (tierValue: number) => {
    const n = tierDef(tierValue).grid;
    const half = n / 2;
    const pts: number[] = [];
    for (let i = 0; i <= n; i++) {
      const p = (i - half) * CELL_SIZE;
      const end = half * CELL_SIZE;
      pts.push(p, 0, -end, p, 0, end);
      pts.push(-end, 0, p, end, 0, p);
    }
    if (gridGeometry) gridGeometry.dispose();
    gridGeometry = new THREE.BufferGeometry();
    gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    ownedGeometries.push(gridGeometry);
    gridGroup.clear();
    const lines = new THREE.LineSegments(gridGeometry, gridMat);
    lines.position.y = 0.032;
    gridGroup.add(lines);
    gridFade = 0;
  };

  // Plan de picking invisible (plus large que le plateau : permet le rouge hors limites).
  const pickGeo = new THREE.PlaneGeometry(6, 6);
  ownedGeometries.push(pickGeo);
  const pickMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  });
  ownedMaterials.push(pickMat);
  const pickPlane = new THREE.Mesh(pickGeo, pickMat);
  pickPlane.rotation.x = -Math.PI / 2;
  pickPlane.position.y = 0.02;
  pickPlane.name = 'grid-pick-plane';
  root.add(pickPlane);

  // Sélection.
  const selectMat = new THREE.MeshBasicMaterial({
    color: 0xffb347,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  ownedMaterials.push(selectMat);
  const selectGeo = new THREE.BoxGeometry(1, 1, 1);
  ownedGeometries.push(selectGeo);
  const selectBox = new THREE.Mesh(selectGeo, selectMat);
  const selectEdgesMat = new THREE.LineBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9 });
  ownedMaterials.push(selectEdgesMat);
  const selectEdges = new THREE.LineSegments(new THREE.EdgesGeometry(selectGeo), selectEdgesMat);
  ownedGeometries.push(selectEdges.geometry as THREE.BufferGeometry);
  selectBox.add(selectEdges);
  selectBox.visible = false;
  root.add(selectBox);

  // ----------------------------- Fantôme -----------------------------
  const ghostOk = new THREE.MeshStandardMaterial({
    color: 0x5dff9e,
    emissive: 0x1f8a52,
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  const ghostBad = new THREE.MeshStandardMaterial({
    color: 0xff5577,
    emissive: 0x8a1f33,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  ownedMaterials.push(ghostOk, ghostBad);
  const ghostGeo = new THREE.BoxGeometry(1, 1, 1);
  ownedGeometries.push(ghostGeo);
  const ghostBox = new THREE.Mesh(ghostGeo, ghostOk);
  const ghostOkEdges = new THREE.LineBasicMaterial({ color: 0x5dff9e, transparent: true, opacity: 0.95 });
  const ghostBadEdges = new THREE.LineBasicMaterial({ color: 0xff5577, transparent: true, opacity: 0.95 });
  ownedMaterials.push(ghostOkEdges, ghostBadEdges);
  const ghostEdges = new THREE.LineSegments(new THREE.EdgesGeometry(ghostGeo), ghostOkEdges);
  ghostBox.add(ghostEdges);
  ghostBox.visible = false;
  root.add(ghostBox);
  ghostMeshes.push(ghostBox);

  // --------------------------- Bâtiments 3D ---------------------------
  const makePlinth = (wWorld: number, dWorld: number) => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(wWorld, 0.012, dWorld),
      mat(0x4d5563, { roughness: 0.72, metalness: 0.4 })
    );
    base.position.y = 0.006;
    g.add(base);
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(wWorld * 0.94, 0.006, dWorld * 0.94),
      mat(0x2b3240, { roughness: 0.6, metalness: 0.5 })
    );
    rim.position.y = 0.014;
    g.add(rim);
    return g;
  };

  const addTank = (
    g: THREE.Group,
    x: number,
    z: number,
    r: number,
    h: number,
    color: number,
    opacity = 1
  ) => {
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 14),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: opacity < 1 ? 0.35 : 0.12,
        transparent: opacity < 1,
        opacity,
        roughness: 0.25,
        metalness: 0.15,
      })
    );
    shell.position.set(x, h / 2 + 0.012, z);
    g.add(shell);
    return shell;
  };

  interface BuiltVisual {
    group: THREE.Group;
    glowMats: THREE.MeshStandardMaterial[];
    levelAdds: THREE.Object3D[];
    halo: THREE.Object3D | null;
    beacon: THREE.Mesh | null;
  }

  const buildVisual = (key: string): BuiltVisual => {
    const def = BUILDINGS[key];
    const wWorld = def.w * CELL_SIZE * 0.82;
    const dWorld = def.d * CELL_SIZE * 0.82;
    const minSide = Math.min(wWorld, dWorld);
    const group = new THREE.Group();
    const glowMats: THREE.MeshStandardMaterial[] = [];
    const levelAdds: THREE.Object3D[] = [];
    let beacon: THREE.Mesh | null = null;

    const addGlow = (m: THREE.MeshStandardMaterial) => {
      glowMats.push(m);
      return m;
    };

    group.add(makePlinth(wWorld, dWorld));

    if (key === 'hub') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(wWorld * 0.42, wWorld * 0.46, 0.03, 16), mat(PALETTE.hull));
      body.position.y = 0.03;
      group.add(body);
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(wWorld * 0.38, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        addGlow(
          new THREE.MeshStandardMaterial({
            color: PALETTE.glass,
            emissive: 0x2aa8c8,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.7,
            roughness: 0.2,
          })
        )
      );
      dome.position.y = 0.044;
      group.add(dome);
      const spire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.003, 0.005, 0.06, 6),
        mat(PALETTE.hull, { metalness: 0.8 })
      );
      spire.position.y = 0.1;
      group.add(spire);
      beacon = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8), glowMat(0x66f6ff, 1.2));
      beacon.position.y = 0.134;
      group.add(beacon);
    } else if (key === 'solar') {
      for (let i = 0; i < 3; i++) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0025, 0.0035, 0.04, 6),
          mat(PALETTE.gold, { metalness: 0.8 })
        );
        const px = (i - 1) * wWorld * 0.3;
        post.position.set(px, 0.032, 0);
        group.add(post);
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(wWorld * 0.26, 0.004, dWorld * 0.5),
          addGlow(new THREE.MeshStandardMaterial({
            color: 0x214a9a,
            emissive: 0x2f6bff,
            emissiveIntensity: 0.5,
            roughness: 0.25,
            metalness: 0.7,
          }))
        );
        panel.position.set(px, 0.054, 0);
        panel.rotation.x = -0.42;
        group.add(panel);
      }
      const battery = new THREE.Mesh(
        new THREE.CylinderGeometry(0.009, 0.009, 0.026, 10),
        addGlow(glowMat(0xffc94d, 0.7))
      );
      battery.position.set(wWorld * 0.34, 0.025, dWorld * 0.26);
      group.add(battery);
    } else if (key === 'purifier') {
      const block = new THREE.Mesh(new THREE.BoxGeometry(wWorld * 0.44, 0.034, dWorld * 0.44), mat(PALETTE.hull));
      block.position.y = 0.03;
      group.add(block);
      [-1, 1].forEach((s) => {
        const tank = addTank(group, s * wWorld * 0.28, dWorld * 0.16, wWorld * 0.15, 0.06, 0x49c7ff, 0.55);
        tank.material = addGlow(tank.material as THREE.MeshStandardMaterial);
      });
      const turbine = new THREE.Mesh(
        new THREE.BoxGeometry(wWorld * 0.5, 0.006, 0.008),
        mat(PALETTE.hull, { metalness: 0.7 })
      );
      turbine.position.y = 0.058;
      group.add(turbine);
    } else if (key === 'nursery') {
      const soil = new THREE.Mesh(
        new THREE.CylinderGeometry(wWorld * 0.38, wWorld * 0.4, 0.016, 16),
        mat(0x5c3c20, { roughness: 0.95 })
      );
      soil.position.y = 0.022;
      group.add(soil);
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(wWorld * 0.36, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        addGlow(
          new THREE.MeshStandardMaterial({
            color: 0x7effc2,
            emissive: 0x1f9a58,
            emissiveIntensity: 0.4,
            transparent: true,
            opacity: 0.3,
            roughness: 0.15,
          })
        )
      );
      dome.position.y = 0.028;
      group.add(dome);
      for (let i = 0; i < 4; i++) {
        const leaf = new THREE.Mesh(
          new THREE.IcosahedronGeometry(wWorld * 0.07, 0),
          addGlow(glowMat(0x39e07a, 0.7))
        );
        leaf.position.set((i % 2 ? 1 : -1) * wWorld * 0.16, 0.045, (i < 2 ? -1 : 1) * dWorld * 0.14);
        group.add(leaf);
      }
    } else if (key === 'corridor') {
      const r = minSide * 0.4;
      // Tube pleine largeur de la cellule (1.0 au lieu de 0.98) pour éliminer
      // le gap visuel entre le couloir et les bâtiments adjacents.
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, wWorld * 1.0, 16, 1, true),
        mat(PALETTE.hull, { side: THREE.DoubleSide })
      );
      tube.rotation.z = Math.PI / 2;
      tube.position.y = r * 1.05;
      group.add(tube);
      for (let i = -3; i <= 3; i++) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(r, 0.003, 6, 18), mat(PALETTE.hullDark));
        rib.rotation.y = Math.PI / 2;
        rib.position.set(i * wWorld * 0.15, r * 1.05, 0);
        group.add(rib);
      }
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(wWorld * 1.0, 0.004, 0.008),
        addGlow(glowMat(0x7fe8ff, 1.2))
      );
      strip.position.set(0, r * 1.95, 0);
      group.add(strip);
      // Les portes et raccords sont ajoutés par `syncCorridorDoors` : uniquement
      // sur les extrémités réellement raccordées à un module.
    } else if (key === 'forge') {
      const shop = new THREE.Mesh(new THREE.BoxGeometry(wWorld * 0.62, 0.03, dWorld * 0.6), mat(PALETTE.hullDark));
      shop.position.y = 0.03;
      group.add(shop);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(wWorld * 0.68, 0.005, dWorld * 0.66), mat(PALETTE.hull));
      roof.position.y = 0.048;
      group.add(roof);
      const chimney = new THREE.Mesh(
        new THREE.CylinderGeometry(0.007, 0.009, 0.045, 8),
        mat(0x7d8798, { metalness: 0.6 })
      );
      chimney.position.set(wWorld * 0.2, 0.068, -dWorld * 0.12);
      group.add(chimney);
      const fire = new THREE.Mesh(
        new THREE.BoxGeometry(wWorld * 0.24, 0.016, 0.006),
        addGlow(glowMat(0xff7a2f, 1.5))
      );
      fire.position.set(0, 0.03, dWorld * 0.31);
      group.add(fire);
    } else if (key === 'greenhouse') {
      const arch = new THREE.Mesh(
        new THREE.CylinderGeometry(wWorld * 0.34, wWorld * 0.34, dWorld * 0.7, 14, 1, false, 0, Math.PI),
        addGlow(
          new THREE.MeshStandardMaterial({
            color: 0x9effcf,
            emissive: 0x1d9c5a,
            emissiveIntensity: 0.45,
            transparent: true,
            opacity: 0.34,
            roughness: 0.15,
          })
        )
      );
      arch.rotation.x = Math.PI / 2;
      arch.rotation.z = Math.PI / 2;
      arch.position.y = 0.028;
      group.add(arch);
      for (let i = -1; i <= 1; i++) {
        const row = new THREE.Mesh(
          new THREE.BoxGeometry(wWorld * 0.5, 0.006, 0.01),
          addGlow(glowMat(0x49e07a, 0.8))
        );
        row.position.set(0, 0.03, i * dWorld * 0.2);
        group.add(row);
      }
    } else if (key === 'reservoir') {
      [-1, 0, 1].forEach((s) => {
        const tank = addTank(group, s * wWorld * 0.26, 0, wWorld * 0.12, 0.055, 0x3fb6ff, 0.62);
        tank.material = addGlow(tank.material as THREE.MeshStandardMaterial);
      });
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.004, 0.004, wWorld * 0.62, 6),
        mat(PALETTE.gold, { metalness: 0.8 })
      );
      pipe.rotation.z = Math.PI / 2;
      pipe.position.y = 0.035;
      group.add(pipe);
    } else if (key === 'shelter') {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(wWorld * 0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        mat(0x59637a, { roughness: 0.85, metalness: 0.25 })
      );
      shell.scale.y = 0.7;
      shell.position.y = 0.018;
      group.add(shell);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const rib = new THREE.Mesh(
          new THREE.BoxGeometry(0.008, 0.05, 0.012),
          mat(0xb9a14b, { metalness: 0.5 })
        );
        rib.position.set(Math.cos(a) * wWorld * 0.33, 0.025, Math.sin(a) * dWorld * 0.33);
        rib.rotation.y = -a;
        group.add(rib);
      }
      beacon = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 8), addGlow(glowMat(0xffcf4d, 1)));
      beacon.position.y = 0.055;
      group.add(beacon);
    } else if (key === 'lab') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(wWorld * 0.6, 0.03, dWorld * 0.5), mat(PALETTE.hull));
      box.position.y = 0.03;
      group.add(box);
      const dish = new THREE.Mesh(
        new THREE.ConeGeometry(wWorld * 0.16, 0.014, 12, 1, true),
        mat(0xe3edff, { metalness: 0.7, side: THREE.DoubleSide })
      );
      dish.rotation.x = Math.PI * 0.7;
      dish.position.set(wWorld * 0.16, 0.06, -dWorld * 0.1);
      group.add(dish);
      const screen = new THREE.Mesh(
        new THREE.BoxGeometry(wWorld * 0.26, 0.012, 0.004),
        addGlow(glowMat(0x9f7bff, 1.1))
      );
      screen.position.set(0, 0.04, dWorld * 0.26);
      group.add(screen);
    } else if (key === 'powerplant') {
      const reactor = new THREE.Mesh(
        new THREE.CylinderGeometry(wWorld * 0.22, wWorld * 0.26, 0.05, 14),
        mat(PALETTE.hullDark, { metalness: 0.6 })
      );
      reactor.position.y = 0.036;
      group.add(reactor);
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(wWorld * 0.12, wWorld * 0.12, 0.04, 12),
        addGlow(glowMat(0xffa62b, 1.6))
      );
      core.position.y = 0.05;
      group.add(core);
      for (let i = 0; i < 2; i++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(wWorld * 0.28 + i * 0.006, 0.0025, 6, 20),
          mat(PALETTE.gold, { metalness: 0.8 })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.03 + i * 0.012;
        group.add(ring);
      }
    } else if (key === 'garage') {
      const hangar = new THREE.Mesh(new THREE.BoxGeometry(wWorld * 0.66, 0.026, dWorld * 0.62), mat(PALETTE.hullDark));
      hangar.position.y = 0.028;
      group.add(hangar);
      const roof = new THREE.Mesh(
        new THREE.CylinderGeometry(dWorld * 0.3, dWorld * 0.3, wWorld * 0.66, 12, 1, false, 0, Math.PI),
        mat(PALETTE.hull)
      );
      roof.rotation.z = Math.PI / 2;
      roof.position.y = 0.041;
      group.add(roof);
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(wWorld * 0.3, 0.018, 0.004),
        addGlow(glowMat(0x66e0ff, 0.7))
      );
      door.position.set(0, 0.028, dWorld * 0.32);
      group.add(door);
      const rover = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.008, 0.026), mat(0xc9d3e3));
      rover.position.set(wWorld * 0.36, 0.02, dWorld * 0.2);
      group.add(rover);
    } else if (key === 'recycler') {
      [-1, 1].forEach((s) => {
        const tank = addTank(group, s * wWorld * 0.24, 0, wWorld * 0.13, 0.048, 0x63f2c4, 0.6);
        tank.material = addGlow(tank.material as THREE.MeshStandardMaterial);
      });
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(wWorld * 0.14, 12, 10),
        addGlow(
          new THREE.MeshStandardMaterial({
            color: 0x8df2d0,
            emissive: 0x2ac99a,
            emissiveIntensity: 0.7,
            transparent: true,
            opacity: 0.65,
          })
        )
      );
      sphere.position.y = 0.038;
      group.add(sphere);
      for (let i = 0; i < 2; i++) {
        const pipe = new THREE.Mesh(
          new THREE.TorusGeometry(wWorld * 0.2, 0.0025, 6, 16, Math.PI),
          mat(PALETTE.gold, { metalness: 0.8 })
        );
        pipe.rotation.x = Math.PI / 2;
        pipe.position.y = 0.016 + i * 0.018;
        group.add(pipe);
      }
    } else if (key === 'shieldgen') {
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(wWorld * 0.24, wWorld * 0.3, 0.02, 12),
        mat(PALETTE.hullDark)
      );
      base.position.y = 0.024;
      group.add(base);
      const pylon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.012, 0.07, 8),
        mat(PALETTE.hull, { metalness: 0.7 })
      );
      pylon.position.y = 0.06;
      group.add(pylon);
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(wWorld * 0.09, 12, 10),
        addGlow(
          new THREE.MeshStandardMaterial({
            color: 0xff7ab8,
            emissive: 0xff3d95,
            emissiveIntensity: 1.4,
            transparent: true,
            opacity: 0.8,
          })
        )
      );
      orb.position.y = 0.1;
      group.add(orb);
      for (let i = 0; i < 2; i++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(wWorld * 0.2 + i * 0.014, 0.0022, 6, 22),
          addGlow(glowMat(0xff7ab8, 1))
        );
        ring.position.y = 0.075 + i * 0.012;
        ring.rotation.x = Math.PI / 2 + i * 0.35;
        group.add(ring);
        levelAdds.push(ring);
      }
    } else {
      const generic = new THREE.Mesh(new THREE.BoxGeometry(wWorld * 0.6, 0.032, dWorld * 0.6), mat(PALETTE.hull));
      generic.position.y = 0.03;
      group.add(generic);
    }

    // Modules supplémentaires débloqués au niveau 2 : deux caissons techniques
    // posés à plat sur la dalle, avec un liseré lumineux de la couleur du module.
    const accent = new THREE.Color(def.accent ?? '#5fe6ff').getHex();
    for (let i = 0; i < 2; i++) {
      const crate = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(minSide * 0.3, 0.018, minSide * 0.2),
        mat(PALETTE.hullDark, { metalness: 0.5 })
      );
      body.position.y = 0.009;
      crate.add(body);
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(minSide * 0.26, 0.004, minSide * 0.06),
        glowMat(accent, 0.9)
      );
      strip.position.y = 0.019;
      crate.add(strip);
      crate.position.set(
        (i === 0 ? -1 : 1) * wWorld * 0.31,
        0.017,
        -dWorld * 0.3
      );
      crate.visible = false;
      group.add(crate);
      levelAdds.push(crate);
    }

    // Halo de niveau max.
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(minSide * 0.42, 0.0025, 6, 24),
      glowMat(def.accent ? new THREE.Color(def.accent).getHex() : 0xffd166, 1.1)
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.044;
    halo.visible = false;
    group.add(halo);

    return { group, glowMats, levelAdds, halo, beacon };
  };

  const applyLevelVisual = (entry: BuiltEntry) => {
    const def = entry.def;
    entry.levelAdds.forEach((obj, idx) => {
      obj.visible = entry.level >= idx + 2;
    });
    if (entry.halo) entry.halo.visible = entry.level >= def.maxLevel - 1 && def.maxLevel > 1;
    entry.glowMats.forEach((m, idx) => {
      const baseIntensity = m.userData.baseIntensity ?? m.emissiveIntensity;
      m.userData.baseIntensity = baseIntensity;
      m.emissiveIntensity = baseIntensity * (0.55 + entry.level * 0.25);
      if (idx === 0) m.emissiveIntensity += (1 - daylight) * 0.5;
    });
  };

  const tagClickable = (entryGroup: THREE.Group, id: string, add: boolean) => {
    entryGroup.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      if (add) {
        child.userData.lunarGridId = id;
        if (!clickable.includes(child)) clickable.push(child);
      } else {
        delete child.userData.lunarGridId;
        const i = clickable.indexOf(child);
        if (i >= 0) clickable.splice(i, 1);
      }
    });
  };

  const placeEntry = (entry: BuiltEntry, defKey: string, x: number, z: number) => {
    const def = BUILDINGS[defKey];
    entry.group.position.set((x + def.w / 2) * CELL_SIZE, 0.032, (z + def.d / 2) * CELL_SIZE);
  };

  // -------------------------------------------------------------------
  // Couloirs : détection automatique des modules reliés + portes intégrées
  // -------------------------------------------------------------------
  const corridorDeco = new Map<string, THREE.Object3D[]>();
  const corridorSig = new Map<string, string>();

  const detachCorridorDeco = (corridorId: string) => {
    const objs = corridorDeco.get(corridorId);
    if (!objs) return;
    objs.forEach((o) => {
      o.parent?.remove(o);
      o.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose?.();
          const m = mesh.material as THREE.Material | THREE.Material[];
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m?.dispose?.();
        }
      });
    });
    corridorDeco.delete(corridorId);
    corridorSig.delete(corridorId);
  };

  /** Premier bâtiment dont l'empreinte touche le couloir sur le côté demandé. */
  const neighbourOfCorridor = (
    b: BuildingInstance,
    side: -1 | 1
  ): BuildingInstance | undefined => {
    const links = corridorNeighbours(buildings, b);
    return side === -1 ? links.west : links.east;
  };

  const buildCorridorDeco = (
    entry: BuiltEntry,
    inst: BuildingInstance,
    west: BuildingInstance | undefined,
    east: BuildingInstance | undefined
  ) => {
    const cdef = BUILDINGS[inst.key];
    const r = Math.min(cdef.w, cdef.d) * CELL_SIZE * 0.82 * 0.4;
    const halfW = (cdef.w * CELL_SIZE * 0.82) / 2;
    const objs: THREE.Object3D[] = [];

    const addDoor = (x: number, connected: boolean, parent: THREE.Object3D) => {
      const grp = new THREE.Group();
      grp.position.set(x, r * 1.05, 0);
      const frame = new THREE.Mesh(
        new THREE.TorusGeometry(r * 0.92, 0.0035, 8, 20),
        mat(PALETTE.hullDark, { metalness: 0.75 })
      );
      frame.rotation.y = Math.PI / 2;
      grp.add(frame);
      const light = new THREE.Mesh(
        new THREE.TorusGeometry(r * 0.72, 0.0028, 6, 18),
        glowMat(connected ? 0x7fe8ff : 0xff6b7a, connected ? 1.1 : 0.7)
      );
      light.rotation.y = Math.PI / 2;
      grp.add(light);
      if (!connected) {
        // Extrémité non raccordée : opercule borgne, pas de fausse porte.
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.004, 18),
          mat(PALETTE.hullDark)
        );
        cap.rotation.z = Math.PI / 2;
        grp.add(cap);
      } else {
        const threshold = new THREE.Mesh(
          new THREE.BoxGeometry(0.012, 0.002, r * 1.5),
          glowMat(0x7fe8ff, 1.4)
        );
        threshold.position.y = -r * 1.04;
        grp.add(threshold);
      }
      parent.add(grp);
      objs.push(grp);
    };

    addDoor(-halfW, !!west, entry.group);
    addDoor(halfW, !!east, entry.group);

    // Porte d'accès correspondante sur la paroi du module raccordé, pour que
    // l'ouverture soit cohérente avec la géométrie (et non posée devant).
    const addModuleDoor = (neighbour: BuildingInstance, side: -1 | 1) => {
      const nd = BUILDINGS[neighbour.key];
      if (!nd) return;
      const nEntry = entries.get(neighbour.id);
      // Les 4 modules d'origine ne sont pas rendus par la grille : leur porte
      // est alors posée directement dans l'espace du plateau.
      const parent = nEntry ? nEntry.group : root;
      const nHalfW = (nd.w * CELL_SIZE * 0.82) / 2;
      const baseX = (neighbour.x + nd.w / 2) * CELL_SIZE;
      const corridorMidZ = (inst.z + cdef.d / 2) * CELL_SIZE;
      const moduleMidZ = (neighbour.z + nd.d / 2) * CELL_SIZE;
      const grp = new THREE.Group();
      if (nEntry) {
        grp.position.set(
          side === 1 ? nHalfW + 0.002 : -nHalfW - 0.002,
          r * 1.05,
          corridorMidZ - moduleMidZ
        );
      } else {
        grp.position.set(baseX + side * (nHalfW + 0.002), r * 1.05, corridorMidZ);
      }
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.004, r * 1.85, r * 1.7),
        mat(PALETTE.hullDark, { metalness: 0.6 })
      );
      grp.add(plate);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r * 0.86, 0.0028, 6, 18),
        glowMat(0x7fe8ff, 1.0)
      );
      ring.rotation.y = Math.PI / 2;
      ring.position.x = side === 1 ? 0.003 : -0.003;
      grp.add(ring);
      parent.add(grp);
      objs.push(grp);
    };
    if (west && BUILDINGS[west.key]) addModuleDoor(west, -1);
    if (east && BUILDINGS[east.key]) addModuleDoor(east, 1);

    corridorDeco.set(inst.id, objs);
  };

  const syncCorridorDoors = () => {
    buildings.forEach((b) => {
      if (b.key !== 'corridor' || !entries.get(b.id)) return;
      const inst = entries.get(b.id);
      if (!inst) return;
      const west = neighbourOfCorridor(b, -1);
      const east = neighbourOfCorridor(b, 1);
      // Une seule extrémité -> couloir en impasse : on le signale visuellement.
      const sig = corridorLinkSignature({ west, east });
      if (corridorSig.get(b.id) === sig) return;
      detachCorridorDeco(b.id);
      buildCorridorDeco(inst, b, west, east);
      corridorSig.set(b.id, sig);
    });
  };

  const removeEntry = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    if (entry.def.key === 'corridor') detachCorridorDeco(id);
    tagClickable(entry.group, id, false);
    root.remove(entry.group);
    entry.group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry?.dispose?.();
    });
    entries.delete(id);
    if (selectedId === id) select(null);
  };

  const sync = (list: GridBuildingSync[]) => {
    // Met à jour la liste logique utilisée par la validation de placement.
    // Tous les bâtiments comptent pour les collisions, y compris les 4 bâtiments
    // d'origine (non rendus ici : leurs animations vivent dans LunarBaseScene).
    buildings.length = 0;
    list.forEach((b) => {
      if (!BUILDINGS[b.key]) return;
      buildings.push({ id: b.id, key: b.key, x: b.x, z: b.z, level: b.level });
    });

    const seen = new Set<string>();
    list.forEach((b) => {
      const def = BUILDINGS[b.key];
      if (!def || def.existing) return;
      seen.add(b.id);
      let entry = entries.get(b.id);
      if (!entry) {
        const visual = buildVisual(b.key);
        entry = {
          def,
          group: visual.group,
          level: 0,
          pop: 1,
          glowMats: visual.glowMats,
          levelAdds: visual.levelAdds,
          halo: visual.halo,
          beacon: visual.beacon,
          x: b.x,
          z: b.z,
        };
        entries.set(b.id, entry);
        placeEntry(entry, b.key, b.x, b.z);
        root.add(entry.group);
        tagClickable(entry.group, b.id, true);
        entry.group.scale.set(0.001, 0.0016, 0.001);
        entry.pop = 0;
      }
      if (entry.level !== b.level) {
        entry.level = b.level;
        entry.pop = 0;
        applyLevelVisual(entry);
      }
      if (entry.x !== b.x || entry.z !== b.z) {
        entry.x = b.x;
        entry.z = b.z;
        placeEntry(entry, b.key, b.x, b.z);
      }
    });

    Array.from(entries.keys()).forEach((id) => {
      if (!seen.has(id)) removeEntry(id);
    });
    syncCorridorDoors();
  };

  const select = (id: string | null) => {
    selectedId = id;
    if (!id) {
      selectBox.visible = false;
      return;
    }
    const found = entries.get(id);
    const inst = buildings.find((b) => b.id === id);
    if (!found || !inst) {
      selectBox.visible = false;
      return;
    }
    const def = BUILDINGS[inst.key];
    selectBox.visible = true;
    selectBox.scale.set(def.w * CELL_SIZE * 1.02, 0.12, def.d * CELL_SIZE * 1.02);
    selectBox.position.set(
      (inst.x + def.w / 2) * CELL_SIZE,
      0.06,
      (inst.z + def.d / 2) * CELL_SIZE
    );
  };

  const setGhost = (def: GhostDef | null) => {
    ghostDef = def;
    if (!def) {
      ghostBox.visible = false;
      ghostInfo = null;
      return;
    }
    const h = 0.055 + Math.min(0.05, def.w * def.d * 0.0015);
    ghostBox.scale.set(def.w * CELL_SIZE * 0.94, h, def.d * CELL_SIZE * 0.94);
    ghostBox.visible = true;
    ghostInfo = null;
  };

  const updateGhost = (raycaster: THREE.Raycaster): GhostInfo | null => {
    if (!ghostDef) return null;
    const hits = raycaster.intersectObject(pickPlane, false);
    if (hits.length === 0) {
      ghostBox.visible = false;
      ghostInfo = null;
      return null;
    }
    // Coordonnées locales du plateau (le plan de picking est tourné : on passe
    // par le groupe racine pour obtenir un x/z de grille correct).
    const local = root.worldToLocal(hits[0].point.clone());
    const cell = worldToCell(local.x, local.z);
    const anchor = anchorUnderCursor(ghostDef.key, cell);
    const check = canPlace(ghostDef.key, anchor.x, anchor.z, buildings, tier);
    const def = BUILDINGS[ghostDef.key];

    ghostBox.visible = true;
    ghostBox.scale.set(def.w * CELL_SIZE * 0.94, 0.06, def.d * CELL_SIZE * 0.94);
    ghostBox.position.set(
      (anchor.x + def.w / 2) * CELL_SIZE,
      0.036,
      (anchor.z + def.d / 2) * CELL_SIZE
    );
    ghostBox.material = check.ok ? ghostOk : ghostBad;
    ghostEdges.material = check.ok ? ghostOkEdges : ghostBadEdges;
    ghostInfo = { x: anchor.x, z: anchor.z, valid: check.ok, reason: check.reason };
    return ghostInfo;
  };

  const pickBuildingId = (raycaster: THREE.Raycaster): string | null => {
    const hits = raycaster.intersectObjects(clickable, false);
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (obj.userData.lunarGridId) return obj.userData.lunarGridId as string;
        obj = obj.parent;
      }
    }
    return null;
  };

  const setTier = (nextTier: number) => {
    if (nextTier === tier) return;
    tier = nextTier;
    targetSize = gridWorldSize(tier);
    buildGrid(tier);
    buildBorder(targetSize);
  };

  // État initial : le plateau a directement la taille du palier courant.
  buildGrid(tier);
  plateau.scale.set(targetSize, 1, targetSize);
  gridFade = 1;

  const update = (dt: number, elapsed: number) => {
    // Extension animée du plateau.
    const current = plateau.scale.x;
    if (Math.abs(current - targetSize) > 0.0005) {
      const next = current + (targetSize - current) * Math.min(1, dt * 3.2);
      plateau.scale.set(next, 1, next);
    }
    gridFade = Math.min(1, gridFade + dt * 2.2);
    gridMat.opacity = 0.1 * gridFade;
    borderMat.opacity = 0.38 * gridFade;

    daylight += (daylightTarget - daylight) * Math.min(1, dt * 2.5);
    plateauMat.color.setRGB(
      0.72 - (1 - daylight) * 0.24,
      0.71 - (1 - daylight) * 0.21,
      0.68 - (1 - daylight) * 0.14
    );

    // Pulsation du fantôme.
    if (ghostBox.visible) {
      const pulse = 1 + Math.sin(elapsed * 5) * 0.02;
      ghostBox.scale.y = 0.06 * pulse;
    }

    // Sélection.
    if (selectBox.visible) {
      selectMat.opacity = 0.12 + Math.sin(elapsed * 3) * 0.05;
    }

    // Bâtiments : apparition élastique, halos, balises, lumières de nuit.
    entries.forEach((entry) => {
      if (entry.pop < 1) {
        entry.pop = Math.min(1, entry.pop + dt * 2.4);
        const pop = entry.pop;
        const overshoot = 1 + Math.sin(Math.min(1, pop) * Math.PI) * 0.12;
        const s = 0.001 + pop * overshoot;
        entry.group.scale.set(s, s * 1.6, s);
        if (pop >= 1) entry.group.scale.set(1, 1.6, 1);
      }
      if (entry.halo && entry.halo.visible) {
        entry.halo.rotation.z = elapsed * 0.9;
        (entry.halo as THREE.Mesh).scale.setScalar(1 + Math.sin(elapsed * 2.4) * 0.05);
      }
      if (entry.beacon) {
        const blink = 0.55 + (Math.sin(elapsed * 4 + entry.x) * 0.5 + 0.5) * 0.9;
        (entry.beacon.material as THREE.MeshStandardMaterial).emissiveIntensity = blink;
      }
      entry.glowMats.forEach((m) => {
        const base = m.userData.baseIntensity ?? m.emissiveIntensity;
        m.userData.baseIntensity = base;
        m.emissiveIntensity = base * (0.5 + (1 - daylight) * 0.9);
      });
    });
  };

  const dispose = () => {
    entries.forEach((entry) => {
      entry.group.traverse((child) => {
        const m = child as THREE.Mesh;
        if (m.isMesh) m.geometry?.dispose?.();
      });
    });
    entries.clear();
    ownedGeometries.forEach((g) => g.dispose());
    ownedMaterials.forEach((m) => m.dispose());
    parent.remove(root);
  };

  return {
    root,
    setTier,
    sync,
    setGhost,
    updateGhost,
    currentGhost: () => ghostInfo,
    select,
    setVisible: (visible: boolean) => {
      root.visible = visible;
    },
    setDaylight: (factor: number) => {
      daylightTarget = Math.max(0, Math.min(1, factor));
    },
    pickBuildingId,
    update,
    dispose,
  };
}
