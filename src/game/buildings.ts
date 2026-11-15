import { BuildingDef, TierDef } from './types';

// =========================================================================
// Catalogue des bâtiments
// ---------------------------------------------------------------
// Les 4 bâtiments d'origine (hub / solar / purifier / nursery) gardent leurs
// animations 3D : ils sont « existants », ancrés sur la grille, et se
// reconstruisent/améliorent par les QCM. Les autres sont de nouveaux modules
// posés librement sur la grille délimitée du plateau lunaire.
// =========================================================================

export const BUILDINGS: Record<string, BuildingDef> = {
  // ------------------------------ PALIER 1 ------------------------------
  hub: {
    key: 'hub',
    name: 'Base centrale',
    short: 'Base',
    icon: '🏠',
    tier: 1,
    w: 12,
    d: 8,
    cost: 0,
    upgradeCost: 15,
    maxLevel: 4,
    existing: true,
    anchor: { x: -6, z: -4 },
    desc: "Cœur de la colonie : régénère l'oxygène et protège l'équipage.",
    produces: { o2: 0.18 },
    consumes: {},
    powerDraw: 0.05,
    defaultPriority: 'high',
    shield: 0.07,
    accent: '#5fe6ff',
  },
  solar: {
    key: 'solar',
    name: 'Panneaux solaires',
    short: 'Solaire',
    icon: '⚡',
    tier: 1,
    w: 6,
    d: 6,
    cost: 0,
    upgradeCost: 15,
    maxLevel: 4,
    existing: true,
    anchor: { x: 7, z: -3 },
    desc: "Produit de l'énergie quand le Soleil éclaire le plateau ; les batteries gardent un minimum la nuit.",
    produces: { energy: 0.55 },
    consumes: {},
    powerDraw: 0,
    accent: '#ffd166',
  },
  purifier: {
    key: 'purifier',
    name: "Purificateur d'eau",
    short: 'Purificateur',
    icon: '💧',
    tier: 1,
    w: 6,
    d: 6,
    cost: 0,
    upgradeCost: 15,
    maxLevel: 4,
    existing: true,
    anchor: { x: -13, z: -3 },
    desc: "Recycle la glace lunaire et l'eau usée en eau potable.",
    produces: { h2o: 0.2 },
    consumes: {},
    powerDraw: 0.05,
    defaultPriority: 'high',
    accent: '#3ea0ff',
  },
  nursery: {
    key: 'nursery',
    name: 'Pépinière',
    short: 'Pépinière',
    icon: '🌱',
    tier: 1,
    w: 8,
    d: 6,
    cost: 0,
    upgradeCost: 15,
    maxLevel: 4,
    existing: true,
    anchor: { x: -4, z: -12 },
    desc: "Cultive la nourriture et renouvelle un peu d'oxygène.",
    produces: { food: 0.16, o2: 0.02 },
    consumes: { h2o: 0.02 },
    powerDraw: 0.04,
    defaultPriority: 'normal',
    accent: '#7dde7d',
  },
  forge: {
    key: 'forge',
    name: 'Atelier de forge',
    short: 'Forge',
    icon: '🛠️',
    tier: 1,
    w: 4,
    d: 3,
    cost: 12,
    upgradeCost: 8,
    maxLevel: 3,
    desc: "Relié à la fusée : fabrique les pièces et alimente le réseau en énergie.",
    produces: { energy: 0.05 },
    consumes: {},
    powerDraw: 0.03,
    defaultPriority: 'normal',
    capacity: { energy: 10 },
    shield: 0.01,
    accent: '#ff9f5a',
  },

  corridor: {
    key: 'corridor',
    name: 'Couloir pressurisé',
    short: 'Couloir',
    icon: '🚇',
    tier: 1,
    w: 4,
    d: 2,
    cost: 10,
    upgradeCost: 6,
    maxLevel: 2,
    desc: 'Tube de liaison pressurisé : relie les modules entre eux (aucune production).',
    produces: {},
    consumes: {},
    powerDraw: 0.005,
    defaultPriority: 'low',
    shield: 0.005,
    accent: '#7fe8ff',
  },

  // ------------------------------ PALIER 2 ------------------------------
  greenhouse: {
    key: 'greenhouse',
    name: 'Serre agricole',
    short: 'Serre',
    icon: '🥬',
    tier: 2,
    w: 6,
    d: 5,
    cost: 30,
    upgradeCost: 14,
    maxLevel: 3,
    desc: 'Cultures intensives : beaucoup de nourriture, un peu moins d’eau disponible.',
    produces: { food: 0.3, o2: 0.04 },
    consumes: { h2o: 0.04 },
    powerDraw: 0.09,
    defaultPriority: 'normal',
    accent: '#5fffa4',
  },
  reservoir: {
    key: 'reservoir',
    name: "Réservoir d'eau",
    short: 'Réservoir',
    icon: '🛢️',
    tier: 2,
    w: 4,
    d: 4,
    cost: 20,
    upgradeCost: 10,
    maxLevel: 3,
    desc: "Stocke une grande réserve d'eau pour passer les longues nuits lunaires.",
    produces: { h2o: 0.06 },
    consumes: {},
    powerDraw: 0.02,
    defaultPriority: 'low',
    capacity: { h2o: 35 },
    accent: '#4fc3ff',
  },
  shelter: {
    key: 'shelter',
    name: 'Abri anti-radiations',
    short: 'Abri',
    icon: '🛡️',
    tier: 2,
    w: 5,
    d: 4,
    cost: 28,
    upgradeCost: 12,
    maxLevel: 3,
    desc: "Blindage épais qui réduit fortement l'exposition de l'équipage.",
    produces: {},
    consumes: {},
    powerDraw: 0.06,
    defaultPriority: 'high',
    shield: 0.18,
    accent: '#ffcf70',
  },
  lab: {
    key: 'lab',
    name: 'Laboratoire',
    short: 'Labo',
    icon: '🔬',
    tier: 2,
    w: 6,
    d: 5,
    cost: 32,
    upgradeCost: 15,
    maxLevel: 3,
    desc: "Analyse les échantillons : chaque bonne réponse rapporte des points bonus.",
    produces: {},
    consumes: { o2: 0.01 },
    powerDraw: 0.06,
    defaultPriority: 'low',
    capacity: { o2: 10 },
    quizBonus: 3,
    accent: '#b18cff',
  },

  // ------------------------------ PALIER 3 ------------------------------
  powerplant: {
    key: 'powerplant',
    name: 'Centrale énergétique',
    short: 'Centrale',
    icon: '🔋',
    tier: 3,
    w: 6,
    d: 5,
    cost: 45,
    upgradeCost: 18,
    maxLevel: 3,
    desc: 'Réacteur de secours : produit de l’énergie même pendant la nuit lunaire.',
    produces: { energy: 0.45 },
    consumes: { h2o: 0.05 },
    powerDraw: 0.03,
    defaultPriority: 'normal',
    capacity: { energy: 20 },
    nightOnly: true,
    accent: '#ffb347',
  },
  garage: {
    key: 'garage',
    name: 'Garage / rover',
    short: 'Garage',
    icon: '🚙',
    tier: 3,
    w: 6,
    d: 4,
    cost: 35,
    upgradeCost: 14,
    maxLevel: 3,
    desc: 'Explore les cratères voisins et rapporte de la glace et des vivres.',
    produces: { h2o: 0.04, food: 0.03 },
    consumes: {},
    powerDraw: 0.05,
    defaultPriority: 'low',
    capacity: { food: 10 },
    shield: 0.05,
    accent: '#ff8f6b',
  },
  recycler: {
    key: 'recycler',
    name: 'Recycleur avancé',
    short: 'Recycleur',
    icon: '♻️',
    tier: 3,
    w: 6,
    d: 5,
    cost: 40,
    upgradeCost: 16,
    maxLevel: 3,
    desc: "Boucle eau + air : réduit les pertes et régénère l'oxygène.",
    produces: { h2o: 0.22, o2: 0.08 },
    consumes: {},
    powerDraw: 0.12,
    defaultPriority: 'high',
    accent: '#6ff2c8',
  },
  shieldgen: {
    key: 'shieldgen',
    name: 'Bouclier radiatif',
    short: 'Bouclier',
    icon: '☢️',
    tier: 3,
    w: 7,
    d: 7,
    cost: 50,
    upgradeCost: 20,
    maxLevel: 3,
    desc: "Champ magnétique de la base entière : la meilleure protection contre les éruptions.",
    produces: {},
    consumes: {},
    powerDraw: 0.24,
    defaultPriority: 'normal',
    shield: 0.3,
    accent: '#ff6fb5',
  },
};

