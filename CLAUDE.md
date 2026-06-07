# Madame Celandra — Project Notes

## Repository
- **GitHub:** https://github.com/dannyccash-web/madame_celandra
- **Deploy:** Cloudflare Pages (auto-deploys on push to `main`)
- **Live URL:** https://madame-celandra.pages.dev (or custom domain if configured)

## GitHub token
Stored in `.github_token` (gitignored). Use it for pushes:
```
git remote set-url origin https://<token>@github.com/dannyccash-web/madame_celandra.git
```

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

## Daily limit
`DAILY_LIMIT_ENABLED = true` in `game.js` — one reading per local calendar day, enforced via localStorage.

## Running locally
```bash
npm install -g wrangler
echo 'ANTHROPIC_API_KEY="sk-ant-..."' > .dev.vars
wrangler pages dev .
# visit http://localhost:8788
```
