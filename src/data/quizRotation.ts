import { QUIZ_QUESTIONS, QuizQuestion } from './quiz';

// =========================================================================
// Rotation des 40 questions — un seul passage par cycle, sans répétition.
// · mélange uniforme (Fisher-Yates), pas de tri aléatoire biaisé
// · une question n'est reposée qu'après épuisement du cycle complet
// · l'ordre restant est conservé dans sessionStorage : un rafraîchissement
//   d'interface ou de page ne relance pas la banque à zéro
// =========================================================================

export interface QuizRotationStore {
  read: () => number[] | null;
  write: (ids: number[]) => void;
}

export function createSessionQuizStore(key: string): QuizRotationStore {
  return {
    read: () => {
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as number[]) : null;
      } catch {
        return null;
      }
    },
    write: (ids: number[]) => {
      try {
        sessionStorage.setItem(key, JSON.stringify(ids));
      } catch {
        /* stockage indisponible : la rotation reste en mémoire */
      }
    },
  };
}

export function shuffleQuestions<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class QuizRotation {
  private queue: QuizQuestion[] = [];
  private lastId: number | null = null;

  constructor(private store?: QuizRotationStore) {
    const saved = store?.read() ?? null;
    if (saved && saved.length > 0) {
      this.queue = saved
        .map((id) => QUIZ_QUESTIONS.find((q) => q.id === id))
        .filter((q): q is QuizQuestion => !!q);
      this.lastId = this.queue[this.queue.length - 1]?.id ?? null;
    }
  }

  /** Nombre de questions encore jamais posées dans le cycle courant. */
  get remaining(): number {
    return this.queue.length;
  }

  /** Tire la prochaine question ; démarre un nouveau cycle si nécessaire. */
  draw(): QuizQuestion {
    if (this.queue.length === 0) {
      // Banque dédupliquée par id, mélangée au début du cycle.
      const bank = Array.from(new Map(QUIZ_QUESTIONS.map((q) => [q.id, q])).values());
      const deck = shuffleQuestions(bank);
      // Évite d'enchaîner deux cycles sur la même question.
      if (deck.length > 1 && deck[deck.length - 1].id === this.lastId) {
        [deck[deck.length - 1], deck[0]] = [deck[0], deck[deck.length - 1]];
      }
      this.queue = deck;
    }
    const question = this.queue.pop()!;
    this.lastId = question.id;
    this.store?.write(this.queue.map((q) => q.id));
    return question;
  }

  reset(): void {
    this.queue = [];
    this.lastId = null;
    this.store?.write([]);
  }
}
