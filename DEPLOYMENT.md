# Déploiement — INFECTIUM

## 1. Variables d'environnement

| Variable | Portée | Secret ? | Valeur / rôle |
|---|---|---|---|
| `NASA_API_KEY` | Serveur (Netlify Function) | **Oui** | Clé api.nasa.gov utilisée par `netlify/functions/nasa.mjs`. Jamais exposée au navigateur. |
| `VITE_NASA_PROXY` | Client (public) | Non | `/.netlify/functions/nasa` — active le proxy. |
| `VITE_NASA_API_KEY` | Client (public) | Non | Clé de quota api.nasa.gov, compilée dans le bundle. **Ne jamais y mettre un secret privé.** |

> Toute variable préfixée `VITE_` est injectée dans le JavaScript public.
> La clé NASA est un identifiant de quota, pas un secret ; le proxy permet
> néanmoins de ne pas la diffuser dans le bundle.

## 2. Netlify

1. Importer le dépôt (build command `npm run build`, publish `dist` — déjà dans `netlify.toml`).
2. **Site settings → Environment variables** :
   - `NASA_API_KEY` = votre clé api.nasa.gov (secret, serveur)
   - `VITE_NASA_PROXY` = `/.netlify/functions/nasa`
   - `VITE_NASA_API_KEY` = `DEMO_KEY` (repli si le proxy échoue)
3. Déployer. Les Functions sont dans `netlify/functions/` (bundler esbuild).
4. Vérifier après déploiement : le panneau 🛰️ doit afficher `● LIVE` et l'URL
   `/.netlify/functions/nasa?path=...` doit répondre en JSON.

Sans proxy (`VITE_NASA_PROXY` vide), le client appelle directement
`https://api.nasa.gov/...` avec `VITE_NASA_API_KEY` (ou `DEMO_KEY`).

## 3. GitHub Actions

Le workflow `.github/workflows/ci.yml` exécute `npm ci` puis `npm run build`
(typecheck TypeScript inclus). Ajouter le secret :

- **Settings → Secrets and variables → Actions → New repository secret**
- Nom : `NASA_API_KEY` (injecté dans `VITE_NASA_API_KEY` au build)

Aucune clé n'est écrite dans le dépôt. `.env`, `.env.local` et `.netlify`
sont dans `.gitignore`.

> GitHub Actions ne sert ici qu'à la vérification/build. Pour un déploiement
> statique complet avec proxy, Netlify reste la cible recommandée (Functions).

## 4. Vérifications locales

```bash
npm install
npm run build            # tsc --noEmit + vite build
grep -rn "api_key=" src/ # ne doit contenir aucune clé littérale
```
