// ============================================================
//  Madame Celandra — game logic
// ============================================================

(() => {
  "use strict";

  // ---------- constants ----------
  const POSITIONS = ["The Past", "The Present", "The Future"];
  // The proxy lives at /api/madame — your API key stays on the server.
  const MADAME_URL = "/api/madame";

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

  // ---------- Anthropic call (via server proxy) ----------
  async function askMadame({ userPrompt, maxTokens = 600 }) {
    const res = await fetch(MADAME_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: userPrompt, max_tokens: maxTokens })
    });

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const errBody = await res.json();
        if (errBody?.error) msg = errBody.error;
      } catch {}
      if (res.status === 429) msg = "The cards need a moment — too many readings just now. Try again in a bit.";
      throw new Error(msg);
    }

    const data = await res.json();
    return (data?.text || "").trim() || "…the cards are silent just now.";
  }

  // Friendly wrapper that streams reply into a bubble element, with fallback on error
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
      const fb = fallback || defaultFallback(msg);
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
  function renderCardFace(frontEl, card, { withName = true } = {}) {
    frontEl.classList.remove("fallback");
    frontEl.innerHTML = "";
    const img = document.createElement("img");
    img.src = card.img;
    img.alt = card.name;
    img.referrerPolicy = "no-referrer";
    img.onerror = () => {
      // Fallback to stylized placeholder
      frontEl.classList.add("fallback");
      frontEl.innerHTML = `
        <div class="ph">
          <div class="sym">${suitSymbol(card.suit)}</div>
          <div class="nm">${card.name}</div>
        </div>
      `;
      if (withName) addCardNameLabel(frontEl, card.name);
    };
    frontEl.appendChild(img);
    if (withName) addCardNameLabel(frontEl, card.name);
  }
  function addCardNameLabel(frontEl, name) {
    const label = document.createElement("div");
    label.className = "card-name";
    label.textContent = name;
    frontEl.appendChild(label);
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

  // ---------- screen-specific wiring ----------

  // 1) start
  function wireStart() {
    $("#begin-btn").addEventListener("click", async () => {
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

    // render the card face (still on back)
    const frontEl = $("#drawn-card-front");
    // clear existing content but keep our static children (name + reversed-tag) after rebuild
    // We rebuild fully via renderCardFace — then reattach the reversed-tag.
    renderCardFace(frontEl, card, { withName: true });
    const revTag = document.createElement("div");
    revTag.className = "reversed-tag";
    revTag.textContent = "Reversed";
    frontEl.appendChild(revTag);

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

    // after flip, show Madame's interpretation
    await sleep(950);
    $("#card-interp-wrap").style.display = "flex";
    const pos = POSITIONS[state.currentDraw];
    const orient = reversed ? "reversed" : "upright";
    const interp = await madameSays(
      $("#card-interp"),
      `The seeker asked:\n\n"""${state.question}"""\n\nFor the position of **${pos}**, they drew **${card.name}** (${orient}).\n\nClassical meaning — ${orient === "upright" ? "upright" : "reversed"}: ${orient === "upright" ? card.upright : card.reversed}.\n\nInterpret this single card in this position, relating it to their question. Keep it to about 80 words. Do not yet give the full three-card synthesis — you will do that later.`,
      {
        maxTokens: 400,
        fallback: `The ${card.name}${reversed ? ", turned on its head," : ""} whispers of ${orient === "upright" ? card.upright : card.reversed}. In the place of ${pos.toLowerCase()}, this speaks quietly to what you carry — ${reversed ? "softened, inward, still gathering" : "direct, and close enough to touch"}.`
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

    const prompt = `
The seeker's question was:

"""${state.question}"""

They drew this three-card spread (Past / Present / Future):

${cardSummary}

For reference, your prior single-card readings were:
${state.draws.map((d, i) => `\n${POSITIONS[i]} — ${d.card.name} (${d.reversed ? "reversed" : "upright"}):\n${d.interpretation}`).join("\n")}

Now weave a single flowing reading that ties these three cards together and speaks directly to the seeker's question. Move from past, through present, to future, naming each card as you arrive at it. Close with a gentle, grounded piece of counsel — something the seeker can carry with them. Aim for about 280–350 words. Write in flowing prose. No headers or bullets.
    `.trim();

    $("#summary-intro-line").textContent = "She weaves the threads together…";
    const text = await madameSays(
      $("#summary-text"),
      prompt,
      {
        maxTokens: 1200,
        fallback: buildFallbackSummary()
      }
    );
    state.summary = text;
  }

  function buildFallbackSummary() {
    const lines = state.draws.map((d, i) => {
      const o = d.reversed ? "reversed" : "upright";
      const m = d.reversed ? d.card.reversed : d.card.upright;
      return `${POSITIONS[i]} — *${d.card.name}* (${o}): ${m}.`;
    }).join("\n\n");
    return `The three cards stand before us:\n\n${lines}\n\nTaken together, they ask you to honor where you have been, attend to where you now stand, and keep your gaze soft — not fixed — on what is forming. The cards offer pattern, not prophecy. Carry what feels true; leave the rest at the edge of the table.`;
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
      renderCardFace(front, d.card, { withName: true });

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

      for (let i = 0; i < state.draws.length; i++) {
        const d = state.draws[i];
        const x = MARGIN + i * (cardW + gap);
        const y = rowTop;

        // card frame
        doc.setDrawColor(217, 180, 74);
        doc.setLineWidth(0.8);
        doc.setFillColor(243, 231, 200);
        doc.rect(x, y, cardW, cardH, "FD");

        // image — try to load; if reversed, pre-rotate via canvas for reliability
        try {
          let dataURL = await fetchImageAsDataURL(d.card.img);
          if (dataURL && d.reversed) {
            dataURL = await rotate180DataURL(dataURL);
          }
          if (dataURL) {
            doc.addImage(dataURL, "JPEG", x, y, cardW, cardH, undefined, "FAST");
          } else {
            drawPDFCardFallback(doc, d.card, x, y, cardW, cardH, d.reversed);
          }
        } catch {
          drawPDFCardFallback(doc, d.card, x, y, cardW, cardH, d.reversed);
        }

        // caption: position + card name
        doc.setFont("times", "bold");
        doc.setFontSize(9);
        doc.setTextColor(217, 180, 74);
        doc.text(POSITIONS[i].toUpperCase(), x + cardW / 2, y + cardH + 14, { align: "center" });
        doc.setFont("times", "italic");
        doc.setFontSize(10);
        doc.setTextColor(243, 231, 200);
        const nameLbl = d.card.name + (d.reversed ? " (reversed)" : "");
        doc.text(nameLbl, x + cardW / 2, y + cardH + 28, { align: "center" });
      }

      // Reading text
      const textTop = rowTop + cardH + 50;
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

  function drawPDFCardFallback(doc, card, x, y, w, h, reversed) {
    doc.setFillColor(42, 10, 85);
    doc.rect(x, y, w, h, "F");
    doc.setDrawColor(217, 180, 74);
    doc.setLineWidth(0.8);
    doc.rect(x, y, w, h);
    doc.setTextColor(255, 216, 122);
    doc.setFont("times", "bold");
    doc.setFontSize(24);
    doc.text("✦", x + w / 2, y + h / 2 - 4, { align: "center" });
    doc.setFontSize(10);
    const nm = doc.splitTextToSize(card.name, w - 16);
    doc.text(nm, x + w / 2, y + h / 2 + 18, { align: "center" });
    if (reversed) {
      doc.setFontSize(8);
      doc.setFont("times", "italic");
      doc.text("reversed", x + w / 2, y + h - 10, { align: "center" });
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
