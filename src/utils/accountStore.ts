/**
 * FT-006-US-02：演示环境账号库（localStorage 模拟服务端已注册手机号集合）。
 *
 * 真实后端（注册接口）待方案设计阶段接入；本模块只承载
 * "该手机号是否已有账号"这一判定数据（AC-4 登录注册同构），
 * 接口形态与 accountStore 对齐，替换成本最小。
 */

import type { StudyLogEntry } from '../types.ts';
import { mergeStudyLogOnRegister } from './progressMerge.ts';

const ACCOUNTS_KEY = 'wordbug_accounts_v1';
/** FT-006-US-03：账号行为日志库（localStorage 模拟服务端按账号归档的匿名行为记录） */
const ACCOUNT_LOG_KEY = 'wordbug_account_progress_v1';

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

// ============================================================
// FT-006-US-03：账号行为日志（游客匿名行为归并的演示侧存储）
// ============================================================

type AccountLogMap = Record<string, StudyLogEntry[]>;

function readAccountLogMap(storage: Pick<Storage, 'getItem'>): AccountLogMap {
  try {
    const raw = storage.getItem(ACCOUNT_LOG_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as AccountLogMap)
      : {};
  } catch {
    return {};
  }
}

/** 读取账号已归档的行为日志（无记录返回空数组；依赖注入版） */
export function readAccountStudyLog(
  storage: Pick<Storage, 'getItem'>,
  phone: string,
): StudyLogEntry[] {
  return readAccountLogMap(storage)[phone] ?? [];
}

/** 覆写账号行为日志（依赖注入版，测试用） */
export function writeAccountStudyLog(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  phone: string,
  log: StudyLogEntry[],
): boolean {
  try {
    const map = readAccountLogMap(storage);
    map[phone] = log;
    storage.setItem(ACCOUNT_LOG_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

/**
 * 注册成功时归并游客匿名行为日志到账号（AC-2，仅在注册/登录成功回调调用一次）。
 * 与账号已有日志去重合并（幂等：重复归并结果不变），返回归并后的完整日志。
 */
export function mergeGuestLogIntoAccount(
  phone: string,
  guestLog: StudyLogEntry[],
): StudyLogEntry[] {
  const existing = readAccountStudyLog(localStorage, phone);
  const merged = mergeStudyLogOnRegister(existing, guestLog);
  writeAccountStudyLog(localStorage, phone, merged);
  return merged;
}
