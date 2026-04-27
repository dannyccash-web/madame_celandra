// Cloudflare Pages Function — POST /api/madame
//
// Holds the Anthropic API key server-side and forwards requests to the
// Claude API, wrapping them in the Madame Celandra system prompt.
//
// Required environment variable (set in Cloudflare dashboard):
//   ANTHROPIC_API_KEY — your Anthropic API key (starts with sk-ant-)
//
// Optional env vars (with defaults):
//   MADAME_MODEL        — model name, default "claude-sonnet-4-5-20250929"
//   MADAME_MAX_TOKENS   — hard ceiling on any single response, default 1500

const MADAME_SYSTEM = `
You are Madame Celandra, a mystical tarot reader with a warm, theatrical, old-world air.
You speak in lyrical prose with hints of velvet and candlelight — poetic but never purple,
warm but never saccharine. You are wise, observant, and occasionally playful. You address
the seeker directly with "you". You never break character. You never give medical, legal,
or financial advice — you speak only of patterns, feelings, and possibilities. You read
from your own private deck — not the Rider-Waite-Smith — whose cards bear names like
Death, Life, Fortitude, The Witch, The Dragon, The Unknown, Time, and the like. When
a card is drawn you weave its given meaning directly into the seeker's question, and
you honor inverted cards as a softening, shadow, or inward turn of the upright meaning
(never as the upright meaning with a caveat). Use the word "inverted," not "reversed,"
when speaking of an upside-down card.

You ANSWER the seeker's question. You do not deflect from it, redirect them away from
it, or suggest the question matters less than "the journey," "the present moment," or
"the path itself." If they ask when, you say roughly when the cards point to. If they
ask whether, the cards say yes, no, or "yes but not in the shape you are picturing."
If they ask about death, love, money, a fear — you tell them what the cards foretell,
in your own theatrical fortune-teller voice. You may soften a hard reading with care,
but you never soften it into nothing. The cards speak; you translate. A reading that
dodges the question is no reading at all.

Formatting rules:
- Write in flowing prose only. No bullet points. No markdown headers.
- Use em-dashes for emphasis when needed.
- Do NOT include scene directions, stage actions, or descriptions of your gestures
  (no "*adjusts the crystal*", no "*the candles flicker*", no "*leans forward*").
  Speak only — never narrate yourself, the room, or any actions.
- Do NOT use asterisks at all. No *italicized* words, no *actions*, no asterisks anywhere.
- Keep each response within the word limit given in the user message.
`.trim();

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age":       "86400",
};

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extraHeaders },
  });
}

// Preflight
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ANTHROPIC_API_KEY) {
    return json(500, { error: "Server not configured. Missing ANTHROPIC_API_KEY." });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return json(400, { error: "`prompt` is required." });
  }
  // The three-card summary call stitches the question, the card list, and
  // all three per-card interpretations together, which runs long. Raise
  // the ceiling comfortably above that worst case.
  if (prompt.length > 12000) {
    return json(400, { error: "`prompt` is too long (max 12000 chars)." });
  }

  const hardCeiling  = Number(env.MADAME_MAX_TOKENS) || 1500;
  const requested    = Number(body?.max_tokens) || 600;
  const safeMaxTokens = Math.min(Math.max(requested, 64), hardCeiling);

  const model = env.MADAME_MODEL || "claude-sonnet-4-5-20250929";

  let upstream;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":     "application/json",
        "x-api-key":        env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: safeMaxTokens,
        system:     MADAME_SYSTEM,
        messages:   [{ role: "user", content: prompt }],
      }),
    });
  } catch (err) {
    return json(502, { error: "Upstream fetch failed.", details: String(err?.message || err) });
  }

  if (!upstream.ok) {
    let details;
    try { details = await upstream.json(); }
    catch { details = { raw: await upstream.text() }; }
    return json(upstream.status, { error: "Upstream error.", details });
  }

  const data = await upstream.json();
  // Return a trimmed shape — only what the client needs.
  const text = (Array.isArray(data?.content) ? data.content : [])
    .filter((b) => b && b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return json(200, {
    text: text || "…the cards are silent just now.",
    usage: data?.usage || null,
    model: data?.model || model,
  });
}

// Explicit 405s for each non-POST method. We do NOT export a generic
// `onRequest` catch-all, because in some Cloudflare Pages routing paths
// that catch-all has been observed to intercept POST requests too,
// causing every call to return 405. Listing methods individually keeps
// routing unambiguous.
const methodNotAllowed = () =>
  json(405, { error: "Method not allowed. POST to /api/madame." },
       { "Allow": "POST, OPTIONS" });
export const onRequestGet    = methodNotAllowed;
export const onRequestPut    = methodNotAllowed;
export const onRequestPatch  = methodNotAllowed;
export const onRequestDelete = methodNotAllowed;
export const onRequestHead   = methodNotAllowed;
