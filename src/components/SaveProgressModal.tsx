import { useState } from 'react';
import { validatePhone, verifyOtp, DEMO_OTP } from '../utils/auth';

interface SaveProgressModalProps {
  onRegister: (phone: string) => void;
  onDismiss: () => void;
  isPrompt?: boolean; // true = show the "save progress" nudge variant
}

export default function SaveProgressModal({ onRegister, onDismiss, isPrompt }: SaveProgressModalProps) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [phoneSubmitted, setPhoneSubmitted] = useState('');

  const handleSendOtp = () => {
    // AC-3：非法手机号不发送验证码，仅提示
    const error = validatePhone(phone);
    if (error) {
      setError(error);
      return;
    }
    setPhoneSubmitted(phone.replace(/\s/g, ''));
    setStep('otp');
    setError('');
  };

  const handleVerify = () => {
    // AC-2：验证码错误不能完成注册，停留可重新输入（由 error 文案承接）
    if (!verifyOtp(otp, DEMO_OTP)) {
      setError('验证码错误');
      return;
    }
    // AC-1/AC-4：注册与登录同构，注册/登录分流由上层 onRegister 决定
    onRegister(phoneSubmitted);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-6 shadow-xl">
        {isPrompt && step === 'phone' && (
          <p className="text-[13px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-4">
            学习进度目前仅保存在本机，注册后可跨设备永久保存
          </p>
        )}

        <h2 className="text-[18px] font-semibold text-gray-900 mb-1">
          {step === 'phone' ? '保存学习进度' : '输入验证码'}
        </h2>
        <p className="text-[13px] text-gray-500 mb-5">
          {step === 'phone'
            ? '用手机号注册，进度永久保存'
            : `验证码已发送至 ${phoneSubmitted}（演示固定码：123456）`}
        </p>

        {step === 'phone' ? (
          <>
            <input
              type="tel"
              placeholder="手机号"
              value={phone}
              onChange={e => { setPhone(e.target.value); setError(''); }}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[15px] outline-none focus:border-teal-400 transition-colors mb-3"
              maxLength={11}
            />
            {error && <p className="text-[13px] text-red-500 mb-3">{error}</p>}
            <button
              onClick={handleSendOtp}
              className="w-full py-3 bg-teal-500 text-white rounded-xl text-[15px] font-medium hover:bg-teal-600 transition-colors mb-2"
            >
              发送验证码
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              placeholder="6位验证码"
              value={otp}
              onChange={e => { setOtp(e.target.value); setError(''); }}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[15px] outline-none focus:border-teal-400 transition-colors mb-3"
              maxLength={6}
            />
            {error && <p className="text-[13px] text-red-500 mb-3">{error}</p>}
            <button
              onClick={handleVerify}
              className="w-full py-3 bg-teal-500 text-white rounded-xl text-[15px] font-medium hover:bg-teal-600 transition-colors mb-2"
            >
              验证并保存
            </button>
            <button
              onClick={() => { setStep('phone'); setOtp(''); setError(''); }}
              className="w-full py-2 text-[13px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              重新输入手机号
            </button>
          </>
        )}

        <button
          onClick={onDismiss}
          className="w-full py-2 text-[13px] text-gray-400 hover:text-gray-600 transition-colors"
        >
          以后再说
        </button>
      </div>
    </div>
  );
}
