import { getPendingSends, markSendStatus } from "../db.js";

const POLL_INTERVAL_MS = 30_000;

async function tick(ctx) {
  const rows = getPendingSends();
  for (const row of rows) {
    try {
      const content = JSON.parse(row.content);
      await ctx.safeSend(row.jid, content);
      markSendStatus(row.id, "sent");
      console.log(`  [scheduler] Sent scheduled #${row.id} to ${row.chat_name || row.jid}`);
    } catch (err) {
      markSendStatus(row.id, "failed", err.message);
      console.log(`  [scheduler] Failed #${row.id}: ${err.message}`);
    }
  }
}

export function startScheduler(ctx) {
  tick(ctx).catch(() => {});
  const interval = setInterval(() => tick(ctx).catch(() => {}), POLL_INTERVAL_MS);
  return () => clearInterval(interval);
}
