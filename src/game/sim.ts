import {
  BLOCKED_RECTS,
  BUILDINGS,
  CATALOG,
  TIERS,
  buildCost,
  tierDef,
  upgradeCost,
} from './buildings';
import { canPlace, findFreeSpot, isRectInBounds, occupiedRects, rectsOverlap } from './grid';
import {
  BuildingInstance,
  Capacities,
  GameMode,
  GameState,
  ModulePriority,
  ModuleStatus,
  ResourceKey,
  ResourceRate,
  Resources,
  TimeConfig,
  UpkeepInfo,
} from './types';
import {
  DEFAULT_TIME_CONFIG,
  GAME_SECONDS_PER_SIM_SECOND,
  SIM_SECONDS_PER_DAY,
} from './time';

// =========================================================================
// Simulation de la base lunaire
// -------------------------------------------------------------------------
// · cycle jour / nuit lunaire (les panneaux ne produisent que le jour)
// · consommation de l'équipage + production des bâtiments
// · exposition aux radiations (jour, éruptions NASA DONKI, boucliers)
// · santé de l'équipage et conditions d'échec
// Toutes les valeurs sont des paramètres de gameplay, pas des données NASA.
// =========================================================================

export const DAY_FRACTION = 0.62;

const BASE_CAPACITY: Capacities = { o2: 100, h2o: 100, energy: 100, food: 100 };

/** Consommation vitale de l'équipage, par seconde. */
export const CREW_UPKEEP: ResourceRate = { o2: 0.14, h2o: 0.08, energy: 0.08, food: 0.06 };
const CREW_POWER = 0.03;
/** Débit maximal que les batteries peuvent fournir au réseau (unités/s). */
export const BATTERY_DISCHARGE_RATE = 0.26;
/** Rendement plancher d'un module totalement privé d'électricité. */
export const BROWNOUT_FLOOR = 0.4;
/** Perte de rendement maximale due à l'usure. */
export const WEAR_PENALTY = 0.45;

const PRIORITY_RANK: Record<ModulePriority, number> = { high: 0, normal: 1, low: 2 };
export const PRIORITY_LABEL: Record<ModulePriority, string> = {
  high: 'Vitale',
  normal: 'Normale',
  low: 'Économie',
};

export function priorityOf(inst: BuildingInstance): ModulePriority {
  const def = BUILDINGS[inst.key];
  return inst.priority ?? def?.defaultPriority ?? 'normal';
}

export function wearOf(inst: BuildingInstance): number {
  return clamp01(inst.wear ?? 0);
}

export const RESOURCE_META: Record<
  ResourceKey,
  { label: string; icon: string; color: string; critical: number }
> = {
  o2: { label: 'Oxygène', icon: '🫧', color: '#5ec8ff', critical: 0.18 },
  h2o: { label: 'Eau (H2O)', icon: '💧', color: '#3ea0ff', critical: 0.18 },
  energy: { label: 'Énergie', icon: '⚡', color: '#ffd84d', critical: 0.15 },
  food: { label: 'Nourriture', icon: '🍽️', color: '#7dde7d', critical: 0.15 },
};

export function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

/** 1 = plein jour, 0 = nuit lunaire. */
export function daylightFactor(dayT: number): number {
  const t = ((dayT % 1) + 1) % 1;
  if (t >= DAY_FRACTION) return 0;
  return Math.max(0, Math.sin((Math.PI * t) / DAY_FRACTION));
}

export function isDaytime(dayT: number): boolean {
  return daylightFactor(dayT) > 0.02;
}

export function clockLabel(dayT: number, sol: number): string {
  const t = ((dayT % 1) + 1) % 1;
  const minutes = Math.floor(((t * 24 + 6) % 24) * 60);
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `Sol ${sol} · ${hh}:${mm}`;
}

