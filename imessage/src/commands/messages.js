import { getMessages } from "../imessage/db.js";
import { checkAccess } from "../session.js";
import { formatMessage, error } from "../utils/formatters.js";

export function registerMessages(program) {
  program
    .command("messages")
    .description("Show messages for a chat or contact")
    .option("--handle <phone>", "Filter by phone number or email")
    .option("--chat-id <id>", "Filter by chat identifier")
    .option("--limit <n>", "Max messages to show", "20")
    .action(async (opts) => {
      if (!checkAccess()) {
        console.log(error("Cannot read iMessage database. Grant Full Disk Access."));
        process.exit(1);
      }

      if (!opts.handle && !opts.chatId) {
        console.log(error("Specify --handle <phone/email> or --chat-id <id>"));
        process.exit(1);
      }

      const messages = getMessages({
        handle: opts.handle,
        chatId: opts.chatId,
        limit: parseInt(opts.limit),
      });

      if (messages.length === 0) {
        console.log("No messages found.");
        return;
      }

      // Display oldest first
      const sorted = [...messages].reverse();
      sorted.forEach(msg => console.log(formatMessage(msg) + "\n"));
    });
}
