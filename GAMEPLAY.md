# INFECTIUM — Gameplay V3.3 (construction, exploration, survie, données NASA)

Ce document décrit **la logique de jeu réellement implémentée**.
Les valeurs sont des **paramètres de gameplay**, pas des données scientifiques NASA.

---

## 1. Boucle de jeu

1. **Voyage Terre → Lune** puis fondu optique vers le site **Shackleton-01**.
2. **Atterrissage direct** : le module lunaire se pose sur le régolithe nu, puis **séquence d'implantation (~12 s)** : ancrage du hub, énergie, eau, serre, pressurisation des couloirs. Le plateau de construction n'apparaît qu'à la fin. La base passe **niveau 1**.
3. Le joueur répond à des **QCM spatiaux** → **points scientifiques** (10–20 pts + bonus laboratoire).
4. Il **dépense ces points** pour **améliorer** les 4 modules d'origine (niveaux 2→4) ou **construire** de nouveaux modules.
5. Le **score cumulé** (jamais dépensé) fait monter les **paliers** : le plateau s'étend de 32 m à 48 m, de nouveaux modules se débloquent.
6. En parallèle : **O2 / eau / énergie / nourriture**, **cycle jour/nuit**, **radiations** et santé de l'équipage.

Aucune construction/amélioration n'est validée sans **bonne réponse au QCM**. Mauvaise réponse = aucun point, aucune action, bonne réponse affichée.

---

## 2. Séquence d'entrée

- **Phase spatiale : Lune totalement nue**, sans base, sans plateau, sans fusée décorative. Le vaisseau Artemis effectue le transit.
- Au contact, bascule vers le site Shackleton-01 : le **module lunaire descend directement sur le régolithe**, sans plateforme ni base préexistante.
- Puis : marquage des fondations → hub → panneaux solaires → purificateur → pépinière → couloirs pressurisés (déploiement télescopique).
- Le **plateau quadrillé reste invisible pendant toute l'arrivée** et s'active à la fin de la séquence.
- Un bandeau « INFECTIUM · SÉQUENCE D'IMPLANTATION » affiche la phase et la progression ; le HUD et le dock sont masqués pendant la séquence.
- Reprise d'une sauvegarde dans la même session : la base est reconstruite **instantanément** (pas de cinématique).
- « Nouvelle mission » relance la séquence complète.

---

## 3. Paliers et extension du plateau

| Palier | Nom | Score cumulé | Plateau | Modules débloqués |
|---|---|---|---|---|
| 1 | Avant-poste | 0 | 32 × 32 m | Atelier de forge |
| 2 | Colonie | 150 | 40 × 40 m | Serre, Réservoir, Abri anti-radiations, Laboratoire |
| 3 | Bastion lunaire | 420 | 48 × 48 m | Centrale énergétique, Garage/rover, Recycleur, Bouclier radiatif |

- **1 case = 1 m**. Le plateau s'étend **sans déplacer** les bâtiments existants ; la caméra recadre automatiquement.
- Palier calculé uniquement sur le **score cumulé** (`tierForScore`), annoncé par une bannière système.

---

## 4. Bâtiments

### 4 modules d'origine (modèles 3D détaillés + extensions animées)

| Clé | Nom | Empreinte | Niveaux | Effet / niveau |
|---|---|---|---|---|
| `hub` | Base centrale | 12×8 m | 1–4 | +0,18 O2/s, bouclier +7 %, conso énergie 0,02 |
| `solar` | Panneaux solaires | 6×6 m | 1–4 | +0,16 énergie/s **× facteur jour** |
| `purifier` | Purificateur d'eau | 6×6 m | 1–4 | +0,20 eau/s, conso énergie 0,03 |
| `nursery` | Pépinière | 8×6 m | 1–4 | +0,16 nourriture/s, +0,02 O2/s, −0,02 eau/s |

