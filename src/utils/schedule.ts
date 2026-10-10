import { LearnedWord, ReviewNodeId } from '../types';
import { addDays, getDateStr } from './time';

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
