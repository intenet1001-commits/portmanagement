# Worktree Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible worktree panel to each port card that shows live worktrees, supports create/merge/remove, and integrates cleanly with existing git push/pull flow.

**Architecture:** Each port card gets a toggleable "워크트리" section that dynamically lists `git worktree list` results. Three new API endpoints (add/remove/merge) are added to api-server.ts and mirrored as Tauri Rust commands. Existing `터미널푸시`/`터미널풀` buttons continue using `item.worktreePath` (stored default) unchanged — worktree panel rows pass their own explicit path independently.

**Tech Stack:** React (inline component), Bun api-server.ts, Tauri Rust (lib.rs), existing `WorktreeInfo` type, existing `escapeSq()` / `GIT_PATH` helpers.

---

## File Map

| File | Change |
|---|---|
| `api-server.ts` | Add 3 endpoints: `git-worktree-add`, `git-worktree-remove`, `git-merge-branch` |
| `src-tauri/src/lib.rs` | Add 3 Tauri commands: `git_worktree_add`, `git_worktree_remove`, `git_merge_branch` + register |
| `src/App.tsx` | Add API methods, state, `WorktreePanel` component, toggle button per card |

---

## Task 1: API endpoints in api-server.ts

**Files:**
- Modify: `api-server.ts` (after `/api/list-git-worktrees` block, ~line 1447)

### Context: existing patterns
```typescript
// GIT_PATH and escapeSq() are already defined at top of api-server.ts
// Bun.spawn([GIT_PATH, ...args], { cwd: folderPath, stdout: "pipe", stderr: "pipe" })
// await proc.exited; const text = await new Response(proc.stdout).text();
```

- [ ] **Step 1: Add `/api/git-worktree-add` endpoint**

Insert after the `list-git-worktrees` block:

```typescript
    if (url.pathname === "/api/git-worktree-add" && req.method === "POST") {
      try {
        const { folderPath, branchName, worktreePath } = await req.json();
        if (!folderPath || !branchName) {
          return new Response(JSON.stringify({ error: "folderPath and branchName required" }), { status: 400, headers });
        }
        // worktreePath = explicit path, else sibling folder named after branch
        const targetPath = worktreePath || (() => {
          const parts = (folderPath as string).replace(/\/$/, '').split('/');
          parts[parts.length - 1] = parts[parts.length - 1] + '-' + (branchName as string).replace(/\//g, '-');
          return parts.join('/');
        })();
        const proc = Bun.spawn([GIT_PATH, "worktree", "add", targetPath, branchName], {
          cwd: folderPath, stdout: "pipe", stderr: "pipe",
        });
        await proc.exited;
        const stderr = await new Response(proc.stderr).text();
        if (proc.exitCode !== 0) {
          return new Response(JSON.stringify({ error: stderr.trim() || "git worktree add failed" }), { status: 500, headers });
        }
        return new Response(JSON.stringify({ success: true, path: targetPath }), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }
```

- [ ] **Step 2: Add `/api/git-worktree-remove` endpoint**

```typescript
    if (url.pathname === "/api/git-worktree-remove" && req.method === "POST") {
      try {
        const { worktreePath } = await req.json();
        if (!worktreePath) {
          return new Response(JSON.stringify({ error: "worktreePath required" }), { status: 400, headers });
        }
        const proc = Bun.spawn([GIT_PATH, "worktree", "remove", "--force", worktreePath], {
          cwd: worktreePath, stdout: "pipe", stderr: "pipe",
        });
        await proc.exited;
        const stderr = await new Response(proc.stderr).text();
        if (proc.exitCode !== 0) {
          return new Response(JSON.stringify({ error: stderr.trim() || "git worktree remove failed" }), { status: 500, headers });
        }
        return new Response(JSON.stringify({ success: true }), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }
```

- [ ] **Step 3: Add `/api/git-merge-branch` endpoint**