Coûts d'amélioration : **18 pts** (niv. 2), **30 pts** (niv. 3), **45 pts** (niv. 4).
Chaque niveau ajoute de vrais composants 3D (coupole géodésique, annexe, mât de commande, ferme solaire, silos, biodôme…).

### 10 modules du catalogue (posés librement sur la grille)

| Palier | Module | Empreinte | Coût | Amélioration (base × niveau) | Effet / niveau |
|---|---|---|---|---|---|
| 1 | Couloir pressurisé | 4×2 | 10 | 6 | Structure de liaison (aucune production) |
| 1 | Atelier de forge | 4×3 | 12 | 8 | +0,05 énergie/s, +10 stockage énergie, +1 % bouclier |
| 2 | Serre agricole | 6×5 | 30 | 14 | +0,30 nourriture/s, +0,04 O2/s, −0,04 eau/s |
| 2 | Réservoir d'eau | 4×4 | 20 | 10 | +35 stockage eau, +0,06 eau/s |
| 2 | Abri anti-radiations | 5×4 | 28 | 12 | +18 % bouclier, −0,03 énergie/s |
| 2 | Laboratoire | 6×5 | 32 | 15 | +3 pts/bonne réponse/niveau, +10 stockage O2 |
| 3 | Centrale énergétique | 6×5 | 45 | 18 | +0,30 énergie/s jour **et nuit**, −0,05 eau/s |
| 3 | Garage / rover | 6×4 | 35 | 14 | +0,04 eau/s, +0,03 nourriture/s, +5 % bouclier |
| 3 | Recycleur avancé | 6×5 | 40 | 16 | +0,22 eau/s, +0,08 O2/s, −0,08 énergie/s |
| 3 | Bouclier radiatif | 7×7 | 50 | 20 | +30 % bouclier, −0,20 énergie/s |

- **Collisions** : empreinte AABB, bâtiments d'origine inclus, limites du palier.
- **Démolition** d'un module du catalogue : récupération de **50 %** des points investis. Bâtiments d'origine non démontables.
- Plusieurs exemplaires d'un même module autorisés. Modules de catalogue : niveau max 3.

---

## 5. QCM et points

- Banque de **40 questions** (`src/data/quiz.ts`), 7–12 ans, 10 à 20 pts.
- Tirage aléatoire sans répétition tant que la banque n'est pas épuisée.
- **Bonus laboratoire** : +3 pts par niveau sur chaque bonne réponse.
- **Points** = monnaie ; **score** = total cumulé (paliers).
- Points insuffisants après une bonne réponse : action refusée, message avec le manque, points conservés.
- **🎓 QCM** : entraînement libre. **✨ Série QCM** : 3 questions enchaînées pour gagner des points.
- Simulation **en pause** pendant un QCM et pendant la bannière de palier.

---

## 6. Ressources, jour/nuit et radiations

Consommation équipage : O2 0,14 · eau 0,08 · énergie 0,08 (+0,10 de chauffage la nuit) · nourriture 0,06.
Capacité de base : 100 par ressource ; les modules de stockage l'augmentent.

- **Cycle lunaire** : 240 s, dont 62 % de jour. HUD ☀️/🌙 avec heure lunaire et % d'ensoleillement.
- **Panneaux solaires** : `0,16 × niveau × (0,15 + 0,85 × facteur jour)`. La nuit, l'énergie baisse ; la centrale (palier 3) prend le relais.
- **Radiation ambiante** = `9 + 9 × facteur jour + éruption` ; boucliers cumulés (base 7 %/niv., abri 18 %/niv., bouclier 30 %/niv., forge 1 %, garage 5 %), plafond **88 %**.
- **Santé** : au-dessus de 32 d'exposition, perte de `0,008 × (exposition − 32)`/s ; sinon +0,12/s. Les pénuries font aussi baisser la santé.
- **Échec** si O2 = 0 ou santé = 0 → écran de mission critique + redémarrage.
- **Éruptions** : événements NASA DONKI (CME, FLR, GST, SEP) au fil de la partie + événements aléatoires 15–45 ; retombée lente.

