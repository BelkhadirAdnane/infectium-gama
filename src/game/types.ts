// =========================================================================
// INFECTIUM — types du gameplay (construction, ressources, progression)
// Les valeurs sont des paramètres de jeu, pas des données scientifiques.
// =========================================================================

export type GameMode = 'real' | 'junior' | 'practice';

/** Réglages de temps de la mission (mode RÉEL). */
export interface TimeConfig {
  /** Heures de jeu écoulées par heure réelle (2 = 1 h réelle → 2 h de mission). */
  ratio: number;
  /** Sol de départ (1 = premier jour lunaire). */
  startSol: number;
  /** Durée de mission en sols (0 = illimitée). */
  missionDays: number;
  /** Date/heure de départ de la mission (ISO 8601). */
  startDateIso: string;
}

export interface OfflineReport {
  realSeconds: number;
  gameSeconds: number;
  gameHours: number;
  fromSol: number;
  toSol: number;
  fromDateIso: string;
  toDateIso: string;
  resourcesStart: Resources;
  resourcesEnd: Resources;
  minResources: Resources;
  brownoutSeconds: number;
  breakdowns: string[];
  storms: number;
  healthStart: number;
  healthEnd: number;
  failure: string | null;
  warnings: string[];
}

export type ResourceKey = 'o2' | 'h2o' | 'energy' | 'food';

export type Resources = Record<ResourceKey, number>;
export type Capacities = Record<ResourceKey, number>;

export type ResourceRate = Record<ResourceKey, number>;

export interface BuildingDef {
  key: string;
  name: string;
  short: string;
  icon: string;
  tier: 1 | 2 | 3;
  /** Empreinte en cases de grille (largeur × profondeur). */
  w: number;
  d: number;
  /** Coût en points scientifiques (gagnés par les QCM). */
  cost: number;
  /** Coût de base d'une amélioration (× niveau cible). */
  upgradeCost: number;
  maxLevel: number;
  /** Bâtiment déjà présent dans la scène 3D d'origine (ancre fixe). */
  existing?: boolean;
  /** Coin haut-gauche de l'empreinte, en coordonnées de grille. */
  anchor?: { x: number; z: number };
  desc: string;
  /** Production par niveau et par seconde (avant rendement énergétique). */
  produces: Partial<Record<ResourceKey, number>>;
  /** Consommation par niveau et par seconde (hors électricité). */
  consumes: Partial<Record<ResourceKey, number>>;
  /** Capacité de stockage ajoutée par niveau. */
  capacity?: Partial<Record<ResourceKey, number>>;
  /** Protection anti-radiations par niveau (0..1), effective si alimentée. */
  shield?: number;
  /** Points bonus par bonne réponse (laboratoire). */
  quizBonus?: number;
  /** Production énergétique non dépendante du jour/nuit. */
  nightOnly?: boolean;
  /** Puissance électrique demandée par niveau (unités/s). */
  powerDraw?: number;
  /** Priorité de distribution par défaut. */
  defaultPriority?: ModulePriority;
  /** Couleur d'accent pour la 3D et l'UI. */
  accent: string;
}

/** Ordre de priorité de distribution d'électricité. */
export type ModulePriority = 'high' | 'normal' | 'low';

export interface BuildingInstance {
  id: string;
  key: string;
  /** Coin haut-gauche de l'empreinte sur la grille. */
  x: number;
  z: number;
  level: number;
  /** Priorité choisie par le joueur (sinon priorité par défaut du module). */
  priority?: ModulePriority;
  /** Usure 0..1 (0 = neuf, 1 = hors service). */
  wear?: number;
}

export interface TierDef {
  tier: 1 | 2 | 3;
  name: string;
  subtitle: string;
  /** Taille de la grille constructibles (cases). */
  grid: number;
  /** Score cumulé requis pour atteindre ce palier. */
  score: number;
}

/** Type de transmission vers le centre de contrôle terrestre. */
export type CommKind = 'diagnostic' | 'medical' | 'resupply' | 'analysis';

