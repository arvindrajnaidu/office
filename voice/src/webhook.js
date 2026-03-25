import { createServer } from "http";
import twilio from "twilio";

const { VoiceResponse } = twilio.twiml;

/**
 * Create the HTTP webhook server for Twilio voice events.
 *
 * @param {object} opts
 * @param {string} opts.webhookUrl - Public URL for this server
 * @param {Function} opts.onCallStart - (callSid, from, to) => void
 * @param {Function} opts.onCallEnd - (callSid, status, duration) => void
 * @returns {import("http").Server}
 */
export function createWebhookServer(opts) {
  const { webhookUrl, onCallStart, onCallEnd } = opts;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    // Parse form-encoded body (Twilio sends application/x-www-form-urlencoded)
    let body = {};
    if (req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString();
      for (const pair of raw.split("&")) {
        const [key, value] = pair.split("=").map(decodeURIComponent);
        body[key] = value;
      }
    }

    // ── Incoming call webhook ──
    if (path === "/voice/incoming") {
      const callSid = body.CallSid;
      const from = body.From;
      const to = body.To;

      console.log(`[webhook] incoming call: ${from} → ${to} (${callSid})`);
      onCallStart?.(callSid, from, to);

      // Respond with TwiML that opens a bidirectional media stream
      const response = new VoiceResponse();
      const connect = response.connect();
      const stream = connect.stream({
        url: `${webhookUrl.replace(/^http/, "ws")}/media-stream`,
      });
      // Pass caller info to the media stream
      stream.parameter({ name: "from", value: from });

      res.writeHead(200, { "Content-Type": "text/xml" });
      res.end(response.toString());
      return;
    }

    // ── Call status webhook ──
    if (path === "/voice/status") {
      const callSid = body.CallSid;
      const status = body.CallStatus;
      const duration = body.CallDuration ? parseInt(body.CallDuration) : null;

      console.log(`[webhook] call status: ${callSid} → ${status}${duration ? ` (${duration}s)` : ""}`);
      onCallEnd?.(callSid, status, duration);

      res.writeHead(200, { "Content-Type": "text/xml" });
      res.end("<Response/>");
      return;
    }

    // ── Health check ──
    if (path === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  return server;
}
