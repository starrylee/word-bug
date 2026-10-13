/**
 * FT-006-US-02 手机号 + 验证码注册：校验与判定纯函数。
 *
 * 无密码体系（决策点 6）：注册与登录同构——同一入口，验证码通过后
 * 按手机号是否已有账号决定"注册"还是"登录"，对用户呈现一致的结果。
 *
 * 验证码为演示环境 mock（短信服务商待方案设计阶段确定，见 FeaturePrep 假设 1），
 * 通过 verifyOtp 纯函数判定，未来接真服务时仅替换下发/校验来源。
 */

export const OTP_LENGTH = 6;

/** 演示固定验证码（真实短信服务接入前的 mock） */
export const DEMO_OTP = '123456';

export const PHONE_ERROR_MSG = '请输入正确的手机号';
export const OTP_ERROR_MSG = '验证码错误';

/**
 * AC-3：手机号格式校验。合法返回 null（可下发验证码），
 * 非法返回错误文案（不发送验证码）。
 *
 * 规则：去除空白后须为 1 开头、第二位 3-9、共 11 位数字。
 */
export function validatePhone(raw: string): string | null {
  const clean = raw.replace(/\s/g, '');
  if (!/^1[3-9]\d{9}$/.test(clean)) return PHONE_ERROR_MSG;
  return null;
}

/**
 * AC-1/AC-2：验证码判定。输入与期望一致（且为 6 位数字形态）才通过。
 * 错误统一走 OTP_ERROR_MSG 提示，停留在验证码输入界面可重新输入。
 */
export function verifyOtp(input: string, expected: string): boolean {
  return input === expected && /^\d{6}$/.test(expected);
}

/**
 * AC-4：登录与注册同构。按手机号是否已在账号库中决定动作：
 * - 'register'：新手机号 → 创建账号
 * - 'login'：已注册手机号 → 登录已有账号，不重复创建
 */
export function resolveAccountAction(
  phone: string,
  knownPhones: string[],
): 'register' | 'login' {
  return knownPhones.includes(phone) ? 'login' : 'register';
}
