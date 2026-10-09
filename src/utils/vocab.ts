import type { Word } from '../types';

/**
 * 中考题库检索数据服务（FT-002-US-03 AC-2/AC-3）。
 *
 * 本模块是"中考题库"（public/data/wordbank-zhongkao.json，由
 * scripts/import-vocab.mjs 导入产出）的检索与边界判定能力，
 * 为背词功能（卡片四要素展示、重开起点搜索 AC-19/AC-20）提供数据基础。
 *
 * 仅使用 type-only import，零运行时依赖：node ≥22.18 的 type stripping
 * 可直接执行本文件（scripts/test-vocab-lookup.mjs 与 import-vocab.mjs 复用
 * normalizeWord，保证导入 id 与检索键的归一化口径单一真源）。
 */

/**
 * 单词归一化：trim + 连续空白压缩为单空格 + 小写。
 *
 * 与校验器 QR-02 的唯一性归一口径（trim + 小写）一致，额外压缩连续空白
 * 以容错用户手输（如 "ICE   cream"）；题库数据本身规范为单空格，压缩幂等。
 * 归一化唯一性由导入门禁（QR-02）保证，因此归一化键可安全用作词条主键。
 */
export function normalizeWord(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** 词条索引：归一化单词 → 词条。 */
export type WordIndex = Map<string, Word>;

/**
 * 构建题库索引。
 *
 * 题库数据经导入工具门禁保证归一化唯一（QR-02）；若数据异常出现重复键，
 * 保留清单序首个（与"词表清单顺序"的权威序一致）。
 */
export function buildWordIndex(bank: Word[]): WordIndex {
  const index: WordIndex = new Map();
  for (const w of bank) {
    const key = normalizeWord(w.word);
    if (!index.has(key)) index.set(key, w);
  }
  return index;
}

/**
 * AC-2 按单词检索词条：命中返回完整四要素词条，未命中返回 null。
 */
export function lookupWord(index: WordIndex, query: string): Word | null {
  return index.get(normalizeWord(query)) ?? null;
}

/**
 * AC-3 词表边界判定：词表内单词 → true，词表外单词 → false。
 */
export function isInVocabList(index: WordIndex, query: string): boolean {
  return index.has(normalizeWord(query));
}
