import { useState, useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { Word } from './types';
import { getScheduledReviewWordIds } from './utils/schedule';
import { getNow, getDateStr, daysBetween } from './utils/time';

import Navbar from './components/Navbar';
import DebugPanel from './components/DebugPanel';
import SaveProgressModal from './components/SaveProgressModal';
import LongBreakModal from './components/LongBreakModal';
import ChangeDailyCountModal from './components/ChangeDailyCountModal';

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

    // Long break detection
    if (!state.longBreakHandled && state.lastOpenDate && state.lastOpenDate !== todayStr) {
      const gap = daysBetween(state.lastOpenDate, todayStr);
      if (gap >= 8) setShowLongBreak(true);
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
  const reviewWordIds = wordbank.length > 0 ? getScheduledReviewWordIds(state.learnedWords, now) : [];
  const hasReviewToday = reviewWordIds.length > 0 && !state.todayReviewDone;
  const hasNewToday = state.totalLearnedCount < wordbank.length && !state.todayNewDone;
  const isDailyDone = !hasReviewToday && !hasNewToday && state.view === 'study';

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
            {isDailyDone ? (
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
                onFeedback={actions.recordFeedback}
                onReviewComplete={actions.completeReviewForWords}
                onNewComplete={actions.completeNewSession}
                onMarkWordsLearned={actions.markWordsLearned}
              />
            )}
          </>
        )}
      </main>

      {/* Long break modal */}
      {showLongBreak && wordbank.length > 0 && (
        <LongBreakModal
          daysMissed={state.lastOpenDate ? daysBetween(state.lastOpenDate, todayStr) : 8}
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
