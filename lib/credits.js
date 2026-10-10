// ============================================================
//  Madame Celandra — reading-credit ledger (Cloudflare D1)
// ============================================================
//
// Shared by the Pages Functions in functions/api/*.
//
// Bindings / env vars (set in the Cloudflare Pages dashboard):
//   DB                    — D1 database binding (required)
//   APP_KEY               — shared secret the native app sends in the
//                           X-Madame-App-Key header (required)
//   AMAZON_SHARED_SECRET  — Amazon Appstore shared secret, used to verify
//                           IAP receipts with Amazon RVS (required for purchases)
//   AMAZON_RVS_SANDBOX    — "true" while testing with App Tester; falls back
//                           to the RVS sandbox when production says "not found"
//   MAX_NEW_ACCOUNTS_PER_DAY — optional safety valve on brand-new accounts
//                           across everyone, per UTC day (default 2000)
//
// Pricing model:
//   • v1.1+ is a FREE download. The app sends `edition: "free"` and a new
//     account starts with FREE_STARTING_CREDITS readings.
//   • v1.0 was a paid download ($3.99) and sends no edition; anyone who
//     bought it and opens it for the first time still gets
//     PAID_STARTING_CREDITS. Existing accounts keep whatever they have.
//   • The consumable IAP `REFILL_SKU` ($1.99) adds REFILL_CREDITS readings.

export const PAID_STARTING_CREDITS = 200;
export const FREE_STARTING_CREDITS = 3;
export const STARTING_CREDITS = FREE_STARTING_CREDITS;   // what new installs get today
export function startingCreditsFor(edition) {
  return edition === "free" ? FREE_STARTING_CREDITS : PAID_STARTING_CREDITS;
}
export const REFILL_SKU = "madame_readings_100";
export const REFILL_CREDITS = 100;

// One reading = greeting + acknowledgement + 3 cards + summary = 6 calls.
// Leave some headroom for retries.
export const MAX_CALLS_PER_SESSION = 10;
export const SESSION_TTL_MS = 3 * 60 * 60 * 1000;     // 3 hours
export const MAX_NEW_ACCOUNTS_PER_IP_PER_DAY = 3;
export const DEFAULT_MAX_NEW_ACCOUNTS_PER_DAY = 2000;

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Madame-App-Key",
  "Access-Control-Max-Age":       "86400",
};

export function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extraHeaders },
  });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export const methodNotAllowed = () =>
  json(405, { error: "Method not allowed." }, { "Allow": "POST, OPTIONS" });

// ---------- request validation ----------

// Returns an error Response, or null if the request is allowed.
export function checkConfigAndKey(request, env) {
  if (!env.DB) return json(500, { error: "Server not configured. Missing DB binding." });
  if (!env.APP_KEY) return json(500, { error: "Server not configured. Missing APP_KEY." });
  const sent = request.headers.get("X-Madame-App-Key") || "";
  if (!timingSafeEqual(sent, env.APP_KEY)) {
    return json(403, { error: "Madame Celandra now lives in her app on the Amazon Appstore." });
  }
  return null;
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function cleanUserId(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^[A-Za-z0-9._:=+\/-]{3,256}$/.test(s) ? s : null;
}

export async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

// ---------- schema ----------

let schemaReady = false;
export async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS accounts (
      user_id     TEXT PRIMARY KEY,
      balance     INTEGER NOT NULL,
      marketplace TEXT,
      created_at  INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      consumed   INTEGER NOT NULL DEFAULT 0,
      calls      INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id, created_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS receipts (
      receipt_id TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      sku        TEXT NOT NULL,
      credits    INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS signups (
      ip    TEXT NOT NULL,
      day   TEXT NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY (ip, day)
    )`),
  ]);
  schemaReady = true;
}

// ---------- accounts ----------

export async function getBalance(db, userId) {
  const row = await db.prepare(`SELECT balance FROM accounts WHERE user_id = ?`)
    .bind(userId).first();
  return row ? row.balance : null;
}

// Get the account, creating it with the edition's starting readings on first sight.
// Returns { balance, created } or { error: Response }.
export async function getOrCreateAccount(db, request, userId, marketplace, maxNewPerDay, edition) {
  const existing = await getBalance(db, userId);
  if (existing !== null) return { balance: existing, created: false };

  // Throttle brand-new accounts per IP so a scraped APP_KEY can't mint
  // unlimited free readings by inventing user IDs.
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const sig = await db.prepare(`SELECT count FROM signups WHERE ip = ? AND day = ?`)
    .bind(ip, day).first();
  if (sig && sig.count >= MAX_NEW_ACCOUNTS_PER_IP_PER_DAY) {
    return { error: json(429, { error: "Too many new accounts from this network today." }) };
  }
  // Global safety valve: if new accounts suddenly spike far beyond normal,
  // stop minting free readings until someone looks into it.
  const globalCap = Number(maxNewPerDay) || DEFAULT_MAX_NEW_ACCOUNTS_PER_DAY;
  const tot = await db.prepare(`SELECT COALESCE(SUM(count), 0) AS n FROM signups WHERE day = ?`)
    .bind(day).first();
  if (tot && tot.n >= globalCap) {
    return { error: json(503, { error: "new_accounts_paused" }) };
  }

  const now = Date.now();
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO accounts (user_id, balance, marketplace, created_at)
                VALUES (?, ?, ?, ?)`)
      .bind(userId, startingCreditsFor(edition), marketplace || null, now),
    db.prepare(`INSERT INTO signups (ip, day, count) VALUES (?, ?, 1)
                ON CONFLICT (ip, day) DO UPDATE SET count = count + 1`)
      .bind(ip, day),
  ]);
  const balance = await getBalance(db, userId);
  return { balance, created: true };
}

