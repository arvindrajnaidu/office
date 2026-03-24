import { createInterface } from "readline";
import { createSocket, waitForConnection, getAuthDir, authExists, readSelfId } from "./session.js";
import { readConfig, writeConfig } from "./config.js";
import { success, info, error } from "./utils/formatters.js";
import { jidToPhone } from "./utils/jid.js";

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
    console.log("\nWelcome to WhatsApp CLI!\n");

    // Step 1: Login
    const authDir = getAuthDir(opts.authDir);
    if (authExists(authDir)) {
      const selfId = readSelfId(authDir);
      console.log(success(`Step 1/3: Already logged in as ${jidToPhone(selfId)}\n`));
    } else {
      console.log(info("Step 1/3: Link your WhatsApp account"));
      console.log("  1. Scan QR code");
      console.log("  2. Use pairing code (for headless/remote servers)");
      let loginChoice;
      while (true) {
        loginChoice = (await prompt(rl, "  > ")).trim();
        if (loginChoice === "1" || loginChoice === "2") break;
        console.log("  Please enter 1 or 2.");
      }

      let phone = null;
      if (loginChoice === "2") {
        phone = (await prompt(rl, "  Phone number (e.g. 60123456789): ")).trim().replace(/[^0-9]/g, "");
        if (!phone) {
          console.log(error("Phone number cannot be empty."));
          process.exit(1);
        }
        console.log();
      } else {
        console.log(info("\nScan the QR code with WhatsApp...\n"));
      }

      const MAX_RETRIES = 5;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const sock = await createSocket({ authDir, printQr: !phone, verbose: opts.verbose });

          if (phone) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            const code = await sock.requestPairingCode(phone);
            console.log(success(`  Pairing code: ${code}`));
            console.log(info("  Enter this code on your phone: WhatsApp > Linked Devices > Link with phone number\n"));
          }

          await waitForConnection(sock);
          const me = sock.user;
          console.log("\n" + success(`Logged in as ${me?.name || jidToPhone(me?.id)} (${jidToPhone(me?.id)})\n`));
          await sock.end();
          break;
        } catch (err) {
          const code = err?.output?.statusCode ?? err?.statusCode;
          const isRetryable = err.message?.includes("Stream Errored")
            || err.message?.includes("restart required")
            || err.message?.includes("Connection Closed")
            || code === 428
            || code === 515;
          if (isRetryable && attempt < MAX_RETRIES) {
            console.log(info(`Connection dropped, retrying (${attempt}/${MAX_RETRIES})...\n`));
            continue;
          }
          console.log(error("Login failed: " + err.message));
          process.exit(1);
        }
      }
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
