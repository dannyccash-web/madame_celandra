// POST /api/session  { userId }
// Opens a reading session when the seeker taps "Begin Reading".
// One credit is spent later, once they have asked their question.
import {
  json, preflight, methodNotAllowed, checkConfigAndKey, cleanUserId, readJson,
  ensureSchema, getBalance, openSession,
} from "../../lib/credits.js";

export const onRequestOptions = preflight;

export async function onRequestPost({ request, env }) {
  const denied = checkConfigAndKey(request, env);
  if (denied) return denied;

  const body = await readJson(request);
  const userId = cleanUserId(body?.userId);
  if (!userId) return json(400, { error: "`userId` is required." });

  await ensureSchema(env.DB);
  const balance = await getBalance(env.DB, userId);
  if (balance === null) return json(404, { error: "unknown_account" });
  if (balance <= 0) return json(402, { error: "out_of_readings", balance: 0 });

  const sessionId = await openSession(env.DB, userId);
  return json(200, { sessionId, balance });
}

export const onRequestGet    = methodNotAllowed;
export const onRequestPut    = methodNotAllowed;
export const onRequestPatch  = methodNotAllowed;
export const onRequestDelete = methodNotAllowed;
export const onRequestHead   = methodNotAllowed;
