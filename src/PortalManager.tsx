import React, { useState, useEffect, useCallback } from 'react';
import {
  Globe, Folder, Plus, Trash2, Pencil, X, Check, Search,
  ExternalLink, FolderOpen, Star, Download, Upload,
  Cloud, CloudOff, CloudUpload, CloudDownload, Settings, RefreshCw, Link2, Pin,
  BookMarked, ChevronDown, Database, Bot, Loader2
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

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem('portal-device-id');
  if (!id) {
    id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem('portal-device-id', id);
  }
  return id;
}

// ─── Form default state ───────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', type: 'web' as 'web' | 'folder', url: '', path: '', category: '', description: '', pinned: false };

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  showToast: (msg: string, type: 'success' | 'error') => void;
  onClaudeBypass?: (sessionName: string, folderPath?: string) => Promise<string>;
}

const CLAUDE_PROMPT = `Supabase CLI로 아래 3개 테이블을 생성해줘.

-- 1. 포트 관리 테이블
create table if not exists ports (
  id text primary key,
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

-- 기존 테이블 업그레이드 (이미 생성된 경우)
alter table ports add column if not exists terminal_command text;
alter table ports add column if not exists category text;
alter table ports add column if not exists description text;
alter table ports add column if not exists ai_name text;

-- 2. 포털 아이템 테이블
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

-- 3. 포털 카테고리 테이블
create table if not exists portal_categories (
  id text primary key,
  device_id text not null,
  name text not null,
  color text not null,
  "order" integer default 0
);

RLS는 비활성화하거나 anon key로 읽기/쓰기 허용 정책으로 설정해줘.`;

