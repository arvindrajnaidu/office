import { checkApiKey, resolveApiKey, resolveFromAddress } from "../session.js";
import { readConfig, getConfigPath } from "../config.js";
import { success, error, info } from "../utils/formatters.js";

export function registerStatus(program) {
  program
    .command("status")
    .description("Check Resend API key and configuration")
    .action(async () => {
      const config = readConfig();
      const apiKey = resolveApiKey(config);

      if (!apiKey) {
        console.log(error("No Resend API key configured. Run setup or set RESEND_API_KEY."));
        return;
      }

      const result = await checkApiKey(apiKey);
      if (result.ok) {
        console.log(success("Resend API key valid"));
        const domains = result.domains || [];
        if (domains.length > 0) {
          domains.forEach(d => console.log(info(`Domain: ${d.name} (${d.status})`)));
        } else {
          console.log(info("No verified domains"));
        }
      } else {
        console.log(error(`API key invalid: ${result.error}`));
      }

      const from = resolveFromAddress(config);
      console.log(info(`From address: ${from || "not configured"}`));
      console.log(info(`Config: ${getConfigPath()}`));
      console.log(info(`LLM provider: ${config.llmProvider || "not configured"}`));
      console.log(info(`Setup complete: ${config.setupComplete ? "yes" : "no"}`));
    });
}
