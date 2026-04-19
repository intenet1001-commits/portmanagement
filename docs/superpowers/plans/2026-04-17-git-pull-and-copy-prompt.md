# Git Pull & Copy Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 각 포트 카드에 "git pull" 실행 버튼과 프롬프트 복사 버튼을 추가한다.

**Architecture:** `api-server.ts`에 `POST /api/git-pull` 엔드포인트를 추가하고, `App.tsx`의 API 객체에 `gitPull()` 메서드를 추가한다. 포트 카드 버튼 영역에 두 버튼을 렌더링한다. Tauri 모드와 웹 모드 모두 동일한 API 엔드포인트를 사용한다.

**Tech Stack:** Bun, TypeScript, React, Tauri 2

---

### Task 1: api-server.ts에 git-pull 엔드포인트 추가

**Files:**
- Modify: `api-server.ts` (기존 엔드포인트 블록 마지막 부분에 추가)

- [ ] **Step 1: `POST /api/list-git-worktrees` 블록 바로 앞에 git-pull 핸들러 추가**

`api-server.ts`에서 `if (url.pathname === "/api/list-git-worktrees"` 줄을 찾아 그 바로 앞에 다음을 삽입:

```typescript
    if (url.pathname === "/api/git-pull" && req.method === "POST") {
      try {
        const { folderPath } = await req.json() as { folderPath: string };
        if (!folderPath) return new Response(JSON.stringify({ success: false, error: "folderPath 필요" }), { headers: { "Content-Type": "application/json", ...corsHeaders } });

        const proc = Bun.spawn(["git", "pull"], {
          cwd: folderPath,
          stdout: "pipe",
          stderr: "pipe",
        });
        await proc.exited;
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const output = (stdout + stderr).trim();
        if (proc.exitCode !== 0) {
          return new Response(JSON.stringify({ success: false, error: output }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
        return new Response(JSON.stringify({ success: true, output }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: String(e) }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }
```

- [ ] **Step 2: API 서버 재시작 후 curl로 동작 확인**

```bash
# 터미널에서 실행 (folderPath는 git 리포가 있는 실제 경로로 교체)
curl -s -X POST http://localhost:3001/api/git-pull \
  -H "Content-Type: application/json" \
  -d '{"folderPath":"/Users/nhis/Library/Mobile Documents/com~apple~CloudDocs/Documents/GitHub/myproduct_v4/portmanagement"}' | jq .
```

Expected: `{ "success": true, "output": "Already up to date." }` (또는 실제 pull 결과)

- [ ] **Step 3: 커밋**

```bash
git add api-server.ts
git commit -m "feat: add POST /api/git-pull endpoint"
```

---

### Task 2: App.tsx API 객체에 gitPull() 메서드 추가

**Files:**
- Modify: `src/App.tsx` (API 객체 내 `openFolder` 메서드 아래에 추가)

- [ ] **Step 1: `openFolder` 메서드 닫는 `},` 바로 뒤에 `gitPull` 추가**

`src/App.tsx`에서 `async openFolder(folderPath: string)` 블록 직후에 삽입:

```typescript
  async gitPull(folderPath: string): Promise<string> {
    const response = await fetch('/api/git-pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath })
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    return result.output as string;
  },
```

- [ ] **Step 2: TypeScript 에러 없는지 확인**

```bash
cd "/Users/nhis/Library/Mobile Documents/com~apple~CloudDocs/Documents/GitHub/myproduct_v4/portmanagement"
bun run build 2>&1 | grep -E "error|Error" | head -10
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/App.tsx
git commit -m "feat: add API.gitPull() method"
```

---

### Task 3: 포트 카드에 "풀" 버튼 + "프롬프트 복사" 버튼 추가

**Files:**
- Modify: `src/App.tsx` (포트 카드 버튼 영역 — `item.githubUrl` 버튼 블록 직후)

`item.githubUrl` 버튼 블록이 끝나는 `)}` 바로 뒤, `{(item.commandPath || item.terminalCommand) && item.port && (` 줄 앞에 삽입한다.

- [ ] **Step 1: "풀" 버튼 추가 (folderPath가 있을 때만 표시)**

```tsx
{item.folderPath && (
  <button
    onClick={async () => {
      try {
        const output = await API.gitPull(item.folderPath!);
        showToast(`git pull 완료: ${output.slice(0, 60)}`, 'success');
      } catch (error) {
        showToast('git pull 실패: ' + error, 'error');
      }
    }}
    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium rounded-lg border border-emerald-500/30 hover:border-emerald-500/50 transition-all duration-200"
  >
    <GitPullRequest className="w-3 h-3" />
    <span>풀</span>
  </button>
)}
```

- [ ] **Step 2: "프롬프트 복사" 버튼 추가 (folderPath가 있을 때만 표시)**

"풀" 버튼 바로 뒤에 삽입:

```tsx
{item.folderPath && (
  <button
    onClick={() => {
      const prompt = `cd "${item.folderPath}" && git pull`;
      navigator.clipboard.writeText(prompt);
      showToast('프롬프트 복사됨', 'success');
    }}
    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 text-xs font-medium rounded-lg border border-zinc-700/50 hover:border-zinc-600/50 transition-all duration-200"
    title={`cd "${item.folderPath}" && git pull`}
  >
    <Copy className="w-3 h-3" />
    <span>복사</span>
  </button>
)}
```

- [ ] **Step 3: lucide-react에서 GitPullRequest, Copy import 확인**

`src/App.tsx` 상단 import 줄을 확인한다:

```bash
grep "GitPullRequest\|import.*Copy" "/Users/nhis/Library/Mobile Documents/com~apple~CloudDocs/Documents/GitHub/myproduct_v4/portmanagement/src/App.tsx" | head -5
```

없으면 기존 lucide import 줄에 `GitPullRequest`, `Copy` 추가.

- [ ] **Step 4: 브라우저에서 동작 확인**

```bash
bun run dev
```

- folderPath가 있는 포트 카드에 "풀", "복사" 버튼이 나타나는지 확인
- "풀" 클릭 → toast에 git pull 결과 출력
- "복사" 클릭 → 클립보드에 `cd "..." && git pull` 복사, toast 확인

- [ ] **Step 5: 커밋**

```bash
git add src/App.tsx
git commit -m "feat: add git pull button and copy prompt button to port cards"
```
