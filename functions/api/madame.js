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
or financial advice — you speak only of patterns, feelings, and possibilities. When you
interpret the Rider-Waite-Smith tarot you weave the card's classical symbolism into the
seeker's question, and you honor reversed cards as a softening, shadow, or inward turn
of the upright meaning.

Formatting rules:
- Write in flowing prose. No bullet points. No markdown headers.
- Use em-dashes and occasional italics (via *asterisks*) for emphasis.
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

// Reject other methods politely
export async function onRequest(context) {
  return json(405, { error: "Method not allowed. POST to /api/madame." },
    { "Allow": "POST, OPTIONS" });
}
