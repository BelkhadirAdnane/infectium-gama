import { GameMode, GameState, TimeConfig } from './types';

// =========================================================================
// Temps de mission multi-mode
// -------------------------------------------------------------------------
// Le moteur de simulation travaille en « secondes de simulation » (sim s).
// Convention historique : 240 sim s = 1 jour lunaire complet (24 h de jeu).
// Donc 1 sim s = 360 secondes de jeu = 6 minutes de mission.
//
// · JUNIOR   : 1 sim s par seconde réelle  → une journée de jeu en 4 minutes.
// · PRACTICE : idem, sans données NASA ni échec de mission.
// · RÉEL     : le joueur choisit le rapport (par défaut 1 h réelle = 2 h de jeu),
//              et le temps continue de s'écouler hors-ligne (rattrapage calculé).
// =========================================================================

/** Secondes de jeu représentées par une seconde de simulation. */
export const GAME_SECONDS_PER_SIM_SECOND = 360;
/** Secondes de jeu dans une journée de mission. */
export const GAME_SECONDS_PER_DAY = 24 * 3600;
/** Durée d'une journée de simulation (historique : 24 h en 240 sim s). */
export const SIM_SECONDS_PER_DAY = GAME_SECONDS_PER_DAY / GAME_SECONDS_PER_SIM_SECOND; // 240

/** Plafond de rattrapage hors-ligne (en secondes de jeu : 60 jours). */
export const MAX_OFFLINE_GAME_SECONDS = 60 * GAME_SECONDS_PER_DAY;
/** Pas de calcul du rattrapage (sim secondes). */
export const OFFLINE_STEP_SIM_SECONDS = 5;

export const DEFAULT_TIME_CONFIG: TimeConfig = {
  ratio: 2,
  startSol: 1,
  missionDays: 0,
  startDateIso: new Date().toISOString(),
};

export const MODE_META: Record<
  GameMode,
  { name: string; tagline: string; description: string; icon: string; accent: string }
> = {
  real: {
    name: 'Mission réelle',
    tagline: 'Le temps continue sans toi',
    description:
      "Simulation persistante : 1 h réelle = 2 h de mission par défaut. La base vit même navigateur fermé, et un rapport détaille ce qui s'est passé pendant ton absence.",
    icon: '🛰️',
    accent: '#5fe6ff',
  },
  junior: {
    name: 'Junior Explorer',
    tagline: 'Une journée sur la Lune',
    description:
      "L'expérience guidée actuelle : jour lunaire rapide (4 min), données NASA réelles, objectifs, QCM et carnet de bord. Idéal pour découvrir.",
    icon: '🌙',
    accent: '#7dde7d',
  },
  practice: {
    name: 'Practice',
    tagline: 'Expérimenter sans pression',
    description:
      "Aucune donnée NASA, aucune fin de mission : construis, teste, comprends le fonctionnement de la base librement.",
    icon: '🧪',
    accent: '#ffb347',
  },
};

/** Secondes de simulation écoulées par seconde réelle. */
export function simSecondsPerRealSecond(mode: GameMode, cfg: TimeConfig): number {
  if (mode === 'real') {
    // ratio = heures de jeu par heure réelle = secondes de jeu par seconde réelle.
    const safe = Number.isFinite(cfg.ratio) && cfg.ratio > 0 ? cfg.ratio : 2;
    return safe / GAME_SECONDS_PER_SIM_SECOND;
  }
  // Junior et Practice gardent le rythme historique (jour en 4 minutes).
  return 1;
}

/** Secondes de jeu écoulées par seconde réelle. */
export function gameSecondsPerRealSecond(mode: GameMode, cfg: TimeConfig): number {
  return simSecondsPerRealSecond(mode, cfg) * GAME_SECONDS_PER_SIM_SECOND;
}

/** Durée réelle (minutes) d'une journée de mission pour un mode donné. */
export function realMinutesPerGameDay(mode: GameMode, cfg: TimeConfig): number {
  const gameSecPerRealSec = gameSecondsPerRealSecond(mode, cfg);
  return GAME_SECONDS_PER_DAY / gameSecPerRealSec / 60;
}

/** Ratio prédéfini → libellé lisible. */
export function ratioLabel(ratio: number): string {
  const hours = GAME_SECONDS_PER_DAY / (ratio * 3600);
  return `×${ratio} · 1 journée de mission = ${hours < 1 ? `${Math.round(hours * 60)} min` : `${hours.toFixed(1)} h`} réelles`;
}

export interface AbsenceSummary {
  realMinutes: number;
  gameHours: number;
  gameDays: number;
  fromSol: number;
  toSol: number;
  capped: boolean;
}

/**
 * Convertit une absence réelle en temps de mission.
 * Le rattrapage est plafonné (60 jours de jeu) pour rester calculable.
 */
export function summarizeAbsence(
  state: GameState,
  realSeconds: number
): AbsenceSummary {
  const rawGame = realSeconds * gameSecondsPerRealSecond(state.mode, state.timeConfig);
  const capped = rawGame > MAX_OFFLINE_GAME_SECONDS;
  const gameSeconds = Math.min(rawGame, MAX_OFFLINE_GAME_SECONDS);
  const gameDays = gameSeconds / GAME_SECONDS_PER_DAY;
  return {
    realMinutes: realSeconds / 60,
    gameHours: gameSeconds / 3600,
    gameDays,
    fromSol: state.sol,
    toSol: Math.floor(state.sol + gameDays),
    capped,
  };
}

/** Date/heure de mission affichée (départ + temps écoulé). */
export function missionDate(state: GameState): Date {
  const start = Date.parse(state.timeConfig.startDateIso);
  const base = Number.isFinite(start) ? start : Date.now();
  return new Date(base + state.elapsedGameSec * 1000);
}

export function missionDateLabel(state: GameState): string {
  const d = missionDate(state);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Mission terminée si une durée est fixée et dépassée. */
export function isMissionComplete(state: GameState): boolean {
  if (!state.timeConfig.missionDays || state.timeConfig.missionDays <= 0) return false;
  return state.sol > state.timeConfig.startSol + state.timeConfig.missionDays - 1;
}

export function missionProgress(state: GameState): number {
  const total = state.timeConfig.missionDays;
  if (!total || total <= 0) return 0;
  const done = state.sol - state.timeConfig.startSol + state.dayT;
  return Math.max(0, Math.min(1, done / total));
}
