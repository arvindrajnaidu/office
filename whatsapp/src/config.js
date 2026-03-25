import { join } from "path";
import { homedir } from "os";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

const CONFIG_DIR = process.env.WHATSAPP_CLI_HOME || join(homedir(), ".whatsapp-cli");
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


