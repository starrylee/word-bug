import { useState, useCallback, useEffect } from 'react';
import { AppState, DEFAULT_STATE, Feedback, FeedbackListId, LearnedWord, ReviewNodeId, StudyLogEntry } from '../types';
import { getNow, getDateStr } from '../utils/time';
import { getPendingNodes } from '../utils/schedule';
import { planRestartFromWord } from '../utils/daily';

const STORAGE_KEY = 'worddaily_v1';

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function useAppStore() {
  const [state, setState] = useState<AppState>(loadState);

  const update = useCallback((updater: (prev: AppState) => AppState) => {
    setState(prev => {
      const next = updater(prev);
      saveState(next);
      return next;
    });
  }, []);

  const now = getNow(state.simulatedTime);
  const todayStr = getDateStr(now);

  // Reset daily flags when date changes
  useEffect(() => {
    if (state.todayDate && state.todayDate !== todayStr) {
      update(s => ({
        ...s,
        todayDate: todayStr,
        todayReviewDone: false,
        todayNewDone: false,
        longBreakHandled: false,
      }));
    }
  }, [todayStr, state.todayDate, update]);

  const actions = {
    selectBank: (bankId: string) => {
      update(s => ({ ...s, selectedBank: bankId, view: 'count-select' }));
    },

    setDailyCount: (count: number) => {
      update(s => ({ ...s, dailyNewCount: count, view: 'study' }));
    },

    setView: (view: AppState['view']) => {
      update(s => ({ ...s, view }));
    },

    markWordsLearned: (wordIds: string[]) => {
      const learnedAt = getNow(state.simulatedTime);
      const learnedDate = getDateStr(learnedAt);
      update(s => {
        const existingIds = new Set(s.learnedWords.map(w => w.wordId));
        const newWords: LearnedWord[] = wordIds
          .filter(id => !existingIds.has(id))
          .map(id => ({ wordId: id, learnedAt, learnedDate, feedback: null, reviewedNodes: [] }));
        const newLog: StudyLogEntry[] = wordIds.map(id => ({
          ts: learnedAt, wordId: id, action: 'new_word', feedback: null,
        }));
        return {
          ...s,
          learnedWords: [...s.learnedWords, ...newWords],
          totalLearnedCount: s.totalLearnedCount + wordIds.length,
          firstStudyTimestamp: s.firstStudyTimestamp ?? learnedAt,
          lastOpenDate: learnedDate,
          todayDate: learnedDate,
          studyLog: [...s.studyLog, ...newLog],
        };
      });
    },

    recordFeedback: (wordId: string, feedback: Feedback, list?: FeedbackListId) => {
      const ts = getNow(state.simulatedTime);
      update(s => ({
        ...s,
        learnedWords: s.learnedWords.map(w =>
          w.wordId === wordId ? { ...w, feedback } : w
        ),
        // FT-004-US-03 AC-2：词级粒度记录（单词/档位/所属清单/时间）
        studyLog: [...s.studyLog, { ts, wordId, action: 'feedback', feedback, list }],
      }));
    },

    completeReviewForWords: (wordIds: string[]) => {
      const nowTs = getNow(state.simulatedTime);
      update(s => ({
        ...s,
        learnedWords: s.learnedWords.map(w => {
          if (!wordIds.includes(w.wordId)) return w;
          const pending = getPendingNodes(w, nowTs);
          const reviewedNodes = [...new Set([...w.reviewedNodes, ...pending])] as ReviewNodeId[];
          return { ...w, reviewedNodes };
        }),
        todayReviewDone: true,
        lastOpenDate: getDateStr(nowTs),
        studyLog: [...s.studyLog, {
          ts: nowTs, action: 'review_session_complete',
          event: 'review_done', date: getDateStr(nowTs),
        }],
      }));
    },

    // FT-005-US-02：进入新词阶段时固化当日批次快照（AC-2 词级续背 / AC-4 批次边界）
    startNewBatch: (wordIds: string[]) => {
      const ts = getNow(state.simulatedTime);
      update(s => ({ ...s, currentNewBatch: { wordIds, date: getDateStr(ts) } }));
    },

    completeNewSession: () => {
      const nowTs = getNow(state.simulatedTime);
      update(s => ({
        ...s,
        todayNewDone: true,
        // FT-005-US-02：批次完成即清空，次日（或下次进入）生成新批次
        currentNewBatch: null,
        lastOpenDate: getDateStr(nowTs),
        todayDate: getDateStr(nowTs),
        studyLog: [...s.studyLog, {
          ts: nowTs, action: 'daily_complete',
          event: 'daily_complete', date: getDateStr(nowTs),
        }],
      }));
    },

    markTodayOpened: () => {
      update(s => ({
        ...s,
        lastOpenDate: todayStr,
        todayDate: todayStr,
      }));
    },

    setLongBreakHandled: () => {
      update(s => ({ ...s, longBreakHandled: true }));
    },

    // FT-005-US-05：从起点词清零重排（AC-3 进度回第 1 天 / AC-4 起点前词不再复习）
    resetFromWord: (wordId: string, wordbank: { id: string }[]) => {
      const plan = planRestartFromWord(wordId, wordbank, state.learnedWords);
      if (!plan) return false;
      update(s => ({
        ...s,
        totalLearnedCount: plan.totalLearnedCount,
        learnedWords: plan.learnedWords,
        todayReviewDone: false,
        todayNewDone: false,
        // FT-005-US-02：重置起点后旧批次快照失效，一并清空
        currentNewBatch: null,
        longBreakHandled: true,
      }));
      return true;
    },

    updateDailyCount: (count: number) => {
      update(s => ({ ...s, dailyNewCount: count }));
    },

    // FT-006-US-01：注册成功即终止"保存进度"提示（AC-4）
    registerPhone: (phone: string) => {
      update(s => ({ ...s, phone, isGuest: false }));
    },

    // FT-006-US-01：记录当日已弹过提示——弹出时刻即登记，同自然日不重复（AC-3），
    // 无论用户点"以后再说"还是直接关掉弹窗，次日首开均照常再弹
    markSavePromptShown: () => {
      update(s => ({ ...s, savePromptLastDate: todayStr }));
    },

    setSimulatedTime: (time: number | null) => {
      update(s => {
        const newDateStr = time ? getDateStr(time) : getDateStr(Date.now());
        const dateChanged = newDateStr !== s.todayDate;
        return {
          ...s,
          simulatedTime: time,
          ...(dateChanged ? {
            todayDate: newDateStr,
            todayReviewDone: false,
            todayNewDone: false,
            longBreakHandled: false,
          } : {}),
        };
      });
    },

    advanceTime: (ms: number) => {
      update(s => {
        const current = s.simulatedTime ?? Date.now();
        const next = current + ms;
        const newDateStr = getDateStr(next);
        const dateChanged = newDateStr !== s.todayDate;
        return {
          ...s,
          simulatedTime: next,
          ...(dateChanged ? {
            todayDate: newDateStr,
            todayReviewDone: false,
            todayNewDone: false,
            longBreakHandled: false,
          } : {}),
        };
      });
    },

    resetAll: () => {
      localStorage.removeItem(STORAGE_KEY);
      setState({ ...DEFAULT_STATE });
    },
  };

  return { state, actions, now, todayStr };
}
