// POST /api/purchase  { userId, receiptId }
// Verifies an Amazon IAP receipt with Amazon's Receipt Verification
// Service and credits the readings exactly once per receipt. Safe to call
// repeatedly for the same receipt (the app retries until it gets a 200,
// and only then tells Amazon the purchase is fulfilled).
import {
  json, preflight, methodNotAllowed, checkConfigAndKey, cleanUserId, readJson,
  ensureSchema, getOrCreateAccount, verifyAmazonReceipt, creditReceipt,
  REFILL_SKU, REFILL_CREDITS,
} from "../../lib/credits.js";

export const onRequestOptions = preflight;

export async function onRequestPost({ request, env }) {
  const denied = checkConfigAndKey(request, env);
  if (denied) return denied;

  const body = await readJson(request);
  const userId = cleanUserId(body?.userId);
  const receiptId = typeof body?.receiptId === "string" ? body.receiptId.trim().slice(0, 512) : "";
  if (!userId || !receiptId) return json(400, { error: "`userId` and `receiptId` are required." });

  await ensureSchema(env.DB);
  const acct = await getOrCreateAccount(env.DB, request, userId, null, env.MAX_NEW_ACCOUNTS_PER_DAY, body?.edition === "free" ? "free" : "paid");
  if (acct.error) return acct.error;

  const v = await verifyAmazonReceipt(env, userId, receiptId);
  if (!v.ok) {
    // Only a canceled receipt is final. Anything else (including "invalid",
    // which a misconfigured secret or sandbox mix-up can also produce) is
    // left unfulfilled so the app retries on next launch and the seeker
    // never loses a purchase.
    return json(v.status, { error: v.reason, permanent: v.status === 410 });
  }

  const r = v.receipt;
  if (r.productId !== REFILL_SKU) {
    return json(400, { error: "unknown_sku", permanent: true });
  }
  if (r.cancelDate) {
    return json(410, { error: "receipt_canceled", permanent: true });
  }

  const qty = Number.isInteger(r.quantity) && r.quantity > 0 ? r.quantity : 1;
  const { granted, balance } = await creditReceipt(
    env.DB, userId, receiptId, r.productId, REFILL_CREDITS * qty
  );
  return json(200, { granted, balance, testTransaction: !!r.testTransaction });
}

export const onRequestGet    = methodNotAllowed;
export const onRequestPut    = methodNotAllowed;
export const onRequestPatch  = methodNotAllowed;
export const onRequestDelete = methodNotAllowed;
export const onRequestHead   = methodNotAllowed;
