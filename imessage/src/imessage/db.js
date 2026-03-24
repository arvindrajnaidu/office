import { execFileSync } from "child_process";
import { homedir } from "os";
import { join } from "path";

const DEFAULT_DB_PATH = join(homedir(), "Library", "Messages", "chat.db");

/**
 * Run a SQL query against the iMessage database using the macOS sqlite3 CLI.
 * Returns parsed JSON rows. Zero native dependencies needed.
 *
 * @param {string} sql - The SQL query to execute
 * @param {string} [dbPath] - Override path to chat.db
 * @returns {Array<object>}
 */
function query(sql, dbPath = DEFAULT_DB_PATH) {
  // Use sqlite3's JSON output mode for easy parsing
  const result = execFileSync("sqlite3", ["-json", "-readonly", dbPath, sql], {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large result sets
  });

  if (!result.trim()) return [];

  try {
    return JSON.parse(result);
  } catch {
    // If JSON parsing fails, return raw output as single-row result
    return [{ raw: result.trim() }];
  }
}

/**
 * Run a SQL query that returns a single scalar value.
 * @param {string} sql
 * @param {string} [dbPath]
 * @returns {*}
 */
function queryScalar(sql, dbPath = DEFAULT_DB_PATH) {
  const rows = query(sql, dbPath);
  if (rows.length === 0) return null;
  const keys = Object.keys(rows[0]);
  return rows[0][keys[0]];
}

/**
 * Escape a string for safe inclusion in SQL (prevents SQL injection).
 * @param {string} str
 * @returns {string}
 */
function esc(str) {
  if (str == null) return "NULL";
  return `'${String(str).replace(/'/g, "''")}'`;
}

/**
 * Get recent messages, optionally filtered by a contact handle (phone/email).
 * @param {object} opts
 * @param {string}  [opts.handle]     - Filter by phone number or email
 * @param {number}  [opts.limit]      - Max messages to return (default 50)
 * @param {number}  [opts.sinceRowId] - Only return messages with ROWID > this value (for polling)
 * @param {string}  [opts.chatId]     - Filter by chat identifier
 * @param {string}  [opts.dbPath]     - Override chat.db path
 * @returns {Array<object>}
 */
export function getMessages(opts = {}) {
  const { handle, limit = 50, sinceRowId, chatId, dbPath } = opts;

  let sql = `
    SELECT
      m.ROWID            AS rowid,
      m.guid             AS guid,
      m.text             AS text,
      m.is_from_me       AS isFromMe,
      m.date / 1000000000 + 978307200 AS dateUnix,
      m.date_read / 1000000000 + 978307200 AS dateReadUnix,
      m.service           AS service,
      h.id               AS handle,
      c.chat_identifier  AS chatId,
      c.display_name     AS chatDisplayName
    FROM message m
    LEFT JOIN handle h ON m.handle_id = h.ROWID
    LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
    LEFT JOIN chat c ON cmj.chat_id = c.ROWID
    WHERE 1=1
  `;

  if (handle) {
    sql += ` AND h.id = ${esc(handle)}`;
  }
  if (chatId) {
    sql += ` AND c.chat_identifier = ${esc(chatId)}`;
  }
  if (sinceRowId) {
    sql += ` AND m.ROWID > ${Number(sinceRowId)}`;
  }

  sql += ` ORDER BY m.date DESC LIMIT ${Number(limit)}`;

  const rows = query(sql, dbPath);

  return rows.map((row) => ({
    rowid: row.rowid,
    guid: row.guid,
    text: row.text,
    isFromMe: row.isFromMe === 1,
    date: row.dateUnix ? new Date(row.dateUnix * 1000) : null,
    dateRead: row.dateReadUnix ? new Date(row.dateReadUnix * 1000) : null,
    service: row.service,
    handle: row.handle,
    chatId: row.chatId,
    chatDisplayName: row.chatDisplayName,
  }));
}

/**
 * List all conversations (chats) with the latest message info.
 * @param {object} [opts]
 * @param {number} [opts.limit=20]
 * @param {string} [opts.dbPath]
 * @returns {Array<object>}
 */
export function getChats(opts = {}) {
  const { limit = 20, dbPath } = opts;

  const sql = `
    SELECT
      c.ROWID             AS rowid,
      c.chat_identifier   AS chatId,
      c.display_name      AS displayName,
      c.service_name      AS service,
      (
        SELECT m.text
        FROM message m
        JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        WHERE cmj.chat_id = c.ROWID
        ORDER BY m.date DESC
        LIMIT 1
      ) AS lastMessageText,
      (
        SELECT m.date / 1000000000 + 978307200
        FROM message m
        JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        WHERE cmj.chat_id = c.ROWID
        ORDER BY m.date DESC
        LIMIT 1
      ) AS lastMessageDateUnix
    FROM chat c
    ORDER BY lastMessageDateUnix DESC
    LIMIT ${Number(limit)}
  `;

  const rows = query(sql, dbPath);

  return rows.map((row) => ({
    rowid: row.rowid,
    chatId: row.chatId,
    displayName: row.displayName || row.chatId,
    service: row.service,
    lastMessageText: row.lastMessageText,
    lastMessageDate: row.lastMessageDateUnix
      ? new Date(row.lastMessageDateUnix * 1000)
      : null,
  }));
}

/**
 * Get the highest message ROWID (useful as a baseline for polling).
 * @param {string} [dbPath]
 * @returns {number}
 */
export function getLatestRowId(dbPath) {
  return queryScalar("SELECT MAX(ROWID) FROM message", dbPath) ?? 0;
}

/**
 * Search messages by text content.
 * @param {string} searchText
 * @param {object} [opts]
 * @param {number} [opts.limit=20]
 * @param {string} [opts.dbPath]
 * @returns {Array<object>}
 */
export function searchMessages(searchText, opts = {}) {
  const { limit = 50, dbPath } = opts;

  // Use SQL LIKE for server-side filtering (much faster than fetching all)
  const escaped = String(searchText).replace(/'/g, "''").replace(/%/g, "\\%").replace(/_/g, "\\_");

  const sql = `
    SELECT
      m.ROWID            AS rowid,
      m.guid             AS guid,
      m.text             AS text,
      m.is_from_me       AS isFromMe,
      m.date / 1000000000 + 978307200 AS dateUnix,
      m.service           AS service,
      h.id               AS handle,
      c.chat_identifier  AS chatId,
      c.display_name     AS chatDisplayName
    FROM message m
    LEFT JOIN handle h ON m.handle_id = h.ROWID
    LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
    LEFT JOIN chat c ON cmj.chat_id = c.ROWID
    WHERE m.text LIKE '%${escaped}%' ESCAPE '\\'
    ORDER BY m.date DESC
    LIMIT ${Number(limit)}
  `;

  const rows = query(sql, dbPath);

  return rows.map((row) => ({
    rowid: row.rowid,
    guid: row.guid,
    text: row.text,
    isFromMe: row.isFromMe === 1,
    date: row.dateUnix ? new Date(row.dateUnix * 1000) : null,
    service: row.service,
    handle: row.handle,
    chatId: row.chatId,
    chatDisplayName: row.chatDisplayName,
  }));
}
