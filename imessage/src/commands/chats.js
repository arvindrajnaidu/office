import { getChats } from "../imessage/db.js";
import { checkAccess } from "../session.js";
import { formatChat, error } from "../utils/formatters.js";

export function registerChats(program) {
  program
    .command("chats")
    .description("List iMessage conversations")
    .option("--limit <n>", "Max chats to show", "20")
    .option("--search <term>", "Filter by name")
    .action(async (opts) => {
      if (!checkAccess()) {
        console.log(error("Cannot read iMessage database. Grant Full Disk Access."));
        process.exit(1);
      }

      let chats = getChats({ limit: parseInt(opts.limit) });

      if (opts.search) {
        const term = opts.search.toLowerCase();
        chats = chats.filter(c =>
          c.displayName?.toLowerCase().includes(term) ||
          c.chatId?.toLowerCase().includes(term)
        );
      }

      if (chats.length === 0) {
        console.log("No chats found.");
        return;
      }

      chats.forEach((chat, i) => console.log(formatChat(chat, i) + "\n"));
    });
}
