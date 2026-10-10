export interface Word {
  id: string;
  word: string;
  definition: string;
  example: string;
  chinese: string;
}

export type Feedback = 'forgot' | 'fuzzy' | 'know';

/** 反馈发生时所在清单（FT-004-US-03 AC-2 所属清单） */
export type FeedbackListId = 'daily_new' | 'review' | 'timed_review';

export type ReviewNodeId = '30min' | '12hr' | 'day2' | 'day4' | 'day8' | 'day15' | 'day30';

export interface LearnedWord {
  wordId: string;
  learnedAt: number;
  learnedDate: string;
  feedback: Feedback | null;
  reviewedNodes: ReviewNodeId[];
}

/**
 * FT-005-US-02：进行中的新词批次。
 * 生成时刻固化批次边界（词序快照），是词级续背（AC-2）、中断顺延（AC-3）、
 * 每日新词数变更后批次切换（AC-4）的数据基础——批次一旦生成本身不再随
 * dailyNewCount / 学习进度变化，进度通过过滤已学词体现。
 */
export interface NewWordBatch {
  wordIds: string[];
  /** 批次生成日期（YYYY-MM-DD） */
  date: string;
}

export type AppView =
  | 'bank-select'
  | 'count-select'
  | 'study'
  | 'completed';

export interface AppState {
  view: AppView;
  selectedBank: string | null;
  dailyNewCount: number | null;
  isGuest: boolean;
  phone: string | null;
  firstStudyTimestamp: number | null;
  lastOpenDate: string | null;
  learnedWords: LearnedWord[];
  totalLearnedCount: number;
  simulatedTime: number | null;
  savePromptDismissed: boolean;
  todayDate: string | null;
  todayReviewDone: boolean;
  todayNewDone: boolean;
  longBreakHandled: boolean;
  currentNewBatch: NewWordBatch | null;
  studyLog: StudyLogEntry[];
}

export interface StudyLogEntry {
  ts: number;
  wordId?: string;
  action: string;
  feedback?: Feedback | null;
  list?: FeedbackListId;
  event?: string;
  date?: string;
}

export const DEFAULT_STATE: AppState = {
  view: 'bank-select',
  selectedBank: null,
  dailyNewCount: null,
  isGuest: true,
  phone: null,
  firstStudyTimestamp: null,
  lastOpenDate: null,
  learnedWords: [],
  totalLearnedCount: 0,
  simulatedTime: null,
  savePromptDismissed: false,
  todayDate: null,
  todayReviewDone: false,
  todayNewDone: false,
  longBreakHandled: false,
  currentNewBatch: null,
  studyLog: [],
};
