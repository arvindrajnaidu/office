import { checkAccess, createPoller } from "../session.js";
import { formatMessage, error, info } from "../utils/formatters.js";

export function registerListen(program) {
  program
    .command("listen")
    .description("Stream incoming iMessages in real time")
    .option("--handle <phone>", "Filter to a specific contact")
    .option("--interval <ms>", "Polling interval in milliseconds", "2000")
    .action(async (opts) => {
      if (!checkAccess()) {
        console.log(error("Cannot read iMessage database. Grant Full Disk Access."));
        process.exit(1);
      }

      const poller = createPoller({
        handle: opts.handle,
        onlyIncoming: true,
        interval: parseInt(opts.interval),
      });

      poller.on("message", (msg) => {
        console.log(formatMessage(msg) + "\n");
      });

      poller.on("error", (err) => {
        console.log(error(`Polling error: ${err.message}`));
      });

      console.log(info("Listening for messages... (Ctrl+C to stop)\n"));
      poller.start();

      process.on("SIGINT", () => {
        poller.stop();
        process.exit(0);
      });
    });
}
