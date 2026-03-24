import { createDispatcher, createApiServer } from "@buzzie-ai/core";
import { createClient, resolveApiKey, resolveFromAddress } from "../session.js";
import { openDb, closeDb, upsertReceivedEmail, upsertSentEmail, loadConversationHistory, loadGroupHistory } from "../db.js";
import { readConfig, loadPersonaByJid } from "../config.js";
import { success, error, info } from "../utils/formatters.js";
import { EmailPoller } from "../poller.js";
import { createEmailAdapter } from "../adapter.js";
import { startScheduler } from "./scheduler.js";

const BOT_PREFIX = "\u{1F916} ";

// Per-contact rate limiter
const contactRateLimits = new Map();
const DEFAULT_RATE_LIMIT = 10;

function checkRateLimit(email) {
  const now = Date.now();
  const entry = contactRateLimits.get(email);
  if (!entry || now - entry.windowStart > 3600000) {
    contactRateLimits.set(email, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= DEFAULT_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export async function startBot(opts = {}) {
  openDb();

  const config = readConfig();
  const apiKey = resolveApiKey(config);
  if (!apiKey) {
    console.log(error("No Resend API key. Run setup or set RESEND_API_KEY."));
    process.exit(1);
  }

  const from = resolveFromAddress(config);
  if (!from) {
    console.log(error("No sender address configured. Run setup or set EMAIL_FROM."));
    process.exit(1);
  }

  const backendConfig = config.backend || { type: "builtin" };
  if (backendConfig.type !== "http") {
    console.log(info("No HTTP backend configured — running in builtin mode (deprecated)."));
    console.log(info('  backend: {"type":"http","url":"http://localhost:3000/api/chat"}'));
  }

  const client = createClient(apiKey);
  console.log(success(`Email channel ready (from: ${from})`));

  // Adapter + Dispatcher
  const adapter = createEmailAdapter({ getClient: () => client });

  const dispatcher = createDispatcher({
    backend: config.backend,
    groupBackends: config.groupBackends,
  });

  const processWithBackend = (request) => dispatcher.dispatch(request);

  // API server (outbound push)
  const apiConfig = config.api || {};
  const apiPort = apiConfig.port || process.env.BUZZIE_API_PORT || 3100;
  const apiToken = apiConfig.token || process.env.BUZZIE_API_TOKEN;
  try {
    const apiServer = createApiServer(adapter, { token: apiToken });
    await apiServer.start(Number(apiPort));
  } catch (err) {
    console.log(error(`API server failed to start: ${err.message}`));
  }

  // Email poller
  const poller = new EmailPoller({ client, interval: 10000 });

  poller.on("email", async (email) => {
    const senderEmail = email.from || "";
    const subject = email.subject || "";
    const body = email.text || email.html?.replace(/<[^>]+>/g, "") || "";

    if (!senderEmail || !body) return;

    // Skip bot's own emails
    if (senderEmail === from) return;
    if (body.startsWith(BOT_PREFIX)) return;

    // Cache in DB
    upsertReceivedEmail(email);

    console.log(`[email] ${senderEmail}: ${subject}`);

    if (!checkRateLimit(senderEmail)) {
      console.log(info(`Rate limit hit for ${senderEmail}`));
      return;
    }

    try {
      const history = loadConversationHistory(3600000, 20);
      const text = subject ? `Subject: ${subject}\n\n${body}` : body;

      const result = await processWithBackend({
        type: "dm",
        jid: senderEmail,
        groupName: senderEmail,
        persona: loadPersonaByJid(senderEmail) || undefined,
        senderName: senderEmail,
        text,
        history,
        meta: { selfJid: from, timestamp: new Date().toISOString() },
      });

      if (result.text) {
        const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
        const { data, error: sendErr } = await client.emails.send({
          from,
          to: senderEmail,
          subject: replySubject,
          text: BOT_PREFIX + result.text,
          reply_to: from,
        });
        if (sendErr) console.log(error(`Reply failed: ${sendErr.message}`));
        else if (data?.id) upsertSentEmail(data.id, from, senderEmail, replySubject, result.text);
      }
    } catch (err) {
      console.log(error(`Handler error: ${err.message}`));
    }
  });

  poller.on("error", (err) => {
    console.log(error(`Polling error: ${err.message}`));
  });

  console.log(success("Bot ready. Polling for incoming emails...\n"));
  await poller.start();

  const stopScheduler = startScheduler(client);

  process.on("SIGINT", () => {
    console.log("\n" + info("Shutting down bot..."));
    stopScheduler();
    poller.stop();
    closeDb();
    process.exit(0);
  });
}
