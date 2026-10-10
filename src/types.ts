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
  studyLog: [],
};
