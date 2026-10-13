import type { LearnedWord, NewWordBatch, Word } from '../types';

/**
 * FT-005-US-02 新词批次纯函数（新词侧，与 schedule.ts 的复习侧分工）。
 */

/**
 * AC-1 / AC-3：按词表顺序生成下一批新词。
 * 从已学指针处顺序取 dailyNewCount 个；跨日中断不补生成缺失天数的新词，
 * 回来后生成的就是"原本那一天"的那一批（批次按学习进度顺延）。
 */
export function generateNewBatchIds(
  wordbank: Word[],
  totalLearnedCount: number,
  dailyNewCount: number,
): string[] {
  return wordbank
    .slice(totalLearnedCount, totalLearnedCount + dailyNewCount)
    .map(w => w.id);
}

/**
 * AC-2：批次内过滤已学词得到续背队列（从该批第一个未学词接着背，
 * 已背过的词不再作为新词出现）。
 * AC-4：批次边界在生成时刻固化，dailyNewCount 变更不影响本批剩余词。
 */
export function getRemainingBatchWordIds(
  batch: NewWordBatch,
  learnedWords: LearnedWord[],
): string[] {
  const learned = new Set(learnedWords.map(w => w.wordId));
  return batch.wordIds.filter(id => !learned.has(id));
}
