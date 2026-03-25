import Database from "better-sqlite3";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync } from "fs";

const CONFIG_DIR = process.env.VOICE_CLI_HOME || join(homedir(), ".voice-cli");
const DB_PATH = join(CONFIG_DIR, "calls.db");

let db = null;
let stmts = null;

export function openDb() {
  mkdirSync(CONFIG_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS calls (
      call_sid    TEXT PRIMARY KEY,
      from_number TEXT NOT NULL,
      to_number   TEXT NOT NULL,
      status      TEXT DEFAULT 'initiated',
      started_at  INTEGER NOT NULL,
      ended_at    INTEGER,
      duration    INTEGER
    );

    CREATE TABLE IF NOT EXISTS transcripts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      call_sid    TEXT NOT NULL,
      role        TEXT NOT NULL,
      content     TEXT NOT NULL,
      timestamp   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transcript_call ON transcripts (call_sid, timestamp);

    CREATE TABLE IF NOT EXISTS conversation (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      role      TEXT    NOT NULL,
      content   TEXT    NOT NULL,
      timestamp INTEGER NOT NULL
    );
  `);

  stmts = {
    upsertCall: db.prepare(`
      INSERT OR REPLACE INTO calls (call_sid, from_number, to_number, status, started_at, ended_at, duration)
      VALUES (@callSid, @fromNumber, @toNumber, @status, @startedAt, @endedAt, @duration)
    `),
    getCall: db.prepare(`SELECT * FROM calls WHERE call_sid = @callSid`),
    listCalls: db.prepare(`SELECT * FROM calls ORDER BY started_at DESC LIMIT @limit`),
    updateCallStatus: db.prepare(`UPDATE calls SET status = @status, ended_at = @endedAt, duration = @duration WHERE call_sid = @callSid`),
    addTranscript: db.prepare(`
      INSERT INTO transcripts (call_sid, role, content, timestamp)
      VALUES (@callSid, @role, @content, @timestamp)
    `),
    getTranscripts: db.prepare(`SELECT * FROM transcripts WHERE call_sid = @callSid ORDER BY timestamp ASC`),
    saveConvMsg: db.prepare(`INSERT INTO conversation (role, content, timestamp) VALUES (@role, @content, @timestamp)`),
    loadConvHistory: db.prepare(`SELECT role, content FROM conversation ORDER BY id DESC LIMIT @limit`),
    lastConvTimestamp: db.prepare(`SELECT timestamp FROM conversation ORDER BY id DESC LIMIT 1`),
  };

  console.log(`  [db] Opened ${DB_PATH}`);
  return db;
}

export function closeDb() {
  if (db) { db.close(); db = null; stmts = null; }
}

export function upsertCall(callSid, fromNumber, toNumber, status = "initiated") {
  if (!db || !stmts) return;
  stmts.upsertCall.run({ callSid, fromNumber, toNumber, status, startedAt: Date.now(), endedAt: null, duration: null });
}

export function updateCallStatus(callSid, status, duration = null) {
  if (!db || !stmts) return;
  stmts.updateCallStatus.run({ callSid, status, endedAt: Date.now(), duration });
}

export function getCall(callSid) {
  if (!db || !stmts) return null;
  return stmts.getCall.get({ callSid }) || null;
}

export function listCalls(limit = 50) {
  if (!db || !stmts) return [];
  return stmts.listCalls.all({ limit });
}

export function addTranscript(callSid, role, content) {
  if (!db || !stmts) return;
  stmts.addTranscript.run({ callSid, role, content, timestamp: Date.now() });
}

export function getTranscripts(callSid) {
  if (!db || !stmts) return [];
  return stmts.getTranscripts.all({ callSid });
}

export function loadConversationHistory(inactivityMs, maxMessages) {
  if (!db || !stmts) return [];
  const last = stmts.lastConvTimestamp.get();
  if (!last || Date.now() - last.timestamp > inactivityMs) return [];
  const rows = stmts.loadConvHistory.all({ limit: maxMessages });
  return rows.reverse().map(r => ({ role: r.role, content: r.content }));
}

export function saveConversationMessage(role, content) {
  if (!db || !stmts) return;
  stmts.saveConvMsg.run({ role, content, timestamp: Date.now() });
}
