import { BLOCKED_RECTS, BUILDINGS, CELL_SIZE, TIERS, tierDef } from './buildings';
import { BuildingInstance } from './types';

// =========================================================================
// Grille de construction (logique pure, testable sans Three.js)
// Convention : x / z = coin haut-gauche de l'empreinte, en cases.
// Une grille de taille N couvre les cases -N/2 .. N/2-1 sur les deux axes.
// =========================================================================

export interface Cell {
  x: number;
  z: number;
}

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export type PlacementReason = 'occupied' | 'out-of-bounds' | 'locked' | 'blocked';

export interface PlacementCheck {
  ok: boolean;
  reason?: PlacementReason;
}

export function footprintRect(defKey: string, x: number, z: number): Rect {
  const def = BUILDINGS[defKey];
  return { x, z, w: def?.w ?? 1, d: def?.d ?? 1 };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;
}

export function rectCells(rect: Rect): Cell[] {
  const cells: Cell[] = [];
  for (let dx = 0; dx < rect.w; dx++) {
    for (let dz = 0; dz < rect.d; dz++) {
      cells.push({ x: rect.x + dx, z: rect.z + dz });
    }
  }
  return cells;
}

export function gridBounds(tier: number): { min: number; max: number } {
  const n = tierDef(tier).grid;
  return { min: -n / 2, max: n / 2 - 1 };
}

export function isRectInBounds(rect: Rect, tier: number): boolean {
  const { min, max } = gridBounds(tier);
  return rect.x >= min && rect.z >= min && rect.x + rect.w - 1 <= max && rect.z + rect.d - 1 <= max;
}

/** Rectangles occupés par les bâtiments posés (hors bâtiment ignoré). */
export function occupiedRects(buildings: BuildingInstance[], ignoreId?: string): Rect[] {
  const rects: Rect[] = [];
  buildings.forEach((b) => {
    if (b.id === ignoreId) return;
    const def = BUILDINGS[b.key];
    if (!def) return;
    rects.push({ x: b.x, z: b.z, w: def.w, d: def.d });
  });
  return rects.concat(BLOCKED_RECTS);
}

export function canPlace(
  defKey: string,
  x: number,
  z: number,
  buildings: BuildingInstance[],
  tier: number,
  ignoreId?: string
): PlacementCheck {
  const def = BUILDINGS[defKey];
  if (!def) return { ok: false, reason: 'locked' };
  if (def.tier > tier) return { ok: false, reason: 'locked' };
  const rect = footprintRect(defKey, x, z);
  if (!isRectInBounds(rect, tier)) return { ok: false, reason: 'out-of-bounds' };
  const occupied = occupiedRects(buildings, ignoreId);
  if (occupied.some((r) => rectsOverlap(rect, r))) return { ok: false, reason: 'occupied' };
  return { ok: true };
}

/** Centre monde (coordonnées locales du plateau) d'une empreinte. */
export function rectCenterWorld(rect: Rect): { x: number; z: number } {
  return {
    x: (rect.x + rect.w / 2) * CELL_SIZE,
    z: (rect.z + rect.d / 2) * CELL_SIZE,
  };
}

/** Convertit un point local (unités monde) en case sous le curseur. */
export function worldToCell(localX: number, localZ: number): Cell {
  return { x: Math.floor(localX / CELL_SIZE), z: Math.floor(localZ / CELL_SIZE) };
}

/** Ancre pour centrer une empreinte sous le curseur. */
export function anchorUnderCursor(defKey: string, cell: Cell): Cell {
  const def = BUILDINGS[defKey];
  if (!def) return cell;
  return { x: cell.x - Math.floor(def.w / 2), z: cell.z - Math.floor(def.d / 2) };
}

/** Cherche une case libre proche du centre (utile au clic sur un bouton du catalogue). */
export function findFreeSpot(
  defKey: string,
  buildings: BuildingInstance[],
  tier: number
): Cell | null {
  const def = BUILDINGS[defKey];
  if (!def) return null;
  const { min, max } = gridBounds(tier);
  const maxRadius = Math.max(Math.abs(min), Math.abs(max));
  for (let r = 0; r <= maxRadius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = -Math.floor(def.w / 2) + dx;
        const z = -Math.floor(def.d / 2) + dz;
        if (canPlace(defKey, x, z, buildings, tier).ok) return { x, z };
      }
    }
  }
  return null;
}

export function gridWorldSize(tier: number): number {
  return tierDef(tier).grid * CELL_SIZE;
}

export const TIER_GRID_CELLS = TIERS.map((t) => t.grid);
