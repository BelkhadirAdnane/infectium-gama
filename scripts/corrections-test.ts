// =========================================================================
// Tests ciblés des corrections (build via esbuild, exécution Node).
// · banque et rotation des 40 questions
// · détection automatique des raccordements de couloirs
// · délai de communication Terre et résolution des demandes
// =========================================================================
import { QUIZ_QUESTIONS } from '../src/data/quiz';
import { QuizRotation } from '../src/data/quizRotation';
import { corridorNeighbours, corridorLinkSignature } from '../src/game/corridorLinks';
import {
  createInitialState,
  computeUpkeep,
  daylightFactor,
  advance,
  repairModule,
  setModulePriority,
} from '../src/game/sim';
import {
  commDelaySeconds,
  lightDelaySeconds,
  requestComm,
  resolveComms,
} from '../src/game/comms';
import { evaluateObjectives } from '../src/game/objectives';
import { simulateOffline } from '../src/game/offline';
import {
  gameSecondsPerRealSecond,
  realMinutesPerGameDay,
  simSecondsPerRealSecond,
  summarizeAbsence,
  GAME_SECONDS_PER_DAY,
} from '../src/game/time';
import { saveGame, loadGame, clearSave } from '../src/game/sim';
import { BuildingInstance } from '../src/game/types';

let failures = 0;
function check(name: string, cond: boolean, info?: unknown) {
  if (cond) {
    console.log(`ok    ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name}`, info ?? '');
  }
}

// ------------------------------ Questions ------------------------------
check('banque = 40 questions', QUIZ_QUESTIONS.length === 40, QUIZ_QUESTIONS.length);
const ids = QUIZ_QUESTIONS.map((q) => q.id);
check('identifiants uniques', new Set(ids).size === 40, new Set(ids).size);
const texts = QUIZ_QUESTIONS.map((q) => q.question.trim().toLowerCase());
check('aucun énoncé dupliqué', new Set(texts).size === 40, texts.length - new Set(texts).size);
check(
  'chaque bonne réponse est un choix valide',
  QUIZ_QUESTIONS.every((q) => q.correctIndex >= 0 && q.correctIndex < q.choices.length)
);
check(
  'points dans la plage 10-20',
  QUIZ_QUESTIONS.every((q) => q.points >= 10 && q.points <= 20)
);

// Rotation : 3 cycles complets, sans aucune répétition interne.
const rotation = new QuizRotation();
let cycleError = 0;
let consecutiveRepeat = 0;
let previousLast: number | null = null;
for (let cycle = 0; cycle < 3; cycle++) {
  const drawn: number[] = [];
  for (let i = 0; i < 40; i++) drawn.push(rotation.draw().id);
  if (new Set(drawn).size !== 40) cycleError++;
  if (previousLast !== null && drawn[0] === previousLast) consecutiveRepeat++;
  previousLast = drawn[drawn.length - 1];
}
check('3 cycles de 40 questions sans répétition', cycleError === 0, cycleError);
check('pas de répétition entre deux cycles consécutifs', consecutiveRepeat === 0, consecutiveRepeat);
check('file vide après un cycle complet', rotation.remaining === 0, rotation.remaining);

// 200 cycles aléatoires : chaque cycle doit couvrir exactement la banque.
let fuzzError = 0;
for (let run = 0; run < 200; run++) {
  const r = new QuizRotation();
  const set = new Set<number>();
  for (let i = 0; i < 40; i++) set.add(r.draw().id);
  if (set.size !== 40) fuzzError++;
}
check('200 cycles aléatoires complets', fuzzError === 0, fuzzError);

// Persistance de session : la suite de la file est rechargée.
const memory: number[] = [];
const store = { read: () => (memory.length ? [...memory] : null), write: (v: number[]) => { memory.length = 0; memory.push(...v); } };
const r1 = new QuizRotation(store);
const first = [r1.draw(), r1.draw()];
const r2 = new QuizRotation(store);
const next = r2.draw();
check('file persistée après rechargement', next.id !== first[0].id && next.id !== first[1].id, next.id);

// ------------------------------- Couloirs -------------------------------
const mk = (id: string, key: string, x: number, z: number): BuildingInstance => ({ id, key, x, z, level: 1 });
const corridor = mk('c1', 'corridor', 0, 0); // 4x2
const westOk = mk('w', 'forge', -4, 0); // 4x3, bord est = 0
const westFar = mk('w2', 'forge', -5, 0); // 1 case de vide -> accepté
const westTooFar = mk('w3', 'forge', -6, 0); // 2 cases -> refusé
const eastOk = mk('e', 'forge', 4, 0);
const northOnly = mk('n', 'forge', 0, -4); // touche le grand côté, pas une extrémité

