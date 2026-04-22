import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import PortalManager, { PortalActions } from './PortalManager';
import {
  BookMarked, Settings, CloudUpload, CloudDownload,
  ExternalLink, Github, RefreshCw, Clock, Monitor, Smartphone,
  Plus, Pencil, Trash2, Play, Square, RotateCw, Server,
  ChevronDown, X,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const PW_VERIFIED_KEY = 'portal_pw_verified';
const REQUIRED_HASH = (import.meta.env.VITE_PORTAL_PASSWORD_HASH as string | undefined) ?? '';
const PORTAL_WEB_KEY = 'portalData_v1';
const VIEW_MODE_KEY = 'portalViewMode';
const SELECTED_DEVICE_KEY = 'portalSelectedDevice';

// ─── URL param auto-auth (e.g. ?url=...&key=...&device=...&name=...) ──────────
;(function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get('url');
  const key = params.get('key');
  if (!url || !key) return;
  try {
    const existing = JSON.parse(localStorage.getItem(PORTAL_WEB_KEY) ?? '{}');
    existing.supabaseUrl = url;
    existing.supabaseAnonKey = key;
    localStorage.setItem(PORTAL_WEB_KEY, JSON.stringify(existing));
    // Only set the *viewing* selection, never overwrite this browser's own identity
    const device = params.get('device');
    if (device) localStorage.setItem(SELECTED_DEVICE_KEY, device);
  } catch {}
  window.history.replaceState({}, '', window.location.pathname);
})();

type ViewMode = 'auto' | 'compact' | 'full';
type Tab = 'bookmarks' | 'ports';

interface PortRow {
  id: string;
  name: string;
  port?: number | null;
  command_path?: string | null;
  terminal_command?: string | null;
  folder_path?: string | null;
  deploy_url?: string | null;
  github_url?: string | null;
  device_id?: string | null;
  device_name?: string | null;
}

interface DeviceRow {
  id: string;
  name: string | null;
  last_push_at: string;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isPasswordVerified(): boolean {
  if (!REQUIRED_HASH) return true;
  return localStorage.getItem(PW_VERIFIED_KEY) === REQUIRED_HASH;
}

function getSupabaseCreds(): { url: string; key: string } | null {
  try {
    const raw = localStorage.getItem(PORTAL_WEB_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d.supabaseUrl && d.supabaseAnonKey) return { url: d.supabaseUrl, key: d.supabaseAnonKey };
    }
    const creds = localStorage.getItem('portalCreds');
    if (creds) {
      const { supabaseUrl, supabaseAnonKey } = JSON.parse(creds);
      if (supabaseUrl && supabaseAnonKey) return { url: supabaseUrl, key: supabaseAnonKey };
    }
  } catch {}
  return null;
}

