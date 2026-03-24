import chalk from "chalk";

export function formatEmail(email, index) {
  const from = chalk.green(email.from_addr || email.from || "Unknown");
  const to = email.to_addr || email.to || "Unknown";
  const subject = chalk.bold(email.subject || "(no subject)");
  const status = email.status ? chalk.dim(`[${email.status}]`) : "";
  const time = email.created_at
    ? chalk.dim(new Date(typeof email.created_at === "number" ? email.created_at * 1000 : email.created_at).toLocaleString())
    : "";
  const prefix = index !== undefined ? chalk.dim(`${index + 1}. `) : "";
  return `${prefix}${from} → ${to} ${status} ${time}\n   ${subject}`;
}

export function formatReceivedEmail(email) {
  const from = chalk.green(email.from || "Unknown");
  const subject = chalk.bold(email.subject || "(no subject)");
  const time = email.created_at ? chalk.dim(new Date(email.created_at).toLocaleString()) : "";
  const body = email.text || email.html?.replace(/<[^>]+>/g, "").slice(0, 200) || chalk.dim("[no text]");
  return `${chalk.green("←")} ${from} ${time}\n   ${subject}\n   ${body}`;
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