### Données NASA réelles

| API | Usage en jeu |
|---|---|
| **DONKI / CME** | Éjections de masse coronale ; analyse `isMostAccurate`, vitesse et angle réels |
| **DONKI / FLR** | Éruptions solaires, classe réelle C/M/X et flux W/m² |
| **DONKI / GST** | Tempêtes géomagnétiques, indice Kp et échelle NOAA G1–G5 |
| **DONKI / SEP** | Particules solaires énergétiques |
| **APOD** | Image et texte astronomiques du jour dans le briefing |
| **NeoWs** | Nombre d'objets proches de la Terre et approches du jour |

- Panneau **🛰️ NASA** : événements, APOD, NeoWs, environnement lunaire, état de la clé et avertissements (quota 429, réseau, serveur).
- **Rafraîchissement toutes les 3 min** (cache 10 min avec clé perso, 30 min avec `DEMO_KEY`).
- **Clé NASA** : champ dans le panneau (stockée localement) ou `VITE_NASA_API_KEY` dans `.env`. `DEMO_KEY` est partagée et limitée à ~30 req/h.
- **Environnement lunaire temps réel** : flux solaire (constante NASA 1361 W/m² et distance Terre-Soleil réelle), températures d'équilibre jour/nuit, phase et illumination synodique, distance Terre-Lune.
- Les **intensités 0–100 sont une normalisation de gameplay**, jamais présentées comme une échelle NASA ; les classes C/M/X, Kp/G et les types CME/FLR/SEP sont les données brutes.

---

## 7. Mode Astronaute & survie

- **Caméra 3ᵉ personne épaule** (type *Granny / Scary Teacher*) : bouton **🚶 Explorer** du dock.
- **Commandes** : WASD / ZQSD / flèches, `Maj` courir, `Espace` sauter, `E` interagir ; souris (clic pour capturer, `Échap` pour libérer) ; **joysticks tactiles** (gauche : marcher, droit : caméra).
- **⚙ Paramètres** : sensibilité souris, sensibilité joystick droit, taille et opacité des joysticks, inversion de l'axe Y (sauvegardés).
- **🏗 Construire** : retour au plateau pour poser modules et **couloirs pressurisés**.
- **Intérieur connecté** : hub (terminal QCM, console NASA, capsule de sommeil, vivres, eau, sas), couloirs vers la **pépinière** (3 bacs), le **purificateur** et le **contrôle solaire**.
- **Survie** : faim, hydratation, sommeil. Manger (−10 vivres, +40), boire (−10 eau, +40), récolter (+14 vivres, recharge 45 s), purifier (+14 eau, 25 s), vérifier les panneaux (+10 énergie, +35 % de rendement 60 s), **dormir** (−6 vivres/−6 eau, sol suivant, sommeil 100 %).
- Besoins bas : déplacement ralenti puis santé qui baisse.

---

## 8. Contrôles

| Action | Commande |
|---|---|
| Choisir un module | Clic sur une carte du dock |
| Placer | Souris (fantôme vert/rouge) puis clic sur une case — fonctionne au tactile |
| Annuler | `Échap`, clic droit ou « Annuler » |
| Tourner / incliner | Glisser sur le fond |
| Zoomer | Molette |
| Sélectionner un module posé | Clic sur le module 3D |
| Améliorer / démonter | Panneau de sélection à droite |
| Améliorer un bâtiment d'origine | Clic sur le bâtiment 3D ou sa carte du dock |
| QCM / Série QCM | Boutons 🎓 et ✨ |
| Retour au système solaire | Bouton 🚀 Espace |
| Atterrissage direct (démo) | Touche `L` depuis l'espace |

---

## 9. Sauvegarde

