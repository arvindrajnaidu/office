import { Command } from "commander";
import { registerStatus } from "./commands/status.js";
import { registerChats } from "./commands/chats.js";
import { registerMessages } from "./commands/messages.js";
import { registerSend } from "./commands/send.js";
import { registerListen } from "./commands/listen.js";
import { registerMcp } from "./commands/mcp.js";
import { readConfig } from "./config.js";
import { runSetup } from "./setup.js";
import { startBot } from "./bot/index.js";
import { checkAccess } from "./session.js";

const program = new Command();

program
  .name("imessage")
  .description("iMessage CLI — send messages, manage chats, and more via macOS Messages")
  .version("1.0.0")
  .option("--verbose", "Enable debug logging")
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

    if (!config.setupComplete || !checkAccess()) {
      await runSetup(opts);
    }

    await startBot(opts);
  });

registerStatus(program);
registerChats(program);
registerMessages(program);
registerSend(program);
registerListen(program);
registerMcp(program);

export { program };
