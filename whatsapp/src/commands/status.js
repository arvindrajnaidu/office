import { getAuthDir, authExists, connectAndWait } from "../session.js";
import { success, info, error } from "../utils/formatters.js";
import { jidToPhone } from "../utils/jid.js";

export function registerStatus(program) {
  program
    .command("status")
    .description("Show connection and auth status")
    .action(async (_, cmd) => {
      const opts = cmd.optsWithGlobals();
      const authDir = getAuthDir(opts.authDir);

      if (!authExists(authDir)) {
        console.log(info("Not logged in. Run: whatsapp login"));
        return;
      }

      console.log(info("Checking connection..."));
      try {
        const sock = await connectAndWait({ authDir, verbose: opts.verbose });
        const me = sock.user;
        console.log(success(`Connected as ${me?.name || "Unknown"} (${jidToPhone(me?.id)})`));
        await sock.end();
      } catch (err) {
        console.error(error("Connection failed: " + err.message));
        process.exit(1);
      }
    });
}