export function createInitialState(
  mode: GameMode = 'junior',
  timeConfig: Partial<TimeConfig> = {}
): GameState {
  const cfg: TimeConfig = {
    ...DEFAULT_TIME_CONFIG,
    ...timeConfig,
    startDateIso: timeConfig.startDateIso ?? new Date().toISOString(),
  };
  // La date de départ par défaut doit être celle du lancement, pas celle du
  // chargement du module.
  if (!timeConfig.startDateIso) cfg.startDateIso = new Date().toISOString();
  return {
    version: 3,
    points: 30,
    score: 0,
    tier: 1,
    resources: { o2: 48, h2o: 48, energy: 30, food: 42 },
    capacities: { ...BASE_CAPACITY },
    radiation: 12,
    health: 100,
    hunger: 82,
    hydration: 82,
    fatigue: 88,
    solarBoostUntil: 0,
    alive: true,
    dayT: 0.12,
    sol: cfg.startSol,
    mode,
    timeConfig: cfg,
    elapsedGameSec: 0.12 * 86400,
    buildings: ['hub', 'solar', 'purifier', 'nursery'].map((key) => ({
      id: key,
      key,
      x: BUILDINGS[key].anchor!.x,
      z: BUILDINGS[key].anchor!.z,
      // La nouvelle séquence d'entrée déploie la base au niveau 1.
      level: 1,
    })),
    spike: 0,
    quizAnswered: 0,
    quizCorrect: 0,
    comms: [],
    commSeq: 1,
    commCompleted: 0,
    stats: {
      solsSurvived: 0,
      stormsSurvived: 0,
      localRepairs: 0,
      earthRequests: 0,
      earthAnswered: 0,
      brownouts: 0,
      harvests: 0,
      maxTier: 1,
    },
    objectivesDone: [],
    journal: [],
    stormActive: false,
    brownoutActive: false,
    failure: null,
  };
}

export function getInstance(state: GameState, id: string): BuildingInstance | undefined {
  return state.buildings.find((b) => b.id === id);
}

export function levelOf(state: GameState, key: string): number {
  return state.buildings.find((b) => b.key === key)?.level ?? 0;
}

export function tierForScore(score: number): 1 | 2 | 3 {
  let tier: 1 | 2 | 3 = 1;
  TIERS.forEach((t) => {
    if (score >= t.score) tier = t.tier;
  });
  return tier;
}

export function nextTierInfo(state: GameState) {
  return TIERS.find((t) => t.tier === state.tier + 1) ?? null;
}

/**
 * Effets cumulés de tous les bâtiments construits (niveau ≥ 1).
 *
 * Réseau électrique : la production solaire/centrale alimente d'abord les
 * modules « vitaux », puis « normaux », puis « économie ». Les modules non
 * alimentés tournent au ralenti (rendement plancher) : une base peut donc
 * posséder beaucoup d'installations sans pouvoir toutes les faire fonctionner.
 */
