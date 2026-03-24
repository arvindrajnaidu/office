import { getAuthDir, authExists, connectAndWait } from "../session.js";
import { formatMessage, error, info } from "../utils/formatters.js";

export function registerListen(program) {
  program
    .command("listen")
    .description("Stream incoming messages in real-time")
    .option("--chat <id>", "Filter to a specific chat JID")
    .action(async (opts, cmd) => {
      const globals = cmd.optsWithGlobals();
      const authDir = getAuthDir(globals.authDir);

      if (!authExists(authDir)) {
        console.log(info("Not logged in. Run: whatsapp login"));
        return;
      }

      try {
        const sock = await connectAndWait({ authDir, verbose: globals.verbose });

        // Tell WhatsApp server we're online so it delivers messages in real-time
        await sock.sendPresenceUpdate("available");

        console.log(info("Listening for messages... (Ctrl+C to stop)\n"));

        const startTs = Math.floor(Date.now() / 1000);

        sock.ev.on("messages.upsert", ({ messages, type }) => {
          for (const msg of messages) {
            if (globals.verbose) {
              console.log(`[debug] type=${type} fromMe=${msg.key.fromMe} jid=${msg.key.remoteJid} ts=${msg.messageTimestamp} hasMessage=${!!msg.message} keys=${Object.keys(msg.message || {}).join(",")}`);
            }

            if (opts.chat && msg.key.remoteJid !== opts.chat) continue;
            if (msg.key.fromMe) continue;
            if (!msg.message) continue;

            // Skip old messages from history sync
            const ts = Number(msg.messageTimestamp || 0);
            if (ts && ts < startTs - 5) continue;

            console.log(formatMessage(msg) + "\n");
          }
        });

        // Keep alive until Ctrl+C
        process.on("SIGINT", async () => {
          console.log("\n" + info("Disconnecting..."));
          await sock.end();
          process.exit(0);
        });
      } catch (err) {
        console.error(error("Listen failed: " + err.message));
        process.exit(1);
      }
    });
}
