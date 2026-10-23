// The real database port: service-role access to the sync RPCs (ADR 0004). Used only inside Edge Functions.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClaimedRow, Finish, Kind, LogEntry } from "./calendar-core.ts";
import type { SyncStore, TokenStore } from "./handlers.ts";

export class SupabaseStore implements SyncStore, TokenStore {
  constructor(private db: SupabaseClient) {}

  async connection(owner: string) {
    const { data, error } = await this.db.from("google_connections").select("status, calendar_id").eq("owner_id", owner).maybeSingle();
    if (error) throw error;
    return data as { status: string; calendar_id: string } | null;
  }

  async refreshToken(owner: string) {
    const { data, error } = await this.db.rpc("read_google_refresh_token", { p_owner: owner });
    if (error) throw error;
    return (data as string | null) ?? null;
  }

  async claim(kind: Kind, id: string | null, owner: string | null, limit: number) {
    const { data, error } = await this.db.rpc("claim_sync_rows", { p_kind: kind, p_id: id, p_owner: owner, p_limit: limit });
    if (error) throw error;
    return (data ?? []) as ClaimedRow[];
  }

  async finish(row: ClaimedRow, r: Finish) {
    const { data, error } = await this.db.rpc("finish_sync_row", {
      p_kind: row.kind,
      p_id: row.id,
      p_lease: row.next_sync_at,
      p_event_id: r.eventId ?? null,
      p_clear_event: r.clearEvent ?? false,
      p_status: r.status,
      p_attempts: r.attempts,
      p_error: r.error,
      p_next: r.next,
    });
    if (error) throw error;
    return data === true;
  }

  async markNeedsReconnect(owner: string, reason: string) {
    const { error } = await this.db
      .from("google_connections")
      .update({ status: "needs_reconnect", last_error: reason })
      .eq("owner_id", owner)
      .eq("status", "connected");
    if (error) throw error;
  }

  async log(entry: LogEntry) {
    // The log is for the owner's eyes; losing a line must never fail a sync.
    const { error } = await this.db.from("calendar_sync_log").insert(entry);
    if (error) console.error("calendar_sync_log insert failed:", error.message);
  }

  async eventIds(owner: string) {
    const ids: string[] = [];
    for (const table of ["time_blocks", "tasks"]) {
      const { data, error } = await this.db.from(table).select("gcal_event_id").eq("owner_id", owner).not("gcal_event_id", "is", null);
      if (error) throw error;
      ids.push(...(data ?? []).map((r: { gcal_event_id: string }) => r.gcal_event_id));
    }
    return ids;
  }

  async disconnect(owner: string) {
    const { error } = await this.db.rpc("disconnect_google_account", { p_owner: owner });
    if (error) throw error;
  }

  async connect(owner: string, email: string, scopes: string[], refreshToken: string) {
    const { error } = await this.db.rpc("connect_google_account", { p_owner: owner, p_email: email, p_scopes: scopes, p_token: refreshToken });
    if (error) throw error;
  }
}
