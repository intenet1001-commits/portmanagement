import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './index.css';
import PortalManager, { PortalActions } from './PortalManager';
import { BookMarked, Settings, CloudUpload, CloudDownload } from 'lucide-react';

const PW_VERIFIED_KEY = 'portal_pw_verified';
const REQUIRED_HASH = (import.meta.env.VITE_PORTAL_PASSWORD_HASH as string | undefined) ?? '';

// Supabase credentials from env vars (set once by deployer, no manual entry needed)
const ENV_SB_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const ENV_SB_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
const HAS_ENV_CREDS = !!(ENV_SB_URL && ENV_SB_KEY);

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isPasswordVerified(): boolean {
  if (!REQUIRED_HASH) return true;
  return localStorage.getItem(PW_VERIFIED_KEY) === REQUIRED_HASH;
}

function getStoredPortalData(): any {
  try { return JSON.parse(localStorage.getItem('portalData') ?? '{}'); } catch { return {}; }
}

function hasStoredConfig(): boolean {
  const d = getStoredPortalData();
  if (HAS_ENV_CREDS) return !!(d.deviceId); // env has creds, only need deviceId
  return !!(d.supabaseUrl && d.supabaseAnonKey && d.deviceId);
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

interface KnownDevice { device_id: string; device_name?: string; }

function DeviceIdInput({ sbUrl, sbKey, onSelect }: { sbUrl: string; sbKey: string; onSelect: (id: string, name: string) => void }) {
  const [val, setVal] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inp = 'flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 font-mono';

  async function confirm() {
    const id = val.trim();
    if (!id) return;
    setLoading(true); setError('');
    try {
      const sb = createClient(sbUrl, sbKey);
      // Look up device name from ports or workspace_roots
      const { data } = await sb.from('ports').select('device_name').eq('device_id', id).limit(1);
      const name = data?.[0]?.device_name || id.slice(0, 8) + '…';
      onSelect(id, name);
    } catch (e: unknown) { setError('기기를 찾을 수 없습니다'); }
    setLoading(false);
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <input className={inp} placeholder="a52b4f92-5dab-4b…" value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && confirm()} />
        <button className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white text-sm rounded font-medium transition-colors" onClick={confirm} disabled={loading || !val.trim()}>{loading ? '…' : '확인'}</button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function DeviceSetup({ onComplete }: { onComplete: () => void }) {
  // If env has creds, skip 'creds' step entirely
  const [step, setStep] = useState<'creds' | 'device'>(HAS_ENV_CREDS ? 'device' : 'creds');
  const [url, setUrl] = useState(ENV_SB_URL);
  const [key, setKey] = useState(ENV_SB_KEY);
  const [devices, setDevices] = useState<KnownDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');

  // If anon key is in env but URL isn't, only show URL field
  const needsUrlOnly = !!(ENV_SB_KEY && !ENV_SB_URL);

  // Auto-fetch devices when env creds are available
  useEffect(() => {
    if (HAS_ENV_CREDS) fetchDevices(ENV_SB_URL, ENV_SB_KEY);
  }, []);

  async function fetchDevices(sbUrl: string, sbKey: string) {
    setLoading(true); setError('');
    try {
      const sb = createClient(sbUrl, sbKey);
      const { data, error: qErr } = await sb.from('ports').select('device_id, device_name, folder_path').not('device_id', 'is', null);
      if (qErr) throw new Error(qErr.message);
      const seen = new Map<string, string | undefined>();
      for (const r of (data ?? [])) {
        if (!seen.has(r.device_id)) {
          seen.set(r.device_id, r.device_name || (/^\/Users\/([^/]+)/.exec(r.folder_path ?? '')?.[1]) || undefined);
        }
      }
      setDevices(Array.from(seen.entries()).map(([device_id, device_name]) => ({ device_id, device_name })));
      setStep('device');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    setLoading(false);
  }

  async function connectSupabase() {
    if (!url.trim()) { setError('Supabase URL을 입력하세요'); return; }
    const resolvedKey = key.trim() || ENV_SB_KEY;
    if (!resolvedKey) { setError('Anon Key를 입력하세요'); return; }
    setKey(resolvedKey);
    await fetchDevices(url.trim(), resolvedKey);
  }

  function saveAndEnter(deviceId: string, deviceName: string) {
    const existing = getStoredPortalData();
    const sbUrl = HAS_ENV_CREDS ? ENV_SB_URL : url.trim();
    const sbKey = HAS_ENV_CREDS ? ENV_SB_KEY : key.trim();
    localStorage.setItem('portalData', JSON.stringify({
      items: [], categories: [], ...existing,
      supabaseUrl: sbUrl, supabaseAnonKey: sbKey, deviceId, deviceName,
    }));
    onComplete();
  }

  function createNew() {
    if (!newName.trim()) { setError('기기 이름을 입력하세요'); return; }
    saveAndEnter(crypto.randomUUID(), newName.trim());
  }

  const inp = 'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500';
  const btn = 'px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded font-medium transition-colors';

  return (
    <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20"><BookMarked className="w-4 h-4 text-blue-400" /></div>
            <span className="font-semibold text-white text-sm">북마크</span>
          </div>
          <p className="text-xs text-zinc-500">{step === 'creds' ? 'Supabase 연결 정보를 입력하세요' : loading ? '기기 목록 불러오는 중…' : '현재 사용 중인 기기를 선택하세요'}</p>
        </div>

        {step === 'creds' && (
          <div className="space-y-3">
            <div><label className="text-xs text-zinc-400 mb-1 block">Supabase Project URL</label><input className={inp} placeholder="https://xxxx.supabase.co" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && connectSupabase()} autoFocus /></div>
            {!ENV_SB_KEY && (
              <div><label className="text-xs text-zinc-400 mb-1 block">Anon Key</label><input className={inp} type="password" placeholder="eyJhbGciOiJ…" value={key} onChange={e => setKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && connectSupabase()} /></div>
            )}
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button className={btn} onClick={connectSupabase} disabled={loading}>{loading ? '연결 중…' : '기기 목록 불러오기 →'}</button>
          </div>
        )}

        {step === 'device' && (
          <div className="space-y-3">
            {loading && <p className="text-xs text-zinc-500 text-center py-4">불러오는 중…</p>}
            {!loading && devices.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-400">{devices.length}개 등록된 기기</p>
                {devices.map(d => (
                  <button key={d.device_id} onClick={() => saveAndEnter(d.device_id, d.device_name ?? d.device_id.slice(0, 8))} className="w-full text-left px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors">
                    <div className="text-sm font-medium text-zinc-100">{d.device_name ?? '이름 없는 기기'}</div>
                    <div className="text-xs text-zinc-500 font-mono">{d.device_id.slice(0, 16)}…</div>
                  </button>
                ))}
              </div>
            )}
            {!loading && (
              <div className={devices.length > 0 ? 'pt-3 border-t border-zinc-800 space-y-3' : 'space-y-3'}>
                <div>
                  <p className="text-xs text-zinc-400 mb-2">Device ID 직접 입력</p>
                  <DeviceIdInput sbUrl={HAS_ENV_CREDS ? ENV_SB_URL : url} sbKey={HAS_ENV_CREDS ? ENV_SB_KEY : key} onSelect={saveAndEnter} />
                </div>
                <div className="pt-2 border-t border-zinc-800">
                  <p className="text-xs text-zinc-400 mb-2">{devices.length > 0 ? '또는 새 기기로 시작' : '새 기기 등록'}</p>
                  <div className="flex gap-2">
                    <input className={inp} placeholder="기기 이름 (예: MacBook Pro)" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createNew()} />
                    <button className={btn} onClick={createNew}>등록</button>
                  </div>
                </div>
              </div>
            )}
            {error && <p className="text-xs text-red-400">{error}</p>}
            {!HAS_ENV_CREDS && <button onClick={() => setStep('creds')} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">← 다시 연결</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (<div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2 animate-slide-in ${type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>{message}</div>);
}

function App() {
  const [pwOk, setPwOk] = useState(isPasswordVerified);
  const [setupDone, setSetupDone] = useState(hasStoredConfig);
  const [autoPull, setAutoPull] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([]);
  const [openSettings, setOpenSettings] = useState(false);
  const actionsRef = useRef<PortalActions | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  };

  // Auto-pull after device selection
  useEffect(() => {
    if (autoPull && setupDone) {
      const timer = setTimeout(() => {
        actionsRef.current?.pull();
        setAutoPull(false);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [autoPull, setupDone]);

  if (!pwOk) return <PasswordGate onVerified={() => setPwOk(true)} />;
  if (!setupDone) return <DeviceSetup onComplete={() => { setSetupDone(true); setAutoPull(true); }} />;

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white flex flex-col">
      <header className="sticky top-0 z-40 bg-[#0a0a0b]/95 backdrop-blur border-b border-zinc-800/60 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5"><div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20"><BookMarked className="w-4 h-4 text-blue-400" /></div><span className="font-semibold text-white text-sm">북마크</span></div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => actionsRef.current?.push()} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200 rounded-lg border border-zinc-700/50 transition-all" title="Supabase에 Push"><CloudUpload className="w-3.5 h-3.5" /><span className="hidden sm:inline">Push</span></button>
            <button onClick={() => actionsRef.current?.pull()} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200 rounded-lg border border-zinc-700/50 transition-all" title="Supabase에서 Pull"><CloudDownload className="w-3.5 h-3.5" /><span className="hidden sm:inline">Pull</span></button>
            {HAS_ENV_CREDS ? (
              <button onClick={() => { const d = getStoredPortalData(); delete d.deviceId; delete d.deviceName; localStorage.setItem('portalData', JSON.stringify(d)); setSetupDone(false); }} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200 rounded-lg border border-zinc-700/50 transition-all"><Settings className="w-3.5 h-3.5" /><span className="hidden sm:inline">단말 변경</span></button>
            ) : (
              <button onClick={() => setOpenSettings(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200 rounded-lg border border-zinc-700/50 transition-all"><Settings className="w-3.5 h-3.5" /><span className="hidden sm:inline">설정</span></button>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-4">
        <PortalManager showToast={showToast} openSettings={openSettings} onSettingsClosed={() => setOpenSettings(false)} actionsRef={actionsRef} isVisible={true} onChangeDevice={() => {
            const d = getStoredPortalData();
            delete d.deviceId;
            delete d.deviceName;
            localStorage.setItem('portalData', JSON.stringify(d));
            setSetupDone(false);
          }} />
      </main>
      {toasts.map(t => <Toast key={t.id} message={t.message} type={t.type} />)}
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App /></React.StrictMode>);
