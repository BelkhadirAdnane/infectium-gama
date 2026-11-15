// Moteur de ressources de la base lunaire — dérivé des niveaux des 4 bâtiments
// déjà présents dans la scène Three.js (hub, solar, purifier, nursery, niveaux 0-3).
// Les valeurs sont des paramètres de gameplay, pas des données scientifiques officielles.

export type ResourceKey = 'o2' | 'h2o' | 'energy' | 'food';

export interface ResourceState {
  resources: Record<ResourceKey, number>;
  radiation: number;
  points: number;
  alive: boolean;
}

export const RESOURCE_META: Record<ResourceKey, { label: string; icon: string; color: string }> = {
  o2: { label: 'Oxygène', icon: '🫧', color: '#5ec8ff' },
  h2o: { label: 'Eau (H2O)', icon: '💧', color: '#3ea0ff' },
  energy: { label: 'Énergie', icon: '⚡', color: '#ffd84d' },
  food: { label: 'Nourriture', icon: '🍽️', color: '#7dde7d' },
};

export function createInitialResourceState(): ResourceState {
  return {
    resources: { o2: 55, h2o: 55, energy: 35, food: 45 },
    radiation: 15,
    points: 0,
    alive: true,
  };
}

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

/** Avance la simulation d'une seconde, en fonction des niveaux actuels des bâtiments. */
export function tickResources(
  state: ResourceState,
  levels: Record<string, number>
): ResourceState {
  if (!state.alive) return state;
  const hub = levels.hub ?? 0;
  const solar = levels.solar ?? 0;
  const purifier = levels.purifier ?? 0;
  const nursery = levels.nursery ?? 0;

  const resources = { ...state.resources };

  // Production (dépend des niveaux de bâtiments reconstruits/améliorés)
  resources.energy = clamp(resources.energy + solar * 0.35 + (hub > 0 ? 0.1 : 0));
  resources.h2o = clamp(resources.h2o + purifier * 0.35);
  resources.food = clamp(resources.food + nursery * 0.3);
  resources.o2 = clamp(resources.o2 + (hub > 0 ? 0.15 + hub * 0.1 : 0));

  // Consommation vitale de l'équipage (constante, indépendante des bâtiments)
  resources.o2 = clamp(resources.o2 - 0.2);
  resources.h2o = clamp(resources.h2o - 0.12);
  resources.food = clamp(resources.food - 0.1);
  resources.energy = clamp(resources.energy - 0.08);

  // La radiation diminue lentement d'elle-même ; un hub de niveau élevé protège un peu mieux.
  const shieldFactor = 1 - hub * 0.12;
  const radiation = clamp(state.radiation - 0.1, 0, 100);

  // Une radiation élevée abîme nourriture et eau (cultures/filtration dégradées)
  if (radiation > 70) {
    resources.food = clamp(resources.food - 0.2 * shieldFactor);
    resources.h2o = clamp(resources.h2o - 0.1 * shieldFactor);
  }

  const alive = resources.o2 > 0;

  return { ...state, resources, radiation, alive };
}

export function applyRadiationSpike(state: ResourceState, intensity: number, hubLevel: number): ResourceState {
  const shieldFactor = 1 - hubLevel * 0.12;
  return { ...state, radiation: clamp(state.radiation + intensity * 0.4 * shieldFactor, 0, 100) };
}

export function applyQuizReward(state: ResourceState, points: number): ResourceState {
  return { ...state, points: state.points + points };
}
