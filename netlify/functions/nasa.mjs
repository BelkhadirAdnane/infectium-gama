// =========================================================================
// Proxy NASA — Netlify Function (optionnel mais recommandé)
// -------------------------------------------------------------------------
// Objectif : ne jamais exposer une clé dans le bundle client.
// La clé est lue dans la variable d'environnement SERVEUR `NASA_API_KEY`
// (Netlify → Site settings → Environment variables). Elle n'est jamais
// préfixée par VITE_ et n'est donc pas injectée dans le JavaScript public.
//
// Le client appelle : /.netlify/functions/nasa?path=<chemin NASA encodé>
// Exemple : ?path=%2FDONKI%2FCME%3FstartDate%3D...%26endDate%3D...
// =========================================================================

const ALLOWED_PREFIXES = ['/DONKI/', '/planetary/apod', '/neo/rest/v1/'];

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=300, s-maxage=600',
};

export default async (request) => {
  const url = new URL(request.url);
  const path = url.searchParams.get('path') ?? '';

  // Liste blanche stricte : aucune autre route ne peut être proxifiée.
  if (!ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return new Response(JSON.stringify({ error: 'Chemin NASA non autorisé' }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const key = process.env.NASA_API_KEY || 'DEMO_KEY';
  const sep = path.includes('?') ? '&' : '?';
  const target = `https://api.nasa.gov${path}${sep}api_key=${encodeURIComponent(key)}`;

  try {
    const upstream = await fetch(target, {
      headers: { accept: 'application/json' },
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...JSON_HEADERS,
        'cache-control':
          upstream.status === 200 ? JSON_HEADERS['cache-control'] : 'no-store',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'NASA injoignable' }), {
      status: 502,
      headers: { ...JSON_HEADERS, 'cache-control': 'no-store' },
    });
  }
};
