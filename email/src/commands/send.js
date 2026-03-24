import { createClient, resolveApiKey, resolveFromAddress } from "../session.js";
import { readConfig } from "../config.js";
import { success, error } from "../utils/formatters.js";

export function registerSend(program) {
  program
    .command("send <to> <subject>")
    .description("Send an email via Resend")
    .option("--body <text>", "Email body text")
    .option("--html <html>", "Email body HTML")
    .option("--from <address>", "Override sender address")
    .action(async (to, subject, opts) => {
      const config = readConfig();
      const apiKey = resolveApiKey(config);
      if (!apiKey) {
        console.log(error("No Resend API key. Run setup or set RESEND_API_KEY."));
        process.exit(1);
      }

      const from = opts.from || resolveFromAddress(config);
      if (!from) {
        console.log(error("No sender address. Set EMAIL_FROM or configure in setup."));
        process.exit(1);
      }

      try {
        const client = createClient(apiKey);
        const payload = { from, to, subject };
        if (opts.html) payload.html = opts.html;
        else payload.text = opts.body || subject;

        const { data, error: sendErr } = await client.emails.send(payload);
        if (sendErr) throw new Error(sendErr.message);
        console.log(success(`Email sent to ${to} (id: ${data.id})`));
      } catch (err) {
        console.log(error(`Failed to send: ${err.message}`));
        process.exit(1);
      }
    });
}
