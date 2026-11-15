import * as THREE from 'three';
import { clamp01 } from './noise';

// =========================================================================
// ARTEMIS II VOYAGE SYSTEM
// Vaisseau Orion + SLS, trajectoire translunaire courbe, jalons temporels
// =========================================================================

export interface ArtemisMilestone {
  date: string;
  label: string;
  detail: string;
}

export const ARTEMIS_MILESTONES: ArtemisMilestone[] = [
  {
    date: '1er AVRIL',
    label: 'Lancement depuis la Terre',
    detail: 'Décollage SLS & vaisseau Orion — séparation des boosters en orbite terrestre',
  },
  {
    date: '2 AVRIL',
    label: 'Injection translunaire (TLI)',
    detail: "Départ de l'orbite terrestre sur la trajectoire courbe vers la Lune",
  },
  {
    date: '6 AVRIL',
    label: 'Survol lunaire — Face cachée',
    detail: "Passage au-dessus de la face cachée de la Lune et lever de Terre",
  },
  {
    date: '10 AVRIL',
    label: "Arc de retour & approche",
    detail: "Boucle de retour libre et largage vers la zone d'alunissage",
  },
];

export interface ArtemisVoyageSystem {
  group: THREE.Group;
  getMilestoneIndex: (progress: number) => number;
  updateTrajectory: (
    earthPos: THREE.Vector3,
    moonWorld: THREE.Vector3,
    flightT: number,
    elapsed: number,
    outCamPos: THREE.Vector3,
    outCamLook: THREE.Vector3
  ) => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

export function createArtemisVoyage(): ArtemisVoyageSystem {
  const root = new THREE.Group();
  root.visible = false;

  // -------------------------------------------------------------------------
  // 1. VAISSEAU ORION + MODULE DE SERVICE (ESM) + ÉTAGE SLS
  // -------------------------------------------------------------------------
  const craftGroup = new THREE.Group();

  const capsuleMat = new THREE.MeshStandardMaterial({
    color: 0xf4f7fc, roughness: 0.35, metalness: 0.25,
  });
  const heatShieldMat = new THREE.MeshStandardMaterial({
    color: 0x262b36, roughness: 0.7, metalness: 0.3,
  });
  const esmMat = new THREE.MeshStandardMaterial({
    color: 0xd8dfe8, roughness: 0.4, metalness: 0.55,
  });
  const solarMat = new THREE.MeshStandardMaterial({
    color: 0x1644b8, emissive: 0x071b59, emissiveIntensity: 0.55,
    roughness: 0.25, metalness: 0.75,
  });

  // Module de commande Orion (cône)
  const capsule = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.22, 18), capsuleMat);
  capsule.rotation.x = Math.PI / 2;
  capsule.position.z = 0.24;
  craftGroup.add(capsule);

  // Bouclier thermique
  const heatShield = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.04, 18), heatShieldMat);
  heatShield.rotation.x = Math.PI / 2;
  heatShield.position.z = 0.12;
  craftGroup.add(heatShield);

  // Module de service européen (ESM)
  const esm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.22, 18), esmMat);
  esm.rotation.x = Math.PI / 2;
  esm.position.z = -0.01;
  craftGroup.add(esm);

  // 4 panneaux solaires en X caractéristiques d'Orion
  const solarWings = new THREE.Group();
  solarWings.position.z = -0.02;
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 4) + (i * Math.PI) / 2;
    const arm = new THREE.Group();
    arm.rotation.z = angle;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.012, 0.11), solarMat);
    panel.position.x = 0.33;
    panel.rotation.x = 0.25;
    arm.add(panel);
    solarWings.add(arm);
  }
  craftGroup.add(solarWings);

  // Étage cryogénique SLS ICPS
  const slsStage = new THREE.Group();
  const icpsBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.14, 0.42, 18),
    new THREE.MeshStandardMaterial({ color: 0xd96b27, roughness: 0.65, metalness: 0.15 })
  );
  icpsBody.rotation.x = Math.PI / 2;
  icpsBody.position.z = -0.34;
  slsStage.add(icpsBody);

  // Deux boosters latéraux
  const boosters: THREE.Mesh[] = [];
  ([-0.19, 0.19] as number[]).forEach((bx) => {
    const srb = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.055, 0.52, 12),
      capsuleMat
    );
    srb.rotation.x = Math.PI / 2;
    srb.position.set(bx, 0, -0.32);
    slsStage.add(srb);
    boosters.push(srb);
  });
  craftGroup.add(slsStage);

  // Panache moteur
  const plumeMat = new THREE.MeshBasicMaterial({
    color: 0x72e6ff, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const plume = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 12), plumeMat);
  plume.rotation.x = -Math.PI / 2;
  plume.position.z = -0.8;
  craftGroup.add(plume);

  const craftLight = new THREE.PointLight(0x88dcff, 1.4, 8);
  craftLight.position.set(0, 0.3, -0.4);
  craftGroup.add(craftLight);

  root.add(craftGroup);

  // -------------------------------------------------------------------------
  // 2. TRAJECTOIRE TRANSLUNAIRE COURBE
  // -------------------------------------------------------------------------
  const trajPointsCount = 120;
  const trajPositions = new Float32Array(trajPointsCount * 3);
  const trajGeo = new THREE.BufferGeometry();
  trajGeo.setAttribute('position', new THREE.BufferAttribute(trajPositions, 3));
  const trajMat = new THREE.LineBasicMaterial({
    color: 0x4de1ff, transparent: true, opacity: 0.45,
  });
  const trajLine = new THREE.Line(trajGeo, trajMat);
  root.add(trajLine);

  const _tmpUp = new THREE.Vector3(0, 1, 0);
  const _tmpDir = new THREE.Vector3();
  const _tmpSide = new THREE.Vector3();
  const _tmpNextPos = new THREE.Vector3();

  function buildCurve(earthPos: THREE.Vector3, moonWorld: THREE.Vector3): THREE.CatmullRomCurve3 {
    _tmpDir.subVectors(moonWorld, earthPos);
    const dist = Math.max(0.001, _tmpDir.length());
    _tmpDir.normalize();
    _tmpSide.crossVectors(_tmpUp, _tmpDir).normalize();

    // 1er avril : orbite basse terrestre
    const p0Launch = earthPos.clone()
      .addScaledVector(_tmpDir, 1.8)
      .addScaledVector(_tmpSide, -2.2)
      .add(new THREE.Vector3(0, 1.3, 0));

    // 2 avril : injection translunaire
    const p1Orbit = earthPos.clone()
      .addScaledVector(_tmpDir, dist * 0.22)
      .addScaledVector(_tmpSide, -dist * 0.45)
      .add(new THREE.Vector3(0, 2.2, 0));

    const p2MidTLI = earthPos.clone()
      .addScaledVector(_tmpDir, dist * 0.62)
      .addScaledVector(_tmpSide, -dist * 0.36)
      .add(new THREE.Vector3(0, 1.6, 0));

    // 6 avril : face cachée
    const p3NearSide = moonWorld.clone()
      .addScaledVector(_tmpDir, 0.35)
      .addScaledVector(_tmpSide, -1.55)
      .add(new THREE.Vector3(0, 0.65, 0));

    const p4FarSide = moonWorld.clone()
      .addScaledVector(_tmpDir, 1.65)
      .add(new THREE.Vector3(0, 0.35, 0));

    // 10 avril : boucle de retour libre
    const p5ReturnArc = moonWorld.clone()
      .addScaledVector(_tmpDir, -0.4)
      .addScaledVector(_tmpSide, 1.5)
      .add(new THREE.Vector3(0, 0.85, 0));

    const p6Descent = moonWorld.clone()
      .addScaledVector(_tmpDir, -0.95)
      .add(new THREE.Vector3(0, 1.05, 0));

    return new THREE.CatmullRomCurve3(
      [p0Launch, p1Orbit, p2MidTLI, p3NearSide, p4FarSide, p5ReturnArc, p6Descent],
      false, 'catmullrom', 0.55
    );
  }

  function getMilestoneIndex(progress: number): number {
    if (progress < 0.22) return 0; // 1er avril
    if (progress < 0.48) return 1; // 2 avril
    if (progress < 0.78) return 2; // 6 avril
    return 3;                       // 10 avril
  }

  return {
    group: root,
    getMilestoneIndex,
    setVisible(v: boolean) { root.visible = v; },

    updateTrajectory(earthPos, moonWorld, flightT, elapsed, outCamPos, outCamLook) {
      const curve = buildCurve(earthPos, moonWorld);

      // Mettre à jour la trajectoire visuelle
      const attr = trajGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < trajPointsCount; i++) {
        const pt = curve.getPoint(i / (trajPointsCount - 1));
        attr.setXYZ(i, pt.x, pt.y, pt.z);
      }
      attr.needsUpdate = true;

      const t = clamp01(flightT);
      const pos = curve.getPointAt(t);
      const lookT = Math.min(1, t + 0.02);
      curve.getPointAt(lookT, _tmpNextPos);

      craftGroup.position.copy(pos);
      if (lookT > t) craftGroup.lookAt(_tmpNextPos);

      // Séparation des boosters (1er avril, t < 0.26)
      boosters.forEach((b, idx) => {
        if (t < 0.18) {
          b.visible = true;
          b.position.set(idx === 0 ? -0.19 : 0.19, 0, -0.32);
        } else if (t < 0.26) {
          const sep = (t - 0.18) / 0.08;
          b.position.set((idx === 0 ? -1 : 1) * (0.19 + sep * 0.7), -sep * 0.4, -0.32 - sep * 0.9);
          b.visible = true;
        } else {
          b.visible = false;
        }
      });

      // Séparation de l'étage SLS (après 2 avril)
      slsStage.visible = t < 0.42;
      if (t >= 0.34 && t < 0.42) {
        slsStage.position.z = -((t - 0.34) / 0.08) * 1.4;
      } else {
        slsStage.position.z = 0;
      }

      // Déploiement des panneaux solaires après séparation
      const wingDeploy = clamp01((t - 0.22) / 0.15);
      solarWings.scale.setScalar(0.25 + wingDeploy * 0.75);

      // Panache moteur actif lors du lancement, TLI et freinage
      const burning =
        t < 0.22 ||
        (t > 0.24 && t < 0.42) ||
        (t > 0.56 && t < 0.66) ||
        t > 0.84;
      plumeMat.opacity = burning ? 0.55 + Math.sin(elapsed * 32) * 0.25 : 0.08;
      plume.scale.setScalar(burning ? 0.85 + Math.sin(elapsed * 28) * 0.2 : 0.2);
      plume.position.z = slsStage.visible ? -0.78 : -0.34;
      craftLight.intensity = burning ? 1.4 : 0.4;

      // Caméra cinématographique
      const tangent = curve.getTangentAt(t);
      const radialEarth = pos.clone().sub(earthPos).normalize();
      const sideCam = new THREE.Vector3().crossVectors(_tmpUp, tangent).normalize();

      if (t < 0.45) {
        // Terre qui s'éloigne derrière le vaisseau
        outCamPos.copy(pos)
          .addScaledVector(tangent, -1.6)
          .addScaledVector(sideCam, 1.35)
          .add(new THREE.Vector3(0, 0.75, 0));
        outCamLook.lerpVectors(earthPos, pos, 0.55 + t * 0.6);
      } else if (t < 0.78) {
        // Face cachée : la Lune occupe le champ
        outCamPos.copy(pos)
          .addScaledVector(tangent, -1.45)
          .addScaledVector(radialEarth, 0.85)
          .add(new THREE.Vector3(0, 0.55, 0));
        outCamLook.lerpVectors(pos, moonWorld, 0.65);
      } else {
        // Approche finale
        outCamPos.copy(pos)
          .addScaledVector(tangent, -1.25)
          .addScaledVector(sideCam, -0.7)
          .add(new THREE.Vector3(0, 0.45, 0));
        outCamLook.copy(moonWorld);
      }
    },

    dispose() {
      trajGeo.dispose();
      trajMat.dispose();
      capsuleMat.dispose();
      heatShieldMat.dispose();
      esmMat.dispose();
      solarMat.dispose();
      plumeMat.dispose();
    },
  };
}
