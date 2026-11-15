import {
  advance,
  applyBuild,
  eatFood,
  drinkWater,
  harvestFood,
  purifyWater,
  sleepCycle,
  applyDemolish,
  applyQuizResult,
  applyRadiationSpike,
  applyUpgrade,
  canBuildAt,
  computeUpkeep,
  createInitialState,
  daylightFactor,
  effectiveRadiation,
  tierForScore,
} from '../src/game/sim';
import { BUILDINGS } from '../src/game/buildings';
import { canPlace, findFreeSpot } from '../src/game/grid';
import { GameState } from '../src/game/types';

let failures = 0;
function check(name: string, cond: boolean, info?: unknown) {
  if (!cond) {
    failures++;
    console.log(`FAIL  ${name}`, info ?? '');
  } else {
    console.log(`ok    ${name}`);
  }
}

let s = createInitialState();
check('4 bâtiments d’origine niveau 1', s.buildings.length === 4 && s.buildings.every((b) => b.level === 1));
check('points de départ', s.points === 30 && s.tier === 1);
check('soleil au démarrage', daylightFactor(s.dayT) > 0.5);
check('plateau palier 1 = 32 m', BUILDINGS.hub.w === 12 && BUILDINGS.hub.anchor?.x === -6);

let t = s;
for (let i = 0; i < 60; i++) t = advance(t, 1);
check('O2 stable/positif avec la base', t.resources.o2 >= s.resources.o2, [s.resources.o2, t.resources.o2]);

const hub2 = applyUpgrade({ ...s, points: 18 }, 'hub')!;
check('hub niveau 2', hub2.buildings.find((b) => b.id === 'hub')!.level === 2 && hub2.points === 0);
check('amélioration refusée sans points', applyUpgrade({ ...s, points: 5 }, 'hub') === null);
const hubMax = { ...s, points: 500, buildings: s.buildings.map((b) => (b.id === 'hub' ? { ...b, level: 4 } : b)) };
check('hub niveau 4 = maximum', applyUpgrade(hubMax, 'hub') === null);

let q = createInitialState();
const r1 = applyQuizResult(q, true, 20);
check('QCM correct crédite les points', r1.state.points === 50 && r1.state.score === 20);
const r2 = applyQuizResult({ ...q, score: 140 }, true, 20);
check('QCM fait passer au palier 2', r2.tierUp === 2 && r2.state.tier === 2);
const r3 = applyQuizResult(q, false, 20);
check('QCM faux ne crédite rien', r3.state.points === q.points && r3.state.score === q.score);
check('tierForScore seuils', tierForScore(0) === 1 && tierForScore(150) === 2 && tierForScore(420) === 3);

q = { ...createInitialState(), points: 200 };
const spot = findFreeSpot('forge', q.buildings, q.tier);
check('emplacement libre trouvé pour la forge', !!spot);
const built = applyBuild(q, 'forge', spot!.x, spot!.z)!;
check('forge construite', !!built && built.buildings.length === 5 && built.points === 188);
check('collision détectée', !canPlace('forge', spot!.x, spot!.z, built.buildings, built.tier).ok);
check('hors plateau refusé', !canPlace('forge', 100, 100, built.buildings, built.tier).ok);
check('palier verrouillé refusé', !canPlace('lab', spot!.x, spot!.z, built.buildings, 1).ok);
check('pas de construction sans points', applyBuild({ ...q, points: 0 }, 'forge', spot!.x + 8, spot!.z) === null);

let all: GameState = { ...createInitialState(), tier: 3, points: 10000 };
let placed = 0;
for (const key of Object.keys(BUILDINGS)) {
  if (BUILDINGS[key].existing) continue;
  let spot2 = null;
  for (let x = -16; x < 16 && !spot2; x++) {
    for (let z = -16; z < 16 && !spot2; z++) {
      if (canPlace(key, x, z, all.buildings, 3).ok) spot2 = { x, z };
    }
  }
  if (spot2) {
    const next = applyBuild(all, key, spot2.x, spot2.z);
    if (next) {
      all = next;
      placed++;
    }
  }
}
check('les 10 modules du catalogue sont plaçables', placed === 10, placed);

