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
  // Temporarily off while the game is being built — flip back to true to
  // re-enable the one-reading-per-day gate.
  const DAILY_LIMIT_ENABLED = false;

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

  async function typeOut(el, text, speed = 18) {
    el.classList.add("typing");
    el.textContent = "";
    for (let i = 0; i < text.length; i++) {
      el.textContent += text[i];
      // slightly slower on punctuation, faster on spaces
      const ch = text[i];
      let delay = speed;
      if (ch === "," || ch === ";") delay = 180;
      else if (ch === "." || ch === "?" || ch === "!") delay = 260;
      else if (ch === " ") delay = speed * 0.6;
      await sleep(delay + (Math.random() * 10 - 5));
    }
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
      // remove "*scene-direction*" or "*emphasis*" entirely — the model
      // shouldn't be using these at all, so dropping them keeps the prose
      // clean even when something slips through.
      .replace(/\*[^*\n]+\*/g, "")
      // strip any remaining stray asterisks
      .replace(/\*+/g, "")
      // tidy up the whitespace left behind by the strips above
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([,.;:!?])/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
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
          <div class="sym">${suitSymbol(card.suit)}</div>
        </div>
      `;
    };
    frontEl.appendChild(img);
  }
  function suitSymbol(suit) {
    switch (suit) {
      case "wands":     return "🜂"; // fire alchemical
      case "cups":      return "🜄"; // water alchemical
      case "swords":    return "🜁"; // air alchemical
      case "pentacles": return "🜃"; // earth alchemical
      default:          return "✦";
    }
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
      ? "The card is REVERSED — its force is softened, delayed, turned inward, partly blocked, or expressed shadow-side. Thread that specific quality through the reading. Do not give the upright meaning with a caveat; speak the reversed meaning on its own terms."
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

    // reset UI
    $("#question-input").value = "";
    $("#q-input-wrap").style.display = "flex";
    $("#shuffle-stage").classList.remove("active");
    $("#continue-to-cards-row").style.display = "none";
    const intro = $("#madame-intro");

    // Greet via API
    await madameSays(
      intro,
      `Greet the seeker as they arrive at your parlor for a three-card reading. Invite them to share what weighs on their mind — a question, a worry, or a curiosity. Keep your greeting warm and to about 45 words.`,
      { maxTokens: 300, fallback: "Welcome, seeker. Settle yourself — the candles have caught the evening's draft. Tell me now: what weighs upon you tonight? Speak it plainly, and we shall let the cards answer in their quiet way." }
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

    const intro = $("#madame-intro");
    await madameSays(
      intro,
      `The seeker has just shared this with you:\n\n"""${q}"""\n\nAcknowledge what they've said warmly, in your own words — reflect briefly what you've heard. Then say you will shuffle the cards and ask them to breathe with you for a moment. Keep it to about 60 words. Do not yet give any tarot interpretation.`,
      { maxTokens: 350, fallback: "I hear you — and I feel the weight of what you carry. Breathe with me now. I shall shuffle the cards; let the question linger in your mind like the scent of smoke, and when you are ready, we shall turn them over together." }
    );

    // kick off the shuffle animation
    $("#shuffle-stage").classList.add("active");
    await sleep(2600);
    $("#continue-to-cards-row").style.display = "flex";
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
    const orient = reversed ? "reversed" : "upright";
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

Write ~80–100 words of flowing prose in TWO movements, no headers:

MOVEMENT 1 (about 2 sentences): Briefly name what ${card.name} ${orient} classically signifies — its core symbolism and what it tends to speak about when it appears in "${pos}". Use plain, lyrical language; no jargon.

MOVEMENT 2 (the rest of the passage): Bring that meaning DIRECTLY against what the seeker actually wrote above. Quote or paraphrase a specific detail from their question. Show how this card, in this position and this orientation, reflects or answers the particular situation they brought you. The reading must feel written for THEM and no one else — a stranger reading your response should be able to guess roughly what they asked.

Banned phrases (do not use, even paraphrased): "trust the journey", "honor the pattern", "the cards reveal", "the universe whispers", "may you find", "remember to", "take this as", "the path unfolds", "embrace the".

Do not forecast or mention the other two cards — they have not been drawn yet. Do not close with a stock blessing; your final sentence must belong uniquely to THIS seeker's question + this card + this position + this orientation.
    `.trim();

    const interp = await madameSays(
      $("#card-interp"),
      cardPrompt,
      {
        maxTokens: 400,
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
      const orient = d.reversed ? "reversed" : "upright";
      return `- ${POSITIONS[i]}: ${d.card.name} (${orient})`;
    }).join("\n");

    // Compact card-meanings block instead of re-sending the full per-card
    // interpretations. The model gets the classical meanings and can build
    // a fresh synthesis tailored to THIS question, and the prompt stays
    // well under the proxy's 12000-char ceiling.
    const cardMeanings = state.draws.map((d, i) => {
      const orient = d.reversed ? "reversed" : "upright";
      const m = d.reversed ? d.card.reversed : d.card.upright;
      return `- ${POSITIONS[i]} — ${d.card.name} (${orient}): ${m}`;
    }).join("\n");

    const prompt = `
The seeker asked you, in their own words:
"""${state.question}"""

They drew (Past / Present / Future):
${cardMeanings}

Give this seeker a final reading of ~220–280 words, flowing prose, written unmistakably about THIS question.

Structure:
1. Open by naming, in your own words, the specific situation or feeling you heard in their question. That thread must run through every sentence.
2. Move through the cards in order — past, present, future — naming each as you arrive and showing how its symbolism speaks to the particular circumstance THEY brought you. Build them into one arc, not three paragraphs.
3. Close with one concrete, grounded piece of counsel that DIRECTLY addresses their concern. If it was a decision, lean one way while honoring their agency. If a worry, name what to watch for. If a longing, name what it is asking of them. No generic benedictions.

Hard bans (do not use, even paraphrased): "trust the journey", "honor the pattern", "the cards reveal", "the universe whispers", "patterns not prophecy", "may you find", "embrace the", "the path unfolds". No headers, no bullets.

Speak as Madame Celandra — warm, lyrical, specific.
    `.trim();

    // The summary text is now rendered as a normal Madame dialog bubble —
    // no separate "She weaves…" intro box anymore. madameSays() will show
    // the thinking dots in the bubble while it waits for the model.
    const text = await madameSays(
      $("#summary-text"),
      prompt,
      {
        maxTokens: 900,
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
    // Only fires when the proxy is unreachable or returns an error. We now
    // surface the underlying reason inline so we can actually diagnose
    // why Madame went silent during summary generation.
    const lines = state.draws.map((d, i) => {
      const o = d.reversed ? "reversed" : "upright";
      const m = d.reversed ? d.card.reversed : d.card.upright;
      return `${POSITIONS[i]} — *${d.card.name}* (${o}): ${m}.`;
    }).join("\n\n");
    const why = errMsg ? `\n\n(The spirits stumbled on: ${errMsg})` : "";
    return `The veil is thick tonight and my words do not travel far. Still — I will not send you away empty-handed. Your cards stand thus:\n\n${lines}\n\nSit with them a moment, and return to me when the mist has lifted, so that I may speak of your question in full.${why}`;
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
      nm.innerHTML = d.card.name + (d.reversed ? `<span class="rev">reversed</span>` : "");

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

      // Background
      doc.setFillColor(18, 5, 36); // deep purple
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

      // Cards row
      const rowTop = MARGIN + 104 + qLines.length * 14 + 18;
      const cardW = 110;
      const cardH = 176;
      const gap = (W - MARGIN * 2 - cardW * 3) / 2;

      // Cards are rendered as IMAGES ONLY — no position labels, no card
      // name captions, no fallback symbol/text. If an image can't be
      // loaded, the parchment-colored frame is left empty so nothing
      // ugly bleeds into the layout.
      for (let i = 0; i < state.draws.length; i++) {
        const d = state.draws[i];
        const x = MARGIN + i * (cardW + gap);
        const y = rowTop;

        // parchment-colored frame with a thin gold border
        doc.setDrawColor(217, 180, 74);
        doc.setLineWidth(0.8);
        doc.setFillColor(243, 231, 200);
        doc.rect(x, y, cardW, cardH, "FD");

        // try to drop the card image on top of the frame; if it fails
        // (CORS, network, etc.) we silently leave the empty frame.
        try {
          let dataURL = await fetchImageAsDataURL(d.card.img);
          if (dataURL && d.reversed) {
            dataURL = await rotate180DataURL(dataURL);
          }
          if (dataURL) {
            doc.addImage(dataURL, "JPEG", x, y, cardW, cardH, undefined, "FAST");
          }
        } catch {
          /* image unavailable — leave the parchment frame untouched */
        }
      }

      // Reading text — sits just below the cards (no captions in between)
      const textTop = rowTop + cardH + 24;
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
          // redraw page bg + border
          doc.setFillColor(18, 5, 36);
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

      doc.save(`madame-celandra-reading-${Date.now()}.pdf`);
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
          resolve(canvas.toDataURL("image/jpeg", 0.9));
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
