import { useState } from 'react';
import { QuizQuestion } from '../data/quiz';

export interface QuizAnswerView {
  correct: boolean;
  gained: number;
  detail: string;
}

interface Props {
  question: QuizQuestion;
  title: string;
  subtitle?: string;
  answer: QuizAnswerView | null;
  onAnswer: (correct: boolean) => void;
  onClose: () => void;
  closeLabel?: string;
}

export default function QuizModal({
  question,
  title,
  subtitle,
  answer,
  onAnswer,
  onClose,
  closeLabel = 'Continuer',
}: Props) {
  const [selected, setSelected] = useState<number | null>(null);

  function choose(i: number) {
    if (answer) return;
    setSelected(i);
    onAnswer(i === question.correctIndex);
  }

  return (
    <div className="quiz-overlay">
      <div className="quiz-card">
        <div className="quiz-header">
          <span className="quiz-mission">🎓 MISSION QCM</span>
          <span>{title}</span>
        </div>
        {subtitle && <p className="quiz-subtitle">{subtitle}</p>}
        <p className="quiz-question">{question.question}</p>
        <div className="quiz-choices">
          {question.choices.map((choice, i) => {
            let cls = 'quiz-choice';
            if (answer) {
              if (i === question.correctIndex) cls += ' quiz-correct';
              else if (i === selected) cls += ' quiz-wrong';
            }
            return (
              <button key={i} className={cls} onClick={() => choose(i)} disabled={!!answer}>
                <span className="quiz-letter">{String.fromCharCode(65 + i)}</span>
                {choice}
              </button>
            );
          })}
        </div>

        {answer && (
          <div className={`quiz-feedback ${answer.correct ? 'ok' : 'ko'}`}>
            <strong>
              {answer.correct ? `✅ Bonne réponse ! ${answer.gained > 0 ? `+${answer.gained} pts` : ''}` : '❌ Pas cette fois.'}
            </strong>
            <span>{answer.detail}</span>
          </div>
        )}

        <div className="quiz-footer">
          <span className="quiz-value">Valeur : {question.points} pts</span>
          {answer && (
            <button className="quiz-close" onClick={onClose}>
              {closeLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
