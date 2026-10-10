// POST /api/account  { userId, marketplace?, edition? }
// Called by the native app on launch. Creates the seeker's ledger entry
// (with the starting readings) the first time, and returns their balance.
import {
  json, preflight, methodNotAllowed, checkConfigAndKey, cleanUserId, readJson,
  ensureSchema, getOrCreateAccount, startingCreditsFor, REFILL_CREDITS, REFILL_SKU,
} from "../../lib/credits.js";

export const onRequestOptions = preflight;

export async function onRequestPost({ request, env }) {
  const denied = checkConfigAndKey(request, env);
  if (denied) return denied;

  const body = await readJson(request);
  const userId = cleanUserId(body?.userId);
  if (!userId) return json(400, { error: "`userId` is required." });
  const marketplace = typeof body?.marketplace === "string" ? body.marketplace.slice(0, 16) : null;
  const edition = body?.edition === "free" ? "free" : "paid";

  await ensureSchema(env.DB);
  const acct = await getOrCreateAccount(env.DB, request, userId, marketplace, env.MAX_NEW_ACCOUNTS_PER_DAY, edition);
  if (acct.error) return acct.error;

  return json(200, {
    balance: acct.balance,
    created: acct.created,
    startingCredits: startingCreditsFor(edition),
    refill: { sku: REFILL_SKU, credits: REFILL_CREDITS },
  });
}

export const onRequestGet    = methodNotAllowed;
export const onRequestPut    = methodNotAllowed;
export const onRequestPatch  = methodNotAllowed;
export const onRequestDelete = methodNotAllowed;
export const onRequestHead   = methodNotAllowed;
