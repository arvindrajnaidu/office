import { createBot, resolveToken } from "../session.js";
import { readConfig } from "../config.js";
import { success, error } from "../utils/formatters.js";

export function registerSend(program) {
  program
    .command("send <chat-id> <message>")
    .description("Send a Telegram message to a chat ID")
    .action(async (chatId, message) => {
      const config = readConfig();
      const token = resolveToken(config);
      if (!token) {
        console.log(error("No bot token. Run setup or set TELEGRAM_BOT_TOKEN."));
        process.exit(1);
      }

      try {
        const bot = createBot(token);
        await bot.api.sendMessage(chatId, message);
        console.log(success(`Message sent to ${chatId}`));
      } catch (err) {
        console.log(error(`Failed to send: ${err.message}`));
        process.exit(1);
      }
    });
}