```typescript
    if (url.pathname === "/api/git-merge-branch" && req.method === "POST") {
      try {
        const { folderPath, branchName } = await req.json();
        if (!folderPath || !branchName) {
          return new Response(JSON.stringify({ error: "folderPath and branchName required" }), { status: 400, headers });
        }
        const proc = Bun.spawn([GIT_PATH, "merge", "--no-ff", branchName], {
          cwd: folderPath, stdout: "pipe", stderr: "pipe",
        });
        await proc.exited;
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        if (proc.exitCode !== 0) {
          return new Response(JSON.stringify({ error: stderr.trim() || stdout.trim() || "git merge failed" }), { status: 500, headers });
        }
        return new Response(JSON.stringify({ success: true, output: stdout.trim() }), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }
```

- [ ] **Step 4: Test endpoints via curl**

```bash
# Start api-server if not running: bun api-server.ts
# Test add (use a real project with git):
curl -s -X POST http://localhost:3001/api/git-worktree-add \
  -H "Content-Type: application/json" \
  -d '{"folderPath":"/Users/gwanli/Documents/GitHub/myproduct_v4/portmanagement","branchName":"test-branch"}' | python3 -m json.tool
# Expected: {"error":"..."} (branch likely doesn't exist — that's fine for API shape test)

# Test remove with nonexistent path:
curl -s -X POST http://localhost:3001/api/git-worktree-remove \
  -H "Content-Type: application/json" \
  -d '{"worktreePath":"/nonexistent"}' | python3 -m json.tool
# Expected: {"error": "..."}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/gwanli/Documents/GitHub/myproduct_v4/portmanagement
git add api-server.ts
git commit -m "feat: add git worktree add/remove/merge API endpoints"
```

---

## Task 2: Tauri Rust commands in lib.rs

**Files:**
- Modify: `src-tauri/src/lib.rs` (add before `fn list_git_worktrees`, register in `tauri::Builder`)

- [ ] **Step 1: Add `git_worktree_add` command**

Insert before `fn list_git_worktrees`:

```rust
#[tauri::command]
fn git_worktree_add(folder_path: String, branch_name: String, worktree_path: Option<String>) -> Result<String, String> {
    let target = worktree_path.unwrap_or_else(|| {
        let base = folder_path.trim_end_matches('/');
        let safe_branch = branch_name.replace('/', "-");
        format!("{}-{}", base, safe_branch)
    });
    let output = Command::new("git")
        .args(["worktree", "add", &target, &branch_name])
        .current_dir(&folder_path)
        .output()
        .map_err(|e| format!("git not found: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(target)
}

#[tauri::command]
fn git_worktree_remove(worktree_path: String) -> Result<(), String> {
    let output = Command::new("git")
        .args(["worktree", "remove", "--force", &worktree_path])
        .output()
        .map_err(|e| format!("git not found: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(())
}

#[tauri::command]
fn git_merge_branch(folder_path: String, branch_name: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["merge", "--no-ff", &branch_name])
        .current_dir(&folder_path)
        .output()
        .map_err(|e| format!("git not found: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(stderr);
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
```

- [ ] **Step 2: Register commands in tauri::Builder**

Find the `.invoke_handler(tauri::generate_handler![` block and add:

```rust
        git_worktree_add,
        git_worktree_remove,
        git_merge_branch,
```

- [ ] **Step 3: Verify Rust compiles**

```bash
cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5
# Expected: Finished `dev` profile
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add git worktree Tauri commands (add/remove/merge)"
```

---

## Task 3: API object methods in App.tsx

**Files:**
- Modify: `src/App.tsx` (in the `const API = { ... }` object, after `listGitWorktrees`)

- [ ] **Step 1: Add three new methods to API object**

After `listGitWorktrees` method (~line 221):

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add gitWorktreeAdd/Remove/MergeBranch to API object"
```

---

## Task 4: State + handlers in App.tsx

**Files:**
- Modify: `src/App.tsx` (in the main component state area and handler functions)

- [ ] **Step 1: Add state**

After `const [worktreePickerValue, setWorktreePickerValue]` (~line 699):

```typescript
  const [expandedWorktreeIds, setExpandedWorktreeIds] = useState<Set<string>>(new Set());
  const [worktreeLists, setWorktreeLists] = useState<Record<string, WorktreeInfo[]>>({});
  const [worktreeNewBranch, setWorktreeNewBranch] = useState<Record<string, string>>({}); // portId → branch input
  const [worktreeLoading, setWorktreeLoading] = useState<Record<string, boolean>>({}); // portId → loading
