import { checkTwilioCredentials, checkOpenAIKey } from "../session.js";
import { readConfig, getConfigPath, resolveTwilioConfig, resolveOpenAIKey, resolveWebhookUrl } from "../config.js";
import { success, error, info } from "../utils/formatters.js";

export function registerStatus(program) {
  program
    .command("status")
    .description("Check Twilio and OpenAI credentials")
    .action(async () => {
      const config = readConfig();
      const twilio = resolveTwilioConfig(config);

      if (twilio.accountSid && twilio.authToken) {
        const result = await checkTwilioCredentials(twilio.accountSid, twilio.authToken);
        if (result.ok) {
          console.log(success(`Twilio: ${result.friendlyName}`));
          console.log(info(`Phone: ${twilio.phoneNumber || "not set"}`));
        } else {
          console.log(error(`Twilio: ${result.error}`));
        }
      } else {
        console.log(error("Twilio credentials not configured."));
      }

      const openaiKey = resolveOpenAIKey(config);
      if (openaiKey) {
        const result = await checkOpenAIKey(openaiKey);
        console.log(result.ok ? success("OpenAI: valid") : error("OpenAI: invalid key"));
      } else {
        console.log(error("OpenAI key not configured."));
      }

      const webhookUrl = resolveWebhookUrl(config);
      console.log(info(`Webhook URL: ${webhookUrl || "not set"}`));
      console.log(info(`Config: ${getConfigPath()}`));
      console.log(info(`Setup complete: ${config.setupComplete ? "yes" : "no"}`));
    });
}
