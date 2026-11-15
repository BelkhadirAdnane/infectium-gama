import { BUILDING_LIST, BUILDINGS, CATALOG, EXISTING_KEYS, TIERS } from '../game/buildings';
import { GameState } from '../game/types';

interface Props {
  state: GameState;
  buildModeKey: string | null;
  onPickCatalog: (key: string) => void;
  onPickExisting: (id: string) => void;
  onCancelBuild: () => void;
  onResearch: () => void;
  onTrainingSeries: () => void;
  onReturnSpace: () => void;
  onExplore: () => void;
  trainingCount: number;
}

export default function BuildDock({
  state,
  buildModeKey,
  onPickCatalog,
  onPickExisting,
  onCancelBuild,
  onResearch,
  onTrainingSeries,
  onReturnSpace,
  onExplore,
  trainingCount,
}: Props) {
  return (
    <div className="build-dock visible" id="lunar-dock">
      {buildModeKey && (
        <div className="build-mode-bar">
          <span>
            🧱 <strong>{BUILDINGS[buildModeKey].name}</strong> — {BUILDINGS[buildModeKey].w}×{BUILDINGS[buildModeKey].d} cases
          </span>
          <span className="build-mode-hint">Clique sur une case du plateau · Échap / clic droit pour annuler</span>
          <button className="build-cancel" onClick={onCancelBuild}>✕ Annuler</button>
        </div>
      )}

      <div className="dock-scroll">
        <div className="dock-group">
          <span className="dock-group-title">Base d'origine</span>
          {EXISTING_KEYS.map((key) => {
            const def = BUILDINGS[key];
            const inst = state.buildings.find((b) => b.key === key);
            const level = inst?.level ?? 0;
            return (
              <button
                key={key}
                className={`dock-chip legacy${level === 0 ? ' abandoned' : ''}`}
                title={`${def.name} — ${def.desc}`}
                onClick={() => onPickExisting(key)}
              >
                <span className="chip-icon">{def.icon}</span>
                <span className="chip-name">{def.short}</span>
                <span className="chip-sub">
                  {level === 0 ? 'à reconstruire' : level >= def.maxLevel ? 'niv. MAX' : `niv. ${level}`}
                </span>
              </button>
            );
          })}
        </div>

        {TIERS.map((tier) => {
          const defs = CATALOG.filter((d) => d.tier === tier.tier);
          if (!defs.length) return null;
          const locked = state.tier < tier.tier;
          return (
            <div className={`dock-group${locked ? ' locked' : ''}`} key={tier.tier}>
              <span className="dock-group-title">
                Palier {tier.tier} {locked ? `🔒 (${tier.score} pts)` : ''}
              </span>
              {defs.map((def) => {
                const count = state.buildings.filter((b) => b.key === def.key).length;
                const active = buildModeKey === def.key;
                return (
                  <button
                    key={def.key}
                    className={`dock-card${active ? ' active' : ''}${locked ? ' is-locked' : ''}`}
                    title={`${def.name} — ${def.desc}`}
                    disabled={locked}
                    onClick={() => onPickCatalog(def.key)}
                  >
                    <span className="card-icon">{def.icon}</span>
                    <span className="card-name">{def.short}</span>
                    <span className="card-foot">{def.w}×{def.d} · {def.cost} pts</span>
                    {count > 0 && <span className="card-count">×{count}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}

        <div className="dock-group dock-actions">
          <span className="dock-group-title">Actions</span>
          <button className="dock-chip action qcm" onClick={onResearch} title="Réponds à un QCM pour gagner des points scientifiques">
            <span className="chip-icon">🎓</span>
            <span className="chip-name">QCM</span>
            <span className="chip-sub">+ points</span>
          </button>
          <button
            className="dock-chip action rebuild"
            onClick={onTrainingSeries}
            title="Série de QCM : reconstruire les bâtiments abandonnés"
          >
            <span className="chip-icon">✨</span>
            <span className="chip-name">Série QCM</span>
            <span className="chip-sub">{trainingCount > 0 ? `${trainingCount} restantes` : 'entraînement'}</span>
          </button>
          <button className="dock-chip action explore" onClick={onExplore} title="Passer à la 3ᵉ personne : marcher dans la base, récolter, dormir">
            <span className="chip-icon">🚶</span>
            <span className="chip-name">Explorer</span>
            <span className="chip-sub">astronaute</span>
          </button>
          <button className="dock-chip action space" onClick={onReturnSpace} title="Retourner au système solaire">
            <span className="chip-icon">🚀</span>
            <span className="chip-name">Espace</span>
            <span className="chip-sub">retour</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function builtCounts(state: GameState): Record<string, number> {
  const counts: Record<string, number> = {};
  BUILDING_LIST.forEach((d) => (counts[d.key] = 0));
  state.buildings.forEach((b) => {
    counts[b.key] = (counts[b.key] ?? 0) + 1;
  });
  return counts;
}
