import React, { useState, useEffect, useCallback } from 'react';
import {
  Globe, Folder, Plus, Trash2, Pencil, X, Check, Search,
  ExternalLink, FolderOpen, Star, Download, Upload,
  Cloud, CloudOff, CloudUpload, CloudDownload, Settings, Settings2, RefreshCw, Link2, Pin,
  BookMarked, ChevronDown, Database, Terminal, Clock, RotateCw
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { createClient } from '@supabase/supabase-js';
import { savePushSnapshot, fetchPushHistory, fetchSnapshotRows, type PushSnapshot } from './pushHistory';

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
const isDeployedWeb = () => typeof window !== 'undefined' && !isTauri() && !['localhost', '127.0.0.1'].includes(window.location.hostname);
const PORTAL_WEB_KEY = 'portalData_v1';

// ─── Portal API ───────────────────────────────────────────────────────────────

const PortalAPI = {
  async load(): Promise<PortalData> {
    // Deployed web (Vercel etc): localStorage is the only storage
    if (isDeployedWeb()) {
      try {
        const raw = localStorage.getItem(PORTAL_WEB_KEY);
        if (raw) {
          const d: PortalData = JSON.parse(raw);
          if (!d.items) d.items = [];
          if (!d.categories?.length) d.categories = DEFAULT_CATEGORIES;
          return d;
        }
      } catch { /* ignore */ }
      return { items: [], categories: DEFAULT_CATEGORIES };
    }
    try {
      if (isTauri()) {
        const val = await invoke<PortalData>('load_portal');
        return val ?? { items: [], categories: DEFAULT_CATEGORIES };
      }
      const res = await fetch('/api/portal');
      if (!res.ok) return { items: [], categories: DEFAULT_CATEGORIES };
      const data: PortalData = await res.json();
      // Mirror full data to localStorage for offline/Vercel fallback
      localStorage.setItem('portalData', JSON.stringify(data));
      if (data.supabaseUrl || data.supabaseAnonKey) {
        localStorage.setItem('portalCreds', JSON.stringify({
          supabaseUrl: data.supabaseUrl,
          supabaseAnonKey: data.supabaseAnonKey,
          deviceId: data.deviceId,
        }));
      }
      return data;
    } catch {
      // api-server is down (Vercel / offline) — restore from localStorage
      const full = localStorage.getItem('portalData');
      if (full) {
        try { return JSON.parse(full); } catch { /* fall through */ }
      }
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
    // Deployed web: persist to localStorage only
    if (isDeployedWeb()) {
      localStorage.setItem(PORTAL_WEB_KEY, JSON.stringify(data));
      return;
    }
    if (isTauri()) {
      await invoke('save_portal', { data });
      return;
    }
    // Always persist to localStorage (Vercel / offline support)
    localStorage.setItem('portalData', JSON.stringify(data));
    if (data.supabaseUrl || data.supabaseAnonKey) {
      localStorage.setItem('portalCreds', JSON.stringify({
        supabaseUrl: data.supabaseUrl,
        supabaseAnonKey: data.supabaseAnonKey,
        deviceId: data.deviceId,
      }));
    }
    try {
      await fetch('/api/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch {
      // api-server unavailable — data already saved to localStorage above
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
  history: () => void;
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
  onChangeDevice?: () => void;
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
  onChangeDeviceId: (id: string) => void;
}

function AdvancedSettings({ deviceId, deviceName, viewingDeviceId, knownDevices, isFetchingDevices, onFetchDevices, onSelectDevice, onResetDevice, onCopyDeviceId, onChangeDeviceId }: AdvancedSettingsProps) {
  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState(false);
  const [editIdVal, setEditIdVal] = React.useState('');
  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#221f1b]/60 border border-stone-700/50 rounded-lg text-xs text-zinc-400 hover:border-stone-700/60 transition-all"
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
        <div className="mt-2 bg-[#1c1916]/60 border border-stone-700/40 rounded-lg p-3 space-y-3">
          {/* Device ID */}
          <div>
            <label className="block text-[10px] text-zinc-500 mb-1">Device ID</label>
            {editingId ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={editIdVal}
                  onChange={e => setEditIdVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && editIdVal.trim()) { onChangeDeviceId(editIdVal.trim()); setEditingId(false); } if (e.key === 'Escape') setEditingId(false); }}
                  placeholder="UUID를 붙여넣으세요"
                  autoFocus
                  className="flex-1 px-2.5 py-1.5 text-xs bg-black/30 border border-blue-500/50 text-zinc-200 rounded-lg focus:outline-none" />
                <button onClick={() => { if (editIdVal.trim()) { onChangeDeviceId(editIdVal.trim()); setEditingId(false); } }}
                  className="px-2.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all">저장</button>
                <button onClick={() => setEditingId(false)}
                  className="px-2.5 py-1.5 text-xs bg-[#221f1b] text-zinc-400 border border-stone-700/50 rounded-lg transition-all">취소</button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <input readOnly value={deviceId ? `${deviceId.slice(0, 16)}…` : '—'}
                  className="flex-1 px-2.5 py-1.5 text-xs bg-black/30 border border-stone-700/50 text-zinc-500 rounded-lg cursor-default" />
                <button onClick={onCopyDeviceId}
                  className="px-2.5 py-1.5 text-xs bg-[#221f1b] hover:bg-[#2a2520] text-zinc-400 border border-stone-700/50 rounded-lg transition-all">복사</button>
                <button onClick={() => { setEditIdVal(deviceId ?? ''); setEditingId(true); }}
                  className="px-2.5 py-1.5 text-xs bg-[#221f1b] hover:bg-[#2a2520] text-zinc-400 border border-stone-700/50 rounded-lg transition-all">변경</button>
              </div>
            )}
          </div>
          {/* Device switch */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] text-zinc-500">다른 기기 데이터 보기</label>
              <button onClick={onFetchDevices} disabled={isFetchingDevices}
                className="px-2 py-0.5 text-[10px] bg-[#221f1b] hover:bg-[#2a2520] text-zinc-400 border border-stone-700/50 rounded transition-all disabled:opacity-50">
                {isFetchingDevices ? '조회 중…' : '단말 조회'}
              </button>
            </div>
            {(knownDevices.length > 0 || deviceId) ? (
              <>
                <select
                  value={viewingDeviceId || deviceId || ''}
                  onChange={e => onSelectDevice(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-black/30 border border-stone-700/50 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                >
                  {/* Always show current device first */}
                  {deviceId && !knownDevices.find(d => d.device_id === deviceId) && (
                    <option value={deviceId}>
                      {deviceName || deviceId.slice(0, 10) + '…'} (이 기기)
                    </option>
                  )}
                  {knownDevices.map(d => {
                    const isOwn = d.device_id === deviceId;
                    const name = isOwn
                      ? (deviceName || d.device_name)
                      : d.device_name;
                    const label = name || `기기 ${d.device_id.slice(0, 8)}…`;
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
                    <button onClick={onResetDevice} className="text-[10px] text-zinc-500 hover:text-[#ede7dd]/90 underline">내 기기로 복귀</button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-[10px] text-[#6b6459] italic">단말 조회 버튼으로 다른 기기 목록을 불러오세요</p>
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
  const [loginLoading, setLoginLoading] = React.useState(false);

  const handleSupabaseLogin = async () => {
    setLoginLoading(true);
    try {
      await fetch('/api/supabase-login', { method: 'POST' });
    } catch {}
    setTimeout(() => setLoginLoading(false), 2000);
  };

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

  const VERCEL_GUIDE = `# 포털 북마크 — Vercel 배포 가이드

## 전제조건
- Supabase 프로젝트 생성 완료 (이 앱에서 이미 사용 중인 것)
- GitHub 계정 (포크 또는 본인 레포)
- Node.js 설치됨

## 1. Vercel 회원가입
https://vercel.com → GitHub 계정으로 가입 (권장)

## 2. Vercel CLI 설치
npm install -g vercel
# 또는
bun install -g vercel

## 3. Vercel 로그인
vercel login
# 브라우저에서 인증 후 터미널로 돌아오기

## 4. 프로젝트 루트에 .env 파일 생성
# portmanagement 폴더에 .env.local 파일 생성:
VITE_SUPABASE_URL=https://[your-project].supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

## 5. vercel.json 생성 (SPA 라우팅 설정)
# portmanagement 폴더 루트에:
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}

## 6. 배포
cd portmanagement
vercel
# 설정 질문:
# - Set up and deploy? → Y
# - Which scope? → 본인 계정 선택
# - Link to existing project? → N (신규)
# - Project name? → portal-bookmarks (원하는 이름)
# - In which directory? → ./ (현재 폴더)
# - Override settings? → N

## 7. 환경변수 Vercel에 등록
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
# → 각각 값 입력 후 모든 환경(Production/Preview/Development) 선택

## 8. 재배포 (환경변수 반영)
vercel --prod

## 9. 완료
# 배포 URL: https://[project-name].vercel.app
# 이후 변경사항: git push → vercel --prod 로 재배포

## ⚠️ 주의사항
- 포트 실행/중지, 빌드, 터미널 기능은 로컬 전용 → Vercel에서 미동작
- 포털 북마크(URL 등록/조회/열기)만 정상 동작
- Supabase Anon Key는 공개 노출 허용 설계 (Row Level Security 또는 device_id로 격리)
`;

  const steps = [
    {
      title: '🆕 최초 세팅',
      content: (
        <div className="space-y-2">
          <p className="text-[#ede7dd]/90 text-[11px]">Supabase CLI + MCP 방식으로 처음 설정하는 경우</p>
          <pre className="bg-black/40 rounded p-2 text-zinc-400 whitespace-pre-wrap text-[10px] max-h-52 overflow-y-auto leading-relaxed">{CLI_FIRST_SETUP}</pre>
          <div className="flex gap-2">
            <button
              onClick={() => { navigator.clipboard.writeText(CLI_FIRST_SETUP); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="flex-1 py-1 rounded-lg border text-[10px] font-medium transition-all flex items-center justify-center gap-1.5 bg-[#221f1b] hover:bg-[#2a2520] text-zinc-400 border-stone-700/60"
            >
              <Database className="w-3 h-3" />
              가이드 복사
            </button>
            <button
              onClick={handleSupabaseLogin}
              disabled={loginLoading}
              className="flex-1 py-1 rounded-lg border text-[10px] font-medium transition-all flex items-center justify-center gap-1.5 bg-indigo-900/40 hover:bg-indigo-900/60 text-indigo-300 border-indigo-700/50 disabled:opacity-50"
            >
              <Terminal className="w-3 h-3" />
              {loginLoading ? '터미널 열는 중...' : 'supabase login 실행'}
            </button>
          </div>
        </div>
      ),
    },
    {
      title: '💻 추가 단말 세팅',
      content: (
        <div className="space-y-2">
          <p className="text-[#ede7dd]/90 text-[11px]">기존 Supabase 프로젝트에 새 맥/PC를 추가하는 경우</p>
          <pre className="bg-black/40 rounded p-2 text-zinc-400 whitespace-pre-wrap text-[10px] max-h-52 overflow-y-auto leading-relaxed">{CLI_ADDITIONAL_DEVICE}</pre>
          <button
            onClick={() => { navigator.clipboard.writeText(CLI_ADDITIONAL_DEVICE); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="w-full py-1 rounded-lg border text-[10px] font-medium transition-all flex items-center justify-center gap-1.5 bg-[#221f1b] hover:bg-[#2a2520] text-zinc-400 border-stone-700/60"
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
          <p className="text-[#ede7dd]/90 text-[11px]">Claude Code + Supabase MCP로 테이블 자동 생성</p>
          <ol className="list-decimal list-inside space-y-1 text-zinc-400 text-[10px]">
            <li>Claude Code 터미널 열기</li>
            <li>Supabase MCP 연결 확인 (<code className="text-[#ede7dd]/90 bg-black/30 px-0.5 rounded">/mcp-setup</code>)</li>
            <li>아래 프롬프트 복사 → Claude Code에 붙여넣기</li>
            <li>AI가 4개 테이블 + RLS 비활성화 자동 처리</li>
          </ol>
          <pre className="bg-black/40 rounded p-2 text-zinc-500 whitespace-pre-wrap text-[10px] max-h-36 overflow-y-auto">{AI_TABLE_PROMPT}</pre>
          <button
            onClick={() => { navigator.clipboard.writeText(AI_TABLE_PROMPT).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
            className={`w-full py-1.5 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
              copied ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-[#221f1b] hover:bg-[#2a2520] text-[#ede7dd]/90 border-stone-700/60'
            }`}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Database className="w-3.5 h-3.5" />}
            {copied ? '복사됨!' : 'AI 프롬프트 복사'}
          </button>
        </div>
      ),
    },
    {
      title: '🚀 Vercel 배포',
      content: (
        <div className="space-y-2">
          <p className="text-[#ede7dd]/90 text-[11px]">포털 북마크를 웹에 배포 — 앱 없이 브라우저에서 접근 가능</p>
          <pre className="bg-black/40 rounded p-2 text-zinc-400 whitespace-pre-wrap text-[10px] max-h-52 overflow-y-auto leading-relaxed">{VERCEL_GUIDE}</pre>
          <button
            onClick={() => { navigator.clipboard.writeText(VERCEL_GUIDE); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className={`w-full py-1.5 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
              copied ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-[#221f1b] hover:bg-[#2a2520] text-[#ede7dd]/90 border-stone-700/60'
            }`}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
            {copied ? '복사됨!' : '가이드 복사'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#221f1b]/60 border border-stone-700/50 rounded-lg text-xs text-zinc-400 hover:border-stone-700/60 transition-all"
      >
        <span className="flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-medium text-[#ede7dd]/90">초기 설정 가이드</span>
          <span className="text-[#6b6459]">— 처음 사용 시</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 bg-[#1c1916]/60 border border-stone-700/40 rounded-lg overflow-hidden">
          {/* Step tabs */}
          <div className="flex border-b border-stone-700/40 overflow-x-auto">
            {steps.map((s, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`flex-shrink-0 px-3 py-2 text-[10px] font-medium transition-all border-b-2 ${
                  step === i
                    ? 'border-indigo-500 text-indigo-300 bg-indigo-500/5'
                    : 'border-transparent text-zinc-500 hover:text-[#ede7dd]/90'
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
                <button onClick={() => setStep(s => s - 1)} className="flex-1 py-1 text-[10px] bg-[#221f1b] hover:bg-[#2a2520] text-zinc-400 rounded border border-stone-700/50 transition-all">← 이전</button>
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

export default function PortalManager({ showToast, openSettings, onSettingsClosed, actionsRef, isVisible = true, onChangeDevice }: Props) {
  const [data, setData] = useState<PortalData>({ items: [], categories: DEFAULT_CATEGORIES });
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncOk, setSyncOk] = useState<boolean | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showPortalHistory, setShowPortalHistory] = useState(false);
  const [portalHistoryList, setPortalHistoryList] = useState<PushSnapshot[]>([]);
  const [portalHistoryLoading, setPortalHistoryLoading] = useState(false);
  const [portalHistoryRestoring, setPortalHistoryRestoring] = useState<string | null>(null);

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
  const [viewingDeviceId, setViewingDeviceId] = useState(
    () => localStorage.getItem('portal-viewing-device') ?? ''
  );
  const [knownDevices, setKnownDevices] = useState<{device_id: string; device_name?: string}[]>([]);
  const [isFetchingDevices, setIsFetchingDevices] = useState(false);

  useEffect(() => {
    if (viewingDeviceId) {
      localStorage.setItem('portal-viewing-device', viewingDeviceId);
    } else {
      localStorage.removeItem('portal-viewing-device');
    }
  }, [viewingDeviceId]);

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
      const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
      const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
      setSbUrl(loaded.supabaseUrl || envUrl);
      setSbKey(loaded.supabaseAnonKey || envKey);
      // Persist env-var creds back to storage if missing
      if ((!loaded.supabaseUrl && envUrl) || (!loaded.supabaseAnonKey && envKey)) {
        loaded.supabaseUrl = envUrl;
        loaded.supabaseAnonKey = envKey;
      }
      const resolvedUrl = loaded.supabaseUrl || envUrl;
      const resolvedKey = loaded.supabaseAnonKey || envKey;

      // Auto-recognize device name from Supabase devices table if not set locally
      if (!loaded.deviceName && resolvedUrl && resolvedKey && loaded.deviceId) {
        try {
          const sb = createClient(resolvedUrl, resolvedKey);
          const { data: dev } = await sb.from('devices').select('name').eq('id', loaded.deviceId).maybeSingle();
          if (dev?.name) {
            loaded.deviceName = dev.name;
            needsPersist = true;
          }
        } catch { /* ignore — offline or table missing */ }
      }

      setDeviceName(loaded.deviceName ?? (loaded as any)._hostname ?? '');
      setViewingDeviceId(loaded.viewingDeviceId ?? '');
      setIsLoading(false);
      // Persist migrated deviceId / auto-fetched name back to portal.json
      if (needsPersist) {
        try { await PortalAPI.save(loaded); } catch { /* ignore */ }
      }
    })();
  }, []);

  // Open settings modal when parent triggers it — reload fresh data each time
  useEffect(() => {
    if (openSettings) {
      PortalAPI.load().then(loaded => {
        if (loaded.supabaseUrl) setSbUrl(loaded.supabaseUrl);
        if (loaded.supabaseAnonKey) setSbKey(loaded.supabaseAnonKey);
        setDeviceName(loaded.deviceName ?? (loaded as any)._hostname ?? '');
      }).catch(() => {});
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
        history: openPortalHistory,
        exportData,
        importData,
        openSettings: () => {
          PortalAPI.load().then(loaded => {
            if (loaded.supabaseUrl) setSbUrl(loaded.supabaseUrl);
            if (loaded.supabaseAnonKey) setSbKey(loaded.supabaseAnonKey);
            setDeviceName(loaded.deviceName ?? (loaded as any)._hostname ?? '');
          }).catch(() => {});
          setShowSettings(true);
        },
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
    if (!form.name.trim()) {
      showToast('이름을 입력하세요', 'error');
      return;
    }
    let finalUrl = form.url.trim();
    if (form.type === 'web') {
      if (!finalUrl) {
        showToast('URL을 입력하세요', 'error');
        return;
      }
      if (!/^https?:\/\//i.test(finalUrl)) {
        finalUrl = 'https://' + finalUrl;
      }
    }
    if (form.type === 'folder' && !form.path.trim()) {
      showToast('폴더 경로를 입력하세요', 'error');
      return;
    }
    if (form.type === 'folder' && !form.path.startsWith('/')) {
      showToast('절대 경로가 필요합니다 (예: /Users/gwanli/...)', 'error');
      return;
    }
    const resolvedCategory = form.category || data.categories[0]?.id || '';

    if (editingItem) {
      const next: PortalData = {
        ...data,
        items: data.items.map(i => i.id === editingItem.id
          ? { ...i, name: form.name, type: form.type, url: finalUrl || undefined, path: form.path || undefined, category: resolvedCategory, description: form.description || undefined, pinned: form.pinned }
          : i),
      };
      await persist(next);
      showToast('수정되었습니다', 'success');
    } else {
      const newItem: PortalItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: form.name,
        type: form.type,
        url: form.type === 'web' ? finalUrl : undefined,
        path: form.type === 'folder' ? form.path : undefined,
        category: resolvedCategory,
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

  async function openPortalHistory() {
    if (!sbUrl || !sbKey) { showToast('Supabase 설정이 없습니다', 'error'); return; }
    setPortalHistoryLoading(true);
    setShowPortalHistory(true);
    const supabase = createClient(sbUrl, sbKey);
    const deviceId = data.deviceId ?? null;
    const list = await fetchPushHistory(supabase, 'portal_items', deviceId);
    setPortalHistoryList(list);
    setPortalHistoryLoading(false);
  }

  async function restorePortalSnapshot(snapshotId: string) {
    if (!sbUrl || !sbKey) return;
    setPortalHistoryRestoring(snapshotId);
    try {
      const supabase = createClient(sbUrl, sbKey);
      const rows = await fetchSnapshotRows(supabase, snapshotId) as any[];
      if (rows.length === 0) { showToast('스냅샷이 비어있습니다', 'error'); return; }
      const { error: uErr } = await supabase.from('portal_items').upsert(rows, { onConflict: 'id' });
      if (uErr) throw new Error(uErr.message);
      const snapshotIds = new Set(rows.map(r => r.id));
      const deviceId = data.deviceId ?? null;
      const { data: current } = await supabase
        .from('portal_items').select('id')
        .or(`device_id.eq.${deviceId},device_id.eq.__shared__`);
      const toDelete = (current ?? []).filter((r: any) => !snapshotIds.has(r.id)).map((r: any) => r.id);
      if (toDelete.length > 0) await supabase.from('portal_items').delete().in('id', toDelete);
      await pullFromSupabase();
      showToast('스냅샷으로 복원 완료 ✓', 'success');
      setShowPortalHistory(false);
    } catch (e) {
      showToast('복원 실패: ' + e, 'error');
    } finally {
      setPortalHistoryRestoring(null);
    }
  }

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

      await savePushSnapshot(supabase, 'portal_items', deviceId, data.deviceName ?? null, itemRows);
      const [itemsRes, catsRes] = await Promise.all([
        supabase.from('portal_items').upsert(itemRows, { onConflict: 'id' }),
        supabase.from('portal_categories').upsert(catRows, { onConflict: 'id' }),
      ]);

      if (itemsRes.error) throw new Error(itemsRes.error.message);
      if (catsRes.error) throw new Error(catsRes.error.message);

      // Register this device in devices table (non-blocking)
      supabase.from('devices').upsert(
        { id: deviceId, name: data.deviceName ?? deviceName ?? null, last_push_at: new Date().toISOString() },
        { onConflict: 'id' }
      ).then(() => {}).catch(() => {});

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
      setData(nextData);
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
      // device_id → device_name 맵 (여러 소스에서 보강)
      const nameMap = new Map<string, string>();

      // 1순위: ports 테이블 (device_name 컬럼 있으면 사용)
      const { data: portsRows, error: portsErr } = await supabase
        .from('ports').select('device_id, device_name, folder_path').not('device_id', 'is', null);
      if (!portsErr && portsRows) {
        for (const r of portsRows) {
          if (!r.device_id || r.device_id === '__shared__') continue;
          seen.add(r.device_id);
          if (r.device_name && !nameMap.has(r.device_id)) {
            nameMap.set(r.device_id, r.device_name);
          }
          // device_name 없으면 folder_path에서 사용자명 추출 (/Users/username/...)
          if (!nameMap.has(r.device_id) && r.folder_path) {
            const m = r.folder_path.match(/^\/(?:Users|home)\/([^/]+)\//);
            if (m) nameMap.set(r.device_id, `${m[1]}의 기기`);
          }
        }
      }

      // 2순위: workspace_roots — sentinel 행(__device__)에서 기기명, 없으면 path에서 사용자명 추출
      const { data: rootRows } = await supabase
        .from('workspace_roots').select('device_id, name, path').not('device_id', 'is', null);
      for (const r of rootRows ?? []) {
        if (!r.device_id || r.device_id === '__shared__') continue;
        seen.add(r.device_id);
        // sentinel 행: Push 시 저장한 기기명 (최우선)
        if (r.path?.startsWith('__device__') && r.name) {
          nameMap.set(r.device_id, r.name);
        } else if (!nameMap.has(r.device_id) && r.path) {
          const m = r.path.match(/^\/(?:Users|home)\/([^/]+)\//);
          if (m) nameMap.set(r.device_id, `${m[1]}의 기기`);
        }
      }

      // 3순위: portal_items folder 타입
      const { data: folderRows } = await supabase
        .from('portal_items').select('device_id, path').eq('type', 'folder').not('device_id', 'is', null);
      for (const r of folderRows ?? []) {
        if (!r.device_id || r.device_id === '__shared__') continue;
        seen.add(r.device_id);
        if (!nameMap.has(r.device_id) && r.path) {
          const m = r.path.match(/^\/(?:Users|home)\/([^/]+)\//);
          if (m) nameMap.set(r.device_id, `${m[1]}의 기기`);
        }
      }

      const devices = Array.from(seen).map(id => ({
        device_id: id,
        device_name: nameMap.get(id),
      }));

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
    <div className="flex flex-col md:flex-row gap-4 h-full">
      {/* ── Mobile category tabs ──────────────────────────────────────────────── */}
      <div className="md:hidden flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        <button
          onClick={() => setSelectedCat('all')}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedCat === 'all' ? 'bg-[#2a2520] text-white' : 'bg-[#221f1b]/60 text-zinc-400 hover:text-[#ede7dd]'}`}
        >
          <BookMarked className="w-3 h-3" />
          전체 <span className="text-zinc-500">{data.items.length}</span>
        </button>
        {data.categories.sort((a, b) => a.order - b.order).map(cat => {
          const c = getColor(cat.color);
          const count = data.items.filter(i => i.category === cat.id).length;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCat(cat.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedCat === cat.id ? 'bg-[#2a2520] text-white' : 'bg-[#221f1b]/60 text-zinc-400 hover:text-[#ede7dd]'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot}`} />
              {cat.name} <span className="text-zinc-500">{count}</span>
            </button>
          );
        })}
        <button
          onClick={() => setShowCatModal(true)}
          className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-zinc-500 bg-[#221f1b]/60 hover:text-[#ede7dd]/90 transition-colors"
        >
          <Plus className="w-3 h-3" />
          추가
        </button>
      </div>

      {/* ── Left Sidebar (desktop only) ──────────────────────────────────────── */}
      <div className="hidden md:flex flex-col flex-shrink-0" style={{width:220,padding:'14px 10px',borderRight:'1px solid rgba(255,240,220,0.07)',background:'#1c1916',gap:2,overflow:'hidden'}}>
        {/* All */}
        <button
          onClick={() => setSelectedCat('all')}
          style={{
            display:'flex',alignItems:'center',gap:8,padding:'7px 10px',borderRadius:6,cursor:'pointer',border:'none',
            background:selectedCat==='all' ? '#221f1b' : 'transparent',
            color:selectedCat==='all' ? '#ede7dd' : '#a39a8c',
            fontSize:12.5,fontWeight:selectedCat==='all'?500:400,fontFamily:'inherit',
          }}
        >
          <BookMarked className="w-3 h-3 flex-shrink-0" />
          <span style={{flex:1,textAlign:'left'}}>전체</span>
          <span style={{fontSize:10.5,color:'#6b6459',fontFamily:"'JetBrains Mono',monospace"}}>{data.items.length}</span>
        </button>

        {data.categories.sort((a, b) => a.order - b.order).map(cat => {
          const c = getColor(cat.color);
          const count = data.items.filter(i => i.category === cat.id).length;
          const active = selectedCat === cat.id;
          return (
            <div key={cat.id} className="group" style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',borderRadius:6,cursor:'pointer',background:active?'#221f1b':'transparent',color:active?'#ede7dd':'#a39a8c',fontSize:12.5}} onClick={() => setSelectedCat(cat.id)}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
              <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cat.name}</span>
              <span style={{fontSize:10.5,color:'#6b6459',fontFamily:"'JetBrains Mono',monospace"}}>{count}</span>
              <span
                role="button"
                onClick={e => { e.stopPropagation(); deleteCategory(cat.id); }}
                className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity cursor-pointer"
                style={{color:'#6b6459'}}
              >
                <X className="w-3 h-3" />
              </span>
            </div>
          );
        })}

        {/* Add category */}
        <button
          onClick={() => setShowCatModal(true)}
          style={{marginTop:6,padding:'7px 10px',borderRadius:6,color:'#6b6459',fontSize:12,display:'flex',alignItems:'center',gap:8,cursor:'pointer',border:'1px dashed rgba(255,240,220,0.07)',background:'transparent',fontFamily:'inherit'}}
        >
          <Plus className="w-3 h-3" />
          카테고리 추가
        </button>

        {/* Sync status */}
        {data.lastSynced && (
          <p style={{marginTop:'auto',padding:'6px 8px',fontSize:10.5,color:'#6b6459',fontFamily:"'JetBrains Mono',monospace"}}>
            동기화: {new Date(data.lastSynced).toLocaleDateString('ko-KR')}
          </p>
        )}
        <button
          onClick={openPortalHistory}
          style={{marginTop:data.lastSynced?2:4,padding:'7px 10px',borderRadius:6,color:'#6b6459',fontSize:12,display:'flex',alignItems:'center',gap:6,cursor:'pointer',border:'1px solid rgba(255,240,220,0.07)',background:'transparent',fontFamily:'inherit',width:'100%'}}
          title="Push 히스토리 / 복원"
        >
          <Clock className="w-3 h-3 flex-shrink-0" />
          히스토리
        </button>
      </div>

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {/* Search row */}
        <div style={{padding:'14px 0 14px',display:'flex',gap:10,borderBottom:'1px solid rgba(255,240,220,0.07)',marginBottom:14}}>
          <div style={{flex:1,position:'relative'}}>
            <Search className="w-3.5 h-3.5" style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#6b6459'}} />
            <input
              type="text"
              placeholder="검색…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{width:'100%',padding:'8px 10px 8px 30px',background:'#1c1916',border:'1px solid rgba(255,240,220,0.07)',borderRadius:7,color:'#ede7dd',fontSize:12.5,outline:'none',fontFamily:'inherit',boxSizing:'border-box'}}
            />
          </div>
          {viewingDeviceId && viewingDeviceId !== data.deviceId && (
            <div style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',background:'rgba(232,165,87,0.08)',border:'1px solid rgba(232,165,87,0.25)',borderRadius:7,flexShrink:0}}>
              <span style={{color:'#e8a557',fontSize:10.5,fontWeight:500,whiteSpace:'nowrap'}}>
                📱 {knownDevices.find(d => d.device_id === viewingDeviceId)?.device_name ?? viewingDeviceId.slice(0, 6) + '…'}
              </span>
              <button
                onClick={() => { setViewingDeviceId(''); setData(d => ({ ...d, viewingDeviceId: undefined })); }}
                style={{color:'#e8a557',background:'transparent',border:'none',cursor:'pointer',fontSize:12,lineHeight:1}}
                title="내 기기로 복귀"
              >✕</button>
            </div>
          )}
          <button
            onClick={() => openAddModal(selectedCat !== 'all' ? selectedCat : undefined)}
            style={{padding:'8px 14px',background:'#e8a557',color:'#15120f',border:'none',borderRadius:7,fontSize:12.5,fontWeight:600,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:5,fontFamily:'inherit',flexShrink:0}}
          >
            <Plus className="w-3 h-3" />추가
          </button>
        </div>

        {/* Pinned section */}
        {pinnedItems.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2 px-0.5">
              <Star className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-medium text-zinc-400">고정됨</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
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
              <div key={cat.id} style={{marginBottom:20}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,fontSize:11.5,color:'#a39a8c'}}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot}`} />
                  <span style={{fontWeight:500,color:'#ede7dd'}}>{cat.name}</span>
                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10.5,color:'#6b6459'}}>{catItems.length}</span>
                  <div style={{flex:1}}/>
                  <button onClick={() => openAddModal(cat.id)} style={{background:'transparent',border:'none',cursor:'pointer',color:'#6b6459',padding:4,display:'flex',alignItems:'center'}}>
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {unpinnedItems.map(item => (
                <ItemCard key={item.id} item={item} getCat={getCat} getColor={getColor} onOpen={openItem} onEdit={openEditModal} onDelete={deleteItem} onTogglePin={togglePin} />
              ))}
            </div>
          ) : (
            filteredItems.length === 0 && (
              <div style={{background:'#1c1916',borderRadius:10,border:'1px solid rgba(255,240,220,0.07)',padding:'48px 24px',textAlign:'center'}}>
                <BookMarked className="w-7 h-7 mx-auto mb-3" style={{color:'#6b6459'}} />
                <p style={{fontSize:13,color:'#a39a8c',marginBottom:12}}>
                  {search ? '검색 결과가 없습니다' : '항목이 없습니다'}
                </p>
                <button
                  onClick={() => openAddModal()}
                  style={{padding:'7px 16px',background:'#e8a557',color:'#15120f',border:'none',borderRadius:7,fontSize:12.5,fontWeight:600,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:5,fontFamily:'inherit'}}
                >
                  <Plus className="w-3 h-3" />첫 항목 추가
                </button>
              </div>
            )
          )
        )}
      </div>

      {/* ── Add/Edit Item Modal ───────────────────────────────────────────────── */}
      {showItemModal && (
        <Modal title={editingItem ? '항목 수정' : '항목 추가'} onClose={() => setShowItemModal(false)} onConfirm={saveItem} confirmLabel={editingItem ? '저장' : '추가'}>
          {/* Type toggle — hide folder on deployed web (no local filesystem) */}
          <div className="flex rounded-lg overflow-hidden border border-stone-700/50 mb-3">
            {(['web', 'folder'] as const).filter(t => t === 'web' || !isDeployedWeb()).map(t => (
              <button
                key={t}
                onClick={() => setForm(f => ({ ...f, type: t }))}
                className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${form.type === t ? 'bg-[#2a2520] text-white' : 'text-zinc-500 hover:text-[#ede7dd]/90 hover:bg-[#221f1b]/60'}`}
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
            className="w-full mb-3 px-3 py-2 text-sm bg-black/30 border border-stone-700/50 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
            placeholder="이름을 입력하세요"
            autoFocus
          />

          {form.type === 'web' ? (
            <>
              <label className="block text-xs text-zinc-400 mb-1">URL *</label>
              <input
                type="text"
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                className="w-full mb-3 px-3 py-2 text-sm bg-black/30 border border-stone-700/50 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                placeholder="https://..."
              />
            </>
          ) : (
            <>
              <label className="block text-xs text-zinc-400 mb-1">폴더 경로 * <span className="text-[#6b6459] font-normal">(숨김 폴더: ~/.claude 등 직접 입력)</span></label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={form.path}
                  onChange={e => setForm(f => ({ ...f, path: e.target.value }))}
                  onBlur={e => {
                    const v = e.target.value.trim();
                    if (v.startsWith('~/') || v === '~') {
                      setForm(f => ({ ...f, path: v.replace(/^~/, (window as any).__homeDir__ || v) }));
                      fetch('/api/expand-path', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: v }) })
                        .then(r => r.json()).then(d => { if (d.path) setForm(f => ({ ...f, path: d.path })); }).catch(() => {});
                    }
                  }}
                  className="flex-1 px-3 py-2 text-sm bg-black/30 border border-stone-700/50 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                  placeholder="/Users/... 또는 ~/.config"
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
                    className="px-3 py-2 bg-[#221f1b] hover:bg-[#2a2520] text-[#ede7dd]/90 text-sm rounded-lg border border-stone-700/50 transition-all"
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
            className="w-full mb-3 px-3 py-2 text-sm bg-black/30 border border-stone-700/50 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
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
            className="w-full mb-3 px-3 py-2 text-sm bg-black/30 border border-stone-700/50 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
            placeholder="간단한 설명..."
          />

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={form.pinned} onChange={e => setForm(f => ({ ...f, pinned: e.target.checked }))} className="rounded" />
            <span className="text-sm text-[#ede7dd]/90">고정 (즐겨찾기)</span>
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
            className="w-full mb-4 px-3 py-2 text-sm bg-black/30 border border-stone-700/50 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
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
        <Modal title="설정" onClose={() => setShowSettings(false)} onConfirm={async () => { await saveSettings(); if (viewingDeviceId && viewingDeviceId !== data.deviceId) { await pullFromSupabase(); } else { await syncSupabase(); } }} confirmLabel="저장 후 동기화">

          {/* ── 1. 단말 이름 ─────────────────────────────────────────────────── */}
          <div style={{marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',marginBottom:6,fontSize:11.5,color:'#a39a8c'}}>
              <span>이 기기 이름{!deviceName && !data.deviceId && <span style={{color:'#e8a557',fontWeight:500,marginLeft:4}}>* 필수</span>}</span>
              <div style={{flex:1}}/>
              {deviceName
                ? <span style={{fontSize:11,color:'#8fb96e',display:'inline-flex',alignItems:'center',gap:4}}><span style={{width:6,height:6,borderRadius:3,background:'#8fb96e',display:'inline-block'}}/>등록됨</span>
                : data.deviceId
                  ? <span style={{fontSize:11,color:'#e8a557'}}>이름 미설정 — 입력 권장</span>
                  : null
              }
            </div>
            <input
              type="text"
              value={deviceName}
              onChange={e => setDeviceName(e.target.value)}
              style={{width:'100%',padding:'8px 10px',background:'#15120f',border:'1px solid rgba(255,240,220,0.07)',borderRadius:6,color:'#ede7dd',fontSize:12.5,outline:'none',fontFamily:'inherit',boxSizing:'border-box'}}
              placeholder="예: MyMacPro, 회사맥북, WindowsPC"
              autoFocus={!deviceName && !data.deviceId}
            />
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:5}}>
              <p style={{fontSize:10.5,color:'#6b6459',fontFamily:"'JetBrains Mono',monospace",margin:0}}>Device ID: {data.deviceId ? data.deviceId.slice(0, 16) + '…' : '자동생성'}</p>
              {onChangeDevice && (
                <button
                  onClick={() => { setShowSettings(false); onChangeDevice(); }}
                  style={{fontSize:10.5,color:'#e8a557',background:'transparent',border:'none',cursor:'pointer',padding:0}}
                >
                  단말 변경
                </button>
              )}
            </div>
          </div>

          {/* ── 2. Supabase 연결 ─────────────────────────────────────────────── */}
          <div style={{marginBottom:16}}>
            <label style={{display:'block',fontSize:11.5,color:'#a39a8c',marginBottom:6}}>Project URL</label>
            <input
              type="text"
              value={sbUrl}
              onChange={e => setSbUrl(e.target.value)}
              style={{width:'100%',padding:'8px 10px',background:'#15120f',border:'1px solid rgba(255,240,220,0.07)',borderRadius:6,color:'#ede7dd',fontSize:12.5,outline:'none',fontFamily:'inherit',boxSizing:'border-box',marginBottom:12}}
              placeholder="https://xxx.supabase.co"
            />
            <label style={{display:'block',fontSize:11.5,color:'#a39a8c',marginBottom:6}}>Anon Key</label>
            <input
              type="password"
              value={sbKey}
              onChange={e => setSbKey(e.target.value)}
              style={{width:'100%',padding:'8px 10px',background:'#15120f',border:'1px solid rgba(255,240,220,0.07)',borderRadius:6,color:'#ede7dd',fontSize:12.5,outline:'none',fontFamily:"'JetBrains Mono',monospace",boxSizing:'border-box'}}
              placeholder="eyJ..."
            />
            {sbUrl && sbKey && (
              <button
                onClick={async () => {
                  // Always load fresh data so device ID isn't stale from localStorage fallback
                  const fresh = await PortalAPI.load();
                  const p = new URLSearchParams({ url: sbUrl, key: sbKey });
                  const did = fresh.deviceId || data.deviceId;
                  if (did) p.set('device', did);
                  const dname = fresh.deviceName || deviceName;
                  if (dname) p.set('name', dname);
                  window.open(`https://portmanager-portal.vercel.app?${p}`, '_blank');
                }}
                style={{marginTop:10,width:'100%',padding:'8px 10px',background:'rgba(139,185,110,0.1)',border:'1px solid rgba(139,185,110,0.25)',borderRadius:6,color:'#8fb96e',fontSize:12,cursor:'pointer',fontFamily:'inherit',textAlign:'center'}}
              >
                🔗 Vercel 포털 열기 (자동 인증)
              </button>
            )}
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
            onChangeDeviceId={async (newId) => {
              const next = { ...data, deviceId: newId };
              await persist(next);
              setData(next);
              showToast('Device ID 변경됨', 'success');
            }}
          />
        </Modal>
      )}

      {/* ── Push 히스토리 모달 — 포털 아이템 ─────────────────────────────────── */}
      {showPortalHistory && (
        <div style={{position:'fixed',inset:0,zIndex:60,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)'}} onClick={() => setShowPortalHistory(false)}>
          <div style={{background:'#18181b',border:'1px solid rgba(255,240,220,0.1)',borderRadius:12,width:'100%',maxWidth:460,margin:'0 16px',boxShadow:'0 24px 48px rgba(0,0,0,0.6)',overflow:'hidden'}} onClick={e => e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:'1px solid rgba(255,240,220,0.07)'}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <Clock className="w-4 h-4" style={{color:'#e8a557'}} />
                <span style={{fontSize:13,fontWeight:600,color:'#ede7dd'}}>Push 히스토리 — 포털 북마크</span>
              </div>
              <button onClick={() => setShowPortalHistory(false)} style={{background:'transparent',border:'none',color:'#a39a8c',cursor:'pointer',padding:4,display:'flex',alignItems:'center'}}><X className="w-4 h-4" /></button>
            </div>
            <div style={{overflowY:'auto',maxHeight:360}}>
              {portalHistoryLoading ? (
                <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'40px 0'}}>
                  <RefreshCw className="w-5 h-5" style={{color:'#6b6459',animation:'spin 1s linear infinite'}} />
                </div>
              ) : portalHistoryList.length === 0 ? (
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 0',gap:8}}>
                  <Clock className="w-8 h-8" style={{color:'#3f3a34'}} />
                  <p style={{fontSize:13,color:'#6b6459',margin:0}}>저장된 히스토리가 없습니다</p>
                  <p style={{fontSize:11,color:'#4a4540',margin:0}}>Push 시 자동으로 스냅샷이 저장됩니다</p>
                </div>
              ) : portalHistoryList.map((snap, i) => (
                <div key={snap.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:'1px solid rgba(255,240,220,0.05)'}}>
                  <div style={{minWidth:0}}>
                    <p style={{fontSize:13,color:'#ede7dd',fontWeight:500,margin:0}}>{new Date(snap.created_at).toLocaleString('ko-KR')}</p>
                    <p style={{fontSize:11,color:'#6b6459',margin:'3px 0 0',fontFamily:"'JetBrains Mono',monospace"}}>
                      {snap.row_count}개 항목{snap.device_name ? ` · ${snap.device_name}` : ''}
                      {i === 0 && <span style={{marginLeft:6,color:'#8fb96e',fontWeight:500}}>최신</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => restorePortalSnapshot(snap.id)}
                    disabled={portalHistoryRestoring !== null}
                    style={{marginLeft:12,flexShrink:0,display:'flex',alignItems:'center',gap:4,padding:'6px 10px',fontSize:11.5,background:'rgba(232,165,87,0.08)',color:'#e8a557',border:'1px solid rgba(232,165,87,0.2)',borderRadius:6,cursor:'pointer',fontFamily:'inherit',opacity:portalHistoryRestoring?0.5:1}}
                  >
                    {portalHistoryRestoring === snap.id
                      ? <RefreshCw className="w-3 h-3" style={{animation:'spin 1s linear infinite'}} />
                      : <RotateCw className="w-3 h-3" />}
                    복원
                  </button>
                </div>
              ))}
            </div>
            <div style={{padding:'8px 16px',borderTop:'1px solid rgba(255,240,220,0.07)',background:'rgba(255,255,255,0.02)'}}>
              <p style={{fontSize:10.5,color:'#4a4540',margin:0}}>복원 시 현재 Supabase 북마크 데이터를 선택한 시점으로 되돌립니다</p>
            </div>
          </div>
        </div>
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
      style={{
        padding:14, background:'#1c1916',
        border:`1px solid ${hovered ? 'rgba(255,240,220,0.12)' : 'rgba(255,240,220,0.07)'}`,
        borderRadius:10, display:'flex', flexDirection:'column', gap:6,
        minHeight:100, position:'relative', cursor:'pointer', transition:'border-color .1s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Visit count badge */}
      {item.visitCount > 0 && (
        <span style={{position:'absolute',top:10,right:10,fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:'#6b6459'}}>{item.visitCount}</span>
      )}
      {item.pinned && <Star className="w-3 h-3" style={{position:'absolute',top:10,right:item.visitCount>0?28:10,color:'#e8a557'}} />}

      {/* Header row */}
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <div className={`${c.bg} ${c.border}`} style={{width:28,height:28,borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,border:'1px solid'}}>
          {item.type === 'web'
            ? <Globe className={`w-3.5 h-3.5 ${c.text}`} />
            : <Folder className={`w-3.5 h-3.5 ${c.text}`} />
          }
        </div>
        <div style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:13,fontWeight:600,letterSpacing:-0.2,color:'#ede7dd'}}>
          {item.name}
        </div>
      </div>

      {item.description && (
        <div style={{fontSize:11,color:'#a39a8c',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.description}</div>
      )}

      {/* URL/path preview */}
      <div style={{fontSize:11,color:'#6b6459',fontFamily:"'JetBrains Mono',monospace",overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
        {item.type === 'web' ? item.url : item.path}
      </div>

      {/* Actions */}
      <div style={{marginTop:'auto',display:'flex',gap:4,opacity:hovered?1:0.5,transition:'opacity .12s'}}>
        <button
          onClick={() => onOpen(item)}
          className={`${c.bg} ${c.text} ${c.border}`}
          style={{flex:1,padding:'5px 8px',borderRadius:5,border:'1px solid',fontSize:11,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:4,fontFamily:'inherit'}}
        >
          {item.type === 'web' ? <ExternalLink className="w-3 h-3" /> : <FolderOpen className="w-3 h-3" />}
          <span>{item.type === 'web' ? '열기' : '폴더'}</span>
        </button>
        <button
          onClick={() => onTogglePin(item.id)}
          style={{padding:'5px 8px',borderRadius:5,background:item.pinned?'rgba(232,165,87,0.12)':'transparent',border:'1px solid rgba(255,240,220,0.07)',color:item.pinned?'#e8a557':'#6b6459',cursor:'pointer'}}
          title={item.pinned ? '고정 해제' : '고정'}
        >
          <Pin className="w-3 h-3" />
        </button>
        <button
          onClick={() => onEdit(item)}
          style={{padding:'5px 8px',borderRadius:5,background:'transparent',border:'1px solid rgba(255,240,220,0.07)',color:'#6b6459',cursor:'pointer'}}
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={() => onDelete(item.id)}
          style={{padding:'5px 8px',borderRadius:5,background:'transparent',border:'1px solid rgba(255,240,220,0.07)',color:'#6b6459',cursor:'pointer'}}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(10,8,6,0.65)',backdropFilter:'blur(2px)'}}>
      <div style={{width:440,background:'#1c1916',borderRadius:12,border:'1px solid rgba(255,240,220,0.12)',boxShadow:'0 24px 80px rgba(0,0,0,0.6)',overflow:'hidden'}}>
        <div style={{padding:'14px 18px',display:'flex',alignItems:'center',borderBottom:'1px solid rgba(255,240,220,0.07)'}}>
          <h3 style={{margin:0,fontSize:14,fontWeight:600,letterSpacing:-0.2,color:'#ede7dd'}}>{title}</h3>
          <div style={{flex:1}}/>
          <button onClick={onClose} style={{background:'transparent',border:'none',color:'#a39a8c',cursor:'pointer',padding:4,display:'flex',alignItems:'center'}}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div style={{padding:18}}>{children}</div>
        <div style={{padding:'12px 18px',borderTop:'1px solid rgba(255,240,220,0.07)',display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'7px 16px',background:'transparent',color:'#ede7dd',border:'1px solid rgba(255,240,220,0.12)',borderRadius:6,fontSize:12.5,cursor:'pointer',fontFamily:'inherit'}}>
            취소
          </button>
          <button onClick={onConfirm} style={{padding:'7px 16px',background:'#e8a557',color:'#15120f',border:'none',borderRadius:6,fontSize:12.5,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
