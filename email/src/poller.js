import { EventEmitter } from "events";

/**
 * Polls the Resend API for new received emails at a configurable interval.
 * Emits "email" events for each new email received.
 *
 * @example
 * const poller = new EmailPoller({ client, interval: 10000 });
 * poller.on("email", (email) => {
 *   console.log(`${email.from}: ${email.subject}`);
 * });
 * poller.start();
 */
export class EmailPoller extends EventEmitter {
  /**
   * @param {object} opts
   * @param {import("resend").Resend} opts.client - Resend client instance
   * @param {number} [opts.interval=10000] - Polling interval in milliseconds
   */
  constructor(opts = {}) {
    super();
    this.client = opts.client;
    this.interval = opts.interval ?? 10000;
    this._timer = null;
    this._lastSeenId = null;
  }

  /**
   * Start polling. Fetches current emails to establish baseline.
   */
  async start() {
    if (this._timer) return;

    // Get the latest email ID as baseline so we only see new ones
    try {
      const { data } = await this.client.emails.list({ type: "received", limit: 1 });
      if (data?.data?.length > 0) {
        this._lastSeenId = data.data[0].id;
      }
    } catch (err) {
      this.emit("error", err);
    }

    this.emit("started", { lastSeenId: this._lastSeenId });
    this._poll();
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
  async _poll() {
    try {
      const params = { type: "received", limit: 20 };
      if (this._lastSeenId) {
        params.after = this._lastSeenId;
      }

      const { data, error } = await this.client.emails.list(params);
      if (error) {
        this.emit("error", new Error(error.message));
        return;
      }

      const emails = data?.data || [];
      if (emails.length === 0) return;

      // Process oldest first (API returns newest first)
      const sorted = [...emails].reverse();

      for (const email of sorted) {
        // Fetch full content
        try {
          const { data: full } = await this.client.emails.get(email.id);
          this.emit("email", full || email);
        } catch {
          // Fall back to list data if detail fetch fails
          this.emit("email", email);
        }

        this._lastSeenId = email.id;
      }
    } catch (err) {
      this.emit("error", err);
    }
  }
}
