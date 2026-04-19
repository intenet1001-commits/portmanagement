import React, { useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import PortalManager, { PortalActions } from './PortalManager';
import { BookMarked, Settings, CloudUpload, CloudDownload } from 'lucide-react';

const PW_VERIFIED_KEY = 'portal_pw_verified';
const REQUIRED_HASH = (import.meta.env.VITE_PORTAL_PASSWORD_HASH as string | undefined) ?? '';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isPasswordVerified(): boolean {
  if (!REQUIRED_HASH) return true;
  return localStorage.getItem(PW_VERIFIED_KEY) === REQUIRED_HASH;
}

function PasswordGate({ onVerified }: { onVerified: () => void }) {
  const [pw, setPw] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function verify() {
    if (!pw.trim()) return;
    setLoading(true); setError('');
    const hash = await sha256(pw.trim());
    if (hash === REQUIRED_HASH) { if (remember) localStorage.setItem(PW_VERIFIED_KEY, REQUIRED_HASH); onVerified(); }
    else setError('비밀번호가 틀렸습니다');
    setLoading(false);
  }

  const inp = 'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500';
  return (
    <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center p-4">
      <div className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2.5"><div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20"><BookMarked className="w-4 h-4 text-blue-400" /></div><span className="font-semibold text-white text-sm">북마크</span></div>
        <div><label className="text-xs text-zinc-400 mb-1 block">비밀번호</label><input className={inp} type="password" placeholder="••••••••" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && verify()} autoFocus /></div>
        <label className="flex items-center gap-2 cursor-pointer select-none"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="accent-blue-500 w-3.5 h-3.5" /><span className="text-xs text-zinc-400">이 브라우저에서 기억하기</span></label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded font-medium transition-colors" onClick={verify} disabled={loading || !pw.trim()}>{loading ? '확인 중…' : '입장'}</button>
      </div>
    </div>
  );
}


function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (<div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2 animate-slide-in ${type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>{message}</div>);
}

function App() {
  const [pwOk, setPwOk] = useState(isPasswordVerified);
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([]);
  const [openSettings, setOpenSettings] = useState(false);
  const actionsRef = useRef<PortalActions | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  };

  if (!pwOk) return <PasswordGate onVerified={() => setPwOk(true)} />;

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white flex flex-col">
      <header className="sticky top-0 z-40 bg-[#0a0a0b]/95 backdrop-blur border-b border-zinc-800/60 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5"><div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20"><BookMarked className="w-4 h-4 text-blue-400" /></div><span className="font-semibold text-white text-sm">북마크</span></div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => actionsRef.current?.push()} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200 rounded-lg border border-zinc-700/50 transition-all" title="Supabase에 Push"><CloudUpload className="w-3.5 h-3.5" /><span className="hidden sm:inline">Push</span></button>
            <button onClick={() => actionsRef.current?.pull()} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200 rounded-lg border border-zinc-700/50 transition-all" title="Supabase에서 Pull"><CloudDownload className="w-3.5 h-3.5" /><span className="hidden sm:inline">Pull</span></button>
            <button onClick={() => setOpenSettings(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200 rounded-lg border border-zinc-700/50 transition-all"><Settings className="w-3.5 h-3.5" /><span className="hidden sm:inline">설정</span></button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-4">
        <PortalManager showToast={showToast} openSettings={openSettings} onSettingsClosed={() => setOpenSettings(false)} actionsRef={actionsRef} isVisible={true} />
      </main>
      {toasts.map(t => <Toast key={t.id} message={t.message} type={t.type} />)}
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App /></React.StrictMode>);
