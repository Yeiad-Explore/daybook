// The real Google client (token exchange, Calendar events, revoke, tokeninfo) over fetch.
// Base URLs are settings so tests and the local fake-Google run can point somewhere else.
import { GoogleError, TokenRevokedError, type EventBody, type GooglePort } from "./calendar-core.ts";

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  tokenUrl?: string;
  revokeUrl?: string;
  tokenInfoUrl?: string;
  apiBase?: string;
  fetch?: typeof fetch;
}

async function errorReason(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? (typeof body?.error === "string" ? body.error : "");
  } catch {
    return "";
  }
}

export class GoogleClient implements GooglePort {
  private f: typeof fetch;
  constructor(private cfg: GoogleConfig) {
    this.f = cfg.fetch ?? fetch;
  }

  private get tokenUrl() { return this.cfg.tokenUrl ?? "https://oauth2.googleapis.com/token"; }
  private get apiBase() { return this.cfg.apiBase ?? "https://www.googleapis.com"; }
  private events(calendarId: string, eventId?: string) {
    return `${this.apiBase}/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}`;
  }

  private async call(access: string, method: string, url: string, body?: unknown): Promise<Response> {
    const res = await this.f(url, {
      method,
      headers: { Authorization: `Bearer ${access}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new GoogleError(res.status, await errorReason(res));
    return res;
  }

  async accessToken(refreshToken: string): Promise<string> {
    const res = await this.f(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      const reason = await errorReason(res);
      // GC-10: invalid_grant is Google's word for revoked, expired or replaced.
      if (reason === "invalid_grant") throw new TokenRevokedError("invalid_grant");
      throw new GoogleError(res.status, reason);
    }
    const { access_token } = await res.json();
    if (typeof access_token !== "string") throw new GoogleError(502, "badTokenResponse");
    return access_token;
  }

  async findByDaybookId(access: string, calendarId: string, daybookId: string): Promise<string | null> {
    const q = new URLSearchParams({ privateExtendedProperty: `daybookId=${daybookId}`, maxResults: "1", showDeleted: "false" });
    const res = await this.call(access, "GET", `${this.events(calendarId)}?${q}`);
    const { items } = await res.json();
    return items?.[0]?.id ?? null;
  }

  async insert(access: string, calendarId: string, event: EventBody): Promise<string> {
    const res = await this.call(access, "POST", this.events(calendarId), event);
    const { id } = await res.json();
    if (typeof id !== "string") throw new GoogleError(502, "badEventResponse");
    return id;
  }

  async patch(access: string, calendarId: string, eventId: string, event: EventBody): Promise<void> {
    await this.call(access, "PATCH", this.events(calendarId, eventId), event);
  }

  async remove(access: string, calendarId: string, eventId: string): Promise<void> {
    await this.call(access, "DELETE", this.events(calendarId, eventId));
  }

  /** Best effort: the stored token is deleted either way (GC-5). */
  async revoke(refreshToken: string): Promise<void> {
    await this.f(this.cfg.revokeUrl ?? "https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    }).catch(() => undefined);
  }

  /** Asks Google what an access token really grants: the email and the scopes. */
  async tokenInfo(accessToken: string): Promise<{ email: string | null; scopes: string[] }> {
    const url = `${this.cfg.tokenInfoUrl ?? "https://oauth2.googleapis.com/tokeninfo"}?${new URLSearchParams({ access_token: accessToken })}`;
    const res = await this.f(url);
    if (!res.ok) throw new GoogleError(res.status, await errorReason(res));
    const body = await res.json();
    // A token issued to some other application proves nothing about our connection (Google always sends aud).
    if (typeof body.aud === "string" && body.aud !== this.cfg.clientId) throw new GoogleError(401, "wrongClient");
    return { email: typeof body.email === "string" ? body.email : null, scopes: String(body.scope ?? "").split(" ").filter(Boolean) };
  }
}
