# INFECTIUM v38 — Finition, performance et dossier jury

Cette version applique les deux packs de patchs (P1–P4 et V1–V4) sur la v37.
Aucun système de jeu n'a été modifié.

## 1. Performance de chargement

- Le moteur 3D (Three.js + scène) est **chargé après le premier rendu** via `import()` dynamique.
- Découpage du bundle : `react`, `three`, `solarSystem` et l'application sont des chunks séparés.
- Résultat mesuré : le chunk principal passe de ~893 kB à **127 kB** (43 kB gzip), Three.js
  (527 kB) n'est téléchargé qu'après l'affichage du menu.
- Première synchronisation 3D ajoutée après chargement du moteur (pas d'attente d'un tick).

## 2. Mode réel : rythme contrôlable

- Boutons de vitesse **×1 / ×6 / ×30** dans le HUD (et en mode astronaute), appliqués
  uniquement en mode réel.
- Repère « 🌙 Nuit dans X h de mission (~Y min réelles) » calculé depuis `dayT` et le ratio.
- Le multiplicateur est intégré à la boucle de simulation et au tableau de dépendances.

## 3. Sauvegarde renforcée

- **Copie de secours automatique** (`infectium.save.v4.bak`) toutes les ~40 s.
- Au chargement : sauvegarde principale → copie de secours → migration v3.
- `clearSave` supprime les deux slots.

## 4. Identité et première impression

- Titre de page, meta description, Open Graph et `theme-color` corrects.
- **Écran de démarrage animé** (orbite, pulsation, barre de chargement) avec filet de
  sécurité à 7 s, effacé au premier rendu React.
- Hero « NASA SPACE APPS CHALLENGE 2026 » sur l'écran de configuration.

## 5. Profondeur visuelle

- 180 particules de **poussière de régolithe** en dérive lente sur le site lunaire.
- **Trois projecteurs de site** qui s'allument progressivement la nuit lunaire.
- Micro-animations d'interface : jauges fluides, alerte pulsée, entrées de panneaux,
  retours au clic, respect de `prefers-reduced-motion`.

## 6. Dossier NASA intégré

- Bouton **📋 Dossier NASA** sur l'écran de configuration.
- Tableau des 8 exigences du défi → implémentation réelle → où la voir dans le jeu.
- Sections « Données & honnêteté », « Parcours jury en 2 minutes » et « Technique ».

## 7. Fichiers modifiés / ajoutés

`index.html`, `src/main.tsx`, `vite.config.ts`, `src/App.tsx`,
`src/components/ResourceHUD.tsx`, `src/components/SurvivalUI.tsx`,
`src/components/ModePanels.tsx`, `src/game/sim.ts`,
`src/engine/lunar/LunarBaseScene.ts`, `src/styles.css`, `FIXES.md`.

## 8. Vérifications exécutées

- `tsc --noEmit` : OK.
- `npm run build` : OK — chunks `index 127 kB`, `react 141 kB`, `solarSystem 124 kB`,
  `three 528 kB`, CSS 59 kB.
- `scripts/simtest.ts` : 42 vérifications OK.
- `scripts/corrections-test.ts` : ~80 vérifications OK.
- `scripts/offline-check.ts` : 12 h → 30 jours d'absence, 60 jours simulés en 73 ms.

## 9. Limites

- Toujours pas de navigateur headless : le rendu 3D et le dossier sont validés par
  compilation et revue de code, à confirmer visuellement.
- Le mode réel reste plafonné à 60 jours de mission par rattrapage.

---

# INFECTIUM v37 — Trois modes, temps persistant et base vivante

Évolution de la v36. Aucun système existant n'a été supprimé ; les ajouts sont
intégrés aux mécaniques déjà en place.

## 1. Trois modes de jeu

| Mode | Temps | NASA | Fin de mission | Hors-ligne |
|---|---|---|---|---|
| **Mission réelle** | rapport réglable (défaut ×2) | oui | durée 7/14/30 sols ou illimitée | **rattrapage calculé** |
| **Junior Explorer** | jour en 4 min | oui | survie | pause |
| **Practice** | jour en 4 min | désactivée | jamais (santé plancher) | pause |

