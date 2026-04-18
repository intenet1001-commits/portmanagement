import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Server, Trash2, Plus, ExternalLink, Terminal, ArrowUpDown, Pencil, Check, X as XIcon, Play, Square, Rocket, FolderOpen, Upload, Download, Folder, FilePlus, Package, RefreshCw, FileText, RotateCw, Globe, Github, SquareTerminal, Info, Monitor, BookMarked, Cloud, CloudUpload, CloudDownload, Search, Sparkles, Settings, GitPullRequest, Copy, GitBranch } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { createClient } from '@supabase/supabase-js';
import PortalManager, { type PortalActions } from './PortalManager';
import SetupWizard from './SetupWizard';

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
  const [activeTab, setActiveTab] = useState<'ports' | 'portal'>('ports');
  const [openPortalSettings, setOpenPortalSettings] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
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
  const [worktreePickerState, setWorktreePickerState] = useState<{ item: PortInfo; mode: 'tmux' | 'claude' } | null>(null);
  const [worktreePickerValue, setWorktreePickerValue] = useState('');
  // 머지 확인 모달
  const [mergeConfirm, setMergeConfirm] = useState<{ item: PortInfo; wt: WorktreeInfo; mainBranch: string; commits: string; stat: string; isDirty: boolean } | null>(null);
  const [mergeError, setMergeError] = useState<{ message: string; hasConflict: boolean; folderPath: string } | null>(null);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [deleteWorktreeConfirm, setDeleteWorktreeConfirm] = useState<{ item: PortInfo; wt: WorktreeInfo } | null>(null);
  const [detectedWorktrees, setDetectedWorktrees] = useState<WorktreeInfo[]>([]);
  const [expandedWorktreeIds, setExpandedWorktreeIds] = useState<Set<string>>(new Set());
  const [worktreeLists, setWorktreeLists] = useState<Record<string, WorktreeInfo[]>>({});
  const [worktreeNewBranch, setWorktreeNewBranch] = useState<Record<string, string>>({});
  const [worktreeLoading, setWorktreeLoading] = useState<Record<string, boolean>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAiEnriching, setIsAiEnriching] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isPushingPorts, setIsPushingPorts] = useState(false);
  const [remappingPorts, setRemappingPorts] = useState<PortInfo[]>([]);
  const [remappingPaths, setRemappingPaths] = useState<Record<string, string>>({});
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
  const portalActionsRef = useRef<PortalActions | null>(null);
  const autoPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fix P2g: gate delete pass — only safe to delete remote rows after a successful auto-pull
  // (otherwise local state has only this Mac's rows and would delete other Macs' remote data)
  const autopullSucceeded = useRef(false);

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
          setMergeError({ message: data.error, hasConflict: true, folderPath: item.folderPath! });
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
      showToast(`머지 완료: ${wt.branch} → ${mergeConfirm.mainBranch}`, 'success');
      if (output) console.log('[Merge output]', output);
      await API.gitWorktreeRemove(wt.path);
      showToast(`워크트리 제거됨: ${wt.path.split('/').pop()}`, 'success');
      await loadWorktrees(item.id, item.folderPath!);
      setMergeConfirm(null);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      setMergeConfirm(null);
      setMergeError({ message: msg, hasConflict: msg.includes('충돌') || msg.includes('CONFLICT'), folderPath: item.folderPath! });
    } finally {
      setMergeLoading(false);
    }
  }, [mergeConfirm, loadWorktrees]);

  const openTmuxClaude = (item: PortInfo) => {
    setWorktreePickerState({ item, mode: 'tmux' });
    // Only pre-fill if saved path is absolute — relative names (e.g. '합산') are invalid for -w
    setWorktreePickerValue((item.worktreePath?.startsWith('/') ? item.worktreePath : '') ?? '');
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
    setWorktreePickerValue((item.worktreePath?.startsWith('/') ? item.worktreePath : '') ?? '');
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

    setWorktreePickerState(null);
    setDetectedWorktrees([]);

    let resolvedPath = worktreePath;

    // 브랜치명(상대경로)을 입력한 경우 → git worktree 자동 생성
    if (worktreePath && !worktreePath.startsWith('/') && item.folderPath) {
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
              let portsQuery = supabase.from('ports').select('*');
              if (portalData.deviceId) portsQuery = portsQuery.eq('device_id', portalData.deviceId);
              let { data: remoteData, error } = await withTimeout(portsQuery, 10_000);
              // device_id 필터 결과 없으면 전체 재시도 (마이그레이션 전 호환)
              if (!error && (!remoteData || remoteData.length === 0) && portalData.deviceId) {
                const retry = await withTimeout(supabase.from('ports').select('*'), 10_000);
                if (!retry.error && retry.data && retry.data.length > 0) remoteData = retry.data;
              }
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
      if (ports.length === 0) return; // 빈 배열로 stale-delete 방지
      try {
        const supabase = getSupabaseClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
        const deviceId = cfg.deviceId ?? null;
        const deviceNameVal = cfg.deviceName ?? null;
        const rows = ports.map(p => ({
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
          const localIds = ports.map(p => p.id);
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

      // device_id 필터 결과가 비어있으면(컬럼 없거나 해당 기기 데이터 없음) 전체 재시도
      if (!error && (!data || data.length === 0) && pullDeviceId) {
        const retry = await withTimeout(supabase.from('ports').select('*'), 30_000);
        data = retry.data;
        error = retry.error;
      }

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
        isRunning: false,
      }));

      // 다른 기기 Pull → name 기준 병합 + 새 ID 발급 (ID 충돌 방지)
      // 내 기기 Pull → ID 기준 병합 (기존 동작 유지)
      const merged = isOtherDevice
        ? mergePortsFromOtherDevice(ports, remoteRows)
        : mergePorts(ports, remoteRows);
      setPorts(merged);
      await API.savePorts(merged);

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

      const rows = ports.map(p => ({
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
      }));
      let { error } = await supabase.from('ports').upsert(rows, { onConflict: 'id' });
      if (error?.message?.includes('device_id') || error?.message?.includes('device_name')) {
        // device_id/device_name column not yet migrated — retry without it
        const rowsWithout = rows.map(({ device_id, device_name, ...rest }: any) => rest);
        const { error: e2 } = await supabase.from('ports').upsert(rowsWithout, { onConflict: 'id' });
        error = e2 ?? null;
        if (!e2) showToast('⚠ device_id 컬럼 없음 — 초기설정 가이드의 AI 프롬프트로 마이그레이션 후 재Push 권장', 'error');
      }
      if (error) throw new Error(error.message);
      // Fix P2: delete remote rows whose IDs are no longer in local list
      // Fix P2g: skip delete pass if auto-pull never succeeded — pull first before deleting
      // Step 4: scope stale-delete to this device only to avoid clobbering other devices
      if (autopullSucceeded.current) {
        const localIds = ports.map(p => p.id);
        let remoteQuery = supabase.from('ports').select('id');
        if (deviceId) remoteQuery = remoteQuery.eq('device_id', deviceId);
        const { data: remoteRows } = await remoteQuery;
        const staleIds = (remoteRows ?? []).map((r: any) => r.id).filter((id: string) => !localIds.includes(id));
        if (staleIds.length > 0) {
          await supabase.from('ports').delete().in('id', staleIds);
        }
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
    return sortOrder === 'desc' ? [...filtered].reverse() : filtered;
  }, [ports, searchQuery, filterType, filterCategory, sortBy, sortOrder]);

  const searchFilteredPorts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return q ? ports.filter(p => matchesSearch(p, q)) : ports;
  }, [ports, searchQuery]);

  return (
    <div className="min-h-screen bg-[#0a0a0b] p-8">
      {!isTauri() && apiServerOnline === false && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500/90 text-black text-sm px-4 py-2 flex items-center justify-between">
          <span>⚠️ API 서버가 꺼져 있습니다. <code className="bg-black/10 px-1 rounded">bun run start</code> 로 실행하세요. Supabase는 캐시된 인증 정보로 동작합니다.</span>
          <button onClick={() => { fetch('/api/ports').then(() => setApiServerOnline(true)).catch(() => {}); }} className="ml-4 px-2 py-0.5 bg-black/20 rounded hover:bg-black/30 text-xs">재확인</button>
        </div>
      )}
      {/* 머지 확인 모달 */}
      {deleteWorktreeConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181b] rounded-xl border border-zinc-700 w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-red-500/15 p-2 rounded-lg border border-red-500/30">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">워크트리 삭제</h3>
                <p className="text-zinc-400 text-xs mt-0.5">이 작업은 되돌릴 수 없습니다</p>
              </div>
            </div>
            <div className="bg-zinc-900/60 rounded-lg p-3 border border-zinc-800">
              <p className="text-xs text-zinc-300">
                <span className="text-red-400 font-mono">{deleteWorktreeConfirm.wt.branch ?? deleteWorktreeConfirm.wt.path.split('/').pop()}</span> 워크트리를 삭제하시겠습니까?
              </p>
              <p className="text-xs text-zinc-500 mt-1 font-mono break-all">{deleteWorktreeConfirm.wt.path}</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteWorktreeConfirm(null)}
                className="px-4 py-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg transition-colors"
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
          <div className="bg-[#18181b] rounded-xl border border-zinc-700 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-500/15 p-2 rounded-lg border border-blue-500/30">
                <GitBranch className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">머지 확인</h2>
                <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                  <span className="text-teal-400">{mergeConfirm.wt.branch}</span>
                  <span className="text-zinc-500"> → </span>
                  <span className="text-zinc-300">{mergeConfirm.mainBranch}</span>
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
              <div className="bg-black/40 rounded-lg p-3 border border-zinc-800">
                <p className="text-[10px] text-zinc-500 mb-1.5 font-medium uppercase tracking-wide">머지될 커밋</p>
                <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">{mergeConfirm.commits}</pre>
              </div>
            ) : (
              <p className="text-xs text-zinc-500 italic">커밋 없음 (이미 최신 상태)</p>
            )}
            {mergeConfirm.stat && (
              <div className="bg-black/40 rounded-lg p-3 border border-zinc-800">
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
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
              >
                터미널에서 머지
              </button>
              <button onClick={() => setMergeConfirm(null)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors">
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
          <div className="bg-[#18181b] rounded-xl border border-red-800/50 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-red-500/15 p-2 rounded-lg border border-red-500/30">
                <XIcon className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">머지 실패</h2>
                {mergeError.hasConflict && <p className="text-xs text-red-400 mt-0.5">충돌 발생 — 해결 후 커밋하거나 Abort하세요</p>}
              </div>
            </div>
            <div className="bg-black/40 rounded-lg p-3 border border-red-900/30">
              <pre className="text-xs text-red-300 font-mono whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">{mergeError.message}</pre>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              {mergeError.hasConflict && (
                <button
                  onClick={async () => {
                    try {
                      const baseUrl = isTauri() ? 'http://localhost:3001' : '';
                      await fetch(`${baseUrl}/api/git-merge-abort`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ folderPath: mergeError.folderPath }),
                      });
                      showToast('머지 중단됨 (merge --abort)', 'success');
                      setMergeError(null);
                    } catch (e) { showToast('abort 실패: ' + e, 'error'); }
                  }}
                  className="px-4 py-2 bg-red-500/15 hover:bg-red-500/25 text-red-400 text-sm rounded-lg border border-red-500/30 transition-colors"
                >
                  Abort Merge
                </button>
              )}
              <button onClick={() => setMergeError(null)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 워크트리 경로 피커 모달 */}
      {worktreePickerState && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-[#18181b] rounded-xl border border-zinc-700 p-5 w-[460px] shadow-2xl">
            {/* 헤더: 프로젝트명 + 모드 */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-medium text-violet-400 uppercase tracking-wider">
                  {worktreePickerState.mode === 'tmux' ? 'tmux' : 'Claude'}
                </span>
                <span className="text-zinc-600 text-[10px]">·</span>
                <span className="text-xs font-semibold text-zinc-200 truncate">
                  {worktreePickerState.item.aiName || worktreePickerState.item.name}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500">워크트리를 선택하거나 직접 경로를 입력하세요</p>
            </div>

            {/* 감지된 워크트리 목록 */}
            {detectedWorktrees.length > 0 && (
              <div className="mb-3 border border-zinc-700 rounded-lg overflow-hidden">
                {detectedWorktrees.map((wt) => {
                  const wtBasename = wt.path.replace(/\/$/, '').split('/').pop() ?? wt.path;
                  const displayName = wt.branch || wtBasename;
                  const isSelected = worktreePickerValue === wt.path;
                  return (
                    <button
                      key={wt.path}
                      onClick={() => setWorktreePickerValue(wt.path)}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-zinc-700/50 transition-colors border-b border-zinc-700/50 last:border-0 ${
                        isSelected ? 'bg-violet-600/20' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-semibold ${isSelected ? 'text-violet-300' : wt.is_main ? 'text-zinc-300' : 'text-teal-300'}`}>{displayName}</span>
                          {wt.is_main && <span className="text-[10px] text-zinc-500">(main)</span>}
                        </div>
                        <span className="text-zinc-600 font-mono text-[10px] truncate block">{wtBasename}</span>
                      </div>
                      {wt.branch && wt.branch !== displayName && (
                        <span className="text-zinc-500 ml-2 shrink-0 text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded">{wt.branch}</span>
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
              className="w-full px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-500 mb-3"
            />

            {/* 워크트리 제거 가이드 */}
            <div className="mb-4 px-3 py-2.5 bg-zinc-900/60 rounded-lg border border-zinc-800">
              <p className="text-[10px] text-zinc-500 font-medium mb-1.5">워크트리 제거 방법</p>
              <div className="space-y-1">
                <div className="flex items-start gap-1.5">
                  <span className="text-zinc-600 text-[10px] mt-0.5">·</span>
                  <code className="text-[10px] text-violet-400 font-mono">git worktree remove &lt;path&gt;</code>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-zinc-600 text-[10px] mt-0.5">·</span>
                  <span className="text-[10px] text-zinc-500"><code className="text-zinc-400 font-mono">git worktree prune</code> — 삭제된 폴더 정리</span>
                </div>
              </div>
            </div>

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
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-[#18181b] border border-zinc-800 rounded-xl p-1 w-fit">
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

            {/* 포털 탭 전용 액션 버튼 (글로벌 위치) */}
            {activeTab === 'portal' && (
              <>
                <div className="flex items-center rounded-lg border border-zinc-800 overflow-hidden">
                  <button
                    onClick={() => portalActionsRef.current?.push()}
                    title="Supabase Push"
                    className="px-2.5 py-1.5 bg-[#18181b] hover:bg-zinc-800 text-zinc-300 text-sm border-r border-zinc-800 transition-all flex items-center gap-1"
                  >
                    <CloudUpload className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-xs font-medium">Push</span>
                  </button>
                  <button
                    onClick={() => portalActionsRef.current?.pull()}
                    title="Supabase Pull"
                    className="px-2.5 py-1.5 bg-[#18181b] hover:bg-zinc-800 text-zinc-300 text-sm transition-all flex items-center gap-1"
                  >
                    <CloudDownload className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-xs font-medium">Pull</span>
                  </button>
                </div>
                <button
                  onClick={() => portalActionsRef.current?.exportData()}
                  title="내보내기"
                  className="p-2 bg-[#18181b] hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 rounded-xl border border-zinc-800 hover:border-zinc-600 transition-all"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => portalActionsRef.current?.importData()}
                  title="불러오기"
                  className="p-2 bg-[#18181b] hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 rounded-xl border border-zinc-800 hover:border-zinc-600 transition-all"
                >
                  <Upload className="w-4 h-4" />
                </button>
                <button
                  onClick={() => portalActionsRef.current?.openSettings()}
                  title="Supabase / 단말 설정"
                  className="p-2 bg-[#18181b] hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 rounded-xl border border-zinc-800 hover:border-zinc-600 transition-all"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </>
            )}

            {/* 포트 탭 전용 액션 버튼 (글로벌 위치) */}
            {activeTab === 'ports' && (
              <>
                <button onClick={handleExportPorts} title="내보내기" className="p-2 bg-[#18181b] hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 rounded-xl border border-zinc-800 hover:border-zinc-600 transition-all">
                  <Download className="w-4 h-4" />
                </button>
                <button onClick={handleImportPorts} title="불러오기" className="p-2 bg-[#18181b] hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 rounded-xl border border-zinc-800 hover:border-zinc-600 transition-all">
                  <Upload className="w-4 h-4" />
                </button>
                <button onClick={handleRefresh} disabled={isRefreshing || isAiEnriching} title={isAiEnriching ? 'AI 분석 중…' : '새로고침'} className="p-2 bg-[#18181b] hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 rounded-xl border border-zinc-800 hover:border-zinc-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  <RefreshCw className={`w-4 h-4 ${isRefreshing || isAiEnriching ? 'animate-spin' : ''}`} />
                </button>
                <div className="flex items-center rounded-xl border border-zinc-800 overflow-hidden">
                  <button onClick={handlePushToSupabase} disabled={isPushingPorts} title="Supabase Push" className="px-2.5 py-1.5 bg-[#18181b] hover:bg-zinc-800 text-zinc-300 text-sm border-r border-zinc-800 transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed">
                    <CloudUpload className={`w-3.5 h-3.5 ${isPushingPorts ? 'animate-pulse' : 'text-indigo-400'}`} />
                    <span className="text-xs font-medium">Push</span>
                  </button>
                  <button onClick={handleRestoreFromSupabase} disabled={isRestoring} title="Supabase Pull" className="px-2.5 py-1.5 bg-[#18181b] hover:bg-zinc-800 text-zinc-300 text-sm transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed">
                    <CloudDownload className={`w-3.5 h-3.5 ${isRestoring ? 'animate-pulse' : 'text-indigo-400'}`} />
                    <span className="text-xs font-medium">Pull</span>
                  </button>
                </div>
                <button
                  onClick={() => setOpenPortalSettings(true)}
                  title="Supabase / 단말 설정"
                  className="p-2 bg-[#18181b] hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 rounded-xl border border-zinc-800 hover:border-zinc-600 transition-all"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </>
            )}

            {/* 설정 마법사 버튼 */}
            <button
              onClick={() => setShowSetupWizard(true)}
              title="초기 설정 마법사"
              className="px-2.5 py-1.5 bg-[#18181b] hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 text-xs rounded-xl border border-zinc-800 hover:border-zinc-600 transition-all flex items-center gap-1"
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>세팅</span>
            </button>
          </div>
        </div>

        {/* 포털 탭 — 항상 마운트, isVisible로 UI 표시 제어 (설정 모달은 탭 무관하게 동작) */}
        <PortalManager
          showToast={showToast}
          openSettings={openPortalSettings}
          onSettingsClosed={() => setOpenPortalSettings(false)}
          actionsRef={portalActionsRef}
          isVisible={activeTab === 'portal'}
        />

        {/* 경로 remapping 모달 — 다른 기기 Pull 후 경로 없는 포트 설정 */}
        {remappingPorts.length > 0 && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-6">
            <div className="bg-[#0a0a0b] border border-zinc-700/80 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800 shrink-0">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-amber-400" />
                  경로 설정 필요 — {remappingPorts.length}개 프로젝트
                </h2>
                <p className="text-xs text-zinc-500 mt-1">다른 기기에서 가져온 프로젝트에 이 기기의 폴더 경로를 설정하세요. 나중에 개별 설정도 가능합니다.</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {remappingPorts.map(p => (
                  <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
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
                        className="flex-1 px-3 py-1.5 text-xs bg-black/40 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                      />
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/pick-folder');
                            const { path } = await res.json();
                            if (path) setRemappingPaths(prev => ({ ...prev, [p.id]: path }));
                          } catch {}
                        }}
                        className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs rounded-lg border border-zinc-700 transition-all"
                        title="폴더 선택"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-zinc-800 px-5 py-4 flex justify-between shrink-0">
                <button
                  onClick={() => setRemappingPorts([])}
                  className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
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
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <button
                onClick={handleCopyAiNamePrompt}
                title="Claude Code에 붙여넣을 AI이름 생성 프롬프트를 클립보드에 복사합니다"
                className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-sm rounded-lg border border-emerald-500/30 hover:border-emerald-500/50 transition-all flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">AI이름 프롬프트</span>
              </button>
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
              <input
                type="text"
                placeholder="워크트리 경로 (선택사항) — 입력 시 포트 자동 배정 (메인포트×10+n)"
                value={worktreePath}
                onChange={(e) => {
                  setWorktreePath(e.target.value);
                  // 워크트리 경로 입력 시 포트가 비어있으면 메인포트 기반 자동 배정
                  if (!port && e.target.value.trim()) {
                    const mainPort = folderPath
                      ? ports.find(p => p.folderPath === folderPath)?.port
                      : undefined;
                    setPort(getNextWorktreePort(ports, mainPort).toString());
                  }
                }}
                onKeyPress={handleKeyPress}
                className="w-full px-3 py-2 text-sm bg-black/30 border border-amber-700/50 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="카테고리 (AI 자동)"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="flex-1 px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
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
                  const searchFiltered = searchFilteredPorts;
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
                    {searchQuery.trim() ? `${searchFilteredPorts.length}/${ports.length}` : ports.length}
                  </span>
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing || isAiEnriching}
                    className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-md transition-all disabled:opacity-40"
                    title={isAiEnriching ? 'AI 분석 중…' : '새로고침 (실행파일 자동 감지)'}
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
                        <input
                          type="text"
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          onKeyDown={handleEditKeyPress}
                          placeholder="카테고리 (AI 자동)"
                          className="flex-1 px-3 py-2 text-sm bg-black/30 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                        />
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
                    <div className="flex flex-col gap-2">
                      {/* 정보 행 */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-medium text-white whitespace-nowrap">
                          {item.name}
                        </h3>
                        {/* 폴더 이름 (name과 다를 때만) */}
                        {item.folderPath && (() => {
                          const parts = item.folderPath.replace(/\/$/, '').split('/');
                          const basename = parts[parts.length - 1];
                          return basename && basename !== item.name ? (
                            <span className="text-[11px] text-zinc-500 font-mono whitespace-nowrap" title={item.folderPath}>
                              {basename}
                            </span>
                          ) : null;
                        })()}
                        {/* 워크트리 뱃지 */}
                        {item.worktreePath && (
                          <span
                            className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] font-medium rounded border border-amber-500/30 whitespace-nowrap"
                            title={`Worktree: ${item.worktreePath}`}
                          >
                            WT: {item.worktreePath.replace(/\/$/, '').split('/').pop()}
                          </span>
                        )}
                        {item.aiName && (
                          <span
                            className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-300 text-[10px] font-medium rounded border border-emerald-500/30 whitespace-nowrap"
                            title="AI 추천 이름 (검색용 별칭)"
                          >
                            {item.aiName}
                          </span>
                        )}
                        {item.category && (
                          <span className="px-1.5 py-0.5 bg-violet-500/15 text-violet-400 text-[10px] font-medium rounded border border-violet-500/30 whitespace-nowrap">
                            {item.category}
                          </span>
                        )}
                        <div className="flex items-center gap-1">
                          <Server className="w-3 h-3 text-zinc-600" />
                          {item.port ? (
                            <span className="font-mono text-xs text-zinc-400">
                              Port: <span className="text-zinc-200 font-semibold">{item.port}</span>
                            </span>
                          ) : (
                            <span className="font-mono text-xs text-zinc-600">No port</span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-[11px] text-zinc-500 truncate max-w-sm">{item.description}</p>
                        )}
                      </div>
                      {/* 버튼 행 */}
                      <div className="flex items-center gap-1.5 flex-wrap">
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
                            onClick={async () => {
                              try {
                                const wt = item.worktreePath?.split(',')[0]?.trim();
                                const target = (wt && wt.startsWith('/')) ? wt : item.folderPath!;
                                await API.openFolder(target);
                                showToast('폴더를 열었습니다', 'success');
                              } catch (e) {
                                showToast('폴더 열기 실패: ' + e, 'error');
                              }
                            }}
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
                        {item.folderPath && (
                          <button
                            onClick={async () => {
                              try {
                                const baseUrl = isTauri() ? 'http://localhost:3001' : '';
                                await fetch(`${baseUrl}/api/open-terminal-git-push`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ folderPath: item.folderPath, name: item.name, githubUrl: item.githubUrl, worktreePath: item.worktreePath })
                                });
                                showToast('터미널에서 git push 실행 중', 'success');
                              } catch (error) {
                                showToast('터미널 열기 실패: ' + error, 'error');
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-medium rounded-lg border border-blue-500/30 hover:border-blue-500/50 transition-all duration-200"
                            title={item.githubUrl ? `git push → ${item.githubUrl}` : `git push (원격 그대로)`}
                          >
                            <Terminal className="w-3 h-3" />
                            <span>터미널푸시</span>
                          </button>
                        )}
                        {item.folderPath && (
                          <button
                            onClick={async () => {
                              try {
                                const baseUrl = isTauri() ? 'http://localhost:3001' : '';
                                await fetch(`${baseUrl}/api/open-terminal-git-pull`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ folderPath: item.folderPath, name: item.name, githubUrl: item.githubUrl, worktreePath: item.worktreePath })
                                });
                                showToast('터미널에서 git pull 실행 중', 'success');
                              } catch (error) {
                                showToast('터미널 열기 실패: ' + error, 'error');
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium rounded-lg border border-emerald-500/30 hover:border-emerald-500/50 transition-all duration-200"
                            title={item.githubUrl ? `git pull ← ${item.githubUrl}` : `git pull (원격 그대로)`}
                          >
                            <Terminal className="w-3 h-3" />
                            <span>터미널풀</span>
                          </button>
                        )}
                        {item.folderPath && (
                          <button
                            onClick={() => {
                              const prompt = `cd "${item.folderPath}" && git push`;
                              navigator.clipboard.writeText(prompt);
                              showToast('푸시 프롬프트 복사됨', 'success');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 text-xs font-medium rounded-lg border border-zinc-700/50 hover:border-zinc-600/50 transition-all duration-200"
                            title={`cd "${item.folderPath}" && git push`}
                          >
                            <Copy className="w-3 h-3" />
                            <span>푸시복사</span>
                          </button>
                        )}
                        {item.folderPath && (
                          <button
                            onClick={() => {
                              const prompt = `cd "${item.folderPath}" && git pull`;
                              navigator.clipboard.writeText(prompt);
                              showToast('풀 프롬프트 복사됨', 'success');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 text-xs font-medium rounded-lg border border-zinc-700/50 hover:border-zinc-600/50 transition-all duration-200"
                            title={`cd "${item.folderPath}" && git pull`}
                          >
                            <Copy className="w-3 h-3" />
                            <span>풀복사</span>
                          </button>
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
                        {/* Worktree 패널 토글 버튼 */}
                        {item.folderPath && (
                          <button
                            onClick={() => toggleWorktreePanel(item.id, item.folderPath)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 ${
                              expandedWorktreeIds.has(item.id)
                                ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                                : 'bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 border-zinc-700/50 hover:border-zinc-600/50'
                            }`}
                            title="Git Worktrees 보기/관리"
                          >
                            <GitBranch className="w-3 h-3" />
                            <span>Worktree</span>
                          </button>
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
                  {/* Worktree 패널 */}
                  {expandedWorktreeIds.has(item.id) && item.folderPath && (
                    <div className="mt-2 p-3 bg-zinc-900/60 rounded-lg border border-zinc-700/50">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                          <GitBranch className="w-3 h-3 text-teal-400" />
                          Git Worktrees
                        </h4>
                        <button
                          onClick={() => loadWorktrees(item.id, item.folderPath!)}
                          className="p-1 hover:bg-zinc-800 rounded transition-colors"
                          title="새로고침"
                        >
                          <RefreshCw className="w-3 h-3 text-zinc-500 hover:text-zinc-300" />
                        </button>
                      </div>
                      {worktreeLoading[item.id] ? (
                        <p className="text-xs text-zinc-500">로딩 중...</p>
                      ) : (worktreeLists[item.id] ?? []).length === 0 ? (
                        <p className="text-xs text-zinc-500">워크트리 없음</p>
                      ) : (
                        <div className="space-y-1.5 mb-2">
                          {(worktreeLists[item.id] ?? []).map((wt, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-2 px-2 py-1 bg-zinc-800/50 rounded text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`font-mono truncate ${wt.is_main ? 'text-zinc-300' : 'text-teal-300'}`}>
                                  {wt.branch || wt.path.split('/').pop()}
                                </span>
                                {wt.is_main && <span className="text-[10px] text-zinc-500 shrink-0">(main)</span>}
                              </div>
                              {!wt.is_main && (() => {
                                // 이 워크트리에 대응하는 PortInfo 탐색 (main item 제외, worktreePath 매칭)
                                const wtPort = ports.find(p => p.id !== item.id && p.worktreePath === wt.path);
                                // 전용 PortInfo 없어도 main 포트 기반으로 포트 추론 (단, *10 결과가 65535 초과 시 undefined)
                                const nonMainWorktrees = (worktreeLists[item.id] ?? []).filter(w => !w.is_main);
                                const wtIndex = nonMainWorktrees.findIndex(w => w.path === wt.path);
                                const rawInferred = item.port ? item.port * 10 + (wtIndex + 1) : undefined;
                                const inferredPort = rawInferred && rawInferred <= 65535
                                  ? rawInferred
                                  : wtIndex >= 0 ? getNextWorktreePort(ports, item.port) + wtIndex : undefined;
                                const effectivePort = wtPort?.port ?? inferredPort;
                                return (
                                  <div className="flex items-center gap-1 shrink-0 flex-wrap">
                                    {/* 실행: 전용 PortInfo있으면 executeCommand, 없으면 PORT=N 터미널 */}
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        if (wtPort && (wtPort.commandPath || wtPort.terminalCommand)) {
                                          executeCommand(wtPort);
                                          showToast(`실행: ${wt.branch} (포트 ${effectivePort})`, 'success');
                                        } else {
                                          try {
                                            const baseUrl = isTauri() ? 'http://localhost:3001' : '';
                                            await fetch(`${baseUrl}/api/open-terminal-worktree-run`, {
                                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ worktreePath: wt.path, name: item.name, terminalCommand: item.terminalCommand, port: effectivePort })
                                            });
                                            showToast(`터미널 열기: ${wt.branch} (포트 ${effectivePort ?? '?'})`, 'success');
                                          } catch (err) { showToast('실행 실패: ' + err, 'error'); }
                                        }
                                      }}
                                      className="px-1.5 py-0.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-[10px] rounded border border-green-500/20"
                                      title={`dev server 실행 (포트 ${effectivePort ?? '?'})`}
                                    >
                                      실행{effectivePort ? `(${effectivePort})` : ''}
                                    </button>
                                    {/* 열기: effectivePort 기반 브라우저 열기 (서버 실행 확인 후) */}
                                    {effectivePort && (
                                      <button
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          const targetUrl = `http://localhost:${effectivePort}`;
                                          try {
                                            const isRunning = await API.checkPortStatus(effectivePort);
                                            if (!isRunning) {
                                              showToast(`포트 ${effectivePort}에 서버가 실행중이지 않습니다. 먼저 실행해주세요.`, 'error');
                                              return;
                                            }
                                            if (isTauri()) {
                                              await API.openInChrome(targetUrl);
                                            } else {
                                              const r = await fetch('/api/open-in-chrome', {
                                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ url: targetUrl })
                                              });
                                              if (!r.ok) throw new Error((await r.json()).error);
                                            }
                                          } catch (err) {
                                            showToast(`열기 실패: ${err}`, 'error');
                                          }
                                        }}
                                        className="px-1.5 py-0.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-[10px] rounded border border-purple-500/20"
                                        title={`http://localhost:${effectivePort} 열기`}
                                      >
                                        열기
                                      </button>
                                    )}
                                    {/* 커밋: wt.path에서 git add -A && commit */}
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          const baseUrl = isTauri() ? 'http://localhost:3001' : '';
                                          await fetch(`${baseUrl}/api/open-terminal-git-commit`, {
                                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ worktreePath: wt.path, folderPath: item.folderPath, name: item.name })
                                          });
                                          showToast(`커밋: ${wt.branch}`, 'success');
                                        } catch (err) { showToast('커밋 실패: ' + err, 'error'); }
                                      }}
                                      className="px-1.5 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[10px] rounded border border-amber-500/20"
                                      title={`git add -A && commit (${wt.path})`}
                                    >
                                      커밋
                                    </button>
                                    {/* 푸시: wt.path에서 feature branch push */}
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          const baseUrl = isTauri() ? 'http://localhost:3001' : '';
                                          await fetch(`${baseUrl}/api/open-terminal-git-push`, {
                                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ folderPath: wt.path, name: `${item.name}(${wt.branch})`, githubUrl: item.githubUrl })
                                          });
                                          showToast(`푸시: ${wt.branch}`, 'success');
                                        } catch (err) { showToast('푸시 실패: ' + err, 'error'); }
                                      }}
                                      className="px-1.5 py-0.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[10px] rounded border border-blue-500/20"
                                      title={`git push: ${wt.branch} → remote`}
                                    >
                                      푸시
                                    </button>
                                    {/* 머지: wt.branch → main (confirm modal) */}
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleWorktreeMerge(item, wt); }}
                                      className="px-1.5 py-0.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 text-[10px] rounded border border-teal-500/20"
                                      title={`${wt.branch} → main 머지`}
                                    >
                                      머지
                                    </button>
                                    {/* 삭제: worktree 제거 */}
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleWorktreeRemove(item, wt); }}
                                      className="px-1.5 py-0.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] rounded border border-red-500/20"
                                      title="워크트리 삭제"
                                    >
                                      삭제
                                    </button>
                                  </div>
                                );
                              })()}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 mt-2">
                        <input
                          type="text"
                          value={worktreeNewBranch[item.id] ?? ''}
                          onChange={e => setWorktreeNewBranch(prev => ({ ...prev, [item.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && handleWorktreeAdd(item)}
                          placeholder="새 브랜치명..."
                          className="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-teal-500/50"
                        />
                        <button
                          onClick={() => handleWorktreeAdd(item)}
                          disabled={!worktreeNewBranch[item.id]?.trim()}
                          className="px-2 py-1 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 text-xs rounded border border-teal-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          + Add
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
