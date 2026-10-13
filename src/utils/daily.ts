import type { LearnedWord, NewWordBatch, Word } from '../types';
import { getDueReviewWordIds, getScheduledReviewWordIds } from './schedule.ts';
import { generateNewBatchIds, getRemainingBatchWordIds } from './batch.ts';
import { daysBetween } from './time.ts';

/**
 * FT-005-US-03 每日清单编排纯函数（打开网站时"先复习后新词"的编排决策）。
 *
 * 依赖分工：复习侧到期集合来自 schedule.ts（FT-005-US-01 统一到期集合），
 * 新词侧批次推进来自 batch.ts（FT-005-US-02），本模块只负责编排决策。
 */

export type DailyPhase = 'review' | 'new' | 'done';

export interface NewPhasePlan {
  /** 本次要学的新词队列（批次剩余词或新生成批次） */
  wordIds: string[];
  /** 需要新生成并持久化的批次；null = 续用现有批次或无需学习 */
  newBatchIds: string[] | null;
  /** 无新词可学（批次已学尽或全词表学完），应直接判定当日新词完成 */
  done: boolean;
}

export interface DailySessionPlan {
  phase: DailyPhase;
  /** 复习阶段队列（phase='review' 时非空，含逾期未复习词） */
  reviewWordIds: string[];
  /** 新词阶段队列（phase='new' 时非空） */
  newWordIds: string[];
  /** 需新生成并持久化的批次快照；null = 续用现有批次或无需学习 */
  newBatchIds: string[] | null;
  /** 挂载时批次已学尽（中断恰好落在最后词反馈之后），应补记当日新词完成 */
  batchExhausted: boolean;
}

/**
 * FT-005-US-02 新词阶段计划：
 * - 有进行中批次 → 取批次内未学词续背（AC-2 词级续背 / AC-3 中断顺延 / AC-4 边界固化）；
 * - 无批次 → 按词表顺序生成下一批 dailyNewCount 个（AC-1），并要求持久化快照；
 * - 词表学完（AC-5）或批次词已全部学完（中断恰好落在最后词反馈后）→ done。
 */
export function planNewPhase(
  wordbank: Word[],
  learnedWords: LearnedWord[],
  totalLearnedCount: number,
  dailyNewCount: number,
  currentBatch: NewWordBatch | null,
): NewPhasePlan {
  if (currentBatch) {
    const remaining = getRemainingBatchWordIds(currentBatch, learnedWords);
    if (remaining.length > 0) return { wordIds: remaining, newBatchIds: null, done: false };
    return { wordIds: [], newBatchIds: null, done: true };
  }
  const ids = generateNewBatchIds(wordbank, totalLearnedCount, dailyNewCount);
  if (ids.length === 0) return { wordIds: [], newBatchIds: null, done: true };
  return { wordIds: ids, newBatchIds: ids, done: false };
}

/**
 * FT-005-US-03 打开网站时的当日编排决策：
 * - AC-1：当天有到期未复习词 → 先进入复习清单，复习过完后进入新词学习
 *   （复习完成由调用方置 todayReviewDone 后再次进入，即落到新词分支）；
 * - AC-2：当天无到期复习词（如第 1 天）→ 直接进入新词学习；
 * - AC-3：既无到期复习也无新词可学 → done（页面显示"今日任务已完成"）。
 */
export function planDailySession(
  wordbank: Word[],
  learnedWords: LearnedWord[],
  totalLearnedCount: number,
  dailyNewCount: number,
  now: number,
  todayReviewDone: boolean,
  todayNewDone: boolean,
  currentBatch: NewWordBatch | null,
): DailySessionPlan {
  const reviewWordIds = getDueReviewWordIds(learnedWords, now);
  const hasReview = reviewWordIds.length > 0 && !todayReviewDone;
  const hasNew = totalLearnedCount < wordbank.length && !todayNewDone;

  if (hasReview) {
    return {
      phase: 'review', reviewWordIds, newWordIds: [],
      newBatchIds: null, batchExhausted: false,
    };
  }
  if (hasNew) {
    const plan = planNewPhase(wordbank, learnedWords, totalLearnedCount, dailyNewCount, currentBatch);
    return {
      phase: plan.done ? 'done' : 'new',
      reviewWordIds: [],
      newWordIds: plan.wordIds,
      newBatchIds: plan.newBatchIds,
      batchExhausted: plan.done && !!currentBatch,
    };
  }
  return {
    phase: 'done', reviewWordIds: [], newWordIds: [],
    newBatchIds: null, batchExhausted: false,
  };
}

/**
 * FT-005-US-03 AC-3/AC-4：今日任务完成判定。
 * 当天复习与新词清单均已过完（含"忘了"重现遍，由卡片会话内部消化）后，
 * 当天再次打开仍判定已完成、不重复生成当天清单（todayReviewDone /
 * todayNewDone 由 store 持久化，跨日才重置）。
 * 口径与 FT-004-US-05 一致：仅统计日程复习节点（day2..day30），
 * 30min/12hr 即时提醒节点属 FT-005 弹窗范畴，不翻回完成态。
 */
/**
 * FT-005-US-04 中断时长判定（纯函数）。
 *
 * 口径：中断天数 = 返回日与最后打开日之间的**未打开自然日数**
 * （= daysBetween - 1，"最后打开日"当天是打开过的，不计入中断）。
 * - 1~7 天（含）：短期中断，不弹选择，直接按 AC-1/AC-2 全量顺延处理；
 * - ≥8 天：长期中断，弹出"继续按当前节奏 / 从某个单词重新开始"选择（AC-3）；
 * - AC-5 边界：中断恰 7 天 → showChoice=false；恰 8 天 → showChoice=true。
 */
export interface BreakReturnPlan {
  /** 未打开的自然日数（0 = 当天打开过或首日无记录） */
  missedDays: number;
  /** 是否应弹出长期中断选择弹窗（missedDays >= 8） */
  showChoice: boolean;
}

export function planBreakReturn(lastOpenDate: string | null, todayStr: string): BreakReturnPlan {
  if (!lastOpenDate || lastOpenDate === todayStr) {
    return { missedDays: 0, showChoice: false };
  }
  const missedDays = daysBetween(lastOpenDate, todayStr) - 1;
  if (missedDays < 0) return { missedDays: 0, showChoice: false };
  return { missedDays, showChoice: missedDays >= 8 };
}

export function isDailyComplete(
  learnedWords: LearnedWord[],
  totalLearnedCount: number,
  wordbankLength: number,
  now: number,
  todayReviewDone: boolean,
  todayNewDone: boolean,
): boolean {
  const hasReviewToday = getScheduledReviewWordIds(learnedWords, now).length > 0 && !todayReviewDone;
  const hasNewToday = totalLearnedCount < wordbankLength && !todayNewDone;
  return !hasReviewToday && !hasNewToday;
}
