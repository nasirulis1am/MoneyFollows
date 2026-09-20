export async function onRequestPost(context) {
  try {
    const token = context.env.BOT_TOKEN;

    if (!token) {
      return new Response("BOT_TOKEN_MISSING", { status: 200 });
    }

    const update = await context.request.json();

    if (update.message?.text === "/start") {
      const chatId = update.message.chat.id;

      const response = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: "💎 MONEY FOLLOWS\n\n🚀 Welcome! Your Mini App is ready.",
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
        }
      );

      if (!response.ok) {
        return new Response("TELEGRAM_API_ERROR", { status: 200 });
      }
    }

    return new Response("OK", { status: 200 });

  } catch (error) {
    return new Response("FUNCTION_ERROR", { status: 200 });
  }
}
