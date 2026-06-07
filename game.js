// ============================================================
//  Madame Celandra — game logic
// ============================================================

(() => {
  "use strict";

  // ---------- constants ----------
  const POSITIONS = ["The Past", "The Present", "The Future"];
  // The proxy lives at /api/madame — your API key stays on the server.
  const MADAME_URL = "/api/madame";
  // One reading per day — track the local date of the last completed reading.
  const LAST_READING_KEY = "madame_last_reading_date";
  const DAILY_LIMIT_ENABLED = true;

  // ---------- state ----------
  const state = {
    question: "",
    draws: [],           // [{ card, reversed, interpretation }, ...]
    currentDraw: 0,
    summary: "",
    waitingForMadame: false
  };

  // ---------- tiny helpers ----------
  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function showScreen(id) {
    $$(".screen").forEach((el) => el.classList.remove("active"));
    $("#" + id).classList.add("active");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function setBubble(el, text) {
    el.classList.remove("typing");
    el.textContent = "";
    return typeOut(el, text);
  }

  // Each call to typeOut gets its own skip flag. Tapping the bubble sets it,
  // which collapses the remaining characters instantly.
  async function typeOut(el, text, speed = 18) {
    el.classList.add("typing");
    el.textContent = "";

    let skipped = false;
    const skip = () => { skipped = true; };
    el.addEventListener("click", skip, { once: true });

    for (let i = 0; i < text.length; i++) {
      if (skipped) {
        el.textContent = text;
        break;
      }
      el.textContent += text[i];
      // slightly slower on punctuation, faster on spaces
      const ch = text[i];
      let delay = speed;
      if (ch === "," || ch === ";") delay = 180;
      else if (ch === "." || ch === "?" || ch === "!") delay = 260;
      else if (ch === " ") delay = speed * 0.6;
      await sleep(delay + (Math.random() * 10 - 5));
    }
    el.removeEventListener("click", skip);
    el.classList.remove("typing");
  }

  function thinkingHTML() {
    return `<span class="thinking" aria-label="thinking"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>`;
  }

  // ---------- one-reading-per-day gate ----------
  // Use the seeker's local calendar date (YYYY-MM-DD). If they've already had
  // a reading today, the Begin button is hidden and Madame speaks in-character
  // about returning tomorrow.
  function todayLocalISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function lastReadingDate() {
    try { return localStorage.getItem(LAST_READING_KEY) || null; }
    catch { return null; }
  }
  function markReadingCompleteToday() {
    try { localStorage.setItem(LAST_READING_KEY, todayLocalISO()); }
    catch { /* private mode, etc. — gate silently disabled */ }
  }
  function hasReadingToday() {
    if (!DAILY_LIMIT_ENABLED) return false;
    return lastReadingDate() === todayLocalISO();
  }
  function applyStartGate() {
    const gate   = $("#start-gate");
    const gateMsg = $("#gate-message");
    const beginBtn = $("#begin-btn");
    if (!gate || !beginBtn) return;
    if (hasReadingToday()) {
      beginBtn.style.display = "none";
      gate.style.display = "block";
      gateMsg.textContent =
        "The cards have already spoken for you today, dear one. Their voices grow quiet once a reading has been given — they must rest, and so must you. Return to me tomorrow, when the veil has turned again, and we shall see what new light the deck carries.";
    } else {
      beginBtn.style.display = "";
      gate.style.display = "none";
      if (gateMsg) gateMsg.textContent = "";
    }
  }

  // ---------- Anthropic call (via server proxy) ----------
  async function askMadame({ userPrompt, maxTokens = 600 }) {
    const res = await fetch(MADAME_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: userPrompt, max_tokens: maxTokens })
    });

    if (!res.ok) {
      // Read once as text, then try to parse. This lets us surface BOTH
      // our proxy's JSON `error` field AND (when the body isn't JSON —
      // e.g. Cloudflare returning its own 405/403/524 page) a truncated
      // snippet of whatever came back, which is very useful for
      // diagnosing routing problems.
      let msg = `HTTP ${res.status}`;
      let raw = "";
      try { raw = await res.text(); } catch {}
      if (raw) {
        try {
          const errBody = JSON.parse(raw);
          if (errBody?.error) msg = errBody.error;
        } catch {
          // Not JSON — include a short, sanitized snippet in the error
          const snippet = raw
            .replace(/<[^>]+>/g, " ")      // strip HTML tags
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 140);
          if (snippet) msg = `HTTP ${res.status} — ${snippet}`;
        }
      }
      if (res.status === 429) msg = "The cards need a moment — too many readings just now. Try again in a bit.";
      throw new Error(msg);
    }

    const data = await res.json();
    const cleaned = scrubMadameText((data?.text || "").trim());
    return cleaned || "…the cards are silent just now.";
  }

  // Belt-and-suspenders: even though the system prompt forbids stage
  // directions and asterisks, occasionally a model slips. Strip any
  // *…* spans (treated as scene directions / italics) and any stray
  // lone asterisks before the text reaches the bubble. This way the
  // seeker never sees literal "*adjusts the crystal*" or stray "*".
  function scrubMadameText(text) {
    if (!text) return text;
    return text
      // remove "*scene-direction*" or "*emphasis*" entirely
      .replace(/\*[^*\n]+\*/g, "")
      // strip any remaining stray asterisks
      .replace(/\*+/g, "")
      // tidy up whitespace left behind
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([,.;:!?])/g, "$1")
      // collapse 3+ newlines to a single blank line; collapse 2 to one
      // so the pre-wrap summary doesn't show big blank gaps
      .replace(/\n{3,}/g, "\n")
      .replace(/\n{2}/g, "\n")
      .trim();
  }

  // Friendly wrapper that streams reply into a bubble element, with fallback on error.
  // If `fallback` is a function, it receives the error message so the fallback
  // copy can surface *why* Madame went silent — useful while we are still
  // diagnosing timeouts, rate-limits, and proxy errors.
  async function madameSays(bubbleEl, userPrompt, { maxTokens = 600, fallback } = {}) {
    state.waitingForMadame = true;
    bubbleEl.classList.remove("typing");
    bubbleEl.innerHTML = thinkingHTML();
    try {
      const reply = await askMadame({ userPrompt, maxTokens });
      bubbleEl.textContent = "";
      await typeOut(bubbleEl, reply);
      return reply;
    } catch (err) {
      const msg = err?.message || "something went dark";
      // Surface the real cause in devtools so we can diagnose post-mortem.
      console.error("[Madame Celandra] /api/madame failed:", err);
      const fb = typeof fallback === "function"
        ? fallback(msg)
        : (fallback || defaultFallback(msg));
      bubbleEl.textContent = "";
      await typeOut(bubbleEl, fb);
      return fb;
    } finally {
      state.waitingForMadame = false;
    }
  }

  function defaultFallback(errMsg) {
    return "The veil grows thick tonight — the spirits mutter but do not speak plainly. (" + errMsg + ")";
  }

  // ---------- card drawing ----------
  // Fisher-Yates shuffle of indices, then just draw one-by-one ensuring no repeats.
  function drawRandomCard() {
    const taken = new Set(state.draws.map((d) => d.card.name));
    let pool = TAROT_DECK.filter((c) => !taken.has(c.name));
    const card = pool[Math.floor(Math.random() * pool.length)];
    const reversed = Math.random() < 0.45; // slight bias toward upright
    return { card, reversed };
  }

  // ---------- rendering a drawn card face ----------
  // The card face shows ONLY the art (or a stylized fallback). The card name
  // and any reversed indicator are rendered in labels outside the card so
  // they never obscure the image.
  function renderCardFace(frontEl, card) {
    frontEl.classList.remove("fallback");
    frontEl.innerHTML = "";
    const img = document.createElement("img");
    img.src = card.img;
    img.alt = card.name;
    img.referrerPolicy = "no-referrer";
    img.onerror = () => {
      // Art wouldn't load — stylized placeholder (still image-only, no overlaid name)
      frontEl.classList.add("fallback");
      frontEl.innerHTML = `
        <div class="ph">
          <div class="sym">${suitSymbol(card)}</div>
        </div>
      `;
    };
    frontEl.appendChild(img);
  }
  // Custom deck has no suit — use the card's image filename as a rough proxy
  // so the fallback placeholder shows something more meaningful than a generic star.
  function suitSymbol(card) {
    const img = (card?.img || "").toLowerCase();
    if (/fire|dragon|sun|destruction/.test(img))  return "🜂"; // fire
    if (/water|moon|ice|famine/.test(img))         return "🜄"; // water
    if (/air|hawk|wind/.test(img))                 return "🜁"; // air
    if (/earth|castle|emperor/.test(img))          return "🜃"; // earth
    return "✦"; // everything else — witch, wolf, deity, time, etc.
  }

  // ---------- position / orientation guidance ----------
  // These feed into the per-card prompt so every reading leans on *where*
  // the card sits in the spread, not just what the card classically means.
  function positionGuidance(pos) {
    switch (pos) {
      case "The Past":
        return "THE PAST is the soil: speak of what has already shaped the seeker — habits, old choices, inherited weather, the mood they walked in with. Not nostalgia — the roots of the question.";
      case "The Present":
        return "THE PRESENT is the crossing: speak of what is alive in them right now — the pressure, the tension, the current they are standing in as they ask. This is the card that meets them where they are.";
      case "The Future":
        return "THE FUTURE is what is forming, not prophecy: speak of the direction the present is leaning toward if the seeker keeps walking as they are. A possibility, a tendency, a weather front — not a verdict.";
      default:
        return "";
    }
  }
  function orientationGuidance(reversed) {
    return reversed
      ? "The card is INVERTED — its force is softened, delayed, turned inward, partly blocked, or expressed shadow-side. Thread that specific quality through the reading. Do not give the upright meaning with a caveat; speak the inverted meaning on its own terms."
      : "The card is UPRIGHT — its force arrives directly, in its native voice. Let that clarity be felt.";
  }

  // ---------- screen-specific wiring ----------

  // 1) start
  function wireStart() {
    $("#begin-btn").addEventListener("click", async () => {
      // Re-check at click time in case midnight rolled over mid-session.
      if (hasReadingToday()) {
        applyStartGate();
        return;
      }
      resetReading();
      await goToQuestion();
    });
  }

  function resetReading() {
    state.question = "";
    state.draws = [];
    state.currentDraw = 0;
    state.summary = "";
  }

  // 2) question
  async function goToQuestion() {
    showScreen("question-screen");

    // reset UI — including any state left from a prior reading,
    // since "Begin Again" routes back through here without a full reload.
    $("#question-input").value = "";
    $("#q-input-wrap").style.display = "flex";
    $("#shuffle-stage").classList.remove("active");
    $("#continue-to-cards-row").style.display = "none";
    $("#ask-btn").disabled = false;
    const continueBtn = $("#continue-to-cards");
    if (continueBtn) continueBtn.disabled = false;
    const intro = $("#madame-intro");

    // Greet via API
    await madameSays(
      intro,
      `Greet the seeker as they arrive at your parlor for a three-card reading. Invite them in one short breath to share what weighs on their mind. Keep it warm and to about 25 words.`,
      { maxTokens: 220, fallback: "Welcome, seeker. Settle yourself — the candles have caught the evening's draft. Tell me: what weighs upon you tonight?" }
    );
  }

  function wireQuestion() {
    $("#ask-btn").addEventListener("click", onAsk);
    $("#question-input").addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onAsk();
    });
    $("#continue-to-cards").addEventListener("click", () => goToCardScreen());
  }

  async function onAsk() {
    const q = $("#question-input").value.trim();
    if (!q) {
      $("#question-input").focus();
      return;
    }
    state.question = q;

    // hide input, show response-in-progress in the same bubble
    $("#q-input-wrap").style.display = "none";
    $("#ask-btn").disabled = true;

    // Shuffle visual runs alongside Madame's reply.
    $("#shuffle-stage").classList.add("active");

    const intro = $("#madame-intro");
    await madameSays(
      intro,
      `The seeker has just shared this with you:\n\n"""${q}"""\n\nAcknowledge what they said warmly in your own words, reflect briefly what you heard, and tell them you'll shuffle the cards. Keep it to about 30 words. Do NOT yet give any tarot interpretation.`,
      { maxTokens: 240, fallback: "I hear you — and I feel the weight of what you carry. Breathe with me. I shall shuffle the cards now; hold your question close." }
    );

    // Madame is done — show the continue button now.
    const continueRow = $("#continue-to-cards-row");
    const continueBtn = $("#continue-to-cards");
    continueRow.style.display = "flex";
    continueBtn.disabled = false;
  }

  // 3) card select
  async function goToCardScreen() {
    state.currentDraw = 0;
    showScreen("card-screen");
    resetCardUI();
    updateCardHeading();
    updateDots();
  }

  function resetCardUI() {
    $("#deck").style.display = "block";
    $("#deck").classList.add("idle");
    $("#pick-prompt").style.display = "block";
    $("#drawn-card").style.display = "none";
    $("#drawn-card").classList.remove("flipped", "reversed");
    const label = $("#drawn-card-label");
    if (label) {
      label.style.display = "none";
      label.classList.remove("is-reversed");
      label.querySelector(".cl-name").textContent = "";
    }
    $("#card-interp-wrap").style.display = "none";
    $("#card-continue-row").style.display = "none";
    $("#card-interp").textContent = "";
  }

  function updateCardHeading() {
    $("#card-heading").textContent = POSITIONS[state.currentDraw];
    $("#step-count").textContent = `Card ${state.currentDraw + 1} of 3 · ${POSITIONS[state.currentDraw]}`;
  }

  function updateDots() {
    const dots = $$("#drawn-dots .drawn-dot");
    dots.forEach((d, i) => d.classList.toggle("filled", i < state.draws.length));
  }

  function wireCardScreen() {
    const deck = $("#deck");
    deck.addEventListener("click", onDrawCard);
    deck.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDrawCard(); }
    });
    $("#card-continue-btn").addEventListener("click", onCardContinue);
  }

  async function onDrawCard() {
    const deck = $("#deck");
    if (deck.style.display === "none") return; // already drawn

    const { card, reversed } = drawRandomCard();
    state.draws.push({ card, reversed, interpretation: "" });

    // render the card face — art only, no overlays
    const frontEl = $("#drawn-card-front");
    renderCardFace(frontEl, card);

    // hide deck, show card (still showing back)
    deck.classList.remove("idle");
    deck.style.display = "none";
    $("#pick-prompt").style.display = "none";
    const cardEl = $("#drawn-card");
    cardEl.style.display = "block";
    cardEl.classList.remove("flipped", "reversed");

    // small pause, then flip
    await sleep(300);
    if (reversed) cardEl.classList.add("reversed");
    cardEl.classList.add("flipped");

    // populate and reveal the label below the card (never on top of it)
    const labelEl = $("#drawn-card-label");
    labelEl.querySelector(".cl-name").textContent = card.name;
    labelEl.classList.toggle("is-reversed", reversed);
    labelEl.style.display = "flex";

    // after flip, show Madame's interpretation
    await sleep(950);
    $("#card-interp-wrap").style.display = "flex";
    const pos = POSITIONS[state.currentDraw];
    const orient = reversed ? "inverted" : "upright";
    const classical = reversed ? card.reversed : card.upright;

    const cardPrompt = `
The seeker's question, in their own words:
"""${state.question}"""

They have just turned a single card for the position of ${pos}.
Card: ${card.name}
Orientation: ${orient}
Classical ${orient} meaning: ${classical}.

${positionGuidance(pos)}

${orientationGuidance(reversed)}

Write EXACTLY TWO sentences of flowing prose. No headers. No more, no less.

SENTENCE 1: Summarize what ${card.name} ${orient} signifies in "${pos}" — its core meaning in plain, lyrical language. No jargon.

SENTENCE 2: Interpret that meaning DIRECTLY against what the seeker actually wrote above. Reference a specific detail from their question and show how this card, in this position and this orientation, speaks to the particular situation they brought you.

Banned phrases (do not use, even paraphrased): "trust the journey", "honor the pattern", "the cards reveal", "the universe whispers", "may you find", "remember to", "take this as", "the path unfolds", "embrace the".

Do not forecast or mention the other two cards — they have not been drawn yet. Do not close with a stock blessing; your final sentence must belong uniquely to THIS seeker's question + this card + this position + this orientation.
    `.trim();

    const interp = await madameSays(
      $("#card-interp"),
      cardPrompt,
      {
        maxTokens: 160,
        fallback: singleCardFallback({ card, reversed, pos, classical })
      }
    );
    state.draws[state.draws.length - 1].interpretation = interp;
    updateDots();

    $("#card-continue-row").style.display = "flex";
  }

  async function onCardContinue() {
    state.currentDraw += 1;
    if (state.currentDraw >= 3) {
      // Brief in-character beat — show a transitional message in Madame's
      // bubble while the summary screen loads, so the jump doesn't feel abrupt.
      const interpEl = $("#card-interp");
      $("#card-continue-row").style.display = "none";
      await typeOut(interpEl, "All three cards now lie before us. Let me weave what they say together…");
      await sleep(600);
      await goToSummary();
      return;
    }
    resetCardUI();
    updateCardHeading();
  }

  // 4) summary
  async function goToSummary() {
    showScreen("summary-screen");
    renderSummaryCards();

    const cardSummary = state.draws.map((d, i) => {
      const orient = d.reversed ? "inverted" : "upright";
      return `- ${POSITIONS[i]}: ${d.card.name} (${orient})`;
    }).join("\n");

    // Compact card-meanings block instead of re-sending the full per-card
    // interpretations. The model gets the classical meanings and can build
    // a fresh synthesis tailored to THIS question, and the prompt stays
    // well under the proxy's 12000-char ceiling.
    const cardMeanings = state.draws.map((d, i) => {
      const orient = d.reversed ? "inverted" : "upright";
      const m = d.reversed ? d.card.reversed : d.card.upright;
      return `- ${POSITIONS[i]} — ${d.card.name} (${orient}): ${m}`;
    }).join("\n");

    const prompt = `
The seeker asked you, in their own words:
"""${state.question}"""

They drew (Past / Present / Future):
${cardMeanings}

Give this seeker a final reading of ~140–170 words, flowing prose, written unmistakably about THIS question.

CRITICAL: ANSWER THEIR QUESTION. They came to a tarot reader for a tarot
reader's answer. Do not deflect, do not redirect them to "the present
moment," do not tell them the question matters less than the journey,
do not suggest they release the need to know. Use the cards to give a
verdict. Examples of the right voice:
  • "When will I die?" → "The cards foretell a long and fruitful life"
    or "longevity may not be your fate" or "not soon — but not as far
    as you fear, either."
  • "Will I get the job?" → "Yes, but not the one you are bracing for"
    or "the cards do not show this door opening."
  • "Does she love me?" → "She does — but you are asking the wrong
    question; the cards say it is your love that wavers."
You may soften a hard answer with care; you may not soften it into
nothing. If the cards lean one way, lean with them.

Structure:
1. Open by naming, briefly, the specific situation or feeling you heard in their question. That thread must run through every sentence.
2. Move through the cards in order — past, present, future — naming each as you arrive and showing how it speaks to the particular circumstance THEY brought you. Build them into one arc, not three paragraphs.
3. Close with the cards' ANSWER to the seeker's question — concrete, specific, in the fortune-teller's voice. Lean. Don't hedge into vapor.

Hard bans (do not use, even paraphrased): "trust the journey", "honor the pattern", "the cards reveal", "the universe whispers", "patterns not prophecy", "may you find", "embrace the", "the path unfolds", "live in the present", "stay in the now", "the question matters less than", "don't dwell on", "rather than asking when", "release the need to know", "what truly matters is". No headers, no bullets.

Speak as Madame Celandra — warm, lyrical, specific, willing to give the cards' verdict. Be SUCCINCT.
    `.trim();

    // The summary text is rendered as a normal Madame dialog bubble.
    // madameSays() shows the thinking dots while waiting for the model.
    const text = await madameSays(
      $("#summary-text"),
      prompt,
      {
        maxTokens: 600,
        fallback: (errMsg) => buildFallbackSummary(errMsg)
      }
    );
    state.summary = text;
    // The reading has now been delivered — lock this seeker out for the rest of the day.
    markReadingCompleteToday();
  }

  // Fallback for a single-card interpretation — only fires when the proxy
  // can't be reached. Uses position + orientation so the copy differs by draw.
  function singleCardFallback({ card, reversed, pos, classical }) {
    const name = card.name + (reversed ? ", inverted," : "");
    if (pos === "The Past") {
      return reversed
        ? `${name} rests in the soil you came from — ${classical}. What once turned against you is still echoing, but quieter now than when it first arrived.`
        : `In the ground beneath you, ${name} speaks plainly — ${classical}. That is the weather you walked in with; it shaped the question you bring tonight.`;
    }
    if (pos === "The Present") {
      return reversed
        ? `At this crossing, ${name} holds its breath — ${classical}. The current has not stopped, only turned inward; notice where it catches on you.`
        : `Right here, right now, ${name} meets you face-to-face — ${classical}. This is the room you are standing in as you ask.`;
    }
    // Future
    return reversed
      ? `Ahead, ${name} gathers in slow light — ${classical}. It does not arrive on schedule; it arrives in a mood. Watch for it at the edges.`
      : `Up the road, ${name} is forming — ${classical}. Not a promise, but a direction the present is already leaning toward.`;
  }

  function buildFallbackSummary(errMsg = "") {
    // Log the real cause for debugging; never surface it to the seeker.
    if (errMsg) console.error("[Madame Celandra] Summary fallback triggered:", errMsg);
    const lines = state.draws.map((d, i) => {
      const o = d.reversed ? "inverted" : "upright";
      const m = d.reversed ? d.card.reversed : d.card.upright;
      return `${POSITIONS[i]} — ${d.card.name} (${o}): ${m}.`;
    }).join("\n\n");
    return `The veil is thick tonight and my words do not travel far. Still — I will not send you away empty-handed. Your cards stand thus:\n\n${lines}\n\nSit with them a moment, and return to me when the mist has lifted, so that I may speak of your question in full.`;
  }

  function renderSummaryCards() {
    const row = $("#summary-cards");
    row.innerHTML = "";
    state.draws.forEach((d, i) => {
      const mini = document.createElement("div");
      mini.className = "mini-card";

      const cardWrap = document.createElement("div");
      cardWrap.className = "card flipped" + (d.reversed ? " reversed" : "");
      cardWrap.innerHTML = `
        <div class="card-inner">
          <div class="card-face card-back"></div>
          <div class="card-face card-front"></div>
        </div>
      `;
      const front = cardWrap.querySelector(".card-front");
      renderCardFace(front, d.card);

      const pos = document.createElement("div");
      pos.className = "position";
      pos.textContent = POSITIONS[i];

      const nm = document.createElement("div");
      nm.className = "cname";
      nm.innerHTML = d.card.name + (d.reversed ? `<span class="rev">inverted</span>` : "");

      mini.appendChild(pos);
      mini.appendChild(cardWrap);
      mini.appendChild(nm);
      row.appendChild(mini);
    });
  }

  function wireSummary() {
    $("#restart-btn").addEventListener("click", () => {
      resetReading();
      applyStartGate();            // they've read today — the gate will now be showing
      showScreen("start-screen");
    });
    $("#download-btn").addEventListener("click", downloadPDF);
  }

  // ---------- PDF export ----------
  async function downloadPDF() {
    const btn = $("#download-btn");
    const oldLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Preparing…";

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const MARGIN = 48;

      // Background — a richer plum than the flat #120524 used in the
      // game's CSS variable, since the on-page purple is built up by
      // layered radial gradients we can't reproduce in jsPDF. This base
      // skews toward violet so the page reads unmistakably purple
      // rather than blue-black on cool screens.
      doc.setFillColor(36, 16, 56); // #241038 — deep plum
      doc.rect(0, 0, W, H, "F");
      // gold border
      doc.setDrawColor(217, 180, 74);
      doc.setLineWidth(1.2);
      doc.rect(MARGIN / 2, MARGIN / 2, W - MARGIN, H - MARGIN);

      // Title
      doc.setTextColor(217, 180, 74);
      doc.setFont("times", "bold");
      doc.setFontSize(28);
      doc.text("Madame Celandra", W / 2, MARGIN + 20, { align: "center" });
      doc.setFont("times", "italic");
      doc.setFontSize(13);
      doc.text("— a tarot reading —", W / 2, MARGIN + 40, { align: "center" });

      // Date
      doc.setTextColor(243, 231, 200);
      doc.setFont("times", "normal");
      doc.setFontSize(10);
      const dateStr = new Date().toLocaleDateString(undefined, { year:"numeric", month:"long", day:"numeric" });
      doc.text(dateStr, W / 2, MARGIN + 58, { align: "center" });

      // Question
      doc.setFontSize(12);
      doc.setTextColor(255, 216, 122);
      doc.setFont("times", "bold");
      doc.text("Your question", MARGIN, MARGIN + 88);
      doc.setFont("times", "italic");
      doc.setTextColor(243, 231, 200);
      const qLines = doc.splitTextToSize(state.question || "(no question was spoken)", W - MARGIN * 2);
      doc.text(qLines, MARGIN, MARGIN + 104);

      // Cards row — each card sits between two captions:
      //   above: the position label (PAST / PRESENT / FUTURE) in gold caps
      //   below: the card's name (italic gold), with "(inverted)" if so
      // This mirrors how the cards are presented in the game itself.
      const POS_LABEL_H  = 16;  // gold caps caption above each card
      const NAME_LABEL_H = 18;  // italic name + inverted tag below each card
      const cardW = 110;
      const cardH = 176;
      const gap = (W - MARGIN * 2 - cardW * 3) / 2;
      const rowTop = MARGIN + 104 + qLines.length * 14 + 22;
      const cardTop = rowTop + POS_LABEL_H;

      for (let i = 0; i < state.draws.length; i++) {
        const d = state.draws[i];
        const x = MARGIN + i * (cardW + gap);
        const cx = x + cardW / 2;

        // POSITION label above the card — uppercase gold caps
        doc.setFont("times", "bold");
        doc.setFontSize(9);
        doc.setTextColor(217, 180, 74);
        doc.text(POSITIONS[i].toUpperCase(), cx, rowTop + 11, { align: "center" });

        // parchment-colored frame with a thin gold border
        doc.setDrawColor(217, 180, 74);
        doc.setLineWidth(0.8);
        doc.setFillColor(243, 231, 200);
        doc.rect(x, cardTop, cardW, cardH, "FD");

        // try to drop the card image on top of the frame; if it fails
        // (CORS, network, etc.) we silently leave the empty frame.
        try {
          let dataURL = await fetchImageAsDataURL(d.card.img);
          if (dataURL && d.reversed) {
            dataURL = await rotate180DataURL(dataURL);
          }
          if (dataURL) {
            doc.addImage(dataURL, "PNG", x, cardTop, cardW, cardH, undefined, "FAST");
          }
        } catch {
          /* image unavailable — leave the parchment frame untouched */
        }

        // CARD NAME caption below the card — italic gold, with the
        // inverted indicator appended in a slightly dimmer ink so the
        // name itself remains the dominant element.
        const nameY = cardTop + cardH + 13;
        doc.setFont("times", "italic");
        doc.setFontSize(11);
        doc.setTextColor(255, 216, 122);
        if (d.reversed) {
          // measure the name so we can right-pad an "(inverted)" tag
          const nameW = doc.getTextWidth(d.card.name);
          const tagText = " (inverted)";
          doc.setFontSize(9);
          const tagW = doc.getTextWidth(tagText);
          doc.setFontSize(11);
          const totalW = nameW + tagW;
          const startX = cx - totalW / 2;
          doc.text(d.card.name, startX, nameY);
          doc.setFont("times", "italic");
          doc.setFontSize(9);
          doc.setTextColor(217, 180, 74);
          doc.text(tagText, startX + nameW, nameY);
        } else {
          doc.text(d.card.name, cx, nameY, { align: "center" });
        }
      }

      // Reading text — sits below the cards AND below the name labels.
      const textTop = cardTop + cardH + NAME_LABEL_H + 22;
      doc.setFont("times", "bold");
      doc.setFontSize(13);
      doc.setTextColor(255, 216, 122);
      doc.text("Madame Celandra's reading", MARGIN, textTop);

      doc.setFont("times", "normal");
      doc.setFontSize(11);
      doc.setTextColor(243, 231, 200);
      const body = state.summary || "(no reading was given)";
      const cleaned = body.replace(/\*([^*]+)\*/g, "$1"); // strip *italic* markers
      const lines = doc.splitTextToSize(cleaned, W - MARGIN * 2);

      let y = textTop + 20;
      const lineH = 16;
      const bottomLimit = H - MARGIN - 20;
      for (const line of lines) {
        if (y > bottomLimit) {
          doc.addPage();
          // redraw page bg + border (same plum as page 1)
          doc.setFillColor(36, 16, 56);
          doc.rect(0, 0, W, H, "F");
          doc.setDrawColor(217, 180, 74);
          doc.setLineWidth(1.2);
          doc.rect(MARGIN / 2, MARGIN / 2, W - MARGIN, H - MARGIN);
          doc.setFont("times", "normal");
          doc.setFontSize(11);
          doc.setTextColor(243, 231, 200);
          y = MARGIN + 20;
        }
        doc.text(line, MARGIN, y);
        y += lineH;
      }

      // Footer
      doc.setFont("times", "italic");
      doc.setFontSize(9);
      doc.setTextColor(217, 180, 74);
      doc.text("— may the cards walk softly with you —", W / 2, H - MARGIN / 2 - 2, { align: "center" });

      const d = new Date();
      const stamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      doc.save(`madame-celandra-${stamp}.pdf`);
    } catch (err) {
      console.error(err);
      alert("I could not seal the reading to parchment: " + (err?.message || "unknown error"));
    } finally {
      btn.disabled = false;
      btn.textContent = oldLabel;
    }
  }

  // Rotate an image data URL 180° via an offscreen canvas
  function rotate180DataURL(dataURL) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.translate(canvas.width, canvas.height);
        ctx.rotate(Math.PI);
        ctx.drawImage(img, 0, 0);
        try {
          resolve(canvas.toDataURL("image/png"));
        } catch {
          resolve(dataURL); // tainted canvas fallback — return original
        }
      };
      img.onerror = () => resolve(dataURL);
      img.src = dataURL;
    });
  }

  // Fetch a remote image and convert it to a base64 data URL (for jsPDF).
  const imgCache = new Map();
  async function fetchImageAsDataURL(url) {
    if (imgCache.has(url)) return imgCache.get(url);
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const blob = await res.blob();
      const dataURL = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
      imgCache.set(url, dataURL);
      return dataURL;
    } catch (err) {
      imgCache.set(url, null);
      return null;
    }
  }

  // ---------- boot ----------
  function init() {
    wireStart();
    wireQuestion();
    wireCardScreen();
    wireSummary();
    applyStartGate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
