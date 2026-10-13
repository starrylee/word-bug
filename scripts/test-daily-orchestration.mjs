#!/usr/bin/env node
/**
 * 每日清单编排验证（FT-005-US-03 各 AC 的可执行验收）
 *
 * 用法：
 *   node scripts/test-daily-orchestration.mjs   # 或 pnpm test:daily
 *
 * 对 src/utils/daily.ts 的纯函数按实例化示例逐条断言：
 *   - AC-1：先复习后新词（9 月 8 日 15 个到期词 → 复习清单 → 过完后进入新词批次）；
 *   - AC-2：当天无复习词直入新词（9 月 1 日第 1 天首批）；
 *   - AC-3：无复习且无新词的兜底（全词表学完 → done / "今日任务已完成"）；
 *   - AC-4：当天任务完成后再次打开（15:00 再开仍判定完成，不重复生成清单）。
 *
 * 环境要求：node ≥22.18（默认 type stripping，直接 import src/utils/*.ts）。
 *
 * 退出码：0 全部断言通过；1 存在断言失败
 */
import { planDailySession, isDailyComplete } from '../src/utils/daily.ts';
import { getPendingNodes } from '../src/utils/schedule.ts';
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

// ---- 测试数据构造 ----
const pad = (n) => String(n).padStart(2, '0');
const wordbank = Array.from({ length: 30 }, (_, i) => ({
  id: `w${pad(i + 1)}`,
  word: `word${i + 1}`,
  definition: '', example: '', chinese: '',
}));
const day = (y, m, d, h = 9) => new Date(y, m - 1, d, h).getTime();
const mk = (id, learnedAt, reviewedNodes = []) => ({
  wordId: id, learnedAt, learnedDate: getDateStr(learnedAt), feedback: null, reviewedNodes,
});
// 模拟 store.completeReviewForWords：把当下全部到期节点记为已复习
const completeReview = (words, now) => words.map(w => ({
  ...w,
  reviewedNodes: [...new Set([...w.reviewedNodes, ...getPendingNodes(w, now)])],
}));

// ---- AC-1：先复习后新词 ----
// 示例 1：9 月 8 日打开，15 个词于 9 月 6 日学习（第 2 天节点 9 月 8 日 00:00 到期）
const nowSep8 = day(2026, 9, 8);
const fifteen = Array.from({ length: 15 }, (_, i) => mk(`w${pad(i + 1)}`, day(2026, 9, 6, 9)));
const planOpen = planDailySession(wordbank, fifteen, 15, 10, nowSep8, false, false, null);
check('AC-1 打开先进入当天复习清单', planOpen.phase, 'review');
check('AC-1 复习清单为 15 个到期词', planOpen.reviewWordIds, fifteen.map(w => w.wordId));

// 逾期词并入当日复习（9 月 2 日学习，第 2 天节点 9 月 4 日已错过）
const overdue = mk('w16', day(2026, 9, 2, 9));
check('AC-1 逾期未复习词并入当日复习清单',
  planDailySession(wordbank, [overdue], 1, 10, nowSep8, false, false, null).phase, 'review');

// 复习清单过完（store 置 todayReviewDone + 节点已复习）→ 进入新词批次
const afterReview = completeReview(fifteen, nowSep8);
const planNew = planDailySession(wordbank, afterReview, 15, 10, nowSep8, true, false, null);
check('AC-1 复习清单过完后进入新词学习', planNew.phase, 'new');
check('AC-1 新词批次为第 16~25 词', planNew.newWordIds, wordbank.slice(15, 25).map(w => w.id));
check('AC-1 新批次需生成并持久化快照', planNew.newBatchIds, wordbank.slice(15, 25).map(w => w.id));

