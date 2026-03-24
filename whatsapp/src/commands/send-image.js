import { readFileSync } from "fs";
import { getAuthDir, authExists, connectAndWait } from "../session.js";
import { success, error, info } from "../utils/formatters.js";
import { toJid } from "../utils/jid.js";

export function registerSendImage(program) {
  program
    .command("send-image <phone-or-jid> <file>")
    .description("Send an image with optional caption")
    .option("--caption <text>", "Image caption")
    .action(async (phoneOrJid, file, opts, cmd) => {
      const globals = cmd.optsWithGlobals();
      const authDir = getAuthDir(globals.authDir);

      if (!authExists(authDir)) {
        console.log(info("Not logged in. Run: whatsapp login"));
        return;
      }

      try {
        const jid = toJid(phoneOrJid);
        const imageBuffer = readFileSync(file);
        const sock = await connectAndWait({ authDir, verbose: globals.verbose });

        await sock.sendMessage(jid, {
          image: imageBuffer,
          caption: opts.caption || undefined,
        });
        console.log(success(`Image sent to ${jid}`));

        await sock.end();
      } catch (err) {
        console.error(error("Failed to send image: " + err.message));
        process.exit(1);
      }
    });
}
