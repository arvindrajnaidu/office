import { listCalls, getTranscripts, getCall } from "./db.js";
import { readConfig, writeConfig } from "./config.js";

/**
 * Voice ChannelAdapter — implements @buzzie-ai/core adapter interface.
 */
export function createVoiceAdapter() {
  return {
    async sendText(chatId, text) {
      // For voice, "sending" means speaking — handled by the media stream
      console.log(`[adapter] sendText to ${chatId}: ${text.slice(0, 80)}`);
    },

    async sendImage() { console.log("[adapter] sendImage not supported on voice"); },
    async sendDocument() { console.log("[adapter] sendDocument not supported on voice"); },
    async sendReaction() { console.log("[adapter] sendReaction not supported on voice"); },

    async getGroups() { return []; },

    async getChats() {
      const calls = listCalls(50);
      return calls.map(c => ({
        id: c.call_sid,
        name: c.from_number,
        lastMessage: c.status,
        timestamp: Math.floor(c.started_at / 1000),
      }));
    },

    async getMessages(callSid) {
      const transcripts = getTranscripts(callSid);
      return transcripts.map(t => ({
        sender: t.role === "user" ? t.call_sid : "Bot",
        time: new Date(t.timestamp).toLocaleString(),
        text: t.content,
      }));
    },

    async getContacts() {
      const calls = listCalls(200);
      const numbers = new Map();
      for (const c of calls) {
        if (!numbers.has(c.from_number)) {
          numbers.set(c.from_number, { id: c.from_number, name: c.from_number });
        }
      }
      return [...numbers.values()];
    },

    async getConfig() {
      const cfg = readConfig();
      const safe = { ...cfg };
      if (safe.twilioAuthToken) safe.twilioAuthToken = safe.twilioAuthToken.slice(0, 8) + "...";
      if (safe.openaiApiKey) safe.openaiApiKey = safe.openaiApiKey.slice(0, 8) + "...";
      return safe;
    },

    async updateConfig(data) {
      writeConfig(data);
      return { ok: true };
    },
  };
}
