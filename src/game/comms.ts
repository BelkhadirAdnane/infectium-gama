import { BUILDINGS } from './buildings';
import { clamp } from './sim';
import { BuildingInstance, CommEntry, CommKind, GameState } from './types';

export type { CommKind };

// =========================================================================
// Liaison Terre-Lune — vraie mécanique de mission
// -------------------------------------------------------------------------
// Le délai physique est calculé avec la vitesse de la lumière et la distance
// Terre-Lune réelle. Pour rester jouable, la réponse du centre de contrôle est
// compressée (× 12, minimum 20 s). Les deux valeurs sont toujours affichées
// séparément : le délai réel ne est jamais présenté comme artificiel.
//
// Chaque type de demande a un effet concret et un coefficient de délai. Une
// réponse peut arriver « trop tard » : c'est tout l'enjeu de l'autonomie.
// =========================================================================

export const LIGHT_SPEED_KM_S = 299792.458;
export const COMM_GAMEPLAY_SCALE = 12;
export const COMM_MIN_DELAY_S = 20;
export const COMM_QUEUE_LIMIT = 2;
export const COMM_HISTORY_LIMIT = 20;

export interface CommDef {
  kind: CommKind;
  label: string;
  short: string;
  icon: string;
  desc: string;
  /** Effet concret, affiché avant l'envoi. */
  effect: string;
  /** Coefficient appliqué au délai de traitement. */
  delayFactor: number;
}

export const COMM_CATALOG: Record<CommKind, CommDef> = {
  diagnostic: {
    kind: 'diagnostic',
    label: 'Procédure de réparation',
    short: 'Diagnostic',
    icon: '🛠️',
    desc: "Les ingénieurs au sol analysent le module le plus usé et guident sa remise en état.",
    effect: 'Répare 50 % de l’usure du module le plus abîmé.',
    delayFactor: 1,
  },
  medical: {
    kind: 'medical',
    label: 'Avis médical',
    short: 'Médical',
    icon: '🩺',
    desc: "Un médecin de la NASA valide le protocole de repos et d'hydratation de l'équipage.",
    effect: '+30 santé et +20 sommeil à la réception.',
    delayFactor: 0.8,
  },
  resupply: {
    kind: 'resupply',
    label: 'Autorisation de largage',
    short: 'Largage',
    icon: '📦',
    desc: "La Terre autorise un largage de secours : vivres, eau et oxygène conditionnés.",
    effect: '+18 nourriture, +18 eau, +12 oxygène.',
    delayFactor: 1.4,
  },
  analysis: {
    kind: 'analysis',
    label: 'Analyse météo spatiale',
    short: 'Météo',
    icon: '☀️',
    desc: "Le centre DONKI confirme l'évolution de l'éruption en cours et optimise les panneaux.",
    effect: 'Réduit l’éruption de 25 et booste les panneaux 90 s.',
    delayFactor: 1.2,
  },
};

/** Délai physique aller-retour réel (secondes). */
export function lightDelaySeconds(distanceKm: number): number {
  return (Math.max(0, distanceKm) / LIGHT_SPEED_KM_S) * 2;
}

/**
 * Délai de jeu compressé (secondes), toujours >= COMM_MIN_DELAY_S.
 * Une éruption solaire perturbe les communications radio : le délai augmente
 * avec l'intensité (plausible physiquement, valeur de jeu simplifiée).
 */
export function commDelaySeconds(
  distanceKm: number,
  kind?: CommKind,
  stormSpike = 0
): number {
  const factor = kind ? COMM_CATALOG[kind].delayFactor : 1;
  const stormFactor = 1 + Math.max(0, stormSpike) / 120;
  return Math.max(
    COMM_MIN_DELAY_S,
    Math.round(lightDelaySeconds(distanceKm) * COMM_GAMEPLAY_SCALE * factor * stormFactor)
  );
}

export interface CommRequestResult {
  state: GameState;
  entry: CommEntry;
  delay: number;
  realDelay: number;
}

