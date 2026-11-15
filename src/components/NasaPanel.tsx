import { useState } from 'react';
import { NasaBriefing, SpaceWeatherEvent } from '../engine/donki';

const TYPE_META: Record<SpaceWeatherEvent['type'], { color: string; short: string }> = {
  CME: { color: '#ffb347', short: 'CME' },
  FLR: { color: '#ffd166', short: 'FLR' },
  GST: { color: '#b18cff', short: 'GST' },
  SEP: { color: '#ff6f91', short: 'SEP' },
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function NasaPanel({
  briefing,
  loading,
  keySource,
  disabled,
  onRefresh,
  onSaveKey,
  onClose,
}: {
  briefing: NasaBriefing | null;
  loading: boolean;
  keySource: 'local' | 'env' | 'demo';
  disabled?: boolean;
  onRefresh: () => void;
  onSaveKey: (key: string) => void;
  onClose: () => void;
}) {
  const [keyDraft, setKeyDraft] = useState('');
  const live = briefing?.source === 'live';
  const firstEvent = briefing?.events[0];

  return (
    <div className="nasa-overlay" onClick={onClose}>
      <div className="nasa-panel" onClick={(e) => e.stopPropagation()}>
        <button className="nasa-close" onClick={onClose} aria-label="fermer">✕</button>

        <div className="nasa-header">
          <div>
            <span className="nasa-eyebrow">CENTRE DE DONNÉES · api.nasa.gov</span>
            <h2>Briefing NASA</h2>
          </div>
          <span className={`nasa-badge ${live ? 'live' : 'sim'}`}>
            {live ? '● LIVE' : '○ SIMULÉ'}
          </span>
        </div>

        {disabled && (
          <div className="nasa-empty nasa-disabled">
            🧪 Mode <strong>Practice</strong> : les données NASA sont désactivées. Aucune requête
            n'est envoyée à api.nasa.gov. Les autres systèmes (énergie, usure, objectifs) restent actifs.
            Change de mode via <strong>Temps & mode</strong> pour retrouver DONKI, APOD et NeoWs.
          </div>
        )}

        {!disabled && !briefing && loading && (
          <div className="nasa-loading">Synchronisation avec les serveurs NASA…</div>
        )}

        {!disabled && briefing && (
          <>
            <div className="nasa-env">
              <div>
                <span>Flux solaire</span>
                <strong>{briefing.environment.solarFluxWm2.toFixed(0)} W/m²</strong>
                <em>constante NASA 1361 W/m² · distance réelle</em>
              </div>
              <div>
                <span>Température de surface</span>
                <strong>{briefing.environment.surfaceDayC.toFixed(0)}°C / {briefing.environment.surfaceNightC.toFixed(0)}°C</strong>
                <em>modèle radiatif jour / nuit</em>
              </div>
              <div>
                <span>Phase lunaire</span>
                <strong>{briefing.environment.phaseName}</strong>
                <em>{briefing.environment.illuminationPct.toFixed(0)}% éclairée · {briefing.environment.moonAgeDays.toFixed(1)} j</em>
              </div>
              <div>
                <span>Terre → Lune</span>
                <strong>{Math.round(briefing.environment.distanceKm).toLocaleString('fr-FR')} km</strong>
                <em>orbite lunaire (modèle)</em>
              </div>
            </div>

            <div className="nasa-comm-brief">
              📡 <strong>Liaison Terre</strong> — aller-retour lumière réel :{' '}
              {((briefing.environment.distanceKm / 299792.458) * 2).toFixed(2)} s. Les demandes
              d'assistance et leur délai de traitement se gèrent dans <strong>Gestion de mission → Liaison Terre</strong>.
            </div>

            {briefing.apod ? (
              <div className="nasa-apod">
                {briefing.apod.mediaType === 'image' ? (
                  <img src={briefing.apod.url} alt={briefing.apod.title} loading="lazy" />
                ) : (
                  <div className="nasa-apod-video">🎬 {briefing.apod.title}</div>
                )}
                <div className="nasa-apod-body">
                  <span className="nasa-apod-date">APOD · {fmtDate(briefing.apod.date)}</span>
                <span className="nasa-utility culture">Culture scientifique · hors simulation</span>
                  <h3>{briefing.apod.title}</h3>
                  <p>{briefing.apod.explanation}</p>
                  {briefing.apod.copyright && <span className="nasa-credit">© {briefing.apod.copyright}</span>}
                </div>
              </div>
            ) : (
              <div className="nasa-empty">Image APOD indisponible (quota ou réseau).</div>
            )}

            <div className="nasa-grid">
              <section className="nasa-block">
                <h4>☀️ Météo spatiale — DONKI <span className="nasa-utility gameplay">Impact direct sur la mission</span></h4>
                <p className="nasa-rad">
                  Impact radiation (normalisé jeu) :
                  <strong> {Math.round(briefing.radiationIndex)}%</strong>
                  <span className="nasa-note"> — les classes C/M/X, Kp et types CME/FLR/SEP sont les données NASA brutes.</span>
                </p>
                <div className="nasa-events">
                  {briefing.events.slice(0, 6).map((e) => (
                    <div className="nasa-event" key={e.id}>
                      <span className="nasa-event-type" style={{ borderColor: TYPE_META[e.type].color, color: TYPE_META[e.type].color }}>
                        {TYPE_META[e.type].short}
                      </span>
                      <div>
                        <strong>{e.label}</strong>
                        <span>{fmtDate(e.date)} · {e.detail}</span>
                      </div>
                      <span className="nasa-event-int" style={{ color: TYPE_META[e.type].color }}>
                        {Math.round(e.intensity)}
                      </span>
                    </div>
                  ))}
                  {briefing.events.length === 0 && (
                    <div className="nasa-empty">Aucune éruption significative sur les 7 derniers jours.</div>
                  )}
                </div>
              </section>

              <section className="nasa-block">
                <h4>☄️ Objets proches — NeoWs <span className="nasa-utility context">Contexte spatial</span></h4>
                {briefing.neo ? (
                  <>
                    <p className="nasa-rad">
                      Aujourd'hui : <strong>{briefing.neo.count}</strong> objet(s) recensé(s).
                    </p>
                    <div className="nasa-events">
                      {briefing.neo.objects.map((o) => (
                        <div className="nasa-event" key={o.name}>
                          <span className={`nasa-event-type ${o.hazardous ? 'danger' : ''}`}>NEO</span>
                          <div>
                            <strong>{o.name}</strong>
                            <span>{o.distanceKm.toLocaleString('fr-FR')} km · {fmtDate(o.date)}</span>
                          </div>
                          {o.hazardous && <span className="nasa-hazard">⚠</span>}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="nasa-empty">Données NeoWs indisponibles.</div>
                )}
              </section>
            </div>

            <div className="nasa-footer">
              <span>
                {live ? 'Données réelles NASA' : 'Mode simulé'} · actualisé à{' '}
                {new Date(briefing.fetchedAt).toLocaleTimeString('fr-FR')}
                {firstEvent ? ` · ${firstEvent.label}` : ''}
                {briefing.warnings.length > 0 ? ` · ${briefing.warnings.join(' · ')}` : ''}
              </span>
              <button className="nasa-refresh" onClick={onRefresh} disabled={loading}>
                {loading ? 'Synchronisation…' : '↻ Actualiser'}
              </button>
            </div>
            {briefing.warnings.length > 0 && (
              <p className="nasa-warning">⚠ {briefing.warnings.join(' · ')}</p>
            )}

            <div className="nasa-key">
              <div className="nasa-key-info">
                <strong>Clé NASA</strong>
                <span>
                  {keySource === 'demo'
                    ? 'DEMO_KEY partagée — quota ~30 req/h, données souvent indisponibles.'
                    : keySource === 'env'
                      ? "Clé lue depuis .env (VITE_NASA_API_KEY)."
                      : 'Clé enregistrée dans ce navigateur.'}
                </span>
              </div>
              <input
                type="text"
                value={keyDraft}
                placeholder="Colle ta clé api.nasa.gov"
                onChange={(e) => setKeyDraft(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <button
                className="nasa-refresh"
                onClick={() => {
                  onSaveKey(keyDraft);
                  setKeyDraft('');
                }}
                disabled={!keyDraft.trim()}
              >
                Utiliser
              </button>
              <a href="https://api.nasa.gov" target="_blank" rel="noreferrer">Obtenir une clé gratuite</a>
            </div>

            <p className="nasa-sources">
              Sources : NASA DONKI (CME / FLR / GST / SEP), APOD, NeoWs — api.nasa.gov.
              Environnement lunaire : modèle astronomique (constante solaire NASA, phase synodique).
              Les intensités sont normalisées pour le gameplay, jamais présentées comme une échelle NASA.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
