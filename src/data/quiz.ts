// Banque de 40 questions — voir quiz-40.md (racine du projet) pour la version lisible/éditable.
export interface QuizQuestion {
  id: number;
  question: string;
  choices: string[];
  correctIndex: number;
  points: number;
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  { id: 1, question: "Qui a été le premier homme à marcher sur la Lune ?", choices: ["Neil Armstrong", "Buzz Aldrin", "Youri Gagarine", "John Glenn"], correctIndex: 0, points: 10 },
  { id: 2, question: "En quelle année l'homme a-t-il marché sur la Lune pour la première fois ?", choices: ["1959", "1969", "1979", "1989"], correctIndex: 1, points: 10 },
  { id: 3, question: "Comment s'appelait la mission qui a emmené les premiers hommes sur la Lune ?", choices: ["Apollo 11", "Apollo 1", "Gemini 7", "Artemis 1"], correctIndex: 0, points: 10 },
  { id: 4, question: "Quelle est la planète la plus proche du Soleil ?", choices: ["Vénus", "Mercure", "Mars", "Terre"], correctIndex: 1, points: 10 },
  { id: 5, question: "Combien de planètes compte notre système solaire ?", choices: ["7", "8", "9", "10"], correctIndex: 1, points: 10 },
  { id: 6, question: "Quelle planète est surnommée la \"planète rouge\" ?", choices: ["Jupiter", "Vénus", "Mars", "Saturne"], correctIndex: 2, points: 10 },
  { id: 7, question: "Quelle est la plus grosse planète du système solaire ?", choices: ["Saturne", "Jupiter", "Neptune", "Uranus"], correctIndex: 1, points: 10 },
  { id: 8, question: "Quel astre tourne autour de la Terre ?", choices: ["Le Soleil", "La Lune", "Mars", "Une étoile"], correctIndex: 1, points: 10 },
  { id: 9, question: "Comment appelle-t-on une personne qui voyage dans l'espace ?", choices: ["Pilote", "Astronaute", "Explorateur", "Scientifique"], correctIndex: 1, points: 10 },
  { id: 10, question: "De quoi a besoin un astronaute pour respirer dans l'espace ?", choices: ["D'eau", "D'oxygène", "De lumière", "De nourriture"], correctIndex: 1, points: 10 },
  { id: 11, question: "Quelle agence spatiale américaine envoie des fusées dans l'espace ?", choices: ["ESA", "NASA", "ROSCOSMOS", "JAXA"], correctIndex: 1, points: 10 },
  { id: 12, question: "Combien de temps met la Terre pour faire le tour du Soleil ?", choices: ["1 jour", "1 mois", "1 an", "10 ans"], correctIndex: 2, points: 10 },
  { id: 13, question: "Combien de temps met la Lune pour tourner autour de la Terre ?", choices: ["1 jour", "environ 1 mois", "1 an", "1 semaine"], correctIndex: 1, points: 15 },
  { id: 14, question: "Qu'est-ce qu'une étoile filante ?", choices: ["Une planète", "Un morceau de roche qui brûle dans l'atmosphère", "Une étoile qui tombe", "Un satellite cassé"], correctIndex: 1, points: 15 },
  { id: 15, question: "Quel gaz respirons-nous principalement pour vivre ?", choices: ["Dioxyde de carbone", "Hydrogène", "Oxygène", "Azote"], correctIndex: 2, points: 10 },
  { id: 16, question: "Quelle est la première femme à être allée dans l'espace ?", choices: ["Valentina Terechkova", "Sally Ride", "Mae Jemison", "Peggy Whitson"], correctIndex: 0, points: 15 },
  { id: 17, question: "Comment s'appelle la galaxie dans laquelle se trouve la Terre ?", choices: ["Andromède", "La Voie Lactée", "Le Triangle", "La Galaxie du Sombrero"], correctIndex: 1, points: 15 },
  { id: 18, question: "Quelle planète a des anneaux très célèbres ?", choices: ["Mars", "Jupiter", "Saturne", "Mercure"], correctIndex: 2, points: 10 },
  { id: 19, question: "Qu'est-ce qu'un cratère sur la Lune ?", choices: ["Un lac", "Un trou formé par un impact", "Une montagne", "Un volcan en activité"], correctIndex: 1, points: 15 },
  { id: 20, question: "Pourquoi flotte-t-on dans une station spatiale ?", choices: ["Il n'y a pas d'air", "À cause de l'apesanteur (micro-gravité)", "Il n'y a pas de sol", "Parce qu'il fait froid"], correctIndex: 1, points: 15 },
  { id: 21, question: "Quel est le nom de la station spatiale où vivent des astronautes aujourd'hui ?", choices: ["Station Mir", "Station Spatiale Internationale (ISS)", "Skylab", "Artemis Base"], correctIndex: 1, points: 15 },
  { id: 22, question: "Combien de temps la lumière du Soleil met-elle pour arriver sur Terre ?", choices: ["Environ 8 minutes", "Environ 8 secondes", "Environ 8 heures", "Environ 8 jours"], correctIndex: 0, points: 20 },
  { id: 23, question: "Quelle est la source d'énergie principale pour les panneaux solaires ?", choices: ["La Lune", "Le vent", "Le Soleil", "Les étoiles"], correctIndex: 2, points: 10 },
  { id: 24, question: "Quel est le nom du programme spatial qui veut ramener l'homme sur la Lune aujourd'hui ?", choices: ["Apollo 2", "Artemis", "Orion 2", "Gemini 2"], correctIndex: 1, points: 15 },
  { id: 25, question: "Vrai ou faux : sur la Lune, un astronaute pèse moins lourd que sur Terre.", choices: ["Vrai", "Faux"], correctIndex: 0, points: 10 },
  { id: 26, question: "Pourquoi les plantes ont-elles besoin d'eau dans une base spatiale ?", choices: ["Pour décorer", "Pour survivre et produire de la nourriture/oxygène", "Pour refroidir la base", "Pour faire de l'électricité"], correctIndex: 1, points: 10 },
  { id: 27, question: "Quel gaz les plantes rejettent-elles grâce à la lumière (photosynthèse) ?", choices: ["Dioxyde de carbone", "Azote", "Oxygène", "Hydrogène"], correctIndex: 2, points: 15 },
  { id: 28, question: "Qu'est-ce que les radiations dans l'espace peuvent être dangereuses pour ?", choices: ["Les ordinateurs seulement", "La santé des astronautes", "Rien du tout", "Les plantes seulement"], correctIndex: 1, points: 15 },
  { id: 29, question: "Comment protège-t-on les astronautes des radiations spatiales ?", choices: ["Avec de la lumière", "Avec un blindage/abri spécial", "Avec de l'eau froide", "On ne peut pas"], correctIndex: 1, points: 15 },
  { id: 30, question: "Quelle planète est connue pour avoir deux petites lunes, Phobos et Déimos ?", choices: ["Mars", "Vénus", "Mercure", "Neptune"], correctIndex: 0, points: 20 },
  { id: 31, question: "Quel est le nom du robot envoyé par la NASA qui explore actuellement Mars ?", choices: ["Opportunity", "Perseverance", "Sojourner", "Spirit"], correctIndex: 1, points: 15 },
  { id: 32, question: "Combien de temps dure environ une journée sur Mars (un \"sol\") ?", choices: ["Environ 12 heures", "Environ 24h40", "Environ 48 heures", "Environ 10 jours"], correctIndex: 1, points: 20 },
  { id: 33, question: "Que doit-on recycler dans une base spatiale pour économiser l'eau ?", choices: ["Les déchets alimentaires", "L'eau usée (douche, urine traitée)", "Les vêtements", "Rien, on jette tout"], correctIndex: 1, points: 15 },
  { id: 34, question: "Quelle planète est la plus chaude du système solaire, à cause de son atmosphère ?", choices: ["Mercure", "Vénus", "Mars", "Jupiter"], correctIndex: 1, points: 20 },
  { id: 35, question: "Qu'est-ce qu'un satellite ?", choices: ["Une étoile", "Un objet qui tourne autour d'une planète", "Un type de fusée", "Un astronaute"], correctIndex: 1, points: 10 },
  { id: 36, question: "Quel a été le premier être vivant envoyé en orbite autour de la Terre ?", choices: ["Un chien (Laïka)", "Un chat", "Un singe", "Un humain"], correctIndex: 0, points: 15 },
  { id: 37, question: "Pourquoi une fusée a-t-elle besoin de plusieurs étages ?", choices: ["Pour être plus jolie", "Pour se débarrasser du poids inutile en montant", "Pour aller plus lentement", "Pour faire du bruit"], correctIndex: 1, points: 20 },
  { id: 38, question: "Quel est le nom de notre étoile, au centre du système solaire ?", choices: ["La Lune", "Le Soleil", "Sirius", "Polaris"], correctIndex: 1, points: 10 },
  { id: 39, question: "Quelle planète est surnommée \"la jumelle de la Terre\" à cause de sa taille ?", choices: ["Mars", "Vénus", "Mercure", "Uranus"], correctIndex: 1, points: 15 },
  { id: 40, question: "Qu'est-ce qui permet à une base lunaire de produire de l'oxygène respirable ?", choices: ["De la magie", "Un régénérateur d'air / extraction chimique", "Rien, on apporte tout de la Terre", "Le vent lunaire"], correctIndex: 1, points: 15 },
];