export interface CommEntry {
  id: number;
  kind: CommKind;
  label: string;
  /** Requête envoyée à (ms). */
  sentAt: number;
  /** Réponse attendue à (ms). */
  readyAt: number;
  status: 'pending' | 'answered' | 'cancelled';
  /** Résumé de l'effet appliqué (rempli à la réception). */
  result?: string;
  /** Vrai si la réponse est arrivée alors que la situation était déjà critique. */
  late?: boolean;
}

/** Statistiques de mission (objectifs et carnet de bord). */
export interface MissionStats {
  solsSurvived: number;
  stormsSurvived: number;
  localRepairs: number;
  earthRequests: number;
  earthAnswered: number;
  brownouts: number;
  harvests: number;
  maxTier: number;
}

export interface GameState {
  version: 3;
  /** Points scientifiques dépensables. */
  points: number;
  /** Score cumulé (jamais dépensé) : pilote les paliers. */
  score: number;
  tier: 1 | 2 | 3;
  resources: Resources;
  capacities: Capacities;
  /** Exposition instantanée aux radiations (0..100, plus haut = plus dangereux). */
  radiation: number;
  /** Santé de l'équipage (0..100). */
  health: number;
  /** Survie du personnage : faim, hydratation, sommeil (0..100). */
  hunger: number;
  hydration: number;
  fatigue: number;
  /** Bonus temporaire des panneaux solaires (timestamp ms). */
  solarBoostUntil: number;
  alive: boolean;
  /** 0..1 : position dans le jour lunaire (0 = lever, 0.62 = coucher). */
  dayT: number;
  /** Numéro du jour lunaire. */
  sol: number;
  buildings: BuildingInstance[];
  /** Intensité de l'éruption solaire en cours (DONKI / événements). */
  spike: number;
  quizAnswered: number;
  quizCorrect: number;
  /** Transmissions vers la Terre (en cours et historique). */
  comms: CommEntry[];
  /** Compteur d'identifiants de transmission. */
  commSeq: number;
  /** Nombre d'assistances terrestres reçues. */
  commCompleted: number;
  /** Statistiques cumulées de la mission. */
  stats: MissionStats;
  /** Objectifs déjà validés (identifiants). */
  objectivesDone: string[];
  /** Fiches du carnet de bord débloquées (identifiants). */
  journal: string[];
  /** Tempête en cours (pour compter les tempêtes survécues). */
  stormActive: boolean;
  /** Coupure d'énergie en cours (pour ne compter qu'une alerte par épisode). */
  brownoutActive: boolean;
  /** Mode de jeu choisi (réaliste, junior, practice). */
  mode: GameMode;
  /** Réglages de temps (utilisés surtout en mode réaliste). */
  timeConfig: TimeConfig;
  /** Temps de mission écoulé, en secondes de jeu depuis le départ. */
  elapsedGameSec: number;
  /** Message de fin de mission (si !alive). */
  failure: string | null;
}

/** État d'un module sur le réseau électrique. */
export interface ModuleStatus {
  id: string;
  key: string;
  level: number;
  priority: ModulePriority;
  /** Puissance demandée (unités/s). */
  demand: number;
  /** Puissance réellement allouée. */
  allocated: number;
  /** 0..1 — part de la demande couverte. */
  ratio: number;
  /** 0..1 — rendement final (coupure + usure). */
  efficiency: number;
  wear: number;
  brownout: boolean;
}

export interface UpkeepInfo {
  rates: ResourceRate;
  dayFactor: number;
  shield: number;
  ambientRadiation: number;
  quizBonus: number;
  capacity: Capacities;
  /** Production électrique brute (unités/s). */
  powerSupply: number;
  /** Demande électrique totale (unités/s). */
  powerDemand: number;
  /** Puissance effectivement distribuée. */
  powerAllocated: number;
  brownout: boolean;
  /** État détaillé par module. */
  modules: ModuleStatus[];
}
