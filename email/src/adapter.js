import {
  getMessages,
  searchMessages as dbSearchMessages,
  getContactsForResolve,
  listEmails,
  upsertSentEmail,
  insertScheduledSend,
  listPendingSends,
  cancelScheduledSend,
  runReadOnlyQuery,
} from "./db.js";
import {
  readConfig,
  writeConfig,
} from "./config.js";
import { resolveFromAddress } from "./session.js";

/**
 * Email ChannelAdapter — implements the @buzzie-ai/core adapter interface
 * using the Resend API.
 *
 * @param {object} opts
 * @param {Function} opts.getClient - returns Resend client instance
 * @returns {import('@buzzie-ai/core').ChannelAdapter}
 */
export function createEmailAdapter({ getClient }) {
  function getFrom() {
    return resolveFromAddress(readConfig()) || "bot@example.com";
  }

  return {
    // ── Required methods ─────────────────────────────────────

    async sendText(chatId, text) {
      const subject = text.split("\n")[0].slice(0, 78) || "Message";
      const { data, error } = await getClient().emails.send({
        from: getFrom(),
        to: chatId,
        subject,
        text,
      });
      if (error) throw new Error(error.message);
      if (data?.id) upsertSentEmail(data.id, getFrom(), chatId, subject, text);
    },

    async sendImage(chatId, buffer, opts = {}) {
      const { data, error } = await getClient().emails.send({
        from: getFrom(),
        to: chatId,
        subject: opts.caption || "Image",
        text: opts.caption || "See attached image.",
        attachments: [{
          content: buffer.toString("base64"),
          filename: opts.fileName || "image.jpg",
          content_type: opts.mimeType || "image/jpeg",
        }],
      });
      if (error) throw new Error(error.message);
      if (data?.id) upsertSentEmail(data.id, getFrom(), chatId, opts.caption || "Image", null);
    },

    async sendDocument(chatId, buffer, opts = {}) {
      const { data, error } = await getClient().emails.send({
        from: getFrom(),
        to: chatId,
        subject: opts.caption || "Document",
        text: opts.caption || "See attached document.",
        attachments: [{
          content: buffer.toString("base64"),
          filename: opts.fileName || "document",
          content_type: opts.mimeType || "application/octet-stream",
        }],
      });
      if (error) throw new Error(error.message);
      if (data?.id) upsertSentEmail(data.id, getFrom(), chatId, opts.caption || "Document", null);
    },

    async sendReaction(chatId, emoji, targetMsgKey) {
      // Email has no reaction concept — no-op
      console.log(`  [adapter] sendReaction not supported on email (${emoji})`);
    },

    async getGroups() {
      // No groups in email — return empty
      return [];
    },

    async getChats() {
      const emails = listEmails(50);
      // Group by recipient
      const chatMap = new Map();
      for (const e of emails) {
        const addr = e.from_me ? e.to_addr : e.from_addr;
        if (!chatMap.has(addr)) {
          chatMap.set(addr, {
            id: addr,
            name: addr,
            lastMessage: e.subject,
            timestamp: e.created_at,
          });
        }
      }
      return [...chatMap.values()];
    },

    async getMessages(chatId, query = {}) {
      const { days = 7, limit = 100 } = query;
      const rows = getMessages(chatId, days, limit);
      return rows.map(row => ({
        sender: row.from_me ? "You" : (row.push_name || row.jid),
        time: new Date(row.timestamp * 1000).toLocaleString(),
        text: row.body || "[no text]",
      }));
    },

    async getContacts() {
      const rows = getContactsForResolve();
      return rows.map(row => ({
        id: row.jid,
        name: row.push_name || row.jid,
      }));
    },

    // ── Optional methods ─────────────────────────────────────

    async searchMessages(query) {
      return dbSearchMessages(query);
    },

    async queryDb(sql) {
      return runReadOnlyQuery(sql);
    },

    async getScheduled() {
      const rows = listPendingSends();
      return rows.map(r => ({
        id: r.id, jid: r.jid, chatName: r.chat_name,
        content: (() => { try { return JSON.parse(r.content).text || "[email]"; } catch { return "[unknown]"; } })(),
        scheduledAt: new Date(r.scheduled_at).toISOString(),
      }));
    },

    async createScheduled(jid, chatName, message, sendAt) {
      const id = insertScheduledSend(jid, chatName, { text: message }, sendAt);
      return { ok: true, id, jid, chatName, scheduledAt: new Date(sendAt).toISOString() };
    },

    async cancelScheduled(id) {
      return cancelScheduledSend(id);
    },

    async getConfig() {
      const cfg = readConfig();
      const safe = { ...cfg };
      if (safe.llmKey) safe.llmKey = safe.llmKey.slice(0, 8) + "...";
      if (safe.resendApiKey) safe.resendApiKey = safe.resendApiKey.slice(0, 10) + "...";
      return safe;
    },

    async updateConfig(data) {
      writeConfig(data);
      return { ok: true };
    },
  };
}