```

- [ ] **Step 2: Add `loadWorktrees` handler**

After state declarations:

```typescript
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
```

- [ ] **Step 3: Add `toggleWorktreePanel` handler**

```typescript
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
```

- [ ] **Step 4: Add `handleWorktreeAdd` handler**

```typescript
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
```

- [ ] **Step 5: Add `handleWorktreeRemove` handler**

```typescript
  const handleWorktreeRemove = useCallback(async (item: PortInfo, wt: WorktreeInfo) => {
    if (!item.folderPath) return;
    const name = wt.path.split('/').pop();
    try {
      await API.gitWorktreeRemove(wt.path);
      showToast(`워크트리 제거됨: ${name}`, 'success');
      await loadWorktrees(item.id, item.folderPath);
    } catch (e) {
      showToast(`워크트리 제거 실패: ${e}`, 'error');
    }
  }, [loadWorktrees]);
```

- [ ] **Step 6: Add `handleWorktreeMerge` handler**

```typescript
  // mergeAndRemove: merge branch into main folder, then remove worktree
  const handleWorktreeMerge = useCallback(async (item: PortInfo, wt: WorktreeInfo) => {
    if (!item.folderPath || !wt.branch) return;
    const name = wt.path.split('/').pop();
    try {
      const output = await API.gitMergeBranch(item.folderPath, wt.branch);
      showToast(`머지 완료: ${wt.branch} → main`, 'success');
      if (output) console.log('[Merge output]', output);
      // After merge, remove the worktree
      await API.gitWorktreeRemove(wt.path);
      showToast(`워크트리 제거됨: ${name}`, 'success');
      await loadWorktrees(item.id, item.folderPath);
    } catch (e) {
      showToast(`머지 실패: ${e}`, 'error');
    }
  }, [loadWorktrees]);
```

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add worktree panel state and action handlers"
```

---

## Task 5: WorktreePanel UI component in App.tsx

**Files:**
- Modify: `src/App.tsx` — add `WorktreePanel` inline component just before the main `return` statement of the App component.

- [ ] **Step 1: Add WorktreePanel component**

Insert before `return (` in the App component:

