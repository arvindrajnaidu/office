import { Command } from "commander";
import { registerLogin } from "./commands/login.js";
import { registerLogout } from "./commands/logout.js";
import { registerStatus } from "./commands/status.js";
import { registerChats } from "./commands/chats.js";
import { registerMessages } from "./commands/messages.js";
import { registerSend } from "./commands/send.js";
import { registerSendImage } from "./commands/send-image.js";
import { registerSendPoll } from "./commands/send-poll.js";
import { registerListen } from "./commands/listen.js";
import { registerMcp } from "./commands/mcp.js";
import { registerBrowserLogin } from "./commands/browser-login.js";
import { readConfig } from "./config.js";
import { runSetup } from "./setup.js";
import { startBot } from "./bot/index.js";
import { getAuthDir, authExists } from "./session.js";

const program = new Command();

program
  .name("whatsapp")
  .description("WhatsApp CLI — send messages, manage chats, and more via Baileys")
  .version("1.0.0")
  .option("--verbose", "Enable debug logging")
  .option("--auth-dir <path>", "Override auth credentials directory")
  .helpCommand(true)
  .action(async (_, cmd) => {
    // Only run the bot when no subcommand is given
    if (cmd.args.length > 0) {
      console.error(`Unknown command: ${cmd.args[0]}\n`);
      program.help();
      return;
    }

    const opts = cmd.optsWithGlobals();
    const config = readConfig();

    if (!config.setupComplete || !authExists(getAuthDir(opts.authDir))) {
      await runSetup(opts);
    }

    await startBot(opts);
  });

registerLogin(program);
registerLogout(program);
registerStatus(program);
registerChats(program);
registerMessages(program);
registerSend(program);
registerSendImage(program);
registerSendPoll(program);
registerListen(program);
registerMcp(program);
registerBrowserLogin(program);

export { program };
