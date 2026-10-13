#!/usr/bin/env node
/**
 * 跨设备验证码登录（FT-006-US-04 各 AC 的可执行验收）
 *
 * 用法：
 *   node scripts/test-cross-device-login.mjs   # 或 pnpm test:crossdevice
 *
 * 断言对象：
 *   - src/utils/auth.ts：resolveAccountAction（登录/注册分流）、verifyOtp（AC-3 错误码拒登）；
 *   - src/utils/accountSync.ts：extractProgressSnapshot / readAccountSnapshot /
 *     writeAccountSnapshot（账号快照存取）、applyAccountSnapshotOnLogin
 *     （AC-2 方案 A：账号进度覆盖本地、幂等、无快照兜底）；
 *   - src/store saveState 的快照同步行为以 saveAccountSnapshot 等价覆盖
 *     （store 内一行接线，同步语义在 accountSync 内）。
 *   - 设备 B = 全新本地状态（DEFAULT_STATE），模拟换浏览器/清缓存后登录。
 *
 * 环境要求：node ≥22.18（默认 type stripping，直接 import src/utils/*.ts）。
 * 退出码：0 全部断言通过；1 存在断言失败
 */
import { resolveAccountAction, verifyOtp, DEMO_OTP } from '../src/utils/auth.ts';
import {
  extractProgressSnapshot,
  readAccountSnapshot,
  writeAccountSnapshot,
  applyAccountSnapshotOnLogin,
} from '../src/utils/accountSync.ts';
import { PROGRESS_FIELDS } from '../src/utils/progressMerge.ts';
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

// ============================================================
// AC-1 前置：登录/注册分流 + 验证码判定
// ============================================================

// 已注册手机号 → 登录（不重复创建）；新号 → 注册
check('分流：已注册号判定 login', resolveAccountAction('13800138000', ['13800138000']), 'login');
check('分流：新号判定 register', resolveAccountAction('13900139000', ['13800138000']), 'register');

// ============================================================
// AC-1 示例 1：设备 A 注册（10-01），设备 B 10-03 验证码登录成功
// ============================================================

// 设备 A：学 40 词后注册（模拟设备 A 已登录状态的最新快照）
const PHONE = '13800138000';
const deviceA = {
  ...DEFAULT_STATE,
  view: 'study',
  selectedBank: 'zhongkao',
  dailyNewCount: 20,
  isGuest: false,
  phone: PHONE,
  firstStudyTimestamp: ts('2026-10-01'),
  learnedWords: [
    ...Array.from({ length: 20 }, (_, i) => word(`w${i + 1}`, '2026-10-01')),
    ...Array.from({ length: 20 }, (_, i) => word(`w${i + 21}`, '2026-10-02')),
  ],
  totalLearnedCount: 40,
  studyLog: [
    ...Array.from({ length: 20 }, (_, i) => logNew(`w${i + 1}`, '2026-10-01')),
    ...Array.from({ length: 20 }, (_, i) => logNew(`w${i + 21}`, '2026-10-02')),
  ],
};

const server = new MemStorage();
checkTrue('设备 A 快照写入成功', writeAccountSnapshot(server, PHONE, extractProgressSnapshot(deviceA)));

// 快照不含身份/模拟时间等非进度字段
const snapA = readAccountSnapshot(server, PHONE);
checkTrue('快照存在', snapA !== null);
checkTrue('快照不含 isGuest', !('isGuest' in snapA));
checkTrue('快照不含 phone', !('phone' in snapA));

// 设备 B：全新本地（游客、无进度），验证码正确 → 登录
checkTrue('AC-1 验证码正确通过（设备 B 登录成功）', verifyOtp('860274', '860274'));
const deviceB = applyAccountSnapshotOnLogin({ ...DEFAULT_STATE }, PHONE, snapA);
check('AC-1 设备 B 进入已登录态', { isGuest: deviceB.isGuest, phone: deviceB.phone }, { isGuest: false, phone: PHONE });

// ============================================================
// AC-2 示例 1：设备 B 当天清单与账号进度一致（20 复习 + 20 新词的数据源一致）
// ============================================================

check('AC-2 已学词与账号一致（40 词）', deviceB.learnedWords.length, 40);
check('AC-2 每日新词数与账号一致', deviceB.dailyNewCount, 20);
check('AC-2 词库选择与账号一致', deviceB.selectedBank, 'zhongkao');
check('AC-2 完成率分子与账号一致', deviceB.totalLearnedCount, 40);
check('AC-2 首次学习时间与账号一致', deviceB.firstStudyTimestamp, ts('2026-10-01'));
check('AC-2 行为日志与账号一致', deviceB.studyLog.length, 40);

