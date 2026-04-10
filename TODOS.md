# TODOS

## P2 — Supabase push never deletes removed rows

**What:** After upsert in `handlePushToSupabase`, run a delete pass — remove Supabase rows whose IDs are no longer in the local port list.

**Why:** Deleting a port locally doesn't remove it from Supabase. On next pull, the deleted row comes back. With the shared-list (Model B) pull, this creates accumulating ghost rows over time.

**Current state:** `handlePushToSupabase` (App.tsx) only upserts; never deletes. No delete-sync exists.

**Where to start:**
```ts
// After upsert succeeds:
const localIds = ports.map(p => p.id);
const { data: remoteRows } = await supabase.from('ports').select('id');
const staleIds = (remoteRows ?? []).map(r => r.id).filter(id => !localIds.includes(id));
if (staleIds.length > 0) {
  await supabase.from('ports').delete().in('id', staleIds);
}
```

**Effort:** S (human: ~1h / CC: ~5min)
**Depends on:** nothing — standalone addition to push handler
**Blocked by:** nothing

---

## P2b — Multiple Supabase client instances (GoTrueClient warning)

**What:** Each call to `handlePushToSupabase`, `handleRestoreFromSupabase`, auto-push timer, and auto-pull creates a new `createClient()` instance. Supabase logs "Multiple GoTrueClient instances detected" warning.

**Why:** Not a bug, but wastes memory and pollutes the console. A single shared client per session would be cleaner.

**Where to start:** Create a module-level `getSupabaseClient(url, key)` that caches and reuses the same instance.

**Effort:** S (human: ~30min / CC: ~3min)
**Blocked by:** nothing

---

## P2c — hasInitiallyLoaded set before auto-pull completes (premature push risk)

**What:** `hasInitiallyLoaded.current = true` (App.tsx:660) is set synchronously at component init, before the async auto-pull at line 695 finishes. If the 3-second auto-push debounce fires before pull completes (e.g., slow Supabase response), it could push stale local data and overwrite a newer remote state.

**Why:** The flag is intended to gate auto-push from running on initial load, but it's set too early — should be set only after `setPorts(merged)` on line 695.

**Where to start:** Move `hasInitiallyLoaded.current = true` to after `setPorts(merged)` inside the auto-pull useEffect.

**Effort:** S (human: ~30min / CC: ~3min)
**Blocked by:** nothing

---

## P2d — Supabase ports pull unscoped (no device_id filter)

**What:** `handleRestoreFromSupabase` and auto-pull both do `.select('*')` on the `ports` table with no `device_id` filter. Every machine sharing the same Supabase credentials downloads and merges all other devices' port entries. With `remote wins` merge semantics, foreign rows can overwrite local data.

**Why:** `ports` table has no `device_id` column, so scoping isn't possible today. Either add `device_id` to `ports` (and push it) or document that the `ports` table is intentionally shared (single user, multi-Mac).

**Where to start:** Add `device_id` column to `ports` table; include it in Push row mapping (`App.tsx:1241`); add `.eq('device_id', deviceId)` to the select in auto-pull (`App.tsx:677`) and manual pull (`App.tsx:1169`).

**Effort:** M (human: ~2h / CC: ~10min)
**Blocked by:** Supabase migration

---

## P2e — portalConfigRef never refreshed after credential change

**What:** `portalConfigRef` is set once on startup (`App.tsx:671`) and never updated. If the user saves new Supabase credentials in the Portal tab, auto-push keeps using the stale credentials until the app restarts.

**Why:** The Portal tab saves directly to `portal.json` via `PortalManager.tsx` but doesn't notify App.tsx to refresh the ref.

**Where to start:** Either expose a callback from PortalManager that re-reads and sets `portalConfigRef.current`, or re-read `portal.json` fresh inside the auto-push effect instead of using the cached ref.

**Effort:** S (human: ~30min / CC: ~5min)
**Blocked by:** nothing

---

## P2f — bypass-fresh re-attaches instead of killing existing session

**What:** When bypass mode is toggled on, the "tmux 새 세션 (fresh)" button calls `openTmuxClaudeBypass` which uses `tmux new-session -A` (attach-or-create). This re-attaches to the old session rather than killing it and starting fresh.

**Why:** The fresh path should kill the old `{session}-bypass` session before creating a new one, same as `open_tmux_claude_fresh` does for the regular path.

**Where to start:** Add a kill step to `open_tmux_claude_bypass` (or add a dedicated bypass-fresh command) mirroring the `kill_cmd` pattern in `open_tmux_claude_fresh` (`lib.rs:941`).

**Effort:** S (human: ~30min / CC: ~5min)
**Blocked by:** nothing

---

## P2g — delete pass unsafe on auto-pull failure ✅ FIXED (2026-04-10)

**What:** Auto-push delete pass deleted all remote-only rows if startup auto-pull timed out.

**Fix:** Added `autopullSucceeded` ref (App.tsx:598). Delete pass in auto-push (line 912) and manual push (line 1370) now gated behind `if (autopullSucceeded.current)`.

---

## P2h — Bun.spawnSync blocks API server during AI route calls

**What:** `/api/suggest-name`, `/api/generate-description`, `/api/suggest-category` use `Bun.spawnSync` with 20–30s timeouts. Bun's event loop is single-threaded — a blocking spawn freezes all concurrent API requests for the duration.

**Why:** For a single-user desktop tool this rarely matters, but a slow `claude -p` call (network auth, cold start) will make all port status checks unresponsive until it resolves.

**Where to start:** Replace `Bun.spawnSync` with `await Bun.spawn(...).exited` pattern (async subprocess), or wrap each route in a `Promise.race` with a short abort.

**Effort:** S (human: ~30min / CC: ~5min)
**Blocked by:** nothing

---

## P3 — Cross-Mac tmux session visibility

**What:** The tmux health indicator (green dot) shows local sessions only. Sessions running on a different Mac are always invisible.

**Why:** Architecturally requires a relay server or shared state service to query remote tmux servers. Out of scope for a local desktop tool.

**Current state:** `check_tmux_session` in lib.rs uses `sh -c tmux has-session` — inherently local.

**Where to start:** Would require a background agent on each Mac exposing a `/tmux-status` HTTP endpoint, or a Supabase realtime channel where each Mac writes its session state. Neither is trivial.

**Effort:** L (human: ~1 week / CC: ~2h)
**Blocked by:** architecture decision on relay mechanism
