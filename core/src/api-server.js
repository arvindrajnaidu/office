import { createServer } from "http";

/**
 * Create an API server that lets backends push messages to a channel.
 * Routes for optional adapter methods are only exposed when the adapter implements them.
 *
 * @param {import('./adapter.js').ChannelAdapter} adapter - channel adapter
 * @param {object} [options]
 * @param {string} [options.token] - bearer token for auth (if set, requests must include it)
 * @returns {{ start(port: number): Promise<void>, stop(): Promise<void> }}
 */
export function createApiServer(adapter, options = {}) {
  const { token } = options;
  let server = null;

  function has(method) {
    return typeof adapter[method] === "function";
  }

  function checkAuth(req) {
    if (!token) return true;
    const auth = req.headers.authorization;
    return auth === `Bearer ${token}`;
  }

  function json(res, status, data) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }

  async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString());
  }

  async function handleRequest(req, res) {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (!checkAuth(req)) {
      return json(res, 401, { error: "Unauthorized" });
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    try {
      // ── POST routes (push messages) ──────────────────────
      if (req.method === "POST" && path === "/send") {
        const body = await readBody(req);
        await adapter.sendText(body.chatId, body.text);
        return json(res, 200, { ok: true });
      }

      if (req.method === "POST" && path === "/send-image") {
        const body = await readBody(req);
        const buffer = Buffer.from(body.buffer, "base64");
        await adapter.sendImage(body.chatId, buffer, {
          mimeType: body.mimeType,
          fileName: body.fileName,
          caption: body.caption,
        });
        return json(res, 200, { ok: true });
      }

      if (req.method === "POST" && path === "/send-document") {
        const body = await readBody(req);
        const buffer = Buffer.from(body.buffer, "base64");
        await adapter.sendDocument(body.chatId, buffer, {
          mimeType: body.mimeType,
          fileName: body.fileName,
          caption: body.caption,
        });
        return json(res, 200, { ok: true });
      }

      if (req.method === "POST" && path === "/react") {
        const body = await readBody(req);
        await adapter.sendReaction(body.chatId, body.emoji, body.targetMsgKey);
        return json(res, 200, { ok: true });
      }

      // ── GET routes (data access) ────────────────────────
      if (req.method === "GET" && path === "/groups") {
        const groups = await adapter.getGroups();
        return json(res, 200, { groups });
      }

      if (req.method === "GET" && path === "/chats") {
        const chats = await adapter.getChats();
        return json(res, 200, { chats });
      }

      if (req.method === "GET" && path === "/contacts") {
        const contacts = await adapter.getContacts();
        return json(res, 200, { contacts });
      }

      // GET /messages/:chatId?days=7&limit=100
      const messagesMatch = path.match(/^\/messages\/(.+)$/);
      if (req.method === "GET" && messagesMatch) {
        const chatId = decodeURIComponent(messagesMatch[1]);
        const days = parseInt(url.searchParams.get("days")) || undefined;
        const limit = parseInt(url.searchParams.get("limit")) || undefined;
        const messages = await adapter.getMessages(chatId, { days, limit });
        return json(res, 200, { messages });
      }

      // ── Optional routes (guarded by adapter method existence) ──

      // GET /search-messages?query=...&sender=...
      if (req.method === "GET" && path === "/search-messages" && has("searchMessages")) {
        const query = url.searchParams.get("query") || "";
        const sender = url.searchParams.get("sender") || "";
        const results = await adapter.searchMessages(query, sender);
        return json(res, 200, { results });
      }

      // GET /extract-links?chatId=...&days=7
      if (req.method === "GET" && path === "/extract-links" && has("extractLinks")) {
        const chatId = url.searchParams.get("chatId");
        const days = parseInt(url.searchParams.get("days")) || 7;
        const results = await adapter.extractLinks(chatId, days);
        return json(res, 200, results);
      }

      // POST /send-video
      if (req.method === "POST" && path === "/send-video" && has("sendVideo")) {
        const body = await readBody(req);
        const buffer = Buffer.from(body.buffer, "base64");
        await adapter.sendVideo(body.chatId, buffer, {
          mimeType: body.mimeType,
          fileName: body.fileName,
          caption: body.caption,
        });
        return json(res, 200, { ok: true });
      }

      // POST /send-poll
      if (req.method === "POST" && path === "/send-poll" && has("sendPoll")) {
        const body = await readBody(req);
        await adapter.sendPoll(body.chatId, body.question, body.options);
        return json(res, 200, { ok: true });
      }

      // POST /download-video
      if (req.method === "POST" && path === "/download-video" && has("downloadVideo")) {
        const body = await readBody(req);
        const result = await adapter.downloadVideo(body.url);
        return json(res, 200, result);
      }

      // POST /create-digest
      if (req.method === "POST" && path === "/create-digest" && has("createDigest")) {
        const body = await readBody(req);
        const result = await adapter.createDigest(body.chatId, body.days);
        return json(res, 200, result);
      }

      // GET /output-files?filter=...
      if (req.method === "GET" && path === "/output-files" && has("listOutputFiles")) {
        const filter = url.searchParams.get("filter") || "";
        const result = await adapter.listOutputFiles(filter);
        return json(res, 200, result);
      }

      // POST /send-output-file
      if (req.method === "POST" && path === "/send-output-file" && has("sendOutputFile")) {
        const body = await readBody(req);
        const result = await adapter.sendOutputFile(body.chatId, body.file, body.type, body.caption);
        return json(res, 200, result);
      }

      // GET /personas
      if (req.method === "GET" && path === "/personas" && has("getPersonas")) {
        const personas = await adapter.getPersonas();
        return json(res, 200, { personas });
      }

      // GET /personas/:jid
      const personaMatch = path.match(/^\/personas\/(.+)$/);
      if (req.method === "GET" && personaMatch && has("getPersona")) {
        const jid = decodeURIComponent(personaMatch[1]);
        const persona = await adapter.getPersona(jid);
        if (persona === null) return json(res, 404, { error: "Persona not found" });
        return json(res, 200, persona);
      }

      // PUT /personas/:jid
      if (req.method === "PUT" && personaMatch && has("setPersona")) {
        const jid = decodeURIComponent(personaMatch[1]);
        const body = await readBody(req);
        const result = await adapter.setPersona(jid, body.groupName, body.content);
        return json(res, 200, result);
      }

      // DELETE /personas/:jid
      if (req.method === "DELETE" && personaMatch && has("deletePersona")) {
        const jid = decodeURIComponent(personaMatch[1]);
        const ok = await adapter.deletePersona(jid);
        return json(res, 200, { ok });
      }

      // GET /query?sql=...
      if (req.method === "GET" && path === "/query" && has("queryDb")) {
        const sql = url.searchParams.get("sql");
        if (!sql) return json(res, 400, { error: "sql parameter required" });
        const result = await adapter.queryDb(sql);
        return json(res, 200, result);
      }

      // GET /scheduled
      if (req.method === "GET" && path === "/scheduled" && has("getScheduled")) {
        const scheduled = await adapter.getScheduled();
        return json(res, 200, { scheduled });
      }

      // POST /scheduled
      if (req.method === "POST" && path === "/scheduled" && has("createScheduled")) {
        const body = await readBody(req);
        const result = await adapter.createScheduled(body.jid, body.chatName, body.message, body.sendAt);
        return json(res, 200, result);
      }

      // DELETE /scheduled/:id
      const scheduledMatch = path.match(/^\/scheduled\/(\d+)$/);
      if (req.method === "DELETE" && scheduledMatch && has("cancelScheduled")) {
        const id = parseInt(scheduledMatch[1]);
        const ok = await adapter.cancelScheduled(id);
        return json(res, 200, { ok });
      }

      // GET /config
      if (req.method === "GET" && path === "/config" && has("getConfig")) {
        const config = await adapter.getConfig();
        return json(res, 200, config);
      }

      // POST /config
      if (req.method === "POST" && path === "/config" && has("updateConfig")) {
        const body = await readBody(req);
        const result = await adapter.updateConfig(body);
        return json(res, 200, result);
      }

      json(res, 404, { error: "Not found" });
    } catch (err) {
      console.error(`[api-server] Error handling ${req.method} ${path}:`, err.message);
      json(res, 500, { error: err.message });
    }
  }

  return {
    start(port) {
      return new Promise((resolve, reject) => {
        server = createServer(handleRequest);
        server.on("error", reject);
        server.listen(port, () => {
          console.log(`  [api] Listening on port ${port}`);
          resolve();
        });
      });
    },

    stop() {
      return new Promise((resolve) => {
        if (!server) return resolve();
        server.close(resolve);
        server = null;
      });
    },
  };
}
