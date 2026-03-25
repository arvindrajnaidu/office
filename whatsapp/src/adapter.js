import { jidToPhone } from "./utils/jid.js";
import {
  getMessages,
  searchMessages as dbSearchMessages,
  getContactsForResolve,
  insertScheduledSend,
  listPendingSends,
  cancelScheduledSend,
  runReadOnlyQuery,
} from "./db.js";
import {
  readConfig,
  writeConfig,
} from "./config.js";

/**
 * WhatsApp ChannelAdapter — implements the @buzzie-ai/core adapter interface
 * using Baileys socket + SQLite database.
 *
 * @param {object} opts
 * @param {Function} opts.getSock - returns current Baileys socket (getter for reconnection support)
 * @param {Function} opts.safeSend - safeSend(jid, content, options) wrapper
 * @param {string} opts.selfJid - bot's own JID
 * @param {Function} opts.getGroups - returns current groups array
 * @returns {import('@buzzie-ai/core').ChannelAdapter}
 */
export function createWhatsAppAdapter({ getSock, safeSend, selfJid, getGroups }) {
  return {
    // ── Required methods ─────────────────────────────────────

    async sendText(chatId, text) {
      await safeSend(chatId, { text });
    },

    async sendImage(chatId, buffer, opts = {}) {
      await safeSend(chatId, {
        image: buffer,
        mimetype: opts.mimeType || "image/jpeg",
        caption: opts.caption || undefined,
        fileName: opts.fileName || undefined,
      });
    },

    async sendDocument(chatId, buffer, opts = {}) {
      await safeSend(chatId, {
        document: buffer,
        mimetype: opts.mimeType || "application/octet-stream",
        fileName: opts.fileName || "file",
        caption: opts.caption || undefined,
      });
    },

    async sendReaction(chatId, emoji, targetMsgKey) {
      await safeSend(chatId, {
        react: { text: emoji, key: targetMsgKey },
      });
    },

    async getGroups() {
      const groups = getGroups();
      return groups.map((g) => ({
        id: g.id,
        name: g.subject,
        memberCount: g.size || g.participants?.length || 0,
      }));
    },

    async getChats() {
      const groups = getGroups();
      return groups.map((g) => ({
        id: g.id,
        name: g.subject,
        lastMessage: null,
        timestamp: g.creation || null,
      }));
    },

    async getMessages(chatId, query = {}) {
      const { days = 7, limit = 100 } = query;
      const rows = getMessages(chatId, days, limit);
      return rows.map((row) => ({
        sender: row.from_me ? "You" : (row.push_name || jidToPhone(row.participant || row.jid)),
        time: new Date(row.timestamp * 1000).toLocaleString(),
        text: row.body || "[media]",
      }));
    },

    async getContacts() {
      const rows = getContactsForResolve(selfJid);
      return rows.map((row) => ({
        id: row.jid,
        name: row.push_name || jidToPhone(row.jid),
      }));
    },

    // ── Optional methods ─────────────────────────────────────

    async searchMessages(query, sender) {
      const groups = getGroups();
      const groupNames = new Map(groups.map((g) => [g.id, g.subject]));
      const results = dbSearchMessages(
        query || null,
        selfJid,
        groupNames,
        sender || null,
      );
      return results;
    },

    async extractLinks(chatId, days = 7) {
      const URL_REGEX = /https?:\/\/[^\s<>"']+/g;
      const rows = getMessages(chatId, days, 10000);
      const urls = new Map();
      for (const row of rows) {
        if (!row.body) continue;
        const matches = row.body.match(URL_REGEX);
        if (!matches) continue;
        for (const url of matches) {
          const clean = url.replace(/[.,;:!?)]+$/, "");
          if (!urls.has(clean)) {
            let platform = "Other";
            if (/instagram\.com|instagr\.am/i.test(clean)) platform = "Instagram";
            else if (/youtube\.com|youtu\.be/i.test(clean)) platform = "YouTube";
            else if (/facebook\.com|fb\.watch/i.test(clean)) platform = "Facebook";
            else if (/tiktok\.com/i.test(clean)) platform = "TikTok";
            else if (/twitter\.com|x\.com/i.test(clean)) platform = "Twitter/X";
            urls.set(clean, platform);
          }
        }
      }
      const links = [...urls.entries()].map(([url, platform]) => ({ url, platform }));
      return { chatId, count: links.length, links };
    },

    async sendVideo(chatId, buffer, opts = {}) {
      await safeSend(chatId, {
        video: buffer,
        mimetype: opts.mimeType || "video/mp4",
        caption: opts.caption || "",
        fileName: opts.fileName || undefined,
      });
    },

    async sendPoll(chatId, question, options) {
      await safeSend(chatId, {
        poll: { name: question, values: options, selectableCount: 1 },
      });
    },

      return { ok: true, file, type };
    },

    async queryDb(sql) {
      return runReadOnlyQuery(sql);
    },

    async getScheduled() {
      const rows = listPendingSends();
      return rows.map((r) => ({
        id: r.id,
        jid: r.jid,
        chatName: r.chat_name,
        content: (() => { try { return JSON.parse(r.content).text || "[media]"; } catch { return "[unknown]"; } })(),
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
      // Redact sensitive keys
      const safe = { ...cfg };
      if (safe.llmKey) safe.llmKey = safe.llmKey.slice(0, 8) + "...";
      return safe;
    },

    async updateConfig(data) {
      const result = writeConfig(data);
      return { ok: true };
    },
  };
}
