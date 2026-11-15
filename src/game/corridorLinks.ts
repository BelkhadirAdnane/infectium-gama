import { BUILDINGS } from './buildings';
import { BuildingInstance } from './types';

// =========================================================================
// Raccordements automatiques des couloirs
// -------------------------------------------------------------------------
// Logique pure (testable sans Three.js) : à partir des empreintes de la
// grille, détermine quels modules sont réellement reliés aux deux extrémités
// d'un couloir. Sert à poser les portes uniquement sur les accès existants.
// =========================================================================

export interface CorridorLinks {
  /** Module touchant l'extrémité ouest (x = x0). */
  west?: BuildingInstance;
  /** Module touchant l'extrémité est (x = x0 + w). */
  east?: BuildingInstance;
}

/** Vrai si les deux empreintes se touchent (tolérance : 1 case de vide). */
function touches(b: BuildingInstance, side: -1 | 1, other: BuildingInstance): boolean {
  const bd = BUILDINGS[b.key];
  const od = BUILDINGS[other.key];
  if (!bd || !od) return false;
  const z0 = b.z;
  const z1 = b.z + bd.d;
  const oz0 = other.z;
  const oz1 = other.z + od.d;
  if (oz0 >= z1 || oz1 <= z0) return false; // aucun recouvrement en profondeur
  const gap = side === -1 ? b.x - (other.x + od.w) : other.x - (b.x + bd.w);
  // Raccordement si les bords se touchent ou sont séparés d'une case au plus.
  return gap >= 0 && gap <= 1;
}

/** Modules reliés aux deux extrémités d'un couloir (dans l'ordre ouest/est). */
export function corridorNeighbours(
  buildings: BuildingInstance[],
  corridor: BuildingInstance
): CorridorLinks {
  const west = buildings.find((o) => o.id !== corridor.id && touches(corridor, -1, o));
  const east = buildings.find((o) => o.id !== corridor.id && touches(corridor, 1, o));
  return { west, east };
}

/** Signature stable des raccordements, pour ne reconstruire que si besoin. */
export function corridorLinkSignature(links: CorridorLinks): string {
  return `${links.west?.id ?? '-'}|${links.east?.id ?? '-'}`;
}
