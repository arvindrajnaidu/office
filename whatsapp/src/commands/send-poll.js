import { getAuthDir, authExists, connectAndWait } from "../session.js";
import { success, error, warn, info } from "../utils/formatters.js";
import { toJid } from "../utils/jid.js";
import { validatePollData, POLL_PRESETS } from "../utils/poll-helpers.js";

export function registerSendPoll(program) {
  program
    .command("send-poll <phone-or-jid> <question>")
    .description("Send a poll")
    .option("--option <value>", "Poll option (repeat for multiple)", collectOptions, [])
    .option("--preset <name>", "Use preset options: yes-no, rating, agreement")
    .action(async (phoneOrJid, question, opts, cmd) => {
      const globals = cmd.optsWithGlobals();
      const authDir = getAuthDir(globals.authDir);

      if (!authExists(authDir)) {
        console.log(info("Not logged in. Run: whatsapp login"));
        return;
      }

      let options = opts.option;

      if (opts.preset) {
        const preset = POLL_PRESETS[opts.preset];
        if (!preset) {
          console.error(error(`Unknown preset: ${opts.preset}. Available: ${Object.keys(POLL_PRESETS).join(", ")}`));
          process.exit(1);
        }
        options = preset;
      }

      const validation = validatePollData(question, options);
      if (!validation.isValid) {
        validation.errors.forEach((e) => console.error(error(e)));
        process.exit(1);
      }
      validation.warnings.forEach((w) => console.log(warn(w)));

      try {
        const jid = toJid(phoneOrJid);
        const sock = await connectAndWait({ authDir, verbose: globals.verbose });

        await sock.sendMessage(jid, {
          poll: {
            name: question,
            values: options,
            selectableCount: 1,
          },
        });
        console.log(success(`Poll sent to ${jid}`));

        await sock.end();
      } catch (err) {
        console.error(error("Failed to send poll: " + err.message));
        process.exit(1);
      }
    });
}

function collectOptions(value, previous) {
  return previous.concat([value]);
}
