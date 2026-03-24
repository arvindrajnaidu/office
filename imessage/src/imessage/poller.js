import { EventEmitter } from "events";
import { getMessages, getLatestRowId } from "./db.js";

/**
 * Polls the iMessage database for new messages at a configurable interval.
 * Emits "message" events for each new message received.
 *
 * @example
 * const poller = new MessagePoller({ interval: 3000 });
 * poller.on("message", (msg) => {
 *   console.log(`${msg.handle}: ${msg.text}`);
 * });
 * poller.start();
 *
 * // Later:
 * poller.stop();
 */
export class MessagePoller extends EventEmitter {
  /**
   * @param {object} opts
   * @param {number}  [opts.interval=5000]  - Polling interval in milliseconds
   * @param {string}  [opts.dbPath]         - Override chat.db path
   * @param {string}  [opts.handle]         - Only poll messages from this contact
   * @param {boolean} [opts.onlyIncoming]   - If true, ignore messages from me (default true)
   */
  constructor(opts = {}) {
    super();
    this.interval = opts.interval ?? 5000;
    this.dbPath = opts.dbPath;
    this.handle = opts.handle;
    this.onlyIncoming = opts.onlyIncoming ?? true;
    this._timer = null;
    this._lastRowId = 0;
  }

  /**
   * Start polling. Gets the current latest ROWID as baseline
   * so only truly new messages trigger events.
   */
  start() {
    if (this._timer) return; // already running

    this._lastRowId = getLatestRowId(this.dbPath);

    this.emit("started", { lastRowId: this._lastRowId });
    this._poll(); // first poll immediately
    this._timer = setInterval(() => this._poll(), this.interval);
  }

  /**
   * Stop polling and clean up.
   */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this.emit("stopped");
  }

  /** @private */
  _poll() {
    try {
      const messages = getMessages({
        handle: this.handle,
        sinceRowId: this._lastRowId,
        limit: 100,
        dbPath: this.dbPath,
      });

      // Messages come back newest-first; process oldest-first
      const sorted = messages.reverse();

      for (const msg of sorted) {
        if (this.onlyIncoming && msg.isFromMe) continue;

        this._lastRowId = Math.max(this._lastRowId, msg.rowid);
        this.emit("message", msg);
      }

      // Update lastRowId even if we skipped messages (e.g. our own)
      if (sorted.length > 0) {
        this._lastRowId = Math.max(
          this._lastRowId,
          ...sorted.map((m) => m.rowid)
        );
      }
    } catch (err) {
      this.emit("error", err);
    }
  }
}
