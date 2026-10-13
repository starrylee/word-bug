import { useState, useEffect, useCallback, useRef } from 'react';
import { Word, Feedback, FeedbackListId, LearnedWord, NewWordBatch } from '../types';
import { DailyPhase, planDailySession, planNewPhase } from '../utils/daily';
import { getNow } from '../utils/time';
import WordCard from '../components/WordCard';

/** FT-005-US-06：App 层提醒弹窗点"现在复习"后注入的定时复习队列（epoch 递增驱动替换） */
export interface InjectedReview {
  wordIds: string[];
  epoch: number;
}

interface StudyPageProps {
  wordbank: Word[];
  learnedWords: LearnedWord[];
  totalLearnedCount: number;
  dailyNewCount: number;
  simulatedTime: number | null;
  todayReviewDone: boolean;
  todayNewDone: boolean;
  currentNewBatch: NewWordBatch | null;
  /** FT-005-US-06：注入的定时复习队列；非 null 时本次会话以它为复习队列（含"今日已完成"态下重新进入） */
  injectedReview: InjectedReview | null;
  onInjectedReviewDone: () => void;
  onFeedback: (wordId: string, feedback: Feedback, list: FeedbackListId) => void;
  onReviewComplete: (wordIds: string[]) => void;
  onNewComplete: () => void;
  onMarkWordsLearned: (wordIds: string[]) => void;
  onStartNewBatch: (wordIds: string[]) => void;
}

function toWords(wordbank: Word[], ids: string[]): Word[] {
  return ids.map(id => wordbank.find(w => w.id === id)).filter(Boolean) as Word[];
}

export default function StudyPage({
  wordbank,
  learnedWords,
  totalLearnedCount,
  dailyNewCount,
  simulatedTime,
  todayReviewDone,
  todayNewDone,
  currentNewBatch,
  injectedReview,
  onInjectedReviewDone,
  onFeedback,
  onReviewComplete,
  onNewComplete,
  onMarkWordsLearned,
  onStartNewBatch,
}: StudyPageProps) {
  const now = getNow(simulatedTime);

  // FT-005-US-03：打开网站时的当日编排——先复习后新词（AC-1），
  // 无复习直入新词（AC-2），都无则 done（AC-3，App 侧由 CompletedPage 兜底）。
  // FT-005-US-06：有注入的定时复习队列时优先进入该队列（AC-3）。
  const initial = injectedReview
    ? {
        phase: 'review' as DailyPhase,
        reviewWordIds: injectedReview.wordIds,
        newWordIds: [],
        newBatchIds: null,
        batchExhausted: false,
      }
    : planDailySession(
        wordbank, learnedWords, totalLearnedCount, dailyNewCount, now, todayReviewDone, todayNewDone, currentNewBatch
      );
  const initialWordIds = initial.phase === 'review' ? initial.reviewWordIds : initial.newWordIds;

  const [phase, setPhase] = useState<DailyPhase>(initial.phase);
  const [queue, setQueue] = useState<Word[]>(toWords(wordbank, initialWordIds));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [forgotIds, setForgotIds] = useState<string[]>([]);
  const [pass, setPass] = useState(1);
  const [sessionWordIds] = useState<string[]>(initialWordIds);
  // FT-004-US-03 AC-2：反馈发生时所在清单（新词/复习/定时复习）
  const [currentList, setCurrentList] = useState<FeedbackListId>(
    initial.phase === 'review' ? 'review' : 'daily_new'
  );
  // Bumped whenever the queue is replaced outside handleFeedback (e.g. injected
  // timed review), so WordCard remounts and resets its internal flip state (AC-1).
  const [cardEpoch, setCardEpoch] = useState(0);

  // FT-005-US-06：会话中途注入定时复习（epoch 递增）→ 替换当前队列为定时复习
  const consumedEpochRef = useRef(injectedReview ? injectedReview.epoch : 0);
  useEffect(() => {
    if (!injectedReview || injectedReview.epoch === consumedEpochRef.current) return;
    consumedEpochRef.current = injectedReview.epoch;
    setCardEpoch(e => e + 1);
    setQueue(toWords(wordbank, injectedReview.wordIds));
    setCurrentIndex(0);
    setForgotIds([]);
    setPass(1);
    setCurrentList('timed_review');
    setPhase('review');
  }, [injectedReview, wordbank]);

  // FT-005-US-01 AC-5：新词按词级粒度在首次反馈时标记已学（learnedAt=实际学习时刻），
  // 半批中断时未反馈的词不进入复习计划；markWordsLearned 对已存在词幂等跳过，
  // 复习阶段的词已在学习时标记过，不会重复记录。

  // FT-005-US-02：挂载时按初始计划执行副作用——新生成批次则持久化快照（AC-2/AC-4
  // 的边界固化），批次已学尽则补记当日新词完成（中断恰好落在最后词反馈之后）。
  const initialRef = useRef(initial);
  useEffect(() => {
    const init = initialRef.current;
    if (init.newBatchIds) onStartNewBatch(init.newBatchIds);
    else if (init.batchExhausted) onNewComplete();
    // 仅挂载时执行（initial 为挂载快照）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFeedback = useCallback((feedback: Feedback) => {
    const word = queue[currentIndex];
    onFeedback(word.id, feedback, currentList);
    // FT-005-US-01 AC-5：新词逐词标记，learnedAt 取该词实际学习时刻
    if (phase === 'new') onMarkWordsLearned([word.id]);

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
      // FT-005-US-06：定时复习队列过完，通知 App 清除注入态（"今日已完成"态下回到 CompletedPage）
      onInjectedReviewDone();
      const hasNew = totalLearnedCount < wordbank.length && !todayNewDone;
      if (hasNew) {
        // FT-005-US-02：新词队列统一走批次计划（续背或新生成并持久化）
        const plan = planNewPhase(wordbank, learnedWords, totalLearnedCount, dailyNewCount, currentNewBatch);
        if (plan.done) {
          setPhase('done');
          onNewComplete();
        } else {
          if (plan.newBatchIds) onStartNewBatch(plan.newBatchIds);
          const newQueue = toWords(wordbank, plan.wordIds);
          setPhase('new');
          setQueue(newQueue);
          setCurrentIndex(0);
          setForgotIds([]);
          setPass(1);
          setCurrentList('daily_new');
        }
      } else {
        setPhase('done');
        onNewComplete();
      }
    } else if (phase === 'new') {
      onNewComplete();
      setPhase('done');
    }
  }, [queue, currentIndex, forgotIds, phase, sessionWordIds, wordbank, learnedWords, totalLearnedCount, dailyNewCount, todayNewDone, currentNewBatch, now, onFeedback, onReviewComplete, onInjectedReviewDone, onNewComplete, onMarkWordsLearned, onStartNewBatch, currentList]);

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

    </div>
  );
}
