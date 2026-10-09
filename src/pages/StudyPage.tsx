import { useState, useEffect, useCallback, useRef } from 'react';
import { Word, Feedback, LearnedWord } from '../types';
import { getDueReviewWordIds, getTimedReminderWords } from '../utils/schedule';
import { getNow } from '../utils/time';
import WordCard from '../components/WordCard';
import ReminderModal from '../components/ReminderModal';

type SessionPhase = 'review' | 'new' | 'done';

interface StudyPageProps {
  wordbank: Word[];
  learnedWords: LearnedWord[];
  totalLearnedCount: number;
  dailyNewCount: number;
  simulatedTime: number | null;
  todayReviewDone: boolean;
  todayNewDone: boolean;
  onFeedback: (wordId: string, feedback: Feedback) => void;
  onReviewComplete: (wordIds: string[]) => void;
  onNewComplete: () => void;
  onMarkWordsLearned: (wordIds: string[]) => void;
}

function buildInitialSession(
  wordbank: Word[],
  learnedWords: LearnedWord[],
  totalLearnedCount: number,
  dailyNewCount: number,
  now: number,
  todayReviewDone: boolean,
  todayNewDone: boolean,
): { phase: SessionPhase; queue: Word[]; sessionWordIds: string[] } {
  const reviewWordIds = getDueReviewWordIds(learnedWords, now);
  const hasReview = reviewWordIds.length > 0 && !todayReviewDone;
  const hasNew = totalLearnedCount < wordbank.length && !todayNewDone;

  if (hasReview) {
    const queue = reviewWordIds.map(id => wordbank.find(w => w.id === id)).filter(Boolean) as Word[];
    return { phase: 'review', queue, sessionWordIds: reviewWordIds };
  }
  if (hasNew) {
    const ids = wordbank.slice(totalLearnedCount, totalLearnedCount + dailyNewCount).map(w => w.id);
    const queue = ids.map(id => wordbank.find(w => w.id === id)).filter(Boolean) as Word[];
    return { phase: 'new', queue, sessionWordIds: ids };
  }
  return { phase: 'done', queue: [], sessionWordIds: [] };
}

