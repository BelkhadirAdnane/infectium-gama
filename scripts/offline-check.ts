// Vérification manuelle du rattrapage hors-ligne sur plusieurs durées.
import { createInitialState } from '../src/game/sim';
import { simulateOffline } from '../src/game/offline';
import { gameSecondsPerRealSecond } from '../src/game/time';

const cfg = { ratio: 2, startSol: 1, missionDays: 0, startDateIso: '2026-01-01T06:00:00.000Z' };
for (const hours of [12, 24, 72, 168, 720]) {
  const s = createInitialState('real', cfg);
  const saved = Date.parse('2026-01-02T06:00:00.000Z');
  const t0 = performance.now();
  const res = simulateOffline(s, saved, saved + hours * 3600 * 1000);
  const ms = performance.now() - t0;
  if (!res) { console.log(`${hours} h : pas de rattrapage`); continue; }
  const r = res.report;
  console.log(
    `${hours} h réelles → ${(r.gameHours / 24).toFixed(1)} jours de mission | sol ${r.fromSol}→${r.toSol} | ` +
    `O2 ${Math.round(r.resourcesStart.o2)}→${Math.round(r.resourcesEnd.o2)} (min ${Math.round(r.minResources.o2)}) | ` +
    `eau ${Math.round(r.resourcesStart.h2o)}→${Math.round(r.resourcesEnd.h2o)} | ` +
    `nourriture ${Math.round(r.resourcesStart.food)}→${Math.round(r.resourcesEnd.food)} | ` +
    `délestage ${Math.round(r.brownoutSeconds / 60)} min | pannes ${r.breakdowns.length} | ` +
    `tempêtes ${r.storms} | vivant ${res.state.alive} | ${ms.toFixed(0)} ms`
  );
  console.log('   ⚠', r.warnings.join(' | ') || 'aucun');
}
console.log('ratio ×2 :', gameSecondsPerRealSecond('real', cfg), 's de jeu par s réelle');
