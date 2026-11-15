import { useEffect, useRef, useState } from 'react';
import type { SolarSystemApi } from './engine/solarSystem';
import { QUIZ_QUESTIONS, QuizQuestion } from './data/quiz';
import { createSessionQuizStore, QuizRotation } from './data/quizRotation';
import { fetchNasaBriefing, getNasaKeySource, NasaBriefing, setNasaApiKey } from './engine/donki';
import NasaPanel from './components/NasaPanel';
import { BUILDINGS, buildCost, upgradeCost } from './game/buildings';
import {
  applyBuild,
  applyDemolish,
  applyFreeRebuild,
  applyQuizResult,
  applyRadiationSpike,
  applyUpgrade,
  canBuildAt,
  clearSave,
  computeUpkeep,
  createInitialState,
  daylightFactor,
  loadGame,
  saveGame,
  advance,
  checkSolarPanels,
  drinkWater,
  eatFood,
  harvestFood,
  purifyWater,
  repairModule,
  setModulePriority,
  sleepCycle,
  tierForScore,
  SurvivalActionResult,
} from './game/sim';
import {
  COMM_CATALOG,
  CommKind,
  requestComm,
  resolveComms,
} from './game/comms';
import { evaluateObjectives } from './game/objectives';
import { autoInsights, INSIGHT_BY_ID } from './game/insights';
import { simulateOffline } from './game/offline';
import {
  MODE_META,
  gameSecondsPerRealSecond,
  isMissionComplete,
  missionDateLabel,
  missionProgress,
  simSecondsPerRealSecond,
} from './game/time';
import { ModeSelectModal, OfflineReportModal } from './components/ModePanels';
import { GameMode, GameState, ModulePriority, OfflineReport, TimeConfig } from './game/types';
import { LunarStateSnapshot } from './engine/lunar/LunarBaseScene';
import ResourceHUD, { HudSample } from './components/ResourceHUD';
import SystemsPanel, { SystemsTab } from './components/SystemsPanel';
import QuizModal, { QuizAnswerView } from './components/QuizModal';
import BuildDock from './components/BuildDock';
import Joysticks from './components/Joysticks';
import { AstronautHud, HelpModal, InteractionPrompt, SettingsModal, SleepOverlay, SolarStormBanner } from './components/SurvivalUI';
import { AstronautSnapshot, RoomId, ViewMode } from './engine/astronaut';
import { ControlSettings, loadControls, saveControls } from './engine/controls';
import { GhostBar, GameOver, SelectedPanel, TierBanner, ToastItem, ToastStack } from './components/GamePanels';

type Phase = 'space' | 'flying_to_moon' | 'lunar_base';

type Mission =
  | { kind: 'build'; key: string; x: number; z: number }
  | { kind: 'upgrade'; id: string }
  | { kind: 'series'; id: string; queue: string[] }
  | { kind: 'training'; remaining: number }
  | { kind: 'research' };

interface BuildMode {
  key: string;
  w: number;
  d: number;
}

interface GhostInfo {
  x: number;
  z: number;
  valid: boolean;
  reason?: string;
}

function missionSubtitle(mission: Mission, state: GameState): string {
  if (mission.kind === 'build') {
    const def = BUILDINGS[mission.key];
    return `Construire ${def.name} · ${def.cost} pts`;
  }
  if (mission.kind === 'upgrade') {
    const inst = state.buildings.find((b) => b.id === mission.id);
    if (!inst) return 'Amélioration';
    const def = BUILDINGS[inst.key];
    return `Améliorer ${def.name} (niv. ${inst.level} → ${inst.level + 1}) · ${upgradeCost(def, inst.level)} pts`;
  }
  if (mission.kind === 'series') {
    const def = BUILDINGS[mission.id];
    return `Reconstruire ${def?.name ?? 'la base'} · gratuit`;
  }
  return 'Entraînement libre · gagne des points';
}

const QUIZ_QUEUE_KEY = 'infectium.quiz.queue.v2';

const quizRotation = new QuizRotation(createSessionQuizStore(QUIZ_QUEUE_KEY));

