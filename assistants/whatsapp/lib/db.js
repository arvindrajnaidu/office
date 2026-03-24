import Database from "better-sqlite3";
import { join } from "path";
import { getDataDir } from "./config.js";

let db = null;
let stmts = null;

function getDb() {
  if (db) return { db, stmts };

  const dbPath = join(getDataDir(), "assistant.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      jid         TEXT    NOT NULL,
      role        TEXT    NOT NULL,
      content     TEXT    NOT NULL,
      sender_name TEXT,
      timestamp   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_conv_jid_ts ON conversations (jid, timestamp);

    CREATE TABLE IF NOT EXISTS scheduled_sends (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      jid           TEXT    NOT NULL,
      chat_name     TEXT,
      content       TEXT    NOT NULL,
      scheduled_at  INTEGER NOT NULL,
      created_at    INTEGER NOT NULL,
      status        TEXT    NOT NULL DEFAULT 'pending',
      error         TEXT
    );
  `);

  stmts = {
    saveMsg: db.prepare(`
      INSERT INTO conversations (jid, role, content, sender_name, timestamp)
      VALUES (@jid, @role, @content, @senderName, @timestamp)
    `),
    loadHistory: db.prepare(`
      SELECT role, content, sender_name, timestamp FROM conversations
      WHERE jid = @jid
      ORDER BY id DESC
      LIMIT @limit
    `),
    lastTimestamp: db.prepare(`
      SELECT timestamp FROM conversations WHERE jid = @jid ORDER BY id DESC LIMIT 1
    `),
    clearConv: db.prepare(`DELETE FROM conversations WHERE jid = @jid`),
  };

  return { db, stmts };
}

/**
 * Save a conversation message.
 */
export function saveConversationMessage(jid, role, content, senderName = null) {
  const { stmts } = getDb();
  stmts.saveMsg.run({ jid, role, content, senderName, timestamp: Date.now() });
}

/**
 * Load conversation history for a JID, resetting if inactive.
 */
export function loadConversationHistory(jid, inactivityMs, maxMessages) {
  const { stmts } = getDb();
  const last = stmts.lastTimestamp.get({ jid });
  if (!last || Date.now() - last.timestamp > inactivityMs) return [];
  const rows = stmts.loadHistory.all({ jid, limit: maxMessages });
  return rows.reverse().map((r) => ({ role: r.role, content: r.content }));
}

/**
 * Clear conversation history for a JID.
 */
export function clearConversation(jid) {
  const { stmts } = getDb();
  stmts.clearConv.run({ jid });
}
