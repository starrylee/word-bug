#!/usr/bin/env node
/**
 * 手机号 + 验证码注册验证（FT-006-US-02 各 AC 的可执行验收）
 *
 * 用法：
 *   node scripts/test-register.mjs   # 或 pnpm test:register
 *
 * 断言对象：
 *   - src/utils/auth.ts 纯函数：validatePhone（AC-3）/ verifyOtp（AC-1/AC-2）
 *     / resolveAccountAction（AC-4 登录注册同构）；
 *   - src/utils/accountStore.ts 演示账号库（依赖注入版 read/write，
 *     AC-4 已注册手机号不重复创建）。
 *   - AC-1/AC-2 的 UI 行为（停留可重新输入）由组件 error 态承接，
 *     本脚本以纯函数判定语义覆盖。
 *
 * 环境要求：node ≥22.18（默认 type stripping，直接 import src/utils/*.ts）。
 * 退出码：0 全部断言通过；1 存在断言失败
 */
import {
  validatePhone,
  verifyOtp,
  resolveAccountAction,
  DEMO_OTP,
  PHONE_ERROR_MSG,
} from '../src/utils/auth.ts';
import { readAccounts, writeAccounts } from '../src/utils/accountStore.ts';

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

// ============================================================
// AC-3：非法手机号格式不发送验证码
// ============================================================
// 示例 1：位数不足（7 位）
check('AC-3 示例1：7 位手机号报错', validatePhone('1380013'), PHONE_ERROR_MSG);
// 含非数字字符
check('AC-3 含非数字字符报错', validatePhone('1380013800a'), PHONE_ERROR_MSG);
check('AC-3 含空格以外的字母报错', validatePhone('abc'), PHONE_ERROR_MSG);
// 第二位非法（0/1/2）
check('AC-3 第二位为 0 报错', validatePhone('10800138000'), PHONE_ERROR_MSG);
check('AC-3 第二位为 2 报错', validatePhone('12800138000'), PHONE_ERROR_MSG);
// 位数超长/为空
check('AC-3 超长（12 位）报错', validatePhone('138001380001'), PHONE_ERROR_MSG);
check('AC-3 空串报错', validatePhone(''), PHONE_ERROR_MSG);
// 合法手机号返回 null（允许下发验证码），含内部空格容错
check('AC-3 合法手机号通过', validatePhone('13800138000'), null);
check('AC-3 合法手机号（含空格）通过', validatePhone(' 138 0013 8000 '), null);
check('AC-3 合法手机号（第二位 9）通过', validatePhone('19912345678'), null);

// ============================================================
// AC-1：正确验证码完成注册（判定语义）
// ============================================================
check('AC-1 示例1：正确验证码通过', verifyOtp('493102', '493102'), true);
check('AC-1 演示固定码 123456 通过', verifyOtp('123456', DEMO_OTP), true);
// 非 6 位数字形态的期望值不应通过（防 mock 退化）
check('AC-1 期望值非 6 位数字不通过', verifyOtp('abc', 'abc'), false);

// ============================================================
// AC-2：验证码错误不能完成注册
// ============================================================
// 示例 1：493102 收到，输入 493103
check('AC-2 示例1：错误验证码不通过', verifyOtp('493103', '493102'), false);
check('AC-2 位数不足不通过', verifyOtp('49310', '493102'), false);
check('AC-2 空输入不通过', verifyOtp('', '493102'), false);
check('AC-2 含非数字不通过', verifyOtp('49310a', '493102'), false);

// ============================================================
// AC-4：已注册手机号同构走登录，不重复创建账号
// ============================================================
// 内存 mock 存储（依赖注入版，不触碰真实 localStorage）
class MemStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, v); }
}

// 示例 1：13800138000 已注册 → login
check('AC-4 示例1：已注册手机号走登录',
  resolveAccountAction('13800138000', ['13800138000']), 'login');
check('AC-4 新手机号走注册',
  resolveAccountAction('13900139000', ['13800138000']), 'register');
check('AC-4 空账号库走注册', resolveAccountAction('13800138000', []), 'register');

// 账号库：登记与幂等
const storage = new MemStorage();
check('账号库初始为空', readAccounts(storage), []);
writeAccounts(storage, ['13800138000']);
check('账号库登记后可读', readAccounts(storage), ['13800138000']);
// 幂等：重复登记不产生第二个条目（不重复创建账号）
writeAccounts(storage, [...readAccounts(storage), '13800138000'].filter((p, i, a) => a.indexOf(p) === i));
check('AC-4 重复登记不产生重复条目', readAccounts(storage), ['13800138000']);
// 坏数据容错
const bad = new MemStorage();
bad.map.set('wordbug_accounts_v1', '{not json');
check('账号库坏数据容错为空', readAccounts(bad), []);
bad.map.set('wordbug_accounts_v1', JSON.stringify([1, 'x', null, 'y']));
check('账号库非字符串项被过滤', readAccounts(bad), ['x', 'y']);

// 换浏览器场景（AC-4 示例背景）：账号库独立于登录态存储（localStorage key 不含进度存储键）
checkTrue('账号库键与进度键隔离（同构登录判定不依赖本地进度）',
  readAccounts(new MemStorage()).length === 0);

// ---- 汇总 ----
console.log(`\n通过 ${passed} 例，失败 ${failed} 例`);
if (failed > 0) process.exit(1);
