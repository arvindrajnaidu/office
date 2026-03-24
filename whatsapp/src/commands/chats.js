import { getAuthDir, authExists, connectAndWait } from "../session.js";
import { formatChat, error, info } from "../utils/formatters.js";
import { isGroupJid } from "../utils/jid.js";

export function registerChats(program) {
  program
    .command("chats")
    .description("List recent chats")
    .option("--group", "Show only group chats")
    .option("--limit <n>", "Max chats to show", "20")
    .option("--search <term>", "Filter chats by name")
    .action(async (opts, cmd) => {
      const globals = cmd.optsWithGlobals();
      const authDir = getAuthDir(globals.authDir);

      if (!authExists(authDir)) {
        console.log(info("Not logged in. Run: whatsapp login"));
        return;
      }

      try {
        const sock = await connectAndWait({ authDir, verbose: globals.verbose });

        // Fetch groups
        const groups = await sock.groupFetchAllParticipating();

        // Build chat list from store events
        let chats = [];

        // Collect chats from groups
        for (const [id, meta] of Object.entries(groups)) {
          chats.push({ id, name: meta.subject, unreadCount: 0 });
        }

        // Apply filters
        if (opts.group) {
          chats = chats.filter((c) => isGroupJid(c.id));
        }
        if (opts.search) {
          const term = opts.search.toLowerCase();
          chats = chats.filter(
            (c) => c.name?.toLowerCase().includes(term) || c.id.includes(term),
          );
        }

        const limit = parseInt(opts.limit, 10);
        chats = chats.slice(0, limit);

        if (chats.length === 0) {
          console.log(info("No chats found."));
        } else {
          console.log(`\nShowing ${chats.length} chat(s):\n`);
          chats.forEach((chat, i) => console.log(formatChat(chat, i)));
        }

        await sock.end();
      } catch (err) {
        console.error(error("Failed to fetch chats: " + err.message));
        process.exit(1);
      }
    });
}
