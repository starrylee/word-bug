interface ReminderModalProps {
  type: '30min' | '12hr';
  wordCount: number;
  onReview: () => void;
  onDismiss: () => void;
}

export default function ReminderModal({ type, wordCount, onReview, onDismiss }: ReminderModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-6 shadow-xl mx-4 mb-4 sm:mb-0">
        <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-xl mb-4">⏰</div>
        <h2 className="text-[17px] font-semibold text-gray-900 mb-1">
          {type === '30min' ? '30分钟后' : '12小时后'}复习提醒
        </h2>
        <p className="text-[14px] text-gray-500 mb-6">
          有 {wordCount} 个词需要快速复习一遍，趁热打铁！
        </p>
        <button
          onClick={onReview}
          className="w-full py-3 bg-teal-500 text-white rounded-xl text-[15px] font-medium hover:bg-teal-600 transition-colors mb-2"
        >
          现在复习
        </button>
        <button
          onClick={onDismiss}
          className="w-full py-2 text-[13px] text-gray-400 hover:text-gray-600 transition-colors"
        >
          稍后再说
        </button>
      </div>
    </div>
  );
}
