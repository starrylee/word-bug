/**
 * FT-006-US-03：注册后进度保留与行为归并（纯函数）。
 *
 * AC-1 游客进度完整保留：注册只切换账号身份（phone + isGuest=false），
 *   进度字段（已学词/每日新词数/批次快照/复习安排数据源/行为日志等）
 *   一律原样保留——由 PROGRESS_FIELDS + progressUnchanged 显式固化不变量。
 * AC-2 匿名行为归并：游客期 studyLog 以匿名设备身份记录在本地，
 *   注册成功时与账号已有行为日志按事件键去重合并（归并仅发生一次、
 *   重复归并幂等），保证按日统计（如每日新词数）在注册前后连续。
 */

import type { AppState, StudyLogEntry } from '../types.ts';
import { getDateStr } from './time.ts';

/**
 * 注册前后必须保持不变的进度字段清单（AC-1 不变量的机器可读形式）。
 * 复习安排由 learnedWords（learnedAt/reviewedNodes/feedback）推导（FT-005），
 * 故复习进度即 learnedWords，无独立字段。
 */
export const PROGRESS_FIELDS = [
  'view',
  'selectedBank',
  'dailyNewCount',
  'firstStudyTimestamp',
  'lastOpenDate',
  'learnedWords',
  'totalLearnedCount',
  'savePromptLastDate',
  'todayDate',
  'todayReviewDone',
  'todayNewDone',
  'longBreakHandled',
  'currentNewBatch',
  'studyLog',
] as const;

/**
 * 注册成功：仅切换账号身份，进度字段全部保留（AC-1）。
 * 幂等：已登录同一手机号时返回原引用（重复注册/登录重入不产生新状态）。
 */
export function mergeProgressOnRegister(state: AppState, phone: string): AppState {
  if (!state.isGuest && state.phone === phone) return state;
  return { ...state, phone, isGuest: false };
}

/** AC-1 不量校验：before/after 的全部进度字段是否逐字段一致 */
export function progressUnchanged(before: AppState, after: AppState): boolean {
  return PROGRESS_FIELDS.every(
    (f) => JSON.stringify(before[f]) === JSON.stringify(after[f]),
  );
}

/** 行为日志事件键：同一时间戳同一词的同一动作视为同一事件（归并去重粒度） */
function logKey(e: StudyLogEntry): string {
  return `${e.ts}|${e.wordId ?? ''}|${e.action}|${e.event ?? ''}`;
}

/**
 * AC-2：游客匿名行为日志归并到账号已有日志。
 * 以账号日志为基准，游客日志按键去重后并入，按时间戳稳定排序；
 * 重复归并（同一份日志再合一次）结果不变——归并幂等。
 */
export function mergeStudyLogOnRegister(
  accountLog: StudyLogEntry[],
  guestLog: StudyLogEntry[],
): StudyLogEntry[] {
  const seen = new Set(accountLog.map(logKey));
  const merged = [...accountLog];
  for (const e of guestLog) {
    if (!seen.has(logKey(e))) {
      seen.add(logKey(e));
      merged.push(e);
    }
  }
  merged.sort((a, b) =>
    a.ts - b.ts || (a.wordId ?? '').localeCompare(b.wordId ?? ''),
  );
  return merged;
}

/**
 * 按自然日统计新词学习数（完成率统计的演示口径）。
 * 归并后日志的按日计数应与"注册前后连续统计"一致——注册日不重不漏。
 */
export function countNewWordsByDate(
  studyLog: StudyLogEntry[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of studyLog) {
    if (e.action !== 'new_word') continue;
    const date = e.date ?? getDateStr(e.ts);
    counts[date] = (counts[date] ?? 0) + 1;
  }
  return counts;
}
