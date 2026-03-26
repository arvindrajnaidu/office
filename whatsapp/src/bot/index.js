import { DisconnectReason } from "@whiskeysockets/baileys";
import { createSocket, waitForConnection, getAuthDir, authExists } from "../session.js";
import { extractBody, success, error, info } from "../utils/formatters.js";
import { jidToPhone, isGroupJid } from "../utils/jid.js";
import { createDispatcher, createApiServer } from "@buzzie-ai/core";
import { openDb, closeDb, upsertMessage, loadConversationHistory, loadGroupHistory } from "../db.js";
import { readConfig } from "../config.js";
import { startScheduler } from "./scheduler.js";
import { createWhatsAppAdapter } from "../adapter.js";

const BOT_PREFIX = "\u{1F916} ";

// Track message IDs sent by the bot to prevent infinite loops
const sentByBot = new Set();

// Rate limiter: Map<jid, { count, windowStart }>
const rateLimits = new Map();
const RATE_LIMIT = 10; // per hour per chat

function checkRateLimit(jid) {
  const now = Date.now();
  const entry = rateLimits.get(jid);
  if (!entry || now - entry.windowStart > 3600000) {
    rateLimits.set(jid, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function isBotMessage(text) {
  return text?.startsWith(BOT_PREFIX);
}

// botReply is set once startBot wires up safeSend
let _safeSend = null;

export function botReply(jid, text) {
  console.log(`[botReply] jid=${jid}`);
  if (_safeSend) return _safeSend(jid, { text: BOT_PREFIX + text });
  throw new Error("Bot not initialized");
}

async function executeActions(actions, defaultJid, msgKey, safeSend) {
  console.log(`[actions] executing ${actions.length} action(s)`);
  for (const action of actions) {
    console.log(`[actions] ${action.type} → ${action.jid || defaultJid}`);
    switch (action.type) {
      case "reply_text":
        await safeSend(defaultJid, { text: BOT_PREFIX + action.text });
        break;
      case "send_message":
        await safeSend(action.jid || defaultJid, { text: action.text });
        break;
      case "react":
        await safeSend(defaultJid, { react: { text: action.emoji, key: msgKey } });
        break;
      case "send_image":
        await safeSend(action.jid || defaultJid, {
          image: action.buffer ? Buffer.from(action.buffer, "base64") : { url: action.url },
          mimetype: action.mimeType || "image/jpeg",
          caption: action.caption || undefined,
          fileName: action.fileName || undefined,
        });
        break;
      case "send_document":
        await safeSend(action.jid || defaultJid, {
          document: action.buffer ? Buffer.from(action.buffer, "base64") : { url: action.url },
          mimetype: action.mimeType || "application/octet-stream",
          fileName: action.fileName || "file",
          caption: action.caption || undefined,
        });
        break;
      default:
        console.log(`[actions] unknown type: ${action.type}`);
    }
  }
}

export async function startBot(opts = {}) {
  openDb();
  const authDir = getAuthDir(opts.authDir);

  if (!authExists(authDir)) {
    console.log(error("Not logged in. Run 'whatsapp' to set up."));
    process.exit(1);
  }

  const config = readConfig();
  const backendConfig = config.backend || { type: "builtin" };
  if (backendConfig.type !== "http") {
    console.log(info("No HTTP backend configured."));
    console.log(info('  backend: {"type":"http","url":"http://localhost:3000/api/chat"}'));
  }

  const MAX_RETRIES = 5;
  let sock;
  let groups = [];
  let selfJid;
  let connected = false;

  function waitForReady(timeoutMs = 30000) {
    if (connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for reconnect")), timeoutMs);
      const check = () => {
        if (connected) { clearTimeout(timeout); resolve(); return; }
        setTimeout(check, 500);
      };
      check();
    });
  }

  async function safeSend(jid, content, options) {
    console.log(`[send] to=${jid} type=${content.text ? "text" : content.react ? "react" : "media"}`);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const sent = await sock.sendMessage(jid, content, options);
        if (sent?.key?.id) {
          sentByBot.add(sent.key.id);
          console.log(`[send] ok id=${sent.key.id}`);
        } else {
          console.log(`[send] ok (no key returned)`);
        }
        return;
      } catch (err) {
        console.log(`[send] error attempt=${attempt}: ${err.message}`);
        const isConnectionError = err?.output?.statusCode === 428
          || err.message?.includes("Connection Closed");
        if (isConnectionError && attempt === 0) {
          console.log(info("Send failed, waiting for reconnect..."));
          await waitForReady();
          continue;
        }
        throw err;
      }
    }
  }

  async function dispatch(envelope) {
    console.log(`[dispatch] type=${envelope.type} jid=${envelope.jid}`);
    const result = await processWithBackend(envelope);
    console.log(`[dispatch] response: text=${result.text ? "yes" : "no"} actions=${result.actions?.length || 0}`);
    return result;
  }

  let processWithBackend;

  async function connect() {
    let reconnectDelay = 1000;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        sock = await createSocket({
          authDir,
          printQr: true,
          verbose: opts.verbose,
        });

        // Cache all messages to DB
        sock.ev.on("messages.upsert", ({ messages: msgs }) => {
          for (const msg of msgs) {
            if (msg.message) {
              const jid = msg.key.remoteJid;
              if (!jid) continue;
              upsertMessage(msg);
              const sender = msg.key.fromMe ? "You" : (msg.pushName || msg.key.participant || jid);
              console.log(`  [db] +1 ${jid} from=${sender}`);
            }
          }
        });

        // Cache history sync messages (replayed on connect / re-link)
        sock.ev.on("messaging-history.set", ({ messages: msgs, progress }) => {
          let count = 0;
          for (const msg of msgs) {
            if (msg.message && msg.key?.remoteJid) {
              upsertMessage(msg);
              count++;
            }
          }
          console.log(info(`History sync: ${count} messages cached${progress != null ? ` (${progress}% done)` : ""}`));
        });

        await waitForConnection(sock);
        break;
      } catch (err) {
        const code = err?.output?.statusCode ?? err?.statusCode;

        if (code === DisconnectReason.loggedOut) {
          console.log(error("Session logged out. Run 'whatsapp login' to re-link."));
          process.exit(1);
        }

        const isRetryable = err.message?.includes("Stream Errored")
          || err.message?.includes("restart required")
          || code === 515;

        if (isRetryable && attempt < MAX_RETRIES) {
          console.log(info(`Stream error, retrying (${attempt}/${MAX_RETRIES}) in ${reconnectDelay / 1000}s...`));
          await sleep(reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
          continue;
        }

        throw err;
      }
    }

    selfJid = sock.user?.id;
    if (!selfJid) {
      console.log(error("Could not determine self JID."));
      process.exit(1);
    }

    const selfPhone = selfJid.split(":")[0].split("@")[0];
    const selfChatJid = `${selfPhone}@s.whatsapp.net`;
    const selfLid = sock.user?.lid || null;
    const selfChatLid = selfLid ? selfLid.split(":")[0] + "@lid" : null;

    connected = true;
    console.log(success(`Connected as ${jidToPhone(selfJid)}${selfChatLid ? ` (lid: ${selfChatLid})` : ""}.`));

    await sock.sendPresenceUpdate("available");

    // Load groups
    console.log(info("Loading groups..."));
    try {
      const groupMap = await sock.groupFetchAllParticipating();
      groups = Object.values(groupMap);
      console.log(info(`Loaded ${groups.length} groups.`));
    } catch (err) {
      console.log(error(`Failed to load groups: ${err.message}`));
      groups = [];
    }

    // Adapter + Dispatcher
    const adapter = createWhatsAppAdapter({
      getSock: () => sock,
      safeSend,
      selfJid: selfChatJid,
      getGroups: () => groups,
    });

    const dispatcher = createDispatcher({
      backend: config.backend,
      groupBackends: config.groupBackends,
    });

    processWithBackend = (request) => dispatcher.dispatch(request);

    // API server
    const apiConfig = config.api || {};
    const apiPort = apiConfig.port || process.env.BUZZIE_API_PORT || 3100;
    const apiToken = apiConfig.token || process.env.BUZZIE_API_TOKEN;
    try {
      const apiServer = createApiServer(adapter, { token: apiToken });
      await apiServer.start(Number(apiPort));
    } catch (err) {
      console.log(error(`API server failed to start: ${err.message}`));
    }

    console.log(success("Bot ready. Message yourself on WhatsApp to get started.\n"));

    const startTs = Math.floor(Date.now() / 1000);

    // Auto-reconnect
    sock.ev.on("connection.update", (update) => {
      if (update.connection === "close") {
        const code = update.lastDisconnect?.error?.output?.statusCode
          ?? update.lastDisconnect?.error?.statusCode;

        if (code === DisconnectReason.loggedOut) {
          console.log(error("Session logged out. Run 'whatsapp login' to re-link."));
          process.exit(1);
        }

        connected = false;
        console.log(info("Disconnected. Reconnecting..."));
        connect().catch((err) => {
          console.log(error(`Reconnect failed after ${MAX_RETRIES} attempts: ${err.message}`));
          process.exit(1);
        });
      }
    });

    // ── Single message handler — forward everything to brain ──
    sock.ev.on("messages.upsert", async ({ messages: msgs }) => {
      for (const msg of msgs) {
        if (!msg.message) continue;

        const jid = msg.key.remoteJid;
        if (!jid) continue;

        // Loop prevention: skip bot's own outgoing messages
        if (msg.key.id && sentByBot.has(msg.key.id)) {
          sentByBot.delete(msg.key.id);
          continue;
        }

        // Skip old messages replayed on connect
        const ts = Number(msg.messageTimestamp || 0);
        if (ts && ts < startTs - 5) continue;

        // Handle reactions — forward to brain with reaction info
        const reaction = msg.message?.reactionMessage;
        if (reaction) {
          const reactionJid = msg.key.remoteJid;
          console.log(`[reaction] ${reaction.text || "(removed)"} in ${reactionJid} by ${msg.key.fromMe ? "You" : (msg.key.participant || "Unknown")}`);

          if (!checkRateLimit(reactionJid)) continue;

          try {
            const result = await dispatch({
              type: isGroupJid(reactionJid) ? "group" : "dm",
              jid: reactionJid,
              groupName: groups.find(g => g.id === reactionJid)?.subject || reactionJid,
              senderName: msg.pushName || msg.key.participant || "Unknown",
              text: `[reaction: ${reaction.text || "removed"}]`,
              history: [],
              meta: {
                selfJid: selfChatJid,
                timestamp: new Date().toISOString(),
                reaction: {
                  emoji: reaction.text,
                  targetMessageId: reaction.key?.id,
                  fromMe: msg.key.fromMe,
                },
              },
            });

            if (result.actions) await executeActions(result.actions, reactionJid, msg.key, safeSend);
            if (result.text) await safeSend(reactionJid, { text: BOT_PREFIX + result.text });
          } catch (err) {
            console.log(error(`Reaction handler error: ${err.message}`));
          }
          continue;
        }

        // Extract text
        const text = extractBody(msg);
        if (!text) continue;

        // Skip bot's own replies (prevents re-processing)
        if (isBotMessage(text)) continue;

        // ── Self-chat ──
        const isSelfChat = jid === selfChatJid || (selfChatLid && jid === selfChatLid);
        if (isSelfChat && msg.key.fromMe) {
          console.log(`[self] ${text}`);

          const replyJid = selfChatJid;
          try {
            const history = loadConversationHistory(3600000, 20);
            const result = await dispatch({
              type: "self_chat",
              jid: replyJid,
              senderName: msg.pushName || jidToPhone(selfChatJid),
              text,
              history,
              meta: { selfJid: replyJid, timestamp: new Date().toISOString() },
            });

            if (result.actions) await executeActions(result.actions, replyJid, msg.key, safeSend);
            if (result.text) {
              await botReply(replyJid, result.text);
            }
          } catch (err) {
            console.log(error(`Self-chat handler error: ${err.message}`));
            try { await botReply(selfChatJid, `Something went wrong: ${err.message}`); } catch { /* ignore */ }
          }
          continue;
        }

        // Skip self-chat echo (fromMe=false copy)
        if (isSelfChat) continue;

        // ── Group or DM ──
        const isGroup = isGroupJid(jid);
        const type = isGroup ? "group" : "dm";
        const chatName = isGroup
          ? (groups.find(g => g.id === jid)?.subject || jid)
          : (msg.pushName || jidToPhone(jid));
        const senderName = msg.pushName || msg.key.participant || "Unknown";

        if (!checkRateLimit(jid)) {
          console.log(info(`Rate limit hit for ${chatName}`));
          continue;
        }

        console.log(`[${type}] ${chatName} | ${senderName}: ${text.slice(0, 80)}`);

        try {
          const history = loadGroupHistory(jid, 3600000, 10);
          const result = await dispatch({
            type,
            jid,
            groupName: chatName,
            senderName,
            text,
            history,
            meta: { selfJid: selfChatJid, timestamp: new Date().toISOString() },
          });

          if (result.actions) await executeActions(result.actions, jid, msg.key, safeSend);
          if (result.text) await safeSend(jid, { text: BOT_PREFIX + result.text });
        } catch (err) {
          console.log(error(`${type} handler error (${chatName}): ${err.message}`));
        }
      }
    });
  }

  await connect();
  _safeSend = safeSend;
  const stopScheduler = startScheduler({ safeSend });

  process.on("SIGINT", async () => {
    console.log("\n" + info("Shutting down bot..."));
    stopScheduler();
    closeDb();
    if (sock) await sock.end();
    process.exit(0);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
