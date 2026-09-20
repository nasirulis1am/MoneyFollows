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

    if (update.message?.text === "/start") {
      const chatId = update.message.chat.id;

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
