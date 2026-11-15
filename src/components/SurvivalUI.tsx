import { ControlSettings, DEFAULT_CONTROLS } from '../engine/controls';
import { InteractionInfo, RoomId } from '../engine/astronaut';
import { clockLabel } from '../game/sim';
import { GameState } from '../game/types';

const ROOM_LABEL: Record<RoomId, string> = {
  exterior: '🌙 Extérieur — Shackleton-01',
  hub: '🏠 Hub central',
  nursery: '🌱 Pépinière',
  purifier: '💧 Purificateur d’eau',
  solar: '⚡ Contrôle solaire',
};

function Bar({ icon, name, value, color }: { icon: string; name: string; value: number; color: string }) {
  const v = Math.round(value);
  return (
    <div className={`astro-bar${v < 20 ? ' low' : ''}`}>
      <span className="astro-bar-icon">{icon}</span>
      <div className="astro-bar-body">
        <div className="astro-bar-head">
          <span>{name}</span>
          <strong>{v}%</strong>
        </div>
        <div className="astro-track">
          <div className="astro-fill" style={{ width: `${v}%`, background: color }} />
        </div>
      </div>
    </div>
  );
}

interface HudProps {
  state: GameState;
  room: RoomId;
  modeLabel?: string;
  nasaStatus: 'live' | 'simulated' | 'loading' | 'off';
  onBuild: () => void;
  onNasa: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onSystems: () => void;
  turbo?: number;
  onTurbo?: (v: number) => void;
  onEat: () => void;
  onDrink: () => void;
}

export function AstronautHud({ state, room, modeLabel, nasaStatus, onBuild, onNasa, onSettings, onHelp, onSystems, turbo, onTurbo, onEat, onDrink }: HudProps) {
  const clock = clockLabel(state.dayT, state.sol);
  return (
    <div className="astro-hud">
      <div className="astro-head">
        <div>
          <span className="astro-eyebrow">MODE ASTRONAUTE{modeLabel ? ` · ${modeLabel.toUpperCase()}` : ''}</span>
          <span className="astro-location">{ROOM_LABEL[room]}</span>
        </div>
        <span className="astro-clock">{clock}</span>
      </div>
      <div className="astro-bars">
        <Bar icon="🍽" name="Faim" value={state.hunger} color="linear-gradient(90deg,#ff9f5a,#ffd166)" />
        <Bar icon="💧" name="Hydratation" value={state.hydration} color="linear-gradient(90deg,#3ea0ff,#5fe6ff)" />
        <Bar icon="😴" name="Sommeil" value={state.fatigue} color="linear-gradient(90deg,#b18cff,#5fe6ff)" />
        <Bar icon="❤️" name="Santé" value={state.health} color="linear-gradient(90deg,#ff5577,#ff9bb0)" />
        <Bar icon="☢️" name="Radiation" value={state.radiation} color="linear-gradient(90deg,#7dde7d,#ff5577)" />
      </div>
      <div className="astro-actions">
        <button className="astro-btn build" onClick={onBuild}>🏗 Construire</button>
        <button className={`astro-btn nasa ${nasaStatus}`} onClick={onNasa}>🛰 NASA</button>
        <button className="astro-btn systems" onClick={onSystems}>🛠 Systèmes</button>
        {onTurbo && (
          <button
            className="astro-btn turbo"
            onClick={() => onTurbo(turbo === 1 ? 6 : turbo === 6 ? 30 : 1)}
            aria-label="Changer la vitesse de simulation"
          >
            ⏩ ×{turbo ?? 1}
          </button>
        )}
        <button className="astro-btn icon" onClick={onSettings} aria-label="Paramètres">⚙</button>
        <button className="astro-btn icon" onClick={onHelp} aria-label="Aide">?</button>
      </div>
      <div className="astro-quick">
        <button onClick={onEat}>🍽 Manger <em>−10 vivres</em></button>
        <button onClick={onDrink}>💧 Boire <em>−10 eau</em></button>
      </div>
    </div>
  );
}

export function InteractionPrompt({
  interaction,
  onInteract,
}: {
  interaction: InteractionInfo | null;
  onInteract: () => void;
}) {
  if (!interaction) {
    return <div className="interaction-hint">Approche-toi d’un objet lumineux pour interagir</div>;
  }
  return (
    <div className="interaction-prompt">
      <span className="interaction-key">E</span>
      <div>
        <strong>{interaction.label}</strong>
        <span>{interaction.hint}</span>
      </div>
      <button onClick={onInteract}>Faire</button>
    </div>
  );
}

