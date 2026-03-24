import { createInterface } from "readline";
import { checkApiKey } from "./session.js";
import { readConfig, writeConfig } from "./config.js";
import { success, info, error } from "./utils/formatters.js";

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function validateAnthropicKey(key) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
  });
  return res.ok || res.status === 429;
}

async function validateOpenAIKey(key) {
  const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });
  return res.ok || res.status === 429;
}

export async function runSetup(opts = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log("\nWelcome to Email Bot CLI (Resend)!\n");

    // Step 1: Resend API Key
    const config = readConfig();
    const existingKey = process.env.RESEND_API_KEY || config.resendApiKey;

    if (existingKey) {
      process.stdout.write(info("Step 1/3: Verifying Resend API key..."));
      const result = await checkApiKey(existingKey);
      if (result.ok) {
        const domainNames = result.domains?.map(d => d.name).join(", ") || "none";
        console.log(" " + success(`Valid (domains: ${domainNames})\n`));
      } else {
        console.log("\n" + error(`Key invalid: ${result.error}`));
        process.exit(1);
      }
    } else {
      console.log(info("Step 1/3: Enter your Resend API key"));
      console.log("  Get one from https://resend.com/api-keys");
      const resendApiKey = (await prompt(rl, "  > ")).trim();

      if (!resendApiKey) {
        console.log(error("API key cannot be empty."));
        process.exit(1);
      }

      process.stdout.write("  Verifying...");
      const result = await checkApiKey(resendApiKey);
      if (!result.ok) {
        console.log("\n" + error(`Invalid key: ${result.error}`));
        process.exit(1);
      }
      const domainNames = result.domains?.map(d => d.name).join(", ") || "none";
      console.log(" " + success(`Valid (domains: ${domainNames})\n`));
      writeConfig({ resendApiKey });
    }

    // Step 2: Default from address
    const existingFrom = process.env.EMAIL_FROM || config.fromAddress;
    if (existingFrom) {
      console.log(success(`Step 2/3: From address: ${existingFrom}\n`));
    } else {
      console.log(info("Step 2/3: Enter your default sender email address"));
      console.log("  Must be on a verified domain in Resend");
      const fromAddress = (await prompt(rl, "  > ")).trim();
      if (!fromAddress || !fromAddress.includes("@")) {
        console.log(error("Invalid email address."));
        process.exit(1);
      }
      writeConfig({ fromAddress });
      console.log();
    }

    // Step 3: LLM Provider + Key
    console.log(info("Step 3/3: Choose your LLM provider"));
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

    const providerName = llmProvider === "anthropic" ? "Anthropic" : "OpenAI";
    console.log(info(`Enter your ${providerName} API key`));
    const llmKey = (await prompt(rl, "  > ")).trim();
    if (!llmKey) { console.log(error("API key cannot be empty.")); process.exit(1); }

    process.stdout.write("  Verifying...");
    const valid = llmProvider === "anthropic" ? await validateAnthropicKey(llmKey) : await validateOpenAIKey(llmKey);
    if (!valid) { console.log("\n" + error("Invalid API key.")); process.exit(1); }
    console.log(" " + success("Verified! Setup complete.\n"));

    writeConfig({ llmProvider, llmKey, setupComplete: true });
  } finally {
    rl.close();
  }
}
