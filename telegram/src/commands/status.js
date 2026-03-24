import { checkToken, resolveToken } from "../session.js";
import { readConfig, getConfigPath } from "../config.js";
import { success, error, info } from "../utils/formatters.js";

export function registerStatus(program) {
  program
    .command("status")
    .description("Check Telegram bot connection and configuration")
    .action(async () => {
      const config = readConfig();
      const token = resolveToken(config);

      if (!token) {
        console.log(error("No bot token configured. Run setup or set TELEGRAM_BOT_TOKEN."));
        return;
      }

      const result = await checkToken(token);
      if (result.ok) {
        console.log(success(`Bot: @${result.botInfo.username} (${result.botInfo.first_name})`));
        console.log(info(`Bot ID: ${result.botInfo.id}`));
      } else {
        console.log(error(`Bot token invalid: ${result.error}`));
      }

      console.log(info(`Config: ${getConfigPath()}`));
      console.log(info(`LLM provider: ${config.llmProvider || "not configured"}`));
      console.log(info(`Setup complete: ${config.setupComplete ? "yes" : "no"}`));
    });
}
