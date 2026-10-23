// A small stand-in for Google (OAuth token, tokeninfo, revoke, Calendar events) for the Phase 3 end-to-end tests.
// Run by Playwright (see playwright.config.ts) on FAKE_GOOGLE_PORT (default 4010). Nothing here talks to Google.
// Test controls: GET /__state, POST /__reset, POST /__fail {method, status, reason?, count?}, POST /__remove {id}.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.FAKE_GOOGLE_PORT ?? 4010);
const OWNER_EMAIL = process.env.FAKE_GOOGLE_EMAIL ?? "ourcoc4@gmail.com";
const SCOPE = "https://www.googleapis.com/auth/calendar.events.owned";

let events = new Map(); // id -> event body
let calls = []; // "METHOD path"
let failures = []; // { method, status, reason, count }
let refreshes = 0;

const reset = () => {
  events = new Map();
  calls = [];
  failures = [];
  refreshes = 0;
};

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const raw = await readBody(req);
  const json = () => {
    try {
      return JSON.parse(raw || "{}");
    } catch {
      return {};
    }
  };

  if (url.pathname === "/__state") return send(res, 200, { events: Object.fromEntries(events), calls, refreshes });
  if (url.pathname === "/__reset") return reset(), send(res, 200, {});
  if (url.pathname === "/__fail") {
    const { method, status, reason = "", count = 1 } = json();
    failures.push({ method, status, reason, count });
    return send(res, 200, {});
  }
  if (url.pathname === "/__remove") return events.delete(json().id), send(res, 200, {});

  calls.push(`${req.method} ${url.pathname}`);
  const failure = failures.find((f) => f.method === req.method && f.count > 0 && url.pathname.startsWith("/calendar"));
  if (failure) {
    failure.count--;
    return send(res, failure.status, { error: { code: failure.status, errors: [{ reason: failure.reason }] } });
  }

  if (url.pathname === "/token") {
    const form = new URLSearchParams(raw);
    refreshes++;
    if (form.get("refresh_token") === "revoked") return send(res, 400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
    return send(res, 200, { access_token: `fake-access-${form.get("refresh_token")}`, expires_in: 3600, token_type: "Bearer" });
  }
  if (url.pathname === "/tokeninfo") {
    const token = url.searchParams.get("access_token") ?? "";
    if (token.startsWith("no-calendar")) return send(res, 200, { email: OWNER_EMAIL, scope: "openid email" });
    if (token.startsWith("other-account")) return send(res, 200, { email: "someone.else@gmail.test", scope: `openid email ${SCOPE}` });
    return send(res, 200, { email: OWNER_EMAIL, scope: `openid email ${SCOPE}` });
  }
  if (url.pathname === "/revoke") return send(res, 200, {});

  const m = url.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
  if (!m) return send(res, 404, { error: { code: 404, errors: [{ reason: "notFound" }] } });
  if (!req.headers.authorization?.startsWith("Bearer fake-access-")) return send(res, 401, { error: { code: 401, errors: [{ reason: "authError" }] } });
  const id = m[2] ? decodeURIComponent(m[2]) : null;

  if (req.method === "GET" && !id) {
    const [key, value] = (url.searchParams.get("privateExtendedProperty") ?? "").split("=");
    const items = [...events].filter(([, e]) => e.extendedProperties?.private?.[key] === value).map(([eid]) => ({ id: eid }));
    return send(res, 200, { items });
  }
  if (req.method === "POST" && !id) {
    const eid = randomUUID().replaceAll("-", "");
    events.set(eid, json());
    return send(res, 200, { id: eid });
  }
  if (req.method === "PATCH" && id) {
    if (!events.has(id)) return send(res, 404, { error: { code: 404, errors: [{ reason: "notFound" }] } });
    events.set(id, { ...events.get(id), ...json() });
    return send(res, 200, { id });
  }
  if (req.method === "DELETE" && id) {
    if (!events.has(id)) return send(res, 410, { error: { code: 410, errors: [{ reason: "deleted" }] } });
    events.delete(id);
    return send(res, 204);
  }
  return send(res, 405, {});
}).listen(PORT, () => console.log(`fake google on ${PORT}`));