```tsx
  // ── WorktreePanel: rendered per card ──
  const renderWorktreePanel = (item: PortInfo) => {
    if (!item.folderPath) return null;
    const worktrees = worktreeLists[item.id] ?? [];
    const isLoading = worktreeLoading[item.id];
    const newBranch = worktreeNewBranch[item.id] ?? '';
    const baseUrl = isTauri() ? 'http://localhost:3001' : '';

    // Determine "main" worktree (first in list = current folderPath)
    const mainWt = worktrees.find(wt => wt.path === item.folderPath || wt.is_main);

    return (
      <div className="mt-2 border-t border-zinc-800 pt-2">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">워크트리</span>
          <button
            onClick={() => loadWorktrees(item.id, item.folderPath!)}
            className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
            title="목록 새로고침"
          >↺</button>
        </div>

        {isLoading && (
          <p className="text-[10px] text-zinc-600 mb-2">로딩 중...</p>
        )}

        {/* Worktree list */}
        {worktrees.length === 0 && !isLoading && (
          <p className="text-[10px] text-zinc-600 mb-2">워크트리 없음</p>
        )}

        <div className="space-y-1 mb-2">
          {worktrees.map((wt) => {
            const wtName = wt.path.replace(/\/$/, '').split('/').pop() ?? wt.path;
            const isMain = wt.path === item.folderPath || wt.is_main;
            return (
              <div key={wt.path} className="flex items-center gap-1.5 px-2 py-1.5 bg-zinc-900/60 rounded-lg border border-zinc-800 group">
                {/* Name + branch */}
                <div className="flex-1 min-w-0">
                  <span className={`text-[11px] font-medium truncate ${isMain ? 'text-zinc-300' : 'text-violet-300'}`}>
                    {isMain ? '(main)' : wtName}
                  </span>
                  {wt.branch && (
                    <span className="text-[10px] text-zinc-600 ml-1.5 font-mono">{wt.branch}</span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* 폴더 열기 */}
                  <button
                    onClick={async () => {
                      try { await API.openFolder(wt.path); showToast('폴더 열림', 'success'); }
                      catch (e) { showToast('폴더 열기 실패: ' + e, 'error'); }
                    }}
                    title="Finder에서 열기"
                    className="px-1.5 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                  >폴더</button>

                  {/* tmux */}
                  <button
                    onClick={() => {
                      setWorktreePickerState({ item, mode: 'tmux' });
                      setWorktreePickerValue(wt.path);
                      setDetectedWorktrees(worktrees);
                    }}
                    title="tmux + Claude"
                    className="px-1.5 py-0.5 text-[10px] text-violet-400 hover:text-violet-300 bg-violet-900/20 hover:bg-violet-900/40 rounded transition-colors"
                  >tmux</button>

                  {/* git push (this worktree) */}
                  <button
                    onClick={async () => {
                      try {
                        await fetch(`${baseUrl}/api/open-terminal-git-push`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ folderPath: wt.path, name: item.name, githubUrl: item.githubUrl, worktreePath: wt.path }),
                        });
                        showToast(`git push (${wtName})`, 'success');
                      } catch (e) { showToast('push 실패: ' + e, 'error'); }
                    }}
                    title={`git push from ${wtName}`}
                    className="px-1.5 py-0.5 text-[10px] text-blue-400 hover:text-blue-300 bg-blue-900/20 hover:bg-blue-900/40 rounded transition-colors"
                  >↑push</button>

                  {/* git pull (this worktree) */}
                  <button
                    onClick={async () => {
                      try {
                        await fetch(`${baseUrl}/api/open-terminal-git-pull`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ folderPath: wt.path, name: item.name, githubUrl: item.githubUrl, worktreePath: wt.path }),
                        });
                        showToast(`git pull (${wtName})`, 'success');
                      } catch (e) { showToast('pull 실패: ' + e, 'error'); }
                    }}
                    title={`git pull to ${wtName}`}
                    className="px-1.5 py-0.5 text-[10px] text-emerald-400 hover:text-emerald-300 bg-emerald-900/20 hover:bg-emerald-900/40 rounded transition-colors"
                  >↓pull</button>

                  {/* Merge & Remove (only for non-main worktrees) */}
                  {!isMain && wt.branch && (
                    <button
                      onClick={() => {
                        if (confirm(`'${wt.branch}' 를 main에 머지하고 워크트리를 제거합니다?`)) {
                          handleWorktreeMerge(item, wt);
                        }
                      }}
                      title={`git merge ${wt.branch} → main, then remove worktree`}
                      className="px-1.5 py-0.5 text-[10px] text-amber-400 hover:text-amber-300 bg-amber-900/20 hover:bg-amber-900/40 rounded transition-colors"
                    >머지&제거</button>
                  )}

                  {/* Remove only (no merge) */}
                  {!isMain && (
                    <button
                      onClick={() => {
                        if (confirm(`'${wtName}' 워크트리를 제거합니다?\n(머지 없이 제거)`)) {
                          handleWorktreeRemove(item, wt);
                        }
                      }}
                      title="워크트리만 제거 (머지 없음)"
                      className="px-1.5 py-0.5 text-[10px] text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/40 rounded transition-colors"
                    >제거</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Create new worktree */}
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={newBranch}
            onChange={e => setWorktreeNewBranch(prev => ({ ...prev, [item.id]: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') handleWorktreeAdd(item); }}
            placeholder="브랜치명 (예: feature/합산)"
            className="flex-1 px-2 py-1 text-[11px] bg-black/30 border border-zinc-700 text-white placeholder-zinc-600 rounded focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
          <button
            onClick={() => handleWorktreeAdd(item)}
            disabled={!newBranch.trim()}
            className={`px-2 py-1 text-[11px] rounded transition-colors ${newBranch.trim() ? 'bg-violet-600 hover:bg-violet-500 text-white' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'}`}
          >+ 생성</button>
        </div>
      </div>
    );
  };
