import chalk from "chalk";
import { isGroupChat } from "./handles.js";

export function formatChat(chat, index) {
  const name = chat.displayName || chat.chatId;
  const type = isGroupChat(chat.chatId) ? chalk.cyan("[group]") : chalk.green("[dm]");
  const preview = chat.lastMessageText
    ? chalk.dim(chat.lastMessageText.slice(0, 60).replace(/\n/g, " "))
    : chalk.dim("[no messages]");
  const time = chat.lastMessageDate
    ? chalk.dim(chat.lastMessageDate.toLocaleString())
    : "";
  return `  ${chalk.dim(`${index + 1}.`)} ${type} ${chalk.bold(name)}\n     ${preview}  ${time}\n     ${chalk.dim(chat.chatId)}`;
}

export function formatMessage(msg) {
  const direction = msg.isFromMe ? chalk.blue("→") : chalk.green("←");
  const from = msg.isFromMe ? chalk.blue("You") : chalk.green(msg.handle || msg.chatDisplayName || "Unknown");
  const time = msg.date ? chalk.dim(msg.date.toLocaleString()) : "";
  const body = msg.text || chalk.dim("[media]");
  return `${direction} ${from} ${time}\n  ${body}`;
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
