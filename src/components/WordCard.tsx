import { useState } from 'react';
import { Word, Feedback } from '../types';

interface WordCardProps {
  word: Word;
  cardIndex: number;
  totalCards: number;
  passLabel?: string;
  onFeedback: (feedback: Feedback) => void;
  isReview?: boolean;
}

export default function WordCard({ word, cardIndex, totalCards, passLabel, onFeedback, isReview }: WordCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [chineseVisible, setChineseVisible] = useState(false);

  const handleFlip = () => {
    if (!flipped) setFlipped(true);
  };

  const handleFeedback = (feedback: Feedback) => {
    onFeedback(feedback);
    setFlipped(false);
    setChineseVisible(false);
  };

  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto select-none">
      {/* Progress indicator */}
      <div className="w-full flex items-center gap-2 mb-6">
        <div className="flex-1 h-0.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-500 rounded-full transition-all duration-300"
            style={{ width: `${((cardIndex) / totalCards) * 100}%` }}
          />
        </div>
        <span className="text-[12px] text-gray-400 shrink-0 tabular-nums">
          {passLabel && <span className="mr-1 text-teal-500">{passLabel}</span>}
          {cardIndex + 1} / {totalCards}
        </span>
      </div>

      {/* Card */}
      <div
        className={`w-full rounded-2xl border transition-all duration-200 cursor-pointer
          ${flipped
            ? 'bg-white border-gray-200 shadow-sm cursor-default'
            : 'bg-white border-gray-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0'
          }`}
        onClick={handleFlip}
        style={{ minHeight: '280px' }}
      >
        {!flipped ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[280px] px-8 py-10">
            {isReview && (
              <span className="text-[11px] uppercase tracking-widest text-teal-500 mb-4">复习</span>
            )}
            <p className="text-[42px] font-bold tracking-tight text-gray-900 text-center leading-tight">
              {word.word}
            </p>
            <p className="mt-6 text-[13px] text-gray-400">点击查看释义</p>
          </div>
        ) : (
          <div className="px-7 py-7">
            <p className="text-[32px] font-bold tracking-tight text-gray-900 mb-4">{word.word}</p>
            <p className="text-[15px] text-gray-700 leading-relaxed mb-2">{word.definition}</p>
            <p className="text-[13px] text-gray-400 italic leading-relaxed mb-4">"{word.example}"</p>

            {chineseVisible ? (
              <div className="border-t border-gray-100 pt-4 mt-2">
                <p className="text-[15px] text-gray-600">{word.chinese}</p>
              </div>
            ) : (
              <button
                className="text-[13px] text-teal-600 hover:text-teal-700 transition-colors underline underline-offset-2"
                onClick={e => { e.stopPropagation(); setChineseVisible(true); }}
              >
                查看中文
              </button>
            )}
          </div>
        )}
      </div>

      {/* Feedback buttons — only shown after flip */}
      {flipped && (
        <div className="flex gap-3 w-full mt-5">
          <button
            onClick={() => handleFeedback('forgot')}
            className="flex-1 py-3 rounded-xl text-[14px] font-medium border border-red-200 text-red-500 bg-red-50 hover:bg-red-100 transition-colors"
          >
            忘了
          </button>
          <button
            onClick={() => handleFeedback('fuzzy')}
            className="flex-1 py-3 rounded-xl text-[14px] font-medium border border-amber-200 text-amber-600 bg-amber-50 hover:bg-amber-100 transition-colors"
          >
            模糊
          </button>
          <button
            disabled={chineseVisible}
            onClick={() => !chineseVisible && handleFeedback('know')}
            className={`flex-1 py-3 rounded-xl text-[14px] font-medium transition-colors
              ${chineseVisible
                ? 'border border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed'
                : 'border border-teal-200 text-teal-600 bg-teal-50 hover:bg-teal-100'
              }`}
          >
            记得
          </button>
        </div>
      )}
    </div>
  );
}