```

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add WorktreePanel render function"
```

---

## Task 6: Wire toggle button + panel into each card

**Files:**
- Modify: `src/App.tsx` — in the card action buttons area where `item.folderPath` buttons are

**Context:** The 폴더 button is at ~line 3288. We add a "워크트리" toggle button nearby and render the panel below the existing action row.

- [ ] **Step 1: Add toggle button after 폴더 button**

Find the `폴더` button block (the one with `onClick={async () => { const wt = item.worktreePath...`). After its closing `</button>` tag, add:

```tsx
                        {item.folderPath && (
                          <button
                            onClick={() => toggleWorktreePanel(item.id, item.folderPath)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 ${
                              expandedWorktreeIds.has(item.id)
                                ? 'bg-violet-600/20 text-violet-300 border-violet-500/40'
                                : 'bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 border-zinc-700/50 hover:border-zinc-600/50'
                            }`}
                            title="워크트리 패널 열기/닫기"
                          >
                            <GitBranch className="w-3 h-3" />
                            <span>워크트리{worktreeLists[item.id]?.length > 1 ? ` (${worktreeLists[item.id].length})` : ''}</span>
                          </button>
                        )}
```

- [ ] **Step 2: Add GitBranch to lucide-react imports**

Find the lucide-react import line at the top and add `GitBranch`:

```tsx
import { ..., GitBranch } from 'lucide-react';
```

- [ ] **Step 3: Render panel below action row**

Find the closing `</div>` of the card's action buttons row. After it, add:

```tsx
                      {/* Worktree panel */}
                      {expandedWorktreeIds.has(item.id) && renderWorktreePanel(item)}
```

The exact insertion point: look for the end of the buttons section (after all the push/pull copy buttons), still inside the card's content div.

- [ ] **Step 4: Verify hot-reload shows toggle button**

Start dev server: `bun run dev` and check that:
- A "워크트리" button appears in each card with `folderPath`
- Clicking opens a panel with worktree list
- Panel shows loading state then list

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire worktree toggle button and panel into port cards"
```

---

## Task 7: Fix api-server.ts worktree cmds to require absolute paths

**Files:**
- Modify: `api-server.ts` (git-worktree-add and terminal-git-push/pull handlers)

**Context:** Existing `open-terminal-git-push` and `open-terminal-git-pull` already accept `worktreePath` and use it as `workDir`. The WorktreePanel passes `wt.path` (always absolute from `git worktree list`). No changes needed to push/pull handlers — they already work correctly.

However, git-worktree-add needs to handle the case where the branch doesn't exist yet (create it):

- [ ] **Step 1: Update git-worktree-add to support new branch creation**

Replace the `Bun.spawn` line in git-worktree-add:

```typescript
        // Try to add with existing branch first; if fails, create new branch
        let proc = Bun.spawn([GIT_PATH, "worktree", "add", targetPath, branchName], {
          cwd: folderPath, stdout: "pipe", stderr: "pipe",
        });
        await proc.exited;
        if (proc.exitCode !== 0) {
          // Branch doesn't exist — create it
          proc = Bun.spawn([GIT_PATH, "worktree", "add", "-b", branchName, targetPath], {
            cwd: folderPath, stdout: "pipe", stderr: "pipe",
          });
          await proc.exited;
        }
```

- [ ] **Step 2: Test create worktree with new branch**

```bash
# In a real git repo:
curl -s -X POST http://localhost:3001/api/git-worktree-add \
  -H "Content-Type: application/json" \
  -d "{\"folderPath\":\"/Users/gwanli/Documents/GitHub/myproduct_v4/portmanagement\",\"branchName\":\"test-wt-$(date +%s)\"}" | python3 -m json.tool
# Expected: {"success":true,"path":"/Users/gwanli/.../portmanagement-test-wt-..."}

# Cleanup:
curl -s -X POST http://localhost:3001/api/git-worktree-remove \
  -H "Content-Type: application/json" \
  -d "{\"worktreePath\":\"<path from above>\"}" | python3 -m json.tool
```

