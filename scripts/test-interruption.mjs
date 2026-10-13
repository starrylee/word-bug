#!/usr/bin/env node
/**
 * 中断顺延与恢复选择验证（FT-005-US-04 各 AC 的可执行验收）
 *
 * 用法：
 *   node scripts/test-interruption.mjs   # 或 pnpm test:interrupt
 *
 * 断言对象：
 *   - planBreakReturn（src/utils/daily.ts）：中断天数口径与 7/8 天边界（AC-3/AC-5）；
 *   - planDailySession / planNewPhase + schedule/batch：短期中断全量顺延、
 *     每词只出现一次、新词从断点批次继续（AC-1/AC-2/AC-4）。
 *
 * 环境要求：node ≥22.18（默认 type stripping，直接 import src/utils/*.ts）。
 * 退出码：0 全部断言通过；1 存在断言失败
 */
import { planDailySession, planNewPhase, planBreakReturn } from '../src/utils/daily.ts';
import { getDueReviewWordIds } from '../src/utils/schedule.ts';
import { getRemainingBatchWordIds, generateNewBatchIds } from '../src/utils/batch.ts';
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
const wordbank = Array.from({ length: 60 }, (_, i) => ({
  id: `w${pad(i + 1)}`,
  word: `word${i + 1}`,
  definition: '', example: '', chinese: '',
}));
const day = (y, m, d, h = 9) => new Date(y, m - 1, d, h).getTime();
const mk = (id, learnedAt, reviewedNodes = []) => ({
  wordId: id, learnedAt, learnedDate: getDateStr(learnedAt), feedback: null, reviewedNodes,
});

// ============================================================
// AC-5（先测边界，因其为 AC-3 的触发条件）：中断天数 7/8 天边界
// ============================================================
// 示例 1：第 4 到 10 天没打开（7 天中断），最后打开第 3 天，第 11 天回来
check('AC-5 中断 7 天 missedDays=7', planBreakReturn('2026-10-03', '2026-10-11'), { missedDays: 7, showChoice: false });
// 示例 2（边界反例）：第 4 到 11 天没打开（8 天中断），第 12 天回来
check('AC-5 中断 8 天弹选择', planBreakReturn('2026-10-03', '2026-10-12'), { missedDays: 8, showChoice: true });
// 更长中断仍弹
check('AC-5 中断 15 天弹选择', planBreakReturn('2026-10-03', '2026-10-19'), { missedDays: 15, showChoice: true });
// 短期中断各档不弹（1/3/7 天）
check('AC-5 中断 1 天不弹', planBreakReturn('2026-10-10', '2026-10-12'), { missedDays: 1, showChoice: false });
check('AC-5 中断 3 天不弹', planBreakReturn('2026-10-07', '2026-10-11'), { missedDays: 3, showChoice: false });
check('AC-5 连续打开不弹', planBreakReturn('2026-10-11', '2026-10-11'), { missedDays: 0, showChoice: false });
check('AC-5 首次使用无记录不弹', planBreakReturn(null, '2026-10-11'), { missedDays: 0, showChoice: false });

// ============================================================
// AC-1：短期中断回来当天全量顺延复习，每个词只出现一次
// ============================================================
// 场景：第 1~3 天各学 10 词（10/11/12），第 4、5、6 天没打开（3 天中断），
// 第 7 天（10-17）回来。10-10 学的词 day2 节点 10-12 到期（未复习）、
// 10-11 学的词 day2 节点 10-13 到期、10-12 学的词 day2 节点 10-14 到期，
// 且 10-10 的 30min/12hr 节点也早已到期未复习。
const batch1 = Array.from({ length: 10 }, (_, i) => mk(`w${pad(i + 1)}`, day(2026, 10, 10, 9)));
const batch2 = Array.from({ length: 10 }, (_, i) => mk(`w${pad(i + 11)}`, day(2026, 10, 11, 9)));
const batch3 = Array.from({ length: 10 }, (_, i) => mk(`w${pad(i + 21)}`, day(2026, 10, 12, 9)));
const learned = [...batch1, ...batch2, ...batch3];
const returnDay = day(2026, 10, 17, 20); // 第 7 天晚上回来

// 到期集合：3 批 30 词全部有到期未复习节点
const due = getDueReviewWordIds(learned, returnDay);
check('AC-1 顺延清单含 30 个到期词', due.length, 30);
check('AC-1 每个词只出现一次', new Set(due).size, 30);

// 编排：回来当天先复习（todayReviewDone=false）
const planReturn = planDailySession(wordbank, learned, 30, 10, returnDay, false, false, null);
check('AC-1 回来当天先进入复习清单', planReturn.phase, 'review');
check('AC-1 复习清单 = 全部 30 个到期旧词', planReturn.reviewWordIds, due);

// ============================================================
// AC-2：顺延后新词从断点批次继续（totalLearnedCount=30 断点）
// ============================================================
// 复习过完后进入新词：从断点（第 30 词后）生成"原本第 4 天"的那一批
const planNew = planNewPhase(wordbank, learned, 30, 10, null);
check('AC-2 新词从断点批次继续（第 31~40 词）', planNew.wordIds,
  wordbank.slice(30, 40).map(w => w.id));

// 半批中断场景：断点批次只背了前 4 个（词级续背）
const partialBatch = { wordIds: wordbank.slice(30, 40).map(w => w.id), date: '2026-10-13' };
const learnedAfterPartial = [...learned, ...Array.from({ length: 4 }, (_, i) =>
  mk(`w${pad(i + 31)}`, day(2026, 10, 13, 9)))];
const planResume = planNewPhase(wordbank, learnedAfterPartial, 34, 10, partialBatch);
check('AC-2 半批中断后从该批第 5 词续背', planResume.wordIds,
  wordbank.slice(34, 40).map(w => w.id));
check('AC-2 续背无需新生成批次', planResume.newBatchIds, null);
check('AC-2 getRemainingBatchWordIds 与计划一致',
  getRemainingBatchWordIds(partialBatch, learnedAfterPartial), planResume.wordIds);

// 无批次时 generateNewBatchIds 从断点顺序取（不补生成缺失天数的新词）
check('AC-2 跨日中断不补生成缺失天数批次', generateNewBatchIds(wordbank, 30, 10),
  wordbank.slice(30, 40).map(w => w.id));

// ============================================================
// AC-4：长期中断选择"继续按当前节奏"等同短期处理
// ============================================================
// 场景：第 4 到 11 天没打开（8 天中断），第 12 天（10-24）回来选"继续"。
// 断点仍是第 3 天学完的 30 词，处理方式与 AC-1/AC-2 完全一致。
const planLong = planDailySession(wordbank, learned, 30, 10, day(2026, 10, 24, 20), false, false, null);
check('AC-4 长中断选继续：先全量顺延复习', planLong.phase, 'review');
check('AC-4 长中断选继续：复习清单含全部 30 词', planLong.reviewWordIds.length, 30);
check('AC-4 长中断选继续：每词只出现一次', new Set(planLong.reviewWordIds).size, 30);
const planNewLong = planNewPhase(wordbank, learned, 30, 10, null);
check('AC-4 长中断选继续：新词从断点批次继续', planNewLong.wordIds,
  wordbank.slice(30, 40).map(w => w.id));

// ============================================================
console.log(`\nFT-005-US-04 验收：${passed} 通过，${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
