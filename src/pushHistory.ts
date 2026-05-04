import type { SupabaseClient } from '@supabase/supabase-js';

export interface PushSnapshot {
  id: string;
  created_at: string;
  table_name: string;
  device_id: string | null;
  device_name: string | null;
  row_count: number;
}

const MAX_SNAPSHOTS = 20;

export async function savePushSnapshot(
  supabase: SupabaseClient,
  tableName: string,
  deviceId: string | null,
  deviceName: string | null,
  rows: unknown[]
): Promise<void> {
  try {
    await supabase.from('portmgr_push_snapshots').insert({
      table_name: tableName,
      device_id: deviceId,
      device_name: deviceName,
      snapshot: rows,
      row_count: rows.length,
    });
    // Prune oldest beyond MAX_SNAPSHOTS
    const { data: all } = await supabase
      .from('portmgr_push_snapshots')
      .select('id')
      .eq('table_name', tableName)
      .eq('device_id', deviceId ?? '')
      .order('created_at', { ascending: false });
    const toDelete = (all ?? []).slice(MAX_SNAPSHOTS).map((r: any) => r.id);
    if (toDelete.length > 0) {
      await supabase.from('portmgr_push_snapshots').delete().in('id', toDelete);
    }
  } catch {
    // non-blocking — snapshot failure must not block push
  }
}

export async function fetchPushHistory(
  supabase: SupabaseClient,
  tableName: string,
  deviceId: string | null
): Promise<PushSnapshot[]> {
  const { data } = await supabase
    .from('portmgr_push_snapshots')
    .select('id, created_at, table_name, device_id, device_name, row_count')
    .eq('table_name', tableName)
    .eq('device_id', deviceId ?? '')
    .order('created_at', { ascending: false })
    .limit(MAX_SNAPSHOTS);
  return data ?? [];
}

export async function fetchSnapshotRows(
  supabase: SupabaseClient,
  snapshotId: string
): Promise<unknown[]> {
  const { data } = await supabase
    .from('portmgr_push_snapshots')
    .select('snapshot')
    .eq('id', snapshotId)
    .single();
  return (data as any)?.snapshot ?? [];
}
