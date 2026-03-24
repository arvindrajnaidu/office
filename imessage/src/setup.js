import { createInterface } from "readline";
import { checkAccess } from "./session.js";
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
  return res.ok || res.status === 429; // 429 = rate limited but key is valid
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
    console.log("\nWelcome to iMessage CLI!\n");

    // Step 1: Verify Full Disk Access
    if (checkAccess()) {
      console.log(success("Step 1/2: iMessage database accessible (Full Disk Access granted)\n"));
    } else {
      console.log(error("Step 1/2: Cannot read iMessage database."));
      console.log(info("Grant Full Disk Access to your terminal app:"));
      console.log("  1. Open System Settings > Privacy & Security > Full Disk Access");
      console.log("  2. Enable your terminal app (Terminal, iTerm2, etc.)");
      console.log("  3. Restart your terminal and try again\n");
      process.exit(1);
    }

    // Step 2: LLM Provider + API Key
    console.log(info("Step 2/2: Choose your LLM provider"));
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
