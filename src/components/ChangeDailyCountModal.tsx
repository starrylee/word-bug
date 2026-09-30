import { useState } from 'react';

const PRESETS = [5, 10, 20, 30, 50];

interface ChangeDailyCountModalProps {
  current: number;
  onConfirm: (count: number) => void;
  onDismiss: () => void;
}

export default function ChangeDailyCountModal({ current, onConfirm, onDismiss }: ChangeDailyCountModalProps) {
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const handleCustomConfirm = () => {
    const val = parseInt(custom);
    if (isNaN(val) || val < 5 || val > 100 || !Number.isInteger(val)) {
      setError('请输入 5 到 100 之间的数字');
      return;
    }
    onConfirm(val);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-6 shadow-xl">
        <h2 className="text-[18px] font-semibold text-gray-900 mb-1">修改每日新词数</h2>
        <p className="text-[13px] text-gray-500 mb-5">
          当前：{current} 词/天。修改后从下一批新词起生效。
        </p>

        <div className="grid grid-cols-5 gap-2 mb-4">
          {PRESETS.map(n => (
            <button
              key={n}
              onClick={() => onConfirm(n)}
              className={`py-3 rounded-xl text-[15px] font-semibold transition-colors
                ${n === current
                  ? 'bg-teal-500 text-white'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
            >
              {n}
              {n === 10 && <span className="block text-[9px] font-normal opacity-70">推荐</span>}
            </button>
          ))}
        </div>

        {!showCustom ? (
          <button
            onClick={() => setShowCustom(true)}
            className="w-full py-2.5 text-[13px] text-gray-500 hover:text-teal-600 transition-colors"
          >
            自定义数量
          </button>
        ) : (
          <div className="flex gap-2 mb-2">
            <input
              type="number"
              placeholder="5 ~ 100"
              value={custom}
              onChange={e => { setCustom(e.target.value); setError(''); }}
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-[15px] outline-none focus:border-teal-400 transition-colors"
            />
            <button
              onClick={handleCustomConfirm}
              className="px-4 py-3 bg-teal-500 text-white rounded-xl text-[15px] font-medium hover:bg-teal-600 transition-colors"
            >
              确认
            </button>
          </div>
        )}
        {error && <p className="text-[13px] text-red-500 mb-2">{error}</p>}

        <button
          onClick={onDismiss}
          className="w-full py-2 text-[13px] text-gray-400 hover:text-gray-600 transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  );
}