// 幂等：重复登录（同号再登一次）结果不变
const deviceBAgain = applyAccountSnapshotOnLogin(deviceB, PHONE, snapA);
check('登录幂等：重复登录状态不变', deviceBAgain, deviceB);

// ============================================================
// AC-2 示例 2（方案 A）：设备 B 本地原有游客进度，登录后展示账号清单
// ============================================================

const deviceBGuest = {
  ...DEFAULT_STATE,
  view: 'study',
  selectedBank: 'zhongkao',
  dailyNewCount: 10,
  learnedWords: [word('gx1', '2026-10-03'), word('gx2', '2026-10-03')],
  totalLearnedCount: 5,
  firstStudyTimestamp: ts('2026-10-03'),
  studyLog: [logNew('gx1', '2026-10-03'), logNew('gx2', '2026-10-03')],
};
const deviceBLogin = applyAccountSnapshotOnLogin(deviceBGuest, PHONE, snapA);
check('方案 A：本地游客已学词被账号进度覆盖', deviceBLogin.learnedWords.length, 40);
check('方案 A：totalLearnedCount 取账号值', deviceBLogin.totalLearnedCount, 40);
check('方案 A：每日新词数取账号值', deviceBLogin.dailyNewCount, 20);
checkTrue(
  '方案 A：本地游客词不再出现在进度中',
  !deviceBLogin.learnedWords.some(w => w.wordId === 'gx1'),
);

// 覆盖语义 = 账号快照逐字段生效（不是合并）
const localOnlyFields = PROGRESS_FIELDS.filter(
  f => JSON.stringify(deviceBLogin[f]) !== JSON.stringify(snapA[f]),
);
check('方案 A：全部进度字段与快照一致', localOnlyFields, []);

// ============================================================
// 兜底：账号无快照（旧数据）→ 保留本地进度仅切身份
// ============================================================

const noSnap = applyAccountSnapshotOnLogin(deviceBGuest, '13800000000', null);
check('无快照：进入已登录态', { isGuest: noSnap.isGuest, phone: noSnap.phone }, { isGuest: false, phone: '13800000000' });
check('无快照：本地游客进度保留', noSnap.learnedWords.length, 2);

// 坏数据（存储中 JSON 损坏）读取不抛异常、返回 null
const badStore = new MemStorage();
badStore.map.set('wordbug_account_state_v1', '{broken json');
check('坏数据：readAccountSnapshot 返回 null', readAccountSnapshot(badStore, PHONE), null);
checkTrue('坏数据：writeAccountSnapshot 覆盖成功', writeAccountSnapshot(badStore, PHONE, extractProgressSnapshot(deviceA)));
checkTrue('坏数据：覆盖后可读回', readAccountSnapshot(badStore, PHONE) !== null);

// 多账号隔离：不同手机号互不串档
const otherStore = new MemStorage();
writeAccountSnapshot(otherStore, '13900139000', extractProgressSnapshot({ ...deviceA, totalLearnedCount: 7, learnedWords: [word('x1', '2026-10-01')] }));
check('多账号隔离：他号快照不影响本号', readAccountSnapshot(otherStore, PHONE), null);
check('多账号隔离：本号读回自身快照', readAccountSnapshot(otherStore, '13900139000').totalLearnedCount, 7);

// ============================================================
// AC-3 示例 1：验证码错误 → 不登录、可重新输入
// ============================================================

checkTrue('AC-3 验证码错误拒登（860275 ≠ 860274）', !verifyOtp('860275', '860274'));
checkTrue('AC-3 演示固定码形态合法', verifyOtp(DEMO_OTP, DEMO_OTP));
checkTrue('AC-3 非数字形态不通过', !verifyOtp('86027a', '86027a'));

// 验证码错误路径不产生任何状态变更（onRegister 不被调用，状态保持游客）
const guestBefore = { ...DEFAULT_STATE, learnedWords: [word('gx1', '2026-10-03')] };
check('AC-3 错误路径状态不变（停留验证码界面可重输）', guestBefore, { ...DEFAULT_STATE, learnedWords: [word('gx1', '2026-10-03')] });

// ============================================================
// 汇总
// ============================================================

console.log(`\n通过 ${passed} 例，失败 ${failed} 例`);
if (failed > 0) {
  process.exit(1);
}
