# INFECTIUM

**NASA Space Apps Challenge 2026 — Junior Astronaut Mission Trainer**
Équipe INFECTIUM — *Survive. Build. Explore.*

## Lancer le projet

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # typecheck + build de production -> dist/
npm run preview
```

**Clé NASA** : créez la vôtre gratuitement sur https://api.nasa.gov (30 s), puis
collez-la dans le champ **Clé NASA** du panneau 🛰️ en jeu (stockée localement) ou
dans `.env` (`VITE_NASA_API_KEY=...`, voir `.env.example`). `DEMO_KEY` est partagée
et limitée à ~30 requêtes/heure : sans clé personnelle, les données live seront
souvent indisponibles et le jeu passera en mode **SIMULÉ** (clairement affiché).

**Sécurité des clés** : `VITE_*` = public (compilé dans le bundle). Pour garder une
clé hors du navigateur, utilisez la Netlify Function fournie (`NASA_API_KEY`)
voir **`DEPLOYMENT.md`**.

> Installation : `npm install` est recommandé. Le `pnpm-lock.yaml` a été retiré du
> livrable et `postcss` est épinglé à `8.4.49` pour éviter le blocage
> `minimumReleaseAge` rencontré avec `postcss@8.5.33`.

## Notre vision

INFECTIUM est un jeu éducatif : faire vivre à un enfant (7-12 ans) la gestion d'une
base lunaire abandonnée, en rendant concret l'équilibre entre survie (oxygène, eau,
énergie, nourriture), protection contre les radiations, et apprentissage de
l'astronomie par le jeu.

L'objectif pédagogique prime sur la complexité technique : un enfant qui termine une
session en ayant appris une chose sur l'espace et en ayant eu envie de continuer,
c'est la réussite visée, même avec un prototype volontairement simple pour ce
hackathon de 48h.

### Modes de jeu envisagés

Le concept initial prévoit plusieurs modes, pour des publics différents :

- **Practice** : mode libre, construction/démolition sans pénalité, pour expérimenter.
- **Junior (7-10 ans)** — *mode implémenté dans ce prototype* : très visuel,
  consignes courtes, récupération à 100% des ressources, pas de défaite punitive.
- **Junior Explorer (10-14 ans)** : introduit progressivement des notions de calcul,
  de consommation/production plus fines, taux de récupération variables au démontage.
- **Realistic** : contraintes proches d'une vraie mission, pertes importantes à la
  démolition (90-100% de certains matériaux non récupérables).

Les taux de récupération, les dimensions de bâtiments et les probabilités d'incidents
sont des **paramètres de gameplay**, pas des données scientifiques officielles — à
calibrer, jamais présentés comme des faits NASA.

## Ce que contient ce prototype

1. **Système solaire** : animation et navigation avec une échelle fidèle (le Soleil
   domine nettement, Jupiter/Saturne clairement plus grosses que les telluriques —
   échelle dérivée des rayons réels, compressée pour rester jouable).
2. **Message système d'accueil** façon Solo Leveling : barre flottante → glitch
   pixelisé → ouverture, avec le son. Présente l'équipe **INFECTIUM** et propose de
   passer une journée sur la Lune (OUI/NON).
3. **Voyage Terre → Lune** avec survol avant l'atterrissage.
4. **Base lunaire abandonnée** à faire revivre : Base Centrale, Panneaux Solaires,
   Purificateur d'eau, Pépinière — avec une échelle base/Lune cohérente.
5. **Quiz spatial** (40 questions) : chaque amélioration de bâtiment déclenche une
   question. **Rotation stricte sans répétition** : les 40 questions sont mélangées
   en début de cycle, posées une seule fois, puis un nouveau cycle démarre.
   Bonne réponse → le bâtiment s'améliore réellement dans la scène 3D + gain de points.
6. **Ressources en temps réel** : O2, H2O, Énergie, Nourriture, Radiation, points.
7. **Données NASA en direct** : DONKI (CME, FLR, GST, SEP), APOD et NeoWs via
   `api.nasa.gov`, avec panneau de briefing, cache, rafraîchissement et gestion du
   quota. Les intensités de jeu sont une normalisation, jamais une échelle NASA.

## Nouveautés V38 — finition et performance

- Chargement du moteur 3D **après l'interface** : chunk principal ~127 kB au lieu de ~893 kB.
- Écran de démarrage animé, titre/meta corrects, hero « NASA Space Apps 2026 ».
- Vitesse de simulation **×1 / ×6 / ×30** en mode réel + repère « prochaine nuit ».
- Copie de secours automatique de la sauvegarde.
- Poussière lunaire, projecteurs de nuit, micro-animations d'interface.
- **Dossier NASA intégré** : les 8 exigences du défi et leur implémentation réelle.

## Nouveautés V37 — trois modes et temps persistant

- **Mission réelle** : 1 h réelle = 2 h de mission par défaut (rapport réglable ×2 → ×60), sol/date de départ et durée de mission configurables.
- **Junior Explorer** : l'expérience guidée actuelle.
- **Practice** : sans données NASA ni fin de mission, pour expérimenter librement.
- **La base continue de vivre hors-ligne** en mode réel : le temps écoulé est rejoué au retour (plafonné à 60 jours de mission) avec un **rapport d'absence** détaillé.
- **Sauvegarde complète v4** : ressources, batteries, production, bâtiments, usure, priorités, événements en cours, communications, objectifs, carnet, statistiques et horodatage. Migration automatique des anciennes sauvegardes.
- **Visuel** : blindage texturé avec joints/rivets/relief, antenne de communication animée, balises de périmètre, caisses de ravitaillement et rover sur le site.

## Nouveautés V36 — gestion de mission

- **Réseau électrique avec priorités** (vitale / normale / économie), délestage et batteries : une base peut posséder plus de modules qu'elle ne peut en alimenter.
- **Usure et réparations locales** : les modules s'abîment, produisent moins, et se réparent en points + énergie.
- **Radiations actives** : sortir pendant une tempête augmente la dose, se réfugier dans le hub ou un abri la réduit. Alerte visuelle dédiée.
- **Liaison Terre enrichie** : 4 types de demandes (diagnostic, médical, largage, météo), historique, file d'attente, réponses tardives, délai allongé pendant les éruptions.
- **8 objectifs de mission** avec explications pédagogiques et **12 fiches de carnet** débloquées par l'expérience.
- **Interface de gestion** (Systèmes) + courbes de réserves dans le HUD, alertes de délestage et de tempête.
- **Intérieurs enrichis** : bandeaux d'accent par module, grilles de ventilation, conduits, équipements dédiés, portes plus fluides et lumineuses.

## Prochaines étapes prévues

- Vue subjective de l'astronaute à l'atterrissage (sortie de la fusée, effet
  science-fiction) pour renforcer l'immersion dès les premières secondes.
- Trajectoire Terre → Lune affinée sur le modèle des missions Artemis.
- Extension progressive de la zone constructible et déblocage de nouveaux bâtiments
  par palier à mesure que le joueur progresse.
- Un assistant intelligent pour varier et adapter les questions du quiz, afin
  d'éviter les répétitions perçues comme redondantes et de personnaliser la
  progression pédagogique de chaque enfant.
- Introduction progressive des modes Practice, Junior Explorer et Realistic.

## Fichiers de référence

- `INFECTIUM_SPEC.md` : cahier des charges détaillé du projet.
- `quiz-40.md` : les 40 questions en version lisible/éditable.
- `src/engine/solarSystem.ts` : scène 3D (système solaire, voyage, base).
- `src/engine/resourceSim.ts` : calcul des ressources à partir des bâtiments.
- `src/engine/donki.ts` : NASA DONKI (CME/FLR/GST/SEP), APOD, NeoWs, environnement lunaire.
- `src/data/quiz.ts` : les 40 questions utilisées par le jeu.
- `src/components/ResourceHUD.tsx`, `QuizModal.tsx` : interface du jeu.

---

## 🎮 Gameplay V3.3 — construction, exploration et survie (implémenté)

Le prototype est une boucle de jeu complète, avec une **entrée cinématique** et des **bâtiments évolutifs**.

- **Arrivée directe** : la Lune est nue en phase spatiale (aucune base, aucun plateau) ; le module lunaire se pose sur le régolithe, puis la base se déploie (~12 s : hub → énergie → eau → serre → couloirs). Le plateau de construction n'apparaît qu'à la fin. Reprise instantanée ensuite.
- **Plateau lunaire quadrillé** de 32 m (palier 2 : 40 m, palier 3 : 48 m), fantôme de placement vert/rouge, collisions d'empreinte, caméra orbitale dédiée.
- **Progression par QCM** : 40 questions, 10–20 pts, bonus laboratoire ; le **score cumulé** débloque les paliers, les **points** paient constructions et améliorations.
- **4 bâtiments d'origine détaillés** (hub, panneaux solaires, purificateur, pépinière) avec **4 niveaux** et extensions animées (coupole, annexe, mât, fermes solaires, silos, biodôme). Couloirs pressurisés entre modules.
- **Mode Astronaute 3ᵉ personne** (bouton 🚶 Explorer) : extérieur + intérieurs connectés, joysticks tactiles, réglages de sensibilité, interactions `E`. **Portes automatiques coulissantes** aux jonctions hub ↔ couloirs ↔ modules (ouverture à l'approche, blocage réel quand fermées), murs intérieurs texturés (panneaux composites, joints, rivets, bandeaux lumineux).
- **Liaison Terre** : les commandes locales sont instantanées, l'assistance du centre de contrôle revient après un délai de transmission (délai lumière réel affiché + délai de jeu).
- **Couloirs du plateau** : détection automatique des modules raccordés, portes posées uniquement sur les extrémités reliées, opercule borgne signalé sinon.
- **Survie** : faim, hydratation, sommeil ; récolter, purifier, manger, boire, **dormir pour passer au sol suivant**.
- **10 modules** à poser : forge, couloir pressurisé, serre, réservoir, abri anti-radiations, laboratoire, centrale, garage, recycleur, bouclier radiatif.
- **Ressources** O2 / eau / énergie / nourriture : production, consommation, stockage et rendements en temps réel.
- **Cycle jour/nuit lunaire** (240 s) : les panneaux faiblissent la nuit, le chauffage consomme plus, la lumière du site change.
- **Données NASA réelles** : DONKI (CME, FLR, GST, SEP), APOD, NeoWs via `api.nasa.gov`, avec panneau « Briefing NASA », téléchargement toutes les 3 min, cache, gestion quota/réseau et clé personnelle (champ dans le panneau ou `VITE_NASA_API_KEY`). L'environnement lunaire (flux solaire, températures, phase) est calculé en temps réel à partir des constantes NASA.
- **Radiations** : événements DONKI + éruptions aléatoires, boucliers cumulables, santé de l'équipage, échec si O2 ou santé à zéro.
- **Sauvegarde automatique**, écran de fin, nouvelle mission, interface responsive (mobile comprise).
- Système solaire, message Solo Leveling, voyage Artemis, sons et boutons existants conservés.

📖 Règles détaillées, coûts, formules et contrôles : **`GAMEPLAY.md`**.

Raccourci démo : touche **`L`** depuis l'espace pour atterrir directement.

Tests logiques : `npx tsx scripts/simtest.ts` (42 vérifications) et `npx tsx scripts/corrections-test.ts` (rotation des questions, raccordements de couloirs, délai Terre). Sans `tsx`, bundlez avec esbuild :

```bash
./node_modules/.bin/esbuild scripts/corrections-test.ts --bundle --platform=node --format=esm --outfile=/tmp/t.mjs && node /tmp/t.mjs
```
