import { InputFile } from "grammy";
import {
  getMessages,
  searchMessages as dbSearchMessages,
  getContactsForResolve,
  listChats as dbListChats,
  listGroupChats,
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
 * Telegram ChannelAdapter — implements the @buzzie-ai/core adapter interface
 * using Grammy Bot API.
 *
 * @param {object} opts
 * @param {Function} opts.getBot - returns current Grammy Bot instance
 * @returns {import('@buzzie-ai/core').ChannelAdapter}
 */
export function createTelegramAdapter({ getBot }) {
  return {
    // ── Required methods ─────────────────────────────────────

    async sendText(chatId, text) {
      await getBot().api.sendMessage(chatId, text);
    },

    async sendImage(chatId, buffer, opts = {}) {
      const file = new InputFile(buffer, opts.fileName || "image.jpg");
      await getBot().api.sendPhoto(chatId, file, {
        caption: opts.caption || undefined,
      });
    },

    async sendDocument(chatId, buffer, opts = {}) {
      const file = new InputFile(buffer, opts.fileName || "file");
      await getBot().api.sendDocument(chatId, file, {
        caption: opts.caption || undefined,
      });
    },

    async sendReaction(chatId, emoji, targetMsgKey) {
      try {
        await getBot().api.setMessageReaction(chatId, Number(targetMsgKey), [
          { type: "emoji", emoji },
        ]);
      } catch (err) {
        // Reactions may not be supported in all chats
        console.log(`  [adapter] sendReaction failed: ${err.message}`);
      }
    },

    async getGroups() {
      const groups = listGroupChats();
      return groups.map(g => ({
        id: g.chat_id,
        name: g.title || g.chat_id,
        memberCount: 0,
      }));
    },

    async getChats() {
      const chats = dbListChats(50);
      return chats.map(c => ({
        id: c.chat_id,
        name: c.title || c.username || c.chat_id,
        lastMessage: null,
        timestamp: c.updated_at || null,
      }));
    },

    async getMessages(chatId, query = {}) {
      const { days = 7, limit = 100 } = query;
      const rows = getMessages(chatId, days, limit);
      return rows.map(row => ({
        sender: row.from_me ? "You" : (row.push_name || row.participant || row.jid),
        time: new Date(row.timestamp * 1000).toLocaleString(),
        text: row.body || "[media]",
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

    async searchMessages(query, sender) {
      return dbSearchMessages(query || null, sender || null);
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
          if (!urls.has(clean)) urls.set(clean, "Other");
        }
      }
      const links = [...urls.entries()].map(([url, platform]) => ({ url, platform }));
      return { chatId, count: links.length, links };
    },

    async sendPoll(chatId, question, options) {
      await getBot().api.sendPoll(chatId, question, options);
    },

    async queryDb(sql) {
      return runReadOnlyQuery(sql);
    },

    async getScheduled() {
      const rows = listPendingSends();
      return rows.map(r => ({
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
      const safe = { ...cfg };
      if (safe.llmKey) safe.llmKey = safe.llmKey.slice(0, 8) + "...";
      if (safe.botToken) safe.botToken = safe.botToken.slice(0, 10) + "...";
      return safe;
    },

    async updateConfig(data) {
      writeConfig(data);
      return { ok: true };
    },
  };
}
