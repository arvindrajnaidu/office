import { createInterface } from "readline";
import { checkTwilioCredentials, checkOpenAIKey } from "./session.js";
import { readConfig, writeConfig, resolveTwilioConfig, resolveOpenAIKey } from "./config.js";
import { success, info, error } from "./utils/formatters.js";

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

export async function runSetup(opts = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log("\nWelcome to Voice Bot CLI (Twilio)!\n");
    const config = readConfig();

    // Step 1: Twilio credentials
    const twilio = resolveTwilioConfig(config);
    if (twilio.accountSid && twilio.authToken) {
      process.stdout.write(info("Step 1/3: Verifying Twilio credentials..."));
      const result = await checkTwilioCredentials(twilio.accountSid, twilio.authToken);
      if (result.ok) {
        console.log(" " + success(`${result.friendlyName}\n`));
      } else {
        console.log("\n" + error(`Invalid: ${result.error}`));
        process.exit(1);
      }
    } else {
      console.log(info("Step 1/3: Enter your Twilio credentials"));
      console.log("  Get them from https://console.twilio.com\n");

      const accountSid = (await prompt(rl, "  Account SID: ")).trim();
      const authToken = (await prompt(rl, "  Auth Token: ")).trim();
      const phoneNumber = (await prompt(rl, "  Phone Number (e.g. +18005551234): ")).trim();

      if (!accountSid || !authToken || !phoneNumber) {
        console.log(error("All fields are required."));
        process.exit(1);
      }

      process.stdout.write("  Verifying...");
      const result = await checkTwilioCredentials(accountSid, authToken);
      if (!result.ok) {
        console.log("\n" + error(`Invalid credentials: ${result.error}`));
        process.exit(1);
      }
      console.log(" " + success(`${result.friendlyName}\n`));
      writeConfig({ twilioAccountSid: accountSid, twilioAuthToken: authToken, twilioPhoneNumber: phoneNumber });
    }

    // Step 2: OpenAI API key
    const openaiKey = resolveOpenAIKey(config);
    if (openaiKey) {
      process.stdout.write(info("Step 2/3: Verifying OpenAI key..."));
      const result = await checkOpenAIKey(openaiKey);
      if (result.ok) {
        console.log(" " + success("Valid\n"));
      } else {
        console.log("\n" + error("Invalid OpenAI key"));
        process.exit(1);
      }
    } else {
      console.log(info("Step 2/3: Enter your OpenAI API key (for STT + TTS)"));
      const key = (await prompt(rl, "  > ")).trim();
      if (!key) { console.log(error("Key required.")); process.exit(1); }

      process.stdout.write("  Verifying...");
      const result = await checkOpenAIKey(key);
      if (!result.ok) { console.log("\n" + error("Invalid key.")); process.exit(1); }
      console.log(" " + success("Valid\n"));
      writeConfig({ openaiApiKey: key });
    }

    // Step 3: Webhook URL
    const existingUrl = process.env.WEBHOOK_URL || config.webhookUrl;
    if (existingUrl) {
      console.log(success(`Step 3/3: Webhook URL: ${existingUrl}\n`));
    } else {
      console.log(info("Step 3/3: Enter your public webhook URL"));
      console.log("  This is where Twilio will send call events.");
      console.log("  For dev: cloudflared tunnel --url http://localhost:3100");
      console.log("  For prod: your server's public URL\n");
      const webhookUrl = (await prompt(rl, "  > ")).trim();
      if (!webhookUrl) { console.log(error("URL required.")); process.exit(1); }
      writeConfig({ webhookUrl });
    }

    writeConfig({ setupComplete: true });
    console.log(success("Setup complete!\n"));
  } finally {
    rl.close();
  }
}
