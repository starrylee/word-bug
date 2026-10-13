#!/usr/bin/env node
/**
 * 第 3 自然日"保存进度"提示验证（FT-006-US-01 各 AC 的可执行验收）
 *
 * 用法：
 *   node scripts/test-save-prompt.mjs   # 或 pnpm test:saveprompt
 *
 * 断言对象：
 *   - planSavePrompt（src/utils/savePrompt.ts）：弹窗决策纯函数
 *     （AC-1 第 3 自然日 / AC-3 按自然日重弹 / AC-4 注册终止）；
 *   - AC-2 为 UI 交互行为（"以后再说"仅关闭弹窗、不设永久开关），
 *     由 store 的 markSavePromptShown 语义保证——本脚本断言其数据效应
 *     （弹出时刻登记日期 → 同日不重复弹、次日再弹）。
 *
 * 环境要求：node ≥22.18（默认 type stripping，直接 import src/utils/*.ts）。
 * 退出码：0 全部断言通过；1 存在断言失败
 */
import { planSavePrompt } from '../src/utils/savePrompt.ts';
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

// ---- 测试数据：游客 2026-10-01 10:00 首次背词（实例化示例） ----
const firstStudy = new Date(2026, 9, 1, 10, 0).getTime();
check('数据前提：首次背词日期归一化为 2026-10-01', getDateStr(firstStudy), '2026-10-01');

const plan = (todayStr, lastPromptDate = null, isGuest = true) =>
  planSavePrompt({ isGuest, firstStudyTimestamp: firstStudy, lastPromptDate, todayStr });

// ============================================================
// AC-1：第 3 自然日首次打开触发提示
// ============================================================
// 示例 1：10-01 首次背词，10-03（第 3 个自然日）首次打开 → 弹
check('AC-1 示例1：10-03 首开弹出提示', plan('2026-10-03'), true);
// 示例 2（口径边界）：10-02 全天未打开，10-03 打开 → 仍弹（日历口径）
check('AC-1 示例2：中间日未打开不影响（日历口径）', plan('2026-10-03'), true);
// 示例 3（反例）：前 2 个自然日不弹
check('AC-1 示例3 反例：首日 10-01 不弹', plan('2026-10-01'), false);
check('AC-1 示例3 反例：第 2 日 10-02 不弹', plan('2026-10-02'), false);
// 首次背词发生在当天深夜：自然日口径只看日期不看时刻
const firstStudyLate = new Date(2026, 9, 1, 23, 50).getTime();
check('AC-1 边界：首日 23:50 背词，10-03 仍弹',
  planSavePrompt({ isGuest: true, firstStudyTimestamp: firstStudyLate, lastPromptDate: null, todayStr: '2026-10-03' }), true);
// 未开始背词（无 firstStudyTimestamp）不弹
check('AC-1 前置：未背过词不弹',
  planSavePrompt({ isGuest: true, firstStudyTimestamp: null, lastPromptDate: null, todayStr: '2026-10-03' }), false);

// ============================================================
// AC-2："以后再说"关闭且不强制（数据效应：不设永久开关）
// ============================================================
// dismiss 只关闭 UI；日期在弹出时刻登记（此处模拟 markSavePromptShown('2026-10-03')）。
// 若 dismissal 是永久开关（旧实现 savePromptDismissed=true），则 AC-3 的次日重弹会失败——
// 见下方 AC-3 断言。同日内（刷新/重开）不再弹：
check('AC-2/AC-3 同日不重复：10-03 已弹过（含点了以后再说），当日再开不弹', plan('2026-10-03', '2026-10-03'), false);

// ============================================================
// AC-3：未注册时每个自然日首次打开再弹一次
// ============================================================
// 示例 1：10-03 点了"以后再说"，10-04 首开 → 再弹
check('AC-3 示例1：次日首开再弹', plan('2026-10-04', '2026-10-03'), true);
// 示例 2：10-04 已弹过，当日第 2 次打开 → 不弹
check('AC-3 示例2：同日第 2 次打开不重复弹', plan('2026-10-04', '2026-10-04'), false);
// 后续每个自然日均如此（如 10-10）
check('AC-3 后续任一自然日首开再弹（10-10）', plan('2026-10-10', '2026-10-09'), true);
// 弹出后隔多日才再开（中间日期未打开）→ 仍弹
check('AC-3 中断多日后首开仍弹', plan('2026-10-20', '2026-10-03'), true);

// ============================================================
// AC-4：注册成功后停止提示
// ============================================================
check('AC-4 示例1：注册后 10-04 不弹', plan('2026-10-04', '2026-10-03', false), false);
check('AC-4 注册后任何时点不弹（含从未弹过）', plan('2026-10-10', null, false), false);
check('AC-4 注册后当天（刚注册）不弹', plan('2026-10-03', null, false), false);

// ---- 汇总 ----
console.log(`\n通过 ${passed} 例，失败 ${failed} 例`);
if (failed > 0) process.exit(1);
