#!/usr/bin/env node
/**
 * 从词重开起点搜索与清零重排验证（FT-005-US-05 各 AC 的可执行验收）
 *
 * 用法：
 *   node scripts/test-restart-from-word.mjs   # 或 pnpm test:restart
 *
 * 断言对象：
 *   - planRestartFromWord（src/utils/daily.ts）：清零重排纯函数（AC-2/AC-3/AC-4）；
 *   - schedule / batch：重排后起点前的词不再出现在复习清单、
 *     新词批次从起点词生成（AC-1 点选/AC-3 起点按第 1 天起算）。
 *
 * 环境要求：node ≥22.18（默认 type stripping，直接 import src/utils/*.ts）。
 * 退出码：0 全部断言通过；1 存在断言失败
 */
import { planRestartFromWord } from '../src/utils/daily.ts';
import { getDueReviewWordIds, REVIEW_NODES } from '../src/utils/schedule.ts';
import { generateNewBatchIds } from '../src/utils/batch.ts';
import { getDateStr } from '../src/utils/time.ts';

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

function checkTrue(label, cond) {
  if (cond) { passed++; } else { failed++; console.error(`失败: ${label}`); }
}

// ---- 测试数据构造：词表含 a、an、ability、abandon 语义顺序 ----
const words = ['abandon', 'a', 'an', 'ability', 'able', 'about', 'zoo'];
const wordbank = words.map((word, i) => ({ id: word, word }));
const day = (y, m, d, h = 9) => new Date(y, m - 1, d, h).getTime();
const mk = (id, learnedAt, reviewedNodes = []) => ({
  wordId: id, learnedAt, learnedDate: getDateStr(learnedAt), feedback: null, reviewedNodes,
});

// 假设起点前已学 abandon、a、an（120 词语义缩为 3 个），
// 其中 a、an 有未复习的到期节点（中断 ≥8 天必然到期）
const learnedBefore = [
  mk('abandon', day(2026, 9, 1), REVIEW_NODES),
  mk('a', day(2026, 9, 2), []),
  mk('an', day(2026, 9, 3), []),
];

// ============================================================
// AC-1：起点搜索（点选候选）——重排消费点选的 wordId
// ============================================================
const plan1 = planRestartFromWord('ability', wordbank, learnedBefore);
check('AC-1 起点选定为 ability 可重排', plan1 !== null, true);
check('AC-1 totalLearnedCount=起点下标 3', plan1 && plan1.totalLearnedCount, 3);

// ============================================================
// AC-2：词表外单词校验（zzz 不在词表 → 不进入重开）
// ============================================================
check('AC-2 词表外 zzz 返回 null 不进入重开', planRestartFromWord('zzz', wordbank, learnedBefore), null);
checkTrue('AC-2 词表内存在校验：able 在词表内可重排', planRestartFromWord('able', wordbank, learnedBefore) !== null);

// ============================================================
// AC-3：确认起点后回到第 1 天（起点词按当日学习日起算复习节点）
// ============================================================
const plan3 = planRestartFromWord('ability', wordbank, learnedBefore);
// 重排后新词批次从起点词生成
check('AC-3 重排后新批次首个词为 ability', plan3 && generateNewBatchIds(wordbank, plan3.totalLearnedCount, 2), ['ability', 'able']);
// 起点词作为新词从第 1 天学习：learnedAt=今日、无已复习节点、day2 节点按学习日起算
const today = day(2026, 10, 13);
const ability = mk('ability', today, []);
checkTrue('AC-3 起点词第 1 天无到期复习（day2 未到）', !getDueReviewWordIds([ability], today).includes('ability'));
checkTrue('AC-3 起点词学习日次日 day2 到期', getDueReviewWordIds([ability], day(2026, 10, 15)).includes('ability'));

// ============================================================
// AC-4：起点之前的词不再出现在任何复习清单
// ============================================================
const plan4 = planRestartFromWord('ability', wordbank, learnedBefore);
// 保留的起点前词全部节点已标记复习（统计上等同已学完）
check('AC-4 起点前词保留且全节点已复习',
  plan4 && plan4.learnedWords.map(w => w.reviewedNodes),
  [REVIEW_NODES, REVIEW_NODES, REVIEW_NODES]);
// 重排当日/任何后续日期，起点前的词不再出现在复习清单
for (const checkDay of [today, day(2026, 10, 20), day(2026, 11, 13)]) {
  const due = getDueReviewWordIds(plan4.learnedWords, checkDay);
  checkTrue(`AC-4 ${getDateStr(checkDay)} 复习清单不含 abandon/a/an`,
    !due.includes('abandon') && !due.includes('a') && !due.includes('an'));
}
// 起点词不在 learnedWords（尚未学习），也不会作为复习词出现
checkTrue('AC-4 起点词 ability 不在重排后 learnedWords', !plan4.learnedWords.some(w => w.wordId === 'ability'));

// ---- 边界 ----
check('AC-4 边界：起点为第 1 词（abandon）时 learnedWords 为空',
  planRestartFromWord('abandon', wordbank, learnedBefore).learnedWords, []);
checkTrue('AC-3 边界：起点为末词（zoo）可重排', planRestartFromWord('zoo', wordbank, learnedBefore) !== null);
check('AC-3 边界：起点为末词 totalLearnedCount=6',
  planRestartFromWord('zoo', wordbank, learnedBefore).totalLearnedCount, 6);
// 起点之后已学过的词（异常场景）也被清掉，不再进入复习
const weird = planRestartFromWord('ability', wordbank, [...learnedBefore, mk('about', day(2026, 9, 5), [])]);
checkTrue('AC-4 异常：起点后词 about 被清除不保留', !weird.learnedWords.some(w => w.wordId === 'about'));

console.log(`\nFT-005-US-05 验收测试：${passed} 通过，${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
