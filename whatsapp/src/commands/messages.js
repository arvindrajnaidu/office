import { getAuthDir, authExists, connectAndWait } from "../session.js";
import { formatMessage, error, info } from "../utils/formatters.js";
import { toJid } from "../utils/jid.js";

export function registerMessages(program) {
  program
    .command("messages <chat-id>")
    .description("Read recent messages from a chat")
    .option("--limit <n>", "Number of messages to fetch", "20")
    .action(async (chatId, opts, cmd) => {
      const globals = cmd.optsWithGlobals();
      const authDir = getAuthDir(globals.authDir);

      if (!authExists(authDir)) {
        console.log(info("Not logged in. Run: whatsapp login"));
        return;
      }

      try {
        const jid = toJid(chatId);
        const limit = parseInt(opts.limit, 10);

        const sock = await connectAndWait({ authDir, verbose: globals.verbose });

        // Collect messages via upsert events
        const messages = [];
        const collected = new Promise((resolve) => {
          sock.ev.on("messaging-history.set", ({ messages: msgs }) => {
            messages.push(...msgs);
            resolve();
          });
          // Fallback timeout
          setTimeout(resolve, 5000);
        });

        await collected;

        // Filter to our chat
        const chatMessages = messages
          .filter((m) => m.key.remoteJid === jid)
          .slice(0, limit);

        if (chatMessages.length === 0) {
          console.log(info(`No messages found for ${jid}. Try using the full JID (e.g. 1234567890@s.whatsapp.net)`));
        } else {
          console.log(`\nShowing ${chatMessages.length} message(s):\n`);
          chatMessages.forEach((msg) => console.log(formatMessage(msg) + "\n"));
        }

        await sock.end();
      } catch (err) {
        console.error(error("Failed to fetch messages: " + err.message));
        process.exit(1);
      }
    });
}
