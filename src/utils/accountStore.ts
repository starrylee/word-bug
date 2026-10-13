/**
 * FT-006-US-02：演示环境账号库（localStorage 模拟服务端已注册手机号集合）。
 *
 * 真实后端（注册接口）待方案设计阶段接入；本模块只承载
 * "该手机号是否已有账号"这一判定数据（AC-4 登录注册同构），
 * 接口形态与 accountStore 对齐，替换成本最小。
 */

const ACCOUNTS_KEY = 'wordbug_accounts_v1';

/** 依赖注入版（测试/复用）：对任意存储实现读写已注册手机号集合 */
export function readAccounts(storage: Pick<Storage, 'getItem'>): string[] {
  try {
    const raw = storage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

export function writeAccounts(storage: Pick<Storage, 'setItem'>, phones: string[]): boolean {
  try {
    storage.setItem(ACCOUNTS_KEY, JSON.stringify(phones));
    return true;
  } catch {
    return false;
  }
}

/** 浏览器运行时便捷封装 */
export function hasAccount(phone: string): boolean {
  return readAccounts(localStorage).includes(phone);
}

/** 注册即登记；已存在则幂等返回 false（AC-4 不重复创建） */
export function registerAccount(phone: string): boolean {
  const accounts = readAccounts(localStorage);
  if (accounts.includes(phone)) return false;
  writeAccounts(localStorage, [...accounts, phone]);
  return true;
}