// ─── PasswordGate ─────────────────────────────────────────────────────────────

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
  return (
    <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center p-4">
      <div className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <BookMarked className="w-4 h-4 text-blue-400" />
          </div>
          <span className="font-semibold text-white text-sm">포트 관리기</span>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">비밀번호</label>
          <input className={inp} type="password" placeholder="••••••••" value={pw}
            onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && verify()} autoFocus />
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="accent-blue-500 w-3.5 h-3.5" />
          <span className="text-xs text-zinc-400">이 브라우저에서 기억하기</span>
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded font-medium transition-colors"
          onClick={verify} disabled={loading || !pw.trim()}>
          {loading ? '확인 중…' : '입장'}
        </button>
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2 animate-slide-in ${
      type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
    }`}>{message}</div>
  );
}

// ─── Port Edit Modal ───────────────────────────────────────────────────────────

function PortModal({ port, onSave, onClose }: {
  port: Partial<PortRow> | null;
  onSave: (data: Partial<PortRow>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<PortRow>>(port ?? {});
  const inp = 'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500';
  const lbl = 'text-xs text-zinc-400 mb-1 block';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">{form.id ? '포트 편집' : '포트 추가'}</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={lbl}>이름 *</label>
            <input className={inp} placeholder="프로젝트 이름" value={form.name ?? ''}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div>
            <label className={lbl}>포트 번호</label>
            <input className={inp} type="number" placeholder="3000" value={form.port ?? ''}
              onChange={e => setForm(f => ({ ...f, port: e.target.value ? parseInt(e.target.value) : undefined }))} />
          </div>
          <div>
            <label className={lbl}>실행 명령어</label>
            <input className={inp} placeholder="bun run dev" value={form.terminal_command ?? ''}
              onChange={e => setForm(f => ({ ...f, terminal_command: e.target.value || null }))} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>.command 파일 경로</label>
            <input className={inp} placeholder="/path/to/run.command" value={form.command_path ?? ''}
              onChange={e => setForm(f => ({ ...f, command_path: e.target.value || null }))} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>배포 URL</label>
            <input className={inp} placeholder="https://myapp.vercel.app" value={form.deploy_url ?? ''}
              onChange={e => setForm(f => ({ ...f, deploy_url: e.target.value || null }))} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>GitHub URL</label>
            <input className={inp} placeholder="https://github.com/..." value={form.github_url ?? ''}
              onChange={e => setForm(f => ({ ...f, github_url: e.target.value || null }))} />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-zinc-400 border border-zinc-700 rounded hover:bg-zinc-800 transition-colors">취소</button>
          <button onClick={() => { if (form.name?.trim()) onSave(form); }} disabled={!form.name?.trim()}
            className="flex-1 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded font-medium transition-colors">
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Ports View ───────────────────────────────────────────────────────────────

function PortsView({ deviceId, creds, showToast }: {
  deviceId: string;
  creds: { url: string; key: string };
  showToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const [ports, setPorts] = useState<PortRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editPort, setEditPort] = useState<Partial<PortRow> | null | false>(false);
  const [relayConnected, setRelayConnected] = useState(false);
  const [running, setRunning] = useState<Record<string, boolean>>({});

  const sb = useCallback(() => createClient(creds.url, creds.key), [creds.url, creds.key]);

  async function loadPorts() {
    if (!deviceId) return;
    setLoading(true);
    try {
      const { data, error } = await sb().from('ports').select('*').eq('device_id', deviceId).order('name');
      if (error) throw error;
      setPorts(data ?? []);
    } catch (e: unknown) {
      const msg = (e as any)?.message ?? JSON.stringify(e);
      showToast('포트 로드 실패: ' + msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function checkRelayConnected() {
    if (!deviceId) return;
    try {
      const since = new Date(Date.now() - 35000).toISOString();
      const { data } = await sb().from('relay_results')
        .select('id').eq('device_id', deviceId).eq('message', 'heartbeat')
        .gte('created_at', since).limit(1);
      setRelayConnected((data ?? []).length > 0);
    } catch {}
  }

  useEffect(() => {
    loadPorts();
    checkRelayConnected();
    const iv = setInterval(checkRelayConnected, 15000);
    return () => clearInterval(iv);
  }, [deviceId]);

  async function savePort(form: Partial<PortRow>) {
    try {
      if (form.id) {
        const { error } = await sb().from('ports').update({
          name: form.name,
          port: form.port ?? null,
          command_path: form.command_path ?? null,
          terminal_command: form.terminal_command ?? null,
          deploy_url: form.deploy_url ?? null,
          github_url: form.github_url ?? null,
        }).eq('id', form.id);
        if (error) throw error;
        setPorts(ps => ps.map(p => p.id === form.id ? { ...p, ...form } : p));
        showToast('저장됨', 'success');
      } else {
        const newRow: PortRow = {
          id: crypto.randomUUID(),
          name: form.name!,
          port: form.port ?? null,
          command_path: form.command_path ?? null,
          terminal_command: form.terminal_command ?? null,
          deploy_url: form.deploy_url ?? null,
          github_url: form.github_url ?? null,
          device_id: deviceId,
        };
        const { error } = await sb().from('ports').insert(newRow);
        if (error) throw error;
        setPorts(ps => [...ps, newRow].sort((a, b) => a.name.localeCompare(b.name)));
        showToast('추가됨', 'success');
      }
      setEditPort(false);
    } catch (e) {
      showToast('저장 실패: ' + String(e), 'error');
    }
  }

  async function deletePort(id: string) {
    if (!confirm('이 포트를 삭제하시겠습니까?')) return;
    try {
      const { error } = await sb().from('ports').delete().eq('id', id);
      if (error) throw error;
      setPorts(ps => ps.filter(p => p.id !== id));
      showToast('삭제됨', 'success');
    } catch (e) {
      showToast('삭제 실패: ' + String(e), 'error');
    }
  }

  async function relayCommand(port: PortRow, command: 'execute' | 'stop' | 'force_restart') {
    if (!relayConnected) { showToast('릴레이 데몬이 연결되지 않았습니다 (bun relay.ts)', 'error'); return; }
    const cmdId = crypto.randomUUID();
    setRunning(r => ({ ...r, [port.id]: true }));
    try {
      const { error } = await sb().from('relay_commands').insert({
        id: cmdId, device_id: deviceId, command,
        port_id: port.id, command_path: port.command_path ?? null, port: port.port ?? null,
      });
      if (error) throw error;
      let result: any = null;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        const { data } = await sb().from('relay_results').select('*').eq('command_id', cmdId).limit(1);
        if ((data ?? []).length > 0) { result = data![0]; break; }
      }
      if (result) {
        const label = command === 'stop' ? '중지' : command === 'force_restart' ? '강제재실행' : '실행';
        showToast(result.success ? `${label} 완료` : `실패: ${result.message}`, result.success ? 'success' : 'error');
      } else {
        showToast('응답 없음 — relay.ts가 실행 중인지 확인하세요', 'error');
      }
    } catch (e) {
      showToast('명령 전송 실패: ' + String(e), 'error');
    } finally {
      setRunning(r => ({ ...r, [port.id]: false }));
    }
  }

  if (!deviceId) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
      <Server className="w-10 h-10 text-zinc-700" />
      <p className="text-sm text-zinc-500">기기를 선택하세요</p>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <p className="text-xs text-zinc-500">{ports.length}개 포트</p>
          <span className={`px-2 py-0.5 rounded-full text-[10px] border ${
            relayConnected
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-zinc-800/60 border-zinc-700/40 text-zinc-500'
          }`}>
            {relayConnected ? '● 릴레이 연결' : '○ 릴레이 없음'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadPorts} disabled={loading}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setEditPort(null)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg transition-all">
            <Plus className="w-3 h-3" /> 추가
          </button>
        </div>
      </div>

      {!loading && ports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <Server className="w-10 h-10 text-zinc-700" />
          <p className="text-sm text-zinc-500">등록된 포트가 없습니다</p>
          <button onClick={() => setEditPort(null)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
            + 첫 포트 추가
          </button>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-5 h-5 text-zinc-500 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {ports.map(p => (
            <div key={p.id} className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-4 hover:border-zinc-700/60 transition-all">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white leading-snug truncate">{p.name}</p>
                  {p.port && <span className="text-[10px] text-zinc-600 font-mono">:{p.port}</span>}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => setEditPort(p)}
                    className="p-1.5 text-zinc-600 hover:text-zinc-300 rounded transition-colors">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button onClick={() => deletePort(p.id)}
                    className="p-1.5 text-zinc-600 hover:text-red-400 rounded transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-2">
                {p.deploy_url && (
                  <a href={p.deploy_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2 py-1 text-[11px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-md transition-all">
                    <ExternalLink className="w-2.5 h-2.5" />배포
                  </a>
                )}
                {p.github_url && (
                  <a href={p.github_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2 py-1 text-[11px] bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-300 border border-zinc-700/50 rounded-md transition-all">
                    <Github className="w-2.5 h-2.5" />GitHub
                  </a>
                )}
              </div>

              {(p.command_path || p.terminal_command) && (
                <div className="flex gap-1.5 pt-2 border-t border-zinc-800/60">
                  <button onClick={() => relayCommand(p, 'execute')}
                    disabled={!relayConnected || running[p.id]}
                    title={relayConnected ? '실행' : 'bun relay.ts 실행 필요'}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                    {running[p.id] ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Play className="w-2.5 h-2.5" />}
                    실행
                  </button>
                  <button onClick={() => relayCommand(p, 'stop')}
                    disabled={!relayConnected || running[p.id]}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 border border-zinc-700/50 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                    <Square className="w-2.5 h-2.5" />중지
                  </button>
                  <button onClick={() => relayCommand(p, 'force_restart')}
                    disabled={!relayConnected || running[p.id]}
                    title="강제재실행"
                    className="flex items-center gap-1 px-2 py-1 text-[11px] bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 border border-zinc-700/50 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                    <RotateCw className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editPort !== false && (
        <PortModal port={editPort} onSave={savePort} onClose={() => setEditPort(false)} />
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  const [pwOk, setPwOk] = useState(isPasswordVerified);
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([]);
  const [openSettings, setOpenSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('bookmarks');
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) ?? 'auto'
  );
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(
    () => localStorage.getItem(SELECTED_DEVICE_KEY) ?? ''
  );
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const actionsRef = useRef<PortalActions | null>(null);
  const creds = getSupabaseCreds();

  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const isFullLayout = viewMode === 'full' || (viewMode === 'auto' && windowWidth >= 1024);

  const showToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  };

  async function loadDevices() {
    if (!creds) return;
    try {
      const sb = createClient(creds.url, creds.key);
      const { data } = await sb.from('devices').select('*').order('last_push_at', { ascending: false });
      const list: DeviceRow[] = data ?? [];
      setDevices(list);
      if (!selectedDeviceId && list.length > 0) {
        const first = list[0].id;
        setSelectedDeviceId(first);
        localStorage.setItem(SELECTED_DEVICE_KEY, first);
      }
    } catch {}
  }

  useEffect(() => { if (pwOk) loadDevices(); }, [pwOk, creds?.url]);

  function selectDevice(id: string) {
    setSelectedDeviceId(id);
    localStorage.setItem(SELECTED_DEVICE_KEY, id);
    setShowDevicePicker(false);
  }

  function cycleViewMode() {
    const next: ViewMode = viewMode === 'auto' ? 'full' : viewMode === 'full' ? 'compact' : 'auto';
    setViewMode(next);
    localStorage.setItem(VIEW_MODE_KEY, next);
  }

  if (!pwOk) return <PasswordGate onVerified={() => setPwOk(true)} />;

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  const viewModeIcon = viewMode === 'full'
    ? <Monitor className="w-3.5 h-3.5" />
    : viewMode === 'compact'
    ? <Smartphone className="w-3.5 h-3.5" />
    : <RefreshCw className="w-3.5 h-3.5" />;

  const devicePickerEl = (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setShowDevicePicker(s => !s)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-300 border border-zinc-700/50 rounded-lg transition-all max-w-[160px]"
      >
        <Server className="w-3 h-3 shrink-0 text-zinc-500" />
        <span className="truncate">{selectedDevice?.name ?? '기기 선택'}</span>
        <ChevronDown className="w-3 h-3 shrink-0 text-zinc-600" />
      </button>
      {showDevicePicker && (
        <div className="absolute top-full mt-1 left-0 z-50 w-56 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden">
          <div className="px-3 py-2 text-[10px] text-zinc-500 border-b border-zinc-800 flex items-center justify-between">
            <span>기기 선택</span>
            <button onClick={loadDevices} className="text-zinc-600 hover:text-zinc-400">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
          {devices.length === 0 ? (
            <div className="px-3 py-3 text-xs text-zinc-500">기기가 없습니다.<br />앱에서 Push하면 등록됩니다.</div>
          ) : devices.map(d => (
            <button key={d.id} onClick={() => selectDevice(d.id)}
              className={`w-full text-left px-3 py-2.5 text-xs hover:bg-zinc-800 transition-colors border-b border-zinc-800/50 last:border-0 ${
                d.id === selectedDeviceId ? 'text-blue-300 bg-blue-500/5' : 'text-zinc-300'
              }`}>
              <div className="font-medium truncate">{d.name ?? d.id.slice(0, 8)}</div>
              <div className="text-[10px] text-zinc-600 mt-0.5">
                {new Date(d.last_push_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const btnCls = 'flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200 rounded-lg border border-zinc-700/50 transition-all';

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white flex flex-col" onClick={() => showDevicePicker && setShowDevicePicker(false)}>
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-[#0a0a0b]/95 backdrop-blur border-b border-zinc-800/60 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <BookMarked className="w-4 h-4 text-blue-400" />
              </div>
              <span className="font-semibold text-white text-sm hidden sm:inline">포트 관리기</span>
            </div>
            {/* Tabs — compact mode only */}
            {!isFullLayout && (
              <div className="flex items-center gap-1">
                {(['bookmarks', 'ports'] as Tab[]).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all ${
                      activeTab === tab
                        ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                        : 'bg-zinc-800/40 border-zinc-700/40 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/40'
                    }`}>
                    {tab === 'bookmarks' ? <BookMarked className="w-3 h-3" /> : <Server className="w-3 h-3" />}
                    {tab === 'bookmarks' ? '북마크' : '포트'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Device picker — compact header */}
            {!isFullLayout && devicePickerEl}

            {/* Bookmark actions */}
            {(activeTab === 'bookmarks' || isFullLayout) && <>
              <button onClick={() => actionsRef.current?.push()} className={btnCls} title="Push">
                <CloudUpload className="w-3.5 h-3.5" /><span className="hidden sm:inline">Push</span>
              </button>
              <button onClick={() => actionsRef.current?.pull()} className={btnCls} title="Pull">
                <CloudDownload className="w-3.5 h-3.5" /><span className="hidden sm:inline">Pull</span>
              </button>
              <button onClick={() => actionsRef.current?.history()} className={btnCls} title="히스토리">
                <Clock className="w-3.5 h-3.5" />
              </button>
            </>}

            {/* Layout toggle */}
            <button onClick={cycleViewMode} className={btnCls} title={`레이아웃: ${viewMode}`}>
              {viewModeIcon}
            </button>
            <button onClick={() => setOpenSettings(true)} className={btnCls}>
              <Settings className="w-3.5 h-3.5" /><span className="hidden sm:inline">설정</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 max-w-7xl mx-auto w-full flex">
        {isFullLayout ? (
          <>
            {/* Sidebar */}
            <aside className="w-52 shrink-0 border-r border-zinc-800/60 px-4 py-5 space-y-5">
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">기기</p>
                {devicePickerEl}
              </div>
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">메뉴</p>
                <nav className="space-y-0.5">
                  {([
                    ['bookmarks', '북마크', <BookMarked className="w-3.5 h-3.5" />],
                    ['ports', '포트 관리', <Server className="w-3.5 h-3.5" />],
                  ] as [Tab, string, React.ReactNode][]).map(([tab, label, icon]) => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 text-xs rounded-lg transition-all ${
                        activeTab === tab
                          ? 'bg-blue-500/15 text-blue-300'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                      }`}>
                      {icon}{label}
                    </button>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 px-6 py-5 overflow-auto min-w-0">
              <PortalManager showToast={showToast} openSettings={openSettings}
                onSettingsClosed={() => setOpenSettings(false)} actionsRef={actionsRef}
                isVisible={activeTab === 'bookmarks'} />
              {activeTab === 'ports' && (
                creds && selectedDeviceId ? (
                  <PortsView deviceId={selectedDeviceId} creds={creds} showToast={showToast} />
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                    <p className="text-sm text-zinc-500">
                      {!creds ? '설정에서 Supabase URL/Key를 입력하세요' : '좌측에서 기기를 선택하세요'}
                    </p>
                  </div>
                )
              )}
            </main>
          </>
        ) : (
          /* Compact layout */
          <main className="flex-1 px-4 py-4">
            <PortalManager showToast={showToast} openSettings={openSettings}
              onSettingsClosed={() => setOpenSettings(false)} actionsRef={actionsRef}
              isVisible={activeTab === 'bookmarks'} />
            {activeTab === 'ports' && (
              creds && selectedDeviceId ? (
                <PortsView deviceId={selectedDeviceId} creds={creds} showToast={showToast} />
              ) : (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                  <p className="text-sm text-zinc-500">
                    {!creds ? '설정에서 Supabase URL/Key를 입력하세요' : '헤더에서 기기를 선택하세요'}
                  </p>
                </div>
              )
            )}
          </main>
        )}
      </div>

      {toasts.map(t => <Toast key={t.id} message={t.message} type={t.type} />)}
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App /></React.StrictMode>);
