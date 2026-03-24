import { getAuthDir, authExists, clearAuth } from "../session.js";
import { success, info } from "../utils/formatters.js";

export function registerLogout(program) {
  program
    .command("logout")
    .description("Unlink and clear stored credentials")
    .action(async (_, cmd) => {
      const opts = cmd.optsWithGlobals();
      const authDir = getAuthDir(opts.authDir);

      if (!authExists(authDir)) {
        console.log(info("No active session found."));
        return;
      }

      clearAuth(authDir);
      console.log(success("Logged out and credentials cleared."));
    });
}
