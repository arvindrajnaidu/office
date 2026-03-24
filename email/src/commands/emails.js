import { openDb, closeDb, listEmails } from "../db.js";
import { formatEmail, info } from "../utils/formatters.js";

export function registerEmails(program) {
  program
    .command("emails")
    .description("List sent/received emails from local database")
    .option("--limit <n>", "Max emails to show", "20")
    .action(async (opts) => {
      openDb();
      const emails = listEmails(parseInt(opts.limit));
      closeDb();

      if (emails.length === 0) {
        console.log(info("No emails in database yet. Send an email or start the bot to populate."));
        return;
      }

      emails.forEach((email, i) => console.log(formatEmail(email, i) + "\n"));
    });
}