export function computeUpkeep(state: GameState, daylight: number): UpkeepInfo {
  const production: ResourceRate = { o2: 0, h2o: 0, energy: 0, food: 0 };
  const consumption: ResourceRate = { o2: 0, h2o: 0, energy: 0, food: 0 };
  const capacity: Capacities = { ...BASE_CAPACITY };

  // --- 1. Production électrique brute (indépendante du réseau) ---
  const providers: Array<{ inst: BuildingInstance; amount: number }> = [];
  state.buildings.forEach((inst) => {
    if (inst.level <= 0) return;
    const def = BUILDINGS[inst.key];
    if (!def) return;
    const gen = (def.produces.energy ?? 0) * inst.level * (1 - WEAR_PENALTY * wearOf(inst));
    if (gen <= 0) return;
    let amount = gen;
    if (def.key === 'solar') {
      amount *= 0.1 + 0.9 * daylight;
      if (Date.now() < state.solarBoostUntil) amount *= 1.35;
    }
    providers.push({ inst, amount });
    production.energy += amount;
    if (def.capacity) {
      (Object.keys(def.capacity) as ResourceKey[]).forEach((k) => {
        capacity[k] += (def.capacity?.[k] ?? 0) * inst.level;
      });
    }
  });

  // --- 2. Demande et priorités ---
  const statuses: ModuleStatus[] = [];
  let powerDemand = CREW_POWER;
  state.buildings.forEach((inst) => {
    if (inst.level <= 0) return;
    const def = BUILDINGS[inst.key];
    if (!def) return;
    const priority = priorityOf(inst);
    const wear = wearOf(inst);
    const demand = (def.powerDraw ?? 0) * inst.level * (1 + wear * 0.2);
    powerDemand += demand;
    statuses.push({
      id: inst.id,
      key: inst.key,
      level: inst.level,
      priority,
      demand,
      allocated: 0,
      ratio: demand <= 0 ? 1 : 0,
      efficiency: 1,
      wear,
      brownout: false,
    });
  });

  // --- 3. Distribution : production + décharge limitée des batteries ---
  const discharge = Math.min(BATTERY_DISCHARGE_RATE, state.resources.energy * 0.02);
  let available = production.energy + discharge;
  // L'éclairage et la survie de l'équipage sont toujours prioritaires.
  const crewAllocated = Math.min(CREW_POWER, available);
  available -= crewAllocated;
  let powerAllocated = crewAllocated;

  const ordered = [...statuses].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  );
  for (const rank of [0, 1, 2] as const) {
    const group = ordered.filter((s) => PRIORITY_RANK[s.priority] === rank);
    const groupDemand = group.reduce((sum, s) => sum + s.demand, 0);
    if (groupDemand <= 0) continue;
    const share = Math.min(1, available / groupDemand);
    for (const s of group) {
      s.allocated = s.demand * share;
      s.ratio = s.demand > 0 ? share : 1;
      powerAllocated += s.allocated;
    }
    available = Math.max(0, available - groupDemand * share);
  }

  // --- 4. Rendements et effets des modules ---
  let shield = 0;
  let quizBonus = 0;
  state.buildings.forEach((inst) => {
    if (inst.level <= 0) return;
    const def = BUILDINGS[inst.key];
    if (!def) return;
    const status = statuses.find((s) => s.id === inst.id)!;
    const powerEff = BROWNOUT_FLOOR + (1 - BROWNOUT_FLOOR) * status.ratio;
    // Au-delà de 95 % d'usure, le module est considéré hors service : il ne
    // fournit plus qu'un filet de sécurité tant qu'il n'est pas réparé.
    const breakdown = status.wear >= 0.95 ? 0.3 : 1;
    const efficiency = clamp01(powerEff * (1 - WEAR_PENALTY * status.wear) * breakdown);
    status.efficiency = efficiency;
    status.brownout = status.demand > 0 && status.ratio < 0.999;

    (Object.keys(def.produces) as ResourceKey[]).forEach((k) => {
      if (k === 'energy') return; // déjà comptée dans la production brute
      production[k] += (def.produces[k] ?? 0) * inst.level * efficiency;
    });
    (Object.keys(def.consumes) as ResourceKey[]).forEach((k) => {
      if (k === 'energy') return;
      consumption[k] += (def.consumes[k] ?? 0) * inst.level;
    });
    if (def.capacity) {
      (Object.keys(def.capacity) as ResourceKey[]).forEach((k) => {
        if (k === 'energy') return;
        capacity[k] += (def.capacity?.[k] ?? 0) * inst.level;
      });
    }
    shield += (def.shield ?? 0) * inst.level * efficiency;
    quizBonus += (def.quizBonus ?? 0) * (0.5 + 0.5 * efficiency);
  });

  // Chauffage de la base : la consommation augmente progressivement la nuit.
  const heatingLoad = (1 - daylight) * (1 - daylight) * 0.08;
  consumption.energy = powerAllocated + heatingLoad;
  consumption.o2 += CREW_UPKEEP.o2;
  consumption.h2o += CREW_UPKEEP.h2o;
  consumption.food += CREW_UPKEEP.food;

  const rates: ResourceRate = {
    o2: production.o2 - consumption.o2,
    h2o: production.h2o - consumption.h2o,
    energy: production.energy - consumption.energy,
    food: production.food - consumption.food,
  };

  const ambientRadiation = 9 + 9 * daylight + state.spike;

  return {
    rates,
    dayFactor: daylight,
    shield: clamp01(shield),
    ambientRadiation,
    quizBonus,
    capacity,
    powerSupply: production.energy,
    powerDemand,
    powerAllocated,
    brownout: powerAllocated < powerDemand - 0.001,
    modules: statuses,
  };
}

