// Cloudflare Pages Function.
// Route: POST /api/referral-stats
// Body: { "initData": "<the raw Telegram.WebApp.initData string>" }
//
// v2 change from the first version: this endpoint used to be a GET that
// trusted ?telegramId=<anything> from the client — meaning anyone could
// view anyone else's referral stats just by editing the URL. It is now a
// POST that requires genuine Telegram initData, exactly like verify-open.js.
// The referrer id used for every query below comes ONLY from the validated
// initData — a client can never request another user's stats by supplying
// a different id, because no client-supplied id is ever read.
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

  const user = await validateInitData(initData, env.TELEGRAM_BOT_TOKEN, 86400);
  if (!user || !user.id) {
    return jsonResponse({ ok: false, error: "invalid_init_data" }, 401);
  }

  // The only telegramId ever used below — derived from the verified
  // signature, never from anything the client typed or put in a URL.
  const telegramId = String(user.id);

  try {
    const verifiedRows = await env.DB.prepare(
      `SELECT referredUsername, referredFirstName, rewardAmount, verifiedAt
         FROM referrals
        WHERE referrerTelegramId = ? AND status = 'verified'
        ORDER BY verifiedAt DESC
        LIMIT 20`
    ).bind(telegramId).all();

    const pendingCountRow = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM referrals WHERE referrerTelegramId = ? AND status = 'pending'`
    ).bind(telegramId).first();

    const balanceRow = await env.DB.prepare(
      `SELECT balance FROM users WHERE telegramId = ?`
    ).bind(telegramId).first();

    const verified = (verifiedRows && verifiedRows.results) || [];
    const totalReferralEarnings = verified.reduce(function (sum, row) {
      return sum + (Number(row.rewardAmount) || 0);
    }, 0);

    const recent = verified.slice(0, 10).map(function (row) {
      var label = row.referredUsername
        ? "@" + row.referredUsername
        : (row.referredFirstName || "Telegram User");
      return {
        label: label,
        status: "verified",
        reward: Number(row.rewardAmount) || 0,
        verifiedAt: row.verifiedAt || null
      };
    });

    return jsonResponse({
      ok: true,
      verifiedInvites: verified.length,
      totalReferralEarnings: totalReferralEarnings,
      pendingInvites: (pendingCountRow && pendingCountRow.c) || 0,
      rewardPerInvite: 0.40,
      serverBalance: (balanceRow && Number(balanceRow.balance)) || 0,
      recent: recent
    });
  } catch (e) {
    return jsonResponse({ ok: false, error: "db_error" }, 500);
  }
}
