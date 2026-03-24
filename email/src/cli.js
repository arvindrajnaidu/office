import { Command } from "commander";
import { registerStatus } from "./commands/status.js";
import { registerSend } from "./commands/send.js";
import { registerEmails } from "./commands/emails.js";
import { registerListen } from "./commands/listen.js";
import { registerMcp } from "./commands/mcp.js";
import { readConfig } from "./config.js";
import { resolveApiKey } from "./session.js";
import { runSetup } from "./setup.js";
import { startBot } from "./bot/index.js";

const program = new Command();

program
  .name("email-bot")
  .description("Email Bot CLI — send and receive emails via Resend API")
  .version("1.0.0")
  .option("--verbose", "Enable debug logging")
  .helpCommand(true)
  .action(async (_, cmd) => {
    if (cmd.args.length > 0) {
      console.error(`Unknown command: ${cmd.args[0]}\n`);
      program.help();
      return;
    }

    const opts = cmd.optsWithGlobals();
    const config = readConfig();

    if (!config.setupComplete || !resolveApiKey(config)) {
      await runSetup(opts);
    }

    await startBot(opts);
  });

registerStatus(program);
registerSend(program);
registerEmails(program);
registerListen(program);
registerMcp(program);

export { program };
