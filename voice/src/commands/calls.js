import { openDb, closeDb, listCalls } from "../db.js";
import { formatCall, info } from "../utils/formatters.js";

export function registerCalls(program) {
  program
    .command("calls")
    .description("List call history")
    .option("--limit <n>", "Max calls to show", "20")
    .action(async (opts) => {
      openDb();
      const calls = listCalls(parseInt(opts.limit));
      closeDb();

      if (calls.length === 0) {
        console.log(info("No calls yet. Start the bot and make a call."));
        return;
      }

      calls.forEach((call, i) => console.log(formatCall(call, i) + "\n"));
    });
}
