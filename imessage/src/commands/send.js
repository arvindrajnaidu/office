import { sendMessage, sendToGroupChat } from "../imessage/send.js";
import { success, error } from "../utils/formatters.js";

export function registerSend(program) {
  program
    .command("send <to> <message>")
    .description("Send an iMessage to a phone number, email, or group chat name")
    .option("--group", "Send to a group chat by display name")
    .action(async (to, message, opts) => {
      try {
        if (opts.group) {
          await sendToGroupChat(to, message);
        } else {
          await sendMessage(to, message);
        }
        console.log(success(`Message sent to ${to}`));
      } catch (err) {
        console.log(error(`Failed to send: ${err.message}`));
        process.exit(1);
      }
    });
}