export function effectiveRadiation(state: GameState, upkeep: UpkeepInfo): number {
  return clamp(upkeep.ambientRadiation * (1 - clamp(upkeep.shield, 0, 0.88)), 0, 100);
}

/**
 * Avance la simulation de `dt` secondes. Fonction pure : renvoie un nouvel état.
 */
export interface AdvanceContext {
  /** L'astronaute est à l'extérieur de la base. */
  outdoor?: boolean;
  /** L'astronaute est dans un module protégé (hub / abri). */
  sheltered?: boolean;
}

export function advance(state: GameState, dt: number, ctx: AdvanceContext = {}): GameState {
  if (!state.alive) return state;
  const step = Math.max(0, Math.min(dt, 5));

  const dayT = (state.dayT + step / SIM_SECONDS_PER_DAY) % 1;
  const sol = dayT < state.dayT ? state.sol + 1 : state.sol;
  const daylight = daylightFactor(dayT);
  const upkeep = computeUpkeep(state, daylight);

  const resources: Resources = { ...state.resources };
  (Object.keys(resources) as ResourceKey[]).forEach((k) => {
    const cap = upkeep.capacity[k];
    resources[k] = clamp(resources[k] + upkeep.rates[k] * step, 0, cap);
  });

  // L'exposition rejoint progressivement la valeur théorique (les boucliers lissent).
  // Sortir pendant une éruption augmente nettement l'exposition ; rester dans le
  // hub ou l'abri la réduit.
  let targetRadiation = effectiveRadiation(state, upkeep);
  if (ctx.outdoor) targetRadiation += state.spike * 0.22;
  if (ctx.sheltered) targetRadiation *= 0.72;
  targetRadiation = clamp(targetRadiation, 0, 100);
  const radiation = clamp(state.radiation + (targetRadiation - state.radiation) * Math.min(1, step * 0.35), 0, 100);

  // Besoins vitaux du personnage : faim, hydratation, sommeil.
  let hunger = clamp(state.hunger - 0.05 * step, 0, 100);
  let hydration = clamp(state.hydration - 0.07 * step, 0, 100);
  let fatigue = clamp(state.fatigue - 0.03 * step, 0, 100);

  // En mission RÉELLE, l'équipage est autonome : il se nourrit et s'hydrate
  // depuis les réserves, et se repose pendant la nuit lunaire. C'est ce qui
  // permet à la base de survivre quand le joueur n'est pas là.
  if (state.mode === 'real') {
    if (hunger < 35 && resources.food >= 8) {
      resources.food -= 8;
      hunger = clamp(hunger + 40);
    }
    if (hydration < 35 && resources.h2o >= 8) {
      resources.h2o -= 8;
      hydration = clamp(hydration + 40);
    }
    if (daylight < 0.06) {
      fatigue = clamp(fatigue + 0.3 * step);
    }
  }

  let health = state.health;
  if (hunger < 15) health -= 0.08 * step;
  if (hydration < 15) health -= 0.1 * step;
  if (fatigue < 10) health -= 0.04 * step;
  if (radiation > 32) {
    health -= (radiation - 32) * 0.008 * step;
  } else {
    health += 0.12 * step;
  }
  // Sortie en pleine tempête : dose supplémentaire immédiate.
  if (ctx.outdoor && state.spike > 30) {
    health -= ((state.spike - 30) / 100) * 0.28 * step;
  }
  if (resources.o2 <= 0.4 || resources.h2o <= 0.4 || resources.food <= 0.4) {
    health -= 0.22 * step;
  }
  health = clamp(health, 0, 100);

  // Décroissance de l'éruption solaire. En mode réaliste, une éruption dure
  // plusieurs heures de mission (et non une fraction de journée) : la
  // décroissance est donc plus rapide par seconde de simulation.
  const stormDecay = state.mode === 'real' ? 0.012 : 0.004;
  const spike = Math.max(0, state.spike - state.spike * Math.min(1, step * stormDecay));

  // Usure : chaque module s'abîme en fonction de son niveau et de sa privation
  // d'énergie. Une coupure prolongée accélère l'usure.
  const ratioById = new Map(upkeep.modules.map((m) => [m.id, m.ratio]));
  const buildings = state.buildings.map((b) => {
    const ratio = ratioById.get(b.id) ?? 1;
    let wearRate = 0.00009 + 0.00025 * (1 - ratio);
    // Mission réelle : l'équipage assure une maintenance de routine sur les
    // modules correctement alimentés. L'usure progresse donc lentement, mais
    // reste visible sur plusieurs semaines (et s'accélère en délestage).
    if (state.mode === 'real' && ratio > 0.6) wearRate -= 0.00005;
    const wear = Math.min(1, (b.wear ?? 0) + Math.max(0, wearRate) * step);
    return wear === b.wear ? b : { ...b, wear };
  });

  // Suivi des épisodes (tempête, coupure) pour les objectifs et le carnet.
  const stormActive = spike >= 25;
  const brownoutActive = upkeep.brownout;
  let stats = state.stats;
  if (sol > state.sol) stats = { ...stats, solsSurvived: stats.solsSurvived + (sol - state.sol) };
  if (state.stormActive && !stormActive) stats = { ...stats, stormsSurvived: stats.stormsSurvived + 1 };
  if (!state.brownoutActive && brownoutActive) stats = { ...stats, brownouts: stats.brownouts + 1 };
  stats = { ...stats, maxTier: Math.max(stats.maxTier, state.tier) };

  // Mode Practice : aucune fin de mission, l'équipage tient bon pour apprendre.
  const practice = state.mode === 'practice';
  if (practice && health < 20) health = 20;

  let failure: string | null = null;
  if (!practice) {
    if (resources.o2 <= 0) failure = "Réserve d'oxygène épuisée : l'équipage ne peut plus respirer.";
    else if (health <= 0) failure = "L'exposition aux radiations a dépassé la limite tolérée par l'équipage.";
  }

  return {
    ...state,
    dayT,
    sol,
    elapsedGameSec: state.elapsedGameSec + step * GAME_SECONDS_PER_SIM_SECOND,
    resources,
    buildings,
    stats,
    stormActive,
    brownoutActive,
    capacities: upkeep.capacity,
    radiation,
    health,
    hunger,
    hydration,
    fatigue,
    spike,
    alive: failure === null,
    failure,
  };
}

