import { useState } from 'react';
import { GameMode, OfflineReport, TimeConfig } from '../game/types';
import { MODE_META, gameSecondsPerRealSecond, ratioLabel, realMinutesPerGameDay } from '../game/time';

const RATIOS = [2, 6, 12, 30, 60];
const DURATIONS = [0, 7, 14, 30];

export function ModeSelectModal({
  mode,
  config,
  firstRun,
  onConfirm,
  onCancel,
}: {
  mode: GameMode;
  config: TimeConfig;
  firstRun: boolean;
  onConfirm: (mode: GameMode, config: TimeConfig) => void;
  onCancel?: () => void;
}) {
  const [picked, setPicked] = useState<GameMode>(mode);
  const [ratio, setRatio] = useState(config.ratio || 2);
  const [startSol, setStartSol] = useState(config.startSol || 1);
  const [missionDays, setMissionDays] = useState(config.missionDays ?? 0);
  const [startDate, setStartDate] = useState(
    (config.startDateIso || new Date().toISOString()).slice(0, 10)
  );
  const [showBrief, setShowBrief] = useState(false);

  const cfg: TimeConfig = {
    ratio,
    startSol: Math.max(1, Math.round(startSol)),
    missionDays,
    startDateIso: new Date(`${startDate}T06:00:00`).toISOString(),
  };

  const dayMinutes = realMinutesPerGameDay(picked, cfg);
  const absence12hGame = 12 * gameSecondsPerRealSecond(picked, cfg);

  return (
    <div className="systems-overlay" onClick={onCancel && !firstRun ? onCancel : undefined}>
      <div className="systems-panel mode-panel" onClick={(e) => e.stopPropagation()}>
        {!firstRun && onCancel && (
          <button className="systems-close" onClick={onCancel} aria-label="fermer">✕</button>
        )}
        {firstRun && (
          <div className="mode-hero">
            <span className="mode-hero-badge">NASA SPACE APPS CHALLENGE 2026</span>
            <h1>INFECTIUM</h1>
            <p>Junior Astronaut Mission Trainer · avant-poste lunaire Shackleton-01</p>
          </div>
        )}
        <header className="systems-header">
          <div>
            <span className="systems-eyebrow">INFECTIUM · CONFIGURATION</span>
            <h2>{firstRun ? 'Choisis ta mission' : 'Mode de jeu & temps'}</h2>
          </div>
          <p className="mode-intro">
            Trois façons de vivre Shackleton-01. Le mode réaliste fait continuer la base pendant ton absence.
          </p>
        </header>

        <div className="systems-body">
          <div className="mode-grid">
            {(Object.keys(MODE_META) as GameMode[]).map((m) => {
              const meta = MODE_META[m];
              return (
                <button
                  key={m}
                  className={`mode-card${picked === m ? ' active' : ''}`}
                  style={{ ['--mode-accent' as string]: meta.accent }}
                  onClick={() => setPicked(m)}
                >
                  <span className="mode-card-icon">{meta.icon}</span>
                  <strong>{meta.name}</strong>
                  <em>{meta.tagline}</em>
                  <p>{meta.description}</p>
                </button>
              );
            })}
          </div>

          {picked === 'real' && (
            <section className="mode-config">
              <h3>⏱ Rapport temps réel / temps de mission</h3>
              <div className="ratio-options">
                {RATIOS.map((r) => (
                  <button
                    key={r}
                    className={`ratio-btn${ratio === r ? ' active' : ''}`}
                    onClick={() => setRatio(r)}
                  >
                    {ratioLabel(r)}
                  </button>
                ))}
              </div>
              <p className="systems-note">
                Une journée de mission dure <strong>{dayMinutes < 60 ? `${Math.round(dayMinutes)} minutes` : `${(dayMinutes / 60).toFixed(1)} heures`} réelles</strong>.
                {' '}12 h d'absence = environ <strong>{(absence12hGame / 3600).toFixed(1)} h de mission</strong>.
                Le rattrapage est calculé au retour (plafonné à 60 jours de mission).
              </p>

              <div className="mode-fields">
                <label>
                  <span>Sol de départ</span>
                  <input
                    type="number"
                    min={1}
                    value={startSol}
                    onChange={(e) => setStartSol(Number(e.target.value))}
                  />
                </label>
                <label>
                  <span>Date de départ</span>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </label>
                <label>
                  <span>Durée de mission</span>
                  <select value={missionDays} onChange={(e) => setMissionDays(Number(e.target.value))}>
                    {DURATIONS.map((d) => (
                      <option key={d} value={d}>{d === 0 ? 'Illimitée' : `${d} sols`}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          )}

          {picked === 'junior' && (
            <p className="systems-note mode-note">
              Rythme actuel conservé : une journée lunaire en 4 minutes, données NASA réelles,
              objectifs et carnet. La simulation se met en pause quand le jeu est fermé.
            </p>
          )}
          {picked === 'practice' && (
            <p className="systems-note mode-note">
              Les appels NASA sont désactivés, les éruptions aléatoires aussi, et l'équipage ne peut pas
              perdre la mission. Tous les autres systèmes (énergie, usure, objectifs) restent actifs pour apprendre.
            </p>
          )}
        </div>

        <footer className="mode-footer">
          <button className="mode-secondary brief-open" onClick={() => setShowBrief(true)}>
            📋 Dossier NASA
          </button>
          {!firstRun && onCancel && (
            <button className="mode-secondary" onClick={onCancel}>Annuler</button>
          )}
          <button className="mode-confirm" onClick={() => onConfirm(picked, cfg)}>
            {firstRun ? 'Démarrer la mission' : 'Appliquer'}
          </button>
        </footer>
        {showBrief && <MissionBriefModal onClose={() => setShowBrief(false)} />}
      </div>
    </div>
  );
}

function fmtDuration(seconds: number): string {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)} h`;
  return `${Math.round(seconds / 60)} min`;
}

export function OfflineReportModal({
  report,
  mode,
  onClose,
}: {
  report: OfflineReport;
  mode: GameMode;
  onClose: () => void;
}) {
  const resKeys: Array<keyof OfflineReport['resourcesEnd']> = ['o2', 'h2o', 'energy', 'food'];
  const labels: Record<string, string> = { o2: 'Oxygène', h2o: 'Eau', energy: 'Énergie', food: 'Nourriture' };
  const icons: Record<string, string> = { o2: '🫧', h2o: '💧', energy: '⚡', food: '🍽️' };
  return (
    <div className="systems-overlay">
      <div className="systems-panel report-panel">
        <header className="systems-header">
          <div>
            <span className="systems-eyebrow">JOURNAL AUTOMATIQUE · {MODE_META[mode].name.toUpperCase()}</span>
            <h2>Pendant ton absence</h2>
          </div>
          <div className="systems-summary">
            <span>⏱ {fmtDuration(report.realSeconds)} réelles</span>
            <span>🌙 {report.gameHours.toFixed(1)} h de mission</span>
            <span>Sol {report.fromSol} → {report.toSol}</span>
          </div>
        </header>

        <div className="systems-body">
          <p className="report-dates">
            {new Date(report.fromDateIso).toLocaleString('fr-FR')} →{' '}
            {new Date(report.toDateIso).toLocaleString('fr-FR')}
          </p>

          <div className="report-grid">
            {resKeys.map((k) => {
              const start = Math.round(report.resourcesStart[k]);
              const end = Math.round(report.resourcesEnd[k]);
              const min = Math.round(report.minResources[k]);
              const delta = end - start;
              return (
                <div className="report-card" key={k}>
                  <span className="report-icon">{icons[k]}</span>
                  <div>
                    <strong>{labels[k]}</strong>
                    <span className="report-values">
                      {start} → {end}{' '}
                      <em className={delta >= 0 ? 'up' : 'down'}>
                        {delta >= 0 ? '+' : ''}{delta}
                      </em>
                    </span>
                    <span className="report-min">minimum atteint : {min}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="report-stats">
            <div><span>Santé</span><strong>{Math.round(report.healthStart)} % → {Math.round(report.healthEnd)} %</strong></div>
            <div><span>Délestage</span><strong>{report.brownoutSeconds > 0 ? fmtDuration(report.brownoutSeconds) : 'aucun'}</strong></div>
            <div><span>Éruptions solaires</span><strong>{report.storms}</strong></div>
            <div><span>Modules hors service</span><strong>{report.breakdowns.length}</strong></div>
          </div>

          {report.warnings.length > 0 ? (
            <ul className="report-warnings">
              {report.warnings.map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          ) : (
            <p className="report-ok">✅ Aucun incident majeur : la base a fonctionné normalement pendant ton absence.</p>
          )}

          {report.failure && (
            <p className="report-failure">Mission interrompue : {report.failure}</p>
          )}
        </div>

        <footer className="mode-footer">
          <button className="mode-confirm" onClick={onClose}>Reprendre la mission</button>
        </footer>
      </div>
    </div>
  );
}


const BRIEF_ROWS: Array<{ need: string; answer: string; where: string }> = [
  {
    need: 'Maintenir les systèmes de survie',
    answer: 'Oxygène, eau et nourriture produits/consommés en continu ; délestage électrique par priorité ; pannes et réparations.',
    where: 'HUD, 🛠 Systèmes → Énergie & modules',
  },
  {
    need: 'Protéger des radiations',
    answer: 'Éruptions solaires, exposition liée à la position (sortir = danger), abri et boucliers consommant de l’énergie.',
    where: 'Bandeau tempête, panneau NASA, 🛡 Abri',
  },
  {
    need: 'Gérer l’énergie',
    answer: 'Production solaire jour/nuit, centrale, batteries, priorités Vitale/Normale/Économie et délestage réel.',
    where: '🛠 Systèmes → Énergie',
  },
  {
    need: 'Produire de la nourriture',
    answer: 'Pépinière et serre consomment eau + électricité ; le rendement dépend du réseau.',
    where: 'Modules 🌱 / 🥬',
  },
  {
    need: 'Arbitrages entre priorités',
    answer: 'Une base peut avoir plus de modules que d’électricité disponible : il faut choisir, réparer, économiser.',
    where: 'Priorités, usure, objectifs',
  },
  {
    need: 'Délais de communication',
    answer: 'Délai physique réel (2 × distance / c) + délai de jeu compressé ×12 ; 4 demandes différées, historique, réponses tardives.',
    where: '📡 Liaison Terre',
  },
  {
    need: 'Données NASA réelles',
    answer: 'DONKI (CME/FLR/GST/SEP) alimente les radiations ; APOD et NeoWs pour le contexte. Mode live/simulé toujours affiché.',
    where: '🛰 Briefing NASA',
  },
  {
    need: 'Accessible aux 7–12 ans',
    answer: 'Trois modes, objectifs expliqués, carnet de bord, QCM à rotation sans répétition, vocabulaire simple.',
    where: '🎯 Objectifs, 📓 Carnet, 🎓 QCM',
  },
];

export function MissionBriefModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="systems-overlay brief-overlay" onClick={onClose}>
      <div className="systems-panel brief-panel" onClick={(e) => e.stopPropagation()}>
        <button className="systems-close" onClick={onClose} aria-label="fermer">✕</button>
        <header className="systems-header">
          <div>
            <span className="systems-eyebrow">DOSSIER DE SOUMISSION</span>
            <h2>INFECTIUM × NASA Space Apps 2026</h2>
          </div>
          <div className="systems-summary">
            <span>🎯 Junior Astronaut Mission Trainer</span>
            <span>🌙 Avant-poste lunaire</span>
          </div>
        </header>

        <div className="systems-body">
          <p className="brief-intro">
            Le défi demandait un entraîneur de mission pour explorer·ses de 7–12 ans : survie,
            radiations, énergie, nourriture, compromis et délais de communication. Voici où chaque
            exigence est réellement implémentée — pas seulement représentée par un bâtiment.
          </p>

          <div className="brief-table">
            {BRIEF_ROWS.map((row) => (
              <div className="brief-row" key={row.need}>
                <strong>{row.need}</strong>
                <p>{row.answer}</p>
                <span>{row.where}</span>
              </div>
            ))}
          </div>

          <div className="brief-columns">
            <section>
              <h3>🔬 Données & honnêteté</h3>
              <ul>
                <li>DONKI, APOD, NeoWs via api.nasa.gov, avec badge <b>LIVE / SIM</b> et cache.</li>
                <li>Clé NASA publique par nature ; proxy Netlify optionnel pour la garder côté serveur.</li>
                <li>Les intensités, rendements, usures et délais de traitement sont des <b>paramètres de jeu</b>, jamais présentés comme des mesures NASA.</li>
                <li>Délai réel affiché séparément du délai compressé.</li>
              </ul>
            </section>
            <section>
              <h3>⏱ Parcours jury en 2 minutes</h3>
              <ol>
                <li>Choisir <b>Mission réelle ×2</b> : la base se déploie.</li>
                <li>Ouvrir <b>🛠 Systèmes</b> : baisser une priorité, provoquer un délestage.</li>
                <li>Ouvrir <b>📡 Liaison Terre</b> : envoyer un diagnostic (compte à rebours).</li>
                <li>Provoquer/attendre une éruption, sortir : l’exposition grimpe.</li>
                <li>Quitter 1 minute, revenir : le <b>rapport d’absence</b> s’affiche.</li>
              </ol>
            </section>
            <section>
              <h3>⚙️ Technique</h3>
              <ul>
                <li>React + TypeScript + Three.js, sans dépendance superflue.</li>
                <li>Sauvegarde complète v4 + migration + copie de secours.</li>
                <li>Rattrapage hors-ligne calculé (pas de faux temps réel en fond).</li>
                <li>Tests logiques : simulation, rotation des 40 questions, communications, objectifs, sauvegarde.</li>
              </ul>
            </section>
          </div>
        </div>

        <footer className="mode-footer">
          <button className="mode-confirm" onClick={onClose}>Retour à la configuration</button>
        </footer>
      </div>
    </div>
  );
}
