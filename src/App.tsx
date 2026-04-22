import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Server, Trash2, Plus, ExternalLink, Terminal, ArrowUpDown, Pencil, Check, X as XIcon, Play, Square, Rocket, FolderOpen, Upload, Download, Folder, FilePlus, Package, RefreshCw, FileText, RotateCw, Globe, Github, SquareTerminal, Info, Monitor, BookMarked, Cloud, CloudUpload, CloudDownload, Search, Sparkles, Settings, GitPullRequest, Copy, GitBranch, GitCommit, Star, BookOpen, ChevronDown, ChevronUp, StickyNote, Clock } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { createClient } from '@supabase/supabase-js';
import PortalManager, { type PortalActions } from './PortalManager';
import SetupWizard from './SetupWizard';
import { savePushSnapshot, fetchPushHistory, fetchSnapshotRows, type PushSnapshot } from './pushHistory';

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

  async gitPull(folderPath: string): Promise<string> {
    const baseUrl = isTauri() ? 'http://localhost:3001' : '';
    const response = await fetch(`${baseUrl}/api/git-pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath })
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return result.output as string;
  },

  async gitPush(folderPath: string): Promise<string> {
    const baseUrl = isTauri() ? 'http://localhost:3001' : '';
    const response = await fetch(`${baseUrl}/api/git-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath })
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return result.output as string;
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
    window.open(url, '_blank');
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

  async gitWorktreeAdd(folderPath: string, branchName: string, worktreePath?: string): Promise<{ path: string }> {
    if (isTauri()) {
      const path = await invoke<string>('git_worktree_add', { folderPath, branchName, worktreePath: worktreePath ?? null });
      return { path };
    }
    const res = await fetch('/api/git-worktree-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath, branchName, worktreePath }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return { path: data.path };
  },

  async gitWorktreeRemove(worktreePath: string): Promise<void> {
    if (isTauri()) {
      return invoke('git_worktree_remove', { worktreePath });
    }
    const res = await fetch('/api/git-worktree-remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worktreePath }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
  },

  async gitMergeBranch(folderPath: string, branchName: string): Promise<string> {
    if (isTauri()) {
      return invoke<string>('git_merge_branch', { folderPath, branchName });
    }
    const res = await fetch('/api/git-merge-branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath, branchName }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.output ?? '';
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

  async checkWsl(): Promise<{ status: string }> {
    if (isTauri()) return invoke<{ status: string }>('check_wsl');
    const res = await fetch('/api/check-wsl');
    return res.json();
  },

  async installWsl(): Promise<string> {
    if (isTauri()) return invoke<string>('install_wsl');
    throw new Error('WSL 설치는 설치된 앱에서만 가능합니다');
  },

  async installWslTmux(): Promise<string> {
    if (isTauri()) return invoke<string>('install_wsl_tmux');
    const res = await fetch('/api/install-wsl-tmux', { method: 'POST' });
    const d = await res.json();
    if (!d.success) throw new Error(d.error);
    return d.message ?? 'tmux 설치 완료';
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

  async suggestNameAndCategory(folderPath: string, name: string): Promise<{ name: string | null; category: string | null }> {
    try {
      const res = await fetch('/api/suggest-name-and-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath, name }),
      });
      if (!res.ok) return { name: null, category: null };
      return res.json();
    } catch { return { name: null, category: null }; }
  },

  async suggestBatch(ports: Array<{ id: string; folderPath: string; name: string; aiName?: string }>): Promise<Array<{ id: string; name: string | null; category: string | null }>> {
    try {
      const res = await fetch('/api/suggest-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ports }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.results ?? [];
    } catch { return []; }
  },
};

const CLAUDE_AI_NAME_PROMPT = `포트관리기의 프로젝트 목록에 "AI 추천 이름(aiName)"과 "카테고리(category)"를 채워줘.

## 대상 파일
~/Library/Application Support/com.portmanager.portmanager/ports.json

## 절차

1. **백업 먼저**: 쓰기 전에 반드시 백업 생성 (코드 한 줄로 충분).
   \`cp "$HOME/Library/Application Support/com.portmanager.portmanager/ports.json" "$HOME/Library/Application Support/com.portmanager.portmanager/ports.json.bak"\`

2. **읽기**: JSON을 파싱해서 배열을 메모리에 로드.

3. **각 항목에 aiName + category 설정**:
   - 이미 \`aiName\`이 있으면 건드리지 말 것 (idempotent — 재실행해도 기존 별칭 유지)
   - 이미 \`category\`가 있으면 건드리지 말 것
   - 없는 항목에만 새로 생성
   - 참고 필드: name, folderPath(basename), description, githubUrl, deployUrl, commandPath, terminalCommand

4. **aiName 규칙**:
   - 2~4 단어의 짧은 영어 (공백 구분, 예: "port manager", "tax calculator", "link page generator")
   - 프로젝트의 핵심 기능을 드러내는 키워드
   - 한국어 프로젝트는 의미를 영어로 번역
   - 이미 영어 이름이면 더 검색 친화적인 키워드 한 개로 압축
   - 모두 소문자

5. **category 규칙**:
   - 단일 소문자 영어 단어 (예: converter, dashboard, manager, tracker, bot, guide, calculator, automation, monitor, generator)
   - 프로젝트가 **무엇을 하는지** 핵심을 담을 것
   - aiName을 primary signal로 참고

6. **필드 보존 규칙 (매우 중요)**:
   - 다음 필드는 **원본 값 그대로 유지**해야 함 — 존재한다면 삭제/수정 금지:
     id, name, port, commandPath, terminalCommand, folderPath, deployUrl, githubUrl, worktreePath, description, isRunning
   - \`worktreePath: null\` 같은 명시적 null 값도 그대로 유지 (삭제 금지)
   - \`isRunning: false\` 같은 boolean도 그대로 유지
   - 원래 없던 필드를 새로 추가하지 말 것 (aiName, category 제외)

7. **원자적 쓰기 (atomic write)**:
   - 임시 파일에 먼저 쓴 후 rename으로 교체 (중간 인터럽트 시 원본 손상 방지)
   - 예시 절차:
     a. \`ports.json.tmp\`에 전체 JSON 직렬화 (2-space indent)
     b. fs.rename(\`ports.json.tmp\`, \`ports.json\`)
   - 들여쓰기는 원본과 동일하게 2-space

8. **검증**:
   - 쓰기 후 다시 읽어서 파싱 가능한지 확인
   - 항목 수가 원본과 동일한지 확인
   - 파싱 실패 시 백업(\`.bak\`)에서 복원

9. **보고**: 완료 후 한 줄로 "N개 항목에 aiName 추가, M개 category 추가, 총 K개 검증 완료" 형식으로 보고.

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
  favorite?: boolean;
  isRunning?: boolean;
  sourceDeviceId?: string; // device_id from Supabase — used to prevent cross-device overwrite on push
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
  const label = item.aiName || item.name;
  return label.replace(/[\s/\\:*?"<>|]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'unnamed';
};

/** POSIX `/...` 과 Windows `C:\...` 둘 다 절대경로로 인정 */
const isAbsolutePath = (p: string): boolean => /^(\/|[A-Za-z]:[\\/])/.test(p);

/**
 * 워크트리용 다음 사용 가능한 포트.
 * mainPort가 있으면 mainPort×10 + 1,2,3... 순으로 탐색 (예: 9025 → 90251, 90252...)
 * mainPort 없으면 10001+ 범위에서 탐색
 */
const getNextWorktreePort = (ports: PortInfo[], mainPort?: number): number => {
  const used = new Set(ports.map(p => p.port).filter((p): p is number => p != null));
  if (mainPort) {
    const base = mainPort * 10;
    if (base <= 65534) {
      for (let i = 1; i <= 9; i++) {
        if (!used.has(base + i)) return base + i;
      }
    }
  }
  for (let p = 10001; p <= 19999; p++) {
    if (!used.has(p)) return p;
  }
  return 10001;
};

/**
 * 워크트리 경로 기반 안정적인 포트 할당.
 * 알파벳순 정렬 인덱스 대신 경로 해시를 사용해 새 워크트리 추가 시 기존 포트 유지.
 * 범위: 10001–10499
 */
const worktreePortFromPath = (worktreePath: string, usedPorts: Set<number>): number => {
  const name = worktreePath.split('/').pop() ?? worktreePath;
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) >>> 0;
  const base = 10001 + (h % 499);
  for (let p = base; p <= 10499; p++) { if (!usedPorts.has(p)) return p; }
  for (let p = 10001; p < base; p++) { if (!usedPorts.has(p)) return p; }
  return base;
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
    return {
      ...p, ...r,
      isRunning: p.isRunning,
      aiName: r.aiName ?? p.aiName,
      folderPath: p.folderPath ?? r.folderPath,
      commandPath: p.commandPath ?? r.commandPath,
      worktreePath: p.worktreePath ?? r.worktreePath,
    };
  });
  const localIds = new Set(local.map(p => p.id));
  const newFromRemote = remote.filter(p => !localIds.has(p.id));
  return [...merged, ...newFromRemote];
};

// 다른 기기 Pull 전용 병합: name 기준으로 매칭, 새 항목만 새 ID로 추가
// 경로(folderPath, commandPath)는 기기마다 다르므로 기존 로컬 것 유지
const mergePortsFromOtherDevice = (local: PortInfo[], remote: PortInfo[]): PortInfo[] => {
  const result = new Map(local.map(p => [p.id, p]));
  const localByName = new Map(local.map(p => [p.name?.toLowerCase(), p.id]));

  for (const r of remote) {
    const key = r.name?.toLowerCase();
    if (!key) continue;
    const existingId = localByName.get(key);
    if (existingId) {
      // 이미 있는 프로젝트 → 공유 메타만 업데이트, 경로는 로컬 유지
      const existing = result.get(existingId)!;
      result.set(existingId, {
        ...existing,
        port: r.port ?? existing.port,
        deployUrl: r.deployUrl ?? existing.deployUrl,
        githubUrl: r.githubUrl ?? existing.githubUrl,
        description: r.description ?? existing.description,
        category: r.category ?? existing.category,
      });
    } else {
      // 새 프로젝트 → 새 ID 발급, 경로는 비워둠 (이 기기에서 직접 설정 필요)
      const newId = crypto.randomUUID();
      const newPort: PortInfo = {
        ...r,
        id: newId,
        folderPath: undefined,
        commandPath: undefined,
        isRunning: false,
      };
      result.set(newId, newPort);
      localByName.set(key, newId);
    }
  }
  return Array.from(result.values());
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

// localStorage credential fallback helper — works even when API server is offline
const getPortalCredentials = async (): Promise<{ supabaseUrl?: string; supabaseAnonKey?: string; deviceId?: string; deviceName?: string }> => {
  try {
    const res = await Promise.race([
      fetch('/api/portal'),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
    ]) as Response;
    if (res.ok) {
      const data = await res.json();
      // Cache credential fields including deviceName
      if (data.supabaseUrl) {
        localStorage.setItem('portalCreds', JSON.stringify({
          supabaseUrl: data.supabaseUrl,
          supabaseAnonKey: data.supabaseAnonKey,
          deviceId: data.deviceId,
          deviceName: data.deviceName,
        }));
      }
      return data;
    }
  } catch {}
  // Fallback to localStorage cache
  try {
    const cached = localStorage.getItem('portalCreds');
    if (cached) return JSON.parse(cached);
  } catch {}
  return {};
};

function MemoAccordionItem({ portId, memo, onSave }: {
  portId: string;
  memo?: { content: string; updatedAt: string };
  onSave: (portId: string, content: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(memo?.content ?? '');
  React.useEffect(() => { setDraft(memo?.content ?? ''); }, [memo?.content]);
  return (
    <div className="border-t border-stone-800/60 mt-2" onClick={e => e.stopPropagation()}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className="flex items-center gap-1.5 w-full px-1 py-1.5 text-xs text-zinc-500 hover:text-[#ede7dd]/90 transition-colors"
      >
        <StickyNote className="w-3 h-3" />
        <span>메모</span>
        {memo?.updatedAt && <span className="text-[#6b6459] text-[10px] ml-1">{memo.updatedAt}</span>}
        {open ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
      </button>
      {open && (
        <div className="px-1 pb-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            rows={3}
            placeholder="이 포트에 대한 메모를 입력하세요..."
            className="w-full px-2 py-1.5 bg-[#221f1b] border border-stone-700/50 rounded-lg text-xs text-[#ede7dd]/90 placeholder:text-[#6b6459] focus:outline-none focus:border-zinc-500 resize-y"
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-[#6b6459]">{memo?.updatedAt ? `수정: ${memo.updatedAt}` : '저장된 메모 없음'}</span>
            <button
              onClick={e => { e.stopPropagation(); onSave(portId, draft); }}
              className="px-2.5 py-1 bg-blue-600/80 hover:bg-blue-600 text-white text-[10px] rounded-lg transition-colors"
            >저장</button>
          </div>
        </div>
      )}
    </div>
  );
}

// WSL 설치/설정 안내 모달
function WslSetupModal({ status, onClose, onInstallTmux }: {
  status: string;
  onClose: () => void;
  onInstallTmux: () => void;
}) {
  const Step = ({ n, text }: { n: number; text: React.ReactNode }) => (
    <li className="flex gap-2">
      <span className="shrink-0 w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center mt-0.5">{n}</span>
      <span className="text-zinc-400">{text}</span>
    </li>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-[#221f1b] border border-stone-700/50 rounded-xl p-6 w-[460px] shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">
            {status === 'not_installed' ? '⚙️ WSL2 설치 필요' :
             status === 'no_distro'    ? '🐧 Ubuntu 설치 필요' :
             status === 'no_tmux'      ? '📦 tmux 설치 필요' : 'WSL2 설정'}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors"><XIcon size={16} /></button>
        </div>

        {status === 'not_installed' && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-400">Windows에서 tmux를 쓰려면 <strong className="text-[#ede7dd]">WSL2 + Ubuntu</strong>가 필요합니다.</p>
            <ol className="text-xs space-y-2 list-none">
              <Step n={1} text={<>아래 버튼 클릭 → UAC 허용 → <code className="text-[#ede7dd]/90 bg-[#221f1b] px-1 rounded">wsl --install</code> 자동 실행</>} />
              <Step n={2} text="설치 완료 후 PC 재시작" />
              <Step n={3} text="Ubuntu 첫 실행 시 사용자명/비밀번호 설정" />
              <Step n={4} text={<>Ubuntu 터미널에서: <code className="text-[#ede7dd]/90 bg-[#221f1b] px-1 rounded">sudo apt install tmux</code></>} />
              <Step n={5} text={<>Claude Code 설치: <code className="text-[#ede7dd]/90 bg-[#221f1b] px-1 rounded">npm i -g @anthropic-ai/claude-code</code></>} />
            </ol>
            <button
              onClick={async () => { await API.installWsl().catch(e => showToast(`WSL 설치 실패: ${String(e)}`, 'error')); onClose(); }}
              className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors font-medium"
            >🚀 WSL2 + Ubuntu 설치 시작 (관리자 권한 필요)</button>
          </div>
        )}

        {status === 'no_distro' && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-400">WSL2 커널은 있지만 <strong className="text-[#ede7dd]">Ubuntu가 없습니다</strong>. (Docker Desktop 전용 WSL만 감지됨)</p>
            <ol className="text-xs space-y-2 list-none">
              <Step n={1} text={<>아래 버튼 클릭 → UAC 허용 → <code className="text-[#ede7dd]/90 bg-[#221f1b] px-1 rounded">wsl --install -d Ubuntu</code> 실행</>} />
              <Step n={2} text="Ubuntu 첫 실행 시 사용자명/비밀번호 설정 완료" />
              <Step n={3} text={<>Ubuntu 터미널에서: <code className="text-[#ede7dd]/90 bg-[#221f1b] px-1 rounded">sudo apt install tmux</code></>} />
              <Step n={4} text={<>Claude Code 설치: <code className="text-[#ede7dd]/90 bg-[#221f1b] px-1 rounded">npm i -g @anthropic-ai/claude-code</code></>} />
            </ol>
            <button
              onClick={async () => { await API.installWsl().catch(e => showToast(`WSL 설치 실패: ${String(e)}`, 'error')); onClose(); }}
              className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors font-medium"
            >🐧 Ubuntu 설치 시작 (관리자 권한 필요)</button>
            <p className="text-[10px] text-[#6b6459]">또는 PowerShell에서 직접: <code className="text-zinc-500">wsl --install -d Ubuntu</code></p>
          </div>
        )}

        {status === 'no_tmux' && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-400">WSL2 Ubuntu는 준비됐지만 <strong className="text-[#ede7dd]">tmux가 없습니다</strong>. 자동 설치가 가능합니다.</p>
            <div className="bg-[#221f1b] rounded-lg p-3 text-xs text-[#ede7dd]/90 font-mono">sudo apt-get install -y tmux</div>
            <button
              onClick={() => { onInstallTmux(); onClose(); }}
              className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors font-medium"
            >📦 tmux 자동 설치</button>
            <p className="text-[10px] text-zinc-500">설치 후 다시 tmux 버튼을 누르면 됩니다. Claude Code도 WSL 안에 설치되어야 합니다: <code>npm i -g @anthropic-ai/claude-code</code></p>
            <button onClick={onClose} className="w-full px-3 py-2 bg-[#2a2520] hover:bg-zinc-600 text-white text-xs rounded-lg transition-colors">취소</button>
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiServerOnline, setApiServerOnline] = useState<boolean | null>(null);
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
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [activeTab, setActiveTab] = useState<'ports' | 'portal'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'portal' : 'ports'
  );
  const [openPortalSettings, setOpenPortalSettings] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [wslSetupStatus, setWslSetupStatus] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [memos, setMemos] = useState<Record<string, { content: string; updatedAt: string }>>({});
  const [sortBy, setSortBy] = useState<SortType>(
    () => (localStorage.getItem('portmanager-sortBy') as SortType) || 'recent'
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(
    () => (localStorage.getItem('portmanager-sortOrder') as 'asc' | 'desc') || 'desc'
  );
  const [filterType, setFilterType] = useState<'all' | 'with-port' | 'without-port'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [bypassPermissions, setBypassPermissions] = useState(
    () => localStorage.getItem('portmanager-bypassPermissions') !== 'false'
  );
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
  const [sidebarSection, setSidebarSection] = useState<string>('all');
  const [v3MenuOpenId, setV3MenuOpenId] = useState<string|null>(null);
  const [worktreePickerState, setWorktreePickerState] = useState<{ item: PortInfo; mode: 'tmux' | 'claude' } | null>(null);
  const [worktreePickerValue, setWorktreePickerValue] = useState('');
  // 머지 확인 모달
  const [mergeConfirm, setMergeConfirm] = useState<{ item: PortInfo; wt: WorktreeInfo; mainBranch: string; commits: string; stat: string; isDirty: boolean } | null>(null);
  const [mergeError, setMergeError] = useState<{ message: string; hasConflict: boolean; folderPath: string; item?: PortInfo; wt?: WorktreeInfo } | null>(null);
  const [mergeConflictFiles, setMergeConflictFiles] = useState<string[]>([]);
  const [mergePushConfirm, setMergePushConfirm] = useState<{ item: PortInfo; mainBranch: string } | null>(null);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [deleteWorktreeConfirm, setDeleteWorktreeConfirm] = useState<{ item: PortInfo; wt: WorktreeInfo } | null>(null);
  const [commitModal, setCommitModal] = useState<{ item: PortInfo; wt: WorktreeInfo; msg: string } | null>(null);
  const [detectedWorktrees, setDetectedWorktrees] = useState<WorktreeInfo[]>([]);
  const [expandedWorktreeIds, setExpandedWorktreeIds] = useState<Set<string>>(new Set());
  const [worktreeLists, setWorktreeLists] = useState<Record<string, WorktreeInfo[]>>({});
  const [worktreeNewBranch, setWorktreeNewBranch] = useState<Record<string, string>>({});
  const [worktreeLoading, setWorktreeLoading] = useState<Record<string, boolean>>({});
  const [wtPortStatuses, setWtPortStatuses] = useState<Record<number, boolean>>({});
  // wt.path → 실제 감지된 리스닝 포트 (find-worktree-port API 결과)
  const [wtActualPorts, setWtActualPorts] = useState<Record<string, number>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAiEnriching, setIsAiEnriching] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isPushingPorts, setIsPushingPorts] = useState(false);
  const [showPortsHistory, setShowPortsHistory] = useState(false);
  const [portsHistoryList, setPortsHistoryList] = useState<PushSnapshot[]>([]);
  const [portsHistoryLoading, setPortsHistoryLoading] = useState(false);
  const [portsHistoryRestoring, setPortsHistoryRestoring] = useState<string | null>(null);
  const [remappingPorts, setRemappingPorts] = useState<PortInfo[]>([]);
  const [remappingPaths, setRemappingPaths] = useState<Record<string, string>>({});
  const [isBuilding, setIsBuilding] = useState(false);
  const [showBuildLog, setShowBuildLog] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; body?: string | null } | null>(null);
  const [canAutoInstall, setCanAutoInstall] = useState(false);
  const [buildLogs, setBuildLogs] = useState<string[]>([]);
  const [buildType, setBuildType] = useState<'app' | 'dmg' | 'windows'>('app');
  const lastLogIndexRef = useRef<number>(0);
  const isBuildingRef = useRef(false);
  const buildLogContainerRef = useRef<HTMLDivElement>(null);
  const [workspaceRoots, setWorkspaceRoots] = useState<WorkspaceRoot[]>([]);
  const [workspaceRootsOpen, setWorkspaceRootsOpen] = useState(false);
  const [visitCounts, setVisitCounts] = useState<{ portId: string; count: number }[]>([]);
  const [visitWindow, setVisitWindow] = useState<'alltime' | 'weekly' | 'daily'>('alltime');
  const [highlightedPortId, setHighlightedPortId] = useState<string | null>(null);
  const dirHandlesRef = useRef<Map<string, FileSystemDirectoryHandle>>(new Map());
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [activeRootId, setActiveRootId] = useState<string | null>(null);
  const [registerAsProject, setRegisterAsProject] = useState(true);
  const portalConfigRef = useRef<any>(null);
  const portalActionsRef = useRef<PortalActions | null>(null);
  const autoPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fix P2g: gate delete pass — only safe to delete remote rows after a successful auto-pull
  // (otherwise local state has only this Mac's rows and would delete other Macs' remote data)
  const autopullSucceeded = useRef(false);
  const appLogRef = useRef<string[]>([]);
  const [logCopied, setLogCopied] = useState(false);

  // 자동 업데이트 체크 (Tauri 전용)
  useEffect(() => {
    if (!isTauri()) return;
    (async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (update) setUpdateInfo({ version: update.version, body: update.body });
      } catch {
        // 업데이트 서버 미설정 또는 네트워크 오류 — 무시
      }
    })();
  }, []);

  // API 서버 헬스 체크 (웹 모드 전용)
  useEffect(() => {
    if (isTauri()) return;
    const check = async () => {
      try {
        const res = await Promise.race([
          fetch('/api/ports'),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000)),
        ]) as Response;
        setApiServerOnline(res.ok);
      } catch {
        setApiServerOnline(false);
      }
    };
    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, []);

  // 앱 로그 캡처 (console.error / warn + 미처리 예외)
  useEffect(() => {
    const ts = () => new Date().toTimeString().slice(0, 8);
    const push = (line: string) => {
      appLogRef.current.push(line);
      if (appLogRef.current.length > 300) appLogRef.current.shift();
    };
    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
    console.error = (...a) => { push(`[ERR ${ts()}] ${a.map(String).join(' ')}`); origError(...a); };
    console.warn = (...a) => { push(`[WRN ${ts()}] ${a.map(String).join(' ')}`); origWarn(...a); };
    const onErr = (e: ErrorEvent) => push(`[UNCAUGHT ${ts()}] ${e.message} @ ${e.filename}:${e.lineno}`);
    const onRej = (e: PromiseRejectionEvent) => push(`[UNHANDLED ${ts()}] ${String(e.reason)}`);
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      console.error = origError; console.warn = origWarn;
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, []);

  const handleCopyLog = async () => {
    const text = appLogRef.current.length ? appLogRef.current.join('\n') : '(로그 없음)';
    await navigator.clipboard.writeText(text);
    setLogCopied(true);
    setTimeout(() => setLogCopied(false), 2000);
  };

  // 토스트 배너 표시 함수
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);

    // 3초 후 자동으로 제거
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 3000);
  };

  // AI이름 적용 프롬프트 — ports.json 경로와 함께 클립보드에 복사
  const handleCopyAiNamePrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(CLAUDE_AI_NAME_PROMPT);
      showToast('AI이름 프롬프트 복사됨 — Claude Code에 붙여넣기 하세요', 'success');
    } catch {
      showToast('클립보드 복사 실패', 'error');
    }
  }, []);

  const loadWorktrees = useCallback(async (portId: string, folderPath: string) => {
    setWorktreeLoading(prev => ({ ...prev, [portId]: true }));
    try {
      const list = await API.listGitWorktrees(folderPath);
      setWorktreeLists(prev => ({ ...prev, [portId]: list }));
      // Check actual port status for each non-main worktree
      const usedPortsSnap = new Set(
        (JSON.parse(localStorage.getItem('ports_cache') || '[]') as {port?:number}[])
          .map(p => p.port).filter((p): p is number => p != null)
      );
      const baseUrl = isTauri() ? 'http://localhost:3001' : '';
      const checks = list
        .filter(wt => !wt.is_main)
        .map(async wt => {
          // 먼저 프로세스 CWD 기반으로 실제 리스닝 포트 탐색
          let actualPort: number | null = null;
          try {
            const r = await fetch(`${baseUrl}/api/find-worktree-port`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ folderPath: wt.path }),
            });
            const d = await r.json();
            if (d.success && d.port) actualPort = d.port;
          } catch { /* ignore */ }
          const hashPort = worktreePortFromPath(wt.path, usedPortsSnap);
          const isRunning = actualPort != null
            ? true
            : await API.checkPortStatus(hashPort).catch(() => false);
          return { wtPath: wt.path, wtPort: actualPort ?? hashPort, isRunning };
        });
      const results = await Promise.all(checks);
      setWtPortStatuses(prev => {
        const next = { ...prev };
        results.forEach(({ wtPort, isRunning }) => { next[wtPort] = isRunning; });
        return next;
      });
      setWtActualPorts(prev => {
        const next = { ...prev };
        results.forEach(({ wtPath, wtPort, isRunning }) => {
          if (isRunning) next[wtPath] = wtPort;
          else delete next[wtPath];
        });
        return next;
      });
    } catch {
      setWorktreeLists(prev => ({ ...prev, [portId]: [] }));
    } finally {
      setWorktreeLoading(prev => ({ ...prev, [portId]: false }));
    }
  }, []);

  const toggleWorktreePanel = useCallback((portId: string, folderPath?: string) => {
    setExpandedWorktreeIds(prev => {
      const next = new Set(prev);
      if (next.has(portId)) {
        next.delete(portId);
      } else {
        next.add(portId);
        if (folderPath) loadWorktrees(portId, folderPath);
      }
      return next;
    });
  }, [loadWorktrees]);

  const handleWorktreeAdd = useCallback(async (item: PortInfo) => {
    const branchName = worktreeNewBranch[item.id]?.trim();
    if (!branchName || !item.folderPath) return;
    try {
      const result = await API.gitWorktreeAdd(item.folderPath, branchName);
      showToast(`워크트리 생성됨: ${result.path.split('/').pop()}`, 'success');
      setWorktreeNewBranch(prev => ({ ...prev, [item.id]: '' }));
      await loadWorktrees(item.id, item.folderPath);
    } catch (e) {
      showToast(`워크트리 생성 실패: ${e}`, 'error');
    }
  }, [worktreeNewBranch, loadWorktrees]);

  const handleWorktreeRemove = useCallback((item: PortInfo, wt: WorktreeInfo) => {
    if (!item.folderPath) return;
    setDeleteWorktreeConfirm({ item, wt });
  }, []);

  const executeWorktreeDelete = useCallback(async () => {
    if (!deleteWorktreeConfirm) return;
    const { item, wt } = deleteWorktreeConfirm;
    const name = wt.path.split('/').pop();
    setDeleteWorktreeConfirm(null);
    try {
      await API.gitWorktreeRemove(wt.path);
      showToast(`워크트리 제거됨: ${name}`, 'success');
      await loadWorktrees(item.id, item.folderPath!);
    } catch (e) {
      showToast(`워크트리 제거 실패: ${e}`, 'error');
    }
  }, [deleteWorktreeConfirm, loadWorktrees]);

  const handleWorktreeMerge = useCallback(async (item: PortInfo, wt: WorktreeInfo) => {
    if (!item.folderPath) { showToast('folderPath가 없습니다', 'error'); return; }
    if (!wt.branch) { showToast('브랜치 이름을 알 수 없습니다 (워크트리 새로고침 후 재시도)', 'error'); return; }
    // 프리뷰 로드 후 확인 모달 표시
    setMergeLoading(true);
    try {
      const baseUrl = isTauri() ? 'http://localhost:3001' : '';
      const res = await fetch(`${baseUrl}/api/git-merge-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: item.folderPath, branchName: wt.branch }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 진행 중인 머지 → 바로 에러 모달 (Abort 버튼 포함)
        if (data.hasMergeInProgress) {
          setMergeError({ message: data.error, hasConflict: true, folderPath: item.folderPath!, item, wt });
          // load conflicted files
          fetch(`${baseUrl}/api/git-conflicts`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderPath: item.folderPath }),
          }).then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); }).then(d => setMergeConflictFiles(d.files ?? [])).catch(e => showToast(`충돌 파일 로드 실패: ${String(e)}`, 'error'));
        } else {
          throw new Error(data.error ?? '프리뷰 실패');
        }
        return;
      }
      setMergeConfirm({ item, wt, mainBranch: data.mainBranch, commits: data.commits, stat: data.stat, isDirty: data.isDirty });
    } catch (e) {
      showToast(`프리뷰 실패: ${(e as Error).message}`, 'error');
    } finally {
      setMergeLoading(false);
    }
  }, []);

  const executeMerge = useCallback(async () => {
    if (!mergeConfirm) return;
    const { item, wt } = mergeConfirm;
    setMergeLoading(true);
    try {
      const output = await API.gitMergeBranch(item.folderPath!, wt.branch!);
      if (import.meta.env.DEV && output) console.log('[Merge output]', output);
      showToast(`머지 완료: ${wt.branch} → ${mergeConfirm.mainBranch}`, 'success');
      setMergeConfirm(null);
      setMergePushConfirm({ item, mainBranch: mergeConfirm.mainBranch });
      setDeleteWorktreeConfirm({ item, wt });
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      setMergeConfirm(null);
      const hasConflict = msg.includes('충돌') || msg.includes('CONFLICT');
      setMergeError({ message: msg, hasConflict, folderPath: item.folderPath!, item, wt });
      if (hasConflict) {
        const baseUrl2 = isTauri() ? 'http://localhost:3001' : '';
        fetch(`${baseUrl2}/api/git-conflicts`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderPath: item.folderPath }),
        }).then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); }).then(d => setMergeConflictFiles(d.files ?? [])).catch(e => showToast(`충돌 파일 로드 실패: ${String(e)}`, 'error'));
      }
    } finally {
      setMergeLoading(false);
    }
  }, [mergeConfirm, loadWorktrees]);

  const openTmuxClaude = (item: PortInfo) => {
    recordVisit(item.id);
    setWorktreePickerState({ item, mode: 'tmux' });
    // Only pre-fill if saved path is absolute — relative names (e.g. '합산') are invalid for -w
    // Windows: C:\... / POSIX: /... 둘 다 인정
    setWorktreePickerValue((item.worktreePath && isAbsolutePath(item.worktreePath)) ? item.worktreePath : '');
    setDetectedWorktrees([]);
    if (item.folderPath) {
      API.listGitWorktrees(item.folderPath)
        .then(list => {
          setDetectedWorktrees(list);
          const savedPath = item.worktreePath?.startsWith('/') ? item.worktreePath : '';
          if (savedPath && !list.some(wt => wt.path === savedPath)) {
            setWorktreePickerValue('');
          }
        })
        .catch(e => { if (import.meta.env.DEV) console.warn('[worktreePicker] listGitWorktrees failed:', e); });
    }
  };

  const checkWslReady = async (): Promise<boolean> => {
    if (!isWindows()) return true;
    try {
      const { status } = await API.checkWsl();
      if (status === 'ready') return true;
      setWslSetupStatus(status);
      return false;
    } catch {
      return true; // WSL 확인 실패 시 그냥 진행
    }
  };

  const handleInstallWslTmux = async () => {
    showToast('tmux 설치 중...', 'success');
    try {
      await API.installWslTmux();
      showToast('tmux 설치 완료!', 'success');
    } catch (e) {
      showToast(`tmux 설치 실패: ${e}`, 'error');
    }
  };

  const openTmuxClaudeFresh = async (item: PortInfo) => {
    if (!await checkWslReady()) return;
    const baseName = getSessionName(item);
    const wtSuffix = item.worktreePath ? `-${item.worktreePath.replace(/\/$/, '').split('/').pop()}` : '';
    const sessionName = baseName + wtSuffix;
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
    if (!await checkWslReady()) return;
    const baseName = getSessionName(item);
    const wtSuffix = worktreePath ? `-${worktreePath.replace(/\/$/, '').split('/').pop()}` : '';
    const sessionName = baseName + wtSuffix;
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
    recordVisit(item.id);
    setWorktreePickerState({ item, mode: 'claude' });
    setWorktreePickerValue((item.worktreePath && isAbsolutePath(item.worktreePath)) ? item.worktreePath : '');
    setDetectedWorktrees([]);
    if (item.folderPath) {
      API.listGitWorktrees(item.folderPath)
        .then(list => {
          setDetectedWorktrees(list);
          const savedPath = item.worktreePath?.startsWith('/') ? item.worktreePath : '';
          if (savedPath && !list.some(wt => wt.path === savedPath)) {
            setWorktreePickerValue('');
          }
        })
        .catch(e => { if (import.meta.env.DEV) console.warn('[worktreePicker] listGitWorktrees failed:', e); });
    }
  };

  const _executeTerminalClaude = async (item: PortInfo, worktreePath: string | undefined) => {
    try {
      const displayName = item.aiName || item.name;
      if (bypassPermissions) {
        await API.openTerminalClaudeBypass(item.folderPath, displayName, worktreePath);
        showToast(`Terminal에서 Claude (bypass) 실행 중`, 'success');
      } else {
        await API.openTerminalClaude(item.folderPath, displayName, worktreePath);
        showToast(`Terminal에서 Claude 실행 중`, 'success');
      }
    } catch (e) {
      showToast(`Claude 실행 실패: ${e}`, 'error');
    }
  };

  const executeWithWorktree = async (worktreePath: string | undefined) => {
    if (!worktreePickerState) return;
    const { item, mode } = worktreePickerState;

    setWorktreePickerState(null);
    setDetectedWorktrees([]);

    let resolvedPath = worktreePath;

    // 브랜치명(상대경로)을 입력한 경우 → git worktree 자동 생성
    // Windows(C:\...) / POSIX(/...) 절대경로는 제외
    if (worktreePath && !isAbsolutePath(worktreePath) && item.folderPath) {
      try {
        showToast(`워크트리 생성 중: ${worktreePath}...`, 'success');
        const result = await API.gitWorktreeAdd(item.folderPath, worktreePath);
        resolvedPath = result.path;
        // 워크트리 목록 갱신
        loadWorktrees(item.id, item.folderPath);
        showToast(`워크트리 생성 완료: ${resolvedPath}`, 'success');
      } catch (e) {
        showToast(`워크트리 생성 실패: ${e}`, 'error');
        return;
      }
    }

    // save the resolved absolute path back to the item
    if (resolvedPath !== undefined) {
      setPorts(prev => prev.map(p => p.id === item.id ? { ...p, worktreePath: resolvedPath || undefined } : p));
    }

    const updatedItem = { ...item, worktreePath: resolvedPath };
    if (mode === 'tmux') {
      await _executeTmuxClaude(updatedItem, resolvedPath);
    } else {
      await _executeTerminalClaude(updatedItem, resolvedPath);
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
              if (import.meta.env.DEV) console.log(`[App] Retrying port load (${attempt}/2)...`);
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
        const isWinPath = (p: string) => /^[A-Za-z]:[/\\]/.test(p);
        const isMacPath = (p: string) => /^\/Users\/|^\/home\//.test(p);
        const isCurrentPlatformPath = (port: PortInfo) => {
          const paths = [port.folderPath, port.commandPath].filter(Boolean) as string[];
          if (paths.length === 0) return true;
          const isWin = (typeof process !== 'undefined' && process.platform === 'win32') || /Win/.test(navigator.platform ?? '');
          if (isWin) return paths.every(p => !isMacPath(p));
          return paths.every(p => !isWinPath(p));
        };
        const updatedData = data
          .filter(isCurrentPlatformPath)
          .map((port: PortInfo) => {
            if (port.commandPath && !port.folderPath) {
              const lastSlashIndex = port.commandPath.lastIndexOf('/');
              if (lastSlashIndex !== -1) {
                return { ...port, folderPath: port.commandPath.substring(0, lastSlashIndex) };
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
              let portsQuery = supabase.from('ports').select('*');
              if (portalData.deviceId) portsQuery = portsQuery.eq('device_id', portalData.deviceId);
              let { data: remoteData, error } = await withTimeout(portsQuery, 10_000);
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
                  favorite: row.favorite ?? false,
                  isRunning: false,
                  sourceDeviceId: row.device_id ?? undefined,
                }));
                const merged = mergePorts(updatedData, remoteRows);
                setPorts(merged);
                await API.savePorts(merged);
                // 메모 복원
                const pulledMemos: Record<string, { content: string; updatedAt: string }> = {};
                remoteData.forEach((row: any) => {
                  if (row.memo != null) pulledMemos[row.id] = { content: row.memo, updatedAt: row.memo_updated_at ?? '' };
                });
                if (Object.keys(pulledMemos).length > 0) setMemos(prev => ({ ...prev, ...pulledMemos }));
              }

              hasInitiallyLoaded.current = true; // Fix P2c: set after pull completes
              autopullSucceeded.current = true;  // Fix P2g: mark pull succeeded → delete pass is now safe

              // workspace_roots 자동 Pull (빈 결과면 로컬 덮어쓰기 방지)
              const deviceId = portalData.deviceId;
              if (deviceId) {
                const { data: rootData } = await supabase
                  .from('workspace_roots').select('*').eq('device_id', deviceId);
                if (rootData && rootData.length > 0) {
                  const restoredRoots: WorkspaceRoot[] = rootData
                    .filter((r: any) => !r.path?.startsWith('__device__'))
                    .map((r: any) => ({ id: r.id, name: r.name, path: r.path }));
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
          } else {
            // No credentials at startup → still enable auto-push so it fires once credentials are added
            hasInitiallyLoaded.current = true;
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

  // 방문 기록 초기 로드 + window 변경 시 재조회
  useEffect(() => {
    const timer = setTimeout(() => fetchVisitCounts(visitWindow), 2000);
    return () => clearTimeout(timer);
  }, [visitWindow]);

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
  useEffect(() => { localStorage.setItem('portmanager-bypassPermissions', String(bypassPermissions)); }, [bypassPermissions]);
  useEffect(() => { isBuildingRef.current = isBuilding; }, [isBuilding]);
  useEffect(() => {
    if (buildLogContainerRef.current) {
      buildLogContainerRef.current.scrollTop = buildLogContainerRef.current.scrollHeight;
    }
  }, [buildLogs]);

  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setActiveTab('portal');
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

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
      if (ports.length === 0) return; // 빈 배열로 stale-delete 방지
      try {
        const supabase = getSupabaseClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
        const deviceId = cfg.deviceId ?? null;
        const deviceNameVal = cfg.deviceName ?? null;
        // 다른 기기 소유 포트는 push 제외 (sourceDeviceId가 내 deviceId와 다른 경우)
        const ownedPorts = ports.filter(p => !p.sourceDeviceId || p.sourceDeviceId === deviceId);
        const rows = ownedPorts.map(p => ({
          id: p.id,
          name: p.name,
          port: p.port ?? null,
          command_path: p.commandPath ?? null,
          terminal_command: p.terminalCommand ?? null,
          folder_path: p.folderPath ?? null,
          deploy_url: p.deployUrl ?? null,
          github_url: p.githubUrl ?? null,
          device_id: deviceId,
          device_name: deviceNameVal,
          memo: memos[p.id]?.content ?? null,
          memo_updated_at: memos[p.id]?.updatedAt ?? null,
        }));
        let upsertErr = (await supabase.from('ports').upsert(rows, { onConflict: 'id' })).error;
        if (upsertErr?.message?.includes('device_id') || upsertErr?.message?.includes('device_name')) {
          const rowsWithout = rows.map(({ device_id, device_name, ...rest }: any) => rest);
          upsertErr = (await supabase.from('ports').upsert(rowsWithout, { onConflict: 'id' })).error;
        }
        if (upsertErr) throw new Error(upsertErr.message);
        // Fix P2: delete remote rows whose IDs are no longer in local list
        // Fix P2g: skip delete pass if auto-pull never succeeded — local state may be incomplete
        // Step 4: scope stale-delete to this device only to avoid clobbering other devices
        if (autopullSucceeded.current) {
          const localIds = ownedPorts.map(p => p.id);
          let remoteQuery = supabase.from('ports').select('id');
          if (deviceId) remoteQuery = remoteQuery.eq('device_id', deviceId);
          const { data: remoteRows } = await remoteQuery;
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
      if (import.meta.env.DEV) console.log('[App] Saving ports, count:', ports.length);
      const savePortsData = async () => {
        try {
          await API.savePorts(ports);
          if (import.meta.env.DEV) console.log('[App] Ports saved successfully');
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
      if (import.meta.env.DEV) console.log('[App] Window focused, reloading ports data...');
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
      if (port && !/^\d+$/.test(port)) {
        showToast('포트 번호는 정수만 입력 가능합니다', 'error');
        return;
      }
      const portNum = port ? parseInt(port) : undefined;
      if (portNum !== undefined && (isNaN(portNum) || portNum < 1 || portNum > 65535)) {
        showToast('포트 번호는 1~65535 사이여야 합니다', 'error');
        return;
      }
      const duplicatePort = portNum && ports.find(p => p.port === portNum);
      if (duplicatePort) {
        showToast(`포트 ${portNum}은 이미 "${duplicatePort.name}"에서 사용 중입니다`, 'error');
        return;
      }
      // commandPath가 있으면 자동으로 폴더 경로 추출 (Windows \ + POSIX / 모두 지원)
      let autoFolderPath = folderPath;
      if (commandPath && !folderPath) {
        const lastSepIndex = Math.max(commandPath.lastIndexOf('/'), commandPath.lastIndexOf('\\'));
        if (lastSepIndex !== -1) {
          autoFolderPath = commandPath.substring(0, lastSepIndex);
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
    setDeleteConfirmId(id);
  };

  const handleConfirmDelete = (id: string) => {
    setPorts(prev => prev.filter(p => p.id !== id));
    setMemos(prev => { const next = { ...prev }; delete next[id]; return next; });
    setDeleteConfirmId(null);
  };

  const handleSaveMemo = (portId: string, content: string) => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const updatedAt = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    setMemos(prev => ({ ...prev, [portId]: { content, updatedAt } }));
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

  const toggleFavorite = useCallback(async (item: PortInfo) => {
    const updated = ports.map(p => p.id === item.id ? { ...p, favorite: !p.favorite } : p);
    setPorts(updated);
    await API.savePorts(updated);
  }, [ports]);

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
        recordVisit(item.id);
        if (item.port) {
          window.open(`http://localhost:${item.port}`, '_blank');
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
              if (import.meta.env.DEV) console.log('[Import] Explicitly saving ports after import');
              await API.savePorts(updatedPorts);
              if (import.meta.env.DEV) console.log('[Import] Ports saved successfully');

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

                    if (import.meta.env.DEV) console.log('[Import] Explicitly saving ports after import');
                    await API.savePorts(updatedPorts);
                    if (import.meta.env.DEV) console.log('[Import] Ports saved successfully');

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
      let portalData: any;
      if (isTauri()) {
        portalData = await invoke('load_portal');
      } else {
        portalData = await getPortalCredentials();
      }
      if (portalData?.supabaseUrl) portalConfigRef.current = portalData;

      const { supabaseUrl, supabaseAnonKey } = portalData ?? {};
      if (!supabaseUrl || !supabaseAnonKey) {
        showToast('Supabase 설정이 없습니다. 포털 탭에서 먼저 설정하세요', 'error');
        return;
      }

      const supabase = getSupabaseClient(supabaseUrl, supabaseAnonKey);
      // 설정의 "다른 기기 보기"가 선택돼 있으면 그 기기 기준으로 Pull
      const pullDeviceId = portalData?.viewingDeviceId || portalData?.deviceId || null;
      const isOtherDevice = portalData?.viewingDeviceId && portalData.viewingDeviceId !== portalData?.deviceId;

      let portsQuery = supabase.from('ports').select('*');
      if (pullDeviceId) portsQuery = portsQuery.eq('device_id', pullDeviceId);
      let { data, error } = await withTimeout(portsQuery, 30_000);

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        showToast('Supabase에 저장된 포트가 없습니다', 'error');
        return;
      }

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
        favorite: row.favorite ?? false,
        isRunning: false,
        sourceDeviceId: row.device_id ?? undefined,
      }));

      // 다른 기기 Pull → name 기준 병합 + 새 ID 발급 (ID 충돌 방지)
      // 내 기기 Pull → ID 기준 병합 (기존 동작 유지)
      const merged = isOtherDevice
        ? mergePortsFromOtherDevice(ports, remoteRows)
        : mergePorts(ports, remoteRows);
      setPorts(merged);
      await API.savePorts(merged);

      // 메모 복원
      const pulledMemos: Record<string, { content: string; updatedAt: string }> = {};
      (data ?? []).forEach((row: any) => {
        if (row.memo != null) pulledMemos[row.id] = { content: row.memo, updatedAt: row.memo_updated_at ?? '' };
      });
      if (Object.keys(pulledMemos).length > 0) setMemos(prev => ({ ...prev, ...pulledMemos }));

      let rootsMsg = '';
      // 다른 기기 Pull 시 작업루트는 건드리지 않음 (경로가 기기마다 다름)
      if (pullDeviceId && !isOtherDevice) {
        let { data: rootData } = await supabase
          .from('workspace_roots').select('*').eq('device_id', pullDeviceId);
        if (!rootData || rootData.length === 0) {
          const fallback = await supabase.from('workspace_roots').select('*');
          if (fallback.data && fallback.data.length > 0) rootData = fallback.data;
        }
        if (rootData && rootData.length > 0) {
          const restoredRoots: WorkspaceRoot[] = rootData
            .filter((r: any) => !r.path?.startsWith('__device__'))
            .map((r: any) => ({ id: r.id, name: r.name, path: r.path }));
          if (restoredRoots.length > 0) {
            setWorkspaceRoots(restoredRoots);
            await API.saveWorkspaceRoots(restoredRoots);
            rootsMsg = ` + ${restoredRoots.length}개 작업루트`;
          }
        }
      }
      const label = isOtherDevice ? '[다른 기기] ' : '';
      showToast(`${label}Supabase에서 ${merged.length}개 포트${rootsMsg}를 복원했습니다 ✓`, 'success');

      // 다른 기기 Pull 후 경로 없는 포트가 있으면 remapping 모달 표시
      if (isOtherDevice) {
        const needsPath = merged.filter(p => !p.folderPath && !p.commandPath && !p.terminalCommand);
        if (needsPath.length > 0) {
          setRemappingPorts(needsPath);
          setRemappingPaths({});
        }
      }
    } catch (e) {
      showToast('Supabase 복원 실패: ' + e, 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  async function openPortsHistory() {
    const cfg = portalConfigRef.current;
    if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey) { showToast('Supabase 설정이 없습니다', 'error'); return; }
    setPortsHistoryLoading(true);
    setShowPortsHistory(true);
    const supabase = getSupabaseClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const list = await fetchPushHistory(supabase, 'ports', cfg.deviceId ?? null);
    setPortsHistoryList(list);
    setPortsHistoryLoading(false);
  }

  async function restorePortsSnapshot(snapshotId: string) {
    const cfg = portalConfigRef.current;
    if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey) return;
    setPortsHistoryRestoring(snapshotId);
    try {
      const supabase = getSupabaseClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      const rows = await fetchSnapshotRows(supabase, snapshotId) as any[];
      if (rows.length === 0) { showToast('스냅샷이 비어있습니다', 'error'); return; }
      const { error: uErr } = await supabase.from('ports').upsert(rows, { onConflict: 'id' });
      if (uErr) throw new Error(uErr.message);
      const snapshotIds = new Set(rows.map(r => r.id));
      const deviceId = cfg.deviceId ?? null;
      const { data: current } = await supabase.from('ports').select('id').eq('device_id', deviceId);
      const toDelete = (current ?? []).filter((r: any) => !snapshotIds.has(r.id)).map((r: any) => r.id);
      if (toDelete.length > 0) await supabase.from('ports').delete().in('id', toDelete);
      await handleRestoreFromSupabase();
      showToast('스냅샷으로 복원 완료 ✓', 'success');
      setShowPortsHistory(false);
    } catch (e) {
      showToast('복원 실패: ' + e, 'error');
    } finally {
      setPortsHistoryRestoring(null);
    }
  }

  const handlePushToSupabase = async () => {
    if (isPushingPorts) return;
    setIsPushingPorts(true);
    try {
      let portalData: any;
      if (isTauri()) {
        portalData = await invoke('load_portal');
      } else {
        portalData = await getPortalCredentials();
      }
      // Keep portalConfigRef in sync so auto-push fires after credentials are set
      if (portalData?.supabaseUrl) portalConfigRef.current = portalData;
      const { supabaseUrl, supabaseAnonKey } = portalData ?? {};
      if (!supabaseUrl || !supabaseAnonKey) {
        showToast('Supabase 설정이 없습니다. 포털 탭에서 먼저 설정하세요', 'error');
        return;
      }
      const deviceId = portalData.deviceId ?? null;
      const deviceNameVal = portalData.deviceName ?? null;
      const supabase = getSupabaseClient(supabaseUrl, supabaseAnonKey);

      // 새 기기에서 포트 목록이 비어있으면 Pull 먼저 하도록 안내
      if (ports.length === 0) {
        showToast('포트 목록이 비어있습니다. Pull 먼저 실행하세요.', 'error');
        return;
      }

      // 다른 기기 소유 포트는 push 제외
      const ownedPorts = ports.filter(p => !p.sourceDeviceId || p.sourceDeviceId === deviceId);
      const rows = ownedPorts.map(p => ({
        id: p.id,
        name: p.name,
        port: p.port ?? null,
        command_path: p.commandPath ?? null,
        terminal_command: p.terminalCommand ?? null,
        folder_path: p.folderPath ?? null,
        deploy_url: p.deployUrl ?? null,
        github_url: p.githubUrl ?? null,
        favorite: p.favorite ?? false,
        device_id: deviceId,
        device_name: deviceNameVal,
        memo: memos[p.id]?.content ?? null,
        memo_updated_at: memos[p.id]?.updatedAt ?? null,
      }));
      await savePushSnapshot(supabase, 'ports', deviceId, deviceNameVal, rows);
      let { error } = await supabase.from('ports').upsert(rows, { onConflict: 'id' });
      if (error?.message?.includes('device_id') || error?.message?.includes('device_name')) {
        // device_id/device_name column not yet migrated — retry without it
        const rowsWithout = rows.map(({ device_id, device_name, ...rest }: any) => rest);
        const { error: e2 } = await supabase.from('ports').upsert(rowsWithout, { onConflict: 'id' });
        error = e2 ?? null;
        if (!e2) showToast('⚠ device_id 컬럼 없음 — 초기설정 가이드의 AI 프롬프트로 마이그레이션 후 재Push 권장', 'error');
      }
      if (error) throw new Error(error.message);
      // Register this device in devices table (non-blocking)
      if (deviceId) {
        supabase.from('devices').upsert(
          { id: deviceId, name: deviceNameVal, last_push_at: new Date().toISOString() },
          { onConflict: 'id' }
        ).then(() => {}).catch(() => {});
      }
      // Fix P2: delete remote rows whose IDs are no longer in local list
      // Fix P2g: skip delete pass if auto-pull never succeeded — pull first before deleting
      // Step 4: scope stale-delete to this device only to avoid clobbering other devices
      if (autopullSucceeded.current) {
        const localIds = ownedPorts.map(p => p.id);
        let remoteQuery = supabase.from('ports').select('id');
        if (deviceId) remoteQuery = remoteQuery.eq('device_id', deviceId);
        const { data: remoteRows } = await remoteQuery;
        const staleIds = (remoteRows ?? []).map((r: any) => r.id).filter((id: string) => !localIds.includes(id));
        if (staleIds.length > 0) {
          await supabase.from('ports').delete().in('id', staleIds);
        }
      }

      // deployUrl/githubUrl → portal_items 자동 공유 (__shared__)
      const now = new Date().toISOString();
      const autoItems = ownedPorts.flatMap(p => {
        const items: object[] = [];
        if (p.deployUrl) items.push({
          id: `auto:deploy:${p.id}`, name: p.name, type: 'web',
          url: p.deployUrl, category: p.category || '프로젝트',
          description: `배포 주소 — ${p.name}`, device_id: '__shared__',
          pinned: false, visit_count: 0, created_at: now,
        });
        if (p.githubUrl) items.push({
          id: `auto:github:${p.id}`, name: `${p.name} GitHub`, type: 'web',
          url: p.githubUrl, category: 'GitHub',
          description: `GitHub 저장소 — ${p.name}`, device_id: '__shared__',
          pinned: false, visit_count: 0, created_at: now,
        });
        return items;
      });
      if (autoItems.length > 0) {
        await supabase.from('portal_items').upsert(autoItems, { onConflict: 'id' });
      }
      // URL이 없어진 포트의 stale auto portal_items 삭제
      const activeAutoIds = new Set(autoItems.map((x: any) => x.id));
      const allAutoIds = ownedPorts.flatMap(p => [`auto:deploy:${p.id}`, `auto:github:${p.id}`]);
      const staleAutoIds = allAutoIds.filter(id => !activeAutoIds.has(id));
      if (staleAutoIds.length > 0) {
        await supabase.from('portal_items').delete().in('id', staleAutoIds);
      }

      // workspace_roots 업로드
      let rootsMsg = '';
      if (deviceId) {
        const rootRows = workspaceRoots.map(r => ({
          id: r.id, device_id: deviceId, name: r.name, path: r.path,
        }));
        // 기기명 sentinel 행 — 스키마 변경 없이 device_name을 Supabase에 저장
        if (deviceNameVal) {
          rootRows.push({ id: `__device__${deviceId}`, device_id: deviceId, name: deviceNameVal, path: `__device__${deviceId}` });
        }
        if (rootRows.length > 0) {
          const { error: rootError } = await supabase.from('workspace_roots').upsert(rootRows, { onConflict: 'id' });
          if (rootError) {
            rootsMsg = ` (작업루트 업로드 실패: ${rootError.message})`;
          } else if (workspaceRoots.length > 0) {
            rootsMsg = ` + ${workspaceRoots.length}개 작업루트`;
          }
        }
      }
      showToast(`Supabase에 ${ports.length}개 포트${rootsMsg}를 업로드했습니다 ✓`, 'success');
    } catch (e) {
      showToast('Supabase 업로드 실패: ' + e, 'error');
    } finally {
      setIsPushingPorts(false);
    }
  };

  // 동시 실행 수 제한 풀 (AI 일괄 요청용)
  async function runWithLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
    const queue = [...items];
    const slots = Array.from({ length: Math.min(limit, queue.length) }, () =>
      (async () => { while (queue.length > 0) await worker(queue.shift()!); })()
    );
    await Promise.all(slots);
  }

  const handleRefresh = async () => {
    if (isRefreshing || isAiEnriching) return;

    setIsRefreshing(true);
    let _refreshed: PortInfo[] = [];
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
              if (import.meta.env.DEV) console.log(`[Refresh] commandPath not found, will re-scan: ${updated.commandPath}`);
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

      _refreshed = updatedData;
      setPorts(updatedData);
      showToast('포트 목록을 새로고침했습니다', 'success');
    } catch (error) {
      showToast('새로고침 실패: ' + error, 'error');
    } finally {
      setIsRefreshing(false);
    }

    // Phase 2: AI 이름/카테고리 배치 생성 (missing 항목만, 단 1회 Claude 호출)
    const targets = _refreshed.filter(p => p.folderPath && (!p.aiName || !p.category));
    if (targets.length === 0) return;
    setIsAiEnriching(true);
    showToast(`AI 이름/카테고리 생성 중… (${targets.length}개)`, 'success');
    let nameCount = 0, catCount = 0;
    try {
      const batchInput = targets.map(p => ({ id: p.id, folderPath: p.folderPath!, name: p.name, aiName: p.aiName }));
      const results = await API.suggestBatch(batchInput);
      const resultMap = new Map(results.map(r => [r.id, r]));
      setPorts(prev => prev.map(p => {
        const r = resultMap.get(p.id);
        if (!r) return p;
        const newName = !p.aiName && r.name ? r.name : undefined;
        const newCat = !p.category && r.category ? r.category : undefined;
        if (newName) nameCount++;
        if (newCat) catCount++;
        return (newName || newCat) ? { ...p, aiName: newName ?? p.aiName, category: newCat ?? p.category } : p;
      }));
    } catch {}
    setPorts(prev => { API.savePorts(prev); return prev; });
    setIsAiEnriching(false);
    showToast(`AI 업데이트 완료: 이름 ${nameCount}개, 카테고리 ${catCount}개`, 'success');
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
        if (isBuildingRef.current) {
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
        if (isBuildingRef.current) {
          setIsBuilding(false);
          setBuildLogs(prev => [...prev, '⚠️ 빌드 타임아웃 (10분 초과)']);
        }
      }, 600000);
    } catch (error) {
      setBuildLogs(prev => [...prev, '❌ DMG 빌드 실패: ' + error]);
      setIsBuilding(false);
    }
  };

  const fetchVisitCounts = async (w: 'alltime' | 'weekly' | 'daily' = visitWindow) => {
    const cfg = portalConfigRef.current;
    if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey || !cfg?.deviceId) return;
    try {
      const params = new URLSearchParams({
        supabaseUrl: cfg.supabaseUrl,
        supabaseKey: cfg.supabaseAnonKey,
        deviceId: cfg.deviceId,
        window: w,
      });
      const base = isTauri() ? 'http://localhost:3001' : '';
      const res = await fetch(`${base}/api/port-visits?${params}`);
      if (res.ok) setVisitCounts(await res.json());
    } catch {}
  };

  const recordVisit = async (portId: string) => {
    const cfg = portalConfigRef.current;
    if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey || !cfg?.deviceId) return;
    try {
      const base = isTauri() ? 'http://localhost:3001' : '';
      await fetch(`${base}/api/port-visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portId, deviceId: cfg.deviceId, supabaseUrl: cfg.supabaseUrl, supabaseKey: cfg.supabaseAnonKey }),
      });
      setVisitCounts(prev => {
        const existing = prev.find(v => v.portId === portId);
        if (existing) return prev.map(v => v.portId === portId ? { ...v, count: v.count + 1 } : v).sort((a, b) => b.count - a.count);
        return [...prev, { portId, count: 1 }].sort((a, b) => b.count - a.count);
      });
    } catch {}
  };

  const scrollToPort = (portId: string) => {
    setHighlightedPortId(portId);
    const el = document.getElementById(`port-card-${portId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setHighlightedPortId(null), 2000);
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

  const handleInstallWindowsPrereqs = async () => {
    if (isBuilding) return;
    setBuildType('windows');
    setBuildLogs(['🔧 Windows 빌드 사전 요구사항 자동 설치를 시작합니다...']);
    lastLogIndexRef.current = 0;
    setShowBuildLog(true);
    setIsBuilding(true);
    setCanAutoInstall(false);
    try {
      const response = await fetch('/api/install-windows-prereqs', { method: 'POST' });
      const result = await response.json();
      if (!response.ok || result.error) {
        setBuildLogs(prev => [...prev, `❌ ${result.error}`]);
        setIsBuilding(false);
        return;
      }
      const poll = setInterval(async () => {
        try {
          const sr = await fetch('/api/build-status');
          const status = await sr.json();
          const newLogs = status.output.slice(lastLogIndexRef.current);
          if (newLogs.length > 0) {
            lastLogIndexRef.current = status.output.length;
            setBuildLogs(prev => [...prev, ...newLogs]);
          }
          if (!status.isBuilding && status.exitCode !== null) {
            clearInterval(poll);
            setIsBuilding(false);
            if (status.exitCode === 0) {
              setBuildLogs(prev => [...prev, '✅ 사전 설치 완료! "Windows 빌드" 버튼을 다시 누르세요.']);
            } else {
              setBuildLogs(prev => [...prev, `❌ 설치 실패 (exit: ${status.exitCode})`]);
            }
          }
        } catch (e) { console.error(e); }
      }, 2000);
      setTimeout(() => { clearInterval(poll); if (isBuildingRef.current) { setIsBuilding(false); setBuildLogs(p => [...p, '⚠️ 설치 타임아웃 (60분 초과)']); } }, 3600000);
    } catch (e) {
      setBuildLogs(prev => [...prev, '❌ 설치 요청 실패: ' + e]);
      setIsBuilding(false);
    }
  };

  const handleBuildWindows = async () => {
    if (isBuilding) return;

    setBuildType('windows');
    setBuildLogs(['⏳ Windows 로컬 빌드를 시작합니다...']);
    lastLogIndexRef.current = 0;
    setShowBuildLog(true);
    setIsBuilding(true);
    setCanAutoInstall(false);

    try {
      const response = await fetch('/api/build-windows', { method: 'POST' });
      const result = await response.json();

      if (!response.ok || result.error) {
        setBuildLogs(prev => [...prev, `❌ ${result.error}`]);
        if (result.canAutoInstall) setCanAutoInstall(true);
        setIsBuilding(false);
        return;
      }

      // 맥 빌드와 동일하게 /api/build-status 폴링
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch('/api/build-status');
          const status = await statusResponse.json();
          const newLogs = status.output.slice(lastLogIndexRef.current);
          if (newLogs.length > 0) {
            lastLogIndexRef.current = status.output.length;
            setBuildLogs(prev => [...prev, ...newLogs]);
          }
          if (!status.isBuilding && status.exitCode !== null) {
            clearInterval(pollInterval);
            setIsBuilding(false);
            if (status.exitCode === 0) {
              setBuildLogs(prev => [...prev, '✅ Windows 빌드 완료! (src-tauri/target/release/bundle/nsis/)']);
            } else {
              setBuildLogs(prev => [...prev, `❌ 빌드 실패 (exit code: ${status.exitCode})`]);
            }
          }
        } catch (e) {
          console.error('Failed to poll windows build status:', e);
        }
      }, 1000);

      setTimeout(() => {
        clearInterval(pollInterval);
        if (isBuildingRef.current) {
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
          filters: [{ name: 'Command Files', extensions: ['command', 'sh', 'bat', 'cmd'] }],
        });
        if (!filePath || typeof filePath !== 'string') return;

        const lastSepIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
        const fileName = lastSepIndex !== -1 ? filePath.substring(lastSepIndex + 1) : filePath;
        const projectName = fileName.replace(/\.(command|sh|bat|cmd)$/i, '');
        const folderPath = lastSepIndex !== -1 ? filePath.substring(0, lastSepIndex) : '';

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
        input.accept = '.command,.sh,.bat,.cmd';
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

              const projectName = file.name.replace(/\.(command|sh|bat|cmd)$/i, '');
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

  const displayedPorts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let filtered = q ? ports.filter(p => matchesSearch(p, q)) : ports;

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
        break;
    }
    const sorted = sortOrder === 'desc' ? [...filtered].reverse() : filtered;
    return [...sorted.filter(p => p.favorite), ...sorted.filter(p => !p.favorite)];
  }, [ports, searchQuery, filterType, filterCategory, sortBy, sortOrder]);

  const searchFilteredPorts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return q ? ports.filter(p => matchesSearch(p, q)) : ports;
  }, [ports, searchQuery]);

  const v3Ports = useMemo(() => {
    let list = ports;
    if (sidebarSection === 'running') list = list.filter(p => p.isRunning);
    else if (sidebarSection === 'starred') list = list.filter(p => p.favorite);
    else if (sidebarSection === 'wt') list = list.filter(p => !!p.worktreePath);
    else if (sidebarSection.startsWith('tag:')) list = list.filter(p => p.category === sidebarSection.slice(4));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.aiName || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.worktreePath || '').toLowerCase().includes(q) ||
        String(p.port ?? '').includes(q)
      );
    }
    return list;
  }, [ports, sidebarSection, searchQuery]);

  const v3Running = useMemo(() => v3Ports.filter(p => p.isRunning), [v3Ports]);
  const v3Idle = useMemo(() => v3Ports.filter(p => !p.isRunning), [v3Ports]);

  const inpV3: React.CSSProperties = {
    width:'100%', padding:'7px 10px', background:'#15120f',
    border:'1px solid rgba(255,240,220,0.07)', borderRadius:6,
    color:'#ede7dd', fontSize:12, outline:'none', fontFamily:'inherit', boxSizing:'border-box',
  };

  const renderV3Card = (item: PortInfo) => {
    if (editingId === item.id) {
      return (
        <div key={item.id} style={{padding:12,background:'#1c1916',border:'1px solid rgba(255,240,220,0.12)',borderRadius:8,display:'flex',flexDirection:'column',gap:6}}>
          <div style={{display:'flex',gap:6}}>
            <input type="text" value={editName} onChange={e=>setEditName(e.target.value)} onKeyDown={handleEditKeyPress}
              style={{...inpV3,flex:1}} placeholder="프로젝트 이름" autoFocus />
            <input type="number" value={editPort} onChange={e=>setEditPort(e.target.value)} onKeyDown={handleEditKeyPress}
              style={{...inpV3,width:70,flex:'none'}} placeholder="포트" />
            <button onClick={saveEdit} style={{padding:'5px 8px',background:'rgba(143,185,110,0.14)',border:'1px solid rgba(143,185,110,0.3)',borderRadius:6,cursor:'pointer',display:'flex',alignItems:'center'}}>
              <Check className="w-3.5 h-3.5" style={{color:'#8fb96e'}} />
            </button>
            <button onClick={cancelEdit} style={{padding:'5px 8px',background:'transparent',border:'1px solid rgba(255,240,220,0.07)',borderRadius:6,cursor:'pointer',display:'flex',alignItems:'center'}}>
              <XIcon className="w-3.5 h-3.5" style={{color:'#6b6459'}} />
            </button>
          </div>
          <input type="text" value={editCommandPath} onChange={e=>setEditCommandPath(e.target.value)} onKeyDown={handleEditKeyPress}
            style={inpV3} placeholder={`${execFileExt()} 파일 경로`} />
          <input type="text" value={editTerminalCommand} onChange={e=>setEditTerminalCommand(e.target.value)} onKeyDown={handleEditKeyPress}
            style={inpV3} placeholder="터미널 명령어" />
          <input type="text" value={editFolderPath} onChange={e=>setEditFolderPath(e.target.value)} onKeyDown={handleEditKeyPress}
            style={inpV3} placeholder="폴더 경로" />
          <input type="text" value={editDeployUrl} onChange={e=>setEditDeployUrl(e.target.value)} onKeyDown={handleEditKeyPress}
            style={inpV3} placeholder="배포 주소" />
          <input type="text" value={editGithubUrl} onChange={e=>setEditGithubUrl(e.target.value)} onKeyDown={handleEditKeyPress}
            style={inpV3} placeholder="GitHub 주소" />
          <div style={{display:'flex',gap:6}}>
            <input type="text" value={editCategory} onChange={e=>setEditCategory(e.target.value)} onKeyDown={handleEditKeyPress}
              style={{...inpV3,flex:1}} placeholder="카테고리" />
            <input type="text" value={editDescription} onChange={e=>setEditDescription(e.target.value)} onKeyDown={handleEditKeyPress}
              style={{...inpV3,flex:2}} placeholder="프로젝트 설명" />
          </div>
        </div>
      );
    }

    const menuOpen = v3MenuOpenId === item.id;
    const btnBase: React.CSSProperties = {padding:'5px 8px',borderRadius:5,background:'transparent',border:'1px solid rgba(255,240,220,0.07)',color:'#ede7dd',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11};

    return (
      <div key={item.id} className="group" style={{
        padding:12, background:'#1c1916',
        border:'1px solid rgba(255,240,220,0.07)',
        borderRadius:8, cursor:'pointer',
        display:'flex', flexDirection:'column', gap:6,
        minHeight:108, position:'relative',
        zIndex: menuOpen ? 50 : 'auto',
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor='rgba(255,240,220,0.12)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor='rgba(255,240,220,0.07)'; }}
      >
        <div style={{display:'flex',alignItems:'center',gap:5}}>
          <span style={{width:7,height:7,borderRadius:4,flexShrink:0,background:item.isRunning?'#8fb96e':'#6b6459'}} />
          <span style={{fontSize:13,fontWeight:600,letterSpacing:-0.2,color:'#ede7dd',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</span>
          {item.favorite && <Star style={{width:10,height:10,flexShrink:0,fill:'#e8a557',color:'#e8a557'}} />}
          {item.port && <span style={{fontSize:11,fontFamily:'JetBrains Mono, monospace',color:'#e8a557',flexShrink:0}}>:{item.port}</span>}
        </div>

        {item.aiName && (
          <div style={{fontSize:11.5,color:'#a39a8c',marginTop:-2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.aiName}</div>
        )}

        {item.worktreePath && (
          <div style={{display:'flex',alignItems:'center',gap:4,fontSize:10.5,fontFamily:'JetBrains Mono, monospace',color:'#7ba7c9',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>
            <GitBranch style={{width:10,height:10,flexShrink:0}} />
            {item.worktreePath.split('/').pop() || item.worktreePath}
          </div>
        )}

        {/* Primary action strip — visible on hover */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity" style={{marginTop:'auto',display:'flex',gap:4}}>
          <button onClick={e=>{e.stopPropagation(); item.isRunning ? stopCommand(item) : executeCommand(item);}} style={{
            flex:1,padding:'5px 0',borderRadius:5,
            background:item.isRunning?'rgba(201,106,90,0.14)':'rgba(143,185,110,0.14)',
            color:item.isRunning?'#c96a5a':'#8fb96e',
            border:'none',fontSize:11,fontWeight:600,cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',gap:4,fontFamily:'inherit',
          }}>
            {item.isRunning ? <Square style={{width:9,height:9}}/> : <Play style={{width:9,height:9}}/>}
            {item.isRunning ? 'Stop' : 'Run'}
          </button>
          <button onClick={e=>{e.stopPropagation(); setWorktreePickerState({item,mode:'claude'});}} style={{...btnBase,gap:3,fontFamily:'inherit',color:'#c8a8f0',borderColor:'rgba(200,168,240,0.25)'}}>Claude</button>
          <button onClick={e=>{e.stopPropagation(); toggleWorktreePanel(item.id, item.folderPath);}} style={{...btnBase, color:expandedWorktreeIds.has(item.id)?'#e8a557':'#ede7dd', borderColor:expandedWorktreeIds.has(item.id)?'rgba(232,165,87,0.3)':'rgba(255,240,220,0.07)'}} title="워크트리 관리">
            <GitBranch style={{width:11,height:11}}/>
          </button>
          <button onClick={e=>{e.stopPropagation(); item.port && API.openInChrome(`http://localhost:${item.port}`).catch(()=>{});}} style={btnBase} title="Chrome에서 열기">
            <Globe style={{width:11,height:11}}/>
          </button>
          <button onClick={e=>{e.stopPropagation(); setV3MenuOpenId(menuOpen ? null : item.id);}} style={{...btnBase, color: menuOpen?'#e8a557':'#ede7dd', borderColor: menuOpen?'rgba(232,165,87,0.3)':'rgba(255,240,220,0.07)'}}>
            <ChevronDown style={{width:11,height:11}}/>
          </button>
        </div>

        {/* Worktree panel */}
        {expandedWorktreeIds.has(item.id) && (
          <div style={{marginTop:4,background:'#221f1b',borderRadius:6,border:'1px solid rgba(255,240,220,0.07)',padding:'8px 8px 6px',display:'flex',flexDirection:'column',gap:4}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:2}}>
              <div style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'#6b6459',fontWeight:600,letterSpacing:0.5,textTransform:'uppercase'}}>
                <GitBranch style={{width:9,height:9}}/> Git Worktrees
              </div>
              <button onClick={e=>{e.stopPropagation(); item.folderPath && loadWorktrees(item.id, item.folderPath);}} style={{padding:'2px 5px',background:'transparent',border:'none',cursor:'pointer',color:'#6b6459',display:'flex',alignItems:'center'}} title="새로고침">
                <RotateCw style={{width:10,height:10}}/>
              </button>
            </div>
            {worktreeLoading[item.id] ? (
              <div style={{fontSize:10.5,color:'#6b6459',textAlign:'center',padding:'4px 0'}}>로딩 중...</div>
            ) : (worktreeLists[item.id] ?? []).length === 0 ? (
              <div style={{fontSize:10.5,color:'#6b6459',textAlign:'center',padding:'4px 0'}}>워크트리 없음</div>
            ) : (
              (worktreeLists[item.id] ?? []).map(wt => {
                const wtName = wt.path.replace(/\/$/, '').split('/').pop() ?? wt.path;
                const displayName = wt.branch || wtName;
                const miniBtn: React.CSSProperties = {padding:'3px 7px',borderRadius:4,background:'transparent',border:'1px solid rgba(255,240,220,0.07)',color:'#a39a8c',cursor:'pointer',fontSize:10,fontFamily:'inherit'};
                const wtPortEntry = ports.find(p =>
                  p.worktreePath === wt.path ||
                  (wt.branch && p.worktreePath === wt.branch) ||
                  (p.worktreePath && wt.path.endsWith('/' + p.worktreePath.replace(/^\/+/, ''))) ||
                  p.folderPath === wt.path
                );
                const usedPorts = new Set(ports.map(p => p.port).filter((p): p is number => p != null));
                // wtActualPorts: CWD 기반으로 감지된 실제 포트 (없으면 해시 포트 사용)
                const detectedPort = wtActualPorts[wt.path];
                const wtPort = detectedPort ?? (wtPortEntry?.port ?? worktreePortFromPath(wt.path, usedPorts));
                const isWtRunning = detectedPort != null || (wtPortEntry?.isRunning ?? wtPortStatuses[wtPort] ?? false);
                const wtClaudeBypass = () => {
                  const branchName = wt.branch || wt.path.replace(/\/$/, '').split('/').pop()!;
                  const sessionName = `${item.name.replace(/\s+/g,'-')}-${branchName}`;
                  const baseUrl = isTauri() ? 'http://localhost:3001' : '';
                  fetch(`${baseUrl}/api/open-tmux-claude-bypass`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionName, folderPath: item.folderPath, worktreePath: wt.path, branch: branchName }),
                  })
                    .then(() => showToast(`Claude(bypass) 실행: ${displayName}`, 'success'))
                    .catch(err => showToast(`Claude 실행 실패: ${err}`, 'error'));
                };
                return (
                  <div key={wt.path} style={{
                    padding:'5px 6px', borderRadius:5,
                    background: wt.is_main ? 'rgba(232,165,87,0.04)' : 'rgba(255,240,220,0.02)',
                    border:'1px solid rgba(255,240,220,0.05)',
                    borderLeft: wt.is_main ? '2px solid rgba(232,165,87,0.35)' : '1px solid rgba(255,240,220,0.05)',
                    display:'flex', flexDirection:'column', gap:4,
                  }}>
                    {/* Branch name row */}
                    <div style={{display:'flex',alignItems:'center',gap:5}}>
                      <GitBranch style={{width:9,height:9,color:wt.is_main?'#6b6459':'#7ba7c9',flexShrink:0}}/>
                      <span style={{fontSize:11,fontWeight:600,color:wt.is_main?'#ede7dd':'#7ba7c9',fontFamily:'JetBrains Mono, monospace',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{displayName}</span>
                      {wt.is_main && <span style={{fontSize:9,color:'#6b6459',background:'rgba(255,240,220,0.06)',padding:'1px 4px',borderRadius:3}}>main</span>}
                    </div>
                    {/* Action buttons row */}
                    <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                    {wt.is_main ? <>
                      <button onClick={e=>{e.stopPropagation(); item.isRunning ? stopCommand(item) : executeCommand(item);}} style={{...miniBtn,color:item.isRunning?'#c96a5a':'#8fb96e',borderColor:item.isRunning?'rgba(201,106,90,0.2)':'rgba(143,185,110,0.2)'}} title={item.isRunning ? `포트 ${item.port}` : undefined}>
                        {item.isRunning ? '중지' : `실행(${item.port})`}
                      </button>
                      <button onClick={e=>{e.stopPropagation(); item.port && window.open(`http://localhost:${item.port}`, '_blank');}} style={miniBtn} title="브라우저에서 열기"><Globe style={{width:9,height:9}}/></button>
                      <button onClick={e=>{e.stopPropagation(); wt.path && API.openFolder(wt.path).catch(()=>{});}} style={miniBtn} title="Finder에서 열기"><FolderOpen style={{width:9,height:9}}/></button>
                      <button onClick={e=>{e.stopPropagation(); forceRestartCommand(item);}} style={{...miniBtn,color:'#e8a557',borderColor:'rgba(232,165,87,0.2)'}} title="강제 재실행"><RotateCw style={{width:9,height:9}}/></button>
                      <button onClick={e=>{e.stopPropagation(); wtClaudeBypass();}} style={{...miniBtn,color:'#c8a8f0',borderColor:'rgba(200,168,240,0.25)'}}>Claude</button>
                      <button onClick={e=>{e.stopPropagation(); setCommitModal({item,wt,msg:''});}} style={miniBtn}>커밋</button>
                      <button onClick={e=>{e.stopPropagation();
                        const baseUrl = isTauri() ? 'http://localhost:3001' : '';
                        fetch(`${baseUrl}/api/git-push`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({folderPath:item.folderPath}) })
                          .then(r=>r.json()).then(d=>{ if(d.success) showToast('푸시 완료','success'); else showToast(`푸시 실패: ${d.error}`,'error'); })
                          .catch(()=>showToast('푸시 실패','error'));
                      }} style={miniBtn}>푸시</button>
                    </> : <>
                      <button onClick={e=>{e.stopPropagation();
                        if (wtPortEntry) { isWtRunning ? stopCommand(wtPortEntry) : executeCommand(wtPortEntry); }
                        else { executeCommand({...item, id:`${item.id}_wt_${wtName}`, port:wtPort, worktreePath:wt.path}); }
                      }} style={{...miniBtn,color:isWtRunning?'#c96a5a':'#8fb96e',borderColor:isWtRunning?'rgba(201,106,90,0.2)':'rgba(143,185,110,0.2)'}} title={isWtRunning ? `포트 ${wtPort}` : undefined}>
                        {isWtRunning ? '중지' : `실행(${wtPort})`}
                      </button>
                      <button onClick={e=>{e.stopPropagation(); window.open(`http://localhost:${wtPort}`, '_blank');}} style={miniBtn} title="브라우저에서 열기"><Globe style={{width:9,height:9}}/></button>
                      <button onClick={e=>{e.stopPropagation();
                        if (wtPortEntry) forceRestartCommand(wtPortEntry);
                        else forceRestartCommand({...item, id:`${item.id}_wt_${wtName}`, port:wtPort, worktreePath:wt.path});
                      }} style={{...miniBtn,color:'#e8a557',borderColor:'rgba(232,165,87,0.2)'}} title="강제 재실행"><RotateCw style={{width:9,height:9}}/></button>
                      <button onClick={e=>{e.stopPropagation(); API.openFolder(wt.path).catch(()=>{});}} style={miniBtn} title="Finder에서 열기"><FolderOpen style={{width:9,height:9}}/></button>
                      <button onClick={e=>{e.stopPropagation(); wtClaudeBypass();}} style={{...miniBtn,color:'#c8a8f0',borderColor:'rgba(200,168,240,0.25)'}}>Claude</button>
                      <button onClick={e=>{e.stopPropagation(); setCommitModal({item,wt,msg:''});}} style={miniBtn}>커밋</button>
                      <button onClick={e=>{e.stopPropagation();
                        const baseUrl = isTauri() ? 'http://localhost:3001' : '';
                        fetch(`${baseUrl}/api/git-push`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({folderPath:wt.path}) })
                          .then(r=>r.json()).then(d=>{ if(d.success) showToast(`푸시 완료: ${displayName}`,'success'); else showToast(`푸시 실패: ${d.error}`,'error'); })
                          .catch(()=>showToast('푸시 실패','error'));
                      }} style={miniBtn}>푸시</button>
                      <button onClick={e=>{e.stopPropagation(); handleWorktreeMerge(item, wt);}} style={{...miniBtn,color:'#e8a557',borderColor:'rgba(232,165,87,0.2)'}}>머지</button>
                      <button onClick={e=>{e.stopPropagation(); handleWorktreeRemove(item, wt);}} style={{...miniBtn,color:'#c96a5a',borderColor:'rgba(201,106,90,0.2)'}}>삭제</button>
                    </>}
                    </div>
                  </div>
                );
              })
            )}
            <div style={{display:'flex',gap:4,marginTop:2}}>
              <input
                type="text"
                value={worktreeNewBranch[item.id] ?? ''}
                onChange={e => setWorktreeNewBranch(prev => ({...prev, [item.id]: e.target.value}))}
                onKeyDown={e => { if(e.key==='Enter') { e.stopPropagation(); handleWorktreeAdd(item); } }}
                onClick={e => e.stopPropagation()}
                placeholder="브랜치명"
                style={{flex:1,padding:'4px 7px',background:'#15120f',border:'1px solid rgba(255,240,220,0.07)',borderRadius:4,color:'#ede7dd',fontSize:10.5,outline:'none',fontFamily:'inherit'}}
              />
              <button onClick={e=>{e.stopPropagation(); handleWorktreeAdd(item);}} style={{padding:'4px 8px',background:'rgba(232,165,87,0.1)',border:'1px solid rgba(232,165,87,0.25)',borderRadius:4,color:'#e8a557',fontSize:10,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>
                + 추가
              </button>
            </div>
          </div>
        )}

        {/* Secondary menu */}
        {menuOpen && (
          <div style={{position:'absolute',bottom:42,right:8,zIndex:200,background:'#221f1b',border:'1px solid rgba(255,240,220,0.12)',borderRadius:8,padding:'4px 0',boxShadow:'0 12px 32px rgba(0,0,0,0.7)',minWidth:150}}>
            {[
              {label:'강제 재실행', icon:<RotateCw style={{width:11,height:11}}/>, action:()=>forceRestartCommand(item)},
              {label:'폴더 열기', icon:<FolderOpen style={{width:11,height:11}}/>, action:()=>item.folderPath && API.openFolder(item.folderPath)},
              {label:'로그 보기', icon:<FileText style={{width:11,height:11}}/>, action:()=>API.openLog(item.id)},
              {label:'Claude (bypass)', icon:<Terminal style={{width:11,height:11}}/>, action:()=>openTmuxClaude(item)},
              {label:'수정', icon:<Pencil style={{width:11,height:11}}/>, action:()=>startEdit(item)},
              {label:'삭제', icon:<Trash2 style={{width:11,height:11}}/>, action:()=>setDeleteConfirmId(item.id), danger:true},
            ].map(({label,icon,action,danger}:{label:string;icon:React.ReactNode;action:()=>void;danger?:boolean}) => (
              <button key={label} onClick={e=>{e.stopPropagation(); action(); setV3MenuOpenId(null);}} style={{
                display:'flex',alignItems:'center',gap:8,padding:'6px 12px',width:'100%',
                background:'transparent',border:'none',cursor:'pointer',
                fontSize:12,color:danger?'#c96a5a':'#ede7dd',fontFamily:'inherit',textAlign:'left',
              }}
                onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,240,220,0.05)')}
                onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
              >
                {icon}{label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{background:'#15120f'}}>
      {updateInfo && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-blue-600/95 text-white text-sm px-4 py-2 flex items-center justify-between">
          <span>🆕 새 버전 <strong>{updateInfo.version}</strong>이 있습니다</span>
          <div className="flex items-center gap-2">
            <button onClick={async () => {
              try {
                const { check } = await import('@tauri-apps/plugin-updater');
                const { relaunch } = await import('@tauri-apps/plugin-process');
                const update = await check();
                if (update) { await update.downloadAndInstall(); await relaunch(); }
              } catch (e) { showToast(`업데이트 실패: ${String(e)}`, 'error'); }
            }} className="px-3 py-0.5 bg-white/20 rounded hover:bg-white/30 text-xs font-medium">지금 업데이트</button>
            <button onClick={() => setUpdateInfo(null)} className="px-2 py-0.5 bg-white/10 rounded hover:bg-white/20 text-xs">나중에</button>
          </div>
        </div>
      )}
      {!isTauri() && apiServerOnline === false && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500/90 text-black text-sm px-4 py-2 flex items-center justify-between">
          <span>⚠️ API 서버가 꺼져 있습니다. <code className="bg-black/10 px-1 rounded">bun run start</code> 로 실행하세요. Supabase는 캐시된 인증 정보로 동작합니다.</span>
          <button onClick={() => { fetch('/api/ports').then(() => setApiServerOnline(true)).catch(() => {}); }} className="ml-4 px-2 py-0.5 bg-black/20 rounded hover:bg-black/30 text-xs">재확인</button>
        </div>
      )}
      {/* 머지 확인 모달 */}
      {commitModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1c1916] rounded-xl border border-stone-700/50 w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500/15 p-2 rounded-lg border border-amber-500/30">
                <GitCommit className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">커밋</h3>
                <p className="text-zinc-400 text-xs mt-0.5 font-mono">{commitModal.wt.branch}</p>
              </div>
            </div>
            <input
              type="text"
              autoFocus
              placeholder="커밋 메시지 입력..."
              value={commitModal.msg}
              onChange={e => setCommitModal(m => m ? { ...m, msg: e.target.value } : m)}
              onKeyDown={async e => {
                if (e.key === 'Enter' && commitModal.msg.trim()) {
                  const { item, wt, msg } = commitModal;
                  setCommitModal(null);
                  const baseUrl = isTauri() ? 'http://localhost:3001' : '';
                  const res = await fetch(`${baseUrl}/api/git-commit`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ worktreePath: wt.path, message: msg.trim() })
                  }).catch(() => null);
                  const data = await res?.json().catch(() => null);
                  if (data?.success) showToast(`✅ 커밋 완료: ${wt.branch}`, 'success');
                  else showToast(`커밋 실패: ${data?.error ?? '알 수 없는 오류'}`, 'error');
                } else if (e.key === 'Escape') setCommitModal(null);
              }}
              className="w-full px-3 py-2 bg-[#221f1b] border border-stone-700/50 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCommitModal(null)} className="px-4 py-1.5 text-xs text-zinc-400 hover:text-white border border-stone-700/50 hover:border-zinc-500 rounded-lg transition-colors">취소</button>
              <button
                disabled={!commitModal.msg.trim()}
                onClick={async () => {
                  const { item, wt, msg } = commitModal;
                  setCommitModal(null);
                  const baseUrl = isTauri() ? 'http://localhost:3001' : '';
                  const res = await fetch(`${baseUrl}/api/git-commit`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ worktreePath: wt.path, message: msg.trim() })
                  }).catch(() => null);
                  const data = await res?.json().catch(() => null);
                  if (data?.success) showToast(`✅ 커밋 완료: ${wt.branch}`, 'success');
                  else showToast(`커밋 실패: ${data?.error ?? '알 수 없는 오류'}`, 'error');
                }}
                className="px-4 py-1.5 text-xs bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 rounded-lg transition-colors disabled:opacity-40"
              >
                커밋
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteWorktreeConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1c1916] rounded-xl border border-stone-700/50 w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-red-500/15 p-2 rounded-lg border border-red-500/30">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">워크트리 삭제</h3>
                <p className="text-zinc-400 text-xs mt-0.5">이 작업은 되돌릴 수 없습니다</p>
              </div>
            </div>
            <div className="bg-[#221f1b]/60 rounded-lg p-3 border border-stone-800/40">
              <p className="text-xs text-[#ede7dd]/90">
                <span className="text-red-400 font-mono">{deleteWorktreeConfirm.wt.branch ?? deleteWorktreeConfirm.wt.path.split('/').pop()}</span> 워크트리를 삭제하시겠습니까?
              </p>
              <p className="text-xs text-zinc-500 mt-1 font-mono break-all">{deleteWorktreeConfirm.wt.path}</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteWorktreeConfirm(null)}
                className="px-4 py-1.5 text-xs text-zinc-400 hover:text-white border border-stone-700/50 hover:border-zinc-500 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={executeWorktreeDelete}
                className="px-4 py-1.5 text-xs bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 rounded-lg transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {mergeConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1c1916] rounded-xl border border-stone-700/50 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-500/15 p-2 rounded-lg border border-blue-500/30">
                <GitBranch className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">머지 확인</h2>
                <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                  <span className="text-teal-400">{mergeConfirm.wt.branch}</span>
                  <span className="text-zinc-500"> → </span>
                  <span className="text-[#ede7dd]/90">{mergeConfirm.mainBranch}</span>
                </p>
              </div>
            </div>
            {mergeConfirm.isDirty && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300">
                <span>⚠️</span>
                <span>워킹 트리에 미커밋 변경사항이 있습니다. <span className="font-medium">--autostash</span>로 자동 스태시 후 머지하고 팝합니다.</span>
              </div>
            )}
            {mergeConfirm.commits ? (
              <div className="bg-black/40 rounded-lg p-3 border border-stone-800/40">
                <p className="text-[10px] text-zinc-500 mb-1.5 font-medium uppercase tracking-wide">머지될 커밋</p>
                <pre className="text-xs text-[#ede7dd]/90 font-mono whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">{mergeConfirm.commits}</pre>
              </div>
            ) : (
              <p className="text-xs text-zinc-500 italic">커밋 없음 (이미 최신 상태)</p>
            )}
            {mergeConfirm.stat && (
              <div className="bg-black/40 rounded-lg p-3 border border-stone-800/40">
                <p className="text-[10px] text-zinc-500 mb-1.5 font-medium uppercase tracking-wide">변경 파일</p>
                <pre className="text-xs text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">{mergeConfirm.stat}</pre>
              </div>
            )}
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={async () => {
                  const baseUrl = isTauri() ? 'http://localhost:3001' : '';
                  await fetch(`${baseUrl}/api/open-terminal-git-merge`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folderPath: mergeConfirm.item.folderPath, branchName: mergeConfirm.wt.branch, name: mergeConfirm.item.name }),
                  });
                  setMergeConfirm(null);
                  showToast('터미널에서 git merge 실행 중', 'success');
                }}
                className="px-4 py-2 bg-[#221f1b] hover:bg-[#2a2520] text-[#ede7dd]/90 text-sm rounded-lg transition-colors"
              >
                터미널에서 머지
              </button>
              <button onClick={() => setMergeConfirm(null)} className="px-4 py-2 bg-[#221f1b] hover:bg-[#2a2520] text-[#ede7dd]/90 text-sm rounded-lg transition-colors">
                취소
              </button>
              <button
                onClick={executeMerge}
                disabled={mergeLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {mergeLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5" />}
                Merge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 머지 에러 모달 (충돌 등) */}
      {mergeError && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1c1916] rounded-xl border border-red-800/50 w-full max-w-lg p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="bg-red-500/15 p-2 rounded-lg border border-red-500/30 shrink-0">
                <XIcon className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">머지 실패</h2>
                <p className="text-xs text-red-400 mt-0.5">
                  {mergeError.hasConflict ? '충돌(Conflict) 발생 — 아래 방법 중 하나를 선택하세요' : '머지 중 오류가 발생했습니다'}
                </p>
              </div>
            </div>

            {/* Conflict files list */}
            {mergeConflictFiles.length > 0 && (
              <div className="bg-black/40 rounded-lg p-3 border border-red-900/30 space-y-1">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">충돌 파일 ({mergeConflictFiles.length}개)</p>
                {mergeConflictFiles.map(f => (
                  <div key={f} className="flex items-center gap-1.5">
                    <span className="text-red-400 text-xs">⚠</span>
                    <code className="text-xs text-red-300 font-mono">{f}</code>
                  </div>
                ))}
              </div>
            )}

            {/* Raw error (collapsed if conflict files shown) */}
            {mergeConflictFiles.length === 0 && (
              <div className="bg-black/40 rounded-lg p-3 border border-red-900/30">
                <pre className="text-xs text-red-300 font-mono whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">{mergeError.message}</pre>
              </div>
            )}

            {/* Claude Code prompt box */}
            {mergeError.hasConflict && mergeError.folderPath && (() => {
              const files = mergeConflictFiles.length > 0
                ? mergeConflictFiles.map(f => `- ${f}`).join('\n')
                : '(충돌 파일 확인 중...)';
              const prompt = `다음 경로에서 git 머지 충돌을 해결해줘:\n\`\`\`\n${mergeError.folderPath}\n\`\`\`\n\n충돌 파일:\n${files}\n\n각 파일의 충돌 마커(<<<<<<, =======, >>>>>>>)를 제거하고 올바르게 병합한 뒤,\n\`git add .\` → \`git commit --no-edit\` 순서로 머지를 완료해줘.`;
              return (
                <div className="bg-[#221f1b]/80 rounded-lg border border-stone-700/50">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-stone-700/40">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">Claude Code 프롬프트</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(prompt).then(() => showToast('프롬프트 복사됨 — Claude Code에 붙여넣기 하세요', 'success')).catch(() => showToast('복사 실패', 'error'));
                      }}
                      className="flex items-center gap-1.5 px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors"
                    >
                      <Copy className="w-3 h-3" /> 복사
                    </button>
                  </div>
                  <pre className="text-xs text-[#ede7dd]/90 font-mono px-3 py-2.5 whitespace-pre-wrap leading-relaxed max-h-28 overflow-y-auto">{prompt}</pre>
                </div>
              );
            })()}

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-1">
              {mergeError.hasConflict && (
                <>
                  <button
                    onClick={async () => {
                      try {
                        const baseUrl = isTauri() ? 'http://localhost:3001' : '';
                        const r = await fetch(`${baseUrl}/api/git-merge-abort`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ folderPath: mergeError.folderPath, force: false }),
                        });
                        if (!r.ok) {
                          // retry with force
                          const r2 = await fetch(`${baseUrl}/api/git-merge-abort`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ folderPath: mergeError.folderPath, force: true }),
                          });
                          if (!r2.ok) { const d = await r2.json(); showToast('abort 실패: ' + d.error, 'error'); return; }
                        }
                        showToast('머지 취소됨 — 브랜치가 원래 상태로 복원됐습니다', 'success');
                        setMergeError(null);
                        setMergeConflictFiles([]);
                      } catch (e) { showToast('abort 실패: ' + e, 'error'); }
                    }}
                    className="px-3 py-2 bg-red-500/15 hover:bg-red-500/25 text-red-400 text-sm rounded-lg border border-red-500/30 transition-colors"
                  >
                    Abort Merge
                  </button>
                </>
              )}
              <button onClick={() => { setMergeError(null); setMergeConflictFiles([]); }} className="px-3 py-2 bg-[#221f1b] hover:bg-[#2a2520] text-[#ede7dd]/90 text-sm rounded-lg transition-colors">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 머지 후 main 푸시 확인 모달 */}
      {mergePushConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1c1916] rounded-xl border border-stone-700/50 w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-500/15 p-2 rounded-lg border border-blue-500/30">
                <GitBranch className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">머지 완료</h3>
                <p className="text-zinc-400 text-xs mt-0.5"><span className="font-mono text-blue-300">{mergePushConfirm.mainBranch}</span> 브랜치를 remote에 푸시할까요?</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={async () => {
                  const { item, mainBranch } = mergePushConfirm;
                  setMergePushConfirm(null);
                  try {
                    const baseUrl = isTauri() ? 'http://localhost:3001' : '';
                    const res = await fetch(`${baseUrl}/api/git-push`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ folderPath: item.folderPath }),
                    });
                    const data = await res.json();
                    if (data.success) showToast(`✅ ${mainBranch} 푸시 완료`, 'success');
                    else showToast(`푸시 실패: ${data.error}`, 'error');
                  } catch (e) { showToast('푸시 실패: ' + e, 'error'); }
                }}
                className="px-4 py-2 bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 text-sm rounded-lg border border-blue-500/30 transition-colors"
              >
                푸시
              </button>
              <button onClick={() => setMergePushConfirm(null)} className="px-4 py-2 bg-[#221f1b] hover:bg-[#2a2520] text-[#ede7dd]/90 text-sm rounded-lg transition-colors">
                나중에
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 워크트리 경로 피커 모달 */}
      {worktreePickerState && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-[#1c1916] rounded-xl border border-stone-700/50 p-5 w-[460px] shadow-2xl">
            {/* 헤더: 프로젝트명 + 모드 */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-medium text-violet-400 uppercase tracking-wider">
                  {worktreePickerState.mode === 'tmux' ? 'tmux' : 'Claude'}
                </span>
                <span className="text-[#6b6459] text-[10px]">·</span>
                <span className="text-xs font-semibold text-[#ede7dd] truncate">
                  {worktreePickerState.item.aiName || worktreePickerState.item.name}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500">워크트리를 선택하거나 직접 경로를 입력하세요</p>
            </div>

            {/* 감지된 워크트리 목록 */}
            {detectedWorktrees.length > 0 && (
              <div className="mb-3 border border-stone-700/50 rounded-lg overflow-hidden">
                {detectedWorktrees.map((wt) => {
                  const wtBasename = wt.path.replace(/\/$/, '').split('/').pop() ?? wt.path;
                  const displayName = wt.branch || wtBasename;
                  const isSelected = worktreePickerValue === wt.path;
                  return (
                    <button
                      key={wt.path}
                      onClick={() => setWorktreePickerValue(wt.path)}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-[#2a2520]/50 transition-colors border-b border-stone-700/50 last:border-0 ${
                        isSelected ? 'bg-violet-600/20' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-zinc-400 text-[10px]">{worktreePickerState.item.aiName || worktreePickerState.item.name}</span>
                          <span className="text-[#6b6459] text-[10px]">/</span>
                          <span className={`font-semibold text-xs ${isSelected ? 'text-violet-300' : wt.is_main ? 'text-[#ede7dd]/90' : 'text-teal-300'}`}>{displayName}</span>
                          {wt.is_main && <span className="text-[10px] text-zinc-500">(main)</span>}
                        </div>
                        <span className="text-[#6b6459] font-mono text-[10px] truncate block">{wtBasename}</span>
                      </div>
                      {wt.branch && wt.branch !== displayName && (
                        <span className="text-zinc-500 ml-2 shrink-0 text-[10px] bg-[#221f1b] px-1.5 py-0.5 rounded">{wt.branch}</span>
                      )}
                    </button>
                  );
                })}
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
              className="w-full px-3 py-2 text-sm bg-black/30 border border-stone-700/50 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-500 mb-3"
            />

            {/* 워크트리 제거 가이드 */}
            <div className="mb-4 px-3 py-2.5 bg-[#221f1b]/60 rounded-lg border border-stone-800/40">
              <p className="text-[10px] text-zinc-500 font-medium mb-1.5">워크트리 제거 방법</p>
              <div className="space-y-1">
                <div className="flex items-start gap-1.5">
                  <span className="text-[#6b6459] text-[10px] mt-0.5">·</span>
                  <code className="text-[10px] text-violet-400 font-mono">git worktree remove &lt;path&gt;</code>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-[#6b6459] text-[10px] mt-0.5">·</span>
                  <span className="text-[10px] text-zinc-500"><code className="text-zinc-400 font-mono">git worktree prune</code> — 삭제된 폴더 정리</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end items-center">
              <button
                onClick={() => { setWorktreePickerState(null); setDetectedWorktrees([]); }}
                className="px-3 py-1.5 text-xs text-zinc-500 hover:text-[#ede7dd]/90 transition-colors"
              >취소</button>
              <button
                onClick={() => { executeWithWorktree(undefined); }}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-[#ede7dd] border border-stone-700/50 rounded-lg transition-colors"
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
          <div className="bg-[#1c1916] rounded-xl border border-stone-800/40 w-full max-w-4xl max-h-[80vh] flex flex-col">
            {/* 헤더 */}
            <div className="flex items-center justify-between p-6 border-b border-stone-800/40">
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
                      ? '빌드 진행 중...'
                      : '빌드 완료'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBuildLog(false)}
                className="p-2 hover:bg-[#221f1b] rounded-lg transition-colors"
              >
                <XIcon className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            {/* 로그 내용 */}
            <div ref={buildLogContainerRef} className="flex-1 overflow-y-auto p-6 font-mono text-xs">
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
                        : 'text-[#ede7dd]/90'
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
            <div className="p-4 border-t border-stone-800/40 bg-[#1c1916]/80">
              <div className="flex items-center justify-between">
                <div className="text-xs text-zinc-400">
                  총 {buildLogs.length}줄의 로그
                </div>
                <div className="flex items-center gap-2">
                  {canAutoInstall && !isBuilding && (
                    <button
                      onClick={handleInstallWindowsPrereqs}
                      className="px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-xs rounded-lg border border-indigo-500/40 transition-colors font-medium"
                    >
                      🔧 자동 설치하기 (VS Build Tools + Rust)
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const logText = buildLogs.join('\n');
                      navigator.clipboard.writeText(logText);
                      showToast('로그가 클립보드에 복사되었습니다', 'success');
                    }}
                    className="px-3 py-1.5 bg-[#221f1b] hover:bg-[#2a2520] text-[#ede7dd]/90 text-xs rounded-lg transition-colors"
                  >
                    로그 복사
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Push 히스토리 모달 — 포트 */}
      {showPortsHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowPortsHistory(false)}>
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl w-full max-w-md mx-4 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-semibold text-white">Push 히스토리 — 포트</span>
              </div>
              <button onClick={() => setShowPortsHistory(false)} className="text-zinc-500 hover:text-white transition-colors"><XIcon className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto max-h-96">
              {portsHistoryLoading ? (
                <div className="flex items-center justify-center py-10"><RefreshCw className="w-5 h-5 text-zinc-500 animate-spin" /></div>
              ) : portsHistoryList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Clock className="w-8 h-8 text-zinc-700" />
                  <p className="text-sm text-zinc-500">저장된 히스토리가 없습니다</p>
                  <p className="text-xs text-zinc-600">Push 시 자동으로 스냅샷이 저장됩니다</p>
                </div>
              ) : portsHistoryList.map((snap, i) => (
                <div key={snap.id} className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium">{new Date(snap.created_at).toLocaleString('ko-KR')}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {snap.row_count}개 포트{snap.device_name ? ` · ${snap.device_name}` : ''}
                      {i === 0 && <span className="ml-1.5 text-emerald-500 font-medium">최신</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => restorePortsSnapshot(snap.id)}
                    disabled={portsHistoryRestoring !== null}
                    className="ml-3 shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-lg transition-all disabled:opacity-50"
                  >
                    {portsHistoryRestoring === snap.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                    복원
                  </button>
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-zinc-800 bg-zinc-900/40">
              <p className="text-xs text-zinc-600">복원 시 현재 Supabase 포트 데이터를 선택한 시점으로 되돌립니다</p>
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

      <div className="flex-1 flex flex-col min-h-0">
        {/* 탭 네비게이션 */}
        <div className="flex items-center gap-2 px-6 py-2.5 shrink-0 flex-wrap" style={{borderBottom:'1px solid rgba(255,240,220,0.07)'}}>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-xl p-1 w-fit" style={{background:'#1c1916',border:'1px solid rgba(255,240,220,0.07)'}}>
              {!isMobile && (
                <button
                  onClick={() => setActiveTab('ports')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    activeTab === 'ports'
                      ? 'shadow-sm'
                      : ''
                  }`}
                  style={{
                    background: activeTab === 'ports' ? '#2a2520' : 'transparent',
                    color: activeTab === 'ports' ? '#ede7dd' : '#a39a8c',
                  }}
                >
                  <Server className="w-3.5 h-3.5" />
                  프로젝트 관리
                </button>
              )}
              <button
                onClick={() => setActiveTab('portal')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                style={{
                  background: activeTab === 'portal' ? '#2a2520' : 'transparent',
                  color: activeTab === 'portal' ? '#ede7dd' : '#a39a8c',
                }}
              >
                <BookMarked className="w-3.5 h-3.5" />
                {isMobile ? '북마크' : '포털'}
              </button>
            </div>

            {/* 포털 탭 전용 액션 버튼 (글로벌 위치) */}
            {activeTab === 'portal' && (
              <>
                <div className="flex items-center rounded-lg border border-stone-800/40 overflow-hidden">
                  <button
                    onClick={() => portalActionsRef.current?.push()}
                    title="Supabase Push"
                    className="px-2.5 py-1.5 bg-[#1c1916] hover:bg-[#221f1b] text-[#ede7dd]/90 text-sm border-r border-stone-800/40 transition-all flex items-center gap-1"
                  >
                    <CloudUpload className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-xs font-medium">Push</span>
                  </button>
                  <button
                    onClick={() => portalActionsRef.current?.pull()}
                    title="Supabase Pull"
                    className="px-2.5 py-1.5 bg-[#1c1916] hover:bg-[#221f1b] text-[#ede7dd]/90 text-sm transition-all flex items-center gap-1"
                  >
                    <CloudDownload className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-xs font-medium">Pull</span>
                  </button>
                </div>
                <button
                  onClick={() => portalActionsRef.current?.exportData()}
                  title="내보내기"
                  className="p-2 bg-[#1c1916] hover:bg-[#221f1b] text-zinc-500 hover:text-[#ede7dd]/90 rounded-xl border border-stone-800/40 hover:border-stone-700/60 transition-all"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => portalActionsRef.current?.importData()}
                  title="불러오기"
                  className="p-2 bg-[#1c1916] hover:bg-[#221f1b] text-zinc-500 hover:text-[#ede7dd]/90 rounded-xl border border-stone-800/40 hover:border-stone-700/60 transition-all"
                >
                  <Upload className="w-4 h-4" />
                </button>
                <button
                  onClick={() => portalActionsRef.current?.openSettings()}
                  title="Supabase / 단말 설정"
                  className="p-2 bg-[#1c1916] hover:bg-[#221f1b] text-zinc-500 hover:text-[#ede7dd]/90 rounded-xl border border-stone-800/40 hover:border-stone-700/60 transition-all"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </>
            )}

            {/* 포트 탭 전용 액션 버튼 (글로벌 위치) */}
            {activeTab === 'ports' && (
              <>
                <button onClick={handleExportPorts} title="내보내기" className="p-2 bg-[#1c1916] hover:bg-[#221f1b] text-zinc-500 hover:text-[#ede7dd]/90 rounded-xl border border-stone-800/40 hover:border-stone-700/60 transition-all">
                  <Download className="w-4 h-4" />
                </button>
                <button onClick={handleImportPorts} title="불러오기" className="p-2 bg-[#1c1916] hover:bg-[#221f1b] text-zinc-500 hover:text-[#ede7dd]/90 rounded-xl border border-stone-800/40 hover:border-stone-700/60 transition-all">
                  <Upload className="w-4 h-4" />
                </button>
                <button onClick={handleRefresh} disabled={isRefreshing || isAiEnriching} title={isAiEnriching ? 'AI 분석 중…' : '새로고침'} className="p-2 bg-[#1c1916] hover:bg-[#221f1b] text-zinc-500 hover:text-[#ede7dd]/90 rounded-xl border border-stone-800/40 hover:border-stone-700/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  <RefreshCw className={`w-4 h-4 ${isRefreshing || isAiEnriching ? 'animate-spin' : ''}`} />
                </button>
                <div className="flex items-center rounded-xl border border-stone-800/40 overflow-hidden">
                  <button onClick={handlePushToSupabase} disabled={isPushingPorts} title="Supabase Push" className="px-2.5 py-1.5 bg-[#1c1916] hover:bg-[#221f1b] text-[#ede7dd]/90 text-sm border-r border-stone-800/40 transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed">
                    <CloudUpload className={`w-3.5 h-3.5 ${isPushingPorts ? 'animate-pulse' : 'text-indigo-400'}`} />
                    <span className="text-xs font-medium">Push</span>
                  </button>
                  <button onClick={handleRestoreFromSupabase} disabled={isRestoring} title="Supabase Pull" className="px-2.5 py-1.5 bg-[#1c1916] hover:bg-[#221f1b] text-[#ede7dd]/90 text-sm transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed">
                    <CloudDownload className={`w-3.5 h-3.5 ${isRestoring ? 'animate-pulse' : 'text-indigo-400'}`} />
                    <span className="text-xs font-medium">Pull</span>
                  </button>
                </div>
                <button
                  onClick={openPortsHistory}
                  title="Push 히스토리 / 복원"
                  className="p-2 bg-[#1c1916] hover:bg-[#221f1b] text-zinc-500 hover:text-[#ede7dd]/90 rounded-xl border border-stone-800/40 hover:border-stone-700/60 transition-all"
                >
                  <Clock className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setOpenPortalSettings(true)}
                  title="Supabase / 단말 설정"
                  className="p-2 bg-[#1c1916] hover:bg-[#221f1b] text-zinc-500 hover:text-[#ede7dd]/90 rounded-xl border border-stone-800/40 hover:border-stone-700/60 transition-all"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </>
            )}

            {/* 설정 마법사 버튼 */}
            <button
              onClick={() => setShowSetupWizard(true)}
              title="초기 설정 마법사"
              className="px-2.5 py-1.5 bg-[#1c1916] hover:bg-[#221f1b] text-zinc-500 hover:text-[#ede7dd]/90 text-xs rounded-xl border border-stone-800/40 hover:border-stone-700/60 transition-all flex items-center gap-1"
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>세팅</span>
            </button>

            {/* 로그 복사 버튼 */}
            <button
              onClick={handleCopyLog}
              title="앱 오류 로그 클립보드 복사 (개선에 활용)"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-xl border transition-all ${
                logCopied
                  ? 'bg-green-500/10 border-green-500/30 text-green-400'
                  : 'bg-[#1c1916] hover:bg-[#221f1b] text-zinc-500 hover:text-[#ede7dd]/90 border-stone-800/40 hover:border-stone-700/60'
              }`}
            >
              {logCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{logCopied ? '복사됨' : '로그'}</span>
            </button>

            {/* 사용자 가이드 버튼 */}
            <button
              onClick={() => setShowGuideModal(true)}
              title="사용자 가이드"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-xl border bg-[#1c1916] hover:bg-[#221f1b] text-zinc-500 hover:text-[#ede7dd]/90 border-stone-800/40 hover:border-stone-700/60 transition-all"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>가이드</span>
            </button>
          </div>
        </div>

        {/* 포털 탭 — 항상 마운트, isVisible로 UI 표시 제어 (설정 모달은 탭 무관하게 동작) */}
        <div className={activeTab === 'portal' ? 'flex-1 overflow-auto' : ''}>
          <PortalManager
            showToast={showToast}
            openSettings={openPortalSettings}
            onSettingsClosed={() => setOpenPortalSettings(false)}
            actionsRef={portalActionsRef}
            isVisible={activeTab === 'portal'}
          />
        </div>

        {/* 경로 remapping 모달 — 다른 기기 Pull 후 경로 없는 포트 설정 */}
        {remappingPorts.length > 0 && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-6">
            <div className="bg-[#15120f] border border-stone-700/80 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
              <div className="px-5 py-4 border-b border-stone-800/40 shrink-0">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-amber-400" />
                  경로 설정 필요 — {remappingPorts.length}개 프로젝트
                </h2>
                <p className="text-xs text-zinc-500 mt-1">다른 기기에서 가져온 프로젝트에 이 기기의 폴더 경로를 설정하세요. 나중에 개별 설정도 가능합니다.</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {remappingPorts.map(p => (
                  <div key={p.id} className="bg-[#221f1b] border border-stone-800/40 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-white">{p.name}</span>
                      {p.port && <span className="text-xs text-zinc-500 font-mono">:{p.port}</span>}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={remappingPaths[p.id] ?? ''}
                        onChange={e => setRemappingPaths(prev => ({ ...prev, [p.id]: e.target.value }))}
                        placeholder="/Users/nhis/..."
                        className="flex-1 px-3 py-1.5 text-xs bg-black/40 border border-stone-700/50 text-white placeholder-zinc-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                      />
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/pick-folder');
                            const { path } = await res.json();
                            if (path) setRemappingPaths(prev => ({ ...prev, [p.id]: path }));
                          } catch {}
                        }}
                        className="px-2.5 py-1.5 bg-[#221f1b] hover:bg-[#2a2520] text-zinc-400 hover:text-[#ede7dd] text-xs rounded-lg border border-stone-700/50 transition-all"
                        title="폴더 선택"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-stone-800/40 px-5 py-4 flex justify-between shrink-0">
                <button
                  onClick={() => setRemappingPorts([])}
                  className="px-4 py-2 text-sm text-zinc-500 hover:text-[#ede7dd]/90 transition-colors"
                >
                  나중에 설정
                </button>
                <button
                  onClick={() => {
                    const updated = ports.map(p => {
                      const newPath = remappingPaths[p.id];
                      return newPath ? { ...p, folderPath: newPath } : p;
                    });
                    setPorts(updated);
                    API.savePorts(updated);
                    setRemappingPorts([]);
                    const count = Object.values(remappingPaths).filter(Boolean).length;
                    if (count > 0) showToast(`${count}개 경로 저장됨 ✓`, 'success');
                  }}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg transition-all"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 설정 마법사 오버레이 */}
        {/* 사용자 가이드 모달 */}
        {showGuideModal && (
          <div className="fixed inset-0 z-[200] flex items-start justify-center" style={{background:'rgba(10,8,6,0.65)',backdropFilter:'blur(2px)',paddingTop:60}} onClick={() => setShowGuideModal(false)}>
            <div style={{width:640,maxHeight:'calc(100vh - 100px)',background:'#1c1916',borderRadius:12,border:'1px solid rgba(255,240,220,0.12)',boxShadow:'0 24px 80px rgba(0,0,0,0.6)',overflow:'hidden',display:'flex',flexDirection:'column'}} onClick={e => e.stopPropagation()}>
              {/* 헤더 */}
              <div style={{padding:'14px 20px',display:'flex',alignItems:'center',gap:8,borderBottom:'1px solid rgba(255,240,220,0.07)'}}>
                <GitBranch className="w-3.5 h-3.5" style={{color:'#e8a557'}} />
                <h2 style={{margin:0,fontSize:14,fontWeight:600,letterSpacing:-0.2,color:'#ede7dd'}}>포트 관리기 사용자 가이드</h2>
                <div style={{flex:1}}/>
                <button onClick={() => setShowGuideModal(false)} style={{background:'transparent',border:'none',color:'#a39a8c',cursor:'pointer',padding:4,display:'flex',alignItems:'center'}}>
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* 본문 */}
              <div style={{overflow:'auto',padding:'16px 20px'}}>
                <div style={{fontSize:12.5,color:'#a39a8c',marginBottom:14}}>
                  처음 쓰는 분도 5분이면 핵심 기능을 모두 쓸 수 있습니다.
                </div>

                {/* GuideCards 2-col */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:18}}>
                  {[
                    {icon:<Server className="w-3 h-3"/>, tone:{bg:'rgba(232,165,87,0.12)',fg:'#e8a557'}, title:'프로젝트 관리', desc:'.command 파일로 개발 서버를 한 클릭으로 실행/중지/재시작'},
                    {icon:<BookMarked className="w-3 h-3"/>, tone:{bg:'rgba(123,167,201,0.14)',fg:'#7ba7c9'}, title:'포털', desc:'자주 쓰는 사이트·폴더를 카테고리별 북마크로 관리'},
                  ].map(c => (
                    <div key={c.title} style={{padding:'14px 16px',background:'#15120f',border:'1px solid rgba(255,240,220,0.07)',borderRadius:9}}>
                      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                        <div style={{width:26,height:26,borderRadius:6,background:c.tone.bg,color:c.tone.fg,display:'flex',alignItems:'center',justifyContent:'center'}}>{c.icon}</div>
                        <div style={{fontSize:13,fontWeight:600,letterSpacing:-0.2,color:'#ede7dd'}}>{c.title}</div>
                      </div>
                      <div style={{fontSize:11.5,color:'#a39a8c',lineHeight:1.5}}>{c.desc}</div>
                    </div>
                  ))}
                </div>

                {/* 퀵스타트 */}
                <div style={{display:'flex',alignItems:'center',gap:6,margin:'0 0 10px',fontSize:12,fontWeight:600,color:'#ede7dd'}}>
                  <span style={{width:20,height:20,borderRadius:5,background:'rgba(232,165,87,0.12)',color:'#e8a557',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                    <Play className="w-2.5 h-2.5"/>
                  </span>
                  퀵스타트
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:16}}>
                  {[
                    '브라우저: localhost:9000 접속 또는 포트관리기.app 실행',
                    'Finder에서 .command 파일을 앱 창으로 끌어다 놓기 → 포트·폴더 자동 감지',
                    '프로젝트 카드의 ▶ 실행 버튼 클릭 → 우측 상단 초록 Toast 확인',
                    '카드의 🟢 열기 버튼 → Chrome에서 localhost:포트 자동 오픈',
                  ].map((line, i) => (
                    <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'6px 10px',background:'#15120f',border:'1px solid rgba(255,240,220,0.07)',borderRadius:6,fontSize:12}}>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10.5,color:'#e8a557',background:'rgba(232,165,87,0.12)',padding:'2px 7px',borderRadius:4,flexShrink:0}}>Step {i+1}</span>
                      <span style={{flex:1,color:'#ede7dd'}}>{line}</span>
                    </div>
                  ))}
                </div>

                {/* 프로젝트 카드 버튼 */}
                <div style={{display:'flex',alignItems:'center',gap:6,margin:'16px 0 10px',fontSize:12,fontWeight:600,color:'#ede7dd'}}>프로젝트 카드 버튼</div>
                <div style={{border:'1px solid rgba(255,240,220,0.07)',borderRadius:8,overflow:'hidden',background:'#15120f',marginBottom:16}}>
                  {[
                    ['▶ 실행', '.command 파일 실행, 로그 자동 저장'],
                    ['■ 중지', 'SIGTERM → (응답 없으면) SIGKILL 자동 전환'],
                    ['⟳ 강제 재실행', '모든 PID 즉시 종료 → 500ms 대기 → 재실행'],
                    ['● 열기', 'Chrome에서 localhost:포트 오픈'],
                    ['📁 폴더', 'Finder에서 프로젝트 폴더 열기'],
                    ['📜 로그', 'Terminal에서 tail -f로 실시간 로그 확인'],
                  ].map(([btn, desc], i) => (
                    <div key={String(btn)} style={{display:'grid',gridTemplateColumns:'120px 1fr',gap:10,padding:'8px 12px',fontSize:12,borderTop:i===0?'none':'1px solid rgba(255,240,220,0.07)'}}>
                      <span style={{color:'#e8a557',fontFamily:"'JetBrains Mono',monospace"}}>{btn}</span>
                      <span style={{color:'#a39a8c'}}>{desc}</span>
                    </div>
                  ))}
                </div>

                {/* 포털 탭 */}
                <div style={{display:'flex',alignItems:'center',gap:6,margin:'16px 0 10px',fontSize:12,fontWeight:600,color:'#ede7dd'}}>포털 탭</div>
                <div style={{fontSize:12,color:'#a39a8c',marginBottom:10}}>우측 상단 + 버튼 → URL 또는 폴더 경로 입력</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
                  {[
                    {icon:<Star className="w-3 h-3"/>, tone:{bg:'rgba(232,165,87,0.12)',fg:'#e8a557'}, title:'핀 고정', desc:'카드 hover → 핀 아이콘 → 최상단 고정'},
                    {icon:<RefreshCw className="w-3 h-3"/>, tone:{bg:'rgba(90,192,74,0.12)',fg:'#8fb96e'}, title:'기기 동기화', desc:'URL·카테고리는 전 기기 공유, 폴더는 기기별 관리'},
                  ].map(c => (
                    <div key={c.title} style={{padding:'10px 12px',background:'#15120f',border:'1px solid rgba(255,240,220,0.07)',borderRadius:9}}>
                      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                        <div style={{width:26,height:26,borderRadius:6,background:c.tone.bg,color:c.tone.fg,display:'flex',alignItems:'center',justifyContent:'center'}}>{c.icon}</div>
                        <div style={{fontSize:13,fontWeight:600,letterSpacing:-0.2,color:'#ede7dd'}}>{c.title}</div>
                      </div>
                      <div style={{fontSize:11.5,color:'#a39a8c',lineHeight:1.5}}>{c.desc}</div>
                    </div>
                  ))}
                </div>

                {/* 숨겨진 기능 */}
                <div style={{display:'flex',alignItems:'center',gap:6,margin:'16px 0 10px',fontSize:12,fontWeight:600,color:'#ede7dd'}}>💎 이런 기능이 있었어? TOP 6</div>
                <div style={{border:'1px solid rgba(255,240,220,0.07)',borderRadius:8,overflow:'hidden',background:'#15120f',marginBottom:16}}>
                  {[
                    ['Cmd+F', '프로젝트 검색창 즉시 포커스'],
                    ['✨ AI 버튼', '전체 프로젝트 이름·카테고리 한 번에 자동 생성'],
                    ['⚠ 강제 재실행', '좀비 프로세스 한 방에 정리'],
                    ['📜 로그 버튼', 'Terminal 자동 오픈 + tail -f 실시간 확인'],
                    ['JSON 내보내기', 'Supabase 없이 백업/복원 가능'],
                    ['단말 조회', '설정 → 고급 설정 → 다른 맥의 포트 목록 Pull'],
                  ].map(([feat, desc], i) => (
                    <div key={String(feat)} style={{display:'grid',gridTemplateColumns:'120px 1fr',gap:10,padding:'8px 12px',fontSize:12,borderTop:i===0?'none':'1px solid rgba(255,240,220,0.07)'}}>
                      <span style={{color:'#e8a557',fontFamily:"'JetBrains Mono',monospace"}}>{feat}</span>
                      <span style={{color:'#a39a8c'}}>{desc}</span>
                    </div>
                  ))}
                </div>

                {/* 북마크 웹버전 */}
                <div style={{display:'flex',alignItems:'center',gap:6,margin:'16px 0 10px',fontSize:12,fontWeight:600,color:'#ede7dd'}}>🌍 북마크 웹버전</div>
                <div style={{background:'rgba(232,165,87,0.06)',border:'1px solid rgba(232,165,87,0.2)',borderRadius:9,padding:'12px 14px',marginBottom:10,fontSize:12,color:'#ede7dd',lineHeight:1.6}}>
                  포털 탭과 동일한 북마크 기능을 <span style={{color:'#e8a557',fontWeight:500}}>Vercel 배포 URL</span>로 제공합니다.<br/>
                  회사 PC, 스마트폰, 어디서나 브라우저 하나로 내 북마크에 접근할 수 있습니다.
                </div>
                <div style={{border:'1px solid rgba(255,240,220,0.07)',borderRadius:8,overflow:'hidden',background:'#15120f',marginBottom:16}}>
                  {[
                    ['비밀번호 보호', '배포 시 환경변수로 설정 — 타인 접근 차단'],
                    ['기기 선택', '첫 접속 시 Supabase 등록 기기 목록에서 선택'],
                    ['자동 Pull', '접속하면 선택 기기의 북마크를 즉시 불러옴'],
                    ['모바일 최적화', '스마트폰에서도 편하게 사용 가능'],
                  ].map(([feat, desc], i) => (
                    <div key={String(feat)} style={{display:'grid',gridTemplateColumns:'120px 1fr',gap:10,padding:'8px 12px',fontSize:12,borderTop:i===0?'none':'1px solid rgba(255,240,220,0.07)'}}>
                      <span style={{color:'#e8a557',fontFamily:"'JetBrains Mono',monospace"}}>{feat}</span>
                      <span style={{color:'#a39a8c'}}>{desc}</span>
                    </div>
                  ))}
                </div>

                {/* 트러블슈팅 */}
                <div style={{display:'flex',alignItems:'center',gap:6,margin:'16px 0 10px',fontSize:12,fontWeight:600,color:'#ede7dd'}}>🔧 자주 겪는 문제</div>
                <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:16}}>
                  {[
                    ['서버가 안 켜져요', '카드의 ⚠ 강제 재실행 클릭'],
                    ['Push/Pull이 안 눌려요', '⚙ 세팅에서 Supabase URL + anon key 확인'],
                    ['포트 번호가 안 잡혀요', '.command 파일 안에 PORT=3000 또는 localhost:3000 포함 필요'],
                    ['웹버전에 내 기기가 없어요', '세팅 → 기기 이름 확인 후 Device ID 직접 입력'],
                  ].map(([q, a]) => (
                    <div key={String(q)} style={{background:'#15120f',border:'1px solid rgba(255,240,220,0.07)',borderRadius:8,padding:'10px 12px'}}>
                      <div style={{fontSize:12,fontWeight:500,color:'#ede7dd',marginBottom:2}}>Q. {q}</div>
                      <div style={{fontSize:12,color:'#a39a8c'}}>→ {a}</div>
                    </div>
                  ))}
                </div>

                {/* 단축키 */}
                <div style={{display:'flex',alignItems:'center',gap:6,margin:'16px 0 10px',fontSize:12,fontWeight:600,color:'#ede7dd'}}>⌨️ 단축키</div>
                <div style={{display:'flex',gap:16,fontSize:12,color:'#a39a8c',marginBottom:8}}>
                  <span><kbd style={{background:'#221f1b',color:'#ede7dd',padding:'2px 6px',borderRadius:4,fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>Cmd+F</kbd> 검색창 포커스</span>
                  <span><kbd style={{background:'#221f1b',color:'#ede7dd',padding:'2px 6px',borderRadius:4,fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>Esc</kbd> 검색창 닫기</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 삭제 확인 모달 */}
        {deleteConfirmId && (() => {
          const target = ports.find(p => p.id === deleteConfirmId);
          return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
              <div className="bg-[#1c1916] border border-stone-700/50 rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center shrink-0">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">포트 삭제</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">이 작업은 되돌릴 수 없습니다</p>
                  </div>
                </div>
                <p className="text-sm text-[#ede7dd]/90 mb-5">
                  <span className="text-white font-medium">"{target?.name ?? deleteConfirmId}"</span> 포트를 삭제하시겠습니까?
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-2 bg-[#221f1b] hover:bg-[#2a2520] text-[#ede7dd]/90 text-sm rounded-xl border border-stone-700/50 transition-all">취소</button>
                  <button onClick={() => handleConfirmDelete(deleteConfirmId)} className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-xl border border-red-500 transition-all">삭제</button>
                </div>
              </div>
            </div>
          );
        })()}

        {wslSetupStatus && (
          <WslSetupModal
            status={wslSetupStatus}
            onClose={() => setWslSetupStatus(null)}
            onInstallTmux={handleInstallWslTmux}
          />
        )}

        {showSetupWizard && (
          <SetupWizard
            onComplete={async ({ supabaseUrl, supabaseAnonKey, deviceName }) => {
              // portal.json에 저장
              try {
                const existing = isTauri()
                  ? (await (async () => { const { invoke } = await import('@tauri-apps/api/core'); return invoke('load_portal'); })())
                  : await getPortalCredentials();
                const next = { ...(existing as any), supabaseUrl, supabaseAnonKey, deviceName };
                if (isTauri()) {
                  const { invoke } = await import('@tauri-apps/api/core');
                  await invoke('save_portal', { data: JSON.stringify(next) });
                } else {
                  await fetch('http://127.0.0.1:3001/api/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
                }
                portalConfigRef.current = next;
                showToast(`${deviceName} 설정 완료! 동기화를 시작합니다.`, 'success');
              } catch (e) {
                showToast('설정 저장 실패: ' + e, 'error');
              }
              setShowSetupWizard(false);
              setActiveTab('portal');
            }}
            onSkip={() => setShowSetupWizard(false)}
          />
        )}

        {/* 포트 관리 탭 - V3 Sidebar */}
        {activeTab === 'ports' && (
          <div style={{flex:1,display:'flex',minHeight:0,overflow:'hidden'}}>
            {/* LEFT SIDEBAR */}
            <div style={{
              width:240,flexShrink:0,display:'flex',flexDirection:'column',
              background:'#1c1916',borderRight:'1px solid rgba(255,240,220,0.07)',
              overflowY:'auto' as const,
            }}>
              {/* Logo */}
              <div style={{
                padding:'16px 12px 12px',display:'flex',alignItems:'center',gap:8,
                borderBottom:'1px solid rgba(255,240,220,0.07)',
              }}>
                <div style={{
                  width:22,height:22,borderRadius:6,background:'#e8a557',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:11,fontWeight:700,fontFamily:'JetBrains Mono, monospace',color:'#15120f',
                }}>P</div>
                <span style={{fontSize:13,fontWeight:600,color:'#ede7dd'}}>Port Manager</span>
              </div>

              {/* Search */}
              <div style={{padding:'10px 8px'}}>
                <div style={{position:'relative'}}>
                  <Search style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',width:12,height:12,color:'#6b6459'}} />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search…"
                    style={{
                      width:'100%',paddingLeft:26,paddingRight:8,paddingTop:6,paddingBottom:6,
                      background:'#221f1b',border:'1px solid rgba(255,240,220,0.07)',
                      borderRadius:6,color:'#ede7dd',fontSize:12,outline:'none',
                      fontFamily:'Inter Tight, system-ui, sans-serif',boxSizing:'border-box' as const,
                    }}
                  />
                </div>
              </div>

              {/* Section nav */}
              {([
                {id:'all',    label:'All projects', count: ports.length,                              Icon: Server},
                {id:'running',label:'Running now',  count: ports.filter((p:PortInfo)=>p.isRunning).length,      Icon: Play},
                {id:'starred',label:'Starred',      count: ports.filter((p:PortInfo)=>p.favorite).length,       Icon: Star},
                {id:'wt',     label:'Worktrees',    count: ports.filter((p:PortInfo)=>!!p.worktreePath).length, Icon: GitBranch},
              ] as const).map(({id,label,count,Icon}) => (
                <button key={id} onClick={() => setSidebarSection(id)} style={{
                  display:'flex',alignItems:'center',gap:8,
                  padding:'6px 8px',margin:'0 4px',borderRadius:5,cursor:'pointer',
                  background: sidebarSection === id ? '#221f1b' : 'transparent',
                  color: sidebarSection === id ? '#ede7dd' : '#a39a8c',
                  border:'none',fontSize:12.5,
                  fontFamily:'Inter Tight, system-ui, sans-serif',textAlign:'left' as const,
                }}>
                  <Icon style={{width:12,height:12,flexShrink:0}} />
                  <span style={{flex:1}}>{label}</span>
                  <span style={{fontSize:10.5,color:'#6b6459',fontFamily:'JetBrains Mono, monospace'}}>{count}</span>
                </button>
              ))}

              {/* Tags */}
              {(() => {
                const tags = [...new Set(ports.map((p:PortInfo)=>p.category).filter(Boolean) as string[])].slice(0,8);
                if (!tags.length) return null;
                return (
                  <>
                    <div style={{
                      padding:'12px 12px 4px',fontSize:10,
                      fontFamily:'JetBrains Mono, monospace',
                      color:'#6b6459',textTransform:'uppercase' as const,letterSpacing:0.5,
                    }}>Tags</div>
                    {tags.map((tag:string) => {
                      const n = ports.filter((p:PortInfo)=>p.category===tag).length;
                      const active = sidebarSection === `tag:${tag}`;
                      return (
                        <button key={tag} onClick={() => setSidebarSection(`tag:${tag}`)} style={{
                          display:'flex',alignItems:'center',gap:8,
                          padding:'5px 8px',margin:'0 4px',borderRadius:5,cursor:'pointer',
                          background: active ? '#221f1b' : 'transparent',
                          color: active ? '#ede7dd' : '#a39a8c',
                          border:'none',fontSize:12,textAlign:'left' as const,
                          fontFamily:'Inter Tight, system-ui, sans-serif',
                        }}>
                          <span style={{width:7,height:7,borderRadius:2,background:'#e8a557',opacity:0.5,flexShrink:0}} />
                          <span style={{flex:1,fontFamily:'JetBrains Mono, monospace',fontSize:11}}>{tag}</span>
                          <span style={{fontSize:10.5,color:'#6b6459',fontFamily:'JetBrains Mono, monospace'}}>{n}</span>
                        </button>
                      );
                    })}
                  </>
                );
              })()}

              {/* Workspace Roots Panel */}
              <div style={{marginTop:'auto',borderTop:'1px solid rgba(255,240,220,0.07)'}}>
                <button
                  onClick={() => setWorkspaceRootsOpen(v => !v)}
                  style={{
                    display:'flex',alignItems:'center',gap:6,width:'100%',
                    padding:'8px 12px',background:'transparent',border:'none',cursor:'pointer',
                    color:'#6b6459',
                  }}
                >
                  {workspaceRootsOpen
                    ? <ChevronDown style={{width:11,height:11}}/>
                    : <ChevronDown style={{width:11,height:11,transform:'rotate(-90deg)'}}/>
                  }
                  <span style={{fontSize:10,fontFamily:'JetBrains Mono, monospace',textTransform:'uppercase' as const,letterSpacing:0.5,flex:1,textAlign:'left' as const}}>
                    작업 루트
                  </span>
                  {workspaceRoots.length > 0 && (
                    <span style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#6b6459',background:'rgba(255,240,220,0.06)',padding:'1px 5px',borderRadius:3}}>
                      {workspaceRoots.length}
                    </span>
                  )}
                </button>

                {workspaceRootsOpen && (
                  <div style={{paddingBottom:8}}>
                    {workspaceRoots.map((root: WorkspaceRoot) => {
                      const projectCount = ports.filter((p: PortInfo) => p.folderPath?.startsWith(root.path)).length;
                      return (
                        <div key={root.id} style={{display:'flex',alignItems:'center',gap:4,padding:'3px 8px 3px 20px'}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:11,fontFamily:'JetBrains Mono, monospace',color:'#c8bfb5',whiteSpace:'nowrap' as const,overflow:'hidden',textOverflow:'ellipsis'}}>
                              {root.name}
                            </div>
                            <div style={{fontSize:9.5,fontFamily:'JetBrains Mono, monospace',color:'#6b6459',whiteSpace:'nowrap' as const,overflow:'hidden',textOverflow:'ellipsis'}}>
                              {root.path}
                            </div>
                          </div>
                          {projectCount > 0 && (
                            <span style={{fontSize:9,fontFamily:'JetBrains Mono, monospace',color:'#6b6459',background:'rgba(255,240,220,0.06)',padding:'1px 4px',borderRadius:3,flexShrink:0}}>
                              {projectCount}
                            </span>
                          )}
                          <button
                            onClick={() => { setActiveRootId(root.id); setShowNewProjectModal(true); }}
                            title="새 프로젝트 폴더"
                            style={{padding:'2px 6px',background:'rgba(232,165,87,0.1)',border:'1px solid rgba(232,165,87,0.2)',borderRadius:4,color:'#e8a557',cursor:'pointer',fontSize:10,fontFamily:'Inter Tight, system-ui, sans-serif',flexShrink:0}}
                          >
                            새 폴더
                          </button>
                          <button
                            onClick={() => handleRemoveWorkspaceRoot(root.id)}
                            title="루트 제거"
                            style={{padding:'2px 4px',background:'transparent',border:'none',color:'#6b6459',cursor:'pointer',display:'flex',alignItems:'center',flexShrink:0}}
                          >
                            <XIcon style={{width:10,height:10}}/>
                          </button>
                        </div>
                      );
                    })}
                    <button
                      onClick={handleAddWorkspaceRoot}
                      style={{
                        display:'flex',alignItems:'center',gap:5,
                        margin:'4px 8px 0 20px',padding:'4px 8px',
                        background:'transparent',border:'1px dashed rgba(255,240,220,0.12)',
                        borderRadius:5,color:'#6b6459',cursor:'pointer',
                        fontSize:10,fontFamily:'Inter Tight, system-ui, sans-serif',
                      }}
                    >
                      <Plus style={{width:10,height:10}}/> 루트 추가
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* MAIN AREA */}
            <div style={{flex:1,display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}>
              {/* Main header */}
              <div style={{
                flexShrink:0,padding:'14px 28px 12px',
                display:'flex',alignItems:'center',gap:10,
                borderBottom:'1px solid rgba(255,240,220,0.07)',
              }}>
                <h1 style={{margin:0,fontSize:18,fontWeight:600,letterSpacing:-0.3,color:'#ede7dd'}}>
                  {sidebarSection === 'all' ? 'All projects'
                    : sidebarSection === 'running' ? 'Running now'
                    : sidebarSection === 'starred' ? 'Starred'
                    : sidebarSection === 'wt' ? 'Worktrees'
                    : sidebarSection.startsWith('tag:') ? sidebarSection.slice(4)
                    : 'All projects'}
                </h1>
                <span style={{fontSize:12,color:'#a39a8c'}}>{v3Ports.length} projects</span>
                <div style={{flex:1}} />
                <button onClick={handleExportPorts} title="내보내기" style={{padding:'5px 8px',background:'transparent',border:'1px solid rgba(255,240,220,0.07)',borderRadius:5,color:'#a39a8c',cursor:'pointer',display:'flex',alignItems:'center'}}>
                  <Download style={{width:13,height:13}} />
                </button>
                <button onClick={handleImportPorts} title="불러오기" style={{padding:'5px 8px',background:'transparent',border:'1px solid rgba(255,240,220,0.07)',borderRadius:5,color:'#a39a8c',cursor:'pointer',display:'flex',alignItems:'center'}}>
                  <Upload style={{width:13,height:13}} />
                </button>
                <button onClick={handleRefresh} disabled={isRefreshing||isAiEnriching} title="새로고침" style={{padding:'5px 8px',background:'transparent',border:'1px solid rgba(255,240,220,0.07)',borderRadius:5,color:'#a39a8c',cursor:'pointer',display:'flex',alignItems:'center'}}>
                  <RefreshCw style={{width:13,height:13}} className={isRefreshing||isAiEnriching ? 'animate-spin' : ''} />
                </button>
                <button onClick={handlePushToSupabase} disabled={isPushingPorts} title="Supabase Push" style={{padding:'5px 8px',background:'transparent',border:'1px solid rgba(255,240,220,0.07)',borderRadius:5,color:'#a39a8c',cursor:'pointer',display:'flex',alignItems:'center',gap:3,fontSize:11,fontFamily:'Inter Tight, system-ui, sans-serif'}}>
                  <CloudUpload style={{width:13,height:13}} className={isPushingPorts ? 'animate-pulse' : ''} />
                  Push
                </button>
                <button onClick={handleRestoreFromSupabase} disabled={isRestoring} title="Supabase Pull" style={{padding:'5px 8px',background:'transparent',border:'1px solid rgba(255,240,220,0.07)',borderRadius:5,color:'#a39a8c',cursor:'pointer',display:'flex',alignItems:'center',gap:3,fontSize:11,fontFamily:'Inter Tight, system-ui, sans-serif'}}>
                  <CloudDownload style={{width:13,height:13}} className={isRestoring ? 'animate-pulse' : ''} />
                  Pull
                </button>
                <button onClick={() => setOpenPortalSettings(true)} title="설정" style={{padding:'5px 8px',background:'transparent',border:'1px solid rgba(255,240,220,0.07)',borderRadius:5,color:'#a39a8c',cursor:'pointer',display:'flex',alignItems:'center'}}>
                  <Settings style={{width:13,height:13}} />
                </button>
                {!isTauri() && (
                  <>
                    <button onClick={handleBuildApp} disabled={isBuilding} title="앱 빌드" style={{padding:'5px 8px',background:'transparent',border:'1px solid rgba(255,240,220,0.07)',borderRadius:5,color:'#a39a8c',cursor:'pointer',display:'flex',alignItems:'center'}}>
                      <Terminal style={{width:13,height:13}} className={isBuilding && buildType==='app' ? 'animate-spin' : ''} />
                    </button>
                    <button onClick={handleBuildDmg} disabled={isBuilding} title="DMG 빌드" style={{padding:'5px 8px',background:'transparent',border:'1px solid rgba(255,240,220,0.07)',borderRadius:5,color:'#a39a8c',cursor:'pointer',display:'flex',alignItems:'center'}}>
                      <Package style={{width:13,height:13}} className={isBuilding && buildType==='dmg' ? 'animate-spin' : ''} />
                    </button>
                  </>
                )}
                <button
                  onClick={() => { setActiveRootId(workspaceRoots[0]?.id ?? null); setShowNewProjectModal(true); }}
                  style={{
                    padding:'5px 12px',background:'#e8a557',border:'none',borderRadius:5,
                    fontSize:11.5,fontWeight:600,cursor:'pointer',color:'#15120f',
                    display:'flex',alignItems:'center',gap:4,
                    fontFamily:'Inter Tight, system-ui, sans-serif',
                  }}
                >
                  <Plus style={{width:11,height:11}} />
                  New project
                </button>
              </div>

              {/* Card grid */}
              <div style={{flex:1,overflowY:'auto',padding:'16px 28px 28px'}}>
                {v3Running.length > 0 && (
                  <div style={{marginBottom:24}}>
                    <div style={{
                      display:'flex',alignItems:'center',gap:6,marginBottom:10,
                      fontSize:11,fontFamily:'JetBrains Mono, monospace',
                      color:'#a39a8c',textTransform:'uppercase' as const,letterSpacing:0.5,
                    }}>
                      <span style={{width:6,height:6,borderRadius:3,background:'#8fb96e',display:'inline-block'}} />
                      Running <span style={{color:'#6b6459',marginLeft:4}}>{v3Running.length}</span>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))',gap:12}}>
                      {v3Running.map(item => renderV3Card(item))}
                    </div>
                  </div>
                )}

                {v3Idle.length > 0 && (
                  <div>
                    <div style={{
                      display:'flex',alignItems:'center',gap:6,marginBottom:10,
                      fontSize:11,fontFamily:'JetBrains Mono, monospace',
                      color:'#a39a8c',textTransform:'uppercase' as const,letterSpacing:0.5,
                    }}>
                      <span style={{width:6,height:6,borderRadius:3,background:'#6b6459',display:'inline-block'}} />
                      Idle <span style={{color:'#6b6459',marginLeft:4}}>{v3Idle.length}</span>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))',gap:12}}>
                      {v3Idle.map(item => renderV3Card(item))}
                    </div>
                  </div>
                )}

                {v3Ports.length === 0 && (
                  <div style={{textAlign:'center',padding:'60px 0',color:'#6b6459'}}>
                    <Server style={{width:40,height:40,margin:'0 auto 16px',opacity:0.25}} />
                    <p style={{fontSize:14,fontWeight:600,color:'#a39a8c',marginBottom:8}}>아직 등록된 프로젝트가 없습니다</p>
                    <p style={{fontSize:12,color:'#6b6459'}}>우측 상단 <strong style={{color:'#e8a557'}}>+</strong> 버튼을 눌러 첫 번째 포트를 추가하세요</p>
                  </div>
                )}

                <div style={{marginTop:32,textAlign:'center'}}>
                  <p style={{fontSize:11,color:'#6b6459'}}>
                    © {new Date().getFullYear()} CS & Company. All rights reserved.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* New project 모달 */}
      {showNewProjectModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowNewProjectModal(false)}>
          <div className="bg-[#1c1916] rounded-xl border border-stone-800/40 w-full max-w-sm p-6 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">새 프로젝트 폴더 만들기</h2>
              <button onClick={() => setShowNewProjectModal(false)}
                className="p-1.5 hover:bg-stone-800 rounded-lg transition-colors text-zinc-500 hover:text-zinc-300">
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            {workspaceRoots.length === 0 ? (
              <div className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                먼저 작업 루트 폴더를 추가해주세요.<br />
                <span className="text-xs text-zinc-400">사이드바 → Workspace Roots → + 버튼</span>
              </div>
            ) : (
              <>
                {workspaceRoots.length > 1 && (
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">위치</label>
                    <select
                      value={activeRootId ?? ''}
                      onChange={e => setActiveRootId(e.target.value)}
                      className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-amber-500/50">
                      {workspaceRoots.map(r => (
                        <option key={r.id} value={r.id}>{r.name || r.path}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">프로젝트 이름</label>
                  <input
                    autoFocus
                    type="text"
                    value={newProjectName}
                    onChange={e => setNewProjectName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateProjectFolder()}
                    placeholder="my-project"
                    className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
                  />
                  {activeRootId && (
                    <p className="text-[11px] text-zinc-600 mt-1 font-mono truncate">
                      {workspaceRoots.find(r => r.id === activeRootId)?.path}/{newProjectName || '…'}
                    </p>
                  )}
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={registerAsProject} onChange={e => setRegisterAsProject(e.target.checked)}
                    className="accent-amber-500 w-3.5 h-3.5" />
                  <span className="text-xs text-zinc-400">포트 목록에 프로젝트로 등록</span>
                </label>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowNewProjectModal(false)}
                    className="flex-1 py-2 text-sm text-zinc-400 border border-stone-700 rounded-lg hover:bg-stone-800 transition-colors">
                    취소
                  </button>
                  <button onClick={handleCreateProjectFolder}
                    disabled={!newProjectName.trim()}
                    className="flex-1 py-2 text-sm font-semibold bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors">
                    만들기
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      </div>
    </div>
  );
}

export default App;
