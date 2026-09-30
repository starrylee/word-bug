import { useState } from 'react';

const PRESETS = [5, 10, 20, 30, 50];

interface DailyCountPageProps {
  onSelect: (count: number) => void;
}

export default function DailyCountPage({ onSelect }: DailyCountPageProps) {
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const handleCustomConfirm = () => {
    const val = parseFloat(custom);
    if (!custom.trim() || isNaN(val) || !Number.isInteger(val) || val < 5 || val > 100) {
      setError('请输入 5 到 100 之间的数字');
      return;
    }
    onSelect(val);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-[28px] font-bold tracking-tight text-gray-900 mb-2">每天学几个词？</h1>
        <p className="text-[15px] text-gray-400 mb-10">系统会自动安排复习，坚持就能记住</p>

        <div className="grid grid-cols-5 gap-2 mb-6">
          {PRESETS.map(n => (
            <button
              key={n}
              onClick={() => onSelect(n)}
              className={`relative py-5 rounded-2xl text-[18px] font-bold transition-all
                ${n === 10
                  ? 'bg-teal-500 text-white shadow-md shadow-teal-200 hover:bg-teal-600'
                  : 'bg-white border border-gray-200 text-gray-700 hover:border-teal-400 hover:shadow-sm'
                }`}
            >
              {n}
              {n === 10 && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] bg-teal-600 text-white px-1.5 py-0.5 rounded-full whitespace-nowrap">
                  推荐
                </span>
              )}
            </button>
          ))}
        </div>

        {!showCustom ? (
          <button
            onClick={() => setShowCustom(true)}
            className="w-full py-3 text-[14px] text-gray-500 hover:text-teal-600 transition-colors"
          >
            自定义数量
          </button>
        ) : (
          <div>
            <div className="flex gap-2 mb-2">
              <input
                type="number"
                placeholder="输入 5 ~ 100"
                value={custom}
                onChange={e => { setCustom(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleCustomConfirm()}
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-[15px] outline-none focus:border-teal-400 transition-colors"
                autoFocus
              />
              <button
                onClick={handleCustomConfirm}
                className="px-5 py-3 bg-teal-500 text-white rounded-xl text-[15px] font-medium hover:bg-teal-600 transition-colors"
              >
                开始
              </button>
            </div>
            {error && <p className="text-[13px] text-red-500 mt-1">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
