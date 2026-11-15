import { GameState, UpkeepInfo } from './types';

// =========================================================================
// Carnet de bord — fiches pédagogiques débloquées par l'expérience
// -------------------------------------------------------------------------
// Ces fiches ne sont pas des QCM : elles apparaissent parce que le joueur a
// VÉCU la situation (première coupure, première tempête, première réparation).
// Chaque fiche explique un phénomène scientifique ou technique réel.
// =========================================================================

export interface Insight {
  id: string;
  title: string;
  category: 'vie' | 'énergie' | 'radiations' | 'communications' | 'alimentation';
  text: string;
}

export const INSIGHTS: Insight[] = [
  {
    id: 'first_night',
    title: 'La nuit lunaire dure 14 jours terrestres',
    category: 'énergie',
    text: "Sur la Lune, un jour complet dure environ 29,5 jours terrestres : la nuit dure donc près de deux semaines. Sans soleil, les panneaux solaires ne produisent presque plus : il faut stocker l'énergie ou utiliser une autre source.",
  },
  {
    id: 'first_brownout',
    title: 'Pourquoi une base manque d’électricité',
    category: 'énergie',
    text: "Tous les modules ne consomment pas la même puissance. Quand la production est inférieure à la demande, la base redistribue l'électricité par priorité : survie d'abord, confort ensuite. Un module sous-alimenté tourne au ralenti.",
  },
  {
    id: 'first_wear',
    title: 'L’usure des machines',
    category: 'énergie',
    text: "Dans le vide lunaire, les écarts de température et la poussière abrasive usent les équipements. Une machine usée produit moins : il faut la réparer avant qu'elle ne tombe en panne.",
  },
  {
    id: 'first_storm',
    title: 'Les éruptions solaires',
    category: 'radiations',
    text: "Une éruption solaire projette des particules très énergétiques. Sur la Lune, sans atmosphère ni champ magnétique, elles atteignent directement le sol. La meilleure protection est un abri enterré ou un blindage épais.",
  },
  {
    id: 'first_shelter',
    title: 'Un abri plutôt qu’un mur',
    category: 'radiations',
    text: "Pour se protéger des radiations, la matière compte plus que la couleur du mur : quelques mètres de régolithe (la poussière de Lune) bloquent bien mieux les particules qu'une paroi fine.",
  },
  {
    id: 'first_repair',
    title: 'Réparer sans la Terre',
    category: 'communications',
    text: "Un aller-retour radio Terre-Lune prend environ 2,6 secondes : court, mais pendant une urgence chaque seconde compte. Les astronautes s'entraînent donc à diagnostiquer et réparer seuls.",
  },
  {
    id: 'first_comm',
    title: 'La lumière n’est pas instantanée',
    category: 'communications',
    text: "Les messages voyagent à la vitesse de la lumière (300 000 km/s), mais la Lune est à 384 400 km : un aller-retour prend environ 2,6 secondes. Vers Mars, le délai peut atteindre 40 minutes !",
  },
  {
    id: 'comm_late',
    title: 'Une réponse peut arriver trop tard',
    category: 'communications',
    text: "Demander un conseil à la Terre est utile, mais la réponse arrive après un délai. Anticiper et préparer des procédures autonomes fait partie de la mission.",
  },
  {
    id: 'first_harvest',
    title: 'Cultiver dans l’espace',
    category: 'alimentation',
    text: "Les plantes ont besoin de lumière, d'eau et de nutriments. Dans une serre spatiale, la lumière vient de lampes à LED et l'eau est recyclée : la nourriture coûte donc de l'énergie et de l'eau.",
  },
  {
    id: 'first_recycler',
    title: 'Rien ne se perd',
    category: 'alimentation',
    text: "Sur la Station spatiale internationale, une grande partie de l'eau est recyclée, y compris l'humidité de l'air et l'urine. Le recyclage réduit les réserves à envoyer depuis la Terre.",
  },
  {
    id: 'tier2',
    title: 'Une colonie, pas un camp',
    category: 'vie',
    text: "Passer d'un avant-poste à une colonie signifie produire sur place l'air, l'eau et la nourriture. Chaque nouveau module augmente aussi la demande en énergie et en maintenance.",
  },
  {
    id: 'nasa_live',
    title: 'Des données NASA en direct',
    category: 'radiations',
    text: "Le centre DONKI de la NASA surveille en continu l'activité solaire. INFECTIUM utilise ces observations réelles quand elles sont disponibles, et le signale clairement ; sinon, il bascule sur un modèle simplifié.",
  },
];

export const INSIGHT_BY_ID: Record<string, Insight> = Object.fromEntries(
  INSIGHTS.map((i) => [i.id, i])
);

/**
 * Fiches dont les conditions sont remplies. Le déclenchement de certaines
 * (réparation, récolte, communication) est géré directement par les actions ;
 * celles-ci sont les conditions d'état permanentes.
 */
export function autoInsights(state: GameState, upkeep: UpkeepInfo): string[] {
  const ids: string[] = [];
  if (upkeep.dayFactor <= 0) ids.push('first_night');
  if (upkeep.brownout) ids.push('first_brownout');
  if (state.buildings.some((b) => (b.wear ?? 0) > 0.3)) ids.push('first_wear');
  if (state.spike >= 25) ids.push('first_storm');
  if (state.buildings.some((b) => b.key === 'shelter' || b.key === 'shieldgen')) ids.push('first_shelter');
  if (state.buildings.some((b) => b.key === 'recycler')) ids.push('first_recycler');
  if (state.tier >= 2) ids.push('tier2');
  return ids;
}