- Sélection au lancement (écran de configuration) et changement à chaud via
  **🎛 Temps & mode** (bouton dans le HUD).
- Mode RÉEL : ratio ×2/×6/×12/×30/×60 (heures de jeu par heure réelle), sol de
  départ, date de départ, durée de mission. ×2 ⇒ une journée de mission dure 12 h
  réelles et 12 h d'absence représentent 24 h de mission.
- En mode RÉEL, l'ouverture des panneaux ne met plus la simulation en pause.
- Practice : aucune requête api.nasa.gov, aucune éruption aléatoire, aucune fin de
  mission ; l'énergie, l'usure, les objectifs et le carnet restent actifs.

## 2. Temps de mission unifié

- Nouveau module `src/game/time.ts` : constantes (1 sim s = 6 min de mission,
  240 sim s = 1 jour), conversions, libellés, progression, date de mission.
- `GameState` porte désormais `mode`, `timeConfig`, `elapsedGameSec`.
- Tous les modes partagent le même moteur ; le mode ne change que le taux de
  conversion temps réel → temps de mission et les règles (NASA, échec).

## 3. Sauvegarde complète v4 et rattrapage hors-ligne

- Enveloppe `{ version: 4, savedAt, state }` : horodatage réel de la dernière
  activité, état complet (ressources, capacités, bâtiments avec niveau/priorité/
  usure, communications, événements, objectifs, carnet, statistiques, mode,
  réglages de temps).
- Migration automatique des sauvegardes v3 (progression conservée).
- Sauvegarde sur `beforeunload`, `pagehide`, onglet masqué et toutes les 4 s.
- `src/game/offline.ts` : au retour en mode RÉEL, le temps écoulé est converti puis
  rejoué par pas de 30 min de mission (plafond 60 jours). Aucun calcul en
  arrière-plan : tout est fait au chargement.
- **Rapport d'absence** : durées réelles/mission, sols traversés, ressources
  avant/après avec minimums, temps de délestage, modules hors service, éruptions,
  santé, avertissements.

## 4. Équipage autonome en mode réel

Pour qu'une absence ne tue pas l'équipage par oubli de nourriture :
- l'équipage se nourrit et s'hydrate automatiquement depuis les réserves ;
- il se repose pendant la nuit lunaire ;
- une maintenance de routine ralentit l'usure des modules correctement alimentés.

L'usure, les pannes, le délestage et les éruptions restent possibles et sont
rapportés. Testé : 7 jours d'absence ⇒ base intacte ; 30 jours ⇒ fonctionnement
dégradé avec délestage ; au-delà de 60 jours de mission, le calcul est plafonné.

## 5. Équilibrage énergétique

- Production solaire de base 0,55 (pic) et demande de départ 0,17 : la base de
  départ est autonome sur un cycle complet, batteries comprises.
- La tension revient dès qu'on ajoute des modules (serre, recycleur, bouclier),
  avec le système de priorités et de délestage de la v36.
- `powerDraw` revu pour les 14 modules, `BATTERY_DISCHARGE_RATE` 0,26.

## 6. Visuel

- Blindage des modules retravaillé : panneaux, joints, rivets, plaques
  techniques, poussière, relief (`bumpMap`) et micro-rayures.
- Site lunaire enrichi : antenne de communication animée, 10 balises de périmètre
  clignotantes, caisses de ravitaillement, rover à roues animées, éclairage de site.
- Intérieurs v36 conservés (bandeaux, ventilation, conduits, portes fluides).

## 7. Fichiers

**Ajoutés** : `src/game/time.ts`, `src/game/offline.ts`,
`src/components/ModePanels.tsx`, `scripts/offline-check.ts`.
**Modifiés** : `src/game/types.ts`, `src/game/sim.ts`, `src/game/buildings.ts`,
`src/App.tsx`, `src/components/ResourceHUD.tsx`, `src/components/NasaPanel.tsx`,
`src/components/SurvivalUI.tsx`, `src/engine/lunar/LunarBaseScene.ts`,
`src/engine/lunar/LunarMaterials.ts`, `src/engine/solarSystem.ts`,
`src/styles.css`, `README.md`, `GAMEPLAY.md`, `scripts/corrections-test.ts`,
`FIXES.md`.

