# INFECTIUM — Cahier des charges (source unique, mise à jour en place)

> Ce fichier est LA référence unique du projet. Il remplace toute version précédente :
> chaque modification écrase ce qui est obsolète, on ne garde pas d'anciennes versions en parallèle.
> Temps restant au moment de cette rédaction : ~35h.

---

> **Implémentation V3 (gameplay)** : le placement se fait désormais sur une **grille délimitée** (16×16 → 24×24) avec empreintes et collisions — voir `GAMEPLAY.md`, qui fait foi pour les règles, coûts et formules. Les sections « placement libre » ci-dessous sont conservées comme historique de conception.

---

## 1. Séquence d'ouverture (atterrissage)

1. La fusée se pose. Caméra stabilisée, **face à la fusée** (pas de vue du dessus, pas de mouvement de caméra gênant/instable comme actuellement).
2. Référence visuelle : science-fiction classique façon film d'atterrissage.
3. Une porte s'ouvre, fumée s'échappe.
4. Un personnage sort.
5. Transition en vue subjective : la caméra **devient les yeux du personnage** (vision première personne), pas juste "il possède" la base — c'est littéralement ce que le personnage voit.
6. Le joueur découvre alors la base, **abandonnée** (pas défaillante, juste laissée à l'abandon).
7. Le joueur commence ensuite à la réparer / améliorer progressivement.

Animation et entrée actuelles conservées comme base de travail ; on ajuste cette séquence par-dessus, sans tout refaire.

## 2. Terrain et placement des bâtiments

- Placement **libre**, pas de quadrillage façon Clash Royale (trop risqué à bien faire en 48h → abandonné).
- Seule contrainte : le **périmètre** de chaque bâtiment, pour éviter que deux bâtiments se chevauchent/se confondent.
- Bâtiments déplaçables et amovibles (glisser-déposer).

## 3. Bâtiments par niveau (paliers, pas "niveaux d'un même bâtiment")

Chaque palier débloque un **ensemble** de bâtiments (série), pas une amélioration individuelle par bâtiment.

- **Palier 1** (confirmé) :
  1. Base centrale
  2. Pépinière
  3. Purificateur d'eau
  4. Régénérateur d'air
  5. Plateforme/atelier de forge, lié à la fusée, qui sert aussi de point de **connexion entre les bâtiments** (câbles/routes partent de là)

### Paliers suivants (proposition à valider — rien n'est acté ici)

> Rédigé à titre de proposition initiale, comme demandé. À corriger/valider avant implémentation.

- **Palier 2** (proposition) :
  1. Serre agricole avancée (augmente la production alimentaire)
  2. Réservoir d'eau de secours
  3. Abri anti-radiations (protection de l'équipage)
  4. Laboratoire scientifique (débloque des bonus de points quiz)
- **Palier 3** (proposition) :
  1. Centrale énergétique (panneaux solaires + batteries, remplace/complète l'alimentation de base)
  2. Garage / rover (exploration, accès à de nouvelles zones du terrain)
  3. Système de recyclage avancé (eau + air combinés, réduit la consommation)
  4. Bouclier / blindage radiations renforcé (réduit l'exposition aux radiations de la base entière)

## 4. Progression par quiz (QCM)

- Monter de palier / améliorer les bâtiments / débloquer des ressources = répondre à des **questions à choix multiples** sur l'astronomie/l'espace.
- Chaque question a un **coût/valeur en points** (logique de quota : on accumule des points via les bonnes réponses).
- Une fois un seuil de points atteint → déblocage palier suivant / amélioration / achat de ressources.
- Public cible : enfants 7-12 ans → questions simples, pédagogiques (ex : qui est Armstrong, date du premier alunissage, etc.).
- Logique volontairement simple : **pas d'IA, pas de base de données, pas de backend lourd** pour ce prototype. Doit rester un prototype simple mais "digne de la NASA" dans la présentation/qualité.

### Banque de 40 questions à préparer (7-12 ans, thème espace)
→ À livrer dans un fichier dédié (ex. `quiz-40.md` ou `.json`), avec pour chaque question : énoncé, choix multiples, bonne réponse, valeur en points.

## 5. Ressources et indicateurs à afficher

Mis en évidence en temps réel :
- Consommation **O2**
- Consommation **H2O** (par les plantes ET par le joueur)
- Consommation d'**énergie** (temps réel)
- **Radiations** (exposition/niveau de radiation, à mettre en évidence au même titre que H2O/O2/énergie — rappel explicite de l'utilisateur)
- Ressources alimentaires produites par la pépinière / alimentation du joueur
- Réserves/conserves (stock de nourriture en conserve)
- **Scores** : suivi de l'évolution de chaque ressource dans le temps

## 6. Message système (style Solo Leveling)

- Reprendre **à la lettre** l'animation des messages système de l'anime *Solo Leveling* (apparition de la fenêtre système que voit Jinwoo).
- Sens d'ouverture confirmé : **du haut vers le bas**.
- Avec effet de **glitch pixelisé** + **son** (bruitage "cliché"/notification système), comme demandé précédemment.
- Pas de logo d'équipe pour l'instant (abandonné, "laisse tomber").

## 7. Performance

- L'animation actuelle est jugée lourde pour un ordinateur (CPU/charge).
- **Reporté à plus tard** : pas de contrainte NASA là-dessus, donc pas urgent.
- On essaiera d'améliorer progressivement, mais la priorité absolue reste d'avoir un **prototype fonctionnel**.

## 8. Règles de travail pour cette conversation

- Pas de zip, pas de modification de code tant que ce n'est pas explicitement demandé — on communique et on cadre d'abord.
- Seuls fichiers autorisés à être créés pour l'instant : des fichiers **MD/TXT de notes** (comme celui-ci), pas de code.
- Ce fichier est **la seule version valable** : toute nouvelle instruction qui modifie un point ci-dessus doit **remplacer** la section concernée ici (pas de doublon, pas d'ancienne version qui traîne), pour éviter les conflits entre "ce qu'on pensait faire" et "ce qu'on a décidé après".

---

## Historique des décisions déjà actées (hors sujets ci-dessus, pour mémoire)

- Stack : React + Vite + TypeScript, pnpm, scène Three.js convertie depuis l'index.html d'origine.
- Terrain lunaire à l'échelle réelle après atterrissage (grand sol, cratères, horizon, Terre visible) — la base n'occupe qu'une partie du terrain.
- Fonctions bâtiments voulues (en plus du placement libre) : pivoter, ranger/démolir avec récupération, boutique de bâtiments, câbles/routes entre bâtiments.

## Points encore ouverts / à préciser avec l'utilisateur

1. Valider ou corriger la proposition des paliers 2 et 3 ci-dessus.
2. Barème exact points-par-question / seuils de déblocage.
3. Détails exacts des "petits détails qui servent plus à rien" (finitions prévues tout à la fin).
4. Ordre de priorité de mise en œuvre non confirmé clairement — à reconfirmer (séquence d'atterrissage / placement libre / message système / quiz+points) ; en attendant on avance sur la spec et le contenu (quiz) qui ne dépendent pas de ce choix.
