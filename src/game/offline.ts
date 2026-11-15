import { BUILDINGS } from './buildings';
import { advance, applyRadiationSpike, computeUpkeep, daylightFactor } from './sim';
import { GameState, OfflineReport, ResourceKey } from './types';
import {
  GAME_SECONDS_PER_DAY,
  GAME_SECONDS_PER_SIM_SECOND,
  MAX_OFFLINE_GAME_SECONDS,
  OFFLINE_STEP_SIM_SECONDS,
  gameSecondsPerRealSecond,
  missionDate,
} from './time';

// =========================================================================
// Rattrapage hors-ligne (mode RÉEL uniquement)
// -------------------------------------------------------------------------
// Rien ne « tourne » en arrière-plan : au retour, on calcule le temps de
// mission écoulé, puis on rejoue la simulation par pas de 30 minutes de jeu.
// Le résultat est un état cohérent + un rapport lisible pour le joueur.
// =========================================================================

const MIN_ABSENCE_SECONDS = 45;

const RESOURCE_LABEL: Record<ResourceKey, string> = {
  o2: 'Oxygène',
  h2o: 'Eau',
  energy: 'Énergie',
  food: 'Nourriture',
};

export function simulateOffline(
  state: GameState,
  savedAt: number,
  now = Date.now()
): { state: GameState; report: OfflineReport } | null {
  if (state.mode !== 'real' || !state.alive) return null;
  const realSeconds = Math.max(0, (now - savedAt) / 1000);
  if (realSeconds < MIN_ABSENCE_SECONDS) return null;

  const gamePerReal = gameSecondsPerRealSecond(state.mode, state.timeConfig);
  let gameSeconds = realSeconds * gamePerReal;
  let capped = false;
  if (gameSeconds > MAX_OFFLINE_GAME_SECONDS) {
    gameSeconds = MAX_OFFLINE_GAME_SECONDS;
    capped = true;
  }
  // Ne pas dépasser la durée de mission restante.
  const missionDays = state.timeConfig.missionDays;
  if (missionDays > 0) {
    const endSol = state.timeConfig.startSol + missionDays - 1;
    const remainingDays = Math.max(0, endSol - state.sol + (1 - state.dayT));
    const missionCap = remainingDays * GAME_SECONDS_PER_DAY;
    if (gameSeconds > missionCap) {
      gameSeconds = missionCap;
    }
  }
  if (gameSeconds < GAME_SECONDS_PER_SIM_SECOND) return null;

  const startIso = missionDate(state).toISOString();
  const fromSol = state.sol;
  const resourcesStart = { ...state.resources };
  const healthStart = state.health;
  const minResources = { ...state.resources };
  const stepGameSeconds = OFFLINE_STEP_SIM_SECONDS * GAME_SECONDS_PER_SIM_SECOND;
  const totalSteps = Math.max(1, Math.ceil(gameSeconds / stepGameSeconds));

  let current = state;
  let stepsDone = 0;
  let brownoutGameSec = 0;
  let stormsTriggered = 0;
  const broken = new Set<string>();
  const capacityAt = (s: GameState) => computeUpkeep(s, daylightFactor(s.dayT)).capacity;

  for (let i = 0; i < totalSteps; i++) {
    if (!current.alive) break;
    stepsDone++;
    // Un événement solaire peut survenir pendant l'absence (même probabilité
    // par unité de temps de mission que pendant une session en direct).
    if (Math.random() < 0.0015 * OFFLINE_STEP_SIM_SECONDS) {
      current = applyRadiationSpike(current, 20 + Math.random() * 35);
      stormsTriggered++;
    }
    current = advance(current, OFFLINE_STEP_SIM_SECONDS, {});
    const upkeep = computeUpkeep(current, daylightFactor(current.dayT));
    if (upkeep.brownout) brownoutGameSec += stepGameSeconds;
    (Object.keys(minResources) as ResourceKey[]).forEach((k) => {
      if (current.resources[k] < minResources[k]) minResources[k] = current.resources[k];
    });
    current.buildings.forEach((b) => {
      if ((b.wear ?? 0) >= 0.95) broken.add(BUILDINGS[b.key]?.name ?? b.key);
    });
  }

  const caps = capacityAt(current);
  const warnings: string[] = [];
  (Object.keys(minResources) as ResourceKey[]).forEach((k) => {
    const ratio = minResources[k] / Math.max(1, caps[k]);
    if (ratio < 0.15) {
      warnings.push(`${RESOURCE_LABEL[k]} descendu à ${Math.round(ratio * 100)} % de la capacité.`);
    }
  });
  if (brownoutGameSec > 0) {
    const hours = brownoutGameSec / 3600;
    warnings.push(
      `Délestage électrique pendant ${hours >= 1 ? `${hours.toFixed(1)} h` : `${Math.round(brownoutGameSec / 60)} min`} de mission.`
    );
  }
  if (broken.size > 0) {
    warnings.push(`Module(s) hors service : ${Array.from(broken).join(', ')}.`);
  }
  if (stormsTriggered > 0) {
    warnings.push(`${stormsTriggered} éruption(s) solaire(s) pendant l'absence.`);
  }
  if (healthStart - current.health >= 5) {
    warnings.push(`Santé de l'équipage : ${Math.round(healthStart)} % → ${Math.round(current.health)} %.`);
  }
  if (!current.alive && current.failure) {
    warnings.push(`Mission interrompue : ${current.failure}`);
  }
  if (capped) {
    warnings.push('Absence très longue : le rattrapage a été plafonné à 60 jours de mission.');
  }

  const report: OfflineReport = {
    realSeconds,
    gameSeconds: stepsDone * stepGameSeconds,
    gameHours: (stepsDone * stepGameSeconds) / 3600,
    fromSol,
    toSol: current.sol,
    fromDateIso: startIso,
    toDateIso: missionDate(current).toISOString(),
    resourcesStart,
    resourcesEnd: { ...current.resources },
    minResources,
    brownoutSeconds: brownoutGameSec,
    breakdowns: Array.from(broken),
    storms: stormsTriggered,
    healthStart,
    healthEnd: current.health,
    failure: current.alive ? null : current.failure,
    warnings,
  };

  return { state: current, report };
}
