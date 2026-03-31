#!/usr/bin/env node

/**
 * Unified entrypoint that starts all configured buzzie-ai channels.
 * Channels missing required credentials are silently skipped.
 *
 * Environment:
 *   BACKEND_URL       — shared backend URL for all channels
 *   BACKEND_TOKEN     — optional Bearer token for backend requests
 *
 *   WHATSAPP_CLI_HOME — WhatsApp data dir (default: /data/whatsapp)
 *   TELEGRAM_CLI_HOME — Telegram data dir (default: /data/telegram)
 *   EMAIL_CLI_HOME    — Email data dir    (default: /data/email)
 *   VOICE_CLI_HOME    — Voice data dir    (default: /data/voice)
 *
 *   Channel-specific credentials — see README.md
 */

import fs from "fs";
import path from "path";

// ── Channel definitions ──────────────────────────────────────────

const channels = [
  {
    name: "whatsapp",
    homeEnv: "WHATSAPP_CLI_HOME",
    defaultHome: "/data/whatsapp",
    apiPort: 3101,
    portEnv: "WHATSAPP_API_PORT",
    canStart() {
      const home = process.env.WHATSAPP_CLI_HOME || this.defaultHome;
      return fs.existsSync(path.join(home, "auth", "creds.json"));
    },
    configExtras() {
      return { syncFullHistory: true };
    },
    async start() {
      const { startBot } = await import("../whatsapp/src/index.js");
      await startBot();
    },
  },
  {
    name: "telegram",
    homeEnv: "TELEGRAM_CLI_HOME",
    defaultHome: "/data/telegram",
    apiPort: 3102,
    portEnv: "TELEGRAM_API_PORT",
    canStart() {
      return !!process.env.TELEGRAM_BOT_TOKEN;
    },
    configExtras() {
      return { botToken: process.env.TELEGRAM_BOT_TOKEN };
    },
    async start() {
      const { startBot } = await import("../telegram/src/index.js");
      await startBot();
    },
  },
  {
    name: "email",
    homeEnv: "EMAIL_CLI_HOME",
    defaultHome: "/data/email",
    apiPort: 3103,
    portEnv: "EMAIL_API_PORT",
    canStart() {
      return !!process.env.RESEND_API_KEY;
    },
    configExtras() {
      return {
        resendApiKey: process.env.RESEND_API_KEY,
        fromAddress: process.env.EMAIL_FROM,
      };
    },
    async start() {
      const { startBot } = await import("../email/src/index.js");
      await startBot();
    },
  },
  {
    name: "voice",
    homeEnv: "VOICE_CLI_HOME",
    defaultHome: "/data/voice",
    apiPort: 3100,
    portEnv: "VOICE_API_PORT",
    canStart() {
      return !!process.env.TWILIO_ACCOUNT_SID;
    },
    configExtras() {
      return {
        twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
        twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
        twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
        openaiApiKey: process.env.OPENAI_API_KEY,
        webhookUrl: process.env.WEBHOOK_URL,
        ttsVoice: process.env.TTS_VOICE || "nova",
      };
    },
    async start() {
      const { startBot } = await import("../voice/src/index.js");
      await startBot();
    },
  },
];

// ── Helpers ──────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeConfig(home, extras) {
  const configPath = path.join(home, "config.json");
  let existing = {};
  if (fs.existsSync(configPath)) {
    try { existing = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch {}
  }

  const backendUrl = process.env.BACKEND_URL;
  const backendToken = process.env.BACKEND_TOKEN;

  const config = {
    ...existing,
    ...extras,
    setupComplete: true,
  };

  // Only set backend if BACKEND_URL is provided and not already configured
  if (backendUrl && !existing.backend) {
    config.backend = {
      type: "http",
      url: backendUrl,
    };
    if (backendToken) {
      config.backend.headers = { Authorization: `Bearer ${backendToken}` };
    }
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log("buzzie-ai: starting all configured channels...\n");

  const started = [];
  const skipped = [];
  const startPromises = [];

  for (const ch of channels) {
    // Set home directory
    const home = process.env[ch.homeEnv] || ch.defaultHome;
    process.env[ch.homeEnv] = home;
    ensureDir(home);

    if (!ch.canStart()) {
      skipped.push(ch.name);
      console.log(`  [skip] ${ch.name} — not configured`);
      continue;
    }

    // Write per-channel API port into config so each channel reads its own
    const port = process.env[ch.portEnv] || ch.apiPort;
    writeConfig(home, {
      ...ch.configExtras(),
      api: { port: Number(port) },
    });

    // Start channel
    const promise = ch.start().catch((err) => {
      console.error(`  [error] ${ch.name} crashed: ${err.message}`);
    });
    startPromises.push(promise);

    started.push(`${ch.name} (:${port})`);
    console.log(`  [start] ${ch.name} on port ${port}`);
  }

  console.log(`\nbuzzie-ai: ${started.length} channel(s) started, ${skipped.length} skipped`);
  if (started.length > 0) console.log(`  active: ${started.join(", ")}`);
  if (skipped.length > 0) console.log(`  skipped: ${skipped.join(", ")}`);

  if (started.length === 0) {
    console.error("\nNo channels configured. Pass environment variables to enable channels:\n");
    console.error("  BACKEND_URL                  Your brain's HTTP endpoint (required)");
    console.error("");
    console.error("  WhatsApp    Pre-seed auth in $WHATSAPP_CLI_HOME/auth/creds.json");
    console.error("  Telegram    TELEGRAM_BOT_TOKEN       Bot token from @BotFather");
    console.error("  Email       RESEND_API_KEY            Resend API key");
    console.error("              EMAIL_FROM                Sender address");
    console.error("  Voice       TWILIO_ACCOUNT_SID        Twilio account SID");
    console.error("              TWILIO_AUTH_TOKEN          Twilio auth token");
    console.error("              TWILIO_PHONE_NUMBER        Twilio phone number");
    console.error("              OPENAI_API_KEY             OpenAI key (STT/TTS)");
    console.error("              WEBHOOK_URL                Public URL for callbacks");
    console.error("");
    console.error("  Docs: https://github.com/arvindrajnaidu/office/tree/main/all-channels");
    process.exit(1);
  }

  // Keep process alive — channels run their own event loops
  await Promise.all(startPromises);
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