## 8. Tests

- `tsc --noEmit` + `npm run build` : OK.
- `scripts/simtest.ts` : 42 vérifications OK.
- `scripts/corrections-test.ts` : ~80 vérifications OK, dont temps de mission,
  conversions des modes, rattrapage 12 h, Practice sans échec, sauvegarde v4
  (horodatage, usure, priorités, ressources, temps), migration v3.
- `scripts/offline-check.ts` : absences de 12 h à 30 jours, de 4 à 39 ms de calcul.

## 9. Limites

- Le rattrapage est plafonné à 60 jours de mission pour rester instantané.
- L'équipage autonome, la maintenance de routine et les taux de panne sont des
  paramètres de gameplay, pas des données NASA.
- La date affichée est une date de mission arbitraire (choisie par le joueur),
  pas une éphéméride lunaire réelle.
- Toujours aucun navigateur headless disponible : rendu 3D validé par compilation
  et revue de code, pas par capture d'écran.

---

# INFECTIUM v36 — Évolutions réalisées

Version de travail : `infectium-survival-v35.zip` → livrable **v36**.
Toutes les fonctionnalités décrites ici sont implémentées et testées par les
scripts du dossier `scripts/` (voir §5).

---

## 1. Audit de la v35 (ce qui a été conservé)

Déjà solide et préservé : séparation des variables publiques/secret, proxy NASA
Netlify, portes automatiques des couloirs, textures intérieures procédurales,
rotation stricte des 40 questions, première liaison Terre, sauvegarde locale,
cycle jour/nuit, radiations, données DONKI/APOD/NeoWs, progression par paliers.

Points faibles identifiés :
- l'électricité n'était qu'une jauge : aucune notion de puissance, de priorité
  ou de pénurie ;
- les modules ne s'usaient pas : aucune maintenance, donc aucune autonomie ;
- les radiations n'avaient aucun effet lié à la position de l'astronaute ;
- la liaison Terre n'avait qu'une seule action générique ;
- pas d'objectifs de mission ni de capitalisation pédagogique ;
- pas d'historique visuel des réserves ;
- intérieurs encore sobres malgré les premières textures.

## 2. Simulation de mission approfondie

### Réseau électrique (nouveau)
- Chaque module possède une **demande de puissance** (`powerDraw × niveau`).
- Production : panneaux solaires (dépend du jour lunaire), atelier, centrale.
- **Batteries** : la réserve d'énergie fournit un appoint limité (0,22 u/s max).
- **Distribution par priorité** : Vitale → Normale → Économie. Un module privé
  d'énergie tombe à 40 % de rendement ; les modules vitaux sont servis d'abord.
- Conséquence directe : une base peut avoir plus de modules qu'elle ne peut en
  alimenter. Le joueur doit choisir, pas seulement accumuler.

### Usure et maintenance (nouveau)
- Usure continue (plus rapide en délestage), −45 % de rendement au maximum.
- Au-delà de 95 %, le module est **hors service** (30 % de rendement) : incident
  imprévu qui force une intervention.
- **Réparation locale** : −50 % d'usure pour quelques points + 6 énergie.
  Immédiate, c'est l'alternative autonome à l'assistance terrestre.

### Radiations liées au terrain (nouveau)
- Sortir pendant une éruption (`spike > 30`) inflige une dose supplémentaire.
- Le hub et l'abri réduisent l'exposition ; les boucliers consomment de l'énergie.
- Alerte visuelle dédiée (bandeau tempête) + consigne adaptée à la position.

### Alimentation
- La production des serres/pépinières est désormais multipliée par le rendement
  énergétique : couper l'électricité de la serre réduit la nourriture produite.

## 3. Communications Terre-Lune

- **4 demandes distinctes** : diagnostic (réparation), médical, largage,
  analyse météo spatiale — chacune avec un effet réel et un coefficient de délai.
- **File d'attente** (2 max), **historique** complet, **notifications** à l'arrivée.
- Une réponse arrivée en situation critique est marquée **tardive**.
- **Délai physique réel** affiché (2 × distance / c ≈ 2,56 s) et **délai de jeu**
  compressé ×12, minimum 20 s, explicitement distingués.