const l1 = corridorNeighbours([corridor, westOk, eastOk], corridor);
check('raccordement ouest + est détecté', l1.west?.id === 'w' && l1.east?.id === 'e', l1);
const l2 = corridorNeighbours([corridor, westFar], corridor);
check('jeu d’une case toléré', l2.west?.id === 'w2' && !l2.east, l2);
const l3 = corridorNeighbours([corridor, westTooFar], corridor);
check('deux cases de vide refusées', !l3.west && !l3.east, l3);
const l4 = corridorNeighbours([corridor, northOnly], corridor);
check('module sur le côté long non raccordé', !l4.west && !l4.east, l4);
check('signature stable', corridorLinkSignature(l1) === 'w|e', corridorLinkSignature(l1));
check('signature impasse', corridorLinkSignature(l4) === '-|-', corridorLinkSignature(l4));

// --------------------------- Liaison Terre -----------------------------
const real = lightDelaySeconds(384400);
check('délai lumière réel ≈ 2,56 s', Math.abs(real - 2.564) < 0.02, real);
check('délai de jeu ≥ 20 s', commDelaySeconds(384400) >= 20 && commDelaySeconds(384400, 'diagnostic') >= 20);
check('types de demande avec délais distincts', commDelaySeconds(384400, 'analysis') > commDelaySeconds(384400, 'medical'));

let state = createInitialState();
const sent = requestComm(state, 'medical', 384400, 1_000_000);
check('demande acceptée', !!sent);
if (sent) {
  state = sent.state;
  check('demande en file', state.comms.filter((c) => c.status === 'pending').length === 1);
  check('réponse pas immédiate', resolveComms(state, 1_000_500).completed.length === 0);
  state.health = 40;
  const late = resolveComms(state, 1_000_000 + sent.delay * 1000 + 10);
  check('réponse appliquée après le délai', late.completed.length === 1 && late.state.comms[0].status === 'answered');
  check('santé créditée', late.state.health > state.health, late.state.health);
  check('historique conservé', late.state.comms.length === 1);
  check('compteur de transmissions', late.state.stats.earthAnswered === 1);
}

// Effets concrets par type de demande
const mkDemo = () => {
  const s = createInitialState();
  return s;
};
const diagBase = mkDemo();
diagBase.buildings = diagBase.buildings.map((b) => (b.key === 'purifier' ? { ...b, wear: 0.8 } : b));
const diagReq = requestComm(diagBase, 'diagnostic', 384400, 0)!;
const diag = resolveComms(diagReq.state, 10_000_000);
const purifier = diag.state.buildings.find((b) => b.key === 'purifier')!;
check('diagnostic répare le module le plus usé', (purifier.wear ?? 1) < 0.35, purifier.wear);

const resBase = createInitialState();
resBase.resources = { ...resBase.resources, food: 5, h2o: 5, o2: 5 };
const resReq = requestComm(resBase, 'resupply', 384400, 0)!;
const res = resolveComms(resReq.state, 10_000_000);
check('largage crédite les ressources', res.state.resources.food > 5 && res.state.resources.h2o > 5);

const anaBase = createInitialState();
anaBase.spike = 60;
const anaReq = requestComm(anaBase, 'analysis', 384400, 0)!;
const ana = resolveComms(anaReq.state, 10_000_000);
check('analyse météo réduit l’éruption', ana.state.spike < anaBase.spike, ana.state.spike);

let full = createInitialState();
for (let i = 0; i < 3; i++) {
  const r = requestComm(full, 'medical', 384400, Date.now());
  if (r) full = r.state;
}
check('file plafonnée à 2 demandes', full.comms.filter((c) => c.status === 'pending').length === 2);

// --------------------------- Réseau électrique ---------------------------
let day = createInitialState();
day.dayT = 0.3;
const dayUp = computeUpkeep(day, daylightFactor(day.dayT));
check('production solaire le jour', dayUp.powerSupply > 0.2, dayUp.powerSupply);
check('demande électrique non nulle', dayUp.powerDemand > 0.15, dayUp.powerDemand);
check('base de départ alimentée le jour', !dayUp.brownout, { a: dayUp.powerAllocated, d: dayUp.powerDemand });
check('un module par défaut est prioritaire', dayUp.modules.some((m) => m.priority === 'high'));

