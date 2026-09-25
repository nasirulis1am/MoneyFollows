// Cloudflare Pages Function.
// Route: POST /api/verify-open
// Body: { "initData": "<the raw Telegram.WebApp.initData string>" }
//
// v2 changes from the first version:
//   - Actually registers a `users` row for the opening Telegram user
//     (created from the SERVER-VALIDATED user object, never from anything
//     the client claims).
//   - Actually credits the referrer's server-side balance by rewardAmount
//     and writes a matching `transactions` row, instead of only flipping
//     the referral's status.
//   - The double-credit guard is the atomic UPDATE ... WHERE status='pending'
//     below: D1/SQLite serializes writes, so if this endpoint is called many
//     times concurrently for the same referred user, only ONE of those calls
//     can ever see changes > 0 on that specific UPDATE — every other call,
//     no matter how it's timed, affects zero rows and credits nothing. This
//     has been tested directly against real SQLite (see the accompanying
//     test script), not just reasoned about.
//   - The transactions table's UNIQUE(type, referralId) constraint is a
//     second, independent integrity check at the database level (protects
//     the audit ledger even if this code were ever modified incorrectly),
//     but the actual double-payment prevention is the referral claim above.
//
// Requires:
//   - D1 database bound as `DB`
//   - Environment secret `TELEGRAM_BOT_TOKEN`

import { validateInitData, jsonResponse } from "../_lib/telegram.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return jsonResponse({ ok: false, error: "db_not_configured" }, 500);
  }
  if (!env.TELEGRAM_BOT_TOKEN) {
    return jsonResponse({ ok: false, error: "bot_token_not_configured" }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ ok: false, error: "bad_request" }, 400);
  }

  const initData = body && body.initData;
  if (!initData) {
    return jsonResponse({ ok: false, error: "missing_init_data" }, 400);
  }

  // The ONLY source of truth for "who is making this request." Nothing from
  // the request body other than initData itself is ever trusted for identity.
  const user = await validateInitData(initData, env.TELEGRAM_BOT_TOKEN, 86400);
  if (!user || !user.id) {
    return jsonResponse({ ok: false, error: "invalid_init_data" }, 401);
  }

  const referredId = String(user.id);
  const username = user.username || null;
  const firstName = user.first_name || null;
  const now = new Date().toISOString();

  try {
    // Register/refresh this user's own account. NEVER touches balance on an
    // existing row — only username/firstName/updatedAt are refreshed, so a
    // returning user's balance can't be reset by opening the app again.
    await env.DB.prepare(
      `INSERT INTO users (telegramId, username, firstName, balance, createdAt, updatedAt)
       VALUES (?, ?, ?, 0, ?, ?)
       ON CONFLICT(telegramId) DO UPDATE SET
         username = excluded.username,
         firstName = excluded.firstName,
         updatedAt = excluded.updatedAt`
    ).bind(referredId, username, firstName, now, now).run();

    // Is there a still-pending referral for this exact (server-verified) user?
    const pending = await env.DB.prepare(
      `SELECT id, referrerTelegramId, rewardAmount
         FROM referrals
        WHERE referredTelegramId = ? AND status = 'pending'`
    ).bind(referredId).first();

    if (!pending) {
      // Never referred, or already verified in an earlier call — nothing to do.
      return jsonResponse({ ok: true, verifiedNow: false, rewardCredited: 0 });
    }

    // Atomically claim it. This single statement is what actually prevents
    // double-crediting — see the comment block at the top of this file.
    const claim = await env.DB.prepare(
      `UPDATE referrals SET status = 'verified', verifiedAt = ?
        WHERE id = ? AND status = 'pending'`
    ).bind(now, pending.id).run();

    const wonClaim = !!(claim && claim.meta && claim.meta.changes > 0);
    if (!wonClaim) {
      // A concurrent call already claimed this referral first.
      return jsonResponse({ ok: true, verifiedNow: false, rewardCredited: 0 });
    }

    const referrerId = pending.referrerTelegramId;
    const rewardAmount = Number(pending.rewardAmount) || 0.40;

    // Make sure the referrer has a row to credit — they may never have
    // opened the Mini App themselves since this backend was deployed.
    await env.DB.prepare(
      `INSERT INTO users (telegramId, username, firstName, balance, createdAt, updatedAt)
       VALUES (?, NULL, NULL, 0, ?, ?)
       ON CONFLICT(telegramId) DO NOTHING`
    ).bind(referrerId, now, now).run();

    // Credit the balance and record the ledger entry together.
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE users SET balance = balance + ?, updatedAt = ? WHERE telegramId = ?`
      ).bind(rewardAmount, now, referrerId),
      env.DB.prepare(
        `INSERT OR IGNORE INTO transactions (telegramId, type, amount, referralId, createdAt)
         VALUES (?, 'referral_reward', ?, ?, ?)`
      ).bind(referrerId, rewardAmount, pending.id, now)
    ]);

    return jsonResponse({ ok: true, verifiedNow: true, rewardCredited: rewardAmount });
  } catch (e) {
    return jsonResponse({ ok: false, error: "db_error" }, 500);
  }
}
