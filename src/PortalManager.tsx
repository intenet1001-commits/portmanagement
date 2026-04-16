import React, { useState, useEffect, useCallback } from 'react';
import {
  Globe, Folder, Plus, Trash2, Pencil, X, Check, Search,
  ExternalLink, FolderOpen, Star, Download, Upload,
  Cloud, CloudOff, CloudUpload, CloudDownload, Settings, Settings2, RefreshCw, Link2, Pin,
  BookMarked, ChevronDown, Database
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { createClient } from '@supabase/supabase-js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PortalItem {
  id: string;
  name: string;
  type: 'web' | 'folder';
  url?: string;
  path?: string;
  category: string;
  description?: string;
  pinned: boolean;
  visitCount: number;
  lastVisited?: string;
  createdAt: string;
}

export interface PortalCategory {
  id: string;
  name: string;
  color: ColorKey;
  order: number;
}

export interface PortalData {
  items: PortalItem[];
  categories: PortalCategory[];
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  deviceId?: string;
  deviceName?: string;
  viewingDeviceId?: string; // if set, Pull shows this device's data
  lastSynced?: string;
}

type ColorKey = 'blue' | 'green' | 'purple' | 'amber' | 'rose' | 'cyan' | 'orange' | 'teal' | 'indigo' | 'pink';

// ─── Color System ─────────────────────────────────────────────────────────────

const COLORS: Record<ColorKey, { bg: string; text: string; border: string; dot: string; activeBg: string }> = {
  blue:   { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/30',   dot: 'bg-blue-500',   activeBg: 'bg-blue-500/20' },
  green:  { bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-500/30',  dot: 'bg-green-500',  activeBg: 'bg-green-500/20' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30', dot: 'bg-purple-500', activeBg: 'bg-purple-500/20' },
  amber:  { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/30',  dot: 'bg-amber-500',  activeBg: 'bg-amber-500/20' },
  rose:   { bg: 'bg-rose-500/10',   text: 'text-rose-400',   border: 'border-rose-500/30',   dot: 'bg-rose-500',   activeBg: 'bg-rose-500/20' },
  cyan:   { bg: 'bg-cyan-500/10',   text: 'text-cyan-400',   border: 'border-cyan-500/30',   dot: 'bg-cyan-500',   activeBg: 'bg-cyan-500/20' },
  orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', dot: 'bg-orange-500', activeBg: 'bg-orange-500/20' },
  teal:   { bg: 'bg-teal-500/10',   text: 'text-teal-400',   border: 'border-teal-500/30',   dot: 'bg-teal-500',   activeBg: 'bg-teal-500/20' },
  indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/30', dot: 'bg-indigo-500', activeBg: 'bg-indigo-500/20' },
  pink:   { bg: 'bg-pink-500/10',   text: 'text-pink-400',   border: 'border-pink-500/30',   dot: 'bg-pink-500',   activeBg: 'bg-pink-500/20' },
};

const COLOR_OPTIONS: ColorKey[] = ['blue', 'green', 'purple', 'amber', 'rose', 'cyan', 'orange', 'teal', 'indigo', 'pink'];

const DEFAULT_CATEGORIES: PortalCategory[] = [
  { id: 'cat-ai',    name: 'AI 도구',   color: 'purple', order: 0 },
  { id: 'cat-dev',   name: '개발',      color: 'blue',   order: 1 },
  { id: 'cat-work',  name: '업무',      color: 'green',  order: 2 },
  { id: 'cat-folder',name: '폴더',      color: 'amber',  order: 3 },
  { id: 'cat-misc',  name: '기타',      color: 'teal',   order: 4 },
];

// ─── Tauri detection ──────────────────────────────────────────────────────────

const isTauri = () => typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

// ─── Portal API ───────────────────────────────────────────────────────────────

const PortalAPI = {
  async load(): Promise<PortalData> {
    try {
      if (isTauri()) {
        const val = await invoke<PortalData>('load_portal');
        return val ?? { items: [], categories: DEFAULT_CATEGORIES };
      }
      const res = await fetch('/api/portal');
      if (!res.ok) return { items: [], categories: DEFAULT_CATEGORIES };
      const data: PortalData = await res.json();
      // Mirror credentials to localStorage for offline fallback
      if (data.supabaseUrl || data.supabaseAnonKey) {
        localStorage.setItem('portalCreds', JSON.stringify({
          supabaseUrl: data.supabaseUrl,
          supabaseAnonKey: data.supabaseAnonKey,
          deviceId: data.deviceId,
        }));
      }
      return data;
    } catch {
      // api-server is down — try to restore credentials from localStorage
      const cached = localStorage.getItem('portalCreds');
      if (cached) {
        try {
          const { supabaseUrl, supabaseAnonKey, deviceId } = JSON.parse(cached);
          return { items: [], categories: DEFAULT_CATEGORIES, supabaseUrl, supabaseAnonKey, deviceId };
        } catch {
          // ignore malformed cache
        }
      }
      return { items: [], categories: DEFAULT_CATEGORIES };
    }
  },

  async save(data: PortalData): Promise<void> {
    if (isTauri()) {
      await invoke('save_portal', { data });
      return;
    }
    await fetch('/api/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    // Keep localStorage in sync so credentials survive api-server restarts
    if (data.supabaseUrl || data.supabaseAnonKey) {
      localStorage.setItem('portalCreds', JSON.stringify({
        supabaseUrl: data.supabaseUrl,
        supabaseAnonKey: data.supabaseAnonKey,
        deviceId: data.deviceId,
      }));
    }
  },

  async openUrl(url: string): Promise<void> {
    if (isTauri()) {
      await invoke('open_in_chrome', { url });
    } else {
      window.open(url, '_blank', 'noopener');
    }
  },

  async openFolder(path: string): Promise<void> {
    if (isTauri()) {
      await invoke('open_folder', { folderPath: path });
    } else {
      const res = await fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: path }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || '폴더 열기 실패');
      }
    }
  },

  async pickFolder(): Promise<string | null> {
    if (isTauri()) {
      const selected = await openDialog({ directory: true, multiple: false });
      return typeof selected === 'string' ? selected : null;
    }
    return null;
  },
};

