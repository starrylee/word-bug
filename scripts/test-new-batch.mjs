#!/usr/bin/env node
/**
 * 新词批次生成与词级续背验证（FT-005-US-02 各 AC 的可执行验收）
 *
 * 用法：
 *   node scripts/test-new-batch.mjs        # 或 pnpm test:batch
 *
 * 对 src/utils/batch.ts 的纯函数按实例化示例逐条断言：
 *   - AC-1：每日新词批次按词表顺序生成（40 词已学 → 第 41~50 词）；
 *   - AC-2：半批中断词级续背（10 词背完 6 → 剩余第 7~10 词，前 6 词不重复出现）；
 *   - AC-3：中断期间批次顺延（第 4~6 天未打开 → 第 7 天学的是原第 4 天那批）；
 *   - AC-4：每日新词数变更后批次切换（已开始批次边界固化，下一批才用新数量）；
 *   - AC-5：全词表学完不生成新词批次。
 *
 * 环境要求：node ≥22.18（默认 type stripping，直接 import src/utils/batch.ts）。
 *
 * 退出码：0 全部断言通过；1 存在断言失败
 */
import { generateNewBatchIds, getRemainingBatchWordIds } from '../src/utils/batch.ts';

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.error(`失败: ${label}\n  期望: ${e}\n  实际: ${a}`);
  }
}

// 构造 50 词词表（w01..w50），模拟 LearnedWord 只需 wordId
const wordbank = Array.from({ length: 50 }, (_, i) => ({
  id: `w${String(i + 1).padStart(2, '0')}`,
  word: `word${i + 1}`,
  definition: '', example: '', chinese: '',
}));
const learned = (ids) => ids.map(id => ({ wordId: id }));

// ---- AC-1：每日新词批次生成 ----
// 示例 1：每日 10 词、前 40 已学 → 批次为第 41~50 词
check('AC-1 顺序取下一批',
  generateNewBatchIds(wordbank, 40, 10), ['w41', 'w42', 'w43', 'w44', 'w45', 'w46', 'w47', 'w48', 'w49', 'w50']);
check('AC-1 首批从头开始', generateNewBatchIds(wordbank, 0, 10), wordbank.slice(0, 10).map(w => w.id));
check('AC-1 词表尾部不足额时取到末尾', generateNewBatchIds(wordbank, 45, 10), ['w46', 'w47', 'w48', 'w49', 'w50']);

// ---- AC-2：半批中断词级续背 ----
// 示例 1：批次 w01..w10 背完前 6 个离开 → 回来续背剩余 4 个，前 6 个不重复出现
const batchDay1 = { wordIds: generateNewBatchIds(wordbank, 0, 10), date: '2026-10-10' };
check('AC-2 剩余为第 7~10 词',
  getRemainingBatchWordIds(batchDay1, learned(['w01', 'w02', 'w03', 'w04', 'w05', 'w06'])),
  ['w07', 'w08', 'w09', 'w10']);
check('AC-2 零进度中断 → 整批重入', getRemainingBatchWordIds(batchDay1, learned([])), batchDay1.wordIds);
check('AC-2 全批学完 → 剩余为空', getRemainingBatchWordIds(batchDay1, learned(batchDay1.wordIds)), []);

// ---- AC-3：中断期间批次顺延 ----
// 示例 1：第 3 天学完（30 词），第 4~6 天未打开，第 7 天回来 →
// 未完成批次续背；若第 3 天批次已完成，则第 7 天新批次 = 原第 4 天那批（w31..w40）
const batchDay4 = { wordIds: generateNewBatchIds(wordbank, 30, 10), date: '2026-10-04' };
check('AC-3 顺延批次为原第 4 天那批', batchDay4.wordIds,
  ['w31', 'w32', 'w33', 'w34', 'w35', 'w36', 'w37', 'w38', 'w39', 'w40']);
check('AC-3 顺延批次半批中断后续背（跨多日）',
  getRemainingBatchWordIds(batchDay4, learned(['w31', 'w32'])), ['w33', 'w34', 'w35', 'w36', 'w37', 'w38', 'w39', 'w40']);

// ---- AC-4：每日新词数变更后的批次切换 ----
// 示例 1：第 5 天批次 w41..w50（10 词）进行中改为 20 → 本批剩余仍按 10 词边界，
// 第 6 天新批次才用 20 词（w51.. 不够则取到末尾——用 40 词表验证）
const bank40 = wordbank.slice(0, 40);
const batchDay5 = { wordIds: generateNewBatchIds(bank40, 40 - 10, 10), date: '2026-10-05' };
check('AC-4 已开始批次边界固化（改 20 后剩余仍为 3 个）',
  getRemainingBatchWordIds(batchDay5, learned(['w31', 'w32', 'w33', 'w34', 'w35', 'w36', 'w37'])),
  ['w38', 'w39', 'w40']);
check('AC-4 下一批按新数量生成',
  generateNewBatchIds(bank40, 40, 20), []);
check('AC-4 全新词表场景下一批 20 词',
  generateNewBatchIds(wordbank, 40, 20), wordbank.slice(40, 50).map(w => w.id));

// ---- AC-5：全词表学完不生成新词批次 ----
check('AC-5 学完不生成（尾部）', generateNewBatchIds(wordbank, 50, 10), []);
check('AC-5 学完不生成（首日即完成）', generateNewBatchIds(wordbank.slice(0, 10), 10, 10), []);

console.log(`\n${passed} 例通过，${failed} 例失败`);
process.exit(failed > 0 ? 1 : 0);