function SetupGuide() {
  const [copied, setCopied] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(CLAUDE_PROMPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-zinc-900/60 border border-zinc-700/50 rounded-lg text-xs text-zinc-400 hover:border-zinc-600 transition-all"
      >
        <span className="flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-medium text-zinc-300">테이블 설정 가이드</span>
          <span className="text-zinc-600">— 처음 사용 시</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 bg-zinc-900/40 border border-zinc-700/40 rounded-lg p-3 text-xs text-zinc-400 space-y-2">
          <p className="text-zinc-300 font-medium">Claude Code에서 아래 프롬프트를 실행하세요:</p>
          <ol className="list-decimal list-inside space-y-1 text-zinc-500">
            <li>Claude Code 터미널 열기</li>
            <li>Supabase MCP 연결 확인</li>
            <li>아래 프롬프트 복사 후 붙여넣기</li>
          </ol>
          <pre className="bg-black/40 rounded p-2 text-zinc-500 whitespace-pre-wrap break-all text-[10px] max-h-32 overflow-y-auto">{CLAUDE_PROMPT}</pre>
          <button
            onClick={handleCopy}
            className={`w-full py-1.5 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
              copied
                ? 'bg-green-500/10 text-green-400 border-green-500/30'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-600'
            }`}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Database className="w-3.5 h-3.5" />}
            {copied ? '복사됨!' : 'Claude 프롬프트 복사'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function PortalManager({ showToast, onClaudeBypass }: Props) {
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
  const [isUpdatingCategories, setIsUpdatingCategories] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const loaded = await PortalAPI.load();
      if (!loaded.categories?.length) loaded.categories = DEFAULT_CATEGORIES;
      if (!loaded.deviceId) loaded.deviceId = getOrCreateDeviceId();
      setData(loaded);
      setSbUrl(loaded.supabaseUrl ?? '');
      setSbKey(loaded.supabaseAnonKey ?? '');
      setDeviceName(loaded.deviceName ?? '');
      setViewingDeviceId(loaded.viewingDeviceId ?? '');
      setIsLoading(false);
    })();
  }, []);

  const persist = useCallback(async (next: PortalData) => {
    setData(next);
    try {
      await PortalAPI.save(next);
    } catch (e) {
      showToast('저장 실패: ' + e, 'error');
    }
  }, [showToast]);

  // ── Claude 카테고리 최신화 ───────────────────────────────────────────────────

  async function handleUpdateCategories() {
    if (!onClaudeBypass) {
      showToast('Claude Code 연동이 설정되지 않았습니다', 'error');
      return;
    }
    setIsUpdatingCategories(true);
    try {
      const projectPath = typeof window !== 'undefined' ? window.location.hostname : undefined;
      const sessionName = `portal-categories-${Date.now()}`;
      await onClaudeBypass(sessionName, projectPath);
      showToast('Claude Code Agent Teams 실행 완료', 'success');
    } catch (e) {
      showToast('카테고리 최신화 실패: ' + e, 'error');
    } finally {
      setIsUpdatingCategories(false);
    }
  }

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
        created_at: item.createdAt,
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

      const nextData: PortalData = { ...data, supabaseUrl: sbUrl, supabaseAnonKey: sbKey, deviceId, lastSynced: new Date().toISOString() };
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
    if (!sbUrl || !sbKey) { showToast('Supabase 설정을 먼저 입력하세요', 'error'); return; }
    setIsFetchingDevices(true);
    try {
      const supabase = createClient(sbUrl, sbKey);
      // Try with device_name column first; fall back if column doesn't exist
      let rows: any[] = [];
      const { data: withName, error: nameErr } = await supabase
        .from('ports').select('device_id, device_name').not('device_id', 'is', null);
      if (nameErr) {
        const { data: withoutName } = await supabase
          .from('ports').select('device_id').not('device_id', 'is', null);
        rows = withoutName ?? [];
      } else {
        rows = withName ?? [];
      }
      const seen = new Set<string>();
      const devices: {device_id: string; device_name?: string}[] = [];
      for (const r of rows) {
        if (r.device_id && !seen.has(r.device_id)) {
          seen.add(r.device_id);
          devices.push({ device_id: r.device_id, device_name: r.device_name ?? undefined });
        }
      }
      setKnownDevices(devices);
      if (devices.length === 0) showToast('등록된 단말이 없습니다 (Push 먼저 실행)', 'error');
    } catch (e: any) {
      showToast('단말 목록 오류: ' + e.message, 'error');
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

  return (
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
                📱 {knownDevices.find(d => d.device_id === viewingDeviceId)?.device_name ?? viewingDeviceId.slice(0, 6) + '…'}
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
          <button
            onClick={syncSupabase}
            disabled={isSyncing}
            title="포털 데이터를 Supabase에 업로드 (Push)"
            className={`px-2.5 py-1.5 text-sm rounded-lg border transition-all flex items-center gap-1 ${
              syncOk === true ? 'bg-green-500/10 text-green-400 border-green-500/30' :
              syncOk === false ? 'bg-red-500/10 text-red-400 border-red-500/30' :
              'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-indigo-500/50'
            }`}
          >
            <CloudUpload className={`w-3.5 h-3.5 ${isSyncing ? 'animate-pulse' : 'text-indigo-400'}`} />
          </button>
          <button
            onClick={pullFromSupabase}
            disabled={isRestoring}
            title="Supabase에서 포털 데이터 복원 (Pull)"
            className="px-2.5 py-1.5 text-sm rounded-lg border transition-all flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-indigo-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CloudDownload className={`w-3.5 h-3.5 ${isRestoring ? 'animate-pulse' : 'text-indigo-400'}`} />
          </button>
          <button
            onClick={exportData}
            title="내보내기"
            className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-sm rounded-lg border border-zinc-700 hover:border-zinc-600 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={importData}
            title="불러오기"
            className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-sm rounded-lg border border-zinc-700 hover:border-zinc-600 transition-all"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowSettings(true)}
            title="Supabase 설정"
            className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-sm rounded-lg border border-zinc-700 hover:border-zinc-600 transition-all"
          >
            <Settings className="w-3.5 h-3.5" />
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

      {/* ── Settings Modal ───────────────────────────────────────────────────── */}
      {showSettings && (
        <Modal title="Supabase 설정" onClose={() => setShowSettings(false)} onConfirm={saveSettings} confirmLabel="저장">
          <SetupGuide />
          {onClaudeBypass && (
            <button
              onClick={handleUpdateCategories}
              disabled={isUpdatingCategories}
              className="w-full mb-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-sm rounded-lg border border-emerald-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUpdatingCategories ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Bot className="w-4 h-4" />
              )}
              카테고리 최신화하기
            </button>
          )}
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
            className="w-full mb-4 px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
            placeholder="eyJ..."
          />

          {/* ── Device Settings ────────────────────────────────────────────── */}
          <div className="border-t border-zinc-700/50 pt-4 mb-4">
            <p className="text-xs font-medium text-zinc-300 mb-3">단말 설정 (Device Settings)</p>
            <label className="block text-xs text-zinc-400 mb-1">Device ID</label>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                readOnly
                value={data.deviceId ? `${data.deviceId.slice(0, 8)}...` : '—'}
                className="flex-1 px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-zinc-500 rounded-lg cursor-default select-none"
              />
              <button
                onClick={() => {
                  if (data.deviceId) {
                    navigator.clipboard.writeText(data.deviceId);
                    showToast('Device ID 복사됨', 'success');
                  }
                }}
                className="px-3 py-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-300 border border-zinc-700 rounded-lg transition-all"
                title="전체 UUID 복사"
              >
                복사
              </button>
            </div>
            <label className="block text-xs text-zinc-400 mb-1">Device Name</label>
            <input
              type="text"
              value={deviceName}
              onChange={e => setDeviceName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              placeholder="예: MacBook Pro, Windows PC"
            />
          </div>

          {/* ── Device Selector ─────────────────────────────────────────────── */}
          <div className="border-t border-zinc-700/50 pt-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-zinc-300">단말 선택 (Pull 대상)</p>
              <button
                onClick={fetchKnownDevices}
                disabled={isFetchingDevices}
                className="px-2.5 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-300 border border-zinc-700 rounded-lg transition-all disabled:opacity-50"
              >
                {isFetchingDevices ? '조회 중…' : '단말 조회'}
              </button>
            </div>
            {knownDevices.length > 0 ? (
              <select
                value={viewingDeviceId || data.deviceId || ''}
                onChange={e => setViewingDeviceId(e.target.value === data.deviceId ? '' : e.target.value)}
                className="w-full px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              >
                {knownDevices.map(d => (
                  <option key={d.device_id} value={d.device_id}>
                    {d.device_name
                      ? `${d.device_name} (${d.device_id.slice(0, 6)}…)`
                      : d.device_id.slice(0, 8) + '…'}
                    {d.device_id === data.deviceId ? ' ← 이 기기' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-zinc-600 italic">"단말 조회" 버튼을 눌러 등록된 기기 목록을 불러오세요</p>
            )}
            {viewingDeviceId && viewingDeviceId !== data.deviceId && (
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[11px] text-amber-400">⚠ 다른 기기 데이터 조회 중 — Pull 시 해당 기기 데이터 적용</p>
                <button
                  onClick={() => setViewingDeviceId('')}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 underline"
                >
                  내 기기로 복귀
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => { saveSettings(); setTimeout(syncSupabase, 300); }}
            className="w-full mt-1 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-sm rounded-lg border border-purple-500/30 transition-all flex items-center justify-center gap-2"
          >
            <Cloud className="w-4 h-4" />
            저장 후 즉시 동기화
          </button>
        </Modal>
      )}
    </div>
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
