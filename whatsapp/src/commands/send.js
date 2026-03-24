import { getAuthDir, authExists, connectAndWait } from "../session.js";
import { success, error, info } from "../utils/formatters.js";
import { toJid } from "../utils/jid.js";

export function registerSend(program) {
  program
    .command("send <phone-or-jid> <message>")
    .description("Send a text message")
    .action(async (phoneOrJid, message, cmd) => {
      const globals = cmd.optsWithGlobals();
      const authDir = getAuthDir(globals.authDir);

      if (!authExists(authDir)) {
        console.log(info("Not logged in. Run: whatsapp login"));
        return;
      }

      try {
        const jid = toJid(phoneOrJid);
        const sock = await connectAndWait({ authDir, verbose: globals.verbose });

        await sock.sendMessage(jid, { text: message });
        console.log(success(`Message sent to ${jid}`));

        await sock.end();
      } catch (err) {
        console.error(error("Failed to send: " + err.message));
        process.exit(1);
      }
    });
}
