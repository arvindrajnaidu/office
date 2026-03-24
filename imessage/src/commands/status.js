import { checkAccess } from "../session.js";
import { readConfig, getConfigPath } from "../config.js";
import { success, error, info } from "../utils/formatters.js";

export function registerStatus(program) {
  program
    .command("status")
    .description("Check iMessage access and configuration status")
    .action(async () => {
      if (checkAccess()) {
        console.log(success("iMessage database accessible (Full Disk Access granted)"));
      } else {
        console.log(error("Cannot read iMessage database. Grant Full Disk Access to your terminal."));
      }

      const config = readConfig();
      console.log(info(`Config: ${getConfigPath()}`));
      console.log(info(`LLM provider: ${config.llmProvider || "not configured"}`));
      console.log(info(`Setup complete: ${config.setupComplete ? "yes" : "no"}`));
    });
}