export default function App() {
  const apiRef = useRef<SolarSystemApi | null>(null);
  const pendingStartRef = useRef(false);
  const [phase, setPhase] = useState<Phase>('space');
  const [boot] = useState(() => loadGame());
  const [game, setGame] = useState<GameState>(() => boot?.state ?? createInitialState());
  const [needsMode, setNeedsMode] = useState(!boot);
  const [modeModalOpen, setModeModalOpen] = useState(false);
  const [offlineReport, setOfflineReport] = useState<OfflineReport | null>(null);
  const [missionEndShown, setMissionEndShown] = useState(false);
  const gameRef = useRef(game);
  gameRef.current = game;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [buildMode, setBuildMode] = useState<BuildMode | null>(null);
  const [ghost, setGhost] = useState<GhostInfo | null>(null);

  const [mission, setMission] = useState<Mission | null>(null);
  const missionRef = useRef<Mission | null>(null);
  missionRef.current = mission;
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const questionRef = useRef<QuizQuestion | null>(null);
  questionRef.current = question;
  const [answer, setAnswer] = useState<QuizAnswerView | null>(null);
  const answerRef = useRef<QuizAnswerView | null>(null);
  answerRef.current = answer;
  const nextMissionRef = useRef<Mission | null>(null);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(1);
  const [tierBanner, setTierBanner] = useState<1 | 2 | 3 | null>(null);
  const lastSave = useRef(0);
  const ghostRef = useRef<GhostInfo | null>(null);
  const landedOnce = useRef(false);

  const upkeep = computeUpkeep(game, daylightFactor(game.dayT));
  const [lunarSnapshot, setLunarSnapshot] = useState<LunarStateSnapshot | null>(null);
  const [nasaBriefing, setNasaBriefing] = useState<NasaBriefing | null>(null);
  const [nasaOpen, setNasaOpen] = useState(false);
  const [nasaLoading, setNasaLoading] = useState(false);
  const nasaApplied = useRef<string | null>(null);
  const nasaLoadingRef = useRef(false);
  const [nasaKeySource, setNasaKeySource] = useState(getNasaKeySource());
  const deploying = phase === 'lunar_base' && !!lunarSnapshot?.deploying;
  const nasaEnabled = game.mode !== 'practice';
  const modeMeta = MODE_META[game.mode];
  const timeLabel = game.mode === 'real' ? missionDateLabel(game) : '';
  // Repère concret : temps avant la prochaine bascule jour/nuit, en mission ET en réel.
  const nightEta = (() => {
    if (game.mode !== 'real') return '';
    const ratio = game.timeConfig.ratio || 2;
    const DAY_FRACTION = 0.62; // aligné sur DAY_FRACTION de sim.ts
    const t = ((game.dayT % 1) + 1) % 1;
    const isDay = t < DAY_FRACTION;
    const delta = isDay ? DAY_FRACTION - t : 1 - t;
    const gameHours = delta * 24;
    const realMin = (gameHours / ratio) * 60;
    const human = realMin >= 60 ? `${(realMin / 60).toFixed(1)} h` : `${Math.round(realMin)} min`;
    return `${isDay ? '🌙 Nuit' : '☀️ Jour'} dans ${gameHours.toFixed(1)} h de mission (~${human})`;
  })();
  const missionPct = missionProgress(game);
  const progressToMissionEnd = game.timeConfig.missionDays > 0 ? missionPct : 0;

  // Mode astronaute (3ᵉ personne), survie et réglages des commandes.
  const [viewMode, setViewMode] = useState<ViewMode>('build');
  const [astro, setAstro] = useState<AstronautSnapshot | null>(null);
  const [controls, setControls] = useState<ControlSettings>(() => loadControls());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const exploring = phase === 'lunar_base' && !deploying && viewMode !== 'build';
  const building = phase === 'lunar_base' && !deploying && viewMode === 'build';
  const trainingCount = mission?.kind === 'training' ? mission.remaining : 0;

  // ------------------------------- Toasts -------------------------------
  function pushToast(text: string, kind: ToastItem['kind'] = 'info') {
    const id = toastSeq.current++;
    setToasts((prev) => [...prev.slice(-3), { id, kind, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5200);
  }

  function commit(next: GameState, persist = true) {
    gameRef.current = next;
    setGame(next);
    if (persist) {
      saveGame(next);
      lastSave.current = Date.now();
    }
  }

  function drawQuestion(): QuizQuestion {
    return quizRotation.draw();
  }

  function askMission(next: Mission) {
    setMission(next);
    missionRef.current = next;
    const q = drawQuestion();
    setQuestion(q);
    questionRef.current = q;
    setAnswer(null);
    answerRef.current = null;
    nextMissionRef.current = null;
  }

  // ----------------------------- Quiz -----------------------------
  function handleAnswer(correct: boolean) {
    const activeQuestion = questionRef.current;
    if (!activeQuestion || answerRef.current) return;
    const activeMission = missionRef.current;

    const result = applyQuizResult(gameRef.current, correct, activeQuestion.points);
    let next = result.state;
    let builtId: string | null = null;
    let detail = correct ? 'Continue comme ça, Explorateur !' : '';

    if (!correct) {
      detail = `La bonne réponse était : « ${activeQuestion.choices[activeQuestion.correctIndex]} ». Tu peux retenter ta chance.`;
    } else if (activeMission) {
      if (activeMission.kind === 'build') {
        const def = BUILDINGS[activeMission.key];
        if (next.points < buildCost(def)) {
          detail = `Il te manque ${buildCost(def) - next.points} pts pour construire ${def.name}. Tes points restent acquis.`;
        } else if (!canBuildAt(next, activeMission.key, activeMission.x, activeMission.z)) {
          detail = 'Cet emplacement a été occupé entre-temps. Choisis une autre case.';
        } else {
          const builtState = applyBuild(next, activeMission.key, activeMission.x, activeMission.z);
          if (builtState) {
            next = builtState;
            builtId = next.buildings[next.buildings.length - 1]?.id ?? null;
            detail = `${def.name} construite ! ${def.cost} pts dépensés.`;
          }
        }
      } else if (activeMission.kind === 'upgrade') {
        const inst = next.buildings.find((b) => b.id === activeMission.id);
        const def = inst ? BUILDINGS[inst.key] : null;
        const cost = inst && def ? upgradeCost(def, inst.level) : 0;
        if (!inst || !def) {
          detail = 'Bâtiment introuvable.';
        } else if (inst.level >= def.maxLevel) {
          detail = 'Ce bâtiment est déjà au niveau maximum.';
        } else if (next.points < cost) {
          detail = `Il te manque ${cost - next.points} pts pour améliorer ${def.name}. Tes points restent acquis.`;
        } else {
          const upgraded = applyUpgrade(next, activeMission.id);
          if (upgraded) {
            next = upgraded;
            detail = `${def.name} passe au niveau ${inst.level + 1} ! ${cost} pts dépensés.`;
          }
        }
      } else if (activeMission.kind === 'training') {
        if (activeMission.remaining > 1) {
          nextMissionRef.current = { kind: 'training', remaining: activeMission.remaining - 1 };
        }
        detail = 'Entraînement réussi : points crédités.';
      } else if (activeMission.kind === 'series') {
        const rebuilt = applyFreeRebuild(next, activeMission.id);
        if (rebuilt) {
          next = rebuilt;
          const def = BUILDINGS[activeMission.id];
          detail = `${def?.name ?? 'Bâtiment'} reconstruite gratuitement.`;
          if (activeMission.queue.length > 0) {
            nextMissionRef.current = {
              kind: 'series',
              id: activeMission.queue[0],
              queue: activeMission.queue.slice(1),
            };
          }
        }
      } else {
        detail = 'Entraînement terminé : tes points sont crédités.';
      }
    }

    setAnswer({ correct, gained: result.gained, detail });
    answerRef.current = { correct, gained: result.gained, detail };
    commit(next);

    if (result.gained > 0) {
      pushToast(`🎓 +${result.gained} pts${result.bonus ? ` (dont +${result.bonus} labo)` : ''}`, 'success');
    } else {
      pushToast('❌ Mauvaise réponse — réessaie avec une autre mission.', 'error');
    }

    if (builtId) {
      setSelectedId(builtId);
      setBuildMode(null);
      apiRef.current?.setBuildMode(null);
    }

    if (result.tierUp) {
      setTierBanner(result.tierUp as 1 | 2 | 3);
      pushToast(`🚀 Palier ${result.tierUp} débloqué — le plateau s'étend !`, 'success');
    }
  }

  function handleQuizClose() {
    if (!answerRef.current) return;
    const pending = nextMissionRef.current;
    nextMissionRef.current = null;
    setMission(null);
    missionRef.current = null;
    setQuestion(null);
    questionRef.current = null;
    setAnswer(null);
    answerRef.current = null;
    if (pending) {
      window.setTimeout(() => askMission(pending), 380);
    }
  }

  // --------------------------- Actions jeu ---------------------------
  function handlePickCatalog(key: string) {
    const def = BUILDINGS[key];
    if (!def) return;
    if (gameRef.current.tier < def.tier) {
      pushToast(`🔒 ${def.name} se débloque au palier ${def.tier}.`, 'error');
      return;
    }
    if (buildMode?.key === key) {
      setBuildMode(null);
      apiRef.current?.setBuildMode(null);
      return;
    }
    setSelectedId(null);
    setBuildMode({ key, w: def.w, d: def.d });
    setGhost(null);
    pushToast(`🧱 ${def.name} : choisis une case libre sur le plateau.`, 'info');
  }

  function handlePlaceRequest(cell: { x: number; z: number }) {
    if (!buildMode) return;
    if (!canBuildAt(gameRef.current, buildMode.key, cell.x, cell.z)) {
      pushToast('⛔ Placement impossible : case occupée ou hors du plateau.', 'error');
      return;
    }
    apiRef.current?.setBuildMode(null);
    askMission({ kind: 'build', key: buildMode.key, x: cell.x, z: cell.z });
  }

  function handleBuildingClick(id: string | null) {
    if (buildMode) return;
    if (!id) {
      setSelectedId(null);
      return;
    }
    const inst = gameRef.current.buildings.find((b) => b.id === id);
    if (!inst) return;
    setSelectedId(id);
    apiRef.current?.setBuildMode(null);
  }

  function requestLegacyUpgrade(key: string) {
    const inst = gameRef.current.buildings.find((b) => b.id === key);
    const def = BUILDINGS[key];
    if (!inst || !def) return;
    if (buildMode) {
      setBuildMode(null);
      apiRef.current?.setBuildMode(null);
      return;
    }
    if (inst.level >= def.maxLevel) {
      pushToast(`${def.name} est déjà au niveau maximum ★`, 'info');
      setSelectedId(key);
      return;
    }
    setSelectedId(null);
    askMission({ kind: 'upgrade', id: key });
  }

  function handleDockExisting(id: string) {
    requestLegacyUpgrade(id);
  }

  function handleUpgradeSelected() {
    if (!selectedId) return;
    askMission({ kind: 'upgrade', id: selectedId });
  }

  function handleDemolishSelected() {
    if (!selectedId) return;
    const inst = gameRef.current.buildings.find((b) => b.id === selectedId);
    if (!inst) return;
    const res = applyDemolish(gameRef.current, selectedId);
    if (!res) {
      pushToast('Ce bâtiment ne peut pas être démonté.', 'error');
      return;
    }
    commit(res.state);
    setSelectedId(null);
    pushToast(`🧰 ${BUILDINGS[inst.key].name} démontée · +${res.refund} pts récupérés.`, 'info');
  }

  function handleResearch() {
    askMission({ kind: 'research' });
  }

  function handleTrainingSeries() {
    askMission({ kind: 'training', remaining: 3 });
  }

  function handleReturnSpace() {
    if (viewMode !== 'build') changeViewMode('build');
    setBuildMode(null);
    setSelectedId(null);
    apiRef.current?.returnToSpace();
  }

  function handleRestart() {
    clearSave();
    const previous = gameRef.current;
    const fresh = createInitialState(previous.mode, {
      ...previous.timeConfig,
      startDateIso: new Date().toISOString(),
    });
    commit(fresh);
    setMissionEndShown(false);
    apiRef.current?.restartMission({ hub: 1, solar: 1, purifier: 1, nursery: 1 });
    setViewMode('build');
    setAstro(null);
    setSleeping(false);
    setSystemsOpen(false);
    setSelectedId(null);
    setBuildMode(null);
    setGhost(null);
    setMission(null);
    setQuestion(null);
    setAnswer(null);
    answerRef.current = null;
    nextMissionRef.current = null;
    quizRotation.reset();
    landedOnce.current = true;
    pushToast('🔄 Nouvelle mission : redéploiement de la base.', 'info');
  }

  // ------------------------ Mode astronaute / survie ------------------------
  function changeViewMode(mode: ViewMode, room: RoomId = 'hub') {
    if (mode !== 'build') {
      setBuildMode(null);
      setGhost(null);
      setSelectedId(null);
    }
    apiRef.current?.setViewMode(mode, room);
    setViewMode(mode);
    if (mode === 'build') setAstro(null);
  }

  function startSleep() {
    const check = sleepCycle(gameRef.current);
    if (!check.ok) {
      pushToast(check.message, 'error');
      return;
    }
    setSleeping(true);
    window.setTimeout(() => {
      const res = sleepCycle(gameRef.current);
      if (res.ok) {
        commit(res.state);
        pushToast(`😴 ${res.message}`, 'success');
      } else {
        pushToast(res.message, 'error');
      }
      setSleeping(false);
    }, 2600);
  }

  function handleAstronautAction(id: string, info?: { cooldown?: number }) {
    if (id === 'cooldown') {
      pushToast(`⏳ Pas encore prêt — encore ${Math.ceil(info?.cooldown ?? 0)} s.`, 'info');
      return;
    }
    const apply = (res: SurvivalActionResult) => {
      if (res.ok) {
        commit(res.state);
        pushToast(res.message, 'success');
      } else {
        pushToast(res.message, 'error');
      }
    };
    const g = gameRef.current;
    if (id.startsWith('harvest_')) return apply(harvestFood(g));
    switch (id) {
      case 'enter_hub':
        return changeViewMode('interior', 'hub');
      case 'enter_solar':
        return changeViewMode('interior', 'solar');
      case 'enter_purifier':
        return changeViewMode('interior', 'purifier');
      case 'enter_nursery':
        return changeViewMode('interior', 'nursery');
      case 'exit_base':
        return changeViewMode('exterior');
      case 'sleep':
        return startSleep();
      case 'quiz':
        return handleResearch();
      case 'nasa':
        return setNasaOpen(true);
      case 'food':
        return apply(eatFood(g));
      case 'water':
        return apply(drinkWater(g));
      case 'purify':
        return apply(purifyWater(g));
      case 'solar_check':
        return apply(checkSolarPanels(g));
      case 'earth_comm':
        setSystemsTab('comms');
        setSystemsOpen(true);
        return undefined;
      case 'systems':
        setSystemsTab('power');
        setSystemsOpen(true);
        return undefined;
      default:
        return undefined;
    }
  }

  // ---------------------- Liaison Terre (délai réel) ----------------------
  // Les commandes locales (manger, construire, purifier…) sont instantanées.
  // Seules les demandes au centre de contrôle subissent le délai de transmission.
  const [commNow, setCommNow] = useState(() => Date.now());
  const [systemsOpen, setSystemsOpen] = useState(false);
  const [systemsTab, setSystemsTab] = useState<SystemsTab>('power');
  /** Accélération temporaire du temps (mode réel uniquement). */
  const [turbo, setTurbo] = useState(1);
  const [history, setHistory] = useState<HudSample[]>([]);
  const historyRef = useRef<HudSample[]>([]);
  const lastTickRef = useRef(Date.now());
  const offlineAlerted = useRef<Set<string>>(new Set());
  const viewModeRef = useRef<ViewMode>(viewMode);
  viewModeRef.current = viewMode;
  const roomRef = useRef<RoomId>(astro?.room ?? 'hub');
  roomRef.current = astro?.room ?? 'hub';
  const commDistanceKm = nasaBriefing?.environment.distanceKm ?? 384400;

  function unlockInsight(id: string) {
    if (gameRef.current.journal.includes(id)) return;
    const insight = INSIGHT_BY_ID[id];
    if (!insight) return;
    commit({ ...gameRef.current, journal: [...gameRef.current.journal, id] });
    pushToast(`📓 Fiche débloquée : ${insight.title}`, 'info');
  }

  function requestEarth(kind: CommKind) {
    const res = requestComm(gameRef.current, kind, commDistanceKm, Date.now(), gameRef.current.spike);
    if (!res) {
      pushToast('📡 File saturée (2 demandes max) — attends une réponse avant d’en envoyer une autre.', 'info');
      return;
    }
    commit(res.state);
    unlockInsight('first_comm');
    pushToast(
      `📡 ${COMM_CATALOG[kind].short} envoyé · aller-retour lumière ${res.realDelay.toFixed(2)} s · réponse dans ${res.delay} s de jeu.`,
      'info'
    );
  }

  useEffect(() => {
    if (phase !== 'lunar_base') return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setCommNow(now);
      const res = resolveComms(gameRef.current, now);
      if (res.completed.length > 0) {
        commit(res.state);
        res.completed.forEach((c) => {
          pushToast(`📡 ${c.message}`, c.late ? 'warning' : 'success');
          if (c.late) unlockInsight('comm_late');
        });
        unlockInsight('first_comm');
      }
    }, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ------------------- Objectifs et carnet de bord -------------------
  const objectives = evaluateObjectives(game, upkeep);

  useEffect(() => {
    if (phase !== 'lunar_base' || !game.alive) return;
    const done = objectives.filter((o) => o.done && !game.objectivesDone.includes(o.id));
    if (done.length === 0) return;
    const reward = done.reduce((sum, o) => sum + o.reward, 0);
    const score = gameRef.current.score + reward;
    const newTier = tierForScore(score);
    commit({
      ...gameRef.current,
      points: gameRef.current.points + reward,
      score,
      tier: newTier,
      objectivesDone: [...gameRef.current.objectivesDone, ...done.map((o) => o.id)],
    });
    if (newTier > gameRef.current.tier) setTierBanner(newTier as 1 | 2 | 3);
    done.forEach((o) => {
      pushToast(`🎯 Objectif validé : ${o.title} (+${o.reward} pts)`, 'success');
      pushToast(`💡 ${o.why}`, 'info');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, objectives, phase]);

  useEffect(() => {
    if (phase !== 'lunar_base' || !game.alive) return;
    const ids = autoInsights(game, upkeep).filter((id) => !game.journal.includes(id));
    if (ids.length === 0) return;
    commit({ ...gameRef.current, journal: [...gameRef.current.journal, ...ids] });
    ids.forEach((id) => {
      const insight = INSIGHT_BY_ID[id];
      if (insight) pushToast(`📓 Fiche débloquée : ${insight.title}`, 'info');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, upkeep, phase]);

  function handleRepair(id: string) {
    const res = repairModule(gameRef.current, id);
    if (res.ok) {
      commit(res.state);
      unlockInsight('first_repair');
      pushToast(`🔧 ${res.message}`, 'success');
    } else {
      pushToast(res.message, 'error');
    }
  }

  function handlePriority(id: string, priority: ModulePriority) {
    commit(setModulePriority(gameRef.current, id, priority));
  }

  // ------------------------ Modes et temps de mission ------------------------
  function resetTransientUi() {
    setViewMode('build');
    setAstro(null);
    setSleeping(false);
    setSystemsOpen(false);
    setSelectedId(null);
    setBuildMode(null);
    setGhost(null);
    setMission(null);
    setQuestion(null);
    setAnswer(null);
    answerRef.current = null;
    nextMissionRef.current = null;
    quizRotation.reset();
    setMissionEndShown(false);
  }

  function startMissionWithMode(mode: GameMode, config: TimeConfig) {
    const fresh = createInitialState(mode, config);
    commit(fresh);
    setNeedsMode(false);
    setModeModalOpen(false);
    setOfflineReport(null);
    offlineAlerted.current.clear();
    resetTransientUi();
    landedOnce.current = true;
    if (apiRef.current) {
      apiRef.current.restartMission({ hub: 1, solar: 1, purifier: 1, nursery: 1 });
    } else {
      pendingStartRef.current = true;
    }
    pushToast(
      `🚀 ${MODE_META[mode].name} — ${mode === 'real' ? `${MODE_META[mode].tagline}.` : 'mission lancée.'}`,
      'success'
    );
  }

  function applyMode(mode: GameMode, config: TimeConfig) {
    commit({
      ...gameRef.current,
      mode,
      timeConfig: {
        ...config,
        // Conserve la date de départ existante si l'utilisateur ne l'a pas changée.
        startDateIso: config.startDateIso || gameRef.current.timeConfig.startDateIso,
      },
    });
    setModeModalOpen(false);
    setMissionEndShown(false);
    if (mode === 'practice') {
      setNasaBriefing(null);
      pushToast('🧪 Mode Practice : données NASA désactivées, aucune fin de mission.', 'info');
    } else {
      pushToast(`🎛 Mode ${MODE_META[mode].name} appliqué.`, 'info');
    }
    if (mode === 'real') loadNasa(true);
  }

  // Rattrapage hors-ligne : calculé une seule fois au chargement, jamais en
  // arrière-plan. Le temps de mission écoulé est rejoué puis résumé.
  const offlineChecked = useRef(false);
  useEffect(() => {
    if (offlineChecked.current || !boot) return;
    offlineChecked.current = true;
    const res = simulateOffline(boot.state, boot.savedAt);
    if (res) {
      commit(res.state);
      setOfflineReport(res.report);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isMissionComplete(game) || missionEndShown) return;
    setMissionEndShown(true);
    pushToast(
      `🏁 Mission de ${game.timeConfig.missionDays} sols terminée au sol ${game.sol}. La base reste disponible en mode libre.`,
      'success'
    );
  }, [game, missionEndShown]);

  // ------------------------- Initialisation 3D -------------------------
  const handlers = useRef({
    legacy: (key: string) => requestLegacyUpgrade(key),
    building: (id: string | null) => handleBuildingClick(id),
    place: (cell: { x: number; z: number }) => handlePlaceRequest(cell),
    rejected: (reason: string) => {
      const label: Record<string, string> = {
        occupied: 'Case occupée par un bâtiment.',
        'out-of-bounds': 'Hors du plateau débloqué.',
        blocked: 'Zone du pas de tir : impossible de construire ici.',
        'no-target': 'Vise une case du plateau lunaire.',
      };
      pushToast(`⛔ ${label[reason] ?? 'Placement impossible.'}`, 'error');
    },
    ghost: (info: GhostInfo | null) => {
      const prev = ghostRef.current;
      const same =
        (!prev && !info) ||
        (prev && info && prev.x === info.x && prev.z === info.z && prev.valid === info.valid && prev.reason === info.reason);
      if (same) return;
      ghostRef.current = info;
      setGhost(info);
    },
    cancel: () => {
      setBuildMode(null);
      setGhost(null);
    },
    astronaut: (id: string, info?: { cooldown?: number }) => handleAstronautAction(id, info),
  });

  handlers.current = {
    legacy: requestLegacyUpgrade,
    building: handleBuildingClick,
    place: handlePlaceRequest,
    rejected: (reason: string) => {
      const label: Record<string, string> = {
        occupied: 'Case occupée par un bâtiment.',
        'out-of-bounds': 'Hors du plateau débloqué.',
        blocked: 'Zone du pas de tir : impossible de construire ici.',
        'no-target': 'Vise une case du plateau lunaire.',
      };
      pushToast(`⛔ ${label[reason] ?? 'Placement impossible.'}`, 'error');
    },
    ghost: (info: GhostInfo | null) => {
      const prev = ghostRef.current;
      const same =
        (!prev && !info) ||
        (prev && info && prev.x === info.x && prev.z === info.z && prev.valid === info.valid && prev.reason === info.reason);
      if (same) return;
      ghostRef.current = info;
      setGhost(info);
    },
    cancel: () => {
      setBuildMode(null);
      setGhost(null);
    },
    astronaut: handleAstronautAction,
  };

  useEffect(() => {
    let disposed = false;
    let api: SolarSystemApi | null = null;

    (async () => {
      // Le moteur 3D (three.js) est chargé APRÈS le premier rendu : l'interface
      // et l'écran de choix de mode s'affichent immédiatement.
      const { initSolarSystem } = await import('./engine/solarSystem');
      if (disposed) return;

      api = initSolarSystem({
        onPhaseChange: (p) => setPhase(p),
        onRequestUpgrade: (key) => handlers.current.legacy(key),
        onBuildingClick: (id) => handlers.current.building(id),
        onPlaceRequest: (cell) => handlers.current.place(cell),
        onPlaceRejected: (reason) => handlers.current.rejected(reason),
        onGhostChange: (info) => handlers.current.ghost(info),
        onCancelBuild: () => handlers.current.cancel(),
        onLunarStateChange: (snap) => setLunarSnapshot(snap),
        onAstronautInteract: (id, info) => handlers.current.astronaut(id, info),
      });
      apiRef.current = api;

      // Première synchronisation (le moteur arrive après le premier rendu).
      const initial = gameRef.current;
      api.syncGame({
        buildings: initial.buildings,
        tier: initial.tier,
        daylight: daylightFactor(initial.dayT),
        selectedId: null,
      });
      api.setAstronautSettings(controls);

      // Le joueur a pu valider le mode avant la fin du chargement du moteur.
      if (pendingStartRef.current) {
        pendingStartRef.current = false;
        api.restartMission({ hub: 1, solar: 1, purifier: 1, nursery: 1 });
      }

      // Sauvegarde existante : reprise directe sur la base.
      if (boot) {
        const levelOf = (key: string) =>
          boot.state.buildings.find((b) => b.key === key)?.level ?? 1;
        api.resumeMission(
          {
            hub: levelOf('hub'),
            solar: levelOf('solar'),
            purifier: levelOf('purifier'),
            nursery: levelOf('nursery'),
          },
          boot.state.tier
        );
        landedOnce.current = true;
      }
    })();

    return () => {
      disposed = true;
      api?.dispose();
      apiRef.current = null;
    };
  }, []);

  // Synchronise la 3D avec l'état de jeu (plateau, modules, sélection, lumière).
  useEffect(() => {
    apiRef.current?.syncGame({
      buildings: game.buildings,
      tier: game.tier,
      daylight: daylightFactor(game.dayT),
      selectedId,
    });
  }, [game.buildings, game.tier, game.dayT, selectedId, phase]);

  useEffect(() => {
    apiRef.current?.setBuildMode(buildMode ? { key: buildMode.key, w: buildMode.w, d: buildMode.d } : null);
  }, [buildMode]);

  // Réglages des commandes : appliqués au moteur et sauvegardés.
  useEffect(() => {
    apiRef.current?.setAstronautSettings(controls);
    saveControls(controls);
  }, [controls]);

  // Les saisies du personnage sont suspendues pendant un QCM, un panneau ou le sommeil.
  const inputBlocked = !!mission || nasaOpen || settingsOpen || helpOpen || sleeping || !!tierBanner || !game.alive;
  useEffect(() => {
    apiRef.current?.setAstronautInputEnabled(!inputBlocked);
  }, [inputBlocked, viewMode]);

  // Besoins bas = déplacement ralenti.
  useEffect(() => {
    let f = 1;
    if (game.fatigue < 20) f *= 0.65;
    if (game.hunger < 15) f *= 0.8;
    if (game.hydration < 15) f *= 0.8;
    apiRef.current?.setSpeedFactor(f);
  }, [game.fatigue, game.hunger, game.hydration]);

  // Lecture régulière de l'objet interactif le plus proche.
  useEffect(() => {
    if (viewMode === 'build') return;
    const timer = window.setInterval(() => {
      const snap = apiRef.current?.getAstronautSnapshot();
      if (!snap) return;
      setAstro((prev) =>
        prev &&
        prev.room === snap.room &&
        prev.interaction?.id === snap.interaction?.id &&
        prev.interaction?.hint === snap.interaction?.hint
          ? prev
          : snap
      );
    }, 120);
    return () => window.clearInterval(timer);
  }, [viewMode]);

  // Données NASA réelles : DONKI (météo spatiale), APOD et NeoWs.
  async function loadNasa(force = false) {
    if (!nasaEnabled) return;
    if (nasaLoadingRef.current) return;
    nasaLoadingRef.current = true;
    setNasaLoading(true);
    try {
      const briefing = await fetchNasaBriefing(force);
      setNasaBriefing(briefing);
      const latest = briefing.events[0];
      if (latest && latest.id !== nasaApplied.current) {
        nasaApplied.current = latest.id;
        const intensity = Math.min(60, Math.round(briefing.radiationIndex * 0.8));
        if (intensity > 0) {
          commit(applyRadiationSpike(gameRef.current, intensity));
          pushToast(
            briefing.source === 'live'
              ? `🛰️ NASA DONKI : ${latest.label} — +${intensity} radiation.`
              : '☀️ Météo spatiale simulée : +18 radiation (API NASA indisponible).',
            briefing.source === 'live' ? 'warning' : 'info'
          );
        }
      } else if (briefing.source === 'live' && briefing.events.length === 0) {
        pushToast('🛰️ NASA LIVE : aucune éruption majeure sur les 7 derniers jours.', 'info');
      }
      // Le quota est signalé dans le panneau NASA (badge SIM + avertissement),
      // sans ajouter une notification supplémentaire pendant l'atterrissage.
    } catch {
      pushToast('🛰️ Données NASA momentanément indisponibles — mode simulé.', 'info');
    } finally {
      nasaLoadingRef.current = false;
      setNasaLoading(false);
    }
  }

  // Simulation : pas de temps réel (le mode RÉEL peut rattraper plusieurs minutes).
  
  useEffect(() => {
    if (phase !== 'lunar_base') return;
    // En mode RÉEL, le temps ne s'arrête pas quand un panneau est ouvert :
    // c'est tout l'intérêt d'une mission persistante. Les autres modes
    // conservent la pause pendant les QCM et les interfaces.
    const uiPaused = mission || tierBanner || deploying || sleeping || nasaOpen || systemsOpen || settingsOpen || helpOpen;
    if (!game.alive) return;
    if (game.mode !== 'real' && uiPaused) return;
    lastTickRef.current = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now();
      const realDt = Math.min(86400, Math.max(0, (now - lastTickRef.current) / 1000));
      lastTickRef.current = now;
      let current = gameRef.current;
      if (!current.alive) return;
      const turboFactor = current.mode === 'real' ? turbo : 1;
      let simRemaining =
        realDt * simSecondsPerRealSecond(current.mode, current.timeConfig) * turboFactor;
      const ctx = {
        outdoor: viewModeRef.current === 'exterior',
        sheltered: viewModeRef.current === 'interior' && roomRef.current === 'hub',
      };
      while (simRemaining > 0.0001 && current.alive) {
        const chunk = Math.min(5, simRemaining);
        const stormRate = current.mode === 'real' ? 0.0015 : 0.007;
        if (current.mode !== 'practice' && Math.random() < stormRate * chunk) {
          const intensity = 15 + Math.random() * 30;
          current = applyRadiationSpike(current, intensity);
          pushToast(`☀️ Éruption solaire ! +${Math.round(intensity)} radiation — abrite l'équipage.`, 'warning');
        }
        current = advance(current, chunk, ctx);
        simRemaining -= chunk;
      }
      commit(current, false);
      current.buildings.forEach((b) => {
        if ((b.wear ?? 0) >= 0.95 && !offlineAlerted.current.has(b.id)) {
          offlineAlerted.current.add(b.id);
          pushToast(`🔧 ${BUILDINGS[b.key]?.name ?? 'Module'} est hors service (usure 100 %) — répare-le dans Systèmes.`, 'error');
        }
        if ((b.wear ?? 0) < 0.9) offlineAlerted.current.delete(b.id);
      });
      historyRef.current = [
        ...historyRef.current.slice(-59),
        {
          o2: current.resources.o2,
          h2o: current.resources.h2o,
          energy: current.resources.energy,
          food: current.resources.food,
          radiation: current.radiation,
        },
      ];
      setHistory([...historyRef.current]);
      if (Date.now() - lastSave.current > 4000) {
        saveGame(current);
        lastSave.current = Date.now();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, game.alive, mission, tierBanner, deploying, sleeping, nasaOpen, systemsOpen, settingsOpen, helpOpen, game.mode, turbo]);

  // NASA : premier chargement à l'atterrissage puis rafraîchissement toutes les 5 min.
  useEffect(() => {
    if (phase !== 'lunar_base') return;
    if (!nasaEnabled) {
      setNasaBriefing(null);
      return;
    }
    loadNasa(false);
    const timer = window.setInterval(() => loadNasa(false), 3 * 60 * 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, nasaEnabled]);

  // Message d'accueil à l'atterrissage.
  useEffect(() => {
    if (phase === 'lunar_base' && !landedOnce.current) {
      landedOnce.current = true;
      pushToast('🌙 Base déployée : améliore les modules et étends la colonie avec les QCM.', 'success');
    }
    if (phase === 'space') {
      if (viewMode !== 'build') changeViewMode('build');
      setBuildMode(null);
      setSelectedId(null);
      setGhost(null);
    }
  }, [phase]);

  useEffect(() => {
    if (!tierBanner) return;
    const t = window.setTimeout(() => setTierBanner(null), 9000);
    return () => window.clearTimeout(t);
  }, [tierBanner]);

  useEffect(() => {
    const persist = () => saveGame(gameRef.current);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') persist();
    };
    window.addEventListener('beforeunload', persist);
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', persist);
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!mission) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && answerRef.current) handleQuizClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mission]);

  const selectedExists = selectedId ? game.buildings.some((b) => b.id === selectedId) : false;

  return (
    <>
      {building && (
        <ResourceHUD
          state={game}
          upkeep={upkeep}
          nasaStatus={
            !nasaEnabled ? 'off' : nasaLoading ? 'loading' : nasaBriefing?.source === 'live' ? 'live' : 'simulated'
          }
          nasaEvent={nasaBriefing?.events[0]?.label}
          history={history}
          objectivesDone={objectives.filter((o) => o.done).length}
          objectivesTotal={objectives.length}
          onOpenNasa={() => setNasaOpen(true)}
          onOpenSystems={() => {
            setSystemsTab('power');
            setSystemsOpen(true);
          }}
          onOpenObjectives={() => {
            setSystemsTab('objectives');
            setSystemsOpen(true);
          }}
          mode={game.mode}
          timeLabel={timeLabel}
          missionDays={game.timeConfig.missionDays}
          missionPct={progressToMissionEnd}
          turbo={turbo}
          onTurbo={setTurbo}
          nightEta={nightEta}
          onOpenMode={() => setModeModalOpen(true)}
        />
      )}

      {building && (
        <BuildDock
          state={game}
          buildModeKey={buildMode?.key ?? null}
          onPickCatalog={handlePickCatalog}
          onPickExisting={handleDockExisting}
          onCancelBuild={() => {
            setBuildMode(null);
            setGhost(null);
            apiRef.current?.setBuildMode(null);
          }}
          onResearch={handleResearch}
          onTrainingSeries={handleTrainingSeries}
          onReturnSpace={handleReturnSpace}
          onExplore={() => changeViewMode('exterior')}
          trainingCount={trainingCount}
        />
      )}

      {building && buildMode && (
        <GhostBar defKey={buildMode.key} ghost={ghost} points={game.points} />
      )}

      {building && selectedId && selectedExists && !buildMode && !mission && (
        <SelectedPanel
          state={game}
          id={selectedId}
          onUpgrade={handleUpgradeSelected}
          onDemolish={handleDemolishSelected}
          onClose={() => setSelectedId(null)}
        />
      )}

      {question && mission && (
        <QuizModal
          key={`${question.id}-${mission.kind}`}
          question={question}
          title={mission.kind === 'build'
            ? 'Construction'
            : mission.kind === 'upgrade'
              ? 'Amélioration'
              : mission.kind === 'series'
                ? 'Reconstruction'
                : 'Entraînement'}
          subtitle={missionSubtitle(mission, game)}
          answer={answer}
          onAnswer={handleAnswer}
          onClose={handleQuizClose}
          closeLabel={nextMissionRef.current ? 'Question suivante' : 'Continuer'}
        />
      )}

      {deploying && lunarSnapshot && (
        <div className="deploy-overlay">
          <div className="deploy-card">
            <span className="deploy-eyebrow">INFECTIUM · SÉQUENCE D'IMPLANTATION</span>
            <h2>{lunarSnapshot.banner}</h2>
            <div className="deploy-progress">
              <div className="deploy-fill" style={{ width: `${Math.round(lunarSnapshot.progress * 100)}%` }} />
            </div>
            <p className="deploy-phases">
              <span className={lunarSnapshot.progress > 0.36 ? 'done' : ''}>① Atterrissage lunaire</span>
              <span className={lunarSnapshot.progress > 0.4 ? 'done' : ''}>② Hub</span>
              <span className={lunarSnapshot.progress > 0.5 ? 'done' : ''}>③ Énergie</span>
              <span className={lunarSnapshot.progress > 0.6 ? 'done' : ''}>④ Eau & serre</span>
              <span className={lunarSnapshot.progress > 0.8 ? 'done' : ''}>⑤ Couloirs pressurisés</span>
            </p>
            <p className="deploy-note">Le plateau de construction s'active à la fin de la séquence.</p>
          </div>
        </div>
      )}

      {nasaOpen && (
        <NasaPanel
          briefing={nasaBriefing}
          loading={nasaLoading}
          keySource={nasaKeySource}
          disabled={!nasaEnabled}
          onRefresh={() => loadNasa(true)}
          onSaveKey={(key) => {
            setNasaApiKey(key);
            setNasaKeySource(getNasaKeySource());
            nasaApplied.current = null;
            pushToast(key.trim() ? '🛰️ Clé NASA enregistrée — synchronisation live…' : 'Clé NASA retirée.', 'info');
            loadNasa(true);
          }}
          onClose={() => setNasaOpen(false)}
        />
      )}

      {exploring && (
        <>
          <AstronautHud
            state={game}
            room={astro?.room ?? (viewMode === 'exterior' ? 'exterior' : 'hub')}
            modeLabel={modeMeta.name}
            turbo={game.mode === 'real' ? turbo : undefined}
            onTurbo={game.mode === 'real' ? setTurbo : undefined}
            nasaStatus={nasaLoading ? 'loading' : nasaBriefing?.source === 'live' ? 'live' : 'simulated'}
            onBuild={() => changeViewMode('build')}
            onNasa={() => setNasaOpen(true)}
            onSettings={() => setSettingsOpen(true)}
            onHelp={() => setHelpOpen(true)}
            onSystems={() => {
              setSystemsTab('power');
              setSystemsOpen(true);
            }}
            onEat={() => handleAstronautAction('food')}
            onDrink={() => handleAstronautAction('water')}
          />
          <InteractionPrompt
            interaction={astro?.interaction ?? null}
            onInteract={() => apiRef.current?.astronautInteract()}
          />
          <Joysticks
            size={controls.joystickSize}
            opacity={controls.joystickOpacity}
            onMove={(x, y) => apiRef.current?.setMoveStick(x, y)}
            onLook={(x, y) => apiRef.current?.setLookStick(x, y)}
          />
        </>
      )}

      {needsMode && (
        <ModeSelectModal
          mode={game.mode}
          config={game.timeConfig}
          firstRun
          onConfirm={startMissionWithMode}
        />
      )}

      {!needsMode && modeModalOpen && (
        <ModeSelectModal
          mode={game.mode}
          config={game.timeConfig}
          firstRun={false}
          onConfirm={applyMode}
          onCancel={() => setModeModalOpen(false)}
        />
      )}

      {offlineReport && (
        <OfflineReportModal
          report={offlineReport}
          mode={game.mode}
          onClose={() => setOfflineReport(null)}
        />
      )}

      {systemsOpen && (
        <SystemsPanel
          key={systemsTab}
          state={game}
          upkeep={upkeep}
          objectives={objectives}
          now={commNow}
          distanceKm={commDistanceKm}
          onClose={() => setSystemsOpen(false)}
          onRepair={handleRepair}
          onPriority={handlePriority}
          onRequestComm={requestEarth}
          initialTab={systemsTab}
        />
      )}

      {settingsOpen && <SettingsModal settings={controls} onChange={setControls} onClose={() => setSettingsOpen(false)} />}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      {sleeping && <SleepOverlay nextSol={game.sol + 1} />}

      {phase === 'lunar_base' && game.alive && game.spike >= 25 && (
        <SolarStormBanner
          spike={game.spike}
          sheltered={viewMode === 'interior' && (astro?.room ?? 'hub') === 'hub'}
          outdoor={viewMode === 'exterior'}
        />
      )}

      <ToastStack items={toasts} className={exploring ? 'astronaut' : ''} />

      {tierBanner && <TierBanner tier={tierBanner} onClose={() => setTierBanner(null)} />}

      {phase === 'lunar_base' && !game.alive && <GameOver state={game} onRestart={handleRestart} />}

      {/* Top Left System Re-trigger Icon */}
      <div className="hud-top-left" style={exploring ? { display: 'none' } : undefined}>
        <button className="icon-btn sys-mini-btn" id="btn-system" aria-label="system">[ ! ]</button>
      </div>

      {/* Top Right Sound & Orbit Controls */}
      <div className="hud-top">
        <button className="icon-btn" id="btn-sound" aria-label="sound">
          <svg id="icon-sound-on" viewBox="0 0 24 24">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="rgba(255,255,255,0.2)"></polygon>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
          </svg>
          <svg id="icon-sound-off" viewBox="0 0 24 24" style={{ display: 'none' }}>
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <line x1="23" y1="9" x2="17" y2="15"></line>
            <line x1="17" y1="9" x2="23" y2="15"></line>
          </svg>
        </button>
        <button className="icon-btn" id="btn-play" aria-label="orbit">
          <svg id="icon-pause" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" rx="1" fill="rgba(255,255,255,0.2)"></rect>
            <rect x="14" y="4" width="4" height="16" rx="1" fill="rgba(255,255,255,0.2)"></rect>
          </svg>
          <svg id="icon-play" viewBox="0 0 24 24" style={{ display: 'none' }}>
            <polygon points="6 3 20 12 6 21 6 3" fill="rgba(255,255,255,0.2)"></polygon>
          </svg>
        </button>
      </div>

      {/* Bottom Planet Marble Dock (Space Navigation) */}
      <div className="planet-dock" id="planet-dock">
        <button className="orb-btn active" data-target="tour">
          <div className="orb-overview">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" fill="#ffe169" stroke="none"></circle>
              <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-25 12 12)"></ellipse>
              <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(35 12 12)" strokeOpacity="0.6"></ellipse>
            </svg>
          </div>
        </button>
        <div className="dock-sep"></div>
        <button className="orb-btn" data-target="0"><div className="orb-sphere orb-sun"></div></button>
        <button className="orb-btn" data-target="1"><div className="orb-sphere orb-mercury"></div></button>
        <button className="orb-btn" data-target="2"><div className="orb-sphere orb-venus"></div></button>
        <button className="orb-btn" data-target="3"><div className="orb-sphere orb-earth"></div></button>
        <button className="orb-btn" data-target="4"><div className="orb-sphere orb-mars"></div></button>
        <button className="orb-btn" data-target="5"><div className="orb-sphere orb-jupiter"></div></button>
        <button className="orb-btn" data-target="6"><div className="orb-sphere orb-saturn"></div></button>
        <button className="orb-btn" data-target="7"><div className="orb-sphere orb-uranus"></div></button>
        <button className="orb-btn" data-target="8"><div className="orb-sphere orb-neptune"></div></button>
      </div>

      {/* Solo Leveling System Notification Box — se scinde en deux (haut/bas) avec glitch */}
      <div className="system-overlay" id="system-overlay">
        <div className="system-box">
          <div className="sys-half sys-top">
            <div className="sys-corner tl"></div>
            <div className="sys-corner tr"></div>
            <div className="sys-header">
              <div className="sys-badge">!</div>
              <div className="sys-title">INFECTIUM</div>
            </div>
          </div>

          <div className="sys-half sys-bottom">
            <div className="sys-corner bl"></div>
            <div className="sys-corner br"></div>

            <div className="sys-body">
              Bienvenue, jeune <strong>Explorateur Spatial</strong> !<br />
              Nous sommes l'équipe <strong>INFECTIUM</strong>. Ce système solaire est votre point de
              départ vers le site lunaire Shackleton-01, où un avant-poste automatisé
              va être déployé — puis étendu par vos soins.
              <span className="sys-question">Prêt à enfiler la combinaison et passer une journée sur la Lune ?</span>
            </div>

            <div className="sys-actions">
              <button className="sys-btn sys-btn-yes" id="btn-sys-yes">OUI</button>
              <button className="sys-btn sys-btn-no" id="btn-sys-no">NON</button>
            </div>
          </div>
        </div>
      </div>

      {/* Voile de sortie quand on répond NON : fondu au noir pendant qu'on s'éloigne du système */}
      <div className="exit-fade" id="exit-fade">
        <div className="exit-fade-text">À bientôt, Explorateur.</div>
      </div>

      {/* Bandeau télémétrique Artemis II — visible pendant le voyage et l'alunissage */}
      <div className="artemis-hud" id="artemis-hud">
        <div className="artemis-date" id="artemis-date">ARTEMIS II • 1er AVRIL</div>
        <div className="artemis-title" id="artemis-title">Lancement depuis la Terre</div>
        <div className="artemis-detail" id="artemis-detail"></div>
      </div>

      {/* Transition optique douce orbite lunaire → descente */}
      <div className="cinema-flash" id="cinema-flash"></div>
    </>
  );
}