const forge = built.buildings.find((b) => b.key === 'forge')!;
const upgraded = applyUpgrade({ ...built, points: 100 }, forge.id)!;
check('forge niveau 2', upgraded.buildings.find((b) => b.id === forge.id)!.level === 2);
const demolish = applyDemolish(upgraded, forge.id)!;
check('démolition récupère 50 %', demolish.refund === 10 && demolish.state.buildings.length === 4, demolish.refund);
check('impossible de démolir un bâtiment d’origine', applyDemolish(built, 'hub') === null);

const day = { ...createInitialState(), points: 100 };
const noon = { ...day, dayT: 0.31 };
const night = { ...day, dayT: 0.8, resources: { ...day.resources, energy: 60 } };
const upNoon = computeUpkeep(noon, daylightFactor(noon.dayT));
const upNight = computeUpkeep(night, daylightFactor(night.dayT));
check('production solaire le jour', upNoon.rates.energy > upNight.rates.energy, [upNoon.rates.energy, upNight.rates.energy]);
const nightAdv = advance(night, 10);
check('énergie baisse la nuit', nightAdv.resources.energy < night.resources.energy, nightAdv.resources.energy);

let rad = { ...createInitialState(), tier: 2, points: 200 };
rad = applyRadiationSpike(rad, 80);
const radNoShelter = effectiveRadiation(rad, computeUpkeep(rad, 1));
rad = applyBuild(rad, 'shelter', 13, 10)!;
check('abri constructible', !!rad);
const radShelter = effectiveRadiation(rad, computeUpkeep(rad, 1));
check('l’abri réduit la radiation', radShelter < radNoShelter, [radNoShelter, radShelter]);
let exposed = { ...rad, spike: 80, health: 100, dayT: 0.31 };
for (let i = 0; i < 120; i++) exposed = advance(exposed, 1);
check('la santé baisse sous forte radiation', exposed.health < 100, exposed.health);

const deadBase = createInitialState();
let dying: GameState = {
  ...deadBase,
  resources: { ...deadBase.resources, o2: 0.05 },
  buildings: deadBase.buildings.map((b) => ({ ...b, level: 0 })),
};
for (let i = 0; i < 3; i++) dying = advance(dying, 1);
check('échec quand l’O2 est épuisé', !dying.alive && !!dying.failure, dying.failure);

let capState = { ...createInitialState(), points: 200, tier: 2 as const };
capState = applyBuild(capState, 'reservoir', 10, 8)!;
check('réservoir ajoute du stockage', computeUpkeep(capState, 1).capacity.h2o === 135, computeUpkeep(capState, 1).capacity.h2o);

check('collision avec le hub d’origine', !canBuildAt(createInitialState(), 'forge', 0, 0));


// Survie : faim / soif / sommeil / récolte
const surv = createInitialState();
const drained = advance(surv, 100);
check('la faim baisse avec le temps', drained.hunger < surv.hunger, [surv.hunger, drained.hunger]);
check('l’hydratation baisse', drained.hydration < surv.hydration);
check('le sommeil baisse', drained.fatigue < surv.fatigue);
const fed = eatFood({ ...surv, hunger: 30 });
check('manger restaure la faim', fed.ok && fed.state.hunger === 70 && fed.state.resources.food === 32, [fed.state.hunger, fed.state.resources.food]);
const drunk = drinkWater({ ...surv, hydration: 20 });
check('boire restaure l’hydratation', drunk.ok && drunk.state.hydration === 60);
check('manger sans vivres refusé', !eatFood({ ...surv, resources: { ...surv.resources, food: 0 } }).ok);
const slept = sleepCycle({ ...surv, fatigue: 10, sol: 3, dayT: 0.8 });
check('dormir avance au sol suivant', slept.ok && slept.state.sol === 4 && slept.state.fatigue === 100, [slept.state.sol, slept.state.fatigue]);
check('dormir réveille au matin', slept.state.dayT === 0.1);
check('dormir sans vivres refusé', !sleepCycle({ ...surv, resources: { ...surv.resources, food: 2 } }).ok);
check('récolte +14 nourriture', harvestFood(surv).state.resources.food === surv.resources.food + 14);
check('purification +14 eau', purifyWater(surv).state.resources.h2o === surv.resources.h2o + 14);
let starving = { ...surv, hunger: 5, hydration: 5 };
for (let i = 0; i < 30; i++) starving = advance(starving, 1);
check('la faim critique fait baisser la santé', starving.health < 100, starving.health);

console.log(failures === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