interface SettingsProps {
  settings: ControlSettings;
  onChange: (s: ControlSettings) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, onChange, onClose }: SettingsProps) {
  const set = <K extends keyof ControlSettings>(key: K, value: ControlSettings[K]) =>
    onChange({ ...settings, [key]: value });
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-card" onClick={(e) => e.stopPropagation()}>
        <h2>⚙ Paramètres des commandes</h2>
        <p className="settings-sub">Joystick gauche : se déplacer · joystick droit : tourner la caméra.</p>
        <label className="setting">
          <span>Sensibilité caméra (souris) <b>{settings.lookSensitivity.toFixed(1)}×</b></span>
          <input type="range" min={0.3} max={2.5} step={0.1} value={settings.lookSensitivity}
            onChange={(e) => set('lookSensitivity', Number(e.target.value))} />
        </label>
        <label className="setting">
          <span>Sensibilité joystick droit <b>{settings.joystickSensitivity.toFixed(1)}×</b></span>
          <input type="range" min={0.3} max={2.5} step={0.1} value={settings.joystickSensitivity}
            onChange={(e) => set('joystickSensitivity', Number(e.target.value))} />
        </label>
        <label className="setting">
          <span>Taille des joysticks <b>{settings.joystickSize}px</b></span>
          <input type="range" min={90} max={190} step={2} value={settings.joystickSize}
            onChange={(e) => set('joystickSize', Number(e.target.value))} />
        </label>
        <label className="setting">
          <span>Opacité des joysticks <b>{Math.round(settings.joystickOpacity * 100)}%</b></span>
          <input type="range" min={0.2} max={1} step={0.05} value={settings.joystickOpacity}
            onChange={(e) => set('joystickOpacity', Number(e.target.value))} />
        </label>
        <label className="setting-check">
          <input type="checkbox" checked={settings.invertY} onChange={(e) => set('invertY', e.target.checked)} />
          Inverser l’axe vertical de la caméra
        </label>
        <div className="settings-actions">
          <button className="settings-reset" onClick={() => onChange({ ...DEFAULT_CONTROLS })}>Réinitialiser</button>
          <button className="settings-close" onClick={onClose}>Fermer</button>
        </div>
        <p className="settings-note">Clavier : WASD / ZQSD / flèches, Maj courir, Espace sauter, E interagir. Souris : clic pour capturer, Échap pour libérer.</p>
      </div>
    </div>
  );
}

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-card" onClick={(e) => e.stopPropagation()}>
        <h2>🚀 Survivre sur la Lune</h2>
        <ul className="help-list">
          <li><b>Manger / boire</b> : réserve de vivres et distributeur d’eau du hub (ou boutons rapides).</li>
          <li><b>Récolter</b> à la pépinière (+14 nourriture), <b>purifier</b> l’eau (+14), <b>vérifier les panneaux</b> (+10 énergie).</li>
          <li><b>Dormir</b> dans la capsule du hub : passe au sol suivant et restaure le sommeil.</li>
          <li><b>Terminal QCM</b> : réponds pour gagner des points et construire.</li>
          <li><b>🛠 Gestion de mission</b> (console du hub) : priorités d'électricité, réparations, objectifs et carnet de bord.</li>
          <li><b>⚡ Énergie</b> : la base ne peut pas tout alimenter en même temps. Les modules « vitaux » passent en premier ; les autres tournent au ralenti (délestage).</li>
          <li><b>📡 Liaison Terre</b> : les demandes au centre de contrôle reviennent après un délai (lumière réelle + traitement compressé). Agis en autonomie pendant l'attente.</li>
          <li><b>☀️ Tempête solaire</b> : rentre dans le hub ou un abri. Sortir pendant une éruption augmente fortement la dose de radiations.</li>
          <li><b>🎯 Objectifs</b> : chaque objectif validé rapporte des points et explique une contrainte réelle d'une mission spatiale.</li>
          <li><b>🏗 Construire</b> : retour au plateau pour poser modules et couloirs pressurisés.</li>
          <li>Faim, soif ou sommeil bas : tu ralentis, puis ta santé baisse.</li>
        </ul>
        <div className="settings-actions">
          <button className="settings-close" onClick={onClose}>Compris</button>
        </div>
      </div>
    </div>
  );
}

export function SleepOverlay({ nextSol }: { nextSol: number }) {
  return (
    <div className="sleep-overlay">
      <div className="sleep-card">
        <span className="sleep-moon">🌙</span>
        <h2>Nuit lunaire</h2>
        <p>L’équipage se repose dans la capsule de sommeil…</p>
        <div className="sleep-progress"><div /></div>
        <span className="sleep-sol">SOL {nextSol}</span>
      </div>
    </div>
  );
}

export function SolarStormBanner({
  spike,
  sheltered,
  outdoor,
}: {
  spike: number;
  sheltered: boolean;
  outdoor: boolean;
}) {
  return (
    <div className={`storm-banner${outdoor ? ' danger' : ''}`}>
      <span className="storm-icon">☀️</span>
      <div>
        <strong>ALERTE RADIATIONS — éruption solaire</strong>
        <span>
          Intensité {Math.round(spike)}/100 ·{' '}
          {outdoor
            ? "Tu es à l'extérieur : rentre immédiatement dans le hub ou l'abri !"
            : sheltered
              ? 'Tu es dans le hub pressurisé : reste à l’intérieur le temps que l’éruption retombe.'
              : 'Rejoins le hub ou un abri anti-radiations. Les sorties augmentent fortement la dose reçue.'}
        </span>
      </div>
    </div>
  );
}
