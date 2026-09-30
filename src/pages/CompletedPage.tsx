import { LearnedWord } from '../types';
import { getDateStr } from '../utils/time';

interface CompletedPageProps {
  learnedWords: LearnedWord[];
  dailyNewCount: number;
  todayStr: string;
}

export default function CompletedPage({ learnedWords, dailyNewCount, todayStr }: CompletedPageProps) {
  const todayNew = learnedWords.filter(w => w.learnedDate === todayStr).length;
  const totalLearned = learnedWords.length;

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-6 text-center">
      <div className="w-full max-w-sm">
        <div className="text-5xl mb-6">✓</div>
        <h1 className="text-[26px] font-bold tracking-tight text-gray-900 mb-2">今日任务已完成</h1>
        <p className="text-[15px] text-gray-400 mb-10">明天继续，记忆曲线已自动安排好复习</p>

        <div className="flex gap-4 justify-center mb-10">
          <div className="flex-1 bg-gray-50 rounded-2xl py-5 px-4">
            <p className="text-[28px] font-bold text-teal-500">{todayNew}</p>
            <p className="text-[12px] text-gray-400 mt-1">今日新词</p>
          </div>
          <div className="flex-1 bg-gray-50 rounded-2xl py-5 px-4">
            <p className="text-[28px] font-bold text-gray-700">{totalLearned}</p>
            <p className="text-[12px] text-gray-400 mt-1">累计已学</p>
          </div>
        </div>

        <p className="text-[12px] text-gray-300">明天见 👋</p>
      </div>
    </div>
  );
}
