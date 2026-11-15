import { GameState, UpkeepInfo } from './types';

// =========================================================================
// Objectifs de mission — lisibles par un enfant de 7-12 ans
// -------------------------------------------------------------------------
// Chaque objectif mesure une compétence réelle du jeu (survie, énergie,
// radiations, autonomie) et explique POURQUOI elle compte. Les récompenses
// sont versées une seule fois (suivi dans `state.objectivesDone`).
// =========================================================================

export interface Objective {
  id: string;
  title: string;
  detail: string;
  /** Explication pédagogique : pourquoi cet objectif est important. */
  why: string;
  /** 0..1 */
  progress: number;
  done: boolean;
  reward: number;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

export function evaluateObjectives(state: GameState, upkeep: UpkeepInfo): Objective[] {
  const capO2 = Math.max(1, upkeep.capacity.o2);
  const capH2O = Math.max(1, upkeep.capacity.h2o);
  const capFood = Math.max(1, upkeep.capacity.food);
  const o2Pct = state.resources.o2 / capO2;
  const h2oPct = state.resources.h2o / capH2O;
  const foodPct = state.resources.food / capFood;

  const hasShelter = state.buildings.some(
    (b) => (b.key === 'shelter' || b.key === 'shieldgen') && b.level > 0
  );
  const hasRecycler = state.buildings.some((b) => b.key === 'recycler' && b.level > 0);
  const nurseryLevel = state.buildings
    .filter((b) => b.key === 'nursery' || b.key === 'greenhouse')
    .reduce((max, b) => Math.max(max, b.level), 0);

  const powerCoverage = upkeep.powerDemand > 0 ? upkeep.powerAllocated / upkeep.powerDemand : 1;

  const list: Objective[] = [
    {
      id: 'life_support',
      title: 'Systèmes vitaux stables',
      detail: 'Garder oxygène et eau au-dessus de 60 % en même temps.',
      why: "Sans oxygène ni eau, l'équipage ne survit que quelques minutes. Les réserves doivent toujours garder une marge.",
      progress: Math.min(clamp01(o2Pct / 0.6), clamp01(h2oPct / 0.6)),
      done: o2Pct >= 0.6 && h2oPct >= 0.6,
      reward: 15,
    },
    {
      id: 'power_balance',
      title: 'Réseau électrique équilibré',
      detail: 'Alimenter toute la base sans coupure, avec une demande réelle.',
      why: "Une base peut avoir beaucoup de modules et pas assez d'électricité pour tous les faire tourner : il faut choisir des priorités.",
      progress: clamp01(powerCoverage),
      done: !upkeep.brownout && upkeep.powerDemand >= 0.25 && state.stats.solsSurvived >= 1,
      reward: 20,
    },
    {
      id: 'food_autonomy',
      title: 'Nourrir la base',
      detail: 'Porter la production alimentaire à un niveau durable.',
      why: "Les cultures consomment de l'eau et de l'énergie : produire sa nourriture, c'est accepter ce compromis.",
      progress: clamp01(Math.max(nurseryLevel / 2, foodPct / 0.8)),
      done: nurseryLevel >= 2 || foodPct >= 0.8,
      reward: 18,
    },
    {
      id: 'radiation_shield',
      title: 'Bouclier anti-radiations',
      detail: 'Atteindre 25 % de protection ou construire un abri.',
      why: "Dans l'espace, les particules solaires traversent la peau et l'électronique. Le blindage est la seule vraie protection.",
      progress: clamp01(upkeep.shield / 0.25),
      done: upkeep.shield >= 0.25 || hasShelter,
      reward: 18,
    },
    {
      id: 'storm_survived',
      title: 'Survivre à une tempête solaire',
      detail: 'Passer une éruption solaire avec la base intacte.',
      why: "Les éruptions solaires sont imprévisibles : l'autonomie et la protection décident de la survie de l'équipage.",
      progress: clamp01(state.stats.stormsSurvived / 1),
      done: state.stats.stormsSurvived >= 1,
      reward: 25,
    },
    {
      id: 'local_autonomy',
      title: 'Autonomie technique',
      detail: 'Réparer 2 modules sans attendre la Terre.',
      why: `La Terre est loin : le délai de communication empêche toute assistance immédiate. Savoir réparer seul est vital.`,
      progress: clamp01(state.stats.localRepairs / 2),
      done: state.stats.localRepairs >= 2,
      reward: 20,
    },
    {
      id: 'earth_link',
      title: 'Liaison Terre établie',
      detail: 'Recevoir une réponse du centre de contrôle.',
      why: "Communiquer avec la Terre prend du temps. Anticiper ses demandes fait partie du métier d'astronaute.",
      progress: clamp01(state.stats.earthAnswered / 1),
      done: state.stats.earthAnswered >= 1,
      reward: 12,
    },
    {
      id: 'recycle_loop',
      title: 'Boucle de recyclage',
      detail: 'Installer un recycleur eau + air.',
      why: "Rien ne se perd dans une base spatiale : l'urine et l'air sont recyclés pour économiser les reserves venues de la Terre.",
      progress: hasRecycler ? 1 : 0,
      done: hasRecycler,
      reward: 22,
    },
  ];

  return list.map((o) => ({
    ...o,
    progress: clamp01(o.progress),
    done: o.done || state.objectivesDone.includes(o.id),
  }));
}

/** Somme des récompenses des objectifs nouvellement validés. */
export function newlyCompleted(previous: string[], objectives: Objective[]): Objective[] {
  return objectives.filter((o) => o.done && !previous.includes(o.id));
}

/** Phase de mission dérivée du palier (repère de progression lisible). */
export function missionPhase(state: GameState): { index: 1 | 2 | 3; name: string; goal: string } {
  if (state.tier >= 3) {
    return { index: 3, name: 'Résilience', goal: 'Résister aux tempêtes solaires et boucler les ressources' };
  }
  if (state.tier >= 2) {
    return { index: 2, name: 'Autonomie', goal: "Produire sur place l'eau, l'air et la nourriture" };
  }
  return { index: 1, name: 'Survie', goal: "Maintenir les systèmes vitaux du premier avant-poste" };
}
