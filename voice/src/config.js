import { join } from "path";
import { homedir } from "os";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

const CONFIG_DIR = process.env.VOICE_CLI_HOME || join(homedir(), ".voice-cli");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function readConfig() {
  try {
    if (!existsSync(CONFIG_PATH)) return {};
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function writeConfig(data) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const existing = readConfig();
  const merged = { ...existing, ...data };
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n", "utf8");
  return merged;
}

export function getConfigPath() {
  return CONFIG_PATH;
}

export function resolveWebhookUrl(config) {
  return (process.env.WEBHOOK_URL || config.webhookUrl || "").trim() || null;
}

export function resolveTwilioConfig(config) {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID || config.twilioAccountSid || null,
    authToken: process.env.TWILIO_AUTH_TOKEN || config.twilioAuthToken || null,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || config.twilioPhoneNumber || null,
  };
}

export function resolveOpenAIKey(config) {
  return process.env.OPENAI_API_KEY || config.openaiApiKey || null;
}

export function resolveTtsVoice(config) {
  return process.env.TTS_VOICE || config.ttsVoice || "coral";
}

const DEFAULT_TTS_INSTRUCTIONS =
  "Speak warmly and conversationally, like a helpful friend on the phone. " +
  "Use natural pacing with brief pauses between thoughts. " +
  "Do not sound like a customer service agent or IVR system.";

export function resolveTtsInstructions(config) {
  return process.env.TTS_INSTRUCTIONS || config.ttsInstructions || DEFAULT_TTS_INSTRUCTIONS;
}

export function resolveBackendConfig(config) {
  const url = process.env.BACKEND_URL;
  if (url) {
    const backend = { type: "http", url };
    const token = process.env.BUZZIE_API_TOKEN;
    if (token) {
      backend.headers = { Authorization: `Bearer ${token}` };
    }
    return backend;
  }
  return config.backend || { type: "builtin" };
}
