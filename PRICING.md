# Madame Celandra — Monetization & Pricing

## Model
**One-time download with a credit pack system.**
No subscriptions. Users buy the app once and get an included credit pack, then buy more when they run out.

## Pricing

| Item | Price | Notes |
|------|-------|-------|
| App download | Free | Lowers barrier to entry |
| Starter pack (included) | — | Bundled with first IAP |
| First reading pack | **$4.99** → 100 readings | ~3 months of daily use |
| Refill pack | **$3.99** → 150 readings | Rewards returning users |

> **Rationale:** claude-sonnet-4-6 costs ~$0.004–0.007 per reading. At 1 reading/day, that's ~$1.50–2.50/year per active user in API costs. App stores take 30%, so $4.99 → ~$3.49 net. A 100-reading pack covers ~$0.50–0.70 in API costs, leaving healthy margin. Users who lapse and return buy a refill — this structure captures revenue from re-engagement.

## Daily Limit
- **Max 1 reading per calendar day** (enforced client-side now; move server-side before launch)
- This makes the math above conservative — real API costs will be lower than worst-case

## Comparable Apps
- Co-Star: Free + $2.99–$4.99 IAP
- The Pattern: Free + subscription
- Golden Thread Tarot: $4.99 one-time (card reference only, no AI)
- Labyrinthos: Free + $9.99 premium

## App Store Fees
- Apple App Store: 30% (15% for small developers earning < $1M/year via Small Business Program)
- Google Play: 30% (15% for first $1M/year)

## What Needs Building for This Model
1. Server-side credit ledger (Cloudflare Workers KV) — one entry per device/user token
2. StoreKit 2 (iOS) + Google Play Billing integration in Capacitor
3. Capacitor IAP plugin (e.g., `@capgo/capacitor-purchases` or `capacitor-purchases` via RevenueCat)
4. "You've used your reading for today" gate becomes "You have X readings remaining"

## Legal / App Store Notes
- Apple requires "for entertainment purposes only" disclaimer for fortune-telling apps
- Add to: onboarding screen, App Store description, privacy policy
