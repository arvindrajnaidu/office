import { EventEmitter } from "events";
import { DisconnectReason } from "@whiskeysockets/baileys";
import { createSocket, waitForConnection } from "./session.js";
import { toJid } from "./utils/jid.js";

const DEFAULT_BASE_BACKOFF_MS = 1000;
const DEFAULT_MAX_BACKOFF_MS = 60_000;
const DEFAULT_MAX_QUEUE = 100;

/**
 * Strip Baileys' `:device` suffix from a JID. Multi-device sessions deliver
 * messages with the linked-device id appended (e.g. `<phone>:5@s.whatsapp.net`),
 * but JID equality, storage keys, and outbound targets all want the bare form.
 */
function stripDevice(jid) {
  if (!jid || typeof jid !== "string") return jid;
  const at = jid.indexOf("@");
  if (at === -1) return jid;
  const main = jid.slice(0, at);
  const colon = main.indexOf(":");
  if (colon === -1) return jid;
  return main.slice(0, colon) + jid.slice(at);
}

/**
 * Build the cached identity bag from `sock.user`. WhatsApp multi-device gives
 * us two coordinates for "me" — the phone-number JID (`@s.whatsapp.net`, used
 * for outbound and visible in the user's self-chat) and the LID twin (`@lid`,
 * used by some linked-device delivery paths). Inbound matchers need both;
 * outbound canonicalizes to the PN form.
 */
function computeWhoami(user) {
  if (!user || !user.id) return null;
  const id = stripDevice(user.id);
  const lid = user.lid ? stripDevice(user.lid) : null;
  const phone = id.split("@")[0];
  return {
    id,
    lid,
    phone,
    selfChatJid: id,
    selfChatLid: lid,
  };
}

/**
 * Create a managed WhatsApp client. Owns the Baileys socket lifecycle,
 * auto-reconnects on transient drops, and exposes a stable send/receive
 * interface so callers don't have to track WS state.
 *
 * Resolves once the first connection is open. After that, the client stays
 * up across transient WebSocket failures by reconnecting with exponential
 * backoff. It only gives up if Baileys reports `DisconnectReason.loggedOut`,
 * which means the auth state is gone and re-pairing is required.
 *
 * @param {object} [opts]
 * @param {string}  [opts.authDir]                 Override auth directory
 * @param {boolean} [opts.verbose]                 Verbose Baileys logs
 * @param {boolean} [opts.syncFullHistory]         Sync full history on link (default: true)
 * @param {number}  [opts.baseBackoffMs=1000]      First reconnect delay
 * @param {number}  [opts.maxBackoffMs=60000]      Cap on reconnect delay
 * @param {boolean} [opts.queueWhileDisconnected=true]  Queue sends during reconnect
 * @param {number}  [opts.maxQueueSize=100]        Max pending sends; over this, send() rejects
 * @returns {Promise<Client>}
 */
export async function createClient(opts = {}) {
  const client = new Client(opts);
  await client._initialConnect();
  return client;
}

/**
 * Client wraps a Baileys socket with reconnect semantics.
 *
 * Events:
 *   'message'  (msg, type)   — forwarded from Baileys `messages.upsert`
 *   'status'   (status)      — 'connected' | 'reconnecting' | 'logged_out' | 'closed'
 *   'qr'       (qr)          — QR string (rare for an authed client)
 *   'error'    (err)         — reconnect failure or logged-out
 */
class Client extends EventEmitter {
  constructor(opts) {
    super();
    this._opts = opts;
    this._authDir = opts.authDir;
    this._verbose = opts.verbose;
    this._syncFullHistory = opts.syncFullHistory;
    this._baseBackoffMs = opts.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
    this._maxBackoffMs = opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    this._queueWhileDisconnected = opts.queueWhileDisconnected ?? true;
    this._maxQueueSize = opts.maxQueueSize ?? DEFAULT_MAX_QUEUE;

    this._sock = null;
    this._status = "connecting";
    this._queue = [];
    this._closing = false;
    this._reconnectAttempt = 0;
    this._reconnectTimer = null;
    this._whoami = null;
  }

  /* -------------------------------------------------------------------------
   * Public API
   * -----------------------------------------------------------------------*/

  /** Current status string. */
  get status() {
    return this._status;
  }

  /** True when the underlying socket is connected and ready to send. */
  get isConnected() {
    return this._status === "connected";
  }

  /**
   * Send a WhatsApp message. Forwards to Baileys `sock.sendMessage`.
   * If disconnected and queueWhileDisconnected is true, the send is queued
   * and the returned promise resolves after a successful reconnect-and-flush.
   *
   * @param {string} to           Recipient — full JID (`...@s.whatsapp.net`, `...@g.us`) or
   *                              bare phone digits (e.g. `"16693070940"`); digits are coerced
   *                              to `<digits>@s.whatsapp.net` automatically.
   * @param {object} content      Baileys message content (`{ text }`, `{ image }`, etc.)
   * @param {object} [options]    Baileys send options
   * @returns {Promise<object>}   Sent message metadata
   */
  send(to, content, options) {
    if (this._status === "closed") {
      return Promise.reject(new Error("Client is closed"));
    }
    if (this._status === "logged_out") {
      return Promise.reject(
        new Error("Client logged out — re-pair with `whatsapp login`"),
      );
    }

    let jid;
    try {
      jid = toJid(to);
    } catch (err) {
      return Promise.reject(err);
    }

    if (this._sock && this._status === "connected") {
      return this._sock.sendMessage(jid, content, options).catch((err) => {
        // Sock died mid-send. Queue (or fail) so the caller doesn't have to retry.
        if (
          this._queueWhileDisconnected &&
          err?.message?.includes("Connection Closed")
        ) {
          return this._enqueue(jid, content, options);
        }
        throw err;
      });
    }

    return this._enqueue(jid, content, options);
  }

