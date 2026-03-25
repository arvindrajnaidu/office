import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { isGroupChat, extractHandle } from "./utils/handles.js";
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
import { sendMessage, sendToGroupChat, sendFile, sendFileToGroupChat } from "./imessage/send.js";
import { getChats as iMessageGetChats } from "./imessage/db.js";

/**
 * iMessage ChannelAdapter — implements the @buzzie-ai/core adapter interface
 * using macOS iMessage database + AppleScript.
 *
 * @param {object} opts
 * @param {Map} opts.chatNameMap - Map<chatId, displayName> for resolving group names
 * @returns {import('@buzzie-ai/core').ChannelAdapter}
 */
export function createIMessageAdapter({ chatNameMap }) {
  function resolveChatName(chatId) {
    return chatNameMap?.get(chatId) || chatId;
  }

  async function sendTextToChat(chatId, text) {
    if (isGroupChat(chatId)) {
      const name = resolveChatName(chatId);
      await sendToGroupChat(name, text);
    } else {
      const handle = extractHandle(chatId);
      await sendMessage(handle, text);
    }
  }

  async function sendFileToChat(chatId, filePath) {
    if (isGroupChat(chatId)) {
      const name = resolveChatName(chatId);
      await sendFileToGroupChat(name, filePath);
    } else {
      const handle = extractHandle(chatId);
      await sendFile(handle, filePath);
    }
  }

  return {
    // ── Required methods ─────────────────────────────────────

    async sendText(chatId, text) {
      await sendTextToChat(chatId, text);
    },

    async sendImage(chatId, buffer, opts = {}) {
      const ext = (opts.mimeType || "image/jpeg").split("/")[1] || "jpg";
      const tmpPath = join(tmpdir(), `imessage-img-${Date.now()}.${ext}`);
      try {
        writeFileSync(tmpPath, buffer);
        await sendFileToChat(chatId, tmpPath);
      } finally {
        try { unlinkSync(tmpPath); } catch { /* ignore */ }
      }
    },

    async sendDocument(chatId, buffer, opts = {}) {
      const fileName = opts.fileName || `file-${Date.now()}`;
      const tmpPath = join(tmpdir(), fileName);
      try {
        writeFileSync(tmpPath, buffer);
        await sendFileToChat(chatId, tmpPath);
      } finally {
        try { unlinkSync(tmpPath); } catch { /* ignore */ }
      }
    },

    async sendReaction(chatId, emoji, targetMsgKey) {
      // AppleScript does not support iMessage Tapbacks — no-op
      console.log(`  [adapter] sendReaction not supported on iMessage (${emoji})`);
    },

    async getGroups() {
      const chats = iMessageGetChats({ limit: 200 });
      return chats
        .filter(c => isGroupChat(c.chatId))
        .map(c => ({ id: c.chatId, name: c.displayName, memberCount: 0 }));
    },

    async getChats() {
      const chats = iMessageGetChats({ limit: 50 });
      return chats.map(c => ({
        id: c.chatId,
        name: c.displayName,
        lastMessage: c.lastMessageText,
        timestamp: c.lastMessageDate ? Math.floor(c.lastMessageDate.getTime() / 1000) : null,
      }));
    },

    async getMessages(chatId, query = {}) {
      const { days = 7, limit = 100 } = query;
      const rows = getMessages(chatId, days, limit);
      return rows.map(row => ({
        sender: row.from_me ? "You" : (row.push_name || row.jid),
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
      return safe;
    },

    async updateConfig(data) {
      writeConfig(data);
      return { ok: true };
    },
  };
}
