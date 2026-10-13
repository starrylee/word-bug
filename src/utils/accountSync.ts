/**
 * FT-006-US-04 跨设备验证码登录：账号进度快照（纯函数 + 依赖注入存储）。
 *
 * 演示口径：localStorage 模拟服务端按账号归档的进度数据
 * （跨设备 = 换浏览器/清本地缓存后登录同一手机号，账号库为同一站点存储）。
 * 真实后端（登录接口 + 账号进度下发）待方案设计阶段接入，
 * 接口形态与 accountStore 对齐（依赖注入版 + 浏览器便捷版），替换成本最小。
 *
 * 决策 2 按推荐方案 A 预填：登录时以账号进度为准覆盖本设备本地进度
 * （本地游客清单不再展示，AC-2 示例 2）。
 */

import type { AppState } from '../types.ts';
import { PROGRESS_FIELDS } from './progressMerge.ts';

const ACCOUNT_STATE_KEY = 'wordbug_account_state_v1';

/** 账号进度快照：进度字段的完整集合（与 PROGRESS_FIELDS 一一对应） */
export type AccountSnapshot = Pick<AppState, (typeof PROGRESS_FIELDS)[number]>;

/** 从任意状态提取进度快照（非进度字段如 isGuest/phone/simulatedTime 不入档） */
export function extractProgressSnapshot(state: AppState): AccountSnapshot {
  const snapshot = {} as AccountSnapshot;
  for (const f of PROGRESS_FIELDS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (snapshot as any)[f] = (state as any)[f];
  }
  return snapshot;
}

type SnapshotMap = Record<string, AccountSnapshot>;

function readSnapshotMap(storage: Pick<Storage, 'getItem'>): SnapshotMap {
  try {
    const raw = storage.getItem(ACCOUNT_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as SnapshotMap)
      : {};
  } catch {
    return {};
  }
}

/** 读取账号进度快照（依赖注入版；无记录返回 null） */
export function readAccountSnapshot(
  storage: Pick<Storage, 'getItem'>,
  phone: string,
): AccountSnapshot | null {
  return readSnapshotMap(storage)[phone] ?? null;
}

/** 写入账号进度快照（依赖注入版；快照缺失进度字段的键忽略不采信） */
export function writeAccountSnapshot(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  phone: string,
  snapshot: AccountSnapshot,
): boolean {
  try {
    const map = readSnapshotMap(storage);
    map[phone] = snapshot;
    storage.setItem(ACCOUNT_STATE_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

/** 浏览器运行时便捷封装 */
export function loadAccountSnapshot(phone: string): AccountSnapshot | null {
  return readAccountSnapshot(localStorage, phone);
}

export function saveAccountSnapshot(phone: string, state: AppState): boolean {
  return writeAccountSnapshot(localStorage, phone, extractProgressSnapshot(state));
}

/**
 * AC-2：登录时以账号进度为准覆盖本设备本地进度（方案 A）。
 * - 有快照：进度字段全部取自账号快照，本地游客清单不再展示（示例 2）；
 *   当天清单（复习词/新词批次）由 learnedWords/currentNewBatch 等推导，
 *   与账号进度一致（示例 1）。
 * - 无快照（旧数据/异常兜底）：进度保留本地现状，仅切换登录身份。
 * 幂等：重复登录同一账号结果不变。
 */
export function applyAccountSnapshotOnLogin(
  state: AppState,
  phone: string,
  snapshot: AccountSnapshot | null,
): AppState {
  if (!snapshot) return { ...state, phone, isGuest: false };
  return { ...state, ...snapshot, phone, isGuest: false };
}
