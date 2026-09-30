import { useState } from 'react';
import { getNow, getDateStr, formatTime } from '../utils/time';

interface DebugPanelProps {
  simulatedTime: number | null;
  onSetTime: (time: number | null) => void;
  onAdvance: (ms: number) => void;
  onReset: () => void;
}

export default function DebugPanel({ simulatedTime, onSetTime, onAdvance, onReset }: DebugPanelProps) {
  const [open, setOpen] = useState(false);
  const [customDays, setCustomDays] = useState('');
  const now = getNow(simulatedTime);

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-[11px] px-2.5 py-1 rounded bg-gray-800 text-gray-400 hover:text-white transition-colors font-mono"
      >
        {open ? '✕ 调试' : '⚙ 调试'}
      </button>

      {open && (
        <div className="absolute bottom-9 left-0 w-72 bg-gray-900 text-gray-200 rounded-xl shadow-2xl p-4 text-[12px] font-mono">
          <p className="text-gray-500 mb-1">当前模拟时间</p>
          <p className="text-teal-400 mb-3 text-[11px]">
            {simulatedTime ? formatTime(now) : `真实时间 ${formatTime(now)}`}
          </p>

          <div className="grid grid-cols-2 gap-1.5 mb-3">
            <button
              onClick={() => onAdvance(30 * 60 * 1000)}
              className="py-1.5 px-2 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
            >
              +30 分钟
            </button>
            <button
              onClick={() => onAdvance(12 * 60 * 60 * 1000)}
              className="py-1.5 px-2 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
            >
              +12 小时
            </button>
            <button
              onClick={() => onAdvance(24 * 60 * 60 * 1000)}
              className="py-1.5 px-2 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
            >
              +1 天
            </button>
            <button
              onClick={() => onAdvance(7 * 24 * 60 * 60 * 1000)}
              className="py-1.5 px-2 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
            >
              +7 天
            </button>
          </div>

          <div className="flex gap-1.5 mb-3">
            <input
              type="number"
              placeholder="自定义天数"
              value={customDays}
              onChange={e => setCustomDays(e.target.value)}
              className="flex-1 px-2 py-1.5 bg-gray-800 rounded text-gray-200 placeholder-gray-600 outline-none"
            />
            <button
              onClick={() => {
                const d = parseInt(customDays);
                if (d > 0) { onAdvance(d * 24 * 60 * 60 * 1000); setCustomDays(''); }
              }}
              className="px-3 py-1.5 bg-teal-700 rounded hover:bg-teal-600 transition-colors"
            >
              快进
            </button>
          </div>

          <div className="border-t border-gray-700 pt-3 flex gap-1.5">
            {simulatedTime && (
              <button
                onClick={() => onSetTime(null)}
                className="flex-1 py-1.5 px-2 bg-gray-800 rounded hover:bg-gray-700 transition-colors text-gray-400"
              >
                恢复真实时间
              </button>
            )}
            <button
              onClick={() => { if (confirm('确定重置所有本地数据？')) onReset(); }}
              className="flex-1 py-1.5 px-2 bg-red-900 rounded hover:bg-red-800 transition-colors text-red-300"
            >
              重置数据
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
