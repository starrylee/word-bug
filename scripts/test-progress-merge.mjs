#!/usr/bin/env node
/**
 * 注册后进度保留与行为归并（FT-006-US-03 各 AC 的可执行验收）
 *
 * 用法：
 *   node scripts/test-progress-merge.mjs   # 或 pnpm test:merge
 *
 * 断言对象：
 *   - src/utils/progressMerge.ts 纯函数：
 *     mergeProgressOnRegister / progressUnchanged（AC-1 进度完整保留、幂等）、
 *     mergeStudyLogOnRegister（AC-2 行为归并去重幂等）、
 *     countNewWordsByDate（AC-2 完成率连续的按日口径）；
 *   - src/utils/accountStore.ts：readAccountStudyLog / writeAccountStudyLog /
 *     mergeGuestLogIntoAccount 的依赖注入版逻辑（浏览器便捷版直接依赖
 *     localStorage，其合并语义已由 mergeStudyLogOnRegister 覆盖）。
 *   - src/store 的 registerPhone 行为以 mergeProgressOnRegister 等价覆盖
 *     （store 仅一行接线，进度保留语义全部在纯函数内）。
 *
 * 环境要求：node ≥22.18（默认 type stripping，直接 import src/utils/*.ts）。
 * 退出码：0 全部断言通过；1 存在断言失败
 */
import {
  mergeProgressOnRegister,
  progressUnchanged,
  mergeStudyLogOnRegister,
  countNewWordsByDate,
  PROGRESS_FIELDS,
} from '../src/utils/progressMerge.ts';
import {
  readAccountStudyLog,
  writeAccountStudyLog,
} from '../src/utils/accountStore.ts';
import { DEFAULT_STATE } from '../src/types.ts';

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

class MemStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, v); }
}