// ------------------------- Maintenance et priorités -------------------------

export interface RepairResult {
  state: GameState;
  ok: boolean;
  message: string;
  cost: number;
}

/** Coût en points d'une réparation de 50 % d'usure. */
export function repairCost(inst: BuildingInstance): number {
  return 4 + inst.level * 2;
}

/** Réparation locale : immédiate, mais coûteuse en points et en énergie. */
export function repairModule(state: GameState, id: string): RepairResult {
  const inst = state.buildings.find((b) => b.id === id);
  const def = inst ? BUILDINGS[inst.key] : null;
  if (!inst || !def) return { state, ok: false, message: 'Module introuvable.', cost: 0 };
  const wear = inst.wear ?? 0;
  if (wear < 0.04) return { state, ok: false, message: `${def.name} est déjà en bon état.`, cost: 0 };
  const cost = repairCost(inst);
  if (state.points < cost) {
    return { state, ok: false, message: `Il manque ${cost - state.points} pts pour réparer ${def.name}.`, cost };
  }
  if (state.resources.energy < 6) {
    return { state, ok: false, message: "Pas assez d'énergie pour l'intervention technique.", cost };
  }
  return {
    state: {
      ...state,
      points: state.points - cost,
      resources: { ...state.resources, energy: Math.max(0, state.resources.energy - 6) },
      buildings: state.buildings.map((b) =>
        b.id === id ? { ...b, wear: Math.max(0, (b.wear ?? 0) - 0.5) } : b
      ),
      stats: { ...state.stats, localRepairs: state.stats.localRepairs + 1 },
    },
    ok: true,
    message: `${def.name} réparé localement (−50 % d'usure, −${cost} pts).`,
    cost,
  };
}

