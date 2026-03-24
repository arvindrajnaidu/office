import { createBot, resolveToken } from "../session.js";
import { readConfig } from "../config.js";
import { error, info } from "../utils/formatters.js";
import chalk from "chalk";

export function registerListen(program) {
  program
    .command("listen")
    .description("Stream incoming Telegram messages in real time")
    .action(async () => {
      const config = readConfig();
      const token = resolveToken(config);
      if (!token) {
        console.log(error("No bot token. Run setup or set TELEGRAM_BOT_TOKEN."));
        process.exit(1);
      }

      const bot = createBot(token);

      bot.on("message", (ctx) => {
        const msg = ctx.message;
        const from = msg.from?.first_name || msg.from?.username || "Unknown";
        const chatName = msg.chat.title || msg.chat.first_name || msg.chat.id;
        const chatType = msg.chat.type === "private" ? chalk.green("[dm]") : chalk.cyan("[group]");
        const text = msg.text || msg.caption || chalk.dim("[media]");
        const time = chalk.dim(new Date(msg.date * 1000).toLocaleString());

        console.log(`${chatType} ${chalk.bold(chatName)} | ${chalk.green(from)} ${time}`);
        console.log(`  ${text}\n`);
      });

      console.log(info("Listening for messages... (Ctrl+C to stop)\n"));

      bot.start();

      process.on("SIGINT", () => {
        bot.stop();
        process.exit(0);
      });
    });
}
