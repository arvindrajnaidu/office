import { openDb, closeDb, getMessages } from "../db.js";
import { formatMessage, error } from "../utils/formatters.js";

export function registerMessages(program) {
  program
    .command("messages <chat-id>")
    .description("Show messages for a Telegram chat")
    .option("--limit <n>", "Max messages to show", "20")
    .option("--days <n>", "Messages from last N days", "7")
    .action(async (chatId, opts) => {
      openDb();
      const messages = getMessages(chatId, parseInt(opts.days), parseInt(opts.limit));
      closeDb();

      if (messages.length === 0) {
        console.log("No messages found.");
        return;
      }

      messages.forEach(msg => console.log(formatMessage(msg) + "\n"));
    });
}