// ---------- reading sessions ----------
//
// A session is opened when the seeker taps "Begin Reading". The first
// API call of a session (Madame's greeting) is free; the second call —
// made once they've actually asked their question — spends one credit.

export async function openSession(db, userId) {
  const now = Date.now();
  // Reuse a recent session that hasn't been charged yet, so tapping
  // Begin over and over can't farm free greetings.
  const open = await db.prepare(
    `SELECT id FROM sessions
      WHERE user_id = ? AND consumed = 0 AND created_at > ?
      ORDER BY created_at DESC LIMIT 1`
  ).bind(userId, now - SESSION_TTL_MS).first();
  if (open) return open.id;

  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)`)
    .bind(id, userId, now).run();
  return id;
}

// Authorise one model call for a session. Returns { ok:true, balance }
// or { ok:false, response }.
export async function authorizeCall(db, userId, sessionId) {
  const now = Date.now();
  const s = await db.prepare(
    `SELECT consumed, calls, created_at FROM sessions WHERE id = ? AND user_id = ?`
  ).bind(sessionId, userId).first();

  if (!s || s.created_at < now - SESSION_TTL_MS) {
    return { ok: false, response: json(409, { error: "session_expired" }) };
  }
  if (s.calls >= MAX_CALLS_PER_SESSION) {
    return { ok: false, response: json(429, { error: "session_exhausted" }) };
  }

  if (!s.consumed && s.calls >= 1) {
    // Charge one credit. Flip `consumed` first so concurrent calls can't
    // double-charge, then take the credit; roll back if the balance is empty.
    const flip = await db.prepare(
      `UPDATE sessions SET consumed = 1 WHERE id = ? AND consumed = 0`
    ).bind(sessionId).run();
    if (flip.meta.changes === 1) {
      const spend = await db.prepare(
        `UPDATE accounts SET balance = balance - 1 WHERE user_id = ? AND balance > 0`
      ).bind(userId).run();
      if (spend.meta.changes !== 1) {
        await db.prepare(`UPDATE sessions SET consumed = 0 WHERE id = ?`).bind(sessionId).run();
        const balance = await getBalance(db, userId);
        return { ok: false, response: json(402, { error: "out_of_readings", balance: balance ?? 0 }) };
      }
    }
  }

  await db.prepare(`UPDATE sessions SET calls = calls + 1 WHERE id = ?`).bind(sessionId).run();
  const balance = await getBalance(db, userId);
  return { ok: true, balance: balance ?? 0 };
}

// ---------- Amazon receipt verification ----------

async function rvs(env, userId, receiptId, sandbox) {
  const base = sandbox
    ? "https://appstore-sdk.amazon.com/sandbox/version/1.0/verifyReceiptId"
    : "https://appstore-sdk.amazon.com/version/1.0/verifyReceiptId";
  const url = `${base}/developer/${encodeURIComponent(env.AMAZON_SHARED_SECRET)}` +
              `/user/${encodeURIComponent(userId)}/receiptId/${encodeURIComponent(receiptId)}`;
  const res = await fetch(url, { method: "GET" });
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
}

// Returns { ok:true, receipt } or { ok:false, status, reason }.
export async function verifyAmazonReceipt(env, userId, receiptId) {
  if (!env.AMAZON_SHARED_SECRET) return { ok: false, status: 500, reason: "missing_shared_secret" };

  let r = await rvs(env, userId, receiptId, false);
  if (r.status !== 200 && String(env.AMAZON_RVS_SANDBOX).toLowerCase() === "true") {
    r = await rvs(env, userId, receiptId, true);
  }
  if (r.status === 200 && r.body) return { ok: true, receipt: r.body };
  if (r.status === 410) return { ok: false, status: 410, reason: "receipt_canceled" };
  if (r.status === 400) return { ok: false, status: 400, reason: "receipt_invalid" };
  if (r.status === 496) return { ok: false, status: 500, reason: "bad_shared_secret" };
  if (r.status === 497) return { ok: false, status: 400, reason: "bad_user_id" };
  return { ok: false, status: 502, reason: `rvs_${r.status}` };
}

// Credit a verified receipt exactly once. Returns { granted, balance }.
export async function creditReceipt(db, userId, receiptId, sku, credits) {
  const ins = await db.prepare(
    `INSERT OR IGNORE INTO receipts (receipt_id, user_id, sku, credits, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(receiptId, userId, sku, credits, Date.now()).run();
  const granted = ins.meta.changes === 1;
  if (granted) {
    await db.prepare(`UPDATE accounts SET balance = balance + ? WHERE user_id = ?`)
      .bind(credits, userId).run();
  }
  const balance = await getBalance(db, userId);
  return { granted, balance: balance ?? 0 };
}
