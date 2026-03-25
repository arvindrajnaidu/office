import chalk from "chalk";

export function formatCall(call, index) {
  const from = chalk.green(call.from_number);
  const status = call.status === "completed" ? chalk.dim("[completed]") : chalk.yellow(`[${call.status}]`);
  const duration = call.duration ? chalk.dim(`${call.duration}s`) : "";
  const time = chalk.dim(new Date(call.started_at).toLocaleString());
  return `  ${chalk.dim(`${index + 1}.`)} ${from} ${status} ${duration} ${time}\n     ${chalk.dim(call.call_sid)}`;
}

export function success(text) { return chalk.green("✓ " + text); }
export function error(text) { return chalk.red("✗ " + text); }
export function info(text) { return chalk.blue("ℹ " + text); }
export function warn(text) { return chalk.yellow("⚠ " + text); }
