export async function onRequestPost(context) {
  const BOT_TOKEN = context.env.BOT_TOKEN;

  if (!BOT_TOKEN) {
    return new Response("BOT_TOKEN is missing", { status: 500 });
  }

  try {
    const update = await context.request.json();

    if (update.message?.text === "/start") {
      const chatId = update.message.chat.id;

      const message =
`💎 MONEY FOLLOWS | Earn Rewards Easily 💰

🚀 Your simple way to earn rewards inside Telegram!

🔥 Available activities:
👥 Invite Friends
📺 Watch available Ads
✅ Complete Tasks
🎁 Claim Daily Bonus

💳 Track your rewards balance inside the app.

⭐ Start your earning journey today!

⚠️ Rewards and availability may vary. Terms and eligibility apply.`;

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
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

    return new Response("OK");
  } catch (error) {
    return new Response("Error", { status: 500 });
  }
}
