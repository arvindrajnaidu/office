import { getWhatsAppHost, getWhatsAppToken } from "./config.js";

/**
 * HTTP client wrapping the WhatsApp host's API server (core's api-server).
 * All tools in the brain call through this instead of direct Baileys/DB access.
 */
export class WhatsAppClient {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl || getWhatsAppHost();
    this.token = token || getWhatsAppToken();
  }

  async _fetch(path, opts = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      "Content-Type": "application/json",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...opts.headers,
    };

    const res = await fetch(url, {
      ...opts,
      headers,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`WhatsApp API error ${res.status} ${path}: ${text}`);
    }

    return res.json();
  }

  async _get(path) {
    return this._fetch(path, { method: "GET" });
  }

  async _post(path, body) {
    return this._fetch(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async _put(path, body) {
    return this._fetch(path, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  async _delete(path) {
    return this._fetch(path, { method: "DELETE" });
  }

  // ── Core required endpoints ────────────────────────────

  async getGroups() {
    const data = await this._get("/groups");
    return data.groups;
  }

  async getChats() {
    const data = await this._get("/chats");
    return data.chats;
  }

  async getContacts() {
    const data = await this._get("/contacts");
    return data.contacts;
  }

  async getMessages(chatId, { days, limit } = {}) {
    const params = new URLSearchParams();
    if (days) params.set("days", days);
    if (limit) params.set("limit", limit);
    const qs = params.toString();
    const data = await this._get(`/messages/${encodeURIComponent(chatId)}${qs ? `?${qs}` : ""}`);
    return data.messages;
  }

  async sendText(chatId, text) {
    return this._post("/send", { chatId, text });
  }

  async sendImage(chatId, buffer, opts = {}) {
    return this._post("/send-image", {
      chatId,
      buffer: buffer.toString("base64"),
      mimeType: opts.mimeType,
      fileName: opts.fileName,
      caption: opts.caption,
    });
  }

  async sendDocument(chatId, buffer, opts = {}) {
    return this._post("/send-document", {
      chatId,
      buffer: buffer.toString("base64"),
      mimeType: opts.mimeType,
      fileName: opts.fileName,
      caption: opts.caption,
    });
  }

  async react(chatId, emoji, key) {
    return this._post("/react", { chatId, emoji, targetMsgKey: key });
  }

  // ── Optional endpoints ─────────────────────────────────

  async searchMessages(query, sender) {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (sender) params.set("sender", sender);
    const data = await this._get(`/search-messages?${params.toString()}`);
    return data.results;
  }

  async extractLinks(chatId, days = 7) {
    const params = new URLSearchParams({ chatId, days });
    return this._get(`/extract-links?${params.toString()}`);
  }

  async sendVideo(chatId, buffer, opts = {}) {
    return this._post("/send-video", {
      chatId,
      buffer: buffer.toString("base64"),
      mimeType: opts.mimeType,
      fileName: opts.fileName,
      caption: opts.caption,
    });
  }

  async sendPoll(chatId, question, options) {
    return this._post("/send-poll", { chatId, question, options });
  }

  async downloadVideo(url) {
    return this._post("/download-video", { url });
  }

  async createDigest(chatId, days) {
    return this._post("/create-digest", { chatId, days });
  }

  async listOutputFiles(filter) {
    const params = new URLSearchParams();
    if (filter) params.set("filter", filter);
    return this._get(`/output-files?${params.toString()}`);
  }

  async sendOutputFile(chatId, file, type, caption) {
    return this._post("/send-output-file", { chatId, file, type, caption });
  }

  async getPersonas() {
    const data = await this._get("/personas");
    return data.personas;
  }

  async getPersona(jid) {
    return this._get(`/personas/${encodeURIComponent(jid)}`);
  }

  async setPersona(jid, groupName, content) {
    return this._put(`/personas/${encodeURIComponent(jid)}`, { groupName, content });
  }

  async deletePersona(jid) {
    return this._delete(`/personas/${encodeURIComponent(jid)}`);
  }

  async queryDb(sql) {
    const params = new URLSearchParams({ sql });
    return this._get(`/query?${params.toString()}`);
  }

  async getScheduled() {
    const data = await this._get("/scheduled");
    return data.scheduled;
  }

  async createScheduled(jid, chatName, message, sendAt) {
    return this._post("/scheduled", { jid, chatName, message, sendAt });
  }

  async cancelScheduled(id) {
    return this._delete(`/scheduled/${id}`);
  }

  async getConfig() {
    return this._get("/config");
  }

  async updateConfig(data) {
    return this._post("/config", data);
  }
}

/**
 * Singleton client instance (created lazily on first use).
 */
let _client = null;

export function getClient() {
  if (!_client) {
    _client = new WhatsAppClient();
  }
  return _client;
}