- Clé `localStorage` : `infectium.save.v3` — immédiate à chaque action + toutes les 4 s + à la fermeture.
- Au rechargement, niveaux, modules, ressources et palier sont restaurés dès l'atterrissage.
- `sessionStorage` mémorise que la cinématique d'entrée a déjà été vue ; reprise instantanée.
- « Nouvelle mission » efface la sauvegarde et relance le déploiement.

---

## 10. Fichiers

| Fichier | Rôle |
|---|---|
| `src/game/types.ts` | Types du domaine |
| `src/game/buildings.ts` | Catalogue, paliers, coûts, grille |
| `src/game/grid.ts` | Empreintes, collisions, placement |
| `src/game/sim.ts` | Ressources, jour/nuit, radiations, actions, sauvegarde |
| `src/engine/lunar/LunarBaseScene.ts` | Site lunaire, terrain, caméra, chorégraphie d'entrée |
| `src/engine/lunar/BuildingBase.ts` | Assemblage mécanique, niveaux 1→4, ports d'amarrage |
| `src/engine/lunar/buildings/*.ts` | Hub, Solar, Purifier, Nursery détaillés |
| `src/engine/lunar/CorridorSystem.ts` | Couloirs pressurisés entre modules |
| `src/engine/astronaut.ts` | Caméra 3ᵉ personne, intérieurs, interactions, collisions |
| `src/engine/controls.ts` | Réglages des commandes (sensibilité, joysticks) |
| `src/engine/lunarGrid.ts` | Plateau quadrillé, modules du catalogue, fantôme, sélection |
| `src/engine/solarSystem.ts` | Système solaire, voyage, bascule vers le site lunaire |
| `src/components/*` | HUD, dock, QCM, panneaux, bannières |

Tests logiques : `npx tsx scripts/simtest.ts` — 42 vérifications (placement, collisions, coûts, paliers, jour/nuit, radiations, échec, stockage, faim/soif/sommeil, récolte).

---

# V36 — Gestion de mission approfondie

## ⚡ Réseau électrique et priorités