/** Change la priorité de distribution d'électricité d'un module. */
export function setModulePriority(
  state: GameState,
  id: string,
  priority: ModulePriority
): GameState {
  return {
    ...state,
    buildings: state.buildings.map((b) => (b.id === id ? { ...b, priority } : b)),
  };
}

export function applyQuizResult(
  state: GameState,
  correct: boolean,
  questionPoints: number
): { state: GameState; gained: number; tierUp: number | null; bonus: number } {
  const upkeep = computeUpkeep(state, daylightFactor(state.dayT));
  const bonus = correct ? upkeep.quizBonus : 0;
  const gained = correct ? questionPoints + bonus : 0;
  const score = state.score + gained;
  const newTier = tierForScore(score);
  const tierUp = newTier > state.tier ? newTier : null;

  return {
    state: {
      ...state,
      points: state.points + gained,
      score,
      tier: newTier,
      quizAnswered: state.quizAnswered + 1,
      quizCorrect: state.quizCorrect + (correct ? 1 : 0),
    },
    gained,
    tierUp,
    bonus,
  };
}

export function applyRadiationSpike(state: GameState, intensity: number): GameState {
  return { ...state, spike: clamp(state.spike + clamp(intensity, 0, 100), 0, 100) };
}

export function canAfford(state: GameState, cost: number): boolean {
  return state.points >= cost;
}

/** Construit un module du catalogue. Renvoie null si l'action est invalide. */
export function applyBuild(state: GameState, defKey: string, x: number, z: number): GameState | null {
  const def = BUILDINGS[defKey];
  if (!def || def.existing) return null;
  if (state.tier < def.tier) return null;
  if (!canPlace(defKey, x, z, state.buildings, state.tier).ok) return null;
  const cost = buildCost(def);
  if (!canAfford(state, cost)) return null;

  const instance: BuildingInstance = {
    id: `${defKey}-${Date.now().toString(36)}-${Math.floor(Math.random() * 999)}`,
    key: defKey,
    x,
    z,
    level: 1,
    priority: def.defaultPriority ?? 'normal',
    wear: 0,
  };
  return { ...state, points: state.points - cost, buildings: [...state.buildings, instance] };
}

/** Reconstruit / améliore un bâtiment (tous types). */
export function applyUpgrade(state: GameState, id: string): GameState | null {
  const inst = getInstance(state, id);
  if (!inst) return null;
  const def = BUILDINGS[inst.key];
  if (!def || inst.level >= def.maxLevel) return null;
  const cost = upgradeCost(def, inst.level);
  if (!canAfford(state, cost)) return null;
  return {
    ...state,
    points: state.points - cost,
    buildings: state.buildings.map((b) =>
      b.id === id ? { ...b, level: b.level + 1, wear: Math.max(0, (b.wear ?? 0) * 0.8) } : b
    ),
  };
}

/** Reconstruction gratuite (niveau 0 → 1) utilisée par la série QCM d'accueil. */
export function applyFreeRebuild(state: GameState, id: string): GameState | null {
  const inst = getInstance(state, id);
  if (!inst || inst.level > 0) return null;
  return {
    ...state,
    buildings: state.buildings.map((b) => (b.id === id ? { ...b, level: 1, wear: 0 } : b)),
  };
}

export interface DemolishResult {
  state: GameState;
  refund: number;
}

/** Démonte un module du catalogue (récupération de 50 % des points). */
export function applyDemolish(state: GameState, id: string): DemolishResult | null {
  const inst = getInstance(state, id);
  if (!inst) return null;
  const def = BUILDINGS[inst.key];
  if (!def || def.existing) return null;
  const spent = def.cost + def.upgradeCost * ((inst.level * (inst.level - 1)) / 2);
  const refund = Math.round(spent * 0.5);
  return {
    state: {
      ...state,
      points: state.points + refund,
      buildings: state.buildings.filter((b) => b.id !== id),
    },
    refund,
  };
}

