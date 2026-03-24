import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const CONFIG_PATH = join(DATA_DIR, "config.json");

export function getDataDir() {
  mkdirSync(DATA_DIR, { recursive: true });
  return DATA_DIR;
}

export function readConfig() {
  try {
    if (!existsSync(CONFIG_PATH)) return {};
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function writeConfig(data) {
  mkdirSync(DATA_DIR, { recursive: true });
  const existing = readConfig();
  const merged = { ...existing, ...data };
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n", "utf8");
  return merged;
}

/**
 * Resolve LLM provider + key from env vars or config.
 */
export function resolveProvider() {
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", key: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: "openai", key: process.env.OPENAI_API_KEY };
  }
  const config = readConfig();
  if (config.llmProvider && config.llmKey) {
    return { provider: config.llmProvider, key: config.llmKey };
  }
  throw new Error("No LLM provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or configure in settings.");
}

/**
 * Get the WhatsApp host base URL.
 */
export function getWhatsAppHost() {
  const config = readConfig();
  return config.whatsappHost || process.env.WHATSAPP_HOST || "http://localhost:3100";
}

/**
 * Get the WhatsApp API token.
 */
export function getWhatsAppToken() {
  const config = readConfig();
  return config.whatsappToken || process.env.WHATSAPP_TOKEN || "";
}