export const BUILDING_LIST = Object.values(BUILDINGS);
export const EXISTING_KEYS = BUILDING_LIST.filter((b) => b.existing).map((b) => b.key);
export const CATALOG = BUILDING_LIST.filter((b) => !b.existing);

export const TIERS: TierDef[] = [
  { tier: 1, name: 'Avant-poste', subtitle: 'Survivre au premier jour lunaire', grid: 32, score: 0 },
  { tier: 2, name: 'Colonie', subtitle: 'Autonomie en eau, air et nourriture', grid: 40, score: 150 },
  { tier: 3, name: 'Bastion lunaire', subtitle: 'Résister aux tempêtes solaires', grid: 48, score: 420 },
];

export function tierDef(tier: number): TierDef {
  return TIERS[Math.min(TIERS.length - 1, Math.max(0, tier - 1))];
}

export function nextTier(tier: number): TierDef | null {
  return TIERS.find((t) => t.tier === tier + 1) ?? null;
}

/** Cases occupées en permanence par le pas de tir de la fusée. */
// Zone du module lunaire posé sur le régolithe (non constructible).
export const BLOCKED_RECTS: Array<{ x: number; z: number; w: number; d: number }> = [
  { x: -12, z: 9, w: 6, d: 6 },
];

export const CELL_SIZE = 0.05;

export const LEGACY_UPGRADE_COST: Record<number, number> = { 2: 18, 3: 30, 4: 45 };

export function buildCost(def: BuildingDef): number {
  return def.cost;
}

export function upgradeCost(def: BuildingDef, currentLevel: number): number {
  const target = currentLevel + 1;
  if (def.existing) return LEGACY_UPGRADE_COST[target] ?? 0;
  return def.upgradeCost * target;
}
