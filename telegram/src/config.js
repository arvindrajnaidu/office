import { join } from "path";
import { homedir } from "os";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { upsertPersona, getPersonaByJid, deletePersonaRow } from "./db.js";

const CONFIG_DIR = process.env.TELEGRAM_CLI_HOME || join(homedir(), ".telegram-cli");
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

export function getOutputDir() {
  const dir = join(CONFIG_DIR, "output");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getPersonasDir() {
  const dir = join(CONFIG_DIR, "personas");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function loadPersonaByJid(jid) {
  const row = getPersonaByJid(jid);
  if (!row) return null;
  const filePath = join(getPersonasDir(), row.file_name);
  try {
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, "utf8").trim();
    const match = raw.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
    return match ? match[1].trim() : raw;
  } catch {
    return null;
  }
}

export function savePersona(jid, groupName, content) {
  const slug = groupName.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
  const fileName = `${slug}.md`;
  const filePath = join(getPersonasDir(), fileName);
  const frontmatter = `---\nchatId: ${jid}\nname: "${groupName}"\n---\n\n`;
  writeFileSync(filePath, frontmatter + content + "\n", "utf8");
  upsertPersona(jid, fileName, groupName);
  return fileName;
}

export function deletePersona(jid) {
  const row = getPersonaByJid(jid);
  if (!row) return false;
  const filePath = join(getPersonasDir(), row.file_name);
  try { if (existsSync(filePath)) unlinkSync(filePath); } catch { /* ignore */ }
  deletePersonaRow(jid);
  return true;
}