let night = createInitialState();
night.dayT = 0.8;
night.resources = { ...night.resources, energy: 5 };
// Ajoute des modules pour dépasser la production nocturne.
night.buildings = [
  ...night.buildings,
  { id: 'g1', key: 'greenhouse', x: 0, z: 0, level: 1, wear: 0 },
  { id: 'r1', key: 'recycler', x: 0, z: 0, level: 1, wear: 0 },
  { id: 'l1', key: 'lab', x: 0, z: 0, level: 1, wear: 0 },
];
const nightUp = computeUpkeep(night, daylightFactor(night.dayT));
check('coupure la nuit sans centrale', nightUp.brownout, { a: nightUp.powerAllocated, d: nightUp.powerDemand });
check('les modules vitaux sont mieux servis', (() => {
  const high = nightUp.modules.find((m) => m.priority === 'high' && m.demand > 0);
  const low = nightUp.modules.find((m) => m.priority === 'low' && m.demand > 0);
  return !!high && (!low || high.ratio >= low.ratio);
})());

// Priorités : un module repassé en « vitale » reçoit davantage.
let prioState = createInitialState();
prioState.buildings = [
  ...prioState.buildings,
  { id: 'lab1', key: 'lab', x: 0, z: 0, level: 1, priority: 'low', wear: 0 },
];
prioState.dayT = 0.8;
prioState.resources = { ...prioState.resources, energy: 8 };
const beforeUp = computeUpkeep(prioState, daylightFactor(prioState.dayT));
const labBefore = beforeUp.modules.find((m) => m.id === 'lab1')!;
prioState = setModulePriority(prioState, 'lab1', 'high');
const afterUp = computeUpkeep(prioState, daylightFactor(prioState.dayT));
const labAfter = afterUp.modules.find((m) => m.id === 'lab1')!;
check('une priorité haute augmente la puissance allouée', labAfter.allocated > labBefore.allocated, {
  before: labBefore.allocated,
  after: labAfter.allocated,
});

// Usure et réparation
let worn = createInitialState();
worn.buildings = worn.buildings.map((b) => (b.key === 'hub' ? { ...b, wear: 0.7 } : b));
const wornUp = computeUpkeep(worn, daylightFactor(worn.dayT));
const hubStatus = wornUp.modules.find((m) => m.key === 'hub')!;
check('l’usure réduit le rendement', hubStatus.efficiency < 0.85, hubStatus.efficiency);
const pointsBefore = worn.points;
const repaired = repairModule(worn, 'hub');
check('réparation réussie', repaired.ok, repaired.message);
check('usure réduite de 50 %', (repaired.state.buildings.find((b) => b.id === 'hub')!.wear ?? 1) <= 0.21);
check('réparation payée en points', repaired.state.points < pointsBefore);
check('autonomie technique comptée', repaired.state.stats.localRepairs === 1);

let wearing = createInitialState();
for (let i = 0; i < 400; i++) wearing = advance(wearing, 1);
check('l’usure progresse avec le temps', wearing.buildings.some((b) => (b.wear ?? 0) > 0.02), wearing.buildings[0].wear);

// Exposition extérieure pendant une tempête
let stormOut = createInitialState();
stormOut.spike = 70;
stormOut.health = 90;
stormOut.radiation = 10;
let outside = stormOut;
let inside = stormOut;
for (let i = 0; i < 10; i++) {
  outside = advance(outside, 1, { outdoor: true });
  inside = advance(inside, 1, { sheltered: true });
}
check('sortir pendant une éruption est plus dangereux', outside.health < inside.health, {
  outside: outside.health,
  inside: inside.health,
});
check('la tempête survécue est comptée', (() => {
  let s = createInitialState();
  s.spike = 60;
  s.stormActive = true;
  s.spike = 0;
  s.stormActive = true;
  return advance(s, 1).stats.stormsSurvived === 1;
})());

// Objectifs
let objState = createInitialState();
objState.resources = { ...objState.resources, o2: 90, h2o: 90 };
const objs = evaluateObjectives(objState, computeUpkeep(objState, 0.8));
check('8 objectifs de mission', objs.length === 8, objs.length);
check('objectif systèmes vitaux validé', objs.find((o) => o.id === 'life_support')!.done);
check('objectif tempête non validé au départ', !objs.find((o) => o.id === 'storm_survived')!.done);