export function canBuildAt(state: GameState, defKey: string, x: number, z: number): boolean {
  const def = BUILDINGS[defKey];
  if (!def || state.tier < def.tier) return false;
  return canPlace(defKey, x, z, state.buildings, state.tier).ok;
}

/** Emplacement libre proposé quand le joueur clique un bouton du catalogue. */
export function suggestedSpot(state: GameState, defKey: string): { x: number; z: number } | null {
  return findFreeSpot(defKey, state.buildings, state.tier);
}

export function requiresKit(...keys: string[]): boolean {
  return keys.some((k) => !!CATALOG.find((d) => d.key === k));
}

/** Vérifie rapidement qu'un emplacement est dans la grille débloquée. */
export function isInsideTier(x: number, z: number, w: number, d: number, tier: number): boolean {
  return isRectInBounds({ x, z, w, d }, tier);
}

export function buildGridDebug(state: GameState) {
  return {
    tier: tierDef(state.tier),
    occupied: occupiedRects(state.buildings),
    blocked: BLOCKED_RECTS,
    overlap: occupiedRects(state.buildings).some((r, i, all) => all.some((o, j) => i !== j && rectsOverlap(r, o))),
  };
}

// --------------------------- Actions de survie ---------------------------

export interface SurvivalActionResult {
  state: GameState;
  ok: boolean;
  message: string;
}

export function eatFood(state: GameState): SurvivalActionResult {
  if (state.resources.food < 10) return { state, ok: false, message: 'Pas assez de nourriture en réserve.' };
  return {
    state: {
      ...state,
      resources: { ...state.resources, food: Math.max(0, state.resources.food - 10) },
      hunger: clamp(state.hunger + 40),
      health: clamp(state.health + 2),
    },
    ok: true,
    message: 'Repas pris : +40 faim.',
  };
}

export function drinkWater(state: GameState): SurvivalActionResult {
  if (state.resources.h2o < 10) return { state, ok: false, message: "Pas assez d'eau en réserve." };
  return {
    state: {
      ...state,
      resources: { ...state.resources, h2o: Math.max(0, state.resources.h2o - 10) },
      hydration: clamp(state.hydration + 40),
    },
    ok: true,
    message: 'Hydratation : +40 eau.',
  };
}

export function harvestFood(state: GameState): SurvivalActionResult {
  return {
    state: { ...state, resources: { ...state.resources, food: clamp(state.resources.food + 14, 0, state.capacities.food) } },
    ok: true,
    message: 'Récolte : +14 nourriture.',
  };
}

export function purifyWater(state: GameState): SurvivalActionResult {
  return {
    state: { ...state, resources: { ...state.resources, h2o: clamp(state.resources.h2o + 14, 0, state.capacities.h2o) } },
    ok: true,
    message: 'Purification : +14 eau.',
  };
}

export function checkSolarPanels(state: GameState): SurvivalActionResult {
  return {
    state: {
      ...state,
      resources: { ...state.resources, energy: clamp(state.resources.energy + 10, 0, state.capacities.energy) },
      solarBoostUntil: Date.now() + 60_000,
    },
    ok: true,
    message: 'Panneaux vérifiés : +10 énergie, rendement +35 % pendant 60 s.',
  };
}

export function sleepCycle(state: GameState): SurvivalActionResult {
  if (state.resources.food < 6 || state.resources.h2o < 6) {
    return { state, ok: false, message: 'Il faut au moins 6 nourriture et 6 eau pour passer la nuit.' };
  }
  const nextSol = state.sol + 1;
  const dayDelta = ((0.1 - state.dayT) + 1) % 1 || 1;
  return {
    state: {
      ...state,
      sol: nextSol,
      dayT: 0.1,
      elapsedGameSec: state.elapsedGameSec + dayDelta * 86400,
      resources: {
        ...state.resources,
        food: Math.max(0, state.resources.food - 6),
        h2o: Math.max(0, state.resources.h2o - 6),
      },
      fatigue: 100,
      health: clamp(state.health + 12),
      stats: { ...state.stats, solsSurvived: state.stats.solsSurvived + 1 },
    },
    ok: true,
    message: `Nuit terminée — Sol ${nextSol}. Énergie restaurée.`,
  };
}

