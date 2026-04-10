import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Server, Trash2, Plus, ExternalLink, Terminal, ArrowUpDown, Pencil, Check, X as XIcon, Play, Square, Rocket, FolderOpen, Upload, Download, Folder, FilePlus, Package, RefreshCw, FileText, RotateCw, Globe, Github, SquareTerminal, Info, Monitor, BookMarked, Cloud, CloudUpload, CloudDownload, Search, Sparkles } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { createClient } from '@supabase/supabase-js';
import PortalManager from './PortalManager';

// Tauri API 체크
const isTauri = () => {
  if (typeof window === 'undefined') return false;
  // Tauri v2에서는 __TAURI_INTERNALS__ 또는 __TAURI__ 확인
  return '__TAURI__' in window || '__TAURI_INTERNALS__' in window;
};

// OS 감지
const isWindows = () => typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('win');
const execFileExt = () => isWindows() ? '.bat / .cmd / .html' : '.command / .html';
const isHtmlFile = (path?: string) => !!path && path.toLowerCase().endsWith('.html');

// API 호출 래퍼 (브라우저와 Tauri 모두 지원)
const API = {
  async loadPorts(): Promise<PortInfo[]> {
    if (isTauri()) {
      return invoke<PortInfo[]>('load_ports');
    } else {
      const response = await fetch('/api/ports');
      if (!response.ok) throw new Error('Failed to load ports');
      return response.json();
    }
  },

  async savePorts(ports: PortInfo[]): Promise<void> {
    if (isTauri()) {
      return invoke('save_ports', { ports });
    } else {
      await fetch('/api/ports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ports),
      });
    }
  },

  async executeCommand(portId: string, commandPath: string): Promise<void> {
    if (isTauri()) {
      return invoke('execute_command', { portId, commandPath });
    } else {
      const response = await fetch('/api/execute-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portId, commandPath })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
    }
  },

  async stopCommand(portId: string, port: number): Promise<void> {
    if (isTauri()) {
      return invoke('stop_command', { portId, port });
    } else {
      const response = await fetch('/api/stop-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portId, port })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
    }
  },

  async forceRestartCommand(portId: string, port: number, commandPath: string): Promise<void> {
    if (isTauri()) {
      return invoke('force_restart_command', { portId, port, commandPath });
    } else {
      const response = await fetch('/api/force-restart-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portId, port, commandPath })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
    }
  },

  async openBuildFolder(): Promise<void> {
    if (isTauri()) {
      await invoke('open_build_folder');
    } else {
      const response = await fetch('/api/open-build-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
    }
  },

  async importPorts(filePath: string): Promise<PortInfo[]> {
    if (isTauri()) {
      return invoke<PortInfo[]>('import_ports_from_file', { filePath });
    } else {
      throw new Error('파일 불러오기는 Tauri 앱에서만 사용 가능합니다');
    }
  },

  async openFolder(folderPath: string): Promise<void> {
    if (isTauri()) {
      return invoke('open_folder', { folderPath });
    } else {
      const response = await fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
    }
  },

  async installAppToApplications(): Promise<string> {
    if (isTauri()) {
      return invoke<string>('install_app_to_applications');
    } else {
      const response = await fetch('/api/install-app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.message;
    }
  },

  async buildApp(buildType: string): Promise<string> {
    if (isTauri()) {
      return invoke<string>('build_app', { buildType });
    } else {
      const response = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: buildType })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.message;
    }
  },

  async buildDmg(): Promise<string> {
    if (isTauri()) {
      return invoke<string>('build_app', { buildType: 'dmg' });
    } else {
      const response = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'dmg' })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.message;
    }
  },

  async openInChrome(url: string): Promise<void> {
    if (isTauri()) {
      return invoke('open_in_chrome', { url });
    }
    // 웹 환경에서는 아무것도 하지 않음 (a 태그로 처리)
  },

  async exportDmg(): Promise<string> {
    if (isTauri()) {
      return invoke<string>('export_dmg');
    } else {
      const response = await fetch('/api/export-dmg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.message;
    }
  },

  async listGitWorktrees(folderPath: string): Promise<WorktreeInfo[]> {
    if (isTauri()) {
      return invoke<WorktreeInfo[]>('list_git_worktrees', { folderPath });
    } else {
      const res = await fetch('/api/list-git-worktrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath }),
      });
      const data = await res.json();
      return data.worktrees ?? [];
    }
  },

  async checkPortStatus(port: number): Promise<boolean> {
    if (isTauri()) {
      return invoke<boolean>('check_port_status', { port });
    } else {
      const response = await fetch('/api/check-port-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.isRunning;
    }
  },

  async openLog(portId: string): Promise<void> {
    if (isTauri()) {
      return invoke('open_log', { portId });
    } else {
      throw new Error('로그 보기는 Tauri 앱에서만 사용 가능합니다');
    }
  },

  async openTmuxClaude(sessionName: string, folderPath?: string, worktreePath?: string): Promise<string> {
    if (isTauri()) {
      return invoke<string>('open_tmux_claude', { sessionName, folderPath: folderPath ?? null, worktreePath: worktreePath ?? null });
    } else {
      const response = await fetch('/api/open-tmux-claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionName, folderPath: folderPath ?? null, worktreePath: worktreePath ?? null })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.message;
    }
  },

  async openTmuxClaudeFresh(sessionName: string, folderPath?: string, worktreePath?: string): Promise<string> {
    if (isTauri()) {
      return invoke<string>('open_tmux_claude_fresh', { sessionName, folderPath: folderPath ?? null, worktreePath: worktreePath ?? null });
    } else {
      const response = await fetch('/api/open-tmux-claude-fresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionName, folderPath: folderPath ?? null, worktreePath: worktreePath ?? null })
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      return data.message;
    }
  },

  async openTmuxClaudeBypass(sessionName: string, folderPath?: string, worktreePath?: string): Promise<string> {
    if (isTauri()) {
      return invoke<string>('open_tmux_claude_bypass', { sessionName, folderPath: folderPath ?? null, worktreePath: worktreePath ?? null });
    } else {
      const response = await fetch('/api/open-tmux-claude-bypass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionName, folderPath: folderPath ?? null, worktreePath: worktreePath ?? null })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.message;
    }
  },

  async openTerminalClaudeBypass(folderPath?: string, name?: string, worktreePath?: string): Promise<string> {
    if (isTauri()) {
      return invoke<string>('open_terminal_claude_bypass', { folderPath: folderPath ?? null, name: name ?? null, worktreePath: worktreePath ?? null });
    } else {
      const response = await fetch('/api/open-terminal-claude-bypass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: folderPath ?? null, name: name ?? null, worktreePath: worktreePath ?? null })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.message;
    }
  },

  async openTerminalClaude(folderPath?: string, name?: string, worktreePath?: string): Promise<string> {
    if (isTauri()) {
      return invoke<string>('open_terminal_claude', { folderPath: folderPath ?? null, name: name ?? null, worktreePath: worktreePath ?? null });
    } else {
      const response = await fetch('/api/open-terminal-claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: folderPath ?? null, name: name ?? null, worktreePath: worktreePath ?? null })
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      return result.message;
    }
  },

  async createFolder(folderPath: string): Promise<{ success: boolean; path: string }> {
    if (isTauri()) {
      try {
        const path = await invoke<string>('create_folder', { folderPath });
        return { success: true, path };
      } catch (e: any) {
        return { success: false, path: '', error: e.message || String(e) } as any;
      }
    }
    const response = await fetch('/api/create-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath })
    });
    return response.json();
  },

  async detectPort(filePath: string): Promise<{ port?: number; folderPath?: string }> {
    if (isTauri()) {
      return invoke<{ port?: number; folderPath?: string }>('detect_port', { filePath });
    } else {
      const res = await fetch('/api/detect-port', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath }),
      });
      return res.json();
    }
  },

  async scanCommandFiles(folderPath: string): Promise<string[]> {
    if (isTauri()) {
      return invoke<string[]>('scan_command_files', { folderPath });
    } else {
      const res = await fetch('/api/scan-command-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath }),
      });
      const data = await res.json();
      return data.files || [];
    }
  },

  async openAppDataDir(): Promise<void> {
    if (isTauri()) {
      await invoke('open_app_data_dir');
    } else {
      await fetch('/api/open-app-data-dir', { method: 'POST' });
    }
  },

  async loadWorkspaceRoots(): Promise<WorkspaceRoot[]> {
    if (isTauri()) {
      const val = await invoke<WorkspaceRoot[]>('load_workspace_roots');
      return Array.isArray(val) ? val : [];
    } else {
      const res = await fetch('/api/workspace-roots');
      if (!res.ok) return [];
      return res.json();
    }
  },

  async saveWorkspaceRoots(roots: WorkspaceRoot[]): Promise<void> {
    if (isTauri()) {
      await invoke('save_workspace_roots', { roots });
    } else {
      await fetch('/api/workspace-roots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roots),
      });
    }
  },
};

const CLAUDE_AI_NAME_PROMPT = `포트관리기의 프로젝트 목록에 "AI 추천 이름(aiName)"을 채워줘.

## 대상 파일
~/Library/Application Support/com.portmanager.portmanager/ports.json

## 절차

1. **백업 먼저**: 쓰기 전에 반드시 백업 생성 (코드 한 줄로 충분).
   \`cp "$HOME/Library/Application Support/com.portmanager.portmanager/ports.json" "$HOME/Library/Application Support/com.portmanager.portmanager/ports.json.bak"\`

2. **읽기**: JSON을 파싱해서 배열을 메모리에 로드.

3. **각 항목에 aiName 설정**:
   - 이미 \`aiName\`이 있으면 건드리지 말 것 (idempotent — 재실행해도 기존 별칭 유지)
   - \`aiName\`이 없는 항목에만 새 별칭 생성
   - 참고 필드: name, folderPath(basename), description, githubUrl, deployUrl, commandPath, terminalCommand

4. **별칭 규칙**:
   - 2~4 단어의 짧은 영어 (공백 구분, 예: "port manager", "tax calculator", "link page generator")
   - 프로젝트의 핵심 기능을 드러내는 키워드
   - 한국어 프로젝트는 의미를 영어로 번역
   - 이미 영어 이름이면 더 검색 친화적인 키워드 한 개로 압축
   - 모두 소문자

5. **필드 보존 규칙 (매우 중요)**:
   - 다음 필드는 **원본 값 그대로 유지**해야 함 — 존재한다면 삭제/수정 금지:
     id, name, port, commandPath, terminalCommand, folderPath, deployUrl, githubUrl, worktreePath, category, description, isRunning
   - \`worktreePath: null\` 같은 명시적 null 값도 그대로 유지 (삭제 금지)
   - \`isRunning: false\` 같은 boolean도 그대로 유지
   - 원래 없던 필드를 새로 추가하지 말 것 (aiName 제외)

6. **원자적 쓰기 (atomic write)**:
   - 임시 파일에 먼저 쓴 후 rename으로 교체 (중간 인터럽트 시 원본 손상 방지)
   - 예시 절차:
     a. \`ports.json.tmp\`에 전체 JSON 직렬화 (2-space indent)
     b. fs.rename(\`ports.json.tmp\`, \`ports.json\`)
   - 들여쓰기는 원본과 동일하게 2-space

7. **검증**:
   - 쓰기 후 다시 읽어서 파싱 가능한지 확인
   - 항목 수가 원본과 동일한지 확인
   - 파싱 실패 시 백업(\`.bak\`)에서 복원

8. **보고**: 완료 후 한 줄로 "N개 항목에 aiName 추가, M개 기존 유지, 총 K개 검증 완료" 형식으로 보고.

완료되면 포트관리기에서 "새로고침" 버튼을 누르면 별칭이 에메랄드 배지로 표시되고 검색에서 매칭됩니다.`;

interface PortInfo {
  id: string;
  name: string;
  port?: number;
  commandPath?: string;
  terminalCommand?: string;
  folderPath?: string;
  deployUrl?: string;
  githubUrl?: string;
  worktreePath?: string;
  category?: string;
  description?: string;
  aiName?: string;  // AI-generated English alias for search
  isRunning?: boolean;
}

