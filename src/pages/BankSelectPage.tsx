interface BankSelectPageProps {
  onSelect: (bankId: string) => void;
}

export default function BankSelectPage({ onSelect }: BankSelectPageProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-[28px] font-bold tracking-tight text-gray-900 mb-2">选择题库</h1>
        <p className="text-[15px] text-gray-400 mb-10">打开就背，无干扰</p>

        <button
          onClick={() => onSelect('zhongkao')}
          className="w-full flex items-center justify-between px-5 py-5 bg-white border border-gray-200 rounded-2xl hover:border-teal-400 hover:shadow-sm transition-all group"
        >
          <div className="text-left">
            <p className="text-[16px] font-semibold text-gray-900 mb-1">中考题库</p>
            <p className="text-[13px] text-gray-400">中学英语核心词汇 · 110 词</p>
          </div>
          <span className="text-gray-300 group-hover:text-teal-400 transition-colors text-xl">→</span>
        </button>

        <p className="text-[12px] text-gray-300 text-center mt-8">更多题库即将上线</p>
      </div>
    </div>
  );
}
