// =========================================================================
// Données NASA réelles — DONKI (météo spatiale), APOD, NeoWs
// -------------------------------------------------------------------------
// Clé : VITE_NASA_API_KEY dans .env (DEMO_KEY fonctionne avec un quota réduit).
// Toutes les requêtes sont tolérantes aux pannes : le jeu bascule alors en
// données simulées clairement identifiées, jamais présentées comme réelles.
// =========================================================================

export type SpaceWeatherType = 'CME' | 'FLR' | 'GST' | 'SEP';

export interface SpaceWeatherEvent {
  id: string;
  type: SpaceWeatherType;
  label: string;
  date: string;
  intensity: number; // 0-100, converti pour le gameplay
  detail: string;
}

export interface ApodData {
  title: string;
  date: string;
  url: string;
  hdurl?: string;
  explanation: string;
  mediaType: string;
  copyright?: string;
}

export interface NeoSummary {
  count: number;
  objects: Array<{ name: string; distanceKm: number; date: string; hazardous: boolean }>;
}

export interface LunarEnvironment {
  solarFluxWm2: number;
  surfaceDayC: number;
  surfaceNightC: number;
  illuminationPct: number;
  phaseName: string;
  moonAgeDays: number;
  distanceKm: number;
  computedAt: number;
}

export interface NasaBriefing {
  source: 'live' | 'simulated';
  fetchedAt: number;
  events: SpaceWeatherEvent[];
  radiationIndex: number;
  apod: ApodData | null;
  neo: NeoSummary | null;
  environment: LunarEnvironment;
  warnings: string[];
}

const CACHE_KEY = 'infectium.nasa.briefing.v3';
const KEY_STORAGE = 'infectium.nasa.key';
const DEMO_KEY = 'DEMO_KEY';

/**
 * Proxy serveur optionnel (Netlify Function `netlify/functions/nasa.mjs`).
 * Quand il est configuré, la clé NASA reste côté serveur (`NASA_API_KEY`) et
 * n'est plus jamais envoyée au navigateur. Sans proxy, la clé utilisée est
 * `VITE_NASA_API_KEY` : c'est une clé de quota api.nasa.gov, publique par
 * nature, jamais un secret privé.
 */
const NASA_PROXY = ((import.meta.env.VITE_NASA_PROXY as string) || '').trim();

/** Construit l'URL NASA (directe ou via le proxy serveur). */
function nasaEndpoint(pathWithQuery: string, key: string): string {
  if (NASA_PROXY) return `${NASA_PROXY}?path=${encodeURIComponent(pathWithQuery)}`;
  const sep = pathWithQuery.includes('?') ? '&' : '?';
  return `https://api.nasa.gov${pathWithQuery}${sep}api_key=${encodeURIComponent(key)}`;
}

export type NasaKeySource = 'local' | 'env' | 'demo';

/** Clé NASA : saisie dans l'app > .env > DEMO_KEY. */
export function getNasaApiKey(): string {
  try {
    const local = localStorage.getItem(KEY_STORAGE);
    if (local && local.trim()) return local.trim();
  } catch {
    /* stockage indisponible */
  }
  const env = (import.meta.env.VITE_NASA_API_KEY as string) || '';
  return env.trim() || DEMO_KEY;
}

export function getNasaKeySource(): NasaKeySource {
  try {
    if (localStorage.getItem(KEY_STORAGE)?.trim()) return 'local';
  } catch {
    /* ignore */
  }
  const env = (import.meta.env.VITE_NASA_API_KEY as string) || '';
  return env && env !== DEMO_KEY ? 'env' : 'demo';
}

