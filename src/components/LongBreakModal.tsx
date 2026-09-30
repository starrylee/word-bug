import { useState, useRef } from 'react';
import { Word } from '../types';

interface LongBreakModalProps {
  daysMissed: number;
  wordbank: Word[];
  onContinue: () => void;
  onRestart: (wordId: string) => void;
}

export default function LongBreakModal({ daysMissed, wordbank, onContinue, onRestart }: LongBreakModalProps) {
  const [mode, setMode] = useState<'choice' | 'restart'>('choice');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Word | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = query.length > 0
    ? wordbank.filter(w => w.word.toLowerCase().startsWith(query.toLowerCase())).slice(0, 6)
    : [];

  const handleConfirmRestart = () => {
    if (!selected) { setError('请从候选词中选择一个单词'); return; }
    onRestart(selected.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-xl">
        {mode === 'choice' ? (
          <>
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-xl mb-4">🌿</div>
            <h2 className="text-[18px] font-semibold text-gray-900 mb-2">好久不见</h2>
            <p className="text-[14px] text-gray-500 mb-6">
              你已经 {daysMissed} 天没有学习了，要怎么继续？
            </p>
            <button
              onClick={onContinue}
              className="w-full py-3 bg-teal-500 text-white rounded-xl text-[15px] font-medium hover:bg-teal-600 transition-colors mb-3"
            >
              继续按当前节奏
            </button>
            <button
              onClick={() => { setMode('restart'); setTimeout(() => inputRef.current?.focus(), 100); }}
              className="w-full py-3 border border-gray-200 text-gray-600 rounded-xl text-[15px] font-medium hover:border-gray-300 transition-colors"
            >
              从某个单词重新开始
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => { setMode('choice'); setQuery(''); setSelected(null); setError(''); }}
              className="text-[13px] text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1"
            >
              ← 返回
            </button>
            <h2 className="text-[18px] font-semibold text-gray-900 mb-2">从哪个词开始？</h2>
            <p className="text-[13px] text-gray-500 mb-4">该词之前的词将标记为已学完</p>

            <div className="relative mb-3">
              <input
                ref={inputRef}
                type="text"
                placeholder="输入单词..."
                value={query}
                onChange={e => { setQuery(e.target.value); setSelected(null); setError(''); }}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[15px] outline-none focus:border-teal-400 transition-colors"
              />
              {suggestions.length > 0 && !selected && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-10">
                  {suggestions.map(w => (
                    <button
                      key={w.id}
                      className="w-full text-left px-4 py-2.5 text-[14px] hover:bg-gray-50 transition-colors"
                      onClick={() => { setSelected(w); setQuery(w.word); }}
                    >
                      <span className="font-medium text-gray-900">{w.word}</span>
                      <span className="text-gray-400 ml-2 text-[12px]">{w.chinese}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-[13px] text-red-500 mb-3">{error}</p>}

            {selected && (
              <div className="text-[13px] text-teal-600 bg-teal-50 rounded-lg px-3 py-2 mb-3">
                将从 <strong>{selected.word}</strong>（{selected.chinese}）重新开始
              </div>
            )}

            <button
              onClick={handleConfirmRestart}
              className="w-full py-3 bg-teal-500 text-white rounded-xl text-[15px] font-medium hover:bg-teal-600 transition-colors"
            >
              确认并开始
            </button>
          </>
        )}
      </div>
    </div>
  );
}
