import { createInterface } from "readline";
import { checkToken } from "./session.js";
import { readConfig, writeConfig } from "./config.js";
import { success, info, error } from "./utils/formatters.js";

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function validateAnthropicKey(key) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
  });
  return res.ok || res.status === 429;
}

async function validateOpenAIKey(key) {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  return res.ok || res.status === 429;
}

export async function runSetup(opts = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log("\nWelcome to Telegram Bot CLI!\n");

    // Step 1: Bot Token
    const config = readConfig();
    const existingToken = process.env.TELEGRAM_BOT_TOKEN || config.botToken;

    if (existingToken) {
      process.stdout.write(info("Step 1/3: Verifying bot token..."));
      const result = await checkToken(existingToken);
      if (result.ok) {
        console.log(" " + success(`@${result.botInfo.username} (${result.botInfo.first_name})\n`));
      } else {
        console.log("\n" + error(`Token invalid: ${result.error}`));
        process.exit(1);
      }
    } else {
      console.log(info("Step 1/3: Enter your Telegram bot token"));
      console.log("  Get one from @BotFather on Telegram: https://t.me/BotFather");
      const botToken = (await prompt(rl, "  > ")).trim();

      if (!botToken) {
        console.log(error("Bot token cannot be empty."));
        process.exit(1);
      }

      process.stdout.write("  Verifying...");
      const result = await checkToken(botToken);
      if (!result.ok) {
        console.log("\n" + error(`Invalid token: ${result.error}`));
        process.exit(1);
      }
      console.log(" " + success(`@${result.botInfo.username} (${result.botInfo.first_name})\n`));
      writeConfig({ botToken });
    }

    // Step 2: LLM Provider
    console.log(info("Step 2/3: Choose your LLM provider"));
    console.log("  1. Anthropic (Claude)");
    console.log("  2. OpenAI (GPT)");
    let choice;
    while (true) {
      choice = (await prompt(rl, "  > ")).trim();
      if (choice === "1" || choice === "2") break;
      console.log("  Please enter 1 or 2.");
    }
    const llmProvider = choice === "1" ? "anthropic" : "openai";
    console.log();

    // Step 3: API Key
    const providerName = llmProvider === "anthropic" ? "Anthropic" : "OpenAI";
    console.log(info(`Step 3/3: Enter your ${providerName} API key`));
    const llmKey = (await prompt(rl, "  > ")).trim();

    if (!llmKey) {
      console.log(error("API key cannot be empty."));
      process.exit(1);
    }

    process.stdout.write("  Verifying...");
    const valid = llmProvider === "anthropic"
      ? await validateAnthropicKey(llmKey)
      : await validateOpenAIKey(llmKey);

    if (!valid) {
      console.log("\n" + error("Invalid API key. Please check and try again."));
      process.exit(1);
    }
    console.log(" " + success("Verified! Setup complete.\n"));

    writeConfig({ llmProvider, llmKey, setupComplete: true });
  } finally {
    rl.close();
  }
}
