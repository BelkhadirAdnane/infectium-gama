import { BUILDINGS, CATALOG, tierDef } from '../game/buildings';
import { GameState, ResourceKey } from '../game/types';
import { upgradeCost } from '../game/buildings';
import { RESOURCE_META } from '../game/sim';

export interface ToastItem {
  id: number;
  kind: 'success' | 'error' | 'info' | 'warning';
  text: string;
}

export function ToastStack({ items, className = '' }: { items: ToastItem[]; className?: string }) {
  return (
    <div className={`toast-stack${className ? ` ${className}` : ''}`}>
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function TierBanner({
  tier,
  onClose,
}: {
  tier: 1 | 2 | 3;
  onClose: () => void;
}) {
  const def = tierDef(tier);
  const unlocks = CATALOG.filter((b) => b.tier === tier);
  return (
    <div className="tier-overlay">
      <div className="tier-card">
        <div className="tier-glow" />
        <span className="tier-eyebrow">SYSTÈME · PROGRESSION VALIDÉE</span>
        <h2>PALIER {tier} — {def.name.toUpperCase()}</h2>
        <p className="tier-sub">{def.subtitle}</p>
        <div className="tier-unlocks">
          {unlocks.map((b) => (
            <span key={b.key} className="tier-unlock">
              {b.icon} {b.name}
            </span>
          ))}
        </div>
        <p className="tier-grid">Plateau étendu : {def.grid} × {def.grid} cases constructibles.</p>
        <button className="tier-close" onClick={onClose}>Continuer la mission</button>
      </div>
    </div>
  );
}

export function GameOver({ state, onRestart }: { state: GameState; onRestart: () => void }) {
  return (
    <div className="gameover-overlay">
      <div className="gameover-card">
        <span className="gameover-eyebrow">SIGNAL PERDU</span>
        <h2>MISSION CRITIQUE</h2>
        <p>{state.failure ?? "La base n'est plus habitable."}</p>
        <div className="gameover-stats">
          <div><strong>Palier {state.tier}</strong><span>{tierDef(state.tier).name}</span></div>
          <div><strong>{state.score} pts</strong><span>score scientifique</span></div>
          <div><strong>{state.quizCorrect}/{state.quizAnswered}</strong><span>bonnes réponses</span></div>
          <div><strong>Sol {state.sol}</strong><span>jours lunaires</span></div>
        </div>
        <button className="gameover-restart" onClick={onRestart}>🔄 Nouvelle mission</button>
      </div>
    </div>
  );
}

const REASON_LABEL: Record<string, string> = {
  occupied: 'Case occupée par un bâtiment',
  'out-of-bounds': 'Hors du plateau débloqué',
  locked: 'Bâtiment verrouillé',
  blocked: 'Zone du pas de tir',
  'no-target': 'Vise le plateau lunaire',
};

export function GhostBar({
  defKey,
  ghost,
  points,
}: {
  defKey: string;
  ghost: { x: number; z: number; valid: boolean; reason?: string } | null;
  points: number;
}) {
  const def = BUILDINGS[defKey];
  const missing = Math.max(0, def.cost - points);
  return (
    <div className="ghost-bar">
      <span className="ghost-icon">{def.icon}</span>
      <div className="ghost-info">
        <strong>{def.name}</strong>
        <span>
          {ghost
            ? ghost.valid
              ? '✅ Emplacement libre — clique pour construire'
              : `⛔ ${REASON_LABEL[ghost.reason ?? 'occupied'] ?? 'Placement impossible'}`
            : 'Déplace la souris sur le plateau'}
        </span>
      </div>
      <span className={`ghost-cost${missing > 0 ? ' missing' : ''}`}>
        {def.cost} pts{missing > 0 ? ` · il manque ${missing}` : ''}
      </span>
    </div>
  );
}

function effectLines(key: string, level: number): string[] {
  const def = BUILDINGS[key];
  const lines: string[] = [];
  (Object.keys(def.produces) as ResourceKey[]).forEach((r) => {
    const v = (def.produces[r] ?? 0) * level;
    if (v) lines.push(`+${v.toFixed(2)} ${RESOURCE_META[r].label}/s`);
  });
  (Object.keys(def.consumes) as ResourceKey[]).forEach((r) => {
    const v = (def.consumes[r] ?? 0) * level;
    if (v) lines.push(`-${v.toFixed(2)} ${RESOURCE_META[r].label}/s`);
  });
  if (def.shield) lines.push(`+${Math.round(def.shield * level * 100)}% bouclier radiatif`);
  if (def.quizBonus) lines.push(`+${def.quizBonus * level} pts par bonne réponse`);
  if (def.capacity) {
    (Object.keys(def.capacity) as ResourceKey[]).forEach((r) =>
      lines.push(`+${(def.capacity?.[r] ?? 0) * level} stockage ${RESOURCE_META[r].label}`)
    );
  }
  if (def.key === 'solar') lines.push('Production divisée par ~6 la nuit');
  if (def.nightOnly) lines.push('Fonctionne de jour comme de nuit');
  return lines;
}

export function SelectedPanel({
  state,
  id,
  onUpgrade,
  onDemolish,
  onClose,
}: {
  state: GameState;
  id: string;
  onUpgrade: () => void;
  onDemolish: () => void;
  onClose: () => void;
}) {
  const inst = state.buildings.find((b) => b.id === id);
  if (!inst) return null;
  const def = BUILDINGS[inst.key];
  const max = inst.level >= def.maxLevel;
  const cost = max ? 0 : upgradeCost(def, inst.level);
  const affordable = state.points >= cost;
  const refund = def.existing
    ? 0
    : Math.round((def.cost + def.upgradeCost * ((inst.level * (inst.level - 1)) / 2)) * 0.5);

  return (
    <div className="selected-panel">
      <button className="panel-close" onClick={onClose} aria-label="fermer">✕</button>
      <div className="panel-head">
        <span className="panel-icon">{def.icon}</span>
        <div>
          <h3>{def.name}</h3>
          <span className="panel-level">
            Niveau {inst.level} / {def.maxLevel} · {def.w}×{def.d} cases
          </span>
        </div>
      </div>
      <p className="panel-desc">{def.desc}</p>
      <ul className="panel-effects">
        {effectLines(inst.key, inst.level).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {!def.existing && (
        <button className="panel-demolish" onClick={onDemolish}>
          🧰 Démonter · récupérer {refund} pts
        </button>
      )}
      {def.existing ? (
        <p className="panel-note">Bâtiment d'origine : il se reconstruit et s'améliore par les QCM.</p>
      ) : max ? (
        <div className="panel-max">★ Niveau maximum atteint</div>
      ) : (
        <button className={`panel-upgrade${affordable ? '' : ' warn'}`} onClick={onUpgrade}>
          ⬆ Améliorer · {cost} pts
          {!affordable && <span> (il manque {cost - state.points})</span>}
        </button>
      )}
    </div>
  );
}
