import { getPendingSends, markSendStatus } from "../db.js";
import { resolveFromAddress } from "../session.js";
import { readConfig } from "../config.js";

const POLL_INTERVAL_MS = 30_000;

async function tick(client) {
  const rows = getPendingSends();
  const from = resolveFromAddress(readConfig()) || "bot@example.com";

  for (const row of rows) {
    try {
      const content = JSON.parse(row.content);
      const { error } = await client.emails.send({
        from,
        to: row.jid,
        subject: content.subject || content.text?.split("\n")[0]?.slice(0, 78) || "Scheduled message",
        text: content.text || "",
      });
      if (error) throw new Error(error.message);
      markSendStatus(row.id, "sent");
      console.log(`  [scheduler] Sent scheduled #${row.id} to ${row.chat_name || row.jid}`);
    } catch (err) {
      markSendStatus(row.id, "failed", err.message);
      console.log(`  [scheduler] Failed #${row.id}: ${err.message}`);
    }
  }
}

export function startScheduler(client) {
  tick(client).catch(() => {});
  const interval = setInterval(() => tick(client).catch(() => {}), POLL_INTERVAL_MS);
  return () => clearInterval(interval);
}
