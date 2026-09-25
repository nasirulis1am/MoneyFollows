export async function onRequestGet(context) {
  const token = context.env.BOT_TOKEN;

  if (!token) {
    return new Response("BOT_TOKEN_MISSING", { status: 200 });
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/getMe`
    );

    const data = await response.json();

    return new Response(
      JSON.stringify({
        bot_token_present: true,
        telegram_ok: data.ok,
        bot_username: data.result?.username || null
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    return new Response("TELEGRAM_CONNECTION_ERROR", { status: 200 });
  }
}

export async function onRequestPost(context) {
  try {
    const token = context.env.BOT_TOKEN;

    if (!token) {
      return new Response("BOT_TOKEN_MISSING", { status: 200 });
    }

    const update = await context.request.json();

    const text = update.message?.text;

    if (typeof text === "string" && /^\/start(?:\s|$)/.test(text)) {
      const chatId = update.message.chat.id;

      // ===== Referral payload handling =====
      // Recognizes "/start" and "/start ref_123456789".
      // Only a payload beginning with "ref_" is treated as a referral.
      try {
        const parts = text.trim().split(/\s+/);
        const payload = parts.length > 1 ? parts[1] : null;

        if (payload && payload.indexOf("ref_") === 0) {
          const referrerTelegramId = payload.slice("ref_".length);
          const referredTelegramId = update.message.from?.id
            ? String(update.message.from.id)
            : null;
          const referredUsername = update.message.from?.username || null;
          const referredFirstName = update.message.from?.first_name || null;

          // Only proceed with a well-formed, non-empty, numeric-only
          // referrer ID and a known sender ID. Never trust anything else
          // from the payload. Malformed values such as "ref_abc",
          // "ref_test", or "ref_" are rejected here.
          if (
            referrerTelegramId &&
            /^[0-9]+$/.test(referrerTelegramId) &&
            referredTelegramId &&
            referrerTelegramId !== referredTelegramId // block self-referral
          ) {
            const db = context.env.DB;
            if (db) {
              // INSERT OR IGNORE relies on the existing UNIQUE constraint
              // on referredTelegramId, so a Telegram user can never create
              // more than one referral record. No reward is credited here;
              // verify-open.js credits the referrer only after the
              // referred user opens the Mini App and is server-validated.
              await db
                .prepare(
                  `INSERT OR IGNORE INTO referrals
                    (referrerTelegramId, referredTelegramId, referredUsername, referredFirstName, status, rewardAmount, createdAt)
                   VALUES (?, ?, ?, ?, 'pending', 0.40, ?)`
                )
                .bind(
                  referrerTelegramId,
                  referredTelegramId,
                  referredUsername,
                  referredFirstName,
                  Date.now()
                )
                .run();
            }
          }
        }
      } catch (referralError) {
        // Referral insertion must never break the normal Telegram response.
        console.error("REFERRAL_INSERT_ERROR", referralError);
      }

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: "💎 MONEY FOLLOWS | Earn Rewards 💰\n\n🚀 Complete simple activities and earn rewards!\n\n🔥 Earn through:\n👥 Invites\n📺 Watch Ads\n🎁 Daily Bonus\n✅ Complete Tasks\n\n💳 Track your rewards easily.\n👇 Tap below to get started!",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔥 Start Earning",
                  web_app: {
                    url: "https://moneyfollows.pages.dev"
                  }
                }
              ]
            ]
          }
        })
      });
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    return new Response("FUNCTION_ERROR", { status: 200 });
  }
}
