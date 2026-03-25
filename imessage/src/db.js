import Database from "better-sqlite3";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync } from "fs";
import { isGroupChat } from "./utils/handles.js";

const CONFIG_DIR = process.env.IMESSAGE_CLI_HOME || join(homedir(), ".imessage-cli");
const DB_PATH = join(CONFIG_DIR, "messages.db");

let db = null;
let stmts = null;

export function openDb() {
  mkdirSync(CONFIG_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      jid         TEXT    NOT NULL,
      message_id  TEXT    NOT NULL,
      from_me     INTEGER NOT NULL DEFAULT 0,
      participant TEXT,
      push_name   TEXT,
      body        TEXT,
      timestamp   INTEGER NOT NULL,
      raw_message TEXT,
      PRIMARY KEY (jid, message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_jid_ts ON messages (jid, timestamp);

    CREATE TABLE IF NOT EXISTS conversation (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      role      TEXT    NOT NULL,
      content   TEXT    NOT NULL,
      timestamp INTEGER NOT NULL
    );

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

    CREATE TABLE IF NOT EXISTS group_conversations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      jid         TEXT    NOT NULL,
      role        TEXT    NOT NULL,
      content     TEXT    NOT NULL,
      sender_name TEXT,
      timestamp   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_group_conv_jid_ts ON group_conversations (jid, timestamp);
  `);

  stmts = {
    upsert: db.prepare(`
      INSERT OR REPLACE INTO messages (jid, message_id, from_me, participant, push_name, body, timestamp, raw_message)
      VALUES (@jid, @message_id, @from_me, @participant, @push_name, @body, @timestamp, @raw_message)
    `),
    getMessages: db.prepare(`
      SELECT * FROM messages
      WHERE jid = @jid AND timestamp >= @cutoff
      ORDER BY timestamp ASC
      LIMIT @limit
    `),
    getMessagesRecent: db.prepare(`
      SELECT * FROM messages
      WHERE jid = @jid AND timestamp >= @cutoff
      ORDER BY timestamp DESC
      LIMIT @limit
    `),
    searchMessages: db.prepare(`
      SELECT * FROM messages
      WHERE body LIKE @pattern
      ORDER BY timestamp DESC
      LIMIT 30
    `),
    searchMessagesBySender: db.prepare(`
      SELECT * FROM messages
      WHERE push_name LIKE @sender
      ORDER BY timestamp DESC
      LIMIT 30
    `),
    searchMessagesBySenderAndQuery: db.prepare(`
      SELECT * FROM messages
      WHERE push_name LIKE @sender AND body LIKE @pattern
      ORDER BY timestamp DESC
      LIMIT 30
    `),
    getContacts: db.prepare(`
      SELECT DISTINCT jid, push_name FROM messages
      WHERE from_me = 0 AND push_name IS NOT NULL
    `),
    saveConvMsg: db.prepare(`
      INSERT INTO conversation (role, content, timestamp) VALUES (@role, @content, @timestamp)
    `),
    loadConvHistory: db.prepare(`
      SELECT role, content, timestamp FROM conversation
      ORDER BY id DESC
      LIMIT @limit
    `),
    lastConvTimestamp: db.prepare(`
      SELECT timestamp FROM conversation ORDER BY id DESC LIMIT 1
    `),
    clearConv: db.prepare(`DELETE FROM conversation`),
    insertScheduled: db.prepare(`
      INSERT INTO scheduled_sends (jid, chat_name, content, scheduled_at, created_at)
      VALUES (@jid, @chatName, @content, @scheduledAt, @createdAt)
    `),
    getPendingSends: db.prepare(`
      SELECT * FROM scheduled_sends
      WHERE status = 'pending' AND scheduled_at <= @now
      ORDER BY scheduled_at ASC
    `),
    markSendStatus: db.prepare(`
      UPDATE scheduled_sends SET status = @status, error = @error WHERE id = @id
    `),
    listPendingSends: db.prepare(`
      SELECT * FROM scheduled_sends WHERE status = 'pending' ORDER BY scheduled_at ASC
    `),
    cancelScheduled: db.prepare(`
      UPDATE scheduled_sends SET status = 'cancelled' WHERE id = @id AND status = 'pending'
    `),
    saveGroupMsg: db.prepare(`
      INSERT INTO group_conversations (jid, role, content, sender_name, timestamp)
      VALUES (@jid, @role, @content, @senderName, @timestamp)
    `),
    loadGroupHistory: db.prepare(`
      SELECT role, content, sender_name, timestamp FROM group_conversations
      WHERE jid = @jid
      ORDER BY id DESC
      LIMIT @limit
    `),
    lastGroupMsgTimestamp: db.prepare(`
      SELECT timestamp FROM group_conversations WHERE jid = @jid ORDER BY id DESC LIMIT 1
    `),
    clearGroupConv: db.prepare(`DELETE FROM group_conversations WHERE jid = @jid`),
  };

  console.log(`  [db] Opened ${DB_PATH}`);
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
    stmts = null;
  }
}

/**
 * Cache an iMessage into the bot's database.
 * @param {object} msg - Message from the poller
 */
export function upsertMessage(msg) {
  if (!db || !stmts) return;
  const chatId = msg.chatId;
  if (!chatId) return;

  const ts = msg.date ? Math.floor(msg.date.getTime() / 1000) : 0;
  if (!ts) return;

  let rawJson = null;
  try {
    rawJson = JSON.stringify(msg);
  } catch {
    // Non-serializable message — store without raw
  }

  stmts.upsert.run({
    jid: chatId,
    message_id: msg.guid,
    from_me: msg.isFromMe ? 1 : 0,
    participant: msg.handle || null,
    push_name: msg.handle || null,
    body: msg.text || null,
    timestamp: ts,
    raw_message: rawJson,
  });
}

export function getMessages(jid, days = 7, limit = 500) {
  if (!db || !stmts) return [];
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const rows = stmts.getMessagesRecent.all({ jid, cutoff, limit });
  return rows.reverse(); // chronological order
}

export function searchMessages(query, sender) {
  if (!db || !stmts) return [];
  let rows;
  if (sender && query) {
    rows = stmts.searchMessagesBySenderAndQuery.all({ sender: `%${sender}%`, pattern: `%${query}%` });
  } else if (sender) {
    rows = stmts.searchMessagesBySender.all({ sender: `%${sender}%` });
  } else {
    rows = stmts.searchMessages.all({ pattern: `%${query}%` });
  }

  return rows.map((row) => {
    const isGroup = isGroupChat(row.jid);
    return {
      chat: row.jid,
      type: isGroup ? "group" : "dm",
      sender: row.from_me ? "You" : (row.push_name || row.jid),
      time: new Date(row.timestamp * 1000).toLocaleString(),
      text: row.body && row.body.length > 200 ? row.body.slice(0, 200) + "..." : (row.body || "[media]"),
    };
  });
}

export function getContactsForResolve() {
  if (!db || !stmts) return [];
  return stmts.getContacts.all();
}

export function rowToFormatted(row) {
  return {
    sender: row.from_me ? "You" : (row.push_name || row.jid),
    time: new Date(row.timestamp * 1000).toLocaleString(),
    text: row.body || "[media]",
  };
}

export function saveConversationMessage(role, content) {
  if (!db || !stmts) return;
  stmts.saveConvMsg.run({ role, content, timestamp: Date.now() });
}

export function loadConversationHistory(inactivityMs, maxMessages) {
  if (!db || !stmts) return [];
  const last = stmts.lastConvTimestamp.get();
  if (!last || Date.now() - last.timestamp > inactivityMs) return [];
  const rows = stmts.loadConvHistory.all({ limit: maxMessages });
  return rows.reverse().map(r => ({ role: r.role, content: r.content }));
}

export function clearConversation() {
  if (!db || !stmts) return;
  stmts.clearConv.run();
}

export function insertScheduledSend(jid, chatName, content, scheduledAt) {
  if (!db || !stmts) return null;
  const result = stmts.insertScheduled.run({
    jid, chatName, content: JSON.stringify(content), scheduledAt, createdAt: Date.now(),
  });
  return result.lastInsertRowid;
}

export function getPendingSends() {
  if (!db || !stmts) return [];
  return stmts.getPendingSends.all({ now: Date.now() });
}

export function markSendStatus(id, status, error = null) {
  if (!db || !stmts) return;
  stmts.markSendStatus.run({ id, status, error });
}

export function listPendingSends() {
  if (!db || !stmts) return [];
  return stmts.listPendingSends.all();
}

export function cancelScheduledSend(id) {
  if (!db || !stmts) return false;
  const result = stmts.cancelScheduled.run({ id });
  return result.changes > 0;
}

// ── Group conversations ───────────────────────────────────

export function saveGroupMessage(jid, role, content, senderName = null) {
  if (!db || !stmts) return;
  stmts.saveGroupMsg.run({ jid, role, content, senderName, timestamp: Date.now() });
}

export function loadGroupHistory(jid, inactivityMs, maxMessages) {
  if (!db || !stmts) return [];
  const last = stmts.lastGroupMsgTimestamp.get({ jid });
  if (!last || Date.now() - last.timestamp > inactivityMs) return [];
  const rows = stmts.loadGroupHistory.all({ jid, limit: maxMessages });
  return rows.reverse().map(r => ({ role: r.role, content: r.content }));
}

export function clearGroupConversation(jid) {
  if (!db || !stmts) return;
  stmts.clearGroupConv.run({ jid });
}

export function runReadOnlyQuery(sql, limit = 50) {
  if (!db) return { error: "Database not open" };
  const trimmed = sql.trim().replace(/;+$/, "");
  if (!/^SELECT\b/i.test(trimmed)) {
    return { error: "Only SELECT queries are allowed" };
  }
  const finalSql = /\bLIMIT\b/i.test(trimmed) ? trimmed : trimmed + ` LIMIT ${limit}`;
  try {
    const rows = db.prepare(finalSql).all();
    return { count: rows.length, rows };
  } catch (err) {
    return { error: err.message };
  }
}

export function getMessageByKey(jid, messageId) {
  if (!db) return null;
  const stmt = db.prepare(`SELECT * FROM messages WHERE jid = @jid AND message_id = @messageId`);
  return stmt.get({ jid, messageId }) || null;
}