// ---------------------------- Sauvegarde locale ----------------------------

const SAVE_KEY = 'infectium.save.v4';
const LEGACY_KEYS = ['infectium.save.v3'];

export interface SaveEnvelope {
  version: 4;
  /** Horodatage réel de la sauvegarde (ms). Sert au rattrapage hors-ligne. */
  savedAt: number;
  state: GameState;
}

let saveWriteCount = 0;

export function saveGame(state: GameState, savedAt = Date.now()): void {
  try {
    const payload: SaveEnvelope = { version: 4, savedAt, state };
    const json = JSON.stringify(payload);
    // Toutes les ~40 s (4 s × 10), on conserve la version précédente.
    if (saveWriteCount++ % 10 === 0) {
      const previous = localStorage.getItem(SAVE_KEY);
      if (previous) localStorage.setItem(SAVE_KEY + '.bak', previous);
    }
    localStorage.setItem(SAVE_KEY, json);
  } catch {
    /* stockage indisponible : le jeu continue sans sauvegarde */
  }
}

function hydrate(parsed: Partial<GameState>): GameState | null {
  if (!parsed || !Array.isArray(parsed.buildings)) return null;
  const fresh = createInitialState(parsed.mode ?? 'junior', parsed.timeConfig ?? {});
  const sol = parsed.sol ?? fresh.sol;
  const dayT = parsed.dayT ?? fresh.dayT;
  const state: GameState = {
    ...fresh,
    ...parsed,
    resources: { ...fresh.resources, ...(parsed.resources ?? {}) },
    capacities: { ...fresh.capacities, ...(parsed.capacities ?? {}) },
    buildings: parsed.buildings.filter((b) => !!BUILDINGS[b.key]),
    stats: { ...fresh.stats, ...(parsed.stats ?? {}) },
    timeConfig: { ...fresh.timeConfig, ...(parsed.timeConfig ?? {}) },
    comms: Array.isArray(parsed.comms) ? parsed.comms : [],
    objectivesDone: Array.isArray(parsed.objectivesDone) ? parsed.objectivesDone : [],
    journal: Array.isArray(parsed.journal) ? parsed.journal : [],
  };
  // Anciennes sauvegardes : reconstruire le temps de mission écoulé.
  if (typeof parsed.elapsedGameSec !== 'number') {
    state.elapsedGameSec = (sol - 1) * 86400 + dayT * 86400;
  }
  return state;
}

function readSaveSlot(key: string): { state: GameState; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveEnvelope;
    if (parsed?.version !== 4 || !parsed.state) return null;
    const state = hydrate(parsed.state);
    if (!state) return null;
    return { state, savedAt: parsed.savedAt ?? Date.now() };
  } catch {
    return null;
  }
}

export function loadGame(): { state: GameState; savedAt: number } | null {
  // 1. Sauvegarde principale.
  const main = readSaveSlot(SAVE_KEY);
  if (main) return main;
  // 2. Copie de secours (écriture interrompue / JSON corrompu).
  const backup = readSaveSlot(SAVE_KEY + '.bak');
  if (backup) return backup;

  // 3. Migration depuis la sauvegarde v3.
  try {
    for (const key of LEGACY_KEYS) {
      const legacy = localStorage.getItem(key);
      if (!legacy) continue;
      const parsed = JSON.parse(legacy) as Partial<GameState>;
      if (parsed?.version === 3) {
        const state = hydrate(parsed);
        if (state) {
          const savedAt = Date.now();
          saveGame(state, savedAt);
          localStorage.removeItem(key);
          return { state, savedAt };
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(SAVE_KEY + '.bak');
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