// 当日复习已过、新词半批中断后再打开 → 直入新词续背（AC-4 批次不重复生成）
const batchSep8 = { wordIds: wordbank.slice(15, 25).map(w => w.id), date: '2026-09-08' };
const learnedMid = Array.from({ length: 18 }, (_, i) => mk(`w${pad(i + 1)}`, nowSep8));
const planResume = planDailySession(wordbank, learnedMid, 18, 10, nowSep8, true, false, batchSep8);
check('AC-1 当日再打开（复习已过）直入新词续背', planResume.phase, 'new');
check('AC-1 续背批次剩余词（第 19~25 词）', planResume.newWordIds, wordbank.slice(18, 25).map(w => w.id));
check('AC-1 续背不重复生成新批次', planResume.newBatchIds, null);

// ---- AC-2：当天无复习词直入新词 ----
// 示例 1：9 月 1 日（第 1 天）首次打开，无任何已学词
const planFirst = planDailySession(wordbank, [], 0, 10, day(2026, 9, 1), false, false, null);
check('AC-2 第 1 天无复习词直入新词', planFirst.phase, 'new');
check('AC-2 直接进入第一批新词（第 1~10 词）', planFirst.newWordIds, wordbank.slice(0, 10).map(w => w.id));

// ---- AC-3：无复习且无新词的兜底 ----
// 示例 1：词表全部学完，最后一批的第 30 天复习已于昨日完成 → 次日打开显示"今日任务已完成"
const allNodes = ['30min', '12hr', 'day2', 'day4', 'day8', 'day15', 'day30'];
const allLearned = Array.from({ length: 30 }, (_, i) => mk(`w${pad(i + 1)}`, day(2026, 8, 1, 9), allNodes));
const nowNext = day(2026, 9, 1);
const planDone = planDailySession(wordbank, allLearned, 30, 10, nowNext, false, false, null);
check('AC-3 全词表学完且无到期词 → done', planDone.phase, 'done');
check('AC-3 不重复生成复习/新词队列',
  [planDone.reviewWordIds, planDone.newWordIds, planDone.newBatchIds], [[], [], null]);
check('AC-3 isDailyComplete=true（显示今日任务已完成）',
  isDailyComplete(allLearned, 30, 30, nowNext, false, false), true);

// 反例：存在到期未复习的日程节点 → 未完成，先复习
const oneDue = mk('w01', day(2026, 8, 1, 9), ['30min', '12hr', 'day2', 'day4', 'day8', 'day15']);
check('AC-3 反例：day30 到期未复习 → 未完成',
  isDailyComplete([oneDue], 1, 1, day(2026, 8, 31), false, false), false);
check('AC-3 反例：编排为复习阶段',
  planDailySession(wordbank, [oneDue], 1, 10, day(2026, 8, 31), false, false, null).phase, 'review');

// ---- AC-4：当天任务完成后再次打开 ----
// 示例 1：10 月 5 日 10:00 过完当天全部清单（含"忘了"重现遍，由卡片会话内部消化），
// 15:00 再次打开 → 仍显示"今日任务已完成"，不重复生成当天清单
const todayLearned = Array.from({ length: 10 }, (_, i) => mk(`w${pad(i + 1)}`, day(2026, 10, 5, 10)));
const nowReopen = day(2026, 10, 5, 15);
check('AC-4 15:00 再次打开仍判定已完成（30min 提醒已到期但不翻回完成态）',
  isDailyComplete(todayLearned, 10, 30, nowReopen, true, true), true);
const planReopen = planDailySession(wordbank, todayLearned, 10, 10, nowReopen, true, true, null);
check('AC-4 不重复生成当天清单（phase=done）', planReopen.phase, 'done');
check('AC-4 队列与批次均为空',
  [planReopen.reviewWordIds, planReopen.newWordIds, planReopen.newBatchIds], [[], [], null]);
check('AC-4 反例：新词清单未过完不判完成',
  isDailyComplete(todayLearned, 10, 30, nowReopen, true, false), false);

console.log(`\n${passed} 例通过，${failed} 例失败`);
process.exit(failed > 0 ? 1 : 0);