const ts = (dateStr, hour = 10) => new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00`).getTime();
const word = (id, dateStr, hour) => ({
  wordId: id, learnedAt: ts(dateStr, hour), learnedDate: dateStr,
  feedback: null, reviewedNodes: [],
});
const logNew = (id, dateStr, hour) => ({
  ts: ts(dateStr, hour), wordId: id, action: 'new_word', feedback: null,
});
const logFb = (id, dateStr, hour, feedback, list) => ({
  ts: ts(dateStr, hour), wordId: id, action: 'feedback', feedback, list,
});

// ============================================================
// AC-1：游客进度完整保留
// ============================================================

// 示例 1：10-01 学 20 词、10-02 学 20 词，每日新词数 20，10-03 注册
const guest1 = {
  ...DEFAULT_STATE,
  selectedBank: 'zhongkao',
  dailyNewCount: 20,
  firstStudyTimestamp: ts('2026-10-01'),
  learnedWords: [word('w1', '2026-10-01'), word('w2', '2026-10-02')],
  totalLearnedCount: 2,
  studyLog: [logNew('w1', '2026-10-01'), logNew('w2', '2026-10-02')],
};
const after1 = mergeProgressOnRegister(guest1, '13800138000');
checkTrue('AC-1 示例1：进度字段全部不变', progressUnchanged(guest1, after1));
check('AC-1 示例1：账号身份切换', [after1.phone, after1.isGuest], ['13800138000', false]);
check('AC-1 示例1：已学词保留（40 词示例以 2 词实例化）', after1.learnedWords.length, 2);
check('AC-1 示例1：每日新词数仍为 20', after1.dailyNewCount, 20);
// 复习安排数据源（learnedWords 的 learnedAt/reviewedNodes）不变 → 当天复习清单与注册前一致
check('AC-1 示例1：复习安排数据源（learnedWords）一致',
  after1.learnedWords, guest1.learnedWords);

// 示例 2（中途注册）：当天清单背到一半（复习 20 已背 12）时注册
const guest2 = {
  ...DEFAULT_STATE,
  dailyNewCount: 20,
  learnedWords: [word('r1', '2026-10-01'), word('r2', '2026-10-01')],
  currentNewBatch: { wordIds: ['r1', 'r2', 'r3', 'r4'], date: '2026-10-03' },
  studyLog: [logFb('r1', '2026-10-03', 9, 'know', 'review'), logFb('r2', '2026-10-03', 9, 'fuzzy', 'review')],
};
const after2 = mergeProgressOnRegister(guest2, '13800138000');
checkTrue('AC-1 示例2：中途注册进度不变', progressUnchanged(guest2, after2));
check('AC-1 示例2：当天批次快照保留（从第 13 个词继续的词级基础）',
  after2.currentNewBatch, guest2.currentNewBatch);
check('AC-1 示例2：当天已背 12 词的行为记录保留',
  after2.studyLog.length, 2);

// 幂等：同一手机号重复注册/登录重入返回原引用
const again = mergeProgressOnRegister(after1, '13800138000');
checkTrue('AC-1 幂等：已登录同号返回原引用', again === after1);

// 切换账号（不同手机号登录）仍保留进度、仅换身份
const switched = mergeProgressOnRegister(after1, '13900139000');
checkTrue('AC-1 换号登录：进度仍不变', progressUnchanged(after1, switched));
check('AC-1 换号登录：phone 更新', switched.phone, '13900139000');

// 进度字段清单覆盖核心进度（防 PROGRESS_FIELDS 退化遗漏）
checkTrue('PROGRESS_FIELDS 覆盖已学词与每日新词数设置',
  PROGRESS_FIELDS.includes('learnedWords') && PROGRESS_FIELDS.includes('dailyNewCount'));

// ============================================================
// AC-2：匿名行为归并到账号、完成率统计连续
// ============================================================

// 示例 1：游客 10-01～10-03 行为归并到账号
const guestLog = [
  logNew('w1', '2026-10-01', 10), logNew('w2', '2026-10-01', 10),
  logNew('w3', '2026-10-02', 10),
  logNew('w4', '2026-10-03', 11), logFb('w4', '2026-10-03', 11, 'know', 'daily_new'),
];
const accountExisting = [logNew('w0', '2026-09-30', 10)]; // 账号已有历史（换设备登录场景）
const merged = mergeStudyLogOnRegister(accountExisting, guestLog);
check('AC-2 示例1：归并后日志含全部 6 条且按时间排序',
  merged.map(e => e.wordId ?? ''), ['w0', 'w1', 'w2', 'w3', 'w4', 'w4']);

// 完成率连续：按日新词数 = 注册前（10-01:2、10-02:1、10-03:1）无断裂、注册日不重计
check('AC-2 示例1：按日新词数统计连续',
  countNewWordsByDate(merged),
  { '2026-09-30': 1, '2026-10-01': 2, '2026-10-02': 1, '2026-10-03': 1 });

// 幂等：同一份游客日志重复归并结果不变
check('AC-2 幂等：重复归并不产生重复记录',
  mergeStudyLogOnRegister(merged, guestLog).length, merged.length);

// 去重粒度：同 ts 同词同 action 只算一次（设备标识不同但事件相同）
const dup = mergeStudyLogOnRegister([], [...guestLog, logNew('w1', '2026-10-01', 10)]);
check('AC-2 去重：相同事件键的重复记录只保留一份', dup.length, guestLog.length);

// 空游客日志 / 空账号日志边界
check('AC-2 边界：空游客日志归并返回账号日志原样',
  mergeStudyLogOnRegister(accountExisting, []), accountExisting);
check('AC-2 边界：空账号日志归并返回游客日志',
  mergeStudyLogOnRegister([], guestLog), [...guestLog].sort((a, b) => a.ts - b.ts));

// ============================================================
// 账号行为日志库（accountStore 依赖注入版）
// ============================================================
const storage = new MemStorage();
check('账号日志：初始为空', readAccountStudyLog(storage, '13800138000'), []);
checkTrue('账号日志：写入成功', writeAccountStudyLog(storage, '13800138000', guestLog));
check('账号日志：读回一致', readAccountStudyLog(storage, '13800138000'), guestLog);
// 多账号隔离
writeAccountStudyLog(storage, '13900139000', accountExisting);
check('账号日志：账号间隔离',
  readAccountStudyLog(storage, '13900139000'), accountExisting);
// 坏数据容错
const bad = new MemStorage();
bad.map.set('wordbug_account_progress_v1', '{not json');
check('账号日志：坏数据容错为空', readAccountStudyLog(bad, '13800138000'), []);

// ============================================================
// 归并后继续学习：注册后新增行为（演示完成率统计在账号口径下延续）
// ============================================================
const postRegisterLog = [...merged, logNew('w5', '2026-10-04', 10)];
check('AC-2 延续：注册后新词计入后续日期',
  countNewWordsByDate(postRegisterLog)['2026-10-04'], 1);

// ---- 汇总 ----
console.log(`\n通过 ${passed} 例，失败 ${failed} 例`);
if (failed > 0) process.exit(1);
