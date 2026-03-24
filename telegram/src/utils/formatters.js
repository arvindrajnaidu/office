import chalk from "chalk";

export function formatChat(chat, index) {
  const type = chat.chat_type === "private" ? chalk.green("[dm]") : chalk.cyan("[group]");
  const name = chat.title || chat.username || chat.chat_id;
  const username = chat.username ? chalk.dim(`@${chat.username}`) : "";
  const time = chat.updated_at ? chalk.dim(new Date(chat.updated_at * 1000).toLocaleString()) : "";
  return `  ${chalk.dim(`${index + 1}.`)} ${type} ${chalk.bold(name)} ${username}\n     ${chalk.dim(`id: ${chat.chat_id}`)}  ${time}`;
}

export function formatMessage(msg) {
  const fromMe = msg.from_me === 1;
  const direction = fromMe ? chalk.blue("→") : chalk.green("←");
  const from = fromMe ? chalk.blue("You") : chalk.green(msg.push_name || msg.participant || "Unknown");
  const time = msg.timestamp ? chalk.dim(new Date(msg.timestamp * 1000).toLocaleString()) : "";
  const body = msg.body || chalk.dim("[media]");
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