Chaque module demande une puissance (`powerDraw × niveau`, légèrement augmentée par l'usure).
La production vient des panneaux solaires (dépend du jour lunaire), de l'atelier et de la centrale.
Les batteries (réserve d'énergie stockée) peuvent fournir un appoint limité.

L'électricité est distribuée **par priorité** :

| Priorité | Comportement |
|---|---|
| **Vitale** | Servie en premier (survie de l'équipage, eau, recyclage, abri) |
| **Normale** | Servie ensuite (nourriture, serre, réserves) |
| **Économie** | Servie en dernier (labo, garage, réservoir) |

Un module sous-alimenté voit son rendement chuter jusqu'à 40 % : il produit moins, protège moins, et s'use plus vite.
Le joueur peut changer la priorité de chaque module dans **🛠 Gestion de mission → Énergie**.

## 🔧 Usure et maintenance

Chaque module s'use en continu. L'usure réduit le rendement (jusqu'à −45 %) et augmente la demande électrique.
Une **réparation locale** coûte des points et 6 unités d'énergie, et restaure 50 % d'usure. C'est immédiat : c'est le cœur de l'autonomie de l'équipage.

## ☀️ Radiations et tempêtes

- Une éruption solaire (aléatoire ou issue de DONKI) fait monter `spike`.
- À partir de 25, une **alerte radiations** s'affiche et la tâche devient risquée.
- **Sortir pendant une éruption** augmente fortement l'exposition et coûte de la santé.
- Rester dans le **hub** ou un **abri** réduit l'exposition.
- Les boucliers (`shelter`, `shieldgen`) réduisent l'exposition, mais consomment de l'électricité : protection ≠ gratuité.

## 📡 Liaison Terre

Quatre demandes, chacune avec un effet réel et un coefficient de délai :

| Demande | Effet à la réception |
|---|---|
| 🛠️ Diagnostic | Répare 50 % de l'usure du module le plus abîmé |
| 🩺 Médical | +30 santé, +20 sommeil |
| 📦 Largage | +18 nourriture, +18 eau, +12 oxygène |
| ☀️ Météo spatiale | Éruption −25, panneaux optimisés 90 s |

- Délai réel affiché : `2 × distance / vitesse de la lumière` (≈ 2,56 s Terre-Lune).
- Délai de jeu : délai réel × 12 × coefficient du type × perturbation solaire, minimum 20 s.
- File limitée à 2 demandes ; préparer une transmission coûte 10 points de sommeil.
- Une réponse arrivée alors que la situation est déjà critique est signalée **tardive**.
- Tout est conservé dans l'historique des communications.

L'ennemi n'est pas la lenteur : c'est l'impréparation. Le joueur doit anticiper et savoir réparer sans la Terre.

## 🎯 Objectifs et carnet de bord

- **8 objectifs** mesurent la survie, l'équilibre énergétique, l'alimentation, les radiations, la résistance aux tempêtes, l'autonomie, la liaison Terre et le recyclage.
- Chaque objectif validé rapporte des points et affiche une explication (« pourquoi c'est important »).
- **12 fiches de carnet** se débloquent en vivant les situations (première nuit, première coupure, première tempête, première réparation…). Elles expliquent la science réelle derrière le jeu.

## 📊 Interface de gestion

- Courbes d'évolution des réserves dans le HUD (60 dernières secondes).
- Jauge de couverture électrique, alertes de délestage et de tempête.
- Panneau **Gestion de mission** : énergie/modules, liaison Terre, objectifs, carnet.

---

# V37 — Trois modes et temps persistant

## 🎛 Les trois modes

| Mode | Temps | NASA | Fin de mission | Hors-ligne |
|---|---|---|---|---|
| **Mission réelle** 🛰️ | réglable (défaut 1 h réelle = 2 h de jeu) | oui | durée choisie (0 = illimitée) | **la base continue de vivre, rattrapage calculé** |
| **Junior Explorer** 🌙 | jour lunaire en 4 min | oui | non (survie) | pause |
| **Practice** 🧪 | jour lunaire en 4 min | **désactivée** | jamais (santé plancher) | pause |

Le mode se choisit au lancement, et se change à tout moment via **🎛 Temps & mode**.

## ⏱ Temps de mission

- Le moteur travaille en « secondes de simulation » : 240 sim s = 1 jour de mission (24 h).
- **RÉEL** : le rapport est choisi par le joueur (×2 par défaut, ×6, ×12, ×30, ×60).
  Avec ×2, une journée de mission dure **12 h réelles** ; 12 h d'absence représentent 24 h de mission.
- On choisit aussi le **sol de départ**, la **date de départ** et la **durée de mission** (7/14/30 sols ou illimitée).
- En mode RÉEL, l'interface ne met pas la simulation en pause : le temps continue pendant les QCM et les panneaux.

## 💾 Sauvegarde complète et rattrapage hors-ligne

La sauvegarde (`infectium.save.v4`) conserve l'état complet : ressources, capacités,
bâtiments (niveau, priorité, usure), temps de mission, événements en cours (éruption),
communications et historique, objectifs, carnet, statistiques, mode et réglages de temps,
plus l'**horodatage de la dernière activité**.

Au retour, si le mode est RÉEL :
1. le temps réel écoulé est converti en temps de mission ;
2. la simulation est rejouée par pas de 30 minutes de jeu (plafond : 60 jours) ;
3. un **rapport d'absence** affiche : durée réelle et de mission, sols traversés,
   ressources avant/après et minimums atteints, temps de délestage, modules tombés
   en panne, éruptions solaires, évolution de la santé et avertissements.

Rien ne « tourne » en arrière-plan : tout est calculé au retour, de façon déterministe
vis-à-vis de l'état sauvegardé.

## 🔄 Migration

Les anciennes sauvegardes v3 sont lues, converties en v4 et conservées : la progression
n'est pas perdue.
