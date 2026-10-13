import { useState, useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { Word } from './types';
import { isDailyComplete, planBreakReturn } from './utils/daily';
import { planTimedReminder, TimedReminderPlan } from './utils/schedule';
import { getNow, getDateStr, daysBetween } from './utils/time';

import Navbar from './components/Navbar';
import DebugPanel from './components/DebugPanel';
import SaveProgressModal from './components/SaveProgressModal';
import LongBreakModal from './components/LongBreakModal';
import ChangeDailyCountModal from './components/ChangeDailyCountModal';
import ReminderModal from './components/ReminderModal';

import BankSelectPage from './pages/BankSelectPage';
import DailyCountPage from './pages/DailyCountPage';
import StudyPage from './pages/StudyPage';
import CompletedPage from './pages/CompletedPage';

export default function App() {
  const { state, actions, now, todayStr } = useAppStore();
  const [wordbank, setWordbank] = useState<Word[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLongBreak, setShowLongBreak] = useState(false);
  const [showChangeCount, setShowChangeCount] = useState(false);
  const [savePromptTriggered, setSavePromptTriggered] = useState(false);

  // FT-005-US-06 页面停留到点复习提醒：App 级轮询（每 30s），
  // 学习页与"今日已完成"页停留均触发（AC-1/AC-2，备注假设 5）。
  // "稍后再说"按 wordId:node 粒度登记——只压本次弹窗的节点，
  // 12hr 到点（或后续新批次）照常再弹（AC-2）。
  const [reminder, setReminder] = useState<TimedReminderPlan | null>(null);
  const [dismissedReminderKeys, setDismissedReminderKeys] = useState<string[]>([]);
  // 点"现在复习"后注入 StudyPage 的定时复习队列（epoch 递增驱动替换）
  const [timedReview, setTimedReview] = useState<{ wordIds: string[]; epoch: number } | null>(null);

  useEffect(() => {
    const check = () => {
      const nowTs = getNow(state.simulatedTime);
      setReminder(planTimedReminder(state.learnedWords, dismissedReminderKeys, nowTs));
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [state.simulatedTime, state.learnedWords, dismissedReminderKeys]);

  // Load wordbank (FT-002-US-03 导入产物：元数据 + words 数组)
  useEffect(() => {
    fetch('/data/wordbank-zhongkao.json')
      .then(r => r.json())
      .then(d => setWordbank(d.words))
      .catch(() => {});
  }, []);

  // Mark today opened and detect long break
  useEffect(() => {
    if (state.view !== 'study' || !wordbank.length) return;
    if (!state.todayDate || state.todayDate !== todayStr) {
      actions.markTodayOpened();
    }

    // FT-005-US-04 长期中断检测：中断天数 = 未打开自然日数（gap-1），≥8 天弹选择
    if (!state.longBreakHandled && state.lastOpenDate && state.lastOpenDate !== todayStr) {
      if (planBreakReturn(state.lastOpenDate, todayStr).showChoice) setShowLongBreak(true);
    }
  }, [state.view, wordbank.length, todayStr]);

  // "Save progress" nudge on 3rd natural day
  useEffect(() => {
    if (!state.isGuest || state.savePromptDismissed || savePromptTriggered) return;
    if (!state.firstStudyTimestamp) return;
    const firstDate = getDateStr(state.firstStudyTimestamp);
    const daysSince = daysBetween(firstDate, todayStr);
    if (daysSince >= 2) { // 3rd day = 2 days after first
      setSavePromptTriggered(true);
      setShowSaveModal(true);
    }
  }, [state.firstStudyTimestamp, todayStr, state.isGuest, state.savePromptDismissed, savePromptTriggered]);

  // Compute daily done state
  // FT-004-US-05：完成判定排除 30min/12hr 即时提醒节点（属 FT-005 弹窗），
  // 否则新词学完 30 分钟后完成态会被翻回，违反 AC-2。
  // FT-005-US-03 AC-3/AC-4：既无到期复习也无新词可学（含当天清单已过完
  // 后再次打开）→ 显示"今日任务已完成"，不重复生成当天清单。
  const isDailyDone = wordbank.length > 0
    && isDailyComplete(
      state.learnedWords, state.totalLearnedCount, wordbank.length, now,
      state.todayReviewDone, state.todayNewDone,
    )
    && state.view === 'study';

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Navbar
        state={state}
        onChangeDailyCount={() => setShowChangeCount(true)}
        onSaveProgress={() => setShowSaveModal(true)}
        onLogout={() => {
          if (confirm('确定退出登录？')) {
            actions.resetAll();
          }
        }}
      />

      <main>
        {state.view === 'bank-select' && (
          <BankSelectPage wordCount={wordbank.length} onSelect={actions.selectBank} />
        )}

        {state.view === 'count-select' && (
          <DailyCountPage onSelect={actions.setDailyCount} />
        )}

        {state.view === 'study' && wordbank.length > 0 && (
          <>
            {/* FT-005-US-06：定时复习激活时优先渲染学习页（"今日已完成"态点"现在复习"也能进入复习，AC-3） */}
            {isDailyDone && !timedReview ? (
              <CompletedPage
                learnedWords={state.learnedWords}
                dailyNewCount={state.dailyNewCount ?? 10}
                todayStr={todayStr}
              />
            ) : (
              <StudyPage
                wordbank={wordbank}
                learnedWords={state.learnedWords}
                totalLearnedCount={state.totalLearnedCount}
                dailyNewCount={state.dailyNewCount ?? 10}
                simulatedTime={state.simulatedTime}
                todayReviewDone={state.todayReviewDone}
                todayNewDone={state.todayNewDone}
                currentNewBatch={state.currentNewBatch}
                injectedReview={timedReview}
                onInjectedReviewDone={() => setTimedReview(null)}
                onFeedback={actions.recordFeedback}
                onReviewComplete={actions.completeReviewForWords}
                onNewComplete={actions.completeNewSession}
                onMarkWordsLearned={actions.markWordsLearned}
                onStartNewBatch={actions.startNewBatch}
              />
            )}
          </>
        )}
      </main>

      {/* Timed reminder modal (FT-005-US-06) */}
      {reminder && (
        <ReminderModal
          type={reminder.type}
          wordCount={reminder.wordIds.length}
          onReview={() => {
            const ids = reminder.wordIds;
            setReminder(null);
            // AC-3：立即进入这批词的复习——标记到期节点并注入学习页队列
            actions.completeReviewForWords(ids);
            setTimedReview(prev => ({ wordIds: ids, epoch: (prev?.epoch ?? 0) + 1 }));
          }}
          onDismiss={() => {
            // 仅登记本次弹窗涉及的节点，12hr 节点不受影响（AC-2）
            setDismissedReminderKeys(prev => [...new Set([...prev, ...reminder.dismissKeys])]);
            setReminder(null);
          }}
        />
      )}

      {/* Long break modal */}
      {showLongBreak && wordbank.length > 0 && (
        <LongBreakModal
          daysMissed={planBreakReturn(state.lastOpenDate, todayStr).missedDays}
          wordbank={wordbank}
          onContinue={() => {
            actions.setLongBreakHandled();
            setShowLongBreak(false);
          }}
          onRestart={(wordId) => {
            actions.resetFromWord(wordId, wordbank);
            setShowLongBreak(false);
          }}
        />
      )}

      {/* Save progress modal */}
      {showSaveModal && (
        <SaveProgressModal
          onRegister={(phone) => {
            actions.registerPhone(phone);
            setShowSaveModal(false);
          }}
          onDismiss={() => {
            actions.dismissSavePrompt();
            setShowSaveModal(false);
          }}
          isPrompt={savePromptTriggered && state.isGuest}
        />
      )}

      {/* Change daily count modal */}
      {showChangeCount && (
        <ChangeDailyCountModal
          current={state.dailyNewCount ?? 10}
          onConfirm={(count) => {
            actions.updateDailyCount(count);
            setShowChangeCount(false);
          }}
          onDismiss={() => setShowChangeCount(false)}
        />
      )}

      {/* Debug panel */}
      <DebugPanel
        simulatedTime={state.simulatedTime}
        onSetTime={actions.setSimulatedTime}
        onAdvance={actions.advanceTime}
        onReset={actions.resetAll}
      />

      {/* Footer — hidden during study */}
      {state.view !== 'study' && (
        <footer className="text-center py-6">
          <p className="text-[11px] text-gray-300">
            © 2024 WordDaily · <a href="#" className="hover:text-gray-500 transition-colors">隐私说明</a>
          </p>
        </footer>
      )}
    </div>
  );
}
