import { Command } from "commander";
import { registerStatus } from "./commands/status.js";
import { registerCalls } from "./commands/calls.js";
import { registerMcp } from "./commands/mcp.js";
import { readConfig } from "./config.js";
import { runSetup } from "./setup.js";
import { startBot } from "./bot/index.js";

const program = new Command();

program
  .name("voice-bot")
  .description("Voice Bot CLI — answer phone calls with AI via Twilio")
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

    if (!config.setupComplete) {
      await runSetup(opts);
    }

    await startBot(opts);
  });

registerStatus(program);
registerCalls(program);
registerMcp(program);

export { program };
