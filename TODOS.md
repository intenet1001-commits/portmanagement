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

## P3 — Cross-Mac tmux session visibility

**What:** The tmux health indicator (green dot) shows local sessions only. Sessions running on a different Mac are always invisible.

**Why:** Architecturally requires a relay server or shared state service to query remote tmux servers. Out of scope for a local desktop tool.

**Current state:** `check_tmux_session` in lib.rs uses `sh -c tmux has-session` — inherently local.

**Where to start:** Would require a background agent on each Mac exposing a `/tmux-status` HTTP endpoint, or a Supabase realtime channel where each Mac writes its session state. Neither is trivial.

**Effort:** L (human: ~1 week / CC: ~2h)
**Blocked by:** architecture decision on relay mechanism
