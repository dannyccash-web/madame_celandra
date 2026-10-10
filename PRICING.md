# Madame Celandra — Monetization & Pricing

## Model
**Free download with 3 readings + consumable refill.** No ads, no subscriptions.
(v1.0, Oct 2026, was a $3.99 paid download with 200 readings; anyone who bought
it still gets 200 on first launch — see `startingCreditsFor()` in `lib/credits.js`.)

| Item | Price | What you get |
|------|-------|--------------|
| App download (Amazon Appstore) | **Free** | 3 readings |
| Refill (in-app purchase, consumable) | **$1.99** | +100 readings |

- No daily limit — readings can be used at any pace.
- One reading = one full three-card session. The reading is spent when the
  seeker submits their question (Madame's greeting is free).
- The website (madame-celandra.pages.dev) no longer gives readings; it
  points visitors to the Amazon Appstore.

## How it's enforced (server-side)
- Ledger lives in **Cloudflare D1** (binding `DB`), code in `lib/credits.js`.
- Accounts are keyed by the **Amazon user ID** (from Amazon IAP `getUserData`),
  so reinstalling or clearing app data does not reset the count.
- First launch creates the account with 3 readings (the app sends
  `edition: "free"`; v1.0 clients send nothing and get 200).
- Refill receipts are verified with Amazon's **Receipt Verification Service**
  and credited exactly once per receipt ID.
- `/api/madame` only answers calls carrying the app key + a valid reading
  session, so the Claude API key can't be used for free from outside the app.
- Abuse limits: 3 new accounts per IP per day; 2000 new accounts per day total
  (`MAX_NEW_ACCOUNTS_PER_DAY` env var to change).

## IAP item
| SKU | Type | Price |
|-----|------|-------|
| `madame_readings_100` | Consumable | $1.99 |

## Margins (rough)
claude-sonnet-4-6 costs ~$0.004–0.007 per reading (6 model calls).
- 3 free readings ≈ $0.01–0.02 API cost per new user.
- $1.99 − 30% ≈ $1.39 net; 100 readings ≈ $0.40–0.70 API cost.

## Legal / store notes
- Include "for entertainment purposes only" in the store description.
