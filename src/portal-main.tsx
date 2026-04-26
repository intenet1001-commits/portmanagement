import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import PortalManager, { PortalActions } from './PortalManager';
import {
  BookMarked, Settings, CloudUpload, CloudDownload,
  ExternalLink, Github, RefreshCw, Clock, Monitor, Smartphone,
  Server, Pencil, Trash2,
  ChevronDown, X, MoreHorizontal, Link2,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { fetchPushHistory, type PushSnapshot } from './pushHistory';

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
    const nameParam = params.get('name');
    if (device) {
      localStorage.setItem(SELECTED_DEVICE_KEY, device);
      if (nameParam) {
        const withName = JSON.parse(localStorage.getItem(PORTAL_WEB_KEY) ?? '{}');
        withName.deviceId = device;
        withName.deviceName = nameParam;
        localStorage.setItem(PORTAL_WEB_KEY, JSON.stringify(withName));
      }
    }
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
          <span className="font-semibold text-white text-sm">북마크</span>
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
    <div
      className={`fixed z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2 animate-slide-in ${
        type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
      }`}
      style={{top:'calc(env(safe-area-inset-top) + 1rem)',right:'calc(env(safe-area-inset-right) + 1rem)'}}
    >{message}</div>
  );
}

// ─── Ports View ───────────────────────────────────────────────────────────────

