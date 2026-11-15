import { useState } from 'react';
import { BUILDINGS } from '../game/buildings';
import { CommEntry, GameState, ModulePriority, UpkeepInfo } from '../game/types';
import {
  COMM_CATALOG,
  CommKind,
  commDelaySeconds,
  lightDelaySeconds,
  pendingComms,
} from '../game/comms';
import { missionPhase, Objective } from '../game/objectives';
import { INSIGHTS, INSIGHT_BY_ID } from '../game/insights';
import { PRIORITY_LABEL, repairCost } from '../game/sim';

export type SystemsTab = 'power' | 'comms' | 'objectives' | 'journal';
type Tab = SystemsTab;

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'power', label: 'Énergie & modules', icon: '⚡' },
  { id: 'comms', label: 'Liaison Terre', icon: '📡' },
  { id: 'objectives', label: 'Objectifs', icon: '🎯' },
  { id: 'journal', label: 'Carnet', icon: '📓' },
];

const PRIORITIES: ModulePriority[] = ['high', 'normal', 'low'];

const COMM_KINDS: CommKind[] = ['diagnostic', 'medical', 'resupply', 'analysis'];

export default function SystemsPanel({
  state,
  upkeep,
  objectives,
  now,
  distanceKm,
  onClose,
  onRepair,
  onPriority,
  onRequestComm,
  initialTab = 'power',
}: {
  state: GameState;
  upkeep: UpkeepInfo;
  objectives: Objective[];
  now: number;
  distanceKm: number;
  onClose: () => void;
  onRepair: (id: string) => void;
  onPriority: (id: string, p: ModulePriority) => void;
  onRequestComm: (kind: CommKind) => void;
  initialTab?: SystemsTab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const pending = pendingComms(state);
  const history = state.comms.filter((c) => c.status !== 'pending');
  const coverage = upkeep.powerDemand > 0 ? upkeep.powerAllocated / upkeep.powerDemand : 1;
  const completedObjectives = objectives.filter((o) => o.done).length;
  const realDelay = lightDelaySeconds(distanceKm);
  const phase = missionPhase(state);

  return (
    <div className="systems-overlay" onClick={onClose}>
      <div className="systems-panel" onClick={(e) => e.stopPropagation()}>
        <button className="systems-close" onClick={onClose} aria-label="fermer">✕</button>
        <header className="systems-header">
          <div>
            <span className="systems-eyebrow">CENTRE DE CONTRÔLE · SHACKLETON-01</span>
            <h2>Gestion de mission</h2>
          </div>
          <div className="systems-summary">
            <span className="systems-phase">Phase {phase.index} · {phase.name}</span>
            <span className={upkeep.brownout ? 'danger' : 'ok'}>
              ⚡ {Math.round(coverage * 100)}% de la demande couverte
            </span>
            <span>🎯 {completedObjectives}/{objectives.length} objectifs</span>
            <span>📓 {state.journal.length}/{INSIGHTS.length} fiches</span>
          </div>
        </header>

        <nav className="systems-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`systems-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </nav>

        <p className="systems-goal">Objectif de phase : {phase.goal}.</p>
        <div className="systems-body">
          {tab === 'power' && (
            <section className="systems-section">
              <div className="power-gauge">
                <div className="power-gauge-head">
                  <span>Production brute <strong>{upkeep.powerSupply.toFixed(2)}</strong></span>
                  <span>Demande <strong>{upkeep.powerDemand.toFixed(2)}</strong></span>
                  <span>Distribué <strong>{upkeep.powerAllocated.toFixed(2)}</strong></span>
                </div>
                <div className="power-gauge-track">
                  <div
                    className={`power-gauge-fill${upkeep.brownout ? ' brownout' : ''}`}
                    style={{ width: `${Math.min(100, coverage * 100)}%` }}
                  />
                </div>
                <p className="systems-note">
                  {upkeep.brownout
                    ? "Délestage en cours : les modules « Économie » sont servis en dernier. Réduis leur priorité, ajoute des panneaux ou attends le jour lunaire."
                    : "Toute la base est alimentée. Les batteries se rechargent quand la production dépasse la demande."}
                </p>
              </div>

              <div className="module-list">
                {[...upkeep.modules]
                  .sort((a, b) => {
                    const rank = { high: 0, normal: 1, low: 2 };
                    return rank[a.priority] - rank[b.priority] || b.demand - a.demand;
                  })
                  .map((m) => {
                    const def = BUILDINGS[m.key];
                    if (!def) return null;
                    const inst = state.buildings.find((b) => b.id === m.id);
                    const canRepair = (m.wear ?? 0) > 0.04;
                    return (
                      <div className={`module-row${m.brownout ? ' is-brownout' : ''}`} key={m.id}>
                        <span className="module-icon">{def.icon}</span>
                        <div className="module-main">
                          <div className="module-title">
                            <strong>{def.name}</strong>
                            <span>niv. {m.level}</span>
                            {m.wear >= 0.95 && <em className="module-badge offline">hors service</em>}
                            {m.brownout && <em className="module-badge">délesté</em>}
                          </div>
                          <div className="module-metrics">
                            <span>⚡ {m.demand.toFixed(2)} → {m.allocated.toFixed(2)}</span>
                            <span>rendement {Math.round(m.efficiency * 100)}%</span>
                            <span className={m.wear > 0.6 ? 'danger' : ''}>usure {Math.round(m.wear * 100)}%</span>
                          </div>
                          <div className="module-wear">
                            <div
                              className={`module-wear-fill${m.wear > 0.6 ? ' danger' : ''}`}
                              style={{ width: `${Math.round(m.wear * 100)}%` }}
                            />
                          </div>
                        </div>
                        <div className="module-priority">
                          {PRIORITIES.map((p) => (
                            <button
                              key={p}
                              className={`prio-btn${m.priority === p ? ' active' : ''}`}
                              onClick={() => onPriority(m.id, p)}
                              title={`Priorité ${PRIORITY_LABEL[p]}`}
                            >
                              {PRIORITY_LABEL[p]}
                            </button>
                          ))}
                        </div>
                        <button
                          className="module-repair"
                          onClick={() => onRepair(m.id)}
                          disabled={!canRepair || !inst}
                          title={canRepair ? `Réparer (−${repairCost(inst!)} pts, −6 énergie)` : 'Module en bon état'}
                        >
                          {canRepair ? `🔧 ${repairCost(inst!)} pts` : '✓ OK'}
                        </button>
                      </div>
                    );
                  })}
              </div>
            </section>
          )}

          {tab === 'comms' && (
            <section className="systems-section">
              <div className="comm-intro">
                <p>
                  Délai lumière réel aller-retour : <strong>{realDelay.toFixed(2)} s</strong>
                  <em> (distance actuelle {Math.round(distanceKm).toLocaleString('fr-FR')} km ÷ vitesse de la lumière).</em>
                </p>
                <p className="systems-note">
                  Pour rester jouable, le délai de traitement du centre de contrôle est compressé ×12
                  et affiché séparément. Les actions locales restent immédiates. Préparer une
                  transmission coûte 10 points de sommeil.
                </p>
                {state.spike > 10 && (
                  <p className="systems-note warn">
                    ☀️ Éruption en cours : les communications radio sont perturbées, tous les délais sont allongés
                    (×{(1 + state.spike / 120).toFixed(2)}).
                  </p>
                )}
              </div>

              <div className="comm-requests">
                {COMM_KINDS.map((kind) => {
                  const def = COMM_CATALOG[kind];
                  const busy = pending.length >= 2;
                  return (
                    <button
                      key={kind}
                      className="comm-request"
                      disabled={busy}
                      onClick={() => onRequestComm(kind)}
                    >
                      <span className="comm-request-icon">{def.icon}</span>
                      <strong>{def.short}</strong>
                      <span className="comm-request-desc">{def.desc}</span>
                      <span className="comm-request-effect">{def.effect}</span>
                      <span className="comm-request-delay">⏱ {commDelaySeconds(distanceKm, kind, state.spike)} s</span>
                    </button>
                  );
                })}
              </div>

              {pending.length > 0 && (
                <div className="comm-queue">
                  <h4>En attente de la Terre</h4>
                  {pending.map((c) => {
                    const total = Math.max(1, (c.readyAt - c.sentAt) / 1000);
                    const left = Math.max(0, (c.readyAt - now) / 1000);
                    return (
                      <div className="comm-pending" key={c.id}>
                        <span>{COMM_CATALOG[c.kind].icon} {c.label}</span>
                        <div className="comm-track">
                          <div className="comm-fill" style={{ width: `${Math.min(100, Math.max(0, 100 - (left / total) * 100))}%` }} />
                        </div>
                        <strong>{Math.ceil(left)} s</strong>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="comm-history">
                <h4>Historique des communications</h4>
                {history.length === 0 && (
                  <p className="systems-note">Aucune transmission pour le moment. La Terre ne peut pas te piloter en direct : anticipe.</p>
                )}
                {history.map((c: CommEntry) => (
                  <div className="comm-history-row" key={c.id} data-late={c.late ? 'true' : 'false'}>
                    <span className="comm-history-icon">{COMM_CATALOG[c.kind].icon}</span>
                    <div>
                      <strong>{c.label}</strong>
                      <span>{c.result ?? 'Transmission annulée.'}</span>
                    </div>
                    <em>{new Date(c.readyAt).toLocaleTimeString('fr-FR')}</em>
                  </div>
                ))}
              </div>
            </section>
          )}

          {tab === 'objectives' && (
            <section className="systems-section">
              <p className="systems-note">
                Chaque objectif explique une contrainte réelle d'une mission habitée. La récompense est versée une seule fois.
              </p>
              <div className="objective-list">
                {objectives.map((o) => (
                  <div className={`objective-row${o.done ? ' done' : ''}`} key={o.id}>
                    <span className="objective-check">{o.done ? '✓' : '○'}</span>
                    <div className="objective-main">
                      <div className="objective-title">
                        <strong>{o.title}</strong>
                        <span className="objective-reward">+{o.reward} pts</span>
                      </div>
                      <span className="objective-detail">{o.detail}</span>
                      <div className="objective-bar">
                        <div style={{ width: `${Math.round(o.progress * 100)}%` }} />
                      </div>
                      <em className="objective-why">{o.why}</em>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {tab === 'journal' && (
            <section className="systems-section">
              <p className="systems-note">
                Les fiches se débloquent quand tu vis réellement la situation. {state.journal.length}/{INSIGHTS.length} découvertes.
              </p>
              <div className="journal-list">
                {INSIGHTS.map((insight) => {
                  const unlocked = state.journal.includes(insight.id);
                  return (
                    <div className={`journal-card${unlocked ? ' unlocked' : ' locked'}`} key={insight.id}>
                      <div className="journal-head">
                        <span className={`journal-tag ${insight.category}`}>{insight.category}</span>
                        <strong>{unlocked ? insight.title : 'Fiche à découvrir'}</strong>
                      </div>
                      <p>{unlocked ? insight.text : 'Continue la mission pour débloquer cette fiche.'}</p>
                    </div>
                  );
                })}
                {state.journal.length > 0 && (
                  <div className="journal-foot">
                    {state.journal.map((id) => INSIGHT_BY_ID[id]?.title).filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