// ─── Device ID ───────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem('portal-device-id');
  if (!id || !UUID_RE.test(id)) {
    // Regenerate if missing or legacy non-UUID format (e.g. "device-177415644...")
    id = crypto.randomUUID();
    localStorage.setItem('portal-device-id', id);
  }
  return id;
}

// ─── Form default state ───────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', type: 'web' as 'web' | 'folder', url: '', path: '', category: '', description: '', pinned: false };

// ─── Component ────────────────────────────────────────────────────────────────

export interface PortalActions {
  push: () => void;
  pull: () => void;
  exportData: () => void;
  importData: () => void;
  openSettings: () => void;
}

interface Props {
  showToast: (msg: string, type: 'success' | 'error') => void;
  openSettings?: boolean; // when true, open settings modal immediately
  onSettingsClosed?: () => void;
  actionsRef?: React.MutableRefObject<PortalActions | null>;
  isVisible?: boolean; // false → hide portal UI but keep modals alive
}

const AI_TABLE_PROMPT = `포트 관리 프로그램(portmanagement)의 Supabase 테이블을 설정해줘.
Supabase MCP를 사용해서 아래 4개 테이블을 생성하고 RLS를 비활성화해줘.

-- ※ 멀티 단말 지원: device_id로 단말 구분, '__shared__' sentinel로 공유 데이터 표시

-- 1. 포트/프로젝트 테이블 (단말별)
create table if not exists ports (
  id text primary key,
  device_id text,
  device_name text,
  name text not null,
  port integer,
  command_path text,
  terminal_command text,
  folder_path text,
  deploy_url text,
  github_url text,
  category text,
  description text,
  ai_name text
);
create index if not exists idx_ports_device_id on ports(device_id);

-- 기존 테이블 업그레이드 (이미 있는 경우)
alter table ports add column if not exists device_id text;
alter table ports add column if not exists device_name text;
alter table ports add column if not exists terminal_command text;
alter table ports add column if not exists category text;
alter table ports add column if not exists description text;
alter table ports add column if not exists ai_name text;

-- 2. 작업폴더 루트 테이블 (단말별)
create table if not exists workspace_roots (
  id text primary key,
  device_id text not null,
  name text not null,
  path text not null
);

-- 3. 포털 아이템 테이블 (folder 타입=단말별 / 나머지=공유)
create table if not exists portal_items (
  id text primary key,
  device_id text not null,
  name text not null,
  type text not null,
  url text,
  path text,
  category text not null,
  description text,
  pinned boolean default false,
  visit_count integer default 0,
  last_visited text,
  created_at text not null
);
create index if not exists idx_portal_items_device_id on portal_items(device_id);

-- 4. 포털 카테고리 테이블 (공유, device_id='__shared__')
create table if not exists portal_categories (
  id text primary key,
  device_id text not null,
  name text not null,
  color text not null,
  "order" integer default 0
);

-- RLS 비활성화 (anon key 직접 읽기/쓰기 허용)
alter table ports disable row level security;
alter table workspace_roots disable row level security;
alter table portal_items disable row level security;
alter table portal_categories disable row level security;`;

interface AdvancedSettingsProps {
  deviceId?: string;
  deviceName?: string;
  viewingDeviceId: string;
  knownDevices: {device_id: string; device_name?: string}[];
  isFetchingDevices: boolean;
  onFetchDevices: () => void;
  onSelectDevice: (id: string) => void;
  onResetDevice: () => void;
  onCopyDeviceId: () => void;
}

