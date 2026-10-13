#!/usr/bin/env node
/**
 * 页面停留到点复习提醒验证（FT-005-US-06 各 AC 的可执行验收）
 *
 * 用法：
 *   node scripts/test-timed-reminder.mjs   # 或 pnpm test:reminder
 *
 * 断言对象：
 *   - planTimedReminder（src/utils/schedule.ts）：到点弹窗决策纯函数（AC-1/AC-2）；
 *   - getPendingNodes + planTimedReminder：点"现在复习"后节点标记、不再弹（AC-3）；
 *   - getDueReviewWordIds：错过提醒并入到期集合、同词只出现一次（AC-4）。
 *
 * 环境要求：node ≥22.18（默认 type stripping，直接 import src/utils/*.ts）。
 * 退出码：0 全部断言通过；1 存在断言失败
 */
import { planTimedReminder, getDueReviewWordIds, getPendingNodes } from '../src/utils/schedule.ts';
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

// ---- 测试数据：9 月 1 日 20:00 学完当天批次 10 词（实例化示例） ----
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const learnedAt = new Date(2026, 8, 1, 20, 0).getTime();
const ids = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'w10'];
const batch = ids.map(id => ({
  wordId: id, learnedAt, learnedDate: getDateStr(learnedAt), feedback: null, reviewedNodes: [],
}));

// ============================================================
// AC-1：满 30 分钟弹出复习提示
// ============================================================
check('AC-1 未到 30min 不弹', planTimedReminder(batch, [], learnedAt + 29 * MIN), null);
const p30 = planTimedReminder(batch, [], learnedAt + 30 * MIN);
check('AC-1 满 30min 弹出且类型为 30min', p30 && p30.type, '30min');
check('AC-1 弹窗词数 = 批次 10 词', p30 && p30.wordIds, ids);
check('AC-1 dismissKeys 覆盖全部 10 词的 30min 节点',
  p30 && p30.dismissKeys, ids.map(id => `${id}:30min`));

// ============================================================
// AC-2：满 12 小时再弹一次
// ============================================================
// 路径 a：30min 点"现在复习"→ 30min 节点已复习，12h 到点仅剩 12hr 节点
const reviewed30 = batch.map(w => ({ ...w, reviewedNodes: ['30min'] }));
check('AC-2a 30min 已复习后 11h 不弹', planTimedReminder(reviewed30, [], learnedAt + 11 * HOUR), null);
const p12a = planTimedReminder(reviewed30, [], learnedAt + 12 * HOUR);
check('AC-2a 满 12h 再弹且类型为 12hr', p12a && p12a.type, '12hr');
check('AC-2a 12hr 弹窗词数 = 10 词', p12a && p12a.wordIds, ids);

// 路径 b：30min 点"稍后再说"→ 登记 dismissKeys，12h 到点仍要弹（本次修复点）
const p30b = planTimedReminder(batch, [], learnedAt + 30 * MIN);
const dismissed = p30b.dismissKeys;
check('AC-2b 稍后再说后 30min 内不再弹', planTimedReminder(batch, dismissed, learnedAt + 31 * MIN), null);
const p12b = planTimedReminder(batch, dismissed, learnedAt + 12 * HOUR);
check('AC-2b 满 12h 仍弹且类型为 12hr（dismiss 不压制 12hr）', p12b && p12b.type, '12hr');
check('AC-2b 12hr 弹窗词数 = 10 词', p12b && p12b.wordIds, ids);

// 路径 c：12hr 也"稍后再说"→ 之后不再弹（两节点均已登记）
check('AC-2c 12hr 也稍后再说后不再弹',
  planTimedReminder(batch, [...dismissed, ...p12b.dismissKeys], learnedAt + 13 * HOUR), null);

// ============================================================
// AC-3：点"现在复习"→ 标记到期节点后不再弹（进入复习由 App 注入队列，UI 层）
// ============================================================
const nowAtClick = learnedAt + 30 * MIN;
const afterReview = batch.map(w => ({
  ...w,
  reviewedNodes: [...new Set([...w.reviewedNodes, ...getPendingNodes(w, nowAtClick)])],
}));
check('AC-3 现在复习标记 30min 节点后不再弹',
  planTimedReminder(afterReview, [], learnedAt + 31 * MIN), null);

// 混合批次：w1/w2 已过 12hr 节点（旧批次），其余仅 30min 到期 → 一次弹窗合并两类词，类型取 30min
const mixedNow = learnedAt + 12 * HOUR;
const older = ['old1', 'old2'].map(id => ({
  wordId: id, learnedAt: learnedAt - 12 * HOUR,
  learnedDate: getDateStr(learnedAt - 12 * HOUR), feedback: null, reviewedNodes: [],
}));
const mixed = [...older, ...batch];
const pm = planTimedReminder(mixed, [], mixedNow);
check('混合批次弹窗类型为 30min', pm && pm.type, '30min');
check('混合批次弹窗词包含 12 词', pm && pm.wordIds.length, 12);

// ============================================================
// AC-4：错过提醒并入到期集合（同词同日只出现一次，无补弹）
// ============================================================
// 9 月 1 日 20:30 用户已关闭浏览器，错过 30min 弹窗 → 9 月 2 日 09:00 打开
const nextOpen = new Date(2026, 8, 2, 9, 0).getTime();
const dueIds = getDueReviewWordIds(batch, nextOpen);
check('AC-4 错过提醒的词并入下次打开的复习清单', dueIds, ids);
checkTrue('AC-4 同词只出现一次（无重复）', new Set(dueIds).size === dueIds.length);
// 页面停留期间也不补弹过期提醒之外的内容：13h 后两节点均已过且未登记时仍只弹一次（由 plan 合并）
const p13 = planTimedReminder(batch, [], learnedAt + 13 * HOUR);
check('AC-4 13h 时 30min+12hr 同弹一次（类型 30min，词不重复）',
  p13 && { type: p13.type, n: p13.wordIds.length }, { type: '30min', n: 10 });

// ============================================================
console.log(`\n通过: ${passed}, 失败: ${failed}`);
if (failed > 0) process.exit(1);
