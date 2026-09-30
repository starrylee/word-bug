import { useState } from 'react';
import { AppState } from '../types';

interface NavbarProps {
  state: AppState;
  onChangeDailyCount: () => void;
  onSaveProgress: () => void;
  onLogout: () => void;
}

export default function Navbar({ state, onChangeDailyCount, onSaveProgress, onLogout }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const showSettings = state.view === 'study' || state.view === 'completed';

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-100">
      <div className="max-w-lg mx-auto px-5 h-14 flex items-center justify-between">
        <span className="text-[15px] font-semibold tracking-tight text-gray-900">WordDaily</span>

        {showSettings && (
          <div className="relative flex items-center gap-3">
            <button
              onClick={onChangeDailyCount}
              className="text-[13px] text-gray-500 hover:text-gray-900 transition-colors"
            >
              每天 {state.dailyNewCount} 词
            </button>

            <div className="relative">
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="text-[13px] px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors"
              >
                {state.isGuest ? '保存进度' : state.phone}
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-10 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50"
                  onBlur={() => setMenuOpen(false)}
                >
                  {state.isGuest ? (
                    <button
                      className="w-full text-left px-4 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50"
                      onClick={() => { setMenuOpen(false); onSaveProgress(); }}
                    >
                      注册并保存进度
                    </button>
                  ) : (
                    <button
                      className="w-full text-left px-4 py-2.5 text-[13px] text-red-500 hover:bg-gray-50"
                      onClick={() => { setMenuOpen(false); onLogout(); }}
                    >
                      退出登录
                    </button>
                  )}
                </div>
              )}
            </div>

            {menuOpen && (
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            )}
          </div>
        )}
      </div>
    </header>
  );
}