export default function StudyPage({
  wordbank,
  learnedWords,
  totalLearnedCount,
  dailyNewCount,
  simulatedTime,
  todayReviewDone,
  todayNewDone,
  onFeedback,
  onReviewComplete,
  onNewComplete,
  onMarkWordsLearned,
}: StudyPageProps) {
  const now = getNow(simulatedTime);

  const initial = buildInitialSession(
    wordbank, learnedWords, totalLearnedCount, dailyNewCount, now, todayReviewDone, todayNewDone
  );

  const [phase, setPhase] = useState<SessionPhase>(initial.phase);
  const [queue, setQueue] = useState<Word[]>(initial.queue);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [forgotIds, setForgotIds] = useState<string[]>([]);
  const [pass, setPass] = useState(1);
  const [sessionWordIds] = useState<string[]>(initial.sessionWordIds);
  const [reminderModal, setReminderModal] = useState<{ type: '30min' | '12hr'; wordIds: string[] } | null>(null);
  const [reminderDismissed, setReminderDismissed] = useState(false);
  // Bumped whenever the queue is replaced outside handleFeedback (e.g. reminder
  // review), so WordCard remounts and resets its internal flip state (AC-1).
  const [cardEpoch, setCardEpoch] = useState(0);

  // Mark new words as learned on mount when starting in 'new' phase
  const markedNewRef = useRef(false);
  useEffect(() => {
    if (phase === 'new' && !markedNewRef.current && initial.sessionWordIds.length > 0) {
      markedNewRef.current = true;
      onMarkWordsLearned(initial.sessionWordIds);
    }
  }, []); // intentionally empty — run only on mount

  // In-page timed reminder check (every 30s)
  useEffect(() => {
    if (reminderDismissed) return;
    const check = () => {
      const nowTs = getNow(simulatedTime);
      const timedWords = getTimedReminderWords(learnedWords, nowTs);
      if (timedWords.length > 0 && !reminderModal) {
        const has30 = timedWords.some(w => {
          const due30 = w.learnedAt + 30 * 60 * 1000;
          return !w.reviewedNodes.includes('30min') && due30 <= nowTs;
        });
        setReminderModal({
          type: has30 ? '30min' : '12hr',
          wordIds: timedWords.map(w => w.wordId),
        });
      }
    };
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [simulatedTime, learnedWords, reminderDismissed, reminderModal]);

  const handleFeedback = useCallback((feedback: Feedback) => {
    const word = queue[currentIndex];
    onFeedback(word.id, feedback);

    const newForgotIds = feedback === 'forgot' ? [...forgotIds, word.id] : forgotIds;
    const isLast = currentIndex === queue.length - 1;

    if (!isLast) {
      if (feedback === 'forgot') setForgotIds(newForgotIds);
      setCurrentIndex(i => i + 1);
      return;
    }

    // End of this pass
    if (newForgotIds.length > 0) {
      const forgotWords = newForgotIds
        .map(id => wordbank.find(w => w.id === id))
        .filter(Boolean) as Word[];
      setQueue(forgotWords);
      setCurrentIndex(0);
      setForgotIds([]);
      setPass(p => p + 1);
      return;
    }

    // Phase complete — advance
    if (phase === 'review') {
      onReviewComplete(sessionWordIds);
      const reviewWordIds = getDueReviewWordIds(learnedWords, now);
      const hasNew = totalLearnedCount < wordbank.length && !todayNewDone;
      if (hasNew) {
        const ids = wordbank.slice(totalLearnedCount, totalLearnedCount + dailyNewCount).map(w => w.id);
        const newQueue = ids.map(id => wordbank.find(w => w.id === id)).filter(Boolean) as Word[];
        setPhase('new');
        setQueue(newQueue);
        setCurrentIndex(0);
        setForgotIds([]);
        setPass(1);
        markedNewRef.current = true;
        onMarkWordsLearned(ids);
      } else {
        setPhase('done');
        onNewComplete();
      }
    } else if (phase === 'new') {
      onNewComplete();
      setPhase('done');
    }
  }, [queue, currentIndex, forgotIds, phase, sessionWordIds, wordbank, learnedWords, totalLearnedCount, dailyNewCount, todayNewDone, now, onFeedback, onReviewComplete, onNewComplete, onMarkWordsLearned]);

  if (phase === 'done') return null;

  const currentWord = queue[currentIndex];
  if (!currentWord) return null;

  return (
    <div className="min-h-[calc(100vh-56px)] flex flex-col">
      {/* Phase header */}
      <div className="px-5 pt-8 pb-2 max-w-sm mx-auto w-full">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] uppercase tracking-widest font-semibold ${
            phase === 'review' ? 'text-teal-500' : 'text-indigo-500'
          }`}>
            {phase === 'review' ? '复习' : '新词'}
          </span>
          {pass > 1 && (
            <span className="text-[11px] bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full">
              第 {pass} 遍
            </span>
          )}
        </div>
      </div>

      {/* Card area */}
      <div className="flex-1 flex items-start justify-center px-5 pt-4 pb-10">
        <div className="w-full max-w-sm">
          <WordCard
            key={`${cardEpoch}-${currentWord.id}`}
            word={currentWord}
            cardIndex={currentIndex}
            totalCards={queue.length}
            passLabel={pass > 1 ? `第${pass}遍` : undefined}
            onFeedback={handleFeedback}
            isReview={phase === 'review'}
          />
        </div>
      </div>

      {/* Timed reminder modal */}
      {reminderModal && (
        <ReminderModal
          type={reminderModal.type}
          wordCount={reminderModal.wordIds.length}
          onReview={() => {
            const words = reminderModal.wordIds
              .map(id => wordbank.find(w => w.id === id))
              .filter(Boolean) as Word[];
            setCardEpoch(e => e + 1);
            setQueue(words);
            setCurrentIndex(0);
            setForgotIds([]);
            setReminderModal(null);
            onReviewComplete(reminderModal.wordIds);
          }}
          onDismiss={() => {
            setReminderModal(null);
            setReminderDismissed(true);
          }}
        />
      )}
    </div>
  );
}
