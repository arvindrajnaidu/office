import { info } from "../utils/formatters.js";

export function registerBrowserLogin(program) {
  program
    .command("browser-login")
    .description("(Moved to assistant app) Open browser for site logins")
    .action(async () => {
      console.log(info("Browser login has moved to the assistant app."));
      console.log(info("Manage it from the NextJS admin UI instead."));
    });
}
