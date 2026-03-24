import { openDb, closeDb, listChats } from "../db.js";
import { formatChat, info } from "../utils/formatters.js";

export function registerChats(program) {
  program
    .command("chats")
    .description("List cached Telegram chats")
    .option("--limit <n>", "Max chats to show", "20")
    .action(async (opts) => {
      openDb();
      const chats = listChats(parseInt(opts.limit));
      closeDb();

      if (chats.length === 0) {
        console.log(info("No chats cached yet. Start the bot or use 'listen' to populate."));
        return;
      }

      chats.forEach((chat, i) => console.log(formatChat(chat, i) + "\n"));
    });
}