- Une **éruption solaire perturbe les communications** : tous les délais sont
  allongés (×1 + spike/120).
- Préparer une transmission coûte 10 points de sommeil : demander de l'aide n'est
  pas gratuit.

## 4. Pédagogie et progression

- **8 objectifs de mission** (survie, réseau, alimentation, radiations, tempête,
  autonomie, liaison Terre, recyclage) avec barre de progression, récompense en
  points et explication « pourquoi c'est important ».
- **12 fiches de carnet de bord** débloquées par l'expérience (première nuit,
  première coupure, première tempête, première réparation…), chacune expliquant
  un phénomène réel (nuit lunaire de 14 jours, recyclage de l'eau, vitesse de la
  lumière, blindage par régolithe…).
- **Phases de mission** dérivées du palier : Survie → Autonomie → Résilience.
- Les QCM conservent la banque de 40 questions et la rotation sans répétition.

## 5. Interface, visualisation et architecture 3D

- Nouveau panneau **Gestion de mission** (4 onglets) : énergie/modules avec
  priorités et réparations, liaison Terre, objectifs, carnet.
- HUD : **courbes d'évolution** des réserves (60 s), jauge de couverture
  électrique, alertes de délestage et de tempête, compteur d'objectifs.
- Intérieurs enrichis : bandeaux d'accent par module, grilles de ventilation,
  conduits, casiers, table centrale, baies de batteries, rampes de conduits,
  étagères de la pépinière, respiration lumineuse des éclairages.
- Portes : courbe d'ouverture adoucie (pneumatique), voyant qui pulse, seuil
  lumineux ; détection d'approche élargie et sans blocage artificiel.
- Nouveau panneau NASA : étiquettes d'utilité (DONKI = gameplay, APOD = culture,
  NeoWs = contexte) et rappel de la liaison Terre.

## 6. Fichiers modifiés / ajoutés

**Ajoutés** : `src/game/comms.ts`, `src/game/objectives.ts`, `src/game/insights.ts`,
`src/components/SystemsPanel.tsx`.

**Modifiés** : `src/game/types.ts`, `src/game/buildings.ts`, `src/game/sim.ts`,
`src/App.tsx`, `src/components/ResourceHUD.tsx`, `src/components/NasaPanel.tsx`,
`src/components/SurvivalUI.tsx`, `src/engine/astronaut.ts`, `src/styles.css`,
`README.md`, `GAMEPLAY.md`, `scripts/corrections-test.ts`, `FIXES.md`.

**Inchangés (préservés)** : `.env.example`, `netlify.toml`,
`netlify/functions/nasa.mjs`, `.github/workflows/ci.yml`, `DEPLOYMENT.md`,
`src/game/corridorLinks.ts`, `src/data/quizRotation.ts`.

## 7. Tests exécutés

- `tsc --noEmit` : OK.
- `npm run build` : OK (bundle ≈ 890 kB, gzip ≈ 253 kB).
- `scripts/simtest.ts` : 42 vérifications, OK (aucune régression).
- `scripts/corrections-test.ts` : ~55 vérifications, OK :
  banque/rotation des questions, raccordements de couloirs, délais et effets des
  4 demandes Terre, plafond de file, production et coupure électrique,
  effet des priorités, usure/réparation, exposition extérieure, objectifs.

## 8. Limites connues

- L'astronaute ne circule pas sur le plateau city-builder : la traversée réelle
  se fait dans les intérieurs (les couloirs du plateau restent une vue de
  construction).
- Le délai de communication est compressé ×12 pour le rythme de jeu ; la valeur
  physique réelle est toujours affichée séparément.
- Les valeurs de consommation, d'usure et de rendement sont des paramètres de
  gameplay, pas des données NASA ; seules les données DONKI/APOD/NeoWs et les
  constantes (vitesse de la lumière, distance, flux solaire) sont réelles.
- Pas de test navigateur automatisé disponible dans l'environnement : le rendu 3D
  des nouveautés est validé par compilation TypeScript et revue de code.