// --------------------------- Temps et modes ---------------------------
const realCfg = { ratio: 2, startSol: 1, missionDays: 0, startDateIso: '2026-01-01T06:00:00.000Z' };
check('1 h réelle = 2 h de mission', gameSecondsPerRealSecond('real', realCfg) === 2);
check('journée de mission = 12 h réelles', Math.abs(realMinutesPerGameDay('real', realCfg) - 720) < 1);
check('junior : journée de 4 min', Math.abs(realMinutesPerGameDay('junior', realCfg) - 4) < 0.1);
check('junior : 1 sim s par seconde réelle', simSecondsPerRealSecond('junior', realCfg) === 1);
check('réaliste : 12 h d’absence = 24 h de mission', (() => {
  const st = createInitialState('real', realCfg);
  const sum = summarizeAbsence(st, 12 * 3600);
  return Math.abs(sum.gameHours - 24) < 0.01;
})());

let realState = createInitialState('real', realCfg);
const elapsedBefore = realState.elapsedGameSec;
for (let i = 0; i < 3; i++) realState = advance(realState, 1);
check('le temps de mission avance de 6 min par sim s', realState.elapsedGameSec === elapsedBefore + 3 * 360);

// Rattrapage hors-ligne : 12 h réelles = 24 h de mission.
let offlineStart = createInitialState('real', realCfg);
offlineStart.buildings = offlineStart.buildings.map((b) => (b.key === 'hub' ? { ...b, wear: 0.2 } : b));
const savedAt = Date.parse('2026-01-02T06:00:00.000Z');
const offlineRes = simulateOffline(offlineStart, savedAt, savedAt + 12 * 3600 * 1000);
check('rattrapage calculé après 12 h', !!offlineRes);
if (offlineRes) {
  const rep = offlineRes.report;
  check('rapport : ~24 h de mission', Math.abs(rep.gameHours - 24) < 0.5, rep.gameHours);
  check('rapport : sols traversés', rep.toSol > rep.fromSol, { from: rep.fromSol, to: rep.toSol });
  check('rapport : ressources renseignées', Number.isFinite(rep.resourcesEnd.o2));
  check('rapport : avertissements listés', Array.isArray(rep.warnings));
  check('état hors-ligne cohérent', offlineRes.state.elapsedGameSec > offlineStart.elapsedGameSec);
}
check('pas de rattrapage en junior', simulateOffline(createInitialState('junior'), savedAt, savedAt + 3600_000) === null);

// Practice : aucune fin de mission.
let practice = createInitialState('practice');
practice.resources = { ...practice.resources, o2: 0, h2o: 0, food: 0 };
for (let i = 0; i < 200; i++) practice = advance(practice, 1);
check('practice ne perd jamais la mission', practice.alive && !practice.failure);

// --------------------------- Sauvegarde v4 ---------------------------
const saveStore = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (saveStore.has(k) ? saveStore.get(k)! : null),
  setItem: (k: string, v: string) => void saveStore.set(k, v),
  removeItem: (k: string) => void saveStore.delete(k),
  clear: () => saveStore.clear(),
};
clearSave();
let toSave = createInitialState('real', realCfg);
toSave.buildings = toSave.buildings.map((b) => (b.key === 'solar' ? { ...b, wear: 0.42, priority: 'low' } : b));
toSave.resources = { ...toSave.resources, food: 33 };
toSave.elapsedGameSec = 123456;
saveGame(toSave, 1_700_000_000_000);
const loaded = loadGame();
check('sauvegarde v4 relue', !!loaded);
if (loaded) {
  check('horodatage conservé', loaded.savedAt === 1_700_000_000_000);
  check('mode réel conservé', loaded.state.mode === 'real');
  check('usure conservée', (loaded.state.buildings.find((b) => b.key === 'solar')!.wear ?? 0) === 0.42);
  check('priorité conservée', loaded.state.buildings.find((b) => b.key === 'solar')!.priority === 'low');
  check('ressources conservées', loaded.state.resources.food === 33);
  check('temps de mission conservé', loaded.state.elapsedGameSec === 123456);
}

// Migration d'une sauvegarde v3.
clearSave();
const legacy = createInitialState('junior');
saveStore.set('infectium.save.v3', JSON.stringify(legacy));
const migrated = loadGame();
check('migration v3 → v4', !!migrated && migrated.state.mode === 'junior');
check('migration : temps reconstruit', !!migrated && migrated.state.elapsedGameSec > 0);
check('migration : sauvegarde v4 écrite', saveStore.has('infectium.save.v4'));

console.log(failures === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${failures} ÉCHEC(S)`);
process.exitCode = failures === 0 ? 0 : 1;
