import { createClient, resolveApiKey } from "../session.js";
import { readConfig } from "../config.js";
import { EmailPoller } from "../poller.js";
import { formatReceivedEmail, error, info } from "../utils/formatters.js";

export function registerListen(program) {
  program
    .command("listen")
    .description("Poll and stream incoming emails in real time")
    .option("--interval <ms>", "Polling interval in milliseconds", "10000")
    .action(async (opts) => {
      const config = readConfig();
      const apiKey = resolveApiKey(config);
      if (!apiKey) {
        console.log(error("No Resend API key. Run setup or set RESEND_API_KEY."));
        process.exit(1);
      }

      const client = createClient(apiKey);
      const poller = new EmailPoller({
        client,
        interval: parseInt(opts.interval),
      });

      poller.on("email", (email) => {
        console.log(formatReceivedEmail(email) + "\n");
      });

      poller.on("error", (err) => {
        console.log(error(`Polling error: ${err.message}`));
      });

      console.log(info("Listening for incoming emails... (Ctrl+C to stop)\n"));
      await poller.start();

      process.on("SIGINT", () => {
        poller.stop();
        process.exit(0);
      });
    });
}