export function setNasaApiKey(key: string): void {
  try {
    if (key.trim()) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

function cacheTtl(): number {
  return getNasaKeySource() === 'demo' ? 30 * 60 * 1000 : 10 * 60 * 1000;
}

export type NasaErrorKind = 'quota' | 'network' | 'server' | 'parse' | 'unknown';

export class NasaApiError extends Error {
  kind: NasaErrorKind;
  status?: number;
  constructor(kind: NasaErrorKind, message: string, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

function apiKey(): string {
  return getNasaApiKey();
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function getJson(url: string, timeoutMs = 14000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch (err: any) {
      throw new NasaApiError('network', err?.name === 'AbortError' ? 'Délai réseau dépassé' : 'Réseau indisponible');
    }
    if (res.status === 429) {
      throw new NasaApiError('quota', 'Quota NASA dépassé (DEMO_KEY partagée ou clé saturée)', 429);
    }
    if (res.status >= 500) {
      throw new NasaApiError('server', `Serveur NASA indisponible (${res.status})`, res.status);
    }
    if (!res.ok) {
      throw new NasaApiError('server', `Requête NASA refusée (${res.status})`, res.status);
    }
    try {
      return await res.json();
    } catch {
      throw new NasaApiError('parse', 'Réponse NASA illisible', res.status);
    }
  } finally {
    clearTimeout(timer);
  }
}

function warn(warnings: string[], err: unknown, label: string) {
  if (err instanceof NasaApiError) {
    if (err.kind === 'quota') warnings.push(`${label} : quota NASA dépassé (429)`);
    else if (err.kind === 'network') warnings.push(`${label} : réseau indisponible`);
    else warnings.push(`${label} : ${err.message}`);
  } else {
    warnings.push(`${label} : erreur inconnue`);
  }
}


// ------------------------------ DONKI ------------------------------

function flareIntensity(classType: string | undefined): number {
  if (!classType) return 20;
  const m = /^([ABCMX])\s*([\d.]+)/i.exec(classType.trim());
  if (!m) return 20;
  const cls = m[1].toUpperCase();
  const mag = Number(m[2]) || 1;
  if (cls === 'X') return Math.min(100, Math.round(65 + mag * 15));
  if (cls === 'M') return Math.min(65, Math.round(35 + mag * 10));
  if (cls === 'C') return 18;
  return 10;
}

async function fetchDonki(days: number, warnings: string[]): Promise<SpaceWeatherEvent[]> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const key = apiKey();
  const range = `startDate=${fmtDate(start)}&endDate=${fmtDate(end)}`;

  const [cme, flr, gst, sep] = await Promise.allSettled([
    getJson(nasaEndpoint(`/DONKI/CME?${range}`, key)),
    getJson(nasaEndpoint(`/DONKI/FLR?${range}`, key)),
    getJson(nasaEndpoint(`/DONKI/GST?${range}`, key)),
    getJson(nasaEndpoint(`/DONKI/SEP?${range}`, key)),
  ]);

  const events: SpaceWeatherEvent[] = [];

  if (cme.status === 'fulfilled' && Array.isArray(cme.value)) {
    cme.value.slice(-8).forEach((item: any) => {
      const analyses: any[] = Array.isArray(item?.cmeAnalyses) ? item.cmeAnalyses : [];
      // DONKI publie plusieurs analyses (préliminaire puis révisée) :
      // on sélectionne explicitement l'analyse marquée la plus précise.
      const analysis = analyses.find((a) => a?.isMostAccurate === true) ?? analyses[0];
      const speed: number | undefined = analysis?.speed;
      const halfAngle: number | undefined = analysis?.halfAngle;
      let intensity = 25;
      if (typeof speed === 'number') {
        intensity = speed >= 1200 ? 75 : speed >= 800 ? 55 : speed >= 500 ? 35 : 20;
      }
      const detailParts: string[] = [];
      if (typeof speed === 'number') detailParts.push(`vitesse ${Math.round(speed)} km/s`);
      if (typeof halfAngle === 'number') detailParts.push(`angle ${Math.round(halfAngle)}°`);
      if (analysis?.isMostAccurate) detailParts.push('analyse la plus précise NASA');
      events.push({
        id: String(item.activityID ?? item.startTime),
        type: 'CME',
        label: 'Éjection de masse coronale',
        date: item.startTime ?? '',
        intensity,
        detail: detailParts.length ? detailParts.join(' · ') : item.note || 'CME détectée par la NASA.',
      });
    });
  } else {
    warn(warnings, cme.status === 'rejected' ? cme.reason : 'réponse inattendue', 'DONKI CME');
  }

  if (flr.status === 'fulfilled' && Array.isArray(flr.value)) {
    flr.value.slice(-8).forEach((item: any) => {
      const cls = item.classType ?? '';
      const flux = Number(item.flux ?? 0);
      events.push({
        id: String(item.flrID ?? item.beginTime),
        type: 'FLR',
        label: `Éruption solaire ${cls ? `classe ${cls}` : ''}`.trim(),
        date: item.beginTime ?? item.peakTime ?? '',
        intensity: flareIntensity(cls),
        detail: [
          cls ? `classe ${cls}` : 'classe inconnue',
          Number.isFinite(flux) && flux > 0 ? `flux ${flux.toExponential(2)} W/m²` : '',
          'GOES/NASA',
        ].filter(Boolean).join(' · '),
      });
    });
  } else {
    warn(warnings, flr.status === 'rejected' ? flr.reason : 'réponse inattendue', 'DONKI FLR');
  }

  if (gst.status === 'fulfilled' && Array.isArray(gst.value)) {
    gst.value.slice(-6).forEach((item: any) => {
      const kp = Number(item?.allKpIndex?.[0]?.kpIndex ?? 0);
      const gScale = kp >= 9 ? 'G5' : kp >= 8 ? 'G4' : kp >= 7 ? 'G3' : kp >= 6 ? 'G2' : kp >= 5 ? 'G1' : 'sous le seuil';
      events.push({
        id: String(item.gstID ?? item.startTime),
        type: 'GST',
        label: `Tempête géomagnétique ${kp >= 5 ? gScale : ''}`.trim(),
        date: item.startTime ?? '',
        intensity: Math.min(80, Math.round(kp * 8)),
        detail: `Indice Kp ${Number.isFinite(kp) && kp > 0 ? kp : '—'} · échelle NOAA ${gScale}`,
      });
    });
  }

  if (sep.status === 'fulfilled' && Array.isArray(sep.value)) {
    sep.value.slice(-5).forEach((item: any) => {
      events.push({
        id: String(item.sepID ?? item.eventTime),
        type: 'SEP',
        label: 'Particules solaires énergétiques (SEP)',
        date: item.eventTime ?? '',
        intensity: 45,
        detail: 'Flux de protons énergétiques détecté par les instruments NASA/GOES.',
      });
    });
  }

  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return events.slice(0, 12);
}

// ------------------------------- APOD -------------------------------

async function fetchApod(warnings: string[]): Promise<ApodData | null> {
  try {
    const data = await getJson(
      nasaEndpoint('/planetary/apod?thumbs=true', apiKey())
    );
    if (!data || !data.title) return null;
    return {
      title: data.title,
      date: data.date ?? '',
      url: data.media_type === 'image' ? data.url : data.thumbnail_url ?? data.url,
      hdurl: data.hdurl,
      explanation: data.explanation ?? '',
      mediaType: data.media_type ?? 'image',
      copyright: data.copyright,
    };
  } catch (err) {
    warn(warnings, err, 'APOD');
    return null;
  }
}

// ------------------------------ NeoWs ------------------------------

async function fetchNeo(warnings: string[]): Promise<NeoSummary | null> {
  try {
    const today = fmtDate(new Date());
    const data = await getJson(
      nasaEndpoint(`/neo/rest/v1/feed?start_date=${today}&end_date=${today}`, apiKey())
    );
    const groups = data?.near_earth_objects ?? {};
    const all: any[] = Object.values(groups).flat();
    const objects = all
      .map((o) => ({
        name: String(o.name ?? 'Objet'),
        distanceKm: Math.round(Number(o?.close_approach_data?.[0]?.miss_distance?.kilometers ?? 0)),
        date: String(o?.close_approach_data?.[0]?.close_approach_date_full ?? today),
        hazardous: !!o.is_potentially_hazardous_asteroid,
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 3);
    return { count: Number(data?.element_count ?? all.length), objects };
  } catch (err) {
    warn(warnings, err, 'NeoWs');
    return null;
  }
}

// ------------------- Environnement lunaire temps réel -------------------
// Modèle astronomique déterministe : constante solaire NASA, distance
// Terre-Soleil et phase synodique réelle. Ce ne sont pas des mesures LRO.
const SYNODIC_MONTH = 29.530588853;
const NEW_MOON_JD = 2451550.09765; // 2000-01-06 18:14 UTC
const SOLAR_CONSTANT = 1361.1; // W/m² (valeur NASA/TSI)

function phaseName(fraction: number): string {
  if (fraction < 0.03 || fraction > 0.97) return 'Nouvelle Lune';
  if (fraction < 0.22) return 'Premier croissant';
  if (fraction < 0.28) return 'Premier quartier';
  if (fraction < 0.47) return 'Lune gibbeuse croissante';
  if (fraction < 0.53) return 'Pleine Lune';
  if (fraction < 0.72) return 'Lune gibbeuse décroissante';
  if (fraction < 0.78) return 'Dernier quartier';
  return 'Dernier croissant';
}

export function computeRealTimeLunarEnvironment(date = new Date()): LunarEnvironment {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const ageRaw = (jd - NEW_MOON_JD) % SYNODIC_MONTH;
  const age = ageRaw < 0 ? ageRaw + SYNODIC_MONTH : ageRaw;
  const fraction = age / SYNODIC_MONTH;
  const illumination = ((1 - Math.cos(2 * Math.PI * fraction)) / 2) * 100;

  const days2000 = jd - 2451545.0;
  const meanAnomaly = ((357.529 + 0.98560028 * days2000) * Math.PI) / 180;
  const earthSunAu = 1.00014 - 0.01671 * Math.cos(meanAnomaly) - 0.00014 * Math.cos(2 * meanAnomaly);
  const solarFlux = SOLAR_CONSTANT / (earthSunAu * earthSunAu);

  // Température d'équilibre radiative (modèle physique, albédo 0.12, émissivité 0.95).
  const sigma = 5.670374419e-8;
  const tDay = Math.pow((0.88 * solarFlux) / (0.95 * sigma), 0.25);
  const tNight = 100; // température d'équilibre nocturne lunaire mesurée par Diviner (ordre de grandeur)
  const moonDist = 385000.56 - 20905.355 * Math.cos(meanAnomaly + 0.1098);

  return {
    solarFluxWm2: solarFlux,
    surfaceDayC: tDay - 273.15,
    surfaceNightC: tNight - 273.15,
    illuminationPct: illumination,
    phaseName: phaseName(fraction),
    moonAgeDays: age,
    distanceKm: moonDist,
    computedAt: date.getTime(),
  };
}

// --------------------------- Agrégation ---------------------------

function simulatedBriefing(reason: string): NasaBriefing {
  return {
    source: 'simulated',
    fetchedAt: Date.now(),
    radiationIndex: 18,
    events: [
      {
        id: 'sim-activity',
        type: 'FLR',
        label: 'Activité solaire simulée',
        date: new Date().toISOString(),
        intensity: 18,
        detail: `${reason} — le jeu utilise une activité solaire simulée.`,
      },
    ],
    apod: null,
    neo: null,
    environment: computeRealTimeLunarEnvironment(),
    warnings: [reason],
  };
}

export async function fetchNasaBriefing(force = false): Promise<NasaBriefing> {
  if (!force) {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as NasaBriefing;
        if (Date.now() - cached.fetchedAt < cacheTtl() && cached.source === 'live') {
          return cached;
        }
      }
    } catch {
      /* cache indisponible */
    }
  }

  const warnings: string[] = [];
  const [events, apod, neo] = await Promise.all([
    fetchDonki(7, warnings),
    fetchApod(warnings),
    fetchNeo(warnings),
  ]);

  const liveCount = (apod ? 1 : 0) + (neo ? 1 : 0) + (events.length > 0 ? 1 : 0);
  if (liveCount === 0) {
    const quota = warnings.some((w) => w.includes('429') || w.toLowerCase().includes('quota'));
    const reason = quota
      ? 'Quota NASA dépassé (HTTP 429) — ajoute ta clé personnelle dans le panneau'
      : warnings[0] ?? 'API NASA injoignable';
    return simulatedBriefing(reason);
  }

  // Indice de radiation : l'événement le plus énergétique des 3 derniers jours.
  const recentCutoff = Date.now() - 3 * 24 * 3600 * 1000;
  const recent = events.filter((e) => {
    const t = new Date(e.date).getTime();
    return Number.isFinite(t) ? t >= recentCutoff : true;
  });
  const radiationIndex = recent.reduce((max, e) => Math.max(max, e.intensity), 12);

  const briefing: NasaBriefing = {
    source: 'live',
    fetchedAt: Date.now(),
    events,
    radiationIndex: Math.min(80, radiationIndex),
    apod,
    neo,
    environment: computeRealTimeLunarEnvironment(),
    warnings,
  };

  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(briefing));
  } catch {
    /* stockage indisponible */
  }
  return briefing;
}

/** Compatibilité avec l'ancien code : renvoie les événements CME normalisés. */
export async function fetchRecentCMEEvents(days = 7): Promise<SpaceWeatherEvent[]> {
  void days;
  const briefing = await fetchNasaBriefing();
  return briefing.events.filter((e) => e.type === 'CME');
}
