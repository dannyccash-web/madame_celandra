# Madame Celandra

A mystical tarot reading game playable in the browser, powered by Claude behind the scenes.

## Project layout

```
.
├── index.html                              # entry point
├── styles.css                              # dark-purple/gold mystical theme
├── cards.js                                # full 78-card Rider-Waite deck
├── game.js                                 # game logic + call to /api/madame
├── madame_celandra_start_background.png    # start-screen parlor art
├── madame_celandra_select_background.png   # card-select parlor art
├── madame_celandra_table.png               # tarot table
├── madame_celandre.png                     # Madame's portrait
└── functions/
    └── api/
        └── madame.js                       # Cloudflare Pages Function (proxy to Anthropic)
```

The game is a fully static site. The *only* server-side piece is `functions/api/madame.js` — a
Cloudflare Pages Function that holds your Anthropic API key as an environment variable and
forwards chat requests from the browser.

## Deploying to Cloudflare Pages

### 1. Connect the repo

1. Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com/).
2. Go to **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Authorize Cloudflare to access GitHub and pick the `dannyccash-web/madame_celandra` repo.
4. On the **Set up builds and deployments** screen:
   - **Framework preset:** *None*
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/` (the repo root)
5. Click **Save and Deploy**. The first deploy takes about a minute.

Cloudflare will auto-redeploy on every push to `main`.

### 2. Add your Anthropic API key

The Pages Function reads `ANTHROPIC_API_KEY` from its environment.

1. In the Cloudflare dashboard, open your Pages project.
2. Go to **Settings** → **Environment variables** → **Production**.
3. Click **Add variable**:
   - **Variable name:** `ANTHROPIC_API_KEY`
   - **Value:** your Anthropic API key (starts with `sk-ant-`)
   - Check **Encrypt** to store it as a secret.
4. Click **Save** and trigger a redeploy (Deployments tab → latest deploy → **Retry**).

Optional env vars (also under Environment variables):
- `MADAME_MODEL` — override the Claude model (default: `claude-sonnet-4-5-20250929`)
- `MADAME_MAX_TOKENS` — hard ceiling on response size (default: `1500`)

### 3. Add per-IP rate limiting (recommended)

Since the proxy sits on the public internet with your key behind it, you should cap how often
any single visitor can hit it.

1. In the Cloudflare dashboard, open the **domain** your Pages site is attached to (e.g.
   `madame-celandra.pages.dev` or your custom domain).
2. Go to **Security** → **WAF** → **Rate limiting rules** → **Create rule**.
3. Configure:
   - **Rule name:** `madame-api-limit`
   - **If incoming requests match:** set the field to **URI Path** and value to `/api/madame`
   - **When rate exceeds:** e.g. `20 requests per 1 minute` — tune to taste
   - **Then:** *Block* for `10 seconds` (or longer)
4. Click **Deploy**.

Cloudflare's Free plan includes rate-limiting rules — the exact quota is in the sidebar. For
a small hobby project the free tier is plenty.

### 4. (Optional) Custom domain

Pages gives you a free `*.pages.dev` URL automatically. To use your own domain, go to your
Pages project → **Custom domains** → **Set up a custom domain**.

## Running locally

The static game alone opens in any browser (`open index.html`), but the `/api/madame` call
will 404 unless you also run the Pages Function. Cloudflare's Wrangler CLI does this:

```bash
npm install -g wrangler
echo 'ANTHROPIC_API_KEY="sk-ant-..."' > .dev.vars   # never commit this
wrangler pages dev .
```

Then visit http://localhost:8788.

`.dev.vars` is gitignored. Don't share it.

## How the game works

1. **Start screen** — logo and "Begin Reading" button.
2. **Question screen** — the player types what's on their mind; Madame acknowledges it and shuffles the deck.
3. **Card-select screen** — the player taps the deck three times, once for the Past, Present, and Future positions. Each card is drawn at random from the full 78-card deck, with ~45% chance of being reversed. Madame interprets each card in turn.
4. **Summary screen** — Madame weaves all three cards together into a flowing reading tied back to the original question. The reading can be downloaded as a styled PDF.

All Claude responses come through `/api/madame`, which adds the Madame Celandra persona as a
system prompt and forwards to Anthropic using the key from `ANTHROPIC_API_KEY`. The browser
never sees the key.
