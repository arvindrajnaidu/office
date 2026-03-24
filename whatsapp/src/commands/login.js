import { createSocket, waitForConnection, getAuthDir, authExists } from "../session.js";
import { success, info, error, warn } from "../utils/formatters.js";
import { jidToPhone } from "../utils/jid.js";

const MAX_RETRIES = 5;

export function registerLogin(program) {
  program
    .command("login")
    .description("Link WhatsApp account via QR code or pairing code")
    .option("--pairing-code <phone>", "Use pairing code instead of QR (e.g. 60123456789)")
    .action(async (opts, cmd) => {
      const globals = cmd.optsWithGlobals();
      const authDir = getAuthDir(globals.authDir);
      const phone = opts.pairingCode;

      if (authExists(authDir)) {
        console.log(info("Already logged in. Use 'whatsapp logout' first to re-link."));
        return;
      }

      if (phone) {
        console.log(info("Requesting pairing code...\n"));
      } else {
        console.log(info("Scan the QR code below with WhatsApp > Linked Devices > Link a Device\n"));
      }

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const sock = await createSocket({
            authDir,
            printQr: !phone,
            verbose: globals.verbose,
          });

          if (phone) {
            // Wait briefly for the socket to be ready before requesting pairing code
            await new Promise((resolve) => setTimeout(resolve, 2000));
            const digits = phone.replace(/[^0-9]/g, "");
            const code = await sock.requestPairingCode(digits);
            console.log(success(`Pairing code: ${code}`));
            console.log(info("Enter this code on your phone: WhatsApp > Linked Devices > Link a Device > Link with phone number\n"));
          }

          await waitForConnection(sock);
          const me = sock.user;
          console.log("\n" + success(`Linked as ${me?.name || jidToPhone(me?.id)} (${jidToPhone(me?.id)})`));
          await sock.end();
          return;
        } catch (err) {
          const isStreamError = err.message?.includes("Stream Errored")
            || err.message?.includes("restart required");

          if (isStreamError && attempt < MAX_RETRIES) {
            console.log(warn(`Connection dropped, retrying (${attempt}/${MAX_RETRIES})...\n`));
            continue;
          }

          console.error(error("Login failed: " + err.message));
          process.exit(1);
        }
      }
    });
}