interface WorktreeInfo {
  path: string;
  branch?: string;
  is_main: boolean;
}

type SortType = 'name' | 'port' | 'recent';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface WorkspaceRoot {
  id: string;
  name: string;
  path: string; // absolute path (Tauri) or directory name (Web)
}

// IndexedDB helpers for FileSystemDirectoryHandle persistence (web only)
const openIDB = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const req = indexedDB.open('portmanager-workspace', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('handles');
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const idbSaveHandle = async (id: string, handle: FileSystemDirectoryHandle) => {
  const db = await openIDB();
  const tx = db.transaction('handles', 'readwrite');
  (tx.objectStore('handles') as IDBObjectStore).put(handle, id);
  return new Promise<void>(r => { tx.oncomplete = () => { db.close(); r(); }; });
};

const idbLoadHandle = async (id: string): Promise<FileSystemDirectoryHandle | null> => {
  const db = await openIDB();
  const tx = db.transaction('handles', 'readonly');
  const req = (tx.objectStore('handles') as IDBObjectStore).get(id);
  return new Promise(r => {
    req.onsuccess = () => { db.close(); r((req.result as FileSystemDirectoryHandle) ?? null); };
    req.onerror = () => { db.close(); r(null); };
  });
};

const idbDeleteHandle = async (id: string) => {
  const db = await openIDB();
  const tx = db.transaction('handles', 'readwrite');
  (tx.objectStore('handles') as IDBObjectStore).delete(id);
  return new Promise<void>(r => { tx.oncomplete = () => { db.close(); r(); }; });
};

const getSessionName = (item: PortInfo): string => {
  if (item.folderPath) {
    const parts = item.folderPath.replace(/\/$/, '').split('/');
    return parts[parts.length - 1] || item.name;
  }
  return item.name.replace(/\s+/g, '-');
};

/** Race a promise against a timeout. Rejects with Error if ms elapses first. */
const withTimeout = <T,>(promise: PromiseLike<T>, ms: number): Promise<T> =>
  Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);

/**
 * Model B merge: remote wins for known IDs, local-only rows survive.
 * isRunning is preserved from the local copy.
 */
const mergePorts = (local: PortInfo[], remote: PortInfo[]): PortInfo[] => {
  const remoteById = new Map(remote.map(p => [p.id, p]));
  const merged = local.map(p => {
    const r = remoteById.get(p.id);
    if (!r) return p;
    // Remote wins for all synced fields, EXCEPT:
    //   - isRunning: always local (live process state)
    //   - aiName: local wins if remote has none (Supabase `ports` table
    //     lacks an ai_name column, so remote always carries undefined;
    //     this preserves the device-local AI alias across Pull)
    return { ...p, ...r, isRunning: p.isRunning, aiName: r.aiName ?? p.aiName };
  });
  const localIds = new Set(local.map(p => p.id));
  const newFromRemote = remote.filter(p => !localIds.has(p.id));
  return [...merged, ...newFromRemote];
};

// Supabase client cache — one instance per credential pair (Fix P2b)
const _supabaseCache = new Map<string, ReturnType<typeof createClient>>();
const getSupabaseClient = (url: string, key: string): ReturnType<typeof createClient> => {
  const cacheKey = `${url}::${key}`;
  if (!_supabaseCache.has(cacheKey)) {
    _supabaseCache.set(cacheKey, createClient(url, key));
  }
  return _supabaseCache.get(cacheKey)!;
};