function PortsView({ deviceId, creds, showToast, onSwitchDevice }: {
  deviceId: string;
  creds: { url: string; key: string };
  showToast: (msg: string, type: 'success' | 'error') => void;
  onSwitchDevice?: () => void;
}) {
  const [ports, setPorts] = useState<PortRow[]>([]);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    loadPorts();
  }, [deviceId]);

  if (!deviceId) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
      <Server className="w-10 h-10 text-zinc-700" />
      <p className="text-sm text-zinc-500">기기를 선택하세요</p>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-zinc-500">{ports.length}개 포트</p>
        <button onClick={loadPorts} disabled={loading}
          className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {!loading && ports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <Server className="w-10 h-10 text-zinc-700" />
          <p className="text-sm text-zinc-500">등록된 포트가 없습니다</p>
          <p className="text-xs text-zinc-600">로컬 앱에서 Push하면 여기에 나타납니다</p>
          {onSwitchDevice && (
            <button onClick={onSwitchDevice}
              className="mt-2 px-3 py-1.5 text-xs text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors">
              다른 기기 선택
            </button>
          )}
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-5 h-5 text-zinc-500 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {ports.map(p => (
            <div key={p.id} className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-4 hover:border-zinc-700/60 transition-all">
              <div className="mb-2">
                <p className="text-sm font-medium text-white leading-snug truncate">{p.name}</p>
                {p.port && <span className="text-[10px] text-zinc-600 font-mono">:{p.port}</span>}
              </div>

              <div className="flex flex-wrap gap-1.5">
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
                {!p.deploy_url && !p.github_url && (
                  <span className="text-[10px] text-zinc-700">링크 없음</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

// ─── Device Manager Modal ─────────────────────────────────────────────────────

function DeviceManagerModal({ devices, creds, onClose, onUpdate }: {
  devices: DeviceRow[];
  creds: { url: string; key: string };
  onClose: () => void;
  onUpdate: (devices: DeviceRow[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const sb = createClient(creds.url, creds.key);
      const { error } = await sb.from('devices').update({ name: editName.trim() }).eq('id', id);
      if (error) throw error;
      onUpdate(devices.map(d => d.id === id ? { ...d, name: editName.trim() } : d));
      setEditingId(null);
    } catch (e) {
      alert('저장 실패: ' + String(e));
    } finally {
      setSaving(false);
    }
  }

  async function deleteDevice(id: string) {
    if (!confirm('이 기기를 삭제하시겠습니까?')) return;
    setDeletingId(id);
    try {
      const sb = createClient(creds.url, creds.key);
      const { error } = await sb.from('devices').delete().eq('id', id);
      if (error) throw error;
      onUpdate(devices.filter(d => d.id !== id));
    } catch (e) {
      alert('삭제 실패: ' + String(e));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <span className="text-sm font-semibold text-white">기기 관리</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-zinc-800">
          {devices.length === 0 ? (
            <div className="px-4 py-6 text-xs text-zinc-500 text-center">등록된 기기가 없습니다</div>
          ) : devices.map(d => (
            <div key={d.id} className="px-4 py-3 flex items-center gap-2">
              {editingId === d.id ? (
                <>
                  <input
                    className="flex-1 min-w-0 px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(d.id); if (e.key === 'Escape') setEditingId(null); }}
                    autoFocus
                  />
                  <button onClick={() => saveEdit(d.id)} disabled={saving}
                    className="shrink-0 px-2 py-1 text-[11px] bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors">저장</button>
                  <button onClick={() => setEditingId(null)}
                    className="shrink-0 px-2 py-1 text-[11px] text-zinc-500 border border-zinc-700 rounded hover:bg-zinc-800 transition-colors">취소</button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-200 truncate">{d.name ?? d.id.slice(0, 8)}</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">
                      {new Date(d.last_push_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <button onClick={() => { setEditingId(d.id); setEditName(d.name ?? ''); }}
                    className="shrink-0 px-2 py-1 text-[11px] text-zinc-400 border border-zinc-700 rounded hover:bg-zinc-800 transition-colors flex items-center gap-1">
                    <Pencil className="w-3 h-3" />편집
                  </button>
                  <button onClick={() => deleteDevice(d.id)} disabled={deletingId === d.id}
                    className="shrink-0 px-2 py-1 text-[11px] text-red-400 border border-red-900/50 rounded hover:bg-red-500/10 transition-colors disabled:opacity-50 flex items-center gap-1">
                    <Trash2 className="w-3 h-3" />{deletingId === d.id ? '…' : '삭제'}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
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
  const [showDeviceManager, setShowDeviceManager] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [registering, setRegistering] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showPortsHistory, setShowPortsHistory] = useState(false);
  const [portsHistoryList, setPortsHistoryList] = useState<PushSnapshot[]>([]);
  const [portsHistoryLoading, setPortsHistoryLoading] = useState(false);
  const actionsRef = useRef<PortalActions | null>(null);
  const creds = getSupabaseCreds();

  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Startup sync: heal pre-existing mismatch between portalSelectedDevice and portalData_v1.deviceId
  useEffect(() => {
    const selectedId = localStorage.getItem(SELECTED_DEVICE_KEY);
    if (!selectedId) return;
    try {
      const existing = JSON.parse(localStorage.getItem(PORTAL_WEB_KEY) ?? '{}');
      if (existing.deviceId !== selectedId) {
        existing.deviceId = selectedId;
        localStorage.setItem(PORTAL_WEB_KEY, JSON.stringify(existing));
      }
    } catch {}
  }, []);

  const isFullLayout = viewMode === 'full' || (viewMode === 'auto' && windowWidth >= 1024);

  const showToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  };

  // ─── Handoff: "이 설정을 다른 기기에 전달" (1st → 2nd+ 기기) ─────────────────
  async function handleCopySetup() {
    if (!creds) {
      showToast('Supabase 설정이 없습니다', 'error');
      return;
    }
    const pwHash = localStorage.getItem(PW_VERIFIED_KEY) ?? '';
    const payload = {
      v: 1,
      type: 'portmanager-setup',
      url: creds.url,
      key: creds.key,
      pwHash,
      copiedAt: new Date().toISOString(),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload));
      showToast('설정 복사됨 — 새 기기의 로컬 앱 → 설정 → 추가 기기 → 붙여넣기', 'success');
    } catch (e: any) {
      showToast('복사 실패: ' + (e?.message ?? e), 'error');
    }
  }

  async function loadDevices() {
    if (!creds) return;
    try {
      const sb = createClient(creds.url, creds.key);
      const nameMap = new Map<string, string>();
      const seenIds = new Set<string>();

      // 1) devices 테이블 (이름 우선)
      const { data: devRows } = await sb.from('devices').select('*').order('last_push_at', { ascending: false });
      for (const d of devRows ?? []) {
        seenIds.add(d.id);
        if (d.name) nameMap.set(d.id, d.name);
      }

      // 2) workspace_roots __device__ sentinel → 기기명 (가장 신뢰할 수 있는 소스)
      const { data: rootRows } = await sb.from('workspace_roots').select('device_id, name, path').not('device_id', 'is', null);
      for (const r of rootRows ?? []) {
        if (!r.device_id || r.device_id === '__shared__') continue;
        seenIds.add(r.device_id);
        if (r.path?.startsWith('__device__') && r.name && !nameMap.has(r.device_id)) {
          nameMap.set(r.device_id, r.name);
        }
      }

      // 3) ports 테이블 device_name 컬럼
      const { data: portRows } = await sb.from('ports').select('device_id, device_name').not('device_id', 'is', null);
      for (const r of portRows ?? []) {
        if (!r.device_id) continue;
        seenIds.add(r.device_id);
        if (r.device_name && !nameMap.has(r.device_id)) nameMap.set(r.device_id, r.device_name);
      }

      // 4) portal_items folder 타입 → 경로에서 사용자명 추출 (최후 fallback)
      const { data: folderRows } = await sb.from('portal_items').select('device_id, path').eq('type', 'folder').not('device_id', 'is', null);
      for (const r of folderRows ?? []) {
        if (!r.device_id || r.device_id === '__shared__') continue;
        seenIds.add(r.device_id);
        if (!nameMap.has(r.device_id) && r.path) {
          const m = r.path.match(/^\/(?:Users|home)\/([^/]+)\//);
          if (m) nameMap.set(r.device_id, `${m[1]}의 기기`);
        }
      }

      // devices 테이블에 행이 있으면 그것을 기준으로 필터링 (삭제된 기기 제외)
      const registeredIds = devRows && devRows.length > 0
        ? new Set(devRows.map(d => d.id))
        : null;
      const filteredIds = registeredIds
        ? Array.from(seenIds).filter(id => registeredIds.has(id))
        : Array.from(seenIds);

      const list: DeviceRow[] = filteredIds.map(id => ({
        id,
        name: nameMap.get(id) ?? id.slice(0, 8),
        last_push_at: (devRows ?? []).find(d => d.id === id)?.last_push_at ?? '',
      })).sort((a, b) => (b.last_push_at ?? '').localeCompare(a.last_push_at ?? ''));

      setDevices(list);
      // Heal missing deviceName in localStorage using Supabase devices list
      const storedId = localStorage.getItem(SELECTED_DEVICE_KEY);
      if (storedId) {
        const matched = list.find(d => d.id === storedId);
        if (matched?.name) {
          const existing = JSON.parse(localStorage.getItem(PORTAL_WEB_KEY) ?? '{}');
          if (!existing.deviceName) {
            existing.deviceName = matched.name;
            localStorage.setItem(PORTAL_WEB_KEY, JSON.stringify(existing));
          }
        }
      }
      // Auto-open picker if no device selected OR selected device not in list
      const knownInList = list.some(d => d.id === selectedDeviceId);
      if ((!selectedDeviceId || !knownInList) && list.length > 0) {
        // Auto-select if only one candidate with ports (most recent push)
        if (list.length === 1) {
          selectDevice(list[0].id, list[0].name ?? undefined);
        } else {
          setShowDevicePicker(true);
        }
      }
    } catch {}
  }

  async function registerThisDevice() {
    if (!creds || !registerName.trim()) return;
    const trimmed = registerName.trim();
    if (devices.some(d => d.name === trimmed)) {
      showToast('같은 이름의 기기가 이미 있습니다', 'error');
      return;
    }
    setRegistering(true);
    try {
      const newId = crypto.randomUUID();
      const sb = createClient(creds.url, creds.key);
      const { error } = await sb.from('devices').insert({ id: newId, name: registerName.trim() });
      if (error) throw error;
      const newDev: DeviceRow = { id: newId, name: registerName.trim(), last_push_at: new Date().toISOString() };
      setDevices(prev => [newDev, ...prev]);
      selectDevice(newId, trimmed);
      setShowRegisterForm(false);
      setRegisterName('');
      showToast('이 기기가 등록되었습니다', 'success');
    } catch (e) {
      showToast('등록 실패: ' + String(e), 'error');
    } finally {
      setRegistering(false);
    }
  }

  useEffect(() => { if (pwOk) loadDevices(); }, [pwOk, creds?.url]);

  // Auto-open settings when no Supabase credentials (fresh/incognito browser)
  useEffect(() => {
    if (pwOk && !creds) setOpenSettings(true);
  }, [pwOk]);

  function selectDevice(id: string, name?: string) {
    setSelectedDeviceId(id);
    localStorage.setItem(SELECTED_DEVICE_KEY, id);
    try {
      const existing = JSON.parse(localStorage.getItem(PORTAL_WEB_KEY) ?? '{}');
      existing.deviceId = id;
      if (name) existing.deviceName = name;
      localStorage.setItem(PORTAL_WEB_KEY, JSON.stringify(existing));
    } catch {}
    setShowDevicePicker(false);
  }

  async function openPortsHistory() {
    if (!creds || !selectedDeviceId) {
      showToast('기기를 먼저 선택하세요', 'error');
      return;
    }
    setShowPortsHistory(true);
    setPortsHistoryLoading(true);
    try {
      const sb = createClient(creds.url, creds.key);
      const list = await fetchPushHistory(sb, 'ports', selectedDeviceId);
      setPortsHistoryList(list);
    } catch (e) {
      showToast('히스토리 로드 실패: ' + String(e), 'error');
    } finally {
      setPortsHistoryLoading(false);
    }
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
        onClick={() => { setShowDevicePicker(s => !s); setShowRegisterForm(false); }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-300 border border-zinc-700/50 rounded-lg transition-all max-w-[180px]"
      >
        <Server className="w-3 h-3 shrink-0 text-zinc-500" />
        <span className="truncate text-zinc-500 shrink-0 hidden sm:inline">보기:</span>
        <span className="truncate">{selectedDevice?.name ?? '기기 선택'}</span>
        <ChevronDown className="w-3 h-3 shrink-0 text-zinc-600" />
      </button>
      {showDevicePicker && (
        <div className="absolute top-full mt-1 left-0 z-50 w-60 max-w-[calc(100vw-32px)] bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl">
          <div className="px-3 py-2 text-[10px] text-zinc-500 border-b border-zinc-800 flex items-center justify-between">
            <span>어떤 기기를 볼까요?</span>
            <div className="flex items-center gap-2">
              <button onClick={() => { setShowDevicePicker(false); setShowDeviceManager(true); }}
                className="text-zinc-600 hover:text-zinc-300 text-[10px] transition-colors">기기 관리</button>
              <button onClick={loadDevices} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {devices.length === 0 ? (
              <div className="px-3 py-3 text-xs text-zinc-500">기기가 없습니다.<br />앱에서 Push하면 등록됩니다.</div>
            ) : devices.map(d => (
              <button key={d.id} onClick={() => selectDevice(d.id, d.name ?? undefined)}
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
          {/* Register this device */}
          {showRegisterForm ? (
            <div className="px-3 py-2.5 border-t border-zinc-800 space-y-2">
              <p className="text-[10px] text-zinc-500">이 브라우저를 새 단말로 등록</p>
              <input
                className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
                placeholder="기기 이름 (예: 내 아이폰)"
                value={registerName}
                onChange={e => setRegisterName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && registerThisDevice()}
                autoFocus
              />
              <div className="flex gap-1.5">
                <button onClick={() => setShowRegisterForm(false)}
                  className="flex-1 py-1 text-[10px] text-zinc-500 border border-zinc-700 rounded hover:bg-zinc-800 transition-colors">취소</button>
                <button onClick={registerThisDevice} disabled={registering || !registerName.trim()}
                  className="flex-1 py-1 text-[10px] bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors">
                  {registering ? '등록 중…' : '등록'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowRegisterForm(true)}
              className="w-full text-left px-3 py-2 text-[11px] text-blue-400 hover:bg-zinc-800 border-t border-zinc-800 transition-colors">
              + 이 기기를 새 단말로 등록
            </button>
          )}
        </div>
      )}
    </div>
  );

  const btnCls = 'flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200 rounded-lg border border-zinc-700/50 transition-all';

  const webThemeVars = {
    '--pm-bg': '#18181b',
    '--pm-bg-input': '#111113',
    '--pm-bg-hover': '#27272a',
    '--pm-border': 'rgba(255,255,255,0.07)',
    '--pm-border-hover': 'rgba(255,255,255,0.11)',
    '--pm-border-mid': 'rgba(255,255,255,0.09)',
    '--pm-border-faint': 'rgba(255,255,255,0.05)',
    '--pm-border-strong': 'rgba(255,255,255,0.20)',
    '--pm-text': '#f4f4f5',
    '--pm-text-muted': '#a1a1aa',
    '--pm-text-faint': '#71717a',
  } as React.CSSProperties;

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white flex flex-col" style={webThemeVars} onClick={() => showDevicePicker && setShowDevicePicker(false)}>
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-[#0a0a0b]/95 backdrop-blur border-b border-zinc-800/60 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-shrink">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <BookMarked className="w-4 h-4 text-blue-400" />
              </div>
              <span className="font-semibold text-white text-sm hidden sm:inline">북마크</span>
            </div>
            {/* Tabs — compact mode only */}
            {!isFullLayout && (
              <div className="flex items-center gap-1">
                {(['bookmarks', 'ports'] as Tab[]).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all whitespace-nowrap ${
                      activeTab === tab
                        ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                        : 'bg-zinc-800/40 border-zinc-700/40 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/40'
                    }`}>
                    {tab === 'bookmarks' ? <BookMarked className="w-3 h-3" /> : <Server className="w-3 h-3" />}
                    {tab === 'bookmarks' ? '북마크' : '프로젝트·폴더'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Device picker — compact header, desktop only */}
            {!isFullLayout && <div className="hidden sm:block">{devicePickerEl}</div>}

            {/* Bookmark actions — desktop: inline buttons / mobile: ... dropdown */}
            {(activeTab === 'bookmarks' || isFullLayout) && <>
              {/* Desktop buttons */}
              <div className="hidden sm:flex items-center gap-1.5">
                <button onClick={() => actionsRef.current?.push()} className={btnCls} title="Push">
                  <CloudUpload className="w-3.5 h-3.5" /><span className="hidden sm:inline">Push</span>
                </button>
                <button onClick={() => actionsRef.current?.pull()} className={btnCls} title="Pull">
                  <CloudDownload className="w-3.5 h-3.5" /><span className="hidden sm:inline">Pull</span>
                </button>
                <button onClick={() => actionsRef.current?.history()} className={btnCls} title="히스토리">
                  <Clock className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* Mobile more menu */}
              <div className="relative sm:hidden">
                <button onClick={() => setShowMoreMenu(s => !s)} className={btnCls} title="더보기">
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
                {showMoreMenu && (
                  <div className="absolute top-full right-0 mt-1 z-50 w-32 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl py-1"
                    onClick={() => setShowMoreMenu(false)}>
                    <button onClick={() => actionsRef.current?.push()} className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center gap-2">
                      <CloudUpload className="w-3.5 h-3.5" />Push
                    </button>
                    <button onClick={() => actionsRef.current?.pull()} className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center gap-2">
                      <CloudDownload className="w-3.5 h-3.5" />Pull
                    </button>
                    <button onClick={() => actionsRef.current?.history()} className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5" />히스토리
                    </button>
                    {creds && (
                      <button onClick={handleCopySetup} className="w-full text-left px-3 py-2 text-xs text-blue-300 hover:bg-zinc-800 flex items-center gap-2 border-t border-zinc-800">
                        <Link2 className="w-3.5 h-3.5" />새 기기 연결
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>}

            {/* Project history button — ports tab only */}
            {activeTab === 'ports' && (
              <button onClick={openPortsHistory} className={btnCls} title="Push 히스토리">
                <Clock className="w-3.5 h-3.5" /><span className="hidden sm:inline">히스토리</span>
              </button>
            )}

            {/* Layout toggle — hidden on mobile */}
            <button onClick={cycleViewMode} className={`${btnCls} hidden sm:flex`} title={`레이아웃: ${viewMode}`}>
              {viewModeIcon}
            </button>
            {creds && (
              <button
                onClick={handleCopySetup}
                className={btnCls}
                title="새 기기 연결 — 이 기기의 Supabase 설정을 클립보드에 복사 (새 기기의 로컬 앱에서 붙여넣기)"
              >
                <Link2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">새 기기</span>
              </button>
            )}
            <button onClick={() => setOpenSettings(true)} className={btnCls}>
              <Settings className="w-3.5 h-3.5" /><span className="hidden sm:inline">설정</span>
            </button>
          </div>
        </div>
        {/* Mobile device picker row */}
        {!isFullLayout && (
          <div className="sm:hidden pt-2 flex items-center">
            {devicePickerEl}
          </div>
        )}
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
                    ['ports', '프로젝트·폴더', <Server className="w-3.5 h-3.5" />],
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
                  <PortsView deviceId={selectedDeviceId} creds={creds} showToast={showToast} onSwitchDevice={() => setShowDevicePicker(true)} />
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
                <PortsView deviceId={selectedDeviceId} creds={creds} showToast={showToast} onSwitchDevice={() => setShowDevicePicker(true)} />
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

      {showPortsHistory && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowPortsHistory(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-semibold text-white">프로젝트 Push 히스토리</span>
              </div>
              <button onClick={() => setShowPortsHistory(false)}
                className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              {portsHistoryLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-5 h-5 text-zinc-500 animate-spin" />
                </div>
              ) : portsHistoryList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                  <Clock className="w-8 h-8 text-zinc-700" />
                  <p className="text-sm text-zinc-500">히스토리가 없습니다</p>
                  <p className="text-xs text-zinc-600">로컬 앱에서 Push하면 기록이 저장됩니다</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {portsHistoryList.map((snap, i) => (
                    <div key={snap.id} className={`px-3 py-2.5 rounded-xl border ${
                      i === 0 ? 'border-blue-500/30 bg-blue-500/5' : 'border-zinc-800/60 bg-zinc-900/60'
                    }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-medium text-zinc-200">
                            {new Date(snap.created_at).toLocaleString('ko-KR', {
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                            })}
                            {i === 0 && <span className="ml-2 text-[10px] text-blue-400 font-normal">최신</span>}
                          </p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">
                            {snap.device_name ?? snap.device_id?.slice(0, 8) ?? '기기 미상'}
                          </p>
                        </div>
                        <span className="text-[10px] text-zinc-600 bg-zinc-800 px-2 py-1 rounded-md shrink-0">
                          {snap.row_count}개
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showDeviceManager && creds && (
        <DeviceManagerModal
          devices={devices}
          creds={creds}
          onClose={() => setShowDeviceManager(false)}
          onUpdate={setDevices}
        />
      )}
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App /></React.StrictMode>);