/** Envoie une demande ; null si la file est pleine. */
export function requestComm(
  state: GameState,
  kind: CommKind,
  distanceKm: number,
  now = Date.now(),
  stormSpike = state.spike
): CommRequestResult | null {
  const pending = state.comms.filter((c) => c.status === 'pending');
  if (pending.length >= COMM_QUEUE_LIMIT) return null;
  const def = COMM_CATALOG[kind];
  const realDelay = lightDelaySeconds(distanceKm);
  const delay = commDelaySeconds(distanceKm, kind, stormSpike);
  const id = state.commSeq;
  const entry: CommEntry = {
    id,
    kind,
    label: def.label,
    sentAt: now,
    readyAt: now + delay * 1000,
    status: 'pending',
  };
  return {
    state: {
      ...state,
      commSeq: id + 1,
      comms: [entry, ...state.comms].slice(0, COMM_HISTORY_LIMIT),
      // Préparer une transmission mobilise l'équipage.
      fatigue: Math.max(0, state.fatigue - 10),
      stats: {
        ...state.stats,
        earthRequests: state.stats.earthRequests + 1,
      },
    },
    entry,
    delay,
    realDelay,
  };
}


export interface CommResolution {
  state: GameState;
  completed: Array<{ entry: CommEntry; message: string; late: boolean }>;
}

/** Applique les réponses arrivées à échéance et les journalise. */
export function resolveComms(state: GameState, now = Date.now()): CommResolution {
  const ready = state.comms.filter((c) => c.status === 'pending' && c.readyAt <= now);
  if (ready.length === 0) return { state, completed: [] };

  let resources = { ...state.resources };
  let health = state.health;
  let fatigue = state.fatigue;
  let spike = state.spike;
  let solarBoostUntil = state.solarBoostUntil;
  let buildings = state.buildings;
  let comms = state.comms;
  const completed: CommResolution['completed'] = [];

  ready.forEach((entry) => {
    // Une réponse arrivée alors que la situation est déjà critique est « tardive ».
    const critical =
      health < 30 || resources.o2 < 15 || resources.h2o < 15 || resources.food < 15;
    let message = '';

    switch (entry.kind) {
      case 'diagnostic': {
        const target = mostWearAmong(buildings);
        if (!target || (target.wear ?? 0) < 0.03) {
          message = 'Les ingénieurs confirment : aucun module ne nécessite de réparation.';
        } else {
          const newWear = Math.max(0, (target.wear ?? 0) - 0.5);
          buildings = buildings.map((b) => (b.id === target.id ? { ...b, wear: newWear } : b));
          message = `Procédure appliquée : ${BUILDINGS[target.key]?.name ?? 'module'} remis en état (−50 % d’usure).`;
        }
        break;
      }
      case 'medical':
        health = clamp(health + 30);
        fatigue = clamp(fatigue + 20);
        message = 'Avis médical reçu : +30 santé, +20 sommeil.';
        break;
      case 'resupply':
        resources = {
          ...resources,
          food: clamp(resources.food + 18, 0, state.capacities.food),
          h2o: clamp(resources.h2o + 18, 0, state.capacities.h2o),
          o2: clamp(resources.o2 + 12, 0, state.capacities.o2),
        };
        message = 'Largage réceptionné : +18 nourriture, +18 eau, +12 oxygène.';
        break;
      case 'analysis':
        spike = Math.max(0, spike - 25);
        solarBoostUntil = now + 90_000;
        message = 'Analyse DONKI reçue : éruption −25, panneaux optimisés 90 s.';
        break;
    }

    if (critical) {
      message += ' ⚠ Réponse arrivée alors que la situation était déjà critique.';
    }

    completed.push({ entry, message, late: critical });
    const updated: CommEntry = { ...entry, status: 'answered', result: message, late: critical };
    comms = comms.map((c) => (c.id === entry.id ? updated : c));
  });

  return {
    state: {
      ...state,
      resources,
      health,
      fatigue,
      spike,
      solarBoostUntil,
      buildings,
      comms,
      commCompleted: state.commCompleted + ready.length,
      stats: {
        ...state.stats,
        earthAnswered: state.stats.earthAnswered + ready.length,
      },
    },
    completed,
  };
}

function mostWearAmong(buildings: BuildingInstance[]): BuildingInstance | null {
  let best: BuildingInstance | null = null;
  let bestWear = 0;
  buildings.forEach((b) => {
    const wear = b.wear ?? 0;
    if (wear > bestWear) {
      bestWear = wear;
      best = b;
    }
  });
  return best;
}

/** Entrées en attente (dérivé). */
export function pendingComms(state: GameState): CommEntry[] {
  return state.comms.filter((c) => c.status === 'pending');
}