function App() {
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasInitiallyLoaded = useRef(false);
  const hasWorkspaceRootsLoaded = useRef(false);
  const skipNextSave = useRef(false); // 서버 리로드(focus 등)로 인한 불필요한 덮어쓰기 방지
  const [name, setName] = useState('');
  const [port, setPort] = useState('');
  const [commandPath, setCommandPath] = useState('');
  const [terminalCommand, setTerminalCommand] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [deployUrl, setDeployUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [worktreePath, setWorktreePath] = useState('');
  const [activeTab, setActiveTab] = useState<'ports' | 'portal'>('ports');
  const [sortBy, setSortBy] = useState<SortType>(
    () => (localStorage.getItem('portmanager-sortBy') as SortType) || 'recent'
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(
    () => (localStorage.getItem('portmanager-sortOrder') as 'asc' | 'desc') || 'desc'
  );
  const [filterType, setFilterType] = useState<'all' | 'with-port' | 'without-port'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [bypassPermissions, setBypassPermissions] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPort, setEditPort] = useState('');
  const [editCommandPath, setEditCommandPath] = useState('');
  const [editTerminalCommand, setEditTerminalCommand] = useState('');
  const [editFolderPath, setEditFolderPath] = useState('');
  const [editDeployUrl, setEditDeployUrl] = useState('');
  const [editGithubUrl, setEditGithubUrl] = useState('');
  const [editWorktreePath, setEditWorktreePath] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [claudeStatus, setClaudeStatus] = useState<{ installed: boolean; authenticated: boolean; email?: string } | null>(null);
  const [worktreePickerState, setWorktreePickerState] = useState<{ item: PortInfo; mode: 'tmux' | 'claude' } | null>(null);
  const [worktreePickerValue, setWorktreePickerValue] = useState('');
  const [detectedWorktrees, setDetectedWorktrees] = useState<WorktreeInfo[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isPushingPorts, setIsPushingPorts] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [showBuildLog, setShowBuildLog] = useState(false);
  const [buildLogs, setBuildLogs] = useState<string[]>([]);
  const [buildType, setBuildType] = useState<'app' | 'dmg' | 'windows'>('app');
  const lastLogIndexRef = useRef<number>(0);
  const [workspaceRoots, setWorkspaceRoots] = useState<WorkspaceRoot[]>([]);
  const dirHandlesRef = useRef<Map<string, FileSystemDirectoryHandle>>(new Map());
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [activeRootId, setActiveRootId] = useState<string | null>(null);
  const [registerAsProject, setRegisterAsProject] = useState(true);
  const portalConfigRef = useRef<any>(null);
  const autoPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fix P2g: gate delete pass — only safe to delete remote rows after a successful auto-pull
  // (otherwise local state has only this Mac's rows and would delete other Macs' remote data)
  const autopullSucceeded = useRef(false);

  // Claude Code auth status polling (web mode: fetch API, Tauri mode: invoke)
  const fetchClaudeStatus = useCallback(async () => {
    try {
      if (isTauri()) {
        const status = await invoke<{ installed: boolean; authenticated: boolean; email?: string }>('check_claude_status');
        setClaudeStatus(status);
      } else {
        const res = await fetch('/api/claude-status');
        if (res.ok) setClaudeStatus(await res.json());
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchClaudeStatus();
    const timer = setInterval(fetchClaudeStatus, 30_000);
    return () => clearInterval(timer);
  }, [fetchClaudeStatus]);

  // 토스트 배너 표시 함수
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);

    // 3초 후 자동으로 제거
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 3000);
  };

  // Claude 로그아웃
  const handleClaudeLogout = useCallback(async () => {
    try {
      if (isTauri()) {
        await invoke('claude_auth_logout');
      } else {
        await fetch('/api/claude-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
      }
      showToast('Claude 로그아웃 완료', 'success');
      setTimeout(fetchClaudeStatus, 500);
    } catch (e) {
      showToast('로그아웃 실패: ' + e, 'error');
    }
  }, [fetchClaudeStatus]);

  // AI 이름 자동 생성 — 모든 포트를 한 번의 claude -p 호출로 처리 (batch)
  const handleGenerateAiNames = useCallback(async () => {
    const targets = ports.filter(p => p.folderPath && !p.aiName);
    if (targets.length === 0) {
      showToast('모든 포트에 AI 이름이 있습니다', 'success');
      return;
    }
    showToast(`AI 이름 생성 중... (${targets.length}개, 잠시 대기)`, 'success');

    try {
      let nameMap: Record<string, string> = {};

      if (isTauri()) {
        // 1번의 claude -p 호출로 모든 포트 처리
        const batchInput = targets.map(p => ({ id: p.id, folderPath: p.folderPath }));
        const result = await invoke<Record<string, string>>('suggest_names_batch', { ports: batchInput });
        nameMap = result ?? {};
      } else {
        // web 모드: 순차 호출 유지
        for (const p of targets) {
          try {
            const res = await fetch('http://localhost:3001/api/suggest-name', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ folderPath: p.folderPath }),
            });
            const data = await res.json();
            if (data.suggestions?.[0]) nameMap[p.id] = data.suggestions[0];
          } catch (e) {
            showToast(`❌ ${p.name} 실패: ${e}`, 'error');
          }
        }
      }

      const updated = ports.map(p =>
        nameMap[p.id] ? { ...p, aiName: nameMap[p.id] } : p
      );
      setPorts(updated);

      try {
        if (isTauri()) {
          await invoke('save_ports', { ports: updated });
        } else {
          await fetch('/api/ports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
        }
      } catch (e) {
        showToast(`저장 실패: ${e}`, 'error');
      }

      const count = Object.keys(nameMap).length;
      showToast(`AI 이름 업데이트 완료 (${count}/${targets.length}개 성공)`, 'success');
    } catch (e) {
      showToast(`❌ AI 이름 생성 실패: ${e}`, 'error');
    }
  }, [ports]);

  const openTmuxClaude = (item: PortInfo) => {
    setWorktreePickerState({ item, mode: 'tmux' });
    setWorktreePickerValue(item.worktreePath ?? '');
    setDetectedWorktrees([]);
    if (item.folderPath) {
      API.listGitWorktrees(item.folderPath)
        .then(list => setDetectedWorktrees(list))
        .catch(() => {});
    }
  };

  const openTmuxClaudeFresh = async (item: PortInfo) => {
    const sessionName = getSessionName(item);
    try {
      if (bypassPermissions) {
        await API.openTmuxClaudeBypass(sessionName, item.folderPath, item.worktreePath);
        showToast(`tmux 새 세션 시작 (↺ ⚡ bypass)`, 'success');
      } else {
        await API.openTmuxClaudeFresh(sessionName, item.folderPath, item.worktreePath);
        showToast(`tmux 새 세션 시작 (기록 초기화) ↺`, 'success');
      }
    } catch (e) {
      showToast(`tmux 새 세션 실패: ${e}`, 'error');
    }
  };

  const _executeTmuxClaude = async (item: PortInfo, worktreePath: string | undefined) => {
    const sessionName = getSessionName(item);
    try {
      if (bypassPermissions) {
        await API.openTmuxClaudeBypass(sessionName, item.folderPath, worktreePath);
        showToast(`tmux + Claude (bypass) 실행 중 (세션: ${sessionName}-bypass)`, 'success');
      } else {
        await API.openTmuxClaude(sessionName, item.folderPath, worktreePath);
        showToast(`tmux + Claude 실행 중 (세션: ${sessionName})`, 'success');
      }
    } catch (e) {
      showToast(`tmux 실행 실패: ${e}`, 'error');
    }
  };

  const openTerminalClaude = (item: PortInfo) => {
    setWorktreePickerState({ item, mode: 'claude' });
    setWorktreePickerValue(item.worktreePath ?? '');
    setDetectedWorktrees([]);
    if (item.folderPath) {
      API.listGitWorktrees(item.folderPath)
        .then(list => setDetectedWorktrees(list))
        .catch(() => {});
    }
  };

  const _executeTerminalClaude = async (item: PortInfo, worktreePath: string | undefined) => {
    try {
      if (bypassPermissions) {
        await API.openTerminalClaudeBypass(item.folderPath, item.name, worktreePath);
        showToast(`Terminal에서 Claude (bypass) 실행 중`, 'success');
      } else {
        await API.openTerminalClaude(item.folderPath, item.name, worktreePath);
        showToast(`Terminal에서 Claude 실행 중`, 'success');
      }
    } catch (e) {
      showToast(`Claude 실행 실패: ${e}`, 'error');
    }
  };

  const executeWithWorktree = async (worktreePath: string | undefined) => {
    if (!worktreePickerState) return;
    const { item, mode } = worktreePickerState;

    // save the entered path back to the item (for pre-fill next time)
    if (worktreePath !== undefined) {
      setPorts(prev => prev.map(p => p.id === item.id ? { ...p, worktreePath: worktreePath || undefined } : p));
    }

    setWorktreePickerState(null);
    setDetectedWorktrees([]);

    const updatedItem = { ...item, worktreePath };
    if (mode === 'tmux') {
      await _executeTmuxClaude(updatedItem, worktreePath);
    } else {
      await _executeTerminalClaude(updatedItem, worktreePath);
    }
  };

  // 초기 데이터 로드
  useEffect(() => {
    const loadPortsData = async () => {
      try {
        // 재시도 로직: API 서버가 아직 준비되지 않은 경우 최대 3회 재시도
        let data: PortInfo[] | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            if (attempt > 0) {
              await new Promise(r => setTimeout(r, 800 * attempt));
              console.log(`[App] Retrying port load (${attempt}/2)...`);
            }
            data = await API.loadPorts();
            break;
          } catch (err) {
            console.warn(`[App] Load attempt ${attempt + 1} failed:`, err);
            if (attempt === 2) throw err;
          }
        }
        if (!data) throw new Error('No data after retries');

        // commandPath가 있는데 folderPath가 없는 경우 자동으로 추출
        const updatedData = data.map((port: PortInfo) => {
          if (port.commandPath && !port.folderPath) {
            const lastSlashIndex = port.commandPath.lastIndexOf('/');
            if (lastSlashIndex !== -1) {
              return {
                ...port,
                folderPath: port.commandPath.substring(0, lastSlashIndex)
              };
            }
          }
          return port;
        });

        setPorts(updatedData);
        // NOTE: hasInitiallyLoaded is set AFTER auto-pull completes (Fix P2c)
        // Setting it here would let the 3s auto-push debounce fire on stale data.

        // 포털 설정 로드 및 캐시 (자동 push/pull에서 재사용)
        try {
          let portalData: any;
          if (isTauri()) {
            portalData = await invoke('load_portal');
          } else {
            const res = await fetch('/api/portal');
            if (res.ok) portalData = await res.json();
          }
          portalConfigRef.current = portalData ?? null;

          // Supabase 자동 Pull (10s timeout, Model B merge)
          if (portalData?.supabaseUrl && portalData?.supabaseAnonKey) {
            try {
              const supabase = getSupabaseClient(portalData.supabaseUrl, portalData.supabaseAnonKey);
              const { data: remoteData, error } = await withTimeout(
                supabase.from('ports').select('*'),
                10_000
              );
              if (!error && remoteData && remoteData.length > 0) {
                const remoteRows: PortInfo[] = remoteData.map((row: any) => ({
                  id: row.id,
                  name: row.name,
                  port: row.port ?? undefined,
                  commandPath: row.command_path ?? undefined,
                  terminalCommand: row.terminal_command ?? undefined,
                  folderPath: row.folder_path ?? undefined,
                  deployUrl: row.deploy_url ?? undefined,
                  githubUrl: row.github_url ?? undefined,
                  category: row.category ?? undefined,
                  description: row.description ?? undefined,
                  aiName: row.ai_name ?? undefined,
                  isRunning: false,
                }));
                const merged = mergePorts(updatedData, remoteRows);
                setPorts(merged);
                await API.savePorts(merged);
              }

              hasInitiallyLoaded.current = true; // Fix P2c: set after pull completes
              autopullSucceeded.current = true;  // Fix P2g: mark pull succeeded → delete pass is now safe

              // workspace_roots 자동 Pull (빈 결과면 로컬 덮어쓰기 방지)
              const deviceId = portalData.deviceId;
              if (deviceId) {
                const { data: rootData } = await supabase
                  .from('workspace_roots').select('*').eq('device_id', deviceId);
                if (rootData && rootData.length > 0) {
                  const restoredRoots: WorkspaceRoot[] = rootData.map((r: any) => ({
                    id: r.id, name: r.name, path: r.path,
                  }));
                  setWorkspaceRoots(restoredRoots);
                  await API.saveWorkspaceRoots(restoredRoots);
                }
                // guard: rootData.length === 0 → skip, keep local roots intact
              }
            } catch (pullErr) {
              console.warn('[App] Auto-pull Supabase failed:', pullErr);
              showToast('Supabase 자동 동기화 실패 (네트워크 확인)', 'error');
              hasInitiallyLoaded.current = true; // Fix P2c: still enable auto-push on pull failure
            }
          }
        } catch (portalErr) {
          console.warn('[App] Failed to load portal config:', portalErr);
          hasInitiallyLoaded.current = true; // Fix P2c: still enable auto-push if portal load fails
        }

        // 앱 시작 시 포트 상태 자동 확인 (병렬)
        const withPorts = updatedData.filter((p: PortInfo) => p.port);
        if (withPorts.length > 0) {
          const statusChecks = withPorts.map(async (port: PortInfo) => {
            try {
              const isRunning = await API.checkPortStatus(port.port!);
              return { id: port.id, isRunning };
            } catch {
              return { id: port.id, isRunning: false };
            }
          });
          const results = await Promise.all(statusChecks);
          setPorts(prev =>
            prev.map(p => {
              const result = results.find(r => r.id === p.id);
              return result ? { ...p, isRunning: result.isRunning } : p;
            })
          );
        }
      } catch (error) {
        console.error('[App] Failed to load ports after all retries:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadPortsData();
  }, []);

  // 작업 루트 초기 로드
  useEffect(() => {
    API.loadWorkspaceRoots().then(data => {
      if (data.length > 0) setWorkspaceRoots(data);
      hasWorkspaceRootsLoaded.current = true;
    }).catch(e => {
      console.error('[App] Failed to load workspace roots:', e);
      hasWorkspaceRootsLoaded.current = true;
    });
  }, []);

  // 작업 루트 변경 시 저장 (초기 로드 완료 후에만)
  useEffect(() => {
    if (!hasWorkspaceRootsLoaded.current) return;
    API.saveWorkspaceRoots(workspaceRoots).catch(e =>
      console.error('[App] Failed to save workspace roots:', e)
    );
  }, [workspaceRoots]);

  // 정렬 설정 localStorage 저장
  useEffect(() => { localStorage.setItem('portmanager-sortBy', sortBy); }, [sortBy]);
  useEffect(() => { localStorage.setItem('portmanager-sortOrder', sortOrder); }, [sortOrder]);

  // Cmd+F: 검색 포커스 / Esc: 검색 초기화
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearchQuery('');
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 자동 Push: 포트 목록 변경 후 3초 debounce (Supabase 설정된 경우만)
  useEffect(() => {
    if (!hasInitiallyLoaded.current) return;
    const config = portalConfigRef.current;
    if (!config?.supabaseUrl || !config?.supabaseAnonKey) return;

    if (autoPushTimerRef.current) clearTimeout(autoPushTimerRef.current);
    autoPushTimerRef.current = setTimeout(async () => {
      const cfg = portalConfigRef.current;
      if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey) return;
      try {
        const supabase = getSupabaseClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
        const rows = ports.map(p => ({
          id: p.id,
          name: p.name,
          port: p.port ?? null,
          command_path: p.commandPath ?? null,
          terminal_command: p.terminalCommand ?? null,
          folder_path: p.folderPath ?? null,
          deploy_url: p.deployUrl ?? null,
          github_url: p.githubUrl ?? null,
          category: p.category ?? null,
          description: p.description ?? null,
          ai_name: p.aiName ?? null,
        }));
        await supabase.from('ports').upsert(rows, { onConflict: 'id' });
        // Fix P2: delete remote rows whose IDs are no longer in local list
        // Fix P2g: skip delete pass if auto-pull never succeeded — local state may be incomplete
        if (autopullSucceeded.current) {
          const localIds = ports.map(p => p.id);
          const { data: remoteRows } = await supabase.from('ports').select('id');
          const staleIds = (remoteRows ?? []).map((r: any) => r.id).filter((id: string) => !localIds.includes(id));
          if (staleIds.length > 0) {
            await supabase.from('ports').delete().in('id', staleIds);
          }
        }
      } catch (e) {
        console.warn('[App] Auto-push failed:', e);
      }
    }, 3000);

    return () => {
      if (autoPushTimerRef.current) clearTimeout(autoPushTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ports]);

  // 포트 목록이 변경될 때마다 파일에 저장 (초기 로드 완료 후에만)
  useEffect(() => {
    if (!isLoading && hasInitiallyLoaded.current) {
      // 서버에서 리로드된 데이터는 저장 안 함 (빈 데이터 덮어쓰기 방지)
      if (skipNextSave.current) {
        skipNextSave.current = false;
        return;
      }
      console.log('[App] Saving ports, count:', ports.length);
      const savePortsData = async () => {
        try {
          await API.savePorts(ports);
          console.log('[App] Ports saved successfully');
        } catch (error) {
          console.error('[App] Failed to save ports:', error);
        }
      };
      savePortsData();
    }
  }, [ports, isLoading]);

  // 웹 브라우저: 창 포커스 시 데이터 다시 로드 (앱과의 동기화)
  useEffect(() => {
    if (isTauri()) return; // Tauri 앱은 메모리 상태를 직접 관리

    const handleFocus = async () => {
      console.log('[App] Window focused, reloading ports data...');
      try {
        const data = await API.loadPorts();
        skipNextSave.current = true; // 서버에서 읽어온 데이터는 다시 저장하지 않음
        setPorts(data);
        // 초기 로드가 실패했을 경우에도 포커스 복구 시 정상 처리
        if (!hasInitiallyLoaded.current) {
          hasInitiallyLoaded.current = true;
        }
      } catch (error) {
        console.error('[App] Failed to reload ports on focus:', error);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const addPort = () => {
    if (name) {
      // commandPath가 있으면 자동으로 폴더 경로 추출
      let autoFolderPath = folderPath;
      if (commandPath && !folderPath) {
        // .command 파일의 디렉토리 경로 추출
        const lastSlashIndex = commandPath.lastIndexOf('/');
        if (lastSlashIndex !== -1) {
          autoFolderPath = commandPath.substring(0, lastSlashIndex);
        }
      }

      const newPort: PortInfo = {
        id: Date.now().toString(),
        name,
        port: port ? parseInt(port) : undefined,
        commandPath: commandPath || undefined,
        terminalCommand: terminalCommand || undefined,
        folderPath: autoFolderPath || undefined,
        deployUrl: deployUrl || undefined,
        githubUrl: githubUrl || undefined,
        worktreePath: worktreePath || undefined,
        category: category || undefined,
        description: description || undefined,
        isRunning: false,
      };
      setPorts([...ports, newPort]);
      setName('');
      setPort('');
      setCommandPath('');
      setTerminalCommand('');
      setFolderPath('');
      setDeployUrl('');
      setGithubUrl('');
      setWorktreePath('');
      setCategory('');
      setDescription('');
    }
  };

  const deletePort = (id: string) => {
    setPorts(ports.filter(p => p.id !== id));
  };

  const startEdit = (item: PortInfo) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditPort(item.port?.toString() ?? '');
    setEditCommandPath(item.commandPath || '');
    setEditTerminalCommand(item.terminalCommand || '');
    setEditFolderPath(item.folderPath || '');
    setEditDeployUrl(item.deployUrl || '');
    setEditGithubUrl(item.githubUrl || '');
    setEditWorktreePath(item.worktreePath || '');
    setEditCategory(item.category || '');
    setEditDescription(item.description || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditPort('');
    setEditCommandPath('');
    setEditTerminalCommand('');
    setEditFolderPath('');
    setEditDeployUrl('');
    setEditGithubUrl('');
    setEditWorktreePath('');
    setEditCategory('');
    setEditDescription('');
  };

  const saveEdit = () => {
    if (editingId && editName) {
      // commandPath가 있으면 자동으로 폴더 경로 추출
      let autoFolderPath = editFolderPath;
      if (editCommandPath && !editFolderPath) {
        const lastSlashIndex = editCommandPath.lastIndexOf('/');
        if (lastSlashIndex !== -1) {
          autoFolderPath = editCommandPath.substring(0, lastSlashIndex);
        }
      }

      setPorts(ports.map(p =>
        p.id === editingId
          ? { ...p, name: editName, port: editPort ? parseInt(editPort) : undefined, commandPath: editCommandPath || undefined, terminalCommand: editTerminalCommand || undefined, folderPath: autoFolderPath || undefined, deployUrl: editDeployUrl || undefined, githubUrl: editGithubUrl || undefined, worktreePath: editWorktreePath || undefined, category: editCategory || undefined, description: editDescription || undefined }
          : p
      ));
      cancelEdit();
    }
  };

  const executeCommand = async (item: PortInfo) => {
    const runTarget = item.terminalCommand || item.commandPath;
    if (!runTarget) {
      showToast('실행할 파일 또는 터미널 명령어가 등록되지 않았습니다.', 'error');
      return;
    }

    const html = !item.terminalCommand && isHtmlFile(item.commandPath);
    try {
      if (html) {
        // HTML 파일은 open_folder 커맨드(open <path>) 재활용 — 기본 브라우저로 열림
        await API.openFolder(item.commandPath);
        showToast(`${item.name} 파일을 열었습니다!`, 'success');
      } else {
        await API.executeCommand(item.id, runTarget);
        setPorts(ports.map(p =>
          p.id === item.id ? { ...p, isRunning: true } : p
        ));
        showToast(`${item.name} 서버가 시작되었습니다!`, 'success');
        if (item.port && isTauri()) {
          try { await API.openInChrome(`http://localhost:${item.port}`); } catch {}
        }
      }
    } catch (error) {
      showToast('실행 실패: ' + error, 'error');
    }
  };

  const stopCommand = async (item: PortInfo) => {
    try {
      await API.stopCommand(item.id, item.port ?? 0);

      setPorts(ports.map(p =>
        p.id === item.id ? { ...p, isRunning: false } : p
      ));
      showToast(`${item.name} 서버가 중지되었습니다!`, 'success');
    } catch (error) {
      showToast('서버 중지 중 오류: ' + error, 'error');
    }
  };

  const forceRestartCommand = async (item: PortInfo) => {
    const runTarget = item.terminalCommand || item.commandPath;
    if (!runTarget) {
      showToast('실행할 파일 또는 터미널 명령어가 등록되지 않았습니다.', 'error');
      return;
    }

    const html = !item.terminalCommand && isHtmlFile(item.commandPath);
    try {
      if (html) {
        await API.openFolder(item.commandPath);
        showToast(`${item.name} 파일을 열었습니다!`, 'success');
      } else {
        await API.forceRestartCommand(item.id, item.port ?? 0, runTarget);
        setPorts(ports.map(p =>
          p.id === item.id ? { ...p, isRunning: true } : p
        ));
        showToast(`${item.name} 서버가 강제 재실행되었습니다!`, 'success');
      }
    } catch (error) {
      showToast('강제 재실행 실패: ' + error, 'error');
    }
  };

  const handleExportPorts = async () => {
    if (ports.length === 0) {
      showToast('내보낼 포트 정보가 없습니다.', 'error');
      return;
    }

    try {
      if (isTauri()) {
        // Tauri 앱에서는 파일 저장 다이얼로그 사용
        const { save } = await import('@tauri-apps/plugin-dialog');
        const filePath = await save({
          defaultPath: 'ports.json',
          filters: [{
            name: 'JSON',
            extensions: ['json']
          }]
        });

        if (filePath) {
          const content = JSON.stringify(ports, null, 2);
          const { writeTextFile } = await import('@tauri-apps/plugin-fs');
          await writeTextFile(filePath, content);
          showToast('포트 정보를 성공적으로 내보냈습니다.', 'success');
        }
      } else {
        // 브라우저에서는 파일 다운로드
        const content = JSON.stringify(ports, null, 2);
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ports.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('포트 정보를 성공적으로 내보냈습니다.', 'success');
      }
    } catch (error) {
      showToast('파일 내보내기 실패: ' + error, 'error');
    }
  };

  const handleImportPorts = async () => {
    try {
      if (isTauri()) {
        // Tauri: 네이티브 파일 다이얼로그 사용
        const { open } = await import('@tauri-apps/plugin-dialog');

        const selected = await open({
          multiple: false,
          filters: [{
            name: 'JSON',
            extensions: ['json']
          }]
        });

        if (selected && typeof selected === 'string') {
          // Rust의 import_ports_from_file를 사용하여 파일 읽기
          const importedPorts = await API.importPorts(selected);

          if (importedPorts.length > 0) {
            const existingIds = new Set(ports.map(p => p.id));
            const newPorts = importedPorts.filter(p => !existingIds.has(p.id));

            if (newPorts.length > 0) {
              const updatedPorts = [...ports, ...newPorts];
              setPorts(updatedPorts);

              // 명시적으로 저장
              console.log('[Import] Explicitly saving ports after import');
              await API.savePorts(updatedPorts);
              console.log('[Import] Ports saved successfully');

              showToast(`${newPorts.length}개의 포트 정보를 불러왔습니다.`, 'success');
            } else {
              showToast('새로운 포트 정보가 없습니다. (모두 이미 등록되어 있음)', 'error');
            }
          } else {
            showToast('불러온 파일에 포트 정보가 없습니다.', 'error');
          }
        }
      } else {
        // 브라우저: FileReader 사용
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
              try {
                const content = event.target?.result as string;
                const importedPorts = JSON.parse(content) as PortInfo[];

                if (importedPorts.length > 0) {
                  const existingIds = new Set(ports.map(p => p.id));
                  const newPorts = importedPorts.filter(p => !existingIds.has(p.id));

                  if (newPorts.length > 0) {
                    const updatedPorts = [...ports, ...newPorts];
                    setPorts(updatedPorts);

                    console.log('[Import] Explicitly saving ports after import');
                    await API.savePorts(updatedPorts);
                    console.log('[Import] Ports saved successfully');

                    showToast(`${newPorts.length}개의 포트 정보를 불러왔습니다.`, 'success');
                  } else {
                    showToast('새로운 포트 정보가 없습니다. (모두 이미 등록되어 있음)', 'error');
                  }
                } else {
                  showToast('불러온 파일에 포트 정보가 없습니다.', 'error');
                }
              } catch (error) {
                showToast('파일 읽기 실패: ' + error, 'error');
              }
            };
            reader.readAsText(file);
          }
        };
        input.click();
      }
    } catch (error) {
      showToast('파일 불러오기 실패: ' + error, 'error');
    }
  };

  const handleRestoreFromSupabase = async () => {
    if (isRestoring) return;
    setIsRestoring(true);
    try {
      // portal.json에서 Supabase 자격 증명 로드
      let portalData: any;
      if (isTauri()) {
        portalData = await invoke('load_portal');
      } else {
        const res = await fetch('/api/portal');
        if (!res.ok) throw new Error('portal.json 로드 실패');
        portalData = await res.json();
      }

      const { supabaseUrl, supabaseAnonKey } = portalData ?? {};
      if (!supabaseUrl || !supabaseAnonKey) {
        showToast('Supabase 설정이 없습니다. 포털 탭에서 먼저 설정하세요', 'error');
        return;
      }

      const supabase = getSupabaseClient(supabaseUrl, supabaseAnonKey);

      // 30s timeout — manual pull
      const { data, error } = await withTimeout(
        supabase.from('ports').select('*'),
        30_000
      );
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        showToast('Supabase에 저장된 포트가 없습니다', 'error');
        return;
      }

      // snake_case → camelCase 매핑
      const remoteRows: PortInfo[] = data.map((row: any) => ({
        id: row.id,
        name: row.name,
        port: row.port ?? undefined,
        commandPath: row.command_path ?? undefined,
        terminalCommand: row.terminal_command ?? undefined,
        folderPath: row.folder_path ?? undefined,
        deployUrl: row.deploy_url ?? undefined,
        githubUrl: row.github_url ?? undefined,
        category: row.category ?? undefined,
        description: row.description ?? undefined,
        aiName: row.ai_name ?? undefined,
        isRunning: false,
      }));

      // Model B merge: remote wins for known IDs, local-only rows survive
      const merged = mergePorts(ports, remoteRows);
      setPorts(merged);
      await API.savePorts(merged);

      // workspace_roots 복원 (Fix #7: disk에도 저장, 빈 결과면 덮어쓰기 방지)
      const deviceId = portalData.deviceId;
      let rootsMsg = '';
      if (deviceId) {
        const { data: rootData } = await supabase
          .from('workspace_roots').select('*').eq('device_id', deviceId);
        if (rootData && rootData.length > 0) {
          const restoredRoots: WorkspaceRoot[] = rootData.map((r: any) => ({
            id: r.id, name: r.name, path: r.path,
          }));
          setWorkspaceRoots(restoredRoots);
          await API.saveWorkspaceRoots(restoredRoots); // Fix #7
          rootsMsg = ` + ${restoredRoots.length}개 작업루트`;
        }
        // guard: rootData.length === 0 → skip, keep local roots intact
      }
      showToast(`Supabase에서 ${merged.length}개 포트${rootsMsg}를 복원했습니다 ✓`, 'success');
    } catch (e) {
      showToast('Supabase 복원 실패: ' + e, 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  const handlePushToSupabase = async () => {
    if (isPushingPorts) return;
    setIsPushingPorts(true);
    try {
      let portalData: any;
      if (isTauri()) {
        portalData = await invoke('load_portal');
      } else {
        const res = await fetch('/api/portal');
        if (!res.ok) throw new Error('portal.json 로드 실패');
        portalData = await res.json();
      }
      const { supabaseUrl, supabaseAnonKey } = portalData ?? {};
      if (!supabaseUrl || !supabaseAnonKey) {
        showToast('Supabase 설정이 없습니다. 포털 탭에서 먼저 설정하세요', 'error');
        return;
      }
      const deviceId = portalData.deviceId ?? null;
      const supabase = getSupabaseClient(supabaseUrl, supabaseAnonKey);
      const rows = ports.map(p => ({
        id: p.id,
        name: p.name,
        port: p.port ?? null,
        command_path: p.commandPath ?? null,
        terminal_command: p.terminalCommand ?? null,
        folder_path: p.folderPath ?? null,
        deploy_url: p.deployUrl ?? null,
        github_url: p.githubUrl ?? null,
        category: p.category ?? null,
        description: p.description ?? null,
        ai_name: p.aiName ?? null,
      }));
      const { error } = await supabase.from('ports').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      // Fix P2: delete remote rows whose IDs are no longer in local list
      // Fix P2g: skip delete pass if auto-pull never succeeded — pull first before deleting
      if (autopullSucceeded.current) {
        const localIds = ports.map(p => p.id);
        const { data: remoteRows } = await supabase.from('ports').select('id');
        const staleIds = (remoteRows ?? []).map((r: any) => r.id).filter((id: string) => !localIds.includes(id));
        if (staleIds.length > 0) {
          await supabase.from('ports').delete().in('id', staleIds);
        }
      }

      // workspace_roots 업로드
      let rootsMsg = '';
      if (deviceId && workspaceRoots.length > 0) {
        const rootRows = workspaceRoots.map(r => ({
          id: r.id,
          device_id: deviceId,
          name: r.name,
          path: r.path,
        }));
        const { error: rootError } = await supabase.from('workspace_roots').upsert(rootRows, { onConflict: 'id' });
        if (rootError) {
          rootsMsg = ` (작업루트 업로드 실패: ${rootError.message})`;
        } else {
          rootsMsg = ` + ${workspaceRoots.length}개 작업루트`;
        }
      }
      showToast(`Supabase에 ${ports.length}개 포트${rootsMsg}를 업로드했습니다 ✓`, 'success');
    } catch (e) {
      showToast('Supabase 업로드 실패: ' + e, 'error');
    } finally {
      setIsPushingPorts(false);
    }
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      const data = await API.loadPorts();

      // 경로 검증 및 자동 업데이트
      const updatedDataPromises = data.map(async (port: PortInfo) => {
        let updated = { ...port };

        // [1] commandPath 존재 확인 → 없으면 무효화 (아래에서 재스캔) - Tauri 모드만
        if (updated.commandPath && isTauri()) {
          try {
            const exists = await invoke<boolean>('check_file_exists', { path: updated.commandPath });
            if (!exists) {
              console.log(`[Refresh] commandPath not found, will re-scan: ${updated.commandPath}`);
              updated.commandPath = undefined;
            }
          } catch {}
        }

        // [2] folderPath 존재 확인 → 없으면 commandPath에서 재추출 시도 - Tauri 모드만
        if (updated.folderPath && isTauri()) {
          try {
            const exists = await invoke<boolean>('check_file_exists', { path: updated.folderPath });
            if (!exists) {
              if (updated.commandPath) {
                const idx = updated.commandPath.lastIndexOf('/');
                updated.folderPath = idx !== -1 ? updated.commandPath.substring(0, idx) : undefined;
              } else {
                updated.folderPath = undefined;
              }
            }
          } catch {}
        }

        // [3] commandPath 있고 folderPath 없으면 재추출
        if (updated.commandPath && !updated.folderPath) {
          const lastSlashIndex = updated.commandPath.lastIndexOf('/');
          if (lastSlashIndex !== -1) {
            updated.folderPath = updated.commandPath.substring(0, lastSlashIndex);
          }
        }

        // [4] folderPath 있고 commandPath 없으면 실행 파일 자동 스캔
        if (updated.folderPath && !updated.commandPath) {
          try {
            const found = await API.scanCommandFiles(updated.folderPath);
            if (found.length > 0) {
              updated.commandPath = found[0];
              // 포트 번호도 자동 감지
              if (!updated.port) {
                try {
                  const detected = await API.detectPort(found[0]);
                  if (detected.port) updated.port = detected.port;
                } catch {}
              }
            }
          } catch {}
        }

        // [5] commandPath 있지만 port 없으면 파일에서 자동 감지
        if (updated.commandPath && !updated.port) {
          try {
            const detected = await API.detectPort(updated.commandPath);
            if (detected.port) updated.port = detected.port;
          } catch {}
        }

        // 포트 상태 확인 (포트 번호가 있는 경우만)
        if (updated.port) {
          try {
            const isRunning = await API.checkPortStatus(updated.port);
            updated.isRunning = isRunning;
          } catch (e) {
            console.error(`Failed to check port status for ${updated.port}:`, e);
          }
        }

        return updated;
      });

      const updatedData = await Promise.all(updatedDataPromises);

      setPorts(updatedData);
      showToast('포트 목록을 새로고침했습니다', 'success');
    } catch (error) {
      showToast('새로고침 실패: ' + error, 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleBuildApp = async () => {
    if (isBuilding) return;

    setBuildType('app');
    setBuildLogs(['App 빌드를 시작합니다...']);
    lastLogIndexRef.current = 0;
    setShowBuildLog(true);
    setIsBuilding(true);

    try {
      const message = await API.buildApp('app');
      setBuildLogs(prev => [...prev, message]);

      // 빌드 상태를 주기적으로 폴링
      const pollInterval = setInterval(async () => {
        try {
          const response = await fetch('/api/build-status');
          const status = await response.json();

          if (status.output && status.output.length > 0) {
            const lastIdx = lastLogIndexRef.current;
            const newEntries = status.output.slice(lastIdx);
            if (newEntries.length > 0) {
              lastLogIndexRef.current = status.output.length;
              setBuildLogs(prev => [...prev, ...newEntries]);
            }
          }

          if (!status.isBuilding) {
            clearInterval(pollInterval);
            setIsBuilding(false);
            if (status.exitCode === 0) {
              setBuildLogs(prev => [...prev, '✅ 빌드가 완료되었습니다!']);
            } else if (status.exitCode !== null) {
              setBuildLogs(prev => [...prev, `❌ 빌드 실패 (exit code: ${status.exitCode})`]);
            }
          }
        } catch (e) {
          console.error('Failed to poll build status:', e);
        }
      }, 1000);

      // 10분 후 타임아웃
      setTimeout(() => {
        clearInterval(pollInterval);
        if (isBuilding) {
          setIsBuilding(false);
          setBuildLogs(prev => [...prev, '⚠️ 빌드 타임아웃 (10분 초과)']);
        }
      }, 600000);
    } catch (error) {
      setBuildLogs(prev => [...prev, '❌ App 빌드 실패: ' + error]);
      setIsBuilding(false);
    }
  };

  const handleBuildDmg = async () => {
    if (isBuilding) return;

    setBuildType('dmg');
    setBuildLogs(['DMG 빌드를 시작합니다...']);
    lastLogIndexRef.current = 0;
    setShowBuildLog(true);
    setIsBuilding(true);

    try {
      const message = await API.buildDmg();
      setBuildLogs(prev => [...prev, message]);

      // 빌드 상태를 주기적으로 폴링
      const pollInterval = setInterval(async () => {
        try {
          const response = await fetch('/api/build-status');
          const status = await response.json();

          if (status.output && status.output.length > 0) {
            const lastIdx = lastLogIndexRef.current;
            const newEntries = status.output.slice(lastIdx);
            if (newEntries.length > 0) {
              lastLogIndexRef.current = status.output.length;
              setBuildLogs(prev => [...prev, ...newEntries]);
            }
          }

          if (!status.isBuilding) {
            clearInterval(pollInterval);
            setIsBuilding(false);
            if (status.exitCode === 0) {
              setBuildLogs(prev => [...prev, '✅ 빌드가 완료되었습니다!']);
            } else if (status.exitCode !== null) {
              setBuildLogs(prev => [...prev, `❌ 빌드 실패 (exit code: ${status.exitCode})`]);
            }
          }
        } catch (e) {
          console.error('Failed to poll build status:', e);
        }
      }, 1000);

      // 10분 후 타임아웃
      setTimeout(() => {
        clearInterval(pollInterval);
        if (isBuilding) {
          setIsBuilding(false);
          setBuildLogs(prev => [...prev, '⚠️ 빌드 타임아웃 (10분 초과)']);
        }
      }, 600000);
    } catch (error) {
      setBuildLogs(prev => [...prev, '❌ DMG 빌드 실패: ' + error]);
      setIsBuilding(false);
    }
  };

  const handleAddWorkspaceRoot = async () => {
    if (isTauri()) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        const name = selected.split('/').pop() || selected;
        const id = crypto.randomUUID();
        const updated = [...workspaceRoots, { id, name, path: selected }];
        setWorkspaceRoots(updated);
      }
    } else {
      try {
        const res = await fetch('/api/pick-folder');
        const data = await res.json();
        if (!data.path) return;
        const selected: string = data.path;
        const name = selected.split('/').pop() || selected;
        const id = crypto.randomUUID();
        const updated = [...workspaceRoots, { id, name, path: selected }];
        setWorkspaceRoots(updated);
      } catch (e: any) {
        if (e.name !== 'AbortError') showToast('폴더 선택 실패: ' + e.message, 'error');
      }
    }
  };

  const handleRemoveWorkspaceRoot = (id: string) => {
    dirHandlesRef.current.delete(id);
    idbDeleteHandle(id);
    const updated = workspaceRoots.filter(r => r.id !== id);
    setWorkspaceRoots(updated);
  };

  const handleCreateProjectFolder = async () => {
    const root = workspaceRoots.find(r => r.id === activeRootId);
    if (!root) { showToast('작업 루트를 찾을 수 없습니다', 'error'); return; }
    const trimmed = newProjectName.trim();
    if (!trimmed) { showToast('프로젝트 이름을 입력하세요', 'error'); return; }

    const addProject = (fullPath: string) => {
      if (registerAsProject) {
        const newPort: PortInfo = {
          id: crypto.randomUUID(),
          name: trimmed,
          folderPath: fullPath,
        };
        setPorts(prev => [newPort, ...prev]);
      }
    };

    if (isTauri()) {
      if (!root.path.startsWith('/')) {
        showToast('루트 폴더 경로가 절대경로가 아닙니다. 루트를 삭제 후 다시 추가해주세요.', 'error');
        return;
      }
      const fullPath = `${root.path}/${trimmed}`;
      try {
        const result = await API.createFolder(fullPath);
        if (result.success) {
          addProject(fullPath);
          showToast(`폴더 생성${registerAsProject ? ' + 프로젝트 등록' : ''} 완료: ${trimmed}`, 'success');
          setNewProjectName('');
          setShowNewProjectModal(false);
        } else {
          showToast((result as any).error || '폴더 생성 실패', 'error');
        }
      } catch (e: any) {
        showToast('폴더 생성 실패: ' + e.message, 'error');
      }
    } else {
      if (!root.path.startsWith('/')) {
        showToast('루트 폴더 경로가 절대경로가 아닙니다. 루트를 삭제 후 다시 추가해주세요.', 'error');
        return;
      }
      const fullPath = `${root.path}/${trimmed}`;
      try {
        const result = await API.createFolder(fullPath);
        if (result.success) {
          addProject(fullPath);
          showToast(`폴더 생성${registerAsProject ? ' + 프로젝트 등록' : ''} 완료: ${trimmed}`, 'success');
          setNewProjectName('');
          setShowNewProjectModal(false);
        } else {
          showToast((result as any).error || '폴더 생성 실패', 'error');
        }
      } catch (e: any) {
        showToast('폴더 생성 실패: ' + e.message, 'error');
      }
    }
  };

  const handleBuildWindows = async () => {
    if (isBuilding) return;

    setBuildType('windows');
    setBuildLogs(['⏳ GitHub Actions Windows 빌드를 시작합니다...']);
    lastLogIndexRef.current = 0;
    setShowBuildLog(true);
    setIsBuilding(true);

    try {
      const response = await fetch('/api/build-windows', { method: 'POST' });
      const result = await response.json();

      if (!response.ok || result.error) {
        setBuildLogs(prev => [...prev, `❌ ${result.error}`]);
        setIsBuilding(false);
        return;
      }

      setBuildLogs(prev => [
        ...prev,
        '✅ GitHub Actions 워크플로우가 트리거되었습니다.',
        '🔄 Windows runner 시작 대기 중... (약 1~3분 소요)',
      ]);

      // GitHub Actions 상태 폴링 (5초 간격)
      let lastStatus = '';
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch('/api/windows-build-status');
          const status = await statusResponse.json();

          const currentKey = `${status.status}-${status.conclusion}`;
          if (currentKey !== lastStatus) {
            lastStatus = currentKey;

            if (status.status === 'in_progress') {
              setBuildLogs(prev => [
                ...prev,
                '🔄 Windows runner에서 빌드 중...',
                `📎 진행상황: ${status.runUrl}`,
              ]);
            } else if (status.status === 'completed') {
              clearInterval(pollInterval);
              setIsBuilding(false);
              if (status.conclusion === 'success') {
                setBuildLogs(prev => [
                  ...prev,
                  '✅ Windows 빌드 완료!',
                  `📥 다운로드: ${status.artifactsUrl}`,
                  '💡 위 링크 → Artifacts → windows-installer 에서 .exe 다운로드',
                ]);
              } else {
                setBuildLogs(prev => [
                  ...prev,
                  `❌ 빌드 실패 (${status.conclusion})`,
                  `🔍 로그 확인: ${status.runUrl}`,
                ]);
              }
            }
          }
        } catch (e) {
          console.error('Failed to poll windows build status:', e);
        }
      }, 5000);

      // 30분 타임아웃
      setTimeout(() => {
        clearInterval(pollInterval);
        if (isBuilding) {
          setIsBuilding(false);
          setBuildLogs(prev => [...prev, '⚠️ 타임아웃 (30분 초과)']);
        }
      }, 1800000);
    } catch (error) {
      setBuildLogs(prev => [...prev, '❌ Windows 빌드 요청 실패: ' + error]);
      setIsBuilding(false);
    }
  };

  const handleExportDmg = async () => {
    try {
      const message = await API.exportDmg();
      showToast(message, 'success');
    } catch (error) {
      showToast('DMG 출시 실패: ' + error, 'error');
    }
  };

  const handleAddCommandFile = async () => {
    try {
      if (isTauri()) {
        // Tauri mode: native file picker → absolute path directly
        const filePath = await openDialog({
          multiple: false,
          filters: [{ name: 'Command Files', extensions: ['command', 'sh'] }],
        });
        if (!filePath || typeof filePath !== 'string') return;

        const fileName = filePath.split('/').pop() || '';
        const projectName = fileName.replace('.command', '').replace('.sh', '');
        const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));

        // Detect port via Rust command
        let detectedPort: number | null = null;
        try {
          const detected = await invoke<number | null>('detect_port', { filePath });
          if (detected) detectedPort = detected;
        } catch {
          // port detection optional
        }

        setName(projectName);
        if (detectedPort) setPort(detectedPort.toString());
        setCommandPath(filePath);
        setFolderPath(folderPath);

        showToast(
          `파일 분석 완료! 프로젝트: ${projectName} | 포트: ${detectedPort || '감지 실패'} — 확인 후 추가 버튼을 누르세요.`,
          'success'
        );
      } else {
        // Web mode: FileReader for port detection only (no absolute path available)
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.command,.sh';
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async (event) => {
            try {
              const content = event.target?.result as string;

              let detectedPort: number | null = null;
              const localhostMatch = content.match(/localhost:(\d+)/);
              if (localhostMatch) {
                detectedPort = parseInt(localhostMatch[1]);
              } else {
                const portMatch = content.match(/(?:PORT|port)\s*=\s*(\d+)/);
                if (portMatch) detectedPort = parseInt(portMatch[1]);
              }

              const projectName = file.name.replace('.command', '').replace('.sh', '');
              setName(projectName);
              if (detectedPort) setPort(detectedPort.toString());

              showToast(
                `포트 ${detectedPort || '감지 실패'} 감지됨. 파일 경로(commandPath)를 수동으로 입력해주세요.`,
                detectedPort ? 'success' : 'error'
              );
            } catch (error) {
              showToast('파일 분석 실패: ' + error, 'error');
            }
          };
          reader.readAsText(file);
        };
        input.click();
      }
    } catch (error) {
      showToast('파일 선택 실패: ' + error, 'error');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      addPort();
    }
  };

  const handleEditKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  const matchesSearch = (p: PortInfo, q: string): boolean => {
    const folderBasename = p.folderPath?.split('/').pop()?.toLowerCase() ?? '';
    const aiName = p.aiName?.toLowerCase() ?? '';
    return (
      p.name.toLowerCase().includes(q) ||
      aiName.includes(q) ||
      (p.port?.toString() ?? '').includes(q) ||
      folderBasename.includes(q)
    );
  };

  const getSearchFiltered = () => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return ports;
    return ports.filter(p => matchesSearch(p, q));
  };

  const getSortedPorts = () => {
    let filtered = getSearchFiltered();

    // Apply filter
    if (filterType === 'with-port') {
      filtered = filtered.filter(p => p.port != null && p.port > 0);
    } else if (filterType === 'without-port') {
      filtered = filtered.filter(p => p.port == null || p.port === 0);
    }

    // Apply category filter
    if (filterCategory !== 'all') {
      if (filterCategory === 'uncategorized') {
        filtered = filtered.filter(p => !p.category);
      } else {
        filtered = filtered.filter(p => p.category === filterCategory);
      }
    }

    // Apply sort
    switch (sortBy) {
      case 'name':
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'port':
        filtered.sort((a, b) => (a.port ?? 0) - (b.port ?? 0));
        break;
      case 'recent':
      default:
        // recent: 배열 순서 유지 (기본 등록 순)
        break;
    }
    return sortOrder === 'desc' ? filtered.reverse() : filtered;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b] p-8">
      {/* 워크트리 경로 피커 모달 */}
      {worktreePickerState && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-[#18181b] rounded-xl border border-zinc-700 p-5 w-[420px] shadow-2xl">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3">워크트리 선택</h3>

            {/* 감지된 워크트리 목록 */}
            {detectedWorktrees.length > 0 && (
              <div className="mb-3 border border-zinc-700 rounded-lg overflow-hidden">
                {detectedWorktrees.map((wt) => (
                  <button
                    key={wt.path}
                    onClick={() => setWorktreePickerValue(wt.path)}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-zinc-700/50 transition-colors border-b border-zinc-700/50 last:border-0 ${
                      worktreePickerValue === wt.path ? 'bg-violet-600/20 text-violet-300' : 'text-zinc-300'
                    }`}
                  >
                    <span className="font-mono truncate">{wt.path}</span>
                    {wt.branch && (
                      <span className="text-zinc-500 ml-2 shrink-0">({wt.branch})</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* 직접 입력 */}
            <input
              autoFocus
              type="text"
              value={worktreePickerValue}
              onChange={(e) => setWorktreePickerValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && worktreePickerValue.trim()) executeWithWorktree(worktreePickerValue.trim());
                if (e.key === 'Escape') { setWorktreePickerState(null); setDetectedWorktrees([]); }
              }}
              placeholder="직접 경로 입력..."
              className="w-full px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-500 mb-4"
            />

            <div className="flex gap-2 justify-end items-center">
              <button
                onClick={() => { setWorktreePickerState(null); setDetectedWorktrees([]); }}
                className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >취소</button>
              <button
                onClick={() => { executeWithWorktree(undefined); }}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg transition-colors"
              >워크트리 없이 실행</button>
              <button
                disabled={!worktreePickerValue.trim()}
                onClick={() => { executeWithWorktree(worktreePickerValue.trim()); }}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors text-white ${
                  worktreePickerValue.trim()
                    ? 'bg-violet-600 hover:bg-violet-500'
                    : 'bg-violet-600/30 opacity-40 cursor-not-allowed'
                }`}
              >실행 →</button>
            </div>
          </div>
        </div>
      )}

      {/* 빌드 로그 모달 */}
      {showBuildLog && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181b] rounded-xl border border-zinc-800 w-full max-w-4xl max-h-[80vh] flex flex-col">
            {/* 헤더 */}
            <div className="flex items-center justify-between p-6 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                {buildType === 'windows'
                  ? <Monitor className={`w-5 h-5 ${isBuilding ? 'animate-spin text-blue-400' : 'text-green-400'}`} />
                  : <Package className={`w-5 h-5 ${isBuilding ? 'animate-spin text-blue-400' : 'text-green-400'}`} />
                }
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {buildType === 'dmg' ? 'DMG' : buildType === 'windows' ? 'Windows' : 'App'} 빌드 진행 상황
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {isBuilding
                      ? buildType === 'windows' ? 'GitHub Actions 진행 중...' : '빌드 진행 중...'
                      : '빌드 완료'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBuildLog(false)}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <XIcon className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            {/* 로그 내용 */}
            <div className="flex-1 overflow-y-auto p-6 font-mono text-xs">
              <div className="space-y-1">
                {buildLogs.map((log, index) => (
                  <div
                    key={index}
                    className={`${
                      log.includes('❌') || log.includes('error') || log.includes('Error')
                        ? 'text-red-400'
                        : log.includes('✅')
                        ? 'text-green-400'
                        : log.includes('⚠️') || log.includes('warning')
                        ? 'text-yellow-400'
                        : 'text-zinc-300'
                    }`}
                  >
                    {log}
                  </div>
                ))}
                {isBuilding && (
                  <div className="text-blue-400 animate-pulse mt-2">
                    ⏳ 빌드 중...
                  </div>
                )}
              </div>
            </div>

            {/* 푸터 */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center justify-between">
                <div className="text-xs text-zinc-400">
                  총 {buildLogs.length}줄의 로그
                </div>
                <button
                  onClick={() => {
                    const logText = buildLogs.join('\n');
                    navigator.clipboard.writeText(logText);
                    showToast('로그가 클립보드에 복사되었습니다', 'success');
                  }}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg transition-colors"
                >
                  로그 복사
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 플로팅 배너 */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              flex items-center gap-2.5 px-4 py-2.5 rounded-lg shadow-xl
              backdrop-blur-sm border
              transform transition-all duration-300 ease-in-out
              animate-slide-in-right
              ${toast.type === 'success'
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
              }
            `}
          >
            <div className="flex-1 font-medium text-sm">
              {toast.message}
            </div>
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="hover:bg-white/10 rounded-md p-1 transition-colors"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="max-w-4xl mx-auto">
        {/* 탭 네비게이션 */}
        <div className="flex gap-1 mb-4 bg-[#18181b] border border-zinc-800 rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveTab('ports')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === 'ports'
                ? 'bg-zinc-700 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            프로젝트 관리
          </button>
          <button
            onClick={() => setActiveTab('portal')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === 'portal'
                ? 'bg-zinc-700 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <BookMarked className="w-3.5 h-3.5" />
            포털
          </button>
        </div>

        {/* 포털 탭 */}
        {activeTab === 'portal' && (
          <PortalManager showToast={showToast} onClaudeBypass={API.openTmuxClaudeBypass} />
        )}

        {/* 포트 관리 탭 */}
        {activeTab === 'ports' && <>

        {/* 헤더 */}
        <div className="bg-[#18181b] rounded-xl border border-zinc-800 p-6 mb-6">
          {/* 헤더 1행: 타이틀 + 주요 버튼 */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="bg-zinc-900 p-2 rounded-lg border border-zinc-700 shrink-0">
                <Server className="w-5 h-5 text-zinc-500" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-white whitespace-nowrap">프로젝트 관리 프로그램</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-zinc-400 whitespace-nowrap">로컬 개발 프로젝트를 관리하세요</p>
                  {claudeStatus && (
                    claudeStatus.authenticated ? (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"></span>
                        Claude {claudeStatus.email ? `(${claudeStatus.email})` : 'logged in'}
                        <button
                          onClick={handleClaudeLogout}
                          className="ml-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                          title="Claude 로그아웃"
                        >
                          로그아웃
                        </button>
                      </span>
                    ) : claudeStatus.installed ? (
                      <button
                        onClick={async () => {
                          try {
                            if (isTauri()) {
                              await invoke('open_claude_auth_login');
                              showToast('Claude Code 로그인 창을 열었습니다 (iTerm)', 'success');
                            } else {
                              await fetch('/api/claude-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login' }) });
                              showToast('Claude Code 로그인 브라우저를 열었습니다', 'success');
                            }
                            // 로그인 후 3초 뒤 상태 재확인
                            setTimeout(fetchClaudeStatus, 3000);
                          } catch (e) {
                            showToast('Claude 로그인 실패: ' + e, 'error');
                          }
                        }}
                        className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
                        Claude 로그인 필요
                      </button>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-zinc-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 inline-block"></span>
                        Claude 미설치
                      </span>
                    )
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <button
                onClick={handleGenerateAiNames}
                title="AI가 각 프로젝트의 영어 별칭(aiName)을 자동 생성합니다"
                className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-sm rounded-lg border border-emerald-500/30 hover:border-emerald-500/50 transition-all flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">AI 이름</span>
              </button>
              <button onClick={handleExportPorts} title="내보내기" className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-sm rounded-lg border border-zinc-700 hover:border-zinc-600 transition-all flex items-center">
                <Download className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleImportPorts} title="불러오기" className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-sm rounded-lg border border-zinc-700 hover:border-zinc-600 transition-all flex items-center">
                <Upload className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleRefresh} disabled={isRefreshing} title="새로고침" className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-sm rounded-lg border border-zinc-700 hover:border-zinc-600 transition-all flex items-center disabled:opacity-50 disabled:cursor-not-allowed">
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <div className="flex items-center rounded-lg border border-zinc-700 overflow-hidden">
                <button onClick={handlePushToSupabase} disabled={isPushingPorts} title="Supabase Push" className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-sm border-r border-zinc-700 transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed">
                  <CloudUpload className={`w-3.5 h-3.5 ${isPushingPorts ? 'animate-pulse' : 'text-indigo-400'}`} />
                  <span className="text-xs font-medium">Push</span>
                </button>
                <button onClick={handleRestoreFromSupabase} disabled={isRestoring} title="Supabase Pull" className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-sm transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed">
                  <CloudDownload className={`w-3.5 h-3.5 ${isRestoring ? 'animate-pulse' : 'text-indigo-400'}`} />
                  <span className="text-xs font-medium">Pull</span>
                </button>
              </div>
            </div>
          </div>

          {/* 헤더 2행: 빌드 버튼 (웹 모드 전용) */}
          {!isTauri() && (
            <div className="flex items-center gap-2 justify-end mb-3">
              <button onClick={() => API.openBuildFolder()} className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-sm rounded-lg border border-zinc-700 hover:border-zinc-600 transition-all flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5" />
                <span className="font-medium">DMG 폴더</span>
              </button>
              <button onClick={handleBuildApp} disabled={isBuilding} className="px-3 py-1.5 bg-green-500/15 hover:bg-green-500/25 text-green-300 text-sm rounded-lg border border-green-500/40 hover:border-green-500/60 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                <Terminal className={`w-3.5 h-3.5 ${isBuilding && buildType === 'app' ? 'animate-spin' : ''}`} />
                <span className="font-medium">{isBuilding && buildType === 'app' ? '앱 빌드 중...' : '앱 빌드'}</span>
              </button>
              <button onClick={handleBuildDmg} disabled={isBuilding} className="px-3 py-1.5 bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 text-sm rounded-lg border border-purple-500/40 hover:border-purple-500/60 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                <Package className={`w-3.5 h-3.5 ${isBuilding && buildType === 'dmg' ? 'animate-spin' : ''}`} />
                <span className="font-medium">{isBuilding && buildType === 'dmg' ? 'DMG 빌드 중...' : 'DMG 빌드'}</span>
              </button>
              <button onClick={handleExportDmg} className="px-3 py-1.5 bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 text-sm rounded-lg border border-blue-500/40 hover:border-blue-500/60 transition-all flex items-center gap-1.5">
                <Rocket className="w-3.5 h-3.5" />
                <span className="font-medium">DMG 출시하기</span>
              </button>
              <button onClick={handleBuildWindows} disabled={isBuilding} className="px-3 py-1.5 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 text-sm rounded-lg border border-indigo-500/40 hover:border-indigo-500/60 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                <Monitor className={`w-3.5 h-3.5 ${isBuilding && buildType === 'windows' ? 'animate-spin' : ''}`} />
                <span className="font-medium">{isBuilding && buildType === 'windows' ? 'Windows 빌드 중...' : 'Windows 빌드'}</span>
              </button>
            </div>
          )}

          {/* 입력 폼 */}
          <div className="space-y-2.5">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="프로젝트 이름"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1 px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
              <input
                type="number"
                placeholder="포트"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                onKeyPress={handleKeyPress}
                className="w-24 px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
              <button
                onClick={addPort}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>추가</span>
              </button>
            </div>
            <div className="space-y-2">
              <input
                type="text"
                placeholder={`${execFileExt()} 파일 경로 (선택사항)`}
                value={commandPath}
                onChange={(e) => setCommandPath(e.target.value)}
                onKeyPress={handleKeyPress}
                className="w-full px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
              <input
                type="text"
                placeholder="터미널 명령어 (선택사항, 예: bunx cursor-talk-to-figma-socket)"
                value={terminalCommand}
                onChange={(e) => setTerminalCommand(e.target.value)}
                onKeyPress={handleKeyPress}
                className="w-full px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
              <input
                type="text"
                placeholder="프로젝트 폴더 경로 (선택사항)"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                onKeyPress={handleKeyPress}
                className="w-full px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
              <input
                type="text"
                placeholder="배포 사이트 주소 (선택사항, 예: https://example.com)"
                value={deployUrl}
                onChange={(e) => setDeployUrl(e.target.value)}
                onKeyPress={handleKeyPress}
                className="w-full px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
              <input
                type="text"
                placeholder="GitHub 주소 (선택사항, 예: https://github.com/user/repo)"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                onKeyPress={handleKeyPress}
                className="w-full px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
              <div className="flex gap-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                >
                  <option value="">카테고리 (선택사항)</option>
                  {['frontend', 'backend', 'AI', 'tools', 'infra', 'mobile', 'data', 'fullstack'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="프로젝트 설명 (선택사항)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="flex-[2] px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
              <div className="flex items-start gap-2 px-1">
                <div className="text-base">💡</div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  <span className="font-medium text-zinc-400">쉬운 추가 방법:</span> Finder에서
                  <span className="font-mono text-zinc-400"> 포트에추가.command </span>
                  파일 위로 {execFileExt()} 파일을 드래그하세요
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 작업 루트 */}
        <div className="bg-[#18181b] rounded-xl border border-zinc-800 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="bg-zinc-900 p-1.5 rounded-lg border border-zinc-700 shrink-0">
                <Folder className="w-4 h-4 text-zinc-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-300">작업 루트</p>
                <button
                  onClick={() => API.openAppDataDir().catch(e => showToast('폴더 열기 실패: ' + e, 'error'))}
                  className="text-xs text-zinc-600 font-mono truncate hover:text-zinc-400 transition-colors text-left"
                  title="저장 폴더 열기"
                >
                  {isTauri()
                    ? '~/Library/Application Support/com.portmanager.portmanager/ ↗'
                    : 'workspace-roots.json ↗'}
                </button>
              </div>
              {workspaceRoots.length > 0 && (
                <span className="text-xs text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded-md shrink-0">{workspaceRoots.length}</span>
              )}
            </div>
            <button
              onClick={handleAddWorkspaceRoot}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-sm rounded-lg border border-zinc-700 hover:border-zinc-600 transition-all duration-200 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="font-medium">루트 추가</span>
            </button>
          </div>

          {workspaceRoots.length === 0 ? (
            <p className="text-sm text-zinc-600 italic text-center py-2">루트 폴더를 추가하세요</p>
          ) : (
            <div className="flex flex-col gap-2">
              {workspaceRoots.map(root => (
                <div key={root.id} className="flex items-center justify-between gap-2 bg-zinc-900/60 rounded-lg px-3 py-2 border border-zinc-800">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200 font-medium truncate">{root.name}</p>
                    <p className="text-xs text-zinc-500 font-mono truncate">{root.path}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => { setActiveRootId(root.id); setNewProjectName(''); setShowNewProjectModal(true); }}
                      className="px-2.5 py-1 bg-green-500/15 hover:bg-green-500/25 text-green-300 text-xs rounded-md border border-green-500/40 hover:border-green-500/60 transition-all flex items-center gap-1"
                    >
                      <FilePlus className="w-3 h-3" />
                      <span>새 폴더</span>
                    </button>
                    <button
                      onClick={() => handleRemoveWorkspaceRoot(root.id)}
                      className="p-1 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all"
                      title="루트 제거"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 새 프로젝트 폴더 생성 모달 */}
        {showNewProjectModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#18181b] rounded-xl border border-zinc-800 w-full max-w-md p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="bg-green-500/15 p-2 rounded-lg border border-green-500/30">
                  <FilePlus className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">새 프로젝트 폴더</h2>
                  <p className="text-xs text-zinc-500 mt-0.5 font-mono truncate max-w-xs">
                    {workspaceRoots.find(r => r.id === activeRootId)?.path}/
                  </p>
                </div>
              </div>
              <input
                type="text"
                placeholder="프로젝트 이름 (예: my-app)"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateProjectFolder(); if (e.key === 'Escape') setShowNewProjectModal(false); }}
                autoFocus
                className="w-full px-3 py-2.5 text-sm bg-black/40 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-all mb-3 font-mono"
              />
              <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={registerAsProject}
                  onChange={(e) => setRegisterAsProject(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-green-500"
                />
                <span className="text-sm text-zinc-400">포트 목록에 프로젝트 등록</span>
              </label>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowNewProjectModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleCreateProjectFolder}
                  disabled={!newProjectName.trim()}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                >
                  생성
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 포트 목록 */}
        {ports.length > 0 ? (
          <div className="bg-[#18181b] rounded-xl border border-zinc-800 overflow-hidden">
            <div className="bg-zinc-900/50 px-6 py-4 border-b border-zinc-800">
              {/* Row 1: Search input */}
              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="프로젝트 검색... (Cmd+F)"
                  className="w-full pl-8 pr-8 py-1.5 bg-black/30 border border-zinc-700 text-zinc-200 text-xs rounded-lg placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {/* Row 2: Filter tabs (counts reflect search results) */}
              <div className="flex gap-1 mb-3">
                {(['all', 'with-port', 'without-port'] as const).map(f => {
                  const searchFiltered = getSearchFiltered();
                  const count = f === 'all' ? searchFiltered.length
                    : f === 'with-port' ? searchFiltered.filter(p => p.port != null && p.port > 0).length
                    : searchFiltered.filter(p => p.port == null || p.port === 0).length;
                  const label = f === 'all' ? '전체' : f === 'with-port' ? '포트 있음' : '포트 없음';
                  return (
                    <button key={f} onClick={() => setFilterType(f)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        filterType === f ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}>
                      {label} <span className="opacity-70">({count})</span>
                    </button>
                  );
                })}
              </div>
              {/* Row 2b: Category filter (only shown when categories exist) */}
              {(() => {
                const usedCategories = [...new Set(ports.map(p => p.category).filter(Boolean))] as string[];
                if (usedCategories.length === 0) return null;
                return (
                  <div className="flex gap-1 mb-3 flex-wrap">
                    <button onClick={() => setFilterCategory('all')}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${filterCategory === 'all' ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                      전체 카테고리
                    </button>
                    {usedCategories.map(cat => (
                      <button key={cat} onClick={() => setFilterCategory(cat)}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${filterCategory === cat ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                        {cat} <span className="opacity-70">({ports.filter(p => p.category === cat).length})</span>
                      </button>
                    ))}
                    {ports.some(p => !p.category) && (
                      <button onClick={() => setFilterCategory('uncategorized')}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${filterCategory === 'uncategorized' ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                        미분류 <span className="opacity-70">({ports.filter(p => !p.category).length})</span>
                      </button>
                    )}
                  </div>
                );
              })()}
              {/* Row 3: Title + Sort + Bypass Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Terminal className="w-4 h-4 text-zinc-400" />
                  <h2 className="text-sm font-semibold text-zinc-200">등록된 프로젝트</h2>
                  <span className="bg-zinc-800 px-2 py-0.5 rounded-md text-xs text-zinc-300 font-medium border border-zinc-700">
                    {searchQuery.trim() ? `${getSearchFiltered().length}/${ports.length}` : ports.length}
                  </span>
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-md transition-all disabled:opacity-40"
                    title="새로고침 (실행파일 자동 감지)"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  {/* Bypass permissions toggle */}
                  <button
                    onClick={() => setBypassPermissions(v => !v)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all duration-200 ${
                      bypassPermissions
                        ? 'bg-orange-500/20 text-orange-400 border-orange-500/50'
                        : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300'
                    }`}
                    title="claude --dangerously-skip-permissions 활성화 여부"
                  >
                    <span className={`w-2 h-2 rounded-full ${bypassPermissions ? 'bg-orange-400' : 'bg-zinc-600'}`} />
                    bypass permissions
                  </button>
                  <div className="flex items-center gap-1.5">
                    <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortType)}
                      className="bg-black/30 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer"
                    >
                      <option value="recent">최근 등록순</option>
                      <option value="name">이름순</option>
                      <option value="port">포트순</option>
                    </select>
                    <button
                      onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
                      className="px-2 py-1 bg-black/30 border border-zinc-700 text-zinc-400 text-xs rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-all"
                      title={sortOrder === 'asc' ? '오름차순' : '내림차순'}
                    >
                      {sortOrder === 'asc' ? '↑ 오름' : '↓ 내림'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="divide-y divide-zinc-800">
              {(() => {
                const displayedPorts = getSortedPorts();
                if (displayedPorts.length === 0) {
                  return (
                    <div className="p-8 text-center text-sm text-zinc-500">
                      {searchQuery.trim()
                        ? `"${searchQuery.trim()}"에 대한 검색 결과가 없습니다`
                        : '이 필터에 해당하는 프로젝트가 없습니다'}
                    </div>
                  );
                }
                return displayedPorts.map((item) => (
                <div
                  key={item.id}
                  className="group p-4 hover:bg-zinc-900/30 transition-all duration-200"
                >
                  {editingId === item.id ? (
                    // 수정 모드
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={handleEditKeyPress}
                          className="flex-1 px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                          placeholder="프로젝트 이름"
                          autoFocus
                        />
                        <input
                          type="number"
                          value={editPort}
                          onChange={(e) => setEditPort(e.target.value)}
                          onKeyDown={handleEditKeyPress}
                          className="w-24 px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                          placeholder="포트"
                        />
                        <button
                          onClick={saveEdit}
                          className="p-2 bg-green-500/20 hover:bg-green-500/30 rounded-lg transition-colors border border-green-500/30"
                        >
                          <Check className="w-4 h-4 text-green-400" />
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="p-2 hover:bg-zinc-800/50 rounded-lg transition-colors border border-transparent hover:border-zinc-700/50"
                        >
                          <XIcon className="w-4 h-4 text-zinc-500" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={editCommandPath}
                        onChange={(e) => setEditCommandPath(e.target.value)}
                        onKeyDown={handleEditKeyPress}
                        className="w-full px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                        placeholder={`${execFileExt()} 파일 경로 (선택사항)`}
                      />
                      <input
                        type="text"
                        value={editTerminalCommand}
                        onChange={(e) => setEditTerminalCommand(e.target.value)}
                        onKeyDown={handleEditKeyPress}
                        className="w-full px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                        placeholder="터미널 명령어 (선택사항, 예: bunx cursor-talk-to-figma-socket)"
                      />
                      <input
                        type="text"
                        value={editFolderPath}
                        onChange={(e) => setEditFolderPath(e.target.value)}
                        onKeyDown={handleEditKeyPress}
                        className="w-full px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                        placeholder="프로젝트 폴더 경로 (선택사항)"
                      />
                      <input
                        type="text"
                        value={editDeployUrl}
                        onChange={(e) => setEditDeployUrl(e.target.value)}
                        onKeyDown={handleEditKeyPress}
                        className="w-full px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                        placeholder="배포 사이트 주소 (선택사항)"
                      />
                      <input
                        type="text"
                        value={editGithubUrl}
                        onChange={(e) => setEditGithubUrl(e.target.value)}
                        onKeyDown={handleEditKeyPress}
                        className="w-full px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                        placeholder="GitHub 주소 (선택사항)"
                      />
                      <div className="flex gap-2">
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          className="flex-1 px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                        >
                          <option value="">카테고리</option>
                          {['frontend', 'backend', 'AI', 'tools', 'infra', 'mobile', 'data', 'fullstack'].map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          onKeyDown={handleEditKeyPress}
                          className="flex-[2] px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                          placeholder="프로젝트 설명 (선택사항)"
                        />
                      </div>
                    </div>
                  ) : (
                    // 일반 모드
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-medium text-white group-hover:text-white transition-colors">
                              {item.name}
                            </h3>
                            {item.aiName && (
                              <span
                                className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-300 text-[10px] font-medium rounded border border-emerald-500/30"
                                title="AI 추천 이름 (검색용 별칭)"
                              >
                                {item.aiName}
                              </span>
                            )}
                            {item.category && (
                              <span className="px-1.5 py-0.5 bg-violet-500/15 text-violet-400 text-[10px] font-medium rounded border border-violet-500/30">
                                {item.category}
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-[11px] text-zinc-500 mt-0.5 truncate max-w-xs">{item.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <div className="w-5 h-5 rounded-md bg-zinc-900 flex items-center justify-center border border-zinc-700">
                              <Server className="w-3 h-3 text-zinc-400" />
                            </div>
                            {item.port ? (
                              <span className="font-mono text-xs text-zinc-400">
                                Port: <span className="text-zinc-200 font-semibold">{item.port}</span>
                              </span>
                            ) : (
                              <span className="font-mono text-xs text-zinc-600">No port</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {(item.commandPath || item.terminalCommand) && (
                          isHtmlFile(item.commandPath) ? (
                            <button
                              onClick={() => executeCommand(item)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-medium rounded-lg border border-blue-500/30 hover:border-blue-500/50 transition-all duration-200"
                              title="Chrome에서 HTML 파일 열기"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>열기</span>
                            </button>
                          ) : item.isRunning ? (
                            <>
                              <button
                                onClick={() => stopCommand(item)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium rounded-lg border border-red-500/30 hover:border-red-500/50 transition-all duration-200"
                              >
                                <Square className="w-3 h-3 fill-current" />
                                <span>중지</span>
                              </button>
                              <button
                                onClick={() => forceRestartCommand(item)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 text-xs font-medium rounded-lg border border-orange-500/30 hover:border-orange-500/50 transition-all duration-200"
                                title="정지가 안 되는 프로세스를 강제로 종료하고 재실행합니다"
                              >
                                <RotateCw className="w-3 h-3" />
                                <span>강제재실행</span>
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => executeCommand(item)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs font-medium rounded-lg border border-green-500/30 hover:border-green-500/50 transition-all duration-200"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                <span>실행</span>
                              </button>
                              <button
                                onClick={() => forceRestartCommand(item)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 text-xs font-medium rounded-lg border border-orange-500/30 hover:border-orange-500/50 transition-all duration-200"
                                title="기존 프로세스를 강제 종료하고 새로 실행합니다"
                              >
                                <RotateCw className="w-3 h-3" />
                                <span>강제재실행</span>
                              </button>
                            </>
                          )
                        )}
                        {(item.commandPath || item.terminalCommand) && isTauri() && (
                          <button
                            onClick={async () => {
                              try {
                                await API.openLog(item.id);
                                showToast('로그를 Terminal에서 열었습니다', 'success');
                              } catch (error) {
                                showToast('로그 열기 실패: ' + error, 'error');
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-medium rounded-lg border border-amber-500/30 hover:border-amber-500/50 transition-all duration-200"
                          >
                            <FileText className="w-3 h-3" />
                            <span>로그</span>
                          </button>
                        )}
                        <div className="inline-flex rounded-lg overflow-hidden border border-violet-500/30">
                          <button
                            onClick={() => openTmuxClaude(item)}
                            title={bypassPermissions
                              ? `tmux + Claude --dangerously-skip-permissions (세션: ${getSessionName(item)}-bypass)`
                              : `tmux 세션에서 Claude 실행 (세션: ${getSessionName(item)})`}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                              bypassPermissions
                                ? 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400'
                                : 'bg-violet-500/10 hover:bg-violet-500/20 text-violet-400'
                            }`}
                          >
                            <SquareTerminal className="w-3 h-3" />
                            <span>tmux{bypassPermissions ? ' ⚡' : ''}</span>
                          </button>
                          <button
                            onClick={() => openTmuxClaudeFresh(item)}
                            title="새로 열기 — 기존 세션 종료 후 새 세션 시작"
                            className={`inline-flex items-center px-1.5 py-1.5 text-xs font-medium border-l transition-all duration-200 ${
                              bypassPermissions
                                ? 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border-orange-500/30'
                                : 'bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border-violet-500/30'
                            }`}
                          >
                            <span>↺</span>
                          </button>
                        </div>
                        <button
                          onClick={() => openTerminalClaude(item)}
                          title={bypassPermissions ? 'Terminal에서 Claude --dangerously-skip-permissions 실행' : '일반 Terminal에서 Claude 실행'}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 ${
                            bypassPermissions
                              ? 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border-orange-500/30 hover:border-orange-500/50'
                              : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border-indigo-500/30 hover:border-indigo-500/50'
                          }`}
                        >
                          <Terminal className="w-3 h-3" />
                          <span>Claude{bypassPermissions ? ' ⚡' : ''}</span>
                        </button>
                        <div className="relative group/info inline-flex items-center">
                          <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 cursor-help transition-colors" />
                          <div className="absolute bottom-full right-0 mb-2 w-56 p-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-300 shadow-xl opacity-0 group-hover/info:opacity-100 transition-opacity pointer-events-none z-50">
                            <p className="font-semibold text-zinc-100 mb-1.5">설치 필요</p>
                            <ul className="space-y-1 text-zinc-400">
                              <li>· <span className="text-violet-400">tmux</span>: tmux + Claude CLI + iTerm</li>
                              <li>· <span className="text-indigo-400">Claude</span>: Claude CLI + iTerm</li>
                            </ul>
                            <p className="mt-1.5 text-zinc-500 text-[10px]">claude.ai/code 에서 설치</p>
                          </div>
                        </div>
                        {item.folderPath && (
                          <button
                            onClick={() => API.openFolder(item.folderPath!)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 text-xs font-medium rounded-lg border border-zinc-700/50 hover:border-zinc-600/50 transition-all duration-200"
                          >
                            <Folder className="w-3 h-3" />
                            <span>폴더</span>
                          </button>
                        )}
                        {item.deployUrl && (
                          isTauri() ? (
                            <button
                              onClick={async () => {
                                try {
                                  await API.openInChrome(item.deployUrl);
                                  showToast(`배포 사이트를 열었습니다`, 'success');
                                } catch (error) {
                                  showToast('배포 사이트 열기 실패: ' + error, 'error');
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-xs font-medium rounded-lg border border-purple-500/30 hover:border-purple-500/50 transition-all duration-200"
                            >
                              <Globe className="w-3 h-3" />
                              <span>배포</span>
                            </button>
                          ) : (
                            <a
                              href={item.deployUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-xs font-medium rounded-lg border border-purple-500/30 hover:border-purple-500/50 transition-all duration-200"
                            >
                              <Globe className="w-3 h-3" />
                              <span>배포</span>
                            </a>
                          )
                        )}
                        {item.githubUrl && (
                          isTauri() ? (
                            <button
                              onClick={async () => {
                                try {
                                  await API.openInChrome(item.githubUrl!);
                                  showToast('GitHub를 열었습니다', 'success');
                                } catch (error) {
                                  showToast('GitHub 열기 실패: ' + error, 'error');
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700/30 hover:bg-zinc-700/50 text-zinc-300 text-xs font-medium rounded-lg border border-zinc-600/40 hover:border-zinc-500/60 transition-all duration-200"
                            >
                              <Github className="w-3 h-3" />
                              <span>GitHub</span>
                            </button>
                          ) : (
                            <a
                              href={item.githubUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700/30 hover:bg-zinc-700/50 text-zinc-300 text-xs font-medium rounded-lg border border-zinc-600/40 hover:border-zinc-500/60 transition-all duration-200"
                            >
                              <Github className="w-3 h-3" />
                              <span>GitHub</span>
                            </a>
                          )
                        )}
                        {(item.commandPath || item.terminalCommand) && item.port && (
                          isTauri() ? (
                            <button
                              onClick={async () => {
                                try {
                                  await API.openInChrome(`http://localhost:${item.port}`);
                                  showToast(`Chrome에서 포트 ${item.port}를 열었습니다`, 'success');
                                } catch (error) {
                                  showToast('Chrome 열기 실패: ' + error, 'error');
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-medium rounded-lg border border-blue-500/30 hover:border-blue-500/50 transition-all duration-200"
                            >
                              <span>열기</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          ) : (
                            <a
                              href={`http://localhost:${item.port}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-medium rounded-lg border border-blue-500/30 hover:border-blue-500/50 transition-all duration-200"
                            >
                              <span>열기</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )
                        )}
                        {/* AI buttons (web mode only, folderPath required) */}
                        <button
                          onClick={() => startEdit(item)}
                          className="p-1.5 hover:bg-zinc-800/60 rounded-lg transition-colors border border-transparent hover:border-zinc-700/50"
                        >
                          <Pencil className="w-3.5 h-3.5 text-zinc-600 hover:text-zinc-400 transition-colors" />
                        </button>
                        <button
                          onClick={() => deletePort(item.id)}
                          className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-500/30"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-zinc-600 hover:text-red-400 transition-colors" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ));
              })()}
            </div>
          </div>
        ) : (
          <div className="bg-[#18181b] rounded-xl border border-zinc-800 p-12 text-center">
            <div className="relative inline-block mb-4">
              <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-700">
                <Server className="w-10 h-10 text-zinc-500" />
              </div>
            </div>
            <h3 className="text-base font-medium text-zinc-200 mb-2">
              등록된 프로젝트가 없습니다
            </h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              위의 입력 폼에서 <span className="font-medium text-zinc-300">프로젝트 이름</span>과{' '}
              <span className="font-medium text-zinc-300">포트 번호</span>를 입력하세요
            </p>
          </div>
        )}

        {/* 하단 저작권 */}
        <div className="mt-6 text-center">
          <p className="text-zinc-600 text-xs">
            © {new Date().getFullYear()} CS & Company. All rights reserved.
          </p>
        </div>
        </>}
      </div>
    </div>
  );
}

export default App;
