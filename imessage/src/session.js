import { getChats, getMessages } from "./imessage/db.js";
import { MessagePoller } from "./imessage/poller.js";

/**
 * Verify that the iMessage database is accessible (Full Disk Access granted).
 * @param {string} [dbPath] - Override chat.db path
 * @returns {boolean}
 */
export function checkAccess(dbPath) {
  try {
    getChats({ limit: 1, dbPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a MessagePoller with bot-appropriate defaults.
 * @param {object} [opts]
 * @param {number}  [opts.interval=3000]     - Polling interval in ms
 * @param {string}  [opts.dbPath]            - Override chat.db path
 * @param {string}  [opts.handle]            - Filter to specific contact
 * @param {boolean} [opts.onlyIncoming=false] - Bot default: see self-messages too
 * @returns {MessagePoller}
 */
export function createPoller(opts = {}) {
  return new MessagePoller({
    interval: opts.interval ?? 3000,
    dbPath: opts.dbPath,
    handle: opts.handle,
    onlyIncoming: opts.onlyIncoming ?? false,
  });
}

/**
 * Auto-detect the user's own handle from recent sent messages in chat.db.
 * Looks at DM chats where we've sent messages and extracts the handle pattern.
 * @param {string} [dbPath]
 * @returns {string|null}
 */
export function detectSelfHandle(dbPath) {
  try {
    const msgs = getMessages({ limit: 20, dbPath });
    // Look at DM chats where isFromMe is true — the chatId contains our handle
    for (const msg of msgs) {
      if (msg.isFromMe && msg.chatId && !msg.chatId.startsWith("chat")) {
        // DM chatId format: "iMessage;-;+14155551234"
        const parts = msg.chatId.split(";");
        if (parts.length >= 3) {
          return parts[parts.length - 1];
        }
        return msg.chatId;
      }
    }
    return null;
  } catch {
    return null;
  }
}