  /**
   * Send to your own self-chat. Equivalent to `send(whoami().selfChatJid, content)`
   * but readable at every callsite (cron alerts, "done" pings, error pages).
   *
   * @param {object} content      Baileys message content
   * @param {object} [options]    Baileys send options
   * @returns {Promise<object>}
   */
  selfSend(content, options) {
    if (!this._whoami) {
      return Promise.reject(
        new Error("Client identity not available — wait for first connection"),
      );
    }
    return this.send(this._whoami.selfChatJid, content, options);
  }

  /**
   * Identity bag for the linked WhatsApp account. Captured once at first
   * connect and stable across reconnects (the WS may swap; identity doesn't).
   * Returns null if called before the initial connection completes — but
   * since `createClient()` already awaits that, you'll usually never see null.
   *
   * @returns {{ id: string, lid: string|null, phone: string, selfChatJid: string, selfChatLid: string|null } | null}
   */
  whoami() {
    return this._whoami;
  }

  /**
   * Escape hatch — return the underlying Baileys socket, or null when
   * disconnected. Use sparingly; the client reserves the right to swap
   * the socket out from under you on reconnect.
   */
  getSocket() {
    return this._sock;
  }

  /**
   * Tear the client down cleanly. Stops the reconnect loop, rejects all
   * queued sends, and ends the underlying socket. Idempotent.
   */
  async close() {
    if (this._closing) return;
    this._closing = true;

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    this._rejectQueue(new Error("Client closed"));

    if (this._sock) {
      try {
        await this._sock.end();
      } catch {
        // sock already dead — ignore
      }
      this._sock = null;
    }

    this._setStatus("closed");
  }

  /* -------------------------------------------------------------------------
   * Internal — connection lifecycle
   * -----------------------------------------------------------------------*/

  async _initialConnect() {
    try {
      await this._connect();
    } catch (err) {
      this._setStatus("closed");
      throw err;
    }
  }

  async _connect() {
    const sock = await createSocket({
      authDir: this._authDir,
      verbose: this._verbose,
      syncFullHistory: this._syncFullHistory,
      onQr: (qr) => this.emit("qr", qr),
    });

    // Attach listeners BEFORE waiting for connection so we never miss events
    // that fire between `open` and the next event-loop tick.
    sock.ev.on("connection.update", (update) => {
      if (update.connection === "close") this._handleClose(update);
    });

    sock.ev.on("messages.upsert", (m) => {
      for (const msg of m.messages) this.emit("message", msg, m.type);
    });

    await waitForConnection(sock);

    this._sock = sock;
    this._reconnectAttempt = 0;
    // Identity should match across reconnects — only compute on first connect,
    // re-derive only if it was somehow missing.
    if (!this._whoami) {
      this._whoami = computeWhoami(sock.user);
    }
    this._setStatus("connected");
    await this._flushQueue();
  }

  _handleClose(update) {
    if (this._closing) return;

    const code =
      update.lastDisconnect?.error?.output?.statusCode ??
      update.lastDisconnect?.error?.statusCode;

    // Drop reference to the dead sock so getSocket() doesn't return zombies.
    this._sock = null;

    if (code === DisconnectReason.loggedOut) {
      const err = new Error("Client logged out — re-pair required");
      this._setStatus("logged_out");
      this._rejectQueue(err);
      this.emit("error", err);
      return;
    }

    this._setStatus("reconnecting");
    this._scheduleReconnect();
  }

  _scheduleReconnect() {
    if (this._closing) return;

    const attempt = this._reconnectAttempt++;
    const base = Math.min(
      this._baseBackoffMs * Math.pow(2, attempt),
      this._maxBackoffMs,
    );
    // Full jitter: pick uniformly in [base/2, base] to spread retry storms.
    const delay = base * (0.5 + Math.random() * 0.5);

    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      try {
        await this._connect();
      } catch (err) {
        this.emit("error", err);
        if (!this._closing) this._scheduleReconnect();
      }
    }, delay);
  }

  /* -------------------------------------------------------------------------
   * Internal — queue
   * -----------------------------------------------------------------------*/

  _enqueue(jid, content, options) {
    if (!this._queueWhileDisconnected) {
      return Promise.reject(
        new Error(`Client not connected (status=${this._status})`),
      );
    }
    if (this._queue.length >= this._maxQueueSize) {
      return Promise.reject(
        new Error(`Client send queue full (max=${this._maxQueueSize})`),
      );
    }
    return new Promise((resolve, reject) => {
      this._queue.push({ jid, content, options, resolve, reject });
    });
  }

  async _flushQueue() {
    // Snapshot so concurrent sends queued during the flush go through the
    // normal path, not into the just-drained array.
    const pending = this._queue.splice(0);
    for (const item of pending) {
      try {
        const result = await this._sock.sendMessage(
          item.jid,
          item.content,
          item.options,
        );
        item.resolve(result);
      } catch (err) {
        item.reject(err);
      }
    }
  }

  _rejectQueue(err) {
    const pending = this._queue.splice(0);
    for (const item of pending) item.reject(err);
  }

  /* -------------------------------------------------------------------------
   * Internal — status
   * -----------------------------------------------------------------------*/

  _setStatus(status) {
    if (this._status === status) return;
    this._status = status;
    this.emit("status", status);
  }
}
