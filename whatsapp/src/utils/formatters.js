import chalk from "chalk";
import { normalizeMessageContent, extractMessageContent } from "@whiskeysockets/baileys";
import { jidToPhone, isGroupJid } from "./jid.js";

export function formatChat(chat, index) {
  const name = chat.name || jidToPhone(chat.id);
  const type = isGroupJid(chat.id) ? chalk.cyan("[group]") : chalk.green("[dm]");
  const unread = chat.unreadCount ? chalk.yellow(` (${chat.unreadCount} unread)`) : "";
  return `  ${chalk.dim(`${index + 1}.`)} ${type} ${chalk.bold(name)}${unread}\n     ${chalk.dim(chat.id)}`;
}

function unwrap(rawMessage) {
  // Baileys wraps ephemeral, view-once, and other containers — unwrap them
  const normalized = normalizeMessageContent(rawMessage);
  if (!normalized) return null;
  const extracted = extractMessageContent(normalized);
  return extracted || normalized;
}

export function extractBody(msg) {
  const m = unwrap(msg.message);
  if (!m) return null;

  return m.conversation
    || m.extendedTextMessage?.text
    || m.imageMessage?.caption
    || m.videoMessage?.caption
    || m.documentMessage?.caption
    || m.pollCreationMessage?.name
    || m.pollCreationMessageV3?.name
    || m.contactMessage?.displayName
    || m.locationMessage?.name
    || m.liveLocationMessage?.caption
    || m.listResponseMessage?.title
    || m.buttonsResponseMessage?.selectedDisplayText
    || m.templateButtonReplyMessage?.selectedDisplayText
    || m.reactionMessage?.text
    || (m.stickerMessage && "[sticker]")
    || (m.audioMessage && "[audio]")
    || (m.imageMessage && "[image]")
    || (m.videoMessage && "[video]")
    || (m.documentMessage && `[document: ${m.documentMessage.fileName || "file"}]`)
    || (m.contactMessage && "[contact]")
    || (m.locationMessage && "[location]")
    || null;
}

export function formatMessage(msg) {
  const from = msg.key.fromMe ? chalk.blue("You") : chalk.green(jidToPhone(msg.key.participant || msg.key.remoteJid));
  const time = msg.messageTimestamp
    ? chalk.dim(new Date(Number(msg.messageTimestamp) * 1000).toLocaleString())
    : "";
  const body = extractBody(msg) || chalk.dim(`[unknown: ${Object.keys(msg.message || {}).join(", ")}]`);
  return `${from} ${time}\n  ${body}`;
}

export function success(text) {
  return chalk.green("✓ " + text);
}

export function error(text) {
  return chalk.red("✗ " + text);
}

export function info(text) {
  return chalk.blue("ℹ " + text);
}

export function warn(text) {
  return chalk.yellow("⚠ " + text);
}