function AdvancedSettings({ deviceId, deviceName, viewingDeviceId, knownDevices, isFetchingDevices, onFetchDevices, onSelectDevice, onResetDevice, onCopyDeviceId }: AdvancedSettingsProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-zinc-900/60 border border-zinc-700/50 rounded-lg text-xs text-zinc-400 hover:border-zinc-600 transition-all"
      >
        <span className="flex items-center gap-1.5">
          <Settings2 className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-zinc-400">고급 설정</span>
          {viewingDeviceId && viewingDeviceId !== deviceId && (
            <span className="text-amber-400 text-[10px]">• 다른 기기 보는 중</span>
          )}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 bg-zinc-900/40 border border-zinc-700/40 rounded-lg p-3 space-y-3">
          {/* Device ID */}
          <div>
            <label className="block text-[10px] text-zinc-500 mb-1">Device ID</label>
            <div className="flex items-center gap-1.5">
              <input readOnly value={deviceId ? `${deviceId.slice(0, 16)}…` : '—'}
                className="flex-1 px-2.5 py-1.5 text-xs bg-black/30 border border-zinc-700 text-zinc-500 rounded-lg cursor-default" />
              <button onClick={onCopyDeviceId}
                className="px-2.5 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 rounded-lg transition-all">복사</button>
            </div>
          </div>
          {/* Device switch */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] text-zinc-500">다른 기기 데이터 보기</label>
              <button onClick={onFetchDevices} disabled={isFetchingDevices}
                className="px-2 py-0.5 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 rounded transition-all disabled:opacity-50">
                {isFetchingDevices ? '조회 중…' : '단말 조회'}
              </button>
            </div>
            {(knownDevices.length > 0 || deviceId) ? (
              <>
                <select
                  value={viewingDeviceId || deviceId || ''}
                  onChange={e => onSelectDevice(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-black/30 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                >
                  {/* Always show current device first */}
                  {deviceId && !knownDevices.find(d => d.device_id === deviceId) && (
                    <option value={deviceId}>
                      {deviceName || deviceId.slice(0, 10) + '…'} (이 기기)
                    </option>
                  )}
                  {knownDevices.map(d => {
                    const isOwn = d.device_id === deviceId;
                    const label = isOwn
                      ? (deviceName || d.device_name || d.device_id.slice(0, 10) + '…')
                      : (d.device_name || d.device_id.slice(0, 10) + '…');
                    return (
                      <option key={d.device_id} value={d.device_id}>
                        {label}{isOwn ? ' (이 기기)' : ''}
                      </option>
                    );
                  })}
                </select>
                {viewingDeviceId && viewingDeviceId !== deviceId && (
                  <div className="mt-1.5 flex items-center justify-between">
                    <p className="text-[10px] text-amber-400">⚠ Pull 시 선택한 기기 데이터 적용됨</p>
                    <button onClick={onResetDevice} className="text-[10px] text-zinc-500 hover:text-zinc-300 underline">내 기기로 복귀</button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-[10px] text-zinc-600 italic">단말 조회 버튼으로 다른 기기 목록을 불러오세요</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SetupGuide() {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [copied, setCopied] = React.useState(false);

  const CLI_FIRST_SETUP = `# 최초 세팅 (Supabase CLI + MCP 방식)

## 1. Supabase 프로젝트 생성
supabase.com → New project → 이름: portmanagement, Region: Seoul

## 2. Supabase CLI 설치
brew install supabase/tap/supabase

## 3. CLI 로그인 + 프로젝트 연결
supabase login
# 브라우저에서 인증 후 돌아오기

## 4. 프로젝트 Reference ID 확인
# Supabase 대시보드 → Settings → General → Reference ID 복사

## 5. Project URL + Anon Key 확인
# Settings → API → Project URL + anon/public key 복사
# 이 설정 화면의 "Project URL" + "Anon Key" 칸에 입력

## 6. Claude Code에서 테이블 생성 (Supabase MCP 사용)
# 아래 AI 프롬프트 복사 → Claude Code에 붙여넣기
`;

  const CLI_ADDITIONAL_DEVICE = `# 추가 단말 세팅 (기존 Supabase 프로젝트 공유)

## 전제조건
- 기존 맥/PC에서 이미 테이블 생성 완료
- 동일한 Supabase 프로젝트 URL + Anon Key 보유

## 1. git pull
git clone https://github.com/[repo]/portmanagement.git
# 또는 git pull (이미 clone된 경우)

## 2. 의존성 설치
bun install

## 3. 서버 실행
bun run start

## 4. 이 설정 화면에서
- 이 기기 이름 입력 (예: 회사맥북, WindowsPC)
- Project URL + Anon Key 입력 (기존 맥과 동일한 값)
- "저장 후 동기화" 클릭

## 5. 데이터 Pull
- 설정 저장 후 포털 탭 → Pull 버튼
- 프로젝트 관리 탭 → Pull 버튼
`;

  const steps = [
    {
      title: '🆕 최초 세팅',
      content: (
        <div className="space-y-2">
          <p className="text-zinc-300 text-[11px]">Supabase CLI + MCP 방식으로 처음 설정하는 경우</p>
          <pre className="bg-black/40 rounded p-2 text-zinc-400 whitespace-pre-wrap text-[10px] max-h-52 overflow-y-auto leading-relaxed">{CLI_FIRST_SETUP}</pre>
          <button
            onClick={() => { navigator.clipboard.writeText(CLI_FIRST_SETUP); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="w-full py-1 rounded-lg border text-[10px] font-medium transition-all flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border-zinc-600"
          >
            <Database className="w-3 h-3" />
            가이드 복사
          </button>
        </div>
      ),
    },
    {
      title: '💻 추가 단말 세팅',
      content: (
        <div className="space-y-2">
          <p className="text-zinc-300 text-[11px]">기존 Supabase 프로젝트에 새 맥/PC를 추가하는 경우</p>
          <pre className="bg-black/40 rounded p-2 text-zinc-400 whitespace-pre-wrap text-[10px] max-h-52 overflow-y-auto leading-relaxed">{CLI_ADDITIONAL_DEVICE}</pre>
          <button
            onClick={() => { navigator.clipboard.writeText(CLI_ADDITIONAL_DEVICE); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="w-full py-1 rounded-lg border text-[10px] font-medium transition-all flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border-zinc-600"
          >
            <Database className="w-3 h-3" />
            가이드 복사
          </button>
        </div>
      ),
    },
    {
      title: '🤖 AI 테이블 생성',
      content: (
        <div className="space-y-2">
          <p className="text-zinc-300 text-[11px]">Claude Code + Supabase MCP로 테이블 자동 생성</p>
          <ol className="list-decimal list-inside space-y-1 text-zinc-400 text-[10px]">
            <li>Claude Code 터미널 열기</li>
            <li>Supabase MCP 연결 확인 (<code className="text-zinc-300 bg-black/30 px-0.5 rounded">/mcp-setup</code>)</li>
            <li>아래 프롬프트 복사 → Claude Code에 붙여넣기</li>
            <li>AI가 4개 테이블 + RLS 비활성화 자동 처리</li>
          </ol>
          <pre className="bg-black/40 rounded p-2 text-zinc-500 whitespace-pre-wrap text-[10px] max-h-36 overflow-y-auto">{AI_TABLE_PROMPT}</pre>
          <button
            onClick={() => { navigator.clipboard.writeText(AI_TABLE_PROMPT).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
            className={`w-full py-1.5 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
              copied ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-600'
            }`}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Database className="w-3.5 h-3.5" />}
            {copied ? '복사됨!' : 'AI 프롬프트 복사'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-zinc-900/60 border border-zinc-700/50 rounded-lg text-xs text-zinc-400 hover:border-zinc-600 transition-all"
      >
        <span className="flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-medium text-zinc-300">초기 설정 가이드</span>
          <span className="text-zinc-600">— 처음 사용 시</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 bg-zinc-900/40 border border-zinc-700/40 rounded-lg overflow-hidden">
          {/* Step tabs */}
          <div className="flex border-b border-zinc-700/40 overflow-x-auto">
            {steps.map((s, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`flex-shrink-0 px-3 py-2 text-[10px] font-medium transition-all border-b-2 ${
                  step === i
                    ? 'border-indigo-500 text-indigo-300 bg-indigo-500/5'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {s.title}
              </button>
            ))}
          </div>
          {/* Step content */}
          <div className="p-3 text-xs">
            {steps[step].content}
            <div className="flex gap-2 mt-3">
              {step > 0 && (
                <button onClick={() => setStep(s => s - 1)} className="flex-1 py-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded border border-zinc-700 transition-all">← 이전</button>
              )}
              {step < steps.length - 1 && (
                <button onClick={() => setStep(s => s + 1)} className="flex-1 py-1 text-[10px] bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30 transition-all">다음 →</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PortalManager({ showToast, openSettings, onSettingsClosed, actionsRef, isVisible = true }: Props) {
  const [data, setData] = useState<PortalData>({ items: [], categories: DEFAULT_CATEGORIES });
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncOk, setSyncOk] = useState<boolean | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Modals
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<PortalItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const [showCatModal, setShowCatModal] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', color: 'blue' as ColorKey });

  const [showSettings, setShowSettings] = useState(false);
  const [sbUrl, setSbUrl] = useState('');
  const [sbKey, setSbKey] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [viewingDeviceId, setViewingDeviceId] = useState('');
  const [knownDevices, setKnownDevices] = useState<{device_id: string; device_name?: string}[]>([]);
  const [isFetchingDevices, setIsFetchingDevices] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const loaded = await PortalAPI.load();
      if (!loaded.categories?.length) loaded.categories = DEFAULT_CATEGORIES;
      // Generate or migrate deviceId (legacy "device-..." format → proper UUID)
      let needsPersist = false;
      if (!loaded.deviceId || !UUID_RE.test(loaded.deviceId)) {
        loaded.deviceId = getOrCreateDeviceId();
        needsPersist = true;
      }
      setData(loaded);
      setSbUrl(loaded.supabaseUrl ?? '');
      setSbKey(loaded.supabaseAnonKey ?? '');
      setDeviceName(loaded.deviceName ?? '');
      setViewingDeviceId(loaded.viewingDeviceId ?? '');
      setIsLoading(false);
      // Persist migrated deviceId back to portal.json so it survives restarts
      if (needsPersist) {
        try { await PortalAPI.save(loaded); } catch { /* ignore */ }
      }
    })();
  }, []);

  // Open settings modal when parent triggers it
  useEffect(() => {
    if (openSettings) {
      setShowSettings(true);
    }
  }, [openSettings]);

  // Notify parent when settings modal closes
  useEffect(() => {
    if (!showSettings && onSettingsClosed) onSettingsClosed();
  }, [showSettings]);

  // Expose action functions to parent via ref
  useEffect(() => {
    if (actionsRef) {
      actionsRef.current = {
        push: syncSupabase,
        pull: pullFromSupabase,
        exportData,
        importData,
        openSettings: () => setShowSettings(true),
      };
    }
  });

  const persist = useCallback(async (next: PortalData) => {
    setData(next);
    try {
      await PortalAPI.save(next);
    } catch (e) {
      showToast('저장 실패: ' + e, 'error');
    }
  }, [showToast]);

  // ── Item CRUD ─────────────────────────────────────────────────────────────

  function openAddModal(defaultCat?: string) {
    setEditingItem(null);
    setForm({ ...EMPTY_FORM, category: defaultCat ?? data.categories[0]?.id ?? '' });
    setShowItemModal(true);
  }

  function openEditModal(item: PortalItem) {
    setEditingItem(item);
    setForm({ name: item.name, type: item.type, url: item.url ?? '', path: item.path ?? '', category: item.category, description: item.description ?? '', pinned: item.pinned });
    setShowItemModal(true);
  }

  async function saveItem() {
    if (!form.name.trim()) return;
    if (form.type === 'web' && !form.url.trim()) return;
    if (form.type === 'folder' && !form.path.trim()) return;
    if (form.type === 'folder' && !form.path.startsWith('/')) {
      showToast('절대 경로가 필요합니다 (예: /Users/gwanli/...)', 'error');
      return;
    }

    if (editingItem) {
      const next: PortalData = {
        ...data,
        items: data.items.map(i => i.id === editingItem.id
          ? { ...i, name: form.name, type: form.type, url: form.url || undefined, path: form.path || undefined, category: form.category, description: form.description || undefined, pinned: form.pinned }
          : i),
      };
      await persist(next);
      showToast('수정되었습니다', 'success');
    } else {
      const newItem: PortalItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: form.name,
        type: form.type,
        url: form.type === 'web' ? form.url : undefined,
        path: form.type === 'folder' ? form.path : undefined,
        category: form.category,
        description: form.description || undefined,
        pinned: form.pinned,
        visitCount: 0,
        createdAt: new Date().toISOString(),
      };
      await persist({ ...data, items: [...data.items, newItem] });
      showToast('추가되었습니다', 'success');
    }
    setShowItemModal(false);
  }

  async function deleteItem(id: string) {
    await persist({ ...data, items: data.items.filter(i => i.id !== id) });
    showToast('삭제되었습니다', 'success');
  }

  async function togglePin(id: string) {
    await persist({ ...data, items: data.items.map(i => i.id === id ? { ...i, pinned: !i.pinned } : i) });
  }

  async function openItem(item: PortalItem) {
    try {
      if (item.type === 'web' && item.url) {
        await PortalAPI.openUrl(item.url);
      } else if (item.type === 'folder' && item.path) {
        await PortalAPI.openFolder(item.path);
      }
      // increment visit count
      const next: PortalData = {
        ...data,
        items: data.items.map(i => i.id === item.id
          ? { ...i, visitCount: i.visitCount + 1, lastVisited: new Date().toISOString() }
          : i),
      };
      await persist(next);
    } catch (e) {
      showToast('열기 실패: ' + e, 'error');
    }
  }

  // ── Category CRUD ─────────────────────────────────────────────────────────

  async function addCategory() {
    if (!catForm.name.trim()) return;
    const newCat: PortalCategory = {
      id: `cat-${Date.now()}`,
      name: catForm.name,
      color: catForm.color,
      order: data.categories.length,
    };
    await persist({ ...data, categories: [...data.categories, newCat] });
    setCatForm({ name: '', color: 'blue' });
    setShowCatModal(false);
    showToast('카테고리 추가됨', 'success');
  }

  async function deleteCategory(id: string) {
    const next: PortalData = {
      ...data,
      categories: data.categories.filter(c => c.id !== id),
      items: data.items.filter(i => i.category !== id),
    };
    await persist(next);
    if (selectedCat === id) setSelectedCat('all');
    showToast('카테고리 삭제됨', 'success');
  }

  // ── Export / Import ───────────────────────────────────────────────────────

  async function exportData() {
    const json = JSON.stringify(data, null, 2);
    const defaultName = `portal-backup-${new Date().toISOString().slice(0, 10)}.json`;
    if (isTauri()) {
      try {
        const path = await saveDialog({ defaultPath: defaultName, filters: [{ name: 'JSON', extensions: ['json'] }] });
        if (!path) return;
        await writeTextFile(path, json);
        showToast('내보내기 완료', 'success');
      } catch (e) {
        showToast('내보내기 실패: ' + e, 'error');
      }
    } else {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultName;
      a.click();
      URL.revokeObjectURL(url);
      showToast('내보내기 완료', 'success');
    }
  }

  async function importData() {
    if (isTauri()) {
      try {
        const selected = await openDialog({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
        if (!selected || typeof selected !== 'string') return;
        const text = await readTextFile(selected);
        const imported = JSON.parse(text) as PortalData;
        if (!imported.items || !imported.categories) throw new Error('올바른 포맷이 아닙니다');
        await persist(imported);
        showToast('불러오기 완료', 'success');
      } catch (err) {
        showToast('파일 오류: ' + err, 'error');
      }
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const imported = JSON.parse(text) as PortalData;
          if (!imported.items || !imported.categories) throw new Error('올바른 포맷이 아닙니다');
          await persist(imported);
          showToast('불러오기 완료', 'success');
        } catch (err) {
          showToast('파일 오류: ' + err, 'error');
        }
      };
      input.click();
    }
  }

  // ── Supabase Sync ─────────────────────────────────────────────────────────

  async function syncSupabase() {
    if (!sbUrl || !sbKey) {
      showToast('Supabase URL과 키를 먼저 설정하세요', 'error');
      setShowSettings(true);
      return;
    }
    setIsSyncing(true);
    setSyncOk(null);
    try {
      const supabase = createClient(sbUrl, sbKey);
      const deviceId = data.deviceId ?? getOrCreateDeviceId();

      // Upsert items — folders are per-device, all others are shared
      const itemRows = data.items.map(item => ({
        id: item.id,
        device_id: item.type === 'folder' ? deviceId : '__shared__',
        name: item.name,
        type: item.type,
        url: item.url ?? null,
        path: item.path ?? null,
        category: item.category,
        description: item.description ?? null,
        pinned: item.pinned,
        visit_count: item.visitCount,
        last_visited: item.lastVisited ?? null,
        created_at: item.createdAt ?? null,
      }));

      // Upsert categories — always shared across devices
      const catRows = data.categories.map(cat => ({
        id: cat.id,
        device_id: '__shared__',
        name: cat.name,
        color: cat.color,
        "order": cat.order,
      }));

      const [itemsRes, catsRes] = await Promise.all([
        supabase.from('portal_items').upsert(itemRows, { onConflict: 'id' }),
        supabase.from('portal_categories').upsert(catRows, { onConflict: 'id' }),
      ]);

      if (itemsRes.error) throw new Error(itemsRes.error.message);
      if (catsRes.error) throw new Error(catsRes.error.message);

      const nextData: PortalData = { ...data, supabaseUrl: sbUrl, supabaseAnonKey: sbKey, deviceId, deviceName: deviceName || data.deviceName, lastSynced: new Date().toISOString() };
      await persist(nextData);
      setSyncOk(true);
      showToast(`Supabase 동기화 완료 (${data.items.length}개 항목)`, 'success');
    } catch (err) {
      setSyncOk(false);
      showToast('동기화 실패: ' + err, 'error');
    } finally {
      setIsSyncing(false);
    }
  }

  async function pullFromSupabase() {
    if (!sbUrl || !sbKey) {
      showToast('Supabase URL과 키를 먼저 설정하세요', 'error');
      setShowSettings(true);
      return;
    }
    setIsRestoring(true);
    try {
      const supabase = createClient(sbUrl, sbKey);
      const ownDeviceId = data.deviceId ?? getOrCreateDeviceId();
      const targetDeviceId = viewingDeviceId || ownDeviceId;
      const [itemsRes, catsRes] = await Promise.all([
        supabase.from('portal_items').select('*').or(`device_id.eq.${targetDeviceId},device_id.eq.__shared__`),
        supabase.from('portal_categories').select('*').eq('device_id', '__shared__'),
      ]);
      if (itemsRes.error) throw new Error(itemsRes.error.message);
      if (catsRes.error) throw new Error(catsRes.error.message);

      const items: PortalItem[] = (itemsRes.data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        url: row.url ?? undefined,
        path: row.path ?? undefined,
        category: row.category,
        description: row.description ?? undefined,
        pinned: row.pinned,
        visitCount: row.visit_count,
        lastVisited: row.last_visited ?? undefined,
        createdAt: row.created_at,
      }));

      const categories: PortalCategory[] = (catsRes.data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        color: row.color as ColorKey,
        order: row.order,
      }));

      if (items.length === 0 && categories.length === 0) {
        showToast('Supabase에 저장된 포털 데이터가 없습니다', 'error');
        return;
      }

      const nextData: PortalData = {
        ...data,
        items: items.length > 0 ? items : data.items,
        categories: categories.length > 0 ? categories : data.categories,
        lastSynced: new Date().toISOString(),
      };
      await persist(nextData);
      showToast(`Supabase에서 ${items.length}개 항목을 복원했습니다 ✓`, 'success');
    } catch (err) {
      showToast('복원 실패: ' + err, 'error');
    } finally {
      setIsRestoring(false);
    }
  }

  async function fetchKnownDevices() {
    if (!sbUrl || !sbKey) { showToast('Supabase URL과 Key를 먼저 입력 후 저장하세요', 'error'); return; }
    setIsFetchingDevices(true);
    try {
      const supabase = createClient(sbUrl, sbKey);
      const seen = new Set<string>();
      const devices: {device_id: string; device_name?: string}[] = [];

      // 1순위: ports 테이블 (device_name 포함 시도 → 없으면 device_id만)
      const { data: portsWithName, error: e1 } = await supabase
        .from('ports').select('device_id, device_name').not('device_id', 'is', null);
      if (!e1 && portsWithName) {
        for (const r of portsWithName) {
          if (r.device_id && r.device_id !== '__shared__' && !seen.has(r.device_id)) {
            seen.add(r.device_id);
            devices.push({ device_id: r.device_id, device_name: r.device_name ?? undefined });
          }
        }
      } else {
        // device_name 컬럼 없는 경우 fallback
        const { data: portsOnly } = await supabase
          .from('ports').select('device_id').not('device_id', 'is', null);
        for (const r of portsOnly ?? []) {
          if (r.device_id && r.device_id !== '__shared__' && !seen.has(r.device_id)) {
            seen.add(r.device_id);
            devices.push({ device_id: r.device_id });
          }
        }
      }

      // 2순위: portal_items folder 타입에서 추가 (ports에 없는 device_id 보충)
      const { data: folderRows } = await supabase
        .from('portal_items').select('device_id').eq('type', 'folder').not('device_id', 'is', null);
      for (const r of folderRows ?? []) {
        if (r.device_id && r.device_id !== '__shared__' && !seen.has(r.device_id)) {
          seen.add(r.device_id);
          devices.push({ device_id: r.device_id });
        }
      }

      setKnownDevices(devices);
      if (devices.length === 0) {
        showToast('단말 없음 — 이 기기에서 먼저 Push를 실행하세요', 'error');
      } else {
        showToast(`${devices.length}개 단말 발견`, 'success');
      }
    } catch (e: any) {
      showToast('단말 조회 오류: ' + e.message, 'error');
    } finally {
      setIsFetchingDevices(false);
    }
  }

  async function saveSettings() {
    const next: PortalData = { ...data, supabaseUrl: sbUrl, supabaseAnonKey: sbKey, deviceName: deviceName || undefined, viewingDeviceId: viewingDeviceId || undefined };
    await persist(next);
    setShowSettings(false);
    showToast('설정 저장됨', 'success');
  }

  // ── Filtered items ────────────────────────────────────────────────────────

  const filteredItems = data.items.filter(item => {
    const matchesCat = selectedCat === 'all' || item.category === selectedCat;
    const matchesSearch = !search || item.name.toLowerCase().includes(search.toLowerCase()) || item.description?.toLowerCase().includes(search.toLowerCase()) || item.url?.toLowerCase().includes(search.toLowerCase()) || item.path?.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const pinnedItems = filteredItems.filter(i => i.pinned);
  const unpinnedItems = filteredItems.filter(i => !i.pinned);

  const getCat = (id: string) => data.categories.find(c => c.id === id);
  const getColor = (colorKey: ColorKey) => COLORS[colorKey] ?? COLORS.blue;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-5 h-5 text-zinc-500 animate-spin" />
      </div>
    );
  }

  const portalUI = isVisible ? (
    <div className="flex gap-4 h-full">
      {/* ── Left Sidebar ────────────────────────────────────────────────────── */}
      <div className="w-48 flex-shrink-0">
        <div className="bg-[#18181b] rounded-xl border border-zinc-800 overflow-hidden">
          {/* All */}
          <button
            onClick={() => setSelectedCat('all')}
            className={`w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors ${selectedCat === 'all' ? 'bg-zinc-700/50 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'}`}
          >
            <div className="flex items-center gap-2">
              <BookMarked className="w-3.5 h-3.5" />
              <span>전체</span>
            </div>
            <span className="text-xs text-zinc-500">{data.items.length}</span>
          </button>

          <div className="border-t border-zinc-800/80">
            {data.categories.sort((a, b) => a.order - b.order).map(cat => {
              const c = getColor(cat.color);
              const count = data.items.filter(i => i.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCat(cat.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors group ${selectedCat === cat.id ? 'bg-zinc-700/50 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
                    <span className="truncate">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-zinc-600 group-hover:text-zinc-500">{count}</span>
                    <button
                      onClick={e => { e.stopPropagation(); deleteCategory(cat.id); }}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Add category */}
          <div className="border-t border-zinc-800/80">
            <button
              onClick={() => setShowCatModal(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>카테고리 추가</span>
            </button>
          </div>
        </div>

        {/* Sync status */}
        {data.lastSynced && (
          <p className="text-[10px] text-zinc-600 mt-2 px-1">
            동기화: {new Date(data.lastSynced).toLocaleDateString('ko-KR')}
          </p>
        )}
      </div>

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {/* Top bar */}
        <div className="bg-[#18181b] rounded-xl border border-zinc-800 p-3 mb-4 flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
          </div>
          {viewingDeviceId && viewingDeviceId !== data.deviceId && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg shrink-0">
              <span className="text-amber-400 text-[10px] font-medium whitespace-nowrap">
                📱 {knownDevices.find(d => d.device_id === viewingDeviceId)?.device_name ?? (viewingDeviceId === data.deviceId ? (data.deviceName ?? viewingDeviceId.slice(0, 6) + '…') : viewingDeviceId.slice(0, 6) + '…')}
              </span>
              <button
                onClick={() => { setViewingDeviceId(''); setData(d => ({ ...d, viewingDeviceId: undefined })); }}
                className="text-amber-500 hover:text-amber-300 text-xs leading-none"
                title="내 기기로 복귀"
              >✕</button>
            </div>
          )}
          <button
            onClick={() => openAddModal(selectedCat !== 'all' ? selectedCat : undefined)}
            className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-sm rounded-lg border border-blue-500/30 hover:border-blue-500/50 transition-all flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>추가</span>
          </button>
        </div>

        {/* Pinned section */}
        {pinnedItems.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2 px-0.5">
              <Star className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-medium text-zinc-400">고정됨</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {pinnedItems.map(item => (
                <ItemCard key={item.id} item={item} getCat={getCat} getColor={getColor} onOpen={openItem} onEdit={openEditModal} onDelete={deleteItem} onTogglePin={togglePin} />
              ))}
            </div>
          </div>
        )}

        {/* Items grouped by category or flat */}
        {selectedCat === 'all' && !search ? (
          // Grouped view
          data.categories.sort((a, b) => a.order - b.order).map(cat => {
            const catItems = data.items.filter(i => i.category === cat.id && !i.pinned);
            if (catItems.length === 0) return null;
            const c = getColor(cat.color);
            return (
              <div key={cat.id} className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                  <span className="text-xs font-semibold text-zinc-300">{cat.name}</span>
                  <span className="text-xs text-zinc-600">{catItems.length}</span>
                  <button
                    onClick={() => openAddModal(cat.id)}
                    className="ml-auto text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {catItems.map(item => (
                    <ItemCard key={item.id} item={item} getCat={getCat} getColor={getColor} onOpen={openItem} onEdit={openEditModal} onDelete={deleteItem} onTogglePin={togglePin} />
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          // Flat view (filtered)
          unpinnedItems.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {unpinnedItems.map(item => (
                <ItemCard key={item.id} item={item} getCat={getCat} getColor={getColor} onOpen={openItem} onEdit={openEditModal} onDelete={deleteItem} onTogglePin={togglePin} />
              ))}
            </div>
          ) : (
            filteredItems.length === 0 && (
              <div className="bg-[#18181b] rounded-xl border border-zinc-800 p-12 text-center">
                <BookMarked className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                <p className="text-sm text-zinc-400">
                  {search ? '검색 결과가 없습니다' : '항목이 없습니다'}
                </p>
                <button
                  onClick={() => openAddModal()}
                  className="mt-3 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-sm rounded-lg border border-blue-500/30 transition-all inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  첫 항목 추가
                </button>
              </div>
            )
          )
        )}
      </div>

      {/* ── Add/Edit Item Modal ───────────────────────────────────────────────── */}
      {showItemModal && (
        <Modal title={editingItem ? '항목 수정' : '항목 추가'} onClose={() => setShowItemModal(false)} onConfirm={saveItem} confirmLabel={editingItem ? '저장' : '추가'}>
          {/* Type toggle */}
          <div className="flex rounded-lg overflow-hidden border border-zinc-700 mb-3">
            {(['web', 'folder'] as const).map(t => (
              <button
                key={t}
                onClick={() => setForm(f => ({ ...f, type: t }))}
                className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${form.type === t ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'}`}
              >
                {t === 'web' ? <Globe className="w-3.5 h-3.5" /> : <Folder className="w-3.5 h-3.5" />}
                {t === 'web' ? '웹사이트' : '로컬 폴더'}
              </button>
            ))}
          </div>

          <label className="block text-xs text-zinc-400 mb-1">이름 *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full mb-3 px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
            placeholder="이름을 입력하세요"
            autoFocus
          />

          {form.type === 'web' ? (
            <>
              <label className="block text-xs text-zinc-400 mb-1">URL *</label>
              <input
                type="url"
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                className="w-full mb-3 px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                placeholder="https://..."
              />
            </>
          ) : (
            <>
              <label className="block text-xs text-zinc-400 mb-1">폴더 경로 *</label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={form.path}
                  onChange={e => setForm(f => ({ ...f, path: e.target.value }))}
                  className="flex-1 px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                  placeholder="/Users/..."
                />
                <button
                    onClick={async () => {
                      if (isTauri()) {
                        const picked = await PortalAPI.pickFolder();
                        if (picked) setForm(f => ({ ...f, path: picked, name: f.name || picked.split('/').pop() || '' }));
                      } else {
                        try {
                          const res = await fetch('/api/pick-folder');
                          if (res.ok) {
                            const { path } = await res.json();
                            if (path) setForm(f => ({ ...f, path, name: f.name || path.split('/').pop() || '' }));
                          }
                        } catch {}
                      }
                    }}
                    className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg border border-zinc-700 transition-all"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
              </div>
            </>
          )}

          <label className="block text-xs text-zinc-400 mb-1">카테고리</label>
          <select
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className="w-full mb-3 px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
          >
            {data.categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>

          <label className="block text-xs text-zinc-400 mb-1">설명 (선택)</label>
          <input
            type="text"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="w-full mb-3 px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
            placeholder="간단한 설명..."
          />

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={form.pinned} onChange={e => setForm(f => ({ ...f, pinned: e.target.checked }))} className="rounded" />
            <span className="text-sm text-zinc-300">고정 (즐겨찾기)</span>
          </label>
        </Modal>
      )}

      {/* ── Add Category Modal ───────────────────────────────────────────────── */}
      {showCatModal && (
        <Modal title="카테고리 추가" onClose={() => setShowCatModal(false)} onConfirm={addCategory} confirmLabel="추가">
          <label className="block text-xs text-zinc-400 mb-1">이름 *</label>
          <input
            type="text"
            value={catForm.name}
            onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
            className="w-full mb-4 px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
            placeholder="카테고리 이름"
            autoFocus
          />
          <label className="block text-xs text-zinc-400 mb-2">색상</label>
          <div className="flex flex-wrap gap-2">
            {COLOR_OPTIONS.map(c => (
              <button
                key={c}
                onClick={() => setCatForm(f => ({ ...f, color: c }))}
                className={`w-7 h-7 rounded-full ${COLORS[c].dot} transition-all ${catForm.color === c ? 'ring-2 ring-offset-2 ring-offset-[#18181b] ring-white scale-110' : 'opacity-60 hover:opacity-100'}`}
              />
            ))}
          </div>
        </Modal>
      )}

    </div>
  ) : null;

  return (
    <>
      {portalUI}

      {/* ── Settings Modal (탭 무관하게 항상 렌더) ────────────────────────── */}
      {showSettings && (
        <Modal title="설정" onClose={() => setShowSettings(false)} onConfirm={async () => { await saveSettings(); await syncSupabase(); }} confirmLabel="저장 후 동기화">

          {/* ── 1. 단말 이름 ─────────────────────────────────────────────────── */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-zinc-400">
                이 기기 이름{!deviceName && !data.deviceId && <span className="text-amber-400 font-medium ml-1">* 필수</span>}
              </label>
              {deviceName
                ? <span className="text-[10px] text-green-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />등록됨</span>
                : data.deviceId
                  ? <span className="text-[10px] text-amber-400">이름 미설정 — 입력 권장</span>
                  : null
              }
            </div>
            <input
              type="text"
              value={deviceName}
              onChange={e => setDeviceName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              placeholder="예: MyMacPro, 회사맥북, WindowsPC"
              autoFocus={!deviceName && !data.deviceId}
            />
            <p className="text-[10px] text-zinc-600 mt-1">Device ID: {data.deviceId ? data.deviceId.slice(0, 16) + '…' : '자동생성'}</p>
          </div>

          {/* ── 2. Supabase 연결 ─────────────────────────────────────────────── */}
          <div className="mb-4">
            <label className="block text-xs text-zinc-400 mb-1">Project URL</label>
            <input
              type="text"
              value={sbUrl}
              onChange={e => setSbUrl(e.target.value)}
              className="w-full mb-3 px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              placeholder="https://xxx.supabase.co"
            />
            <label className="block text-xs text-zinc-400 mb-1">Anon Key</label>
            <input
              type="password"
              value={sbKey}
              onChange={e => setSbKey(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              placeholder="eyJ..."
            />
          </div>

          {/* ── 고급 설정 (접이식) ───────────────────────────────────────────── */}
          <AdvancedSettings
            deviceId={data.deviceId}
            deviceName={deviceName}
            viewingDeviceId={viewingDeviceId}
            knownDevices={knownDevices}
            isFetchingDevices={isFetchingDevices}
            onFetchDevices={fetchKnownDevices}
            onSelectDevice={id => setViewingDeviceId(id === data.deviceId ? '' : id)}
            onResetDevice={() => setViewingDeviceId('')}
            onCopyDeviceId={() => { if (data.deviceId) { navigator.clipboard.writeText(data.deviceId); showToast('Device ID 복사됨', 'success'); } }}
          />
        </Modal>
      )}
    </>
  );
}

// ─── ItemCard ─────────────────────────────────────────────────────────────────

interface CardProps {
  item: PortalItem;
  getCat: (id: string) => PortalCategory | undefined;
  getColor: (k: ColorKey) => typeof COLORS[ColorKey];
  onOpen: (item: PortalItem) => void;
  onEdit: (item: PortalItem) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
}

function ItemCard({ item, getCat, getColor, onOpen, onEdit, onDelete, onTogglePin }: CardProps) {
  const cat = getCat(item.category);
  const c = cat ? getColor(cat.color) : COLORS.teal;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="bg-[#18181b] border border-zinc-800 rounded-xl p-3 flex flex-col gap-2 hover:border-zinc-600 transition-all duration-200 group relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header row */}
      <div className="flex items-start gap-2">
        <div className={`p-1.5 rounded-lg ${c.bg} ${c.border} border flex-shrink-0`}>
          {item.type === 'web'
            ? <Globe className={`w-3.5 h-3.5 ${c.text}`} />
            : <Folder className={`w-3.5 h-3.5 ${c.text}`} />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-200 truncate leading-tight">{item.name}</p>
          {item.description && (
            <p className="text-xs text-zinc-500 truncate mt-0.5">{item.description}</p>
          )}
        </div>
        {item.pinned && <Star className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />}
      </div>

      {/* URL/path preview */}
      <p className="text-[10px] text-zinc-600 truncate">
        {item.type === 'web' ? item.url : item.path}
      </p>

      {/* Actions */}
      <div className={`flex items-center gap-1 transition-opacity duration-150 ${hovered ? 'opacity-100' : 'opacity-0'}`}>
        <button
          onClick={() => onOpen(item)}
          className={`flex-1 py-1 text-xs font-medium rounded-lg border transition-all flex items-center justify-center gap-1 ${c.bg} ${c.text} ${c.border}`}
        >
          {item.type === 'web' ? <ExternalLink className="w-3 h-3" /> : <FolderOpen className="w-3 h-3" />}
          <span>{item.type === 'web' ? '열기' : '폴더'}</span>
        </button>
        <button
          onClick={() => onTogglePin(item.id)}
          className={`p-1 rounded-lg border transition-all ${item.pinned ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-zinc-800/60 border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}
          title={item.pinned ? '고정 해제' : '고정'}
        >
          <Pin className="w-3 h-3" />
        </button>
        <button
          onClick={() => onEdit(item)}
          className="p-1 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-500 hover:text-zinc-300 transition-all"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="p-1 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-500 hover:text-red-400 transition-all"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Visit count badge */}
      {item.visitCount > 0 && (
        <span className="absolute top-2 right-2 text-[9px] text-zinc-600">{item.visitCount}</span>
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ title, children, onClose, onConfirm, confirmLabel }: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#18181b] rounded-xl border border-zinc-700 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-500 hover:text-zinc-300">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        <div className="flex gap-2 px-5 pb-4">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 rounded-lg border border-zinc-700 transition-all">
            취소
          </button>
          <button onClick={onConfirm} className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-all">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
