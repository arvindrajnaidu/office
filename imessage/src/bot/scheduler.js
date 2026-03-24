import { getPendingSends, markSendStatus } from "../db.js";
import { isGroupChat, extractHandle } from "../utils/handles.js";
import { sendMessage, sendToGroupChat } from "../imessage/send.js";

const POLL_INTERVAL_MS = 30_000;

async function tick() {
  const rows = getPendingSends();
  for (const row of rows) {
    try {
      const content = JSON.parse(row.content);
      const text = content.text || "";
      if (isGroupChat(row.jid)) {
        await sendToGroupChat(row.chat_name || row.jid, text);
      } else {
        const handle = extractHandle(row.jid);
        await sendMessage(handle, text);
      }
      markSendStatus(row.id, "sent");
      console.log(`  [scheduler] Sent scheduled #${row.id} to ${row.chat_name || row.jid}`);
    } catch (err) {
      markSendStatus(row.id, "failed", err.message);
      console.log(`  [scheduler] Failed #${row.id}: ${err.message}`);
    }
  }
}

export function startScheduler() {
  tick().catch(() => {});
  const interval = setInterval(() => tick().catch(() => {}), POLL_INTERVAL_MS);
  return () => clearInterval(interval);
}
