import { GameMode, GameState, ResourceKey, UpkeepInfo } from '../game/types';
import { RESOURCE_META, clockLabel, daylightFactor, isDaytime, nextTierInfo } from '../game/sim';
import { TIERS } from '../game/buildings';

const RESOURCE_ORDER: ResourceKey[] = ['o2', 'h2o', 'energy', 'food'];

export interface HudSample {
  o2: number;
  h2o: number;
  energy: number;
  food: number;
  radiation: number;
}

function Sparkline({
  values,
  color,
  max = 100,
}: {
  values: number[];
  color: string;
  max?: number;
}) {
  if (values.length < 2) {
    return <svg className="sparkline" viewBox="0 0 100 24" preserveAspectRatio="none" />;
  }
  const step = 100 / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(2)},${(24 - Math.max(0, Math.min(1, v / max)) * 22).toFixed(2)}`)
    .join(' ');
  return (
    <svg className="sparkline" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function ResourceHUD({
  state,
  upkeep,
  nasaStatus,
  nasaEvent,
  history,
  objectivesDone,
  objectivesTotal,
  onOpenNasa,
  onOpenSystems,
  onOpenObjectives,
  mode,
  timeLabel,
  missionDays,
  missionPct,
  turbo,
  onTurbo,
  nightEta,
  onOpenMode,
}: {
  state: GameState;
  upkeep: UpkeepInfo;
  nasaStatus: 'live' | 'simulated' | 'loading' | 'off';
  nasaEvent?: string;
  history: HudSample[];
  objectivesDone: number;
  objectivesTotal: number;
  onOpenNasa: () => void;
  onOpenSystems: () => void;
  onOpenObjectives: () => void;
  mode: GameMode;
  timeLabel: string;
  missionDays: number;
  missionPct: number;
  turbo: number;
  onTurbo: (v: number) => void;
  nightEta: string;
  onOpenMode: () => void;
}) {
  const next = nextTierInfo(state);
  const currentTier = TIERS.find((t) => t.tier === state.tier)!;
  const progress = next
    ? Math.max(0, Math.min(1, (state.score - currentTier.score) / Math.max(1, next.score - currentTier.score)))
    : 1;

  const day = isDaytime(state.dayT);
  const dayPct = Math.round(daylightFactor(state.dayT) * 100);
  const lowHealth = state.health < 45;
  const radDanger = state.radiation > 40;
  const storm = state.spike >= 25;
  const coverage = upkeep.powerDemand > 0 ? upkeep.powerAllocated / upkeep.powerDemand : 1;

  return (
    <div className="resource-hud">
      <div className="hud-row hud-resources">
        {RESOURCE_ORDER.map((key) => {
          const meta = RESOURCE_META[key];
          const value = state.resources[key];
          const cap = Math.max(1, upkeep.capacity[key]);
          const pct = Math.max(0, Math.min(100, (value / cap) * 100));
          const rate = upkeep.rates[key];
          const low = value / cap < meta.critical;
          const series = history.map((h) => (h[key] / cap) * 100);
          return (
            <div className={`resource-pill${low ? ' is-low' : ''}`} key={key} title={`${meta.label} — ${Math.round(value)} / ${cap}`}>
              <span className="resource-icon">{meta.icon}</span>
              <div className="resource-body">
                <div className="resource-track">
                  <div className="resource-fill" style={{ width: `${pct}%`, background: meta.color }} />
                </div>
                <div className="resource-line">
                  <span className="resource-pct">{Math.round(pct)}%</span>
                  <span className={`resource-rate ${rate >= 0 ? 'up' : 'down'}`}>
                    {rate >= 0 ? '▲' : '▼'} {Math.abs(rate).toFixed(2)}/s
                  </span>
                </div>
                <Sparkline values={series} color={meta.color} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="hud-row hud-status">
        <div className={`status-pill cycle ${day ? 'day' : 'night'}`} title="Cycle jour / nuit lunaire">
          <span>{day ? '☀️' : '🌙'}</span>
          <span>{clockLabel(state.dayT, state.sol)}</span>
          <span className="status-sub">{day ? `jour ${dayPct}%` : 'nuit lunaire'}</span>
          {timeLabel && <span className="status-sub mode-date">{timeLabel}</span>}
        </div>

        <button className={`status-pill mode-pill ${mode}`} onClick={onOpenMode} title="Changer de mode de jeu ou de rapport de temps">
          <span>{mode === 'real' ? '🛰️' : mode === 'practice' ? '🧪' : '🌙'}</span>
          <span>{mode === 'real' ? 'RÉEL' : mode === 'practice' ? 'PRACTICE' : 'JUNIOR'}</span>
          {missionDays > 0 && (
            <span className="status-sub">mission {Math.round(missionPct * 100)}%</span>
          )}
        </button>

        <div
          className={`status-pill power${upkeep.brownout ? ' danger' : ''}`}
          title="Réseau électrique : production solaire/centrale et distribution par priorité"
          onClick={onOpenSystems}
          role="button"
        >
          <span>⚡</span>
          <div className="mini-track">
            <div className="mini-fill power-fill" style={{ width: `${Math.min(100, coverage * 100)}%` }} />
          </div>
          <span>{Math.round(coverage * 100)}%</span>
          <span className="status-sub">{upkeep.powerAllocated.toFixed(2)}/{upkeep.powerDemand.toFixed(2)}</span>
        </div>

        <div className={`status-pill rad${radDanger ? ' danger' : ''}`} title="Exposition aux radiations (jour + éruptions solaires - boucliers)">
          <span>☢️</span>
          <div className="mini-track">
            <div className="mini-fill rad-fill" style={{ width: `${Math.round(state.radiation)}%` }} />
          </div>
          <span>{Math.round(state.radiation)}%</span>
          <span className="status-sub">bouclier {Math.round(upkeep.shield * 100)}%</span>
        </div>

        <div className={`status-pill health${lowHealth ? ' danger' : ''}`} title="Santé de l'équipage">
          <span>❤️</span>
          <div className="mini-track">
            <div className="mini-fill health-fill" style={{ width: `${Math.round(state.health)}%` }} />
          </div>
          <span>{Math.round(state.health)}%</span>
        </div>
      </div>

      <div className="hud-row hud-progress">
        <div className="points-pill" title="Points scientifiques : gagnés par les QCM et les objectifs">
          ⭐ <strong>{state.points}</strong> pts
        </div>
        <div className="tier-pill">
          <span className="tier-name">Palier {state.tier} · {currentTier.name}</span>
          <div className="tier-track">
            <div className="tier-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="tier-score">
            {next ? `${state.score} / ${next.score}` : `${state.score} · MAX`}
          </span>
        </div>
        <div className="quiz-pill" title="Bonnes réponses / questions posées">
          🎓 {state.quizCorrect}/{state.quizAnswered}
        </div>
        <button className="quiz-pill objectives-pill" onClick={onOpenObjectives} title="Objectifs de mission et carnet de bord">
          🎯 {objectivesDone}/{objectivesTotal}
        </button>
        <button
          className={`nasa-pill ${nasaStatus}`}
          onClick={onOpenNasa}
          title={nasaEvent ? `Dernière donnée NASA : ${nasaEvent}` : 'Ouvrir le briefing NASA'}
        >
          🛰️ NASA {nasaStatus === 'live' ? 'LIVE' : nasaStatus === 'loading' ? '…' : nasaStatus === 'off' ? 'OFF' : 'SIM'}
        </button>
      </div>

      <div className="hud-row hud-needs">
        <span className={`need-pill${state.hunger < 20 ? ' danger' : ''}`}>🍽 Faim {Math.round(state.hunger)}%</span>
        <span className={`need-pill${state.hydration < 20 ? ' danger' : ''}`}>💧 Soif {Math.round(state.hydration)}%</span>
        <span className={`need-pill${state.fatigue < 20 ? ' danger' : ''}`}>😴 Sommeil {Math.round(state.fatigue)}%</span>
        <button className="need-pill systems-open" onClick={onOpenSystems}>🛠 Systèmes</button>
        <button className="need-pill mode-open" onClick={onOpenMode}>🎛 Temps & mode</button>
      </div>

      {mode === 'real' && (
        <div className="hud-row hud-time-controls">
          <span className="turbo-label">⏩ Vitesse</span>
          {[1, 6, 30].map((v) => (
            <button
              key={v}
              className={`turbo-btn${turbo === v ? ' active' : ''}`}
              onClick={() => onTurbo(v)}
              aria-label={`Vitesse de simulation ×${v}`}
            >
              ×{v}
            </button>
          ))}
          {nightEta && <span className="turbo-eta">{nightEta}</span>}
          {turbo !== 1 && <span className="turbo-warn">temps accéléré ×{turbo}</span>}
        </div>
      )}

      {storm && (
        <div className="hud-alert storm">
          ☀️ Tempête solaire en cours (+{Math.round(state.spike)} radiations) — rejoins le hub ou un abri, évite les sorties.
        </div>
      )}
      {upkeep.brownout && (
        <div className="hud-alert power">
          ⚡ Délestage : la demande ({upkeep.powerDemand.toFixed(2)}) dépasse la production ({upkeep.powerSupply.toFixed(2)}). Ouvre Systèmes pour changer les priorités.
        </div>
      )}
      {radDanger && !storm && (
        <div className="hud-alert">
          ⚠️ Exposition élevée ! Construis un abri ou un bouclier anti-radiations.
        </div>
      )}
    </div>
  );
}
