import React, { useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import PortalManager, { PortalActions } from './PortalManager';
import { BookMarked, Settings, Upload, Download, CloudUpload, CloudDownload } from 'lucide-react';

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2 animate-slide-in
      ${type === 'success'
        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
        : 'bg-red-500/10 border-red-500/30 text-red-400'
      }`}>
      {message}
    </div>
  );
}

function App() {
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([]);
  const [openSettings, setOpenSettings] = useState(false);
  const actionsRef = useRef<PortalActions | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0a0a0b]/95 backdrop-blur border-b border-zinc-800/60 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <BookMarked className="w-4 h-4 text-blue-400" />
            </div>
            <span className="font-semibold text-white text-sm">북마크</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => actionsRef.current?.push()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200 rounded-lg border border-zinc-700/50 transition-all"
              title="Supabase에 Push"
            >
              <CloudUpload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Push</span>
            </button>
            <button
              onClick={() => actionsRef.current?.pull()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200 rounded-lg border border-zinc-700/50 transition-all"
              title="Supabase에서 Pull"
            >
              <CloudDownload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Pull</span>
            </button>
            <button
              onClick={() => setOpenSettings(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200 rounded-lg border border-zinc-700/50 transition-all"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">설정</span>
            </button>
          </div>
        </div>
      </header>

      {/* Portal content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-4">
        <PortalManager
          showToast={showToast}
          openSettings={openSettings}
          onSettingsClosed={() => setOpenSettings(false)}
          actionsRef={actionsRef}
          isVisible={true}
        />
      </main>

      {/* Toasts */}
      {toasts.map(t => <Toast key={t.id} message={t.message} type={t.type} />)}
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App /></React.StrictMode>);