- [ ] **Step 3: Commit**

```bash
git add api-server.ts
git commit -m "fix: git-worktree-add falls back to -b (create branch) when branch missing"
```

---

## Task 8: Playwright integration test

**Files:**
- Write: `/tmp/playwright-test-worktree-panel.js`

- [ ] **Step 1: Write test**

```javascript
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://localhost:9000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Find first card with folderPath (has 워크트리 toggle button)
  const toggleBtn = page.locator('button:has(span:text-is("워크트리"))').first();
  const count = await toggleBtn.count();
  console.log(`워크트리 toggle buttons: ${count}`);
  if (count === 0) { console.log('❌ No toggle buttons — check GitBranch import and button wiring'); await browser.close(); return; }

  // Toggle open
  await toggleBtn.click();
  await page.waitForTimeout(1500);

  // Check panel appeared
  const panel = page.locator('text=브랜치명').first();
  if (await panel.isVisible()) {
    console.log('✅ WorktreePanel rendered (create input visible)');
  } else {
    console.log('❌ Panel not visible');
  }

  // Check worktree list items
  const wtItems = await page.locator('div.space-y-1 > div').count();
  console.log(`Worktree items in panel: ${wtItems}`);

  // Toggle closed
  await toggleBtn.click();
  await page.waitForTimeout(500);
  const panelAfter = await page.locator('text=브랜치명').isVisible().catch(() => false);
  console.log(`Panel hidden after toggle: ${!panelAfter ? '✅' : '❌'}`);

  await page.screenshot({ path: '/tmp/wt-panel-test.png' });
  console.log('📸 /tmp/wt-panel-test.png');
  await browser.close();
})();
```

- [ ] **Step 2: Run test**

```bash
cd /Users/gwanli/.claude/skills/playwright-skill && node run.js /tmp/playwright-test-worktree-panel.js 2>&1
# Expected: ✅ WorktreePanel rendered, correct item count, panel hides on toggle
```

- [ ] **Step 3: Commit**

```bash
cd /Users/gwanli/Documents/GitHub/myproduct_v4/portmanagement
git add src/App.tsx api-server.ts src-tauri/src/lib.rs
git commit -m "feat: worktree panel complete — create/merge/remove/push/pull per worktree"
```

---

## Self-Review

### Spec coverage
- ✅ Worktree 목록 동적 표시 (per card, collapsible)
- ✅ 워크트리 생성 (`git worktree add -b branch`)
- ✅ 워크트리 머지 (`git merge --no-ff branch`) + 자동 제거
- ✅ 워크트리 제거만 (`git worktree remove --force`)
- ✅ 폴더 열기 (per worktree row)
- ✅ tmux/Claude (reuses worktree picker, pre-sets wt.path)
- ✅ git push/pull (per worktree row, passes wt.path as workDir)
- ✅ 기존 터미널푸시/터미널풀 동선 유지 (item.worktreePath 기반, 변경 없음)

### No-conflict design for existing push/pull
- 기존 `터미널푸시` / `터미널풀` 버튼: `item.worktreePath` (저장된 기본값) 사용 — **변경 없음**
- WorktreePanel 내 push/pull: `wt.path` (목록에서 실제 절대경로) 사용 — 완전히 독립

### Placeholder scan
- No TBDs found
- All code blocks complete with actual implementation

### Type consistency
- `WorktreeInfo` type already defined: `{ path: string; branch?: string; is_main?: boolean }` (check lib.rs output for `is_main` field — if missing, add `is_main: boolean` to the type in App.tsx)
- `handleWorktreeMerge` uses `wt.branch` — guarded with `wt.branch &&` check ✅
- `loadWorktrees` is in `useCallback` — referenced by `toggleWorktreePanel` and handlers ✅
