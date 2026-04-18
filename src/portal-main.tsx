import React, { useState, useCallback, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import PortalManager from './PortalManager';
import './index.css';

const STORAGE_KEY = 'portalData_v1';
const PW_VERIFIED_KEY = 'portal_pw_verified';
const REQUIRED_HASH = (import.meta.env.VITE_PORTAL_PASSWORD_HASH as string | undefined) ?? '';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isPasswordVerified(): boolean {
  if (!REQUIRED_HASH) return true; // no password configured
  return localStorage.getItem(PW_VERIFIED_KEY) === REQUIRED_HASH;
}

interface StoredConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  deviceId: string;
  deviceName: string;
}

function loadConfig(): StoredConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d.supabaseUrl && d.supabaseAnonKey && d.deviceId) return d as StoredConfig;
    }
  } catch {}
  return null;
}

// ── PasswordGate ─────────────────────────────────────────────────────────────

function PasswordGate({ onVerified }: { onVerified: () => void }) {
  const [pw, setPw] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function verify() {
    if (!pw.trim()) return;
    setLoading(true); setError('');
    const hash = await sha256(pw.trim());
    if (hash === REQUIRED_HASH) {
      if (remember) localStorage.setItem(PW_VERIFIED_KEY, REQUIRED_HASH);
      onVerified();
    } else {
      setError('비밀번호가 틀렸습니다');
    }
    setLoading(false);
  }

  const inp = 'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500';
  const btn = 'w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded font-medium transition-colors';

  return (
    <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center p-4">
      <div className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h1 className="text-base font-semibold text-zinc-100">북마크 포털</h1>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">비밀번호</label>
          <input className={inp} type="password" placeholder="••••••••" value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && verify()}
            autoFocus />
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
            className="accent-blue-500 w-3.5 h-3.5" />
          <span className="text-xs text-zinc-400">이 브라우저에서 기억하기</span>
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button className={btn} onClick={verify} disabled={loading || !pw.trim()}>
          {loading ? '확인 중…' : '입장'}
        </button>
      </div>
    </div>
  );
}

// ── DeviceSetup ───────────────────────────────────────────────────────────────

interface KnownDevice { device_id: string; device_name?: string; }

function DeviceSetup({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<'creds' | 'device'>('creds');
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [devices, setDevices] = useState<KnownDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');

  async function connectSupabase() {
    if (!url.trim() || !key.trim()) { setError('URL과 키를 모두 입력하세요'); return; }
    setLoading(true); setError('');
    try {
      const sb = createClient(url.trim(), key.trim());
      const { data, error: qErr } = await sb
        .from('ports')
        .select('device_id, device_name, folder_path')
        .not('device_id', 'is', null);
      if (qErr) throw new Error(qErr.message);

      const seen = new Map<string, string | undefined>();
      for (const r of (data ?? [])) {
        if (!seen.has(r.device_id)) {
          const name = r.device_name ||
            (/^\/Users\/([^/]+)/.exec(r.folder_path ?? '')?.[1]) ||
            undefined;
          seen.set(r.device_id, name);
        }
      }
      setDevices(Array.from(seen.entries()).map(([device_id, device_name]) => ({ device_id, device_name })));
      setStep('device');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }

  function saveAndEnter(deviceId: string, deviceName: string) {
    const config: StoredConfig = { supabaseUrl: url.trim(), supabaseAnonKey: key.trim(), deviceId, deviceName };
    const existing = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { return {}; } })();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: [], categories: [], ...existing, ...config }));
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
        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">북마크 포털</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {step === 'creds' ? 'Supabase 연결 정보를 입력하세요' : '현재 사용 중인 기기를 선택하세요'}
          </p>
        </div>

        {/* Step 1: Credentials */}
        {step === 'creds' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Supabase URL</label>
              <input className={inp} placeholder="https://xxxx.supabase.co" value={url}
                onChange={e => setUrl(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Anon Key</label>
              <input className={inp} type="password" placeholder="eyJhbGciOiJ…" value={key}
                onChange={e => setKey(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && connectSupabase()} />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button className={btn} onClick={connectSupabase} disabled={loading}>
              {loading ? '연결 중…' : '기기 목록 불러오기 →'}
            </button>
          </div>
        )}

        {/* Step 2: Device picker */}
        {step === 'device' && (
          <div className="space-y-3">
            {devices.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-400">{devices.length}개 등록된 기기</p>
                {devices.map(d => (
                  <button key={d.device_id} onClick={() => saveAndEnter(d.device_id, d.device_name ?? d.device_id.slice(0, 8))}
                    className="w-full text-left px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors">
                    <div className="text-sm font-medium text-zinc-100">{d.device_name ?? '이름 없는 기기'}</div>
                    <div className="text-xs text-zinc-500 font-mono">{d.device_id.slice(0, 16)}…</div>
                  </button>
                ))}
              </div>
            )}

            <div className={devices.length > 0 ? 'pt-3 border-t border-zinc-800' : ''}>
              <p className="text-xs text-zinc-400 mb-2">{devices.length > 0 ? '또는 새 기기로 시작' : '새 기기 등록'}</p>
              <div className="flex gap-2">
                <input className={inp} placeholder="기기 이름 (예: MacBook Pro)"
                  value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createNew()} />
                <button className={btn} onClick={createNew}>등록</button>
              </div>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}
            <button onClick={() => setStep('creds')}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              ← 다시 연결
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

interface Toast { id: number; message: string; type: 'success' | 'error'; }

// ── App ───────────────────────────────────────────────────────────────────────

function PortalApp() {
  const [pwOk, setPwOk] = useState(isPasswordVerified);
  const [ready, setReady] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (!pwOk) return;
    const cfg = loadConfig();
    if (cfg) setReady(true);
    else setNeedsSetup(true);
  }, [pwOk]);

  const showToast = useCallback((msg: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message: msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  if (!pwOk) return <PasswordGate onVerified={() => setPwOk(true)} />;
  if (needsSetup) return <DeviceSetup onComplete={() => { setNeedsSetup(false); setReady(true); }} />;
  if (!ready) return null;

  return (
    <div className="min-h-screen bg-[#0a0a0b]">
      <PortalManager showToast={showToast} isVisible={true} />
      <div className="fixed top-4 right-4 flex flex-col gap-2 z-50 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
            className={`px-4 py-2 rounded text-sm text-white shadow-lg ${t.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<PortalApp />);
