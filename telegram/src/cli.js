import { Command } from "commander";
import { registerStatus } from "./commands/status.js";
import { registerChats } from "./commands/chats.js";
import { registerMessages } from "./commands/messages.js";
import { registerSend } from "./commands/send.js";
import { registerListen } from "./commands/listen.js";
import { registerMcp } from "./commands/mcp.js";
import { readConfig } from "./config.js";
import { resolveToken } from "./session.js";
import { runSetup } from "./setup.js";
import { startBot } from "./bot/index.js";

const program = new Command();

program
  .name("telegram-bot")
  .description("Telegram Bot CLI — send messages, manage chats, and more via Telegram Bot API")
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

    if (!config.setupComplete || !resolveToken(config)) {
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
