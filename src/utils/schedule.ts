import type { LearnedWord, ReviewNodeId } from '../types';
import { addDays, getDateStr } from './time.ts';

export const REVIEW_NODES: ReviewNodeId[] = ['30min', '12hr', 'day2', 'day4', 'day8', 'day15', 'day30'];

export function getNodeDueTimestamp(word: LearnedWord, node: ReviewNodeId): number {
  switch (node) {
    case '30min': return word.learnedAt + 30 * 60 * 1000;
    case '12hr':  return word.learnedAt + 12 * 60 * 60 * 1000;
    case 'day2':  return new Date(addDays(word.learnedDate, 2) + 'T00:00:00').getTime();
    case 'day4':  return new Date(addDays(word.learnedDate, 4) + 'T00:00:00').getTime();
    case 'day8':  return new Date(addDays(word.learnedDate, 8) + 'T00:00:00').getTime();
    case 'day15': return new Date(addDays(word.learnedDate, 15) + 'T00:00:00').getTime();
    case 'day30': return new Date(addDays(word.learnedDate, 30) + 'T00:00:00').getTime();
  }
}

function getDueWordIds(learnedWords: LearnedWord[], now: number, nodes: ReviewNodeId[]): string[] {
  const dueIds: string[] = [];

  for (const word of learnedWords) {
    let isDue = false;
    for (const node of nodes) {
      if (word.reviewedNodes.includes(node)) continue;
      const due = getNodeDueTimestamp(word, node);
      // For timed nodes: due if timestamp passed
      // For day nodes: due if today >= due date
      if (due <= now) {
        isDue = true;
        break;
      }
    }
    if (isDue) dueIds.push(word.wordId);
  }

  return dueIds;
}

// Words that need to show in today's daily review list
export function getDueReviewWordIds(learnedWords: LearnedWord[], now: number): string[] {
  return getDueWordIds(learnedWords, now, REVIEW_NODES);
}

// FT-004-US-05：当天任务完成判定口径——仅统计日程复习节点（day2..day30），
// 30min/12hr 即时提醒节点属 FT-005 弹窗范畴，不影响"今日任务已完成"态。
export function getScheduledReviewWordIds(learnedWords: LearnedWord[], now: number): string[] {
  return getDueWordIds(learnedWords, now, REVIEW_NODES.filter(n => n !== '30min' && n !== '12hr'));
}

// Mark all overdue nodes as completed for a word (called after review session)
export function getPendingNodes(word: LearnedWord, now: number): ReviewNodeId[] {
  return REVIEW_NODES.filter(node => {
    if (word.reviewedNodes.includes(node)) return false;
    return getNodeDueTimestamp(word, node) <= now;
  });
}

// Words with 30min or 12hr reminder pending (in-page popup)
export function getTimedReminderWords(learnedWords: LearnedWord[], now: number): LearnedWord[] {
  return learnedWords.filter(word => {
    for (const node of ['30min', '12hr'] as ReviewNodeId[]) {
      if (word.reviewedNodes.includes(node)) continue;
      const due = getNodeDueTimestamp(word, node);
      if (due <= now) return true;
    }
    return false;
  });
}

// FT-005-US-06：页面停留到点复习提醒决策（纯函数）。
// - AC-1/AC-2：到期未复习的 30min/12hr 节点触发弹窗（有 30min 优先标 30min）；
// - "稍后再说"按 wordId:node 粒度登记 dismissedKeys——压住本次弹窗的节点，
//   不影响同一批词 12hr 节点（或后续新批次）到点再弹（AC-2）；
// - 已复习节点天然排除；错过提醒（页面已关）不在此弹，统一并入到期集合（AC-4）。
export type TimedReminderType = '30min' | '12hr';

export interface TimedReminderPlan {
  type: TimedReminderType;
  wordIds: string[];
  /** 弹窗内所有词当前到期未复习定时节点的登记键（wordId:node），供"稍后再说"记录 */
  dismissKeys: string[];
}

export function planTimedReminder(
  learnedWords: LearnedWord[],
  dismissedKeys: Iterable<string>,
  now: number,
): TimedReminderPlan | null {
  const dismissed = new Set(dismissedKeys);
  const entries: { wordId: string; nodes: TimedReminderType[] }[] = [];
  const dismissKeys: string[] = [];

  for (const word of learnedWords) {
    const nodes: TimedReminderType[] = [];
    for (const node of ['30min', '12hr'] as TimedReminderType[]) {
      if (word.reviewedNodes.includes(node)) continue;
      const key = `${word.wordId}:${node}`;
      if (dismissed.has(key)) continue;
      if (getNodeDueTimestamp(word, node) <= now) {
        nodes.push(node);
        dismissKeys.push(key);
      }
    }
    if (nodes.length > 0) entries.push({ wordId: word.wordId, nodes });
  }

  if (entries.length === 0) return null;
  const has30 = entries.some(e => e.nodes.includes('30min'));
  return {
    type: has30 ? '30min' : '12hr',
    wordIds: entries.map(e => e.wordId),
    dismissKeys,
  };
}
