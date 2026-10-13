import { getDateStr, daysBetween } from './time.ts';

export interface SavePromptPlanInput {
  /** 游客态（未注册）才弹提示（AC-4） */
  isGuest: boolean;
  /** 首次背词时间戳（"首次开始背词之日"的记录，AC-1 起算点） */
  firstStudyTimestamp: number | null;
  /** 上次弹出"保存进度"提示的自然日（YYYY-MM-DD），null=从未弹过 */
  lastPromptDate: string | null;
  /** 今日自然日（YYYY-MM-DD） */
  todayStr: string;
}

/**
 * FT-006-US-01 第 3 自然日"保存进度"提示决策（纯函数）。
 *
 * - AC-1：自首次背词之日起进入第 3 个自然日（daysBetween ≥ 2）触发，
 *   日历口径——与中间自然日是否打开无关；
 * - AC-3：lastPromptDate 记上次弹出的自然日，同一自然日内不重复弹、
 *   后续任一自然日首开再弹；
 * - AC-4：已注册（isGuest=false）永不弹。
 */
export function planSavePrompt(
  { isGuest, firstStudyTimestamp, lastPromptDate, todayStr }: SavePromptPlanInput,
): boolean {
  if (!isGuest) return false;
  if (!firstStudyTimestamp) return false;
  if (lastPromptDate === todayStr) return false;
  return daysBetween(getDateStr(firstStudyTimestamp), todayStr) >= 2;
}
