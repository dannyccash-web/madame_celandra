# Madame Celandra — Project Notes

## Repository
- **GitHub:** https://github.com/dannyccash-web/madame_celandra
- **Deploy:** Cloudflare Pages (auto-deploys on push to `main`)
- **Live URL:** https://madame-celandra.pages.dev (or custom domain if configured)

## GitHub token
Stored in `.github_token` (gitignored — never commit the token itself).

## How to push changes (Claude does this — no Terminal needed)
The sandbox can clone/push directly now that the repo is ~9MB. Standard workflow:

```bash
TOKEN=$(cat "/sessions/busy-practical-tesla/mnt/Madame Celandra/.github_token" | tr -d '[:space:]')
REPO="https://${TOKEN}@github.com/dannyccash-web/madame_celandra.git"
cd /tmp && rm -rf mc_push && git clone --depth=1 "$REPO" mc_push
cd mc_push
git config user.email "dannyccash@gmail.com"
git config user.name "Danny Cash"

# --- copy changed files from project folder into clone ---
cp "/sessions/busy-practical-tesla/mnt/Madame Celandra/<file>" .

git add -A
git commit -m "<message>"
git push origin main
rm -rf /tmp/mc_push
```

Cloudflare auto-deploys within ~1 minute of push. Danny never needs to touch Terminal.

## Stack
- Pure HTML/CSS/JS static site — no build step
- Backend: `functions/api/madame.js` — Cloudflare Pages Function proxying Claude API
- Model: `claude-sonnet-4-6` (overridable via `MADAME_MODEL` env var in Cloudflare)
- API key stored as `ANTHROPIC_API_KEY` environment variable in Cloudflare dashboard

## PWA
- `manifest.json` + `sw.js` added for "Add to Home Screen" support
- Icons: `icon-192.png`, `icon-512.png` (purple/gold star design)
- Service worker: cache-first for all static assets; `/api/madame` always network-only

## Custom deck
35-card deck (not Rider-Waite-Smith). Cards defined in `cards.js`.
Full card definitions with lore in `custom_tarot_deck_card_definitions.txt`.

## Readings & purchases (see PRICING.md)
- Free app (v1.1+) includes 3 readings; consumable IAP `madame_readings_100` ($1.99) adds 100. No daily limit. (v1.0 was $3.99 with 200 readings; those buyers still get 200.)
- Server ledger: Cloudflare D1 (binding `DB`), logic in `lib/credits.js`; endpoints
  `functions/api/account.js`, `session.js`, `purchase.js`, and `madame.js` (now requires a session).
- Cloudflare env: `ANTHROPIC_API_KEY`, `APP_KEY`, `AMAZON_SHARED_SECRET`, optional `AMAZON_RVS_SANDBOX=true` while testing.
- The app key is NOT in the repo: Codemagic's `madame_secrets` group holds `MADAME_APP_KEY`, and
  `build.js` writes it into `www/app-config.js`. Root `app-config.js` is an empty placeholder (web gets no key).
- Native IAP bridge: `android/app/src/main/java/com/madamecelandra/app/AmazonIapPlugin.java`
  (Amazon Appstore SDK 3.0.9). Needs `android/app/src/main/assets/AppstoreAuthenticationKey.pem`.
- The website shows an "get the app" message instead of readings.

## Running locally
```bash
npm install -g wrangler
printf 'ANTHROPIC_API_KEY="sk-ant-..."\nAPP_KEY="dev"\nAMAZON_SHARED_SECRET="..."\n' > .dev.vars
wrangler pages dev . --d1 DB=local-db
# visit http://localhost:8788
```
