import { statSync, readFileSync } from "fs";
import { join } from "path";
import { DisconnectReason } from "@whiskeysockets/baileys";
import { createSocket, waitForConnection, getAuthDir, authExists } from "../session.js";
import { extractBody, success, error, info } from "../utils/formatters.js";
import { jidToPhone, isGroupJid } from "../utils/jid.js";
import { createDispatcher, createApiServer } from "@buzzie-ai/core";
import { openDb, closeDb, upsertMessage, getPersonaByJid, getMessageByKey, loadConversationHistory, loadGroupHistory } from "../db.js";
import { readConfig, loadPersonaByJid, getOutputDir } from "../config.js";
import { startScheduler } from "./scheduler.js";
import { createWhatsAppAdapter } from "../adapter.js";

// All bot replies start with this prefix so we can ignore them in the upsert handler
const BOT_PREFIX = "\u{1F916} ";

const DEFAULT_PERSONA = "You are a helpful assistant. Be concise and relevant.";

const VIDEO_PLATFORM_RE = /https?:\/\/[^\s<>"']*(?:instagram\.com|instagr\.am|youtube\.com\/shorts|youtu\.be|tiktok\.com|vm\.tiktok\.com|facebook\.com\/(?:reel|watch)|fb\.watch|twitter\.com|x\.com)[^\s<>"']*/i;

// Track message IDs sent by the bot so we can skip them in the self-chat listener
const sentByBot = new Set();

// Per-group rate limiter: Map<jid, { count, windowStart }>
const groupRateLimits = new Map();
const DEFAULT_RATE_LIMIT = 10; // per hour

function checkRateLimit(jid) {
  const now = Date.now();
  const entry = groupRateLimits.get(jid);
  if (!entry || now - entry.windowStart > 3600000) {
    groupRateLimits.set(jid, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= DEFAULT_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// botReply is set once startBot wires up safeSend
let _safeSend = null;

export function botReply(jid, text) {
  console.log(`[botReply] jid=${jid}`);
  if (_safeSend) return _safeSend(jid, { text: BOT_PREFIX + text });
  throw new Error("Bot not initialized");
}

function isBotMessage(text) {
  return text.startsWith(BOT_PREFIX);
}

function cacheMessage(msg) {
  const jid = msg.key.remoteJid;
  if (!jid) return;
  upsertMessage(msg);
  const sender = msg.key.fromMe ? "You" : (msg.pushName || msg.key.participant || jid);
  console.log(`  [db] +1 ${jid} from=${sender}`);
}

/**
 * Execute actions returned by a backend response.
 */
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
        console.log(`Unknown action type: ${action.type}`);
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
    console.log(info("No HTTP backend configured — running in builtin mode (deprecated)."));
    console.log(info("Set up the assistant app and configure:"));
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

  function ackTimer(msgKey) {
    let sent = false;
    const timer = setTimeout(async () => {
      try {
        sent = true;
        const res = await sock.sendMessage(msgKey.remoteJid, {
          react: { text: "👀", key: msgKey },
        });
        if (res?.key?.id) sentByBot.add(res.key.id);
      } catch { /* ignore */ }
    }, 3000);
    return async () => {
      clearTimeout(timer);
      if (sent) {
        try {
          const res = await sock.sendMessage(msgKey.remoteJid, {
            react: { text: "", key: msgKey },
          });
          if (res?.key?.id) sentByBot.add(res.key.id);
        } catch { /* ignore */ }
      }
    };
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

  async function connect() {
    let reconnectDelay = 1000;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        sock = await createSocket({
          authDir,
          printQr: true,
          verbose: opts.verbose,
        });

        sock.ev.on("messages.upsert", ({ messages: msgs }) => {
          for (const msg of msgs) {
            if (msg.message) cacheMessage(msg);
          }
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
    // Baileys may also use LID format for self-chat (xxx@lid)
    const selfLid = sock.user?.lid || null;
    const selfChatLid = selfLid ? selfLid.split(":")[0] + "@lid" : null;

    connected = true;
    console.log(success(`Connected as ${jidToPhone(selfJid)}${selfChatLid ? ` (lid: ${selfChatLid})` : ""}.`));

    await sock.sendPresenceUpdate("available");

    // ── Load groups ──────────────────────────────────────
    console.log(info("Loading groups..."));
    try {
      const groupMap = await sock.groupFetchAllParticipating();
      groups = Object.values(groupMap);
      console.log(info(`Loaded ${groups.length} groups.`));
    } catch (err) {
      console.log(error(`Failed to load groups: ${err.message}`));
      groups = [];
    }

    // ── Adapter + Dispatcher ─────────────────────────────
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

    const processWithBackend = (request) => dispatcher.dispatch(request);

    // ── API server (outbound push) ────────────────────────
    let apiServer = null;
    const apiConfig = config.api || {};
    const apiPort = apiConfig.port || process.env.BUZZIE_API_PORT || 3100;
    const apiToken = apiConfig.token || process.env.BUZZIE_API_TOKEN;
    try {
      apiServer = createApiServer(adapter, { token: apiToken });
      await apiServer.start(Number(apiPort));
    } catch (err) {
      console.log(error(`API server failed to start: ${err.message}`));
    }

    // ── Ready ──────────────────────────────────────────────
    console.log(success("Bot ready. Message yourself on WhatsApp to get started.\n"));

    const startTs = Math.floor(Date.now() / 1000);

    // Auto-reconnect on close
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

    // Listen for self-chat commands
    sock.ev.on("messages.upsert", async ({ messages: msgs }) => {
      for (const msg of msgs) {
        if (!msg.key.fromMe) continue;
        if (!msg.message) continue;

        if (msg.key.id && sentByBot.has(msg.key.id)) {
          sentByBot.delete(msg.key.id);
          continue;
        }

        const remoteJid = msg.key.remoteJid;
        const isSelfChat = remoteJid === selfChatJid || (selfChatLid && remoteJid === selfChatLid);
        if (!isSelfChat) continue;

        const ts = Number(msg.messageTimestamp || 0);
        if (ts && ts < startTs - 5) continue;

        const text = extractBody(msg);
        if (!text) continue;
        if (isBotMessage(text)) continue;

        console.log(`[self] ${text}`);

        // Always reply using the phone-format JID — LID sends succeed at
        // protocol level but don't render in WhatsApp's UI
        const replyJid = selfChatJid;
        const cancelAck = ackTimer(msg.key);
        try {
          const history = loadConversationHistory(3600000, 20);
          const result = await processWithBackend({
            type: "self_chat",
            jid: replyJid,
            senderName: msg.pushName || jidToPhone(selfChatJid),
            text,
            history,
            meta: { selfJid: replyJid, timestamp: new Date().toISOString() },
          });

          await cancelAck();

          console.log(`[self] backend responded: text=${result.text ? "yes" : "no"} actions=${result.actions?.length || 0}`);

          if (result.actions) await executeActions(result.actions, replyJid, msg.key, safeSend);

          if (result.text) {
            console.log(`[self] replying to ${replyJid}`);
            await botReply(replyJid, result.text);
          } else {
            console.log(`[self] no text in response, skipping reply`);
          }
        } catch (err) {
          await cancelAck();
          console.log(error(`Handler error: ${err.message}`));
          try {
            await botReply(replyJid, `Something went wrong: ${err.message}`);
          } catch {
            // Socket may still be reconnecting
          }
        }
      }
    });

    // ── Group triggers: ❓ reaction & reply-to-bot ──────────

    function makeGroupContext() {
      return {
        groups,
        get sock() { return sock; },
        safeSend,
        selfJid: selfChatJid,
      };
    }

    async function handleGroupTrigger(jid, text, senderName, quotedContext, msgKey) {
      if (readConfig().groupsEnabled === false) return;

      const persona = loadPersonaByJid(jid) || DEFAULT_PERSONA;
      const personaRow = getPersonaByJid(jid);
      const groupName = personaRow?.group_name || groups.find(g => g.id === jid)?.subject || jid;

      if (!checkRateLimit(jid)) {
        const entry = groupRateLimits.get(jid);
        const resetTime = new Date(entry.windowStart + 3600000).toLocaleTimeString();
        console.log(info(`Rate limit hit for ${groupName}`));
        try {
          await botReply(selfChatJid, `⚠️ Rate limit reached for ${groupName} (${DEFAULT_RATE_LIMIT}/hr). Auto-paused until ${resetTime}.`);
        } catch { /* ignore */ }
        return;
      }

      console.log(`[group] ${groupName} | ${senderName}: ${text.slice(0, 80)}`);

      const cancelAck = ackTimer(msgKey);
      try {
        const history = loadGroupHistory(jid, 3600000, 10);
        const result = await processWithBackend({
          type: isGroupJid(jid) ? "group" : "dm",
          jid,
          groupName,
          persona,
          senderName,
          text,
          quotedContext,
          history,
          meta: { selfJid: selfChatJid, timestamp: new Date().toISOString() },
        });
        await cancelAck();

        if (result.actions) await executeActions(result.actions, jid, msgKey, safeSend);

        if (result.text) {
          await safeSend(jid, { text: BOT_PREFIX + result.text });
        }
      } catch (err) {
        await cancelAck();
        console.log(error(`Group handler error (${groupName}): ${err.message}`));
      }
    }

    // Trigger A: ❓ reaction on a message
    sock.ev.on("messages.upsert", async ({ messages: msgs }) => {
      for (const msg of msgs) {
        const reaction = msg.message?.reactionMessage;
        if (!reaction) continue;

        const jid = msg.key.remoteJid;
        console.log(`  [reaction] emoji="${reaction.text}" jid=${jid} fromMe=${msg.key.fromMe} isGroup=${isGroupJid(jid || "")}`);

        if (!jid || !isGroupJid(jid)) continue;

        const reactionText = reaction.text?.replace(/[\uFE0F\uFE0E\u200D]/g, "").trim();
        if (reactionText !== "❓") continue;

        if (msg.key.id && sentByBot.has(msg.key.id)) continue;

        const ts = Number(msg.messageTimestamp || 0);
        if (ts && ts < startTs - 5) continue;

        const reactedKey = reaction.key;
        if (!reactedKey?.id) continue;

        const reactedRow = getMessageByKey(jid, reactedKey.id);
        if (!reactedRow) {
          console.log(info(`❓ reaction in ${jid} but reacted message not in DB (msg id: ${reactedKey.id})`));
          continue;
        }

        if (reactedRow.body && isBotMessage(reactedRow.body)) continue;

        const text = reactedRow.body || "[media]";
        const senderName = msg.pushName || msg.key.participant || "Unknown";

        // Silent video download for video platform URLs
        const videoMatch = text.match(VIDEO_PLATFORM_RE);
        if (videoMatch) {
          if (readConfig().groupsEnabled === false) continue;
          if (!checkRateLimit(jid)) continue;

          try {
            const { downloadVideo } = await import("videogaga");
            const dlPath = join(getOutputDir(), `video-${Date.now()}.mp4`);
            const prev = process.cwd();
            process.chdir(getOutputDir());
            try { await downloadVideo(videoMatch[0], dlPath); } finally { process.chdir(prev); }

            const size = statSync(dlPath).size;
            if (size > 64 * 1024 * 1024) {
              console.log(info(`Video too large (${(size / 1024 / 1024).toFixed(1)}MB), falling through to LLM`));
            } else {
              const videoBuffer = readFileSync(dlPath);
              let quoted;
              if (reactedRow.raw_message) {
                try { quoted = JSON.parse(reactedRow.raw_message); } catch { /* ignore */ }
              }
              await safeSend(jid, { video: videoBuffer, mimetype: "video/mp4" }, quoted ? { quoted } : undefined);
              continue;
            }
          } catch (err) {
            console.log(error(`Video download failed for ${videoMatch[0]}: ${err.message}, falling through to LLM`));
          }
        }

        await handleGroupTrigger(jid, text, senderName, null, msg.key);
      }
    });

    // Trigger B: Reply to a bot message in a group
    sock.ev.on("messages.upsert", async ({ messages: msgs }) => {
      for (const msg of msgs) {
        if (!msg.message) continue;
        if (msg.key.fromMe) continue;

        const jid = msg.key.remoteJid;
        if (!jid || !isGroupJid(jid)) continue;

        if (msg.key.id && sentByBot.has(msg.key.id)) continue;

        const ts = Number(msg.messageTimestamp || 0);
        if (ts && ts < startTs - 5) continue;

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo
          || msg.message?.conversation && null;
        if (!contextInfo?.quotedMessage) continue;

        const quotedText = contextInfo.quotedMessage?.conversation
          || contextInfo.quotedMessage?.extendedTextMessage?.text
          || "";
        if (!isBotMessage(quotedText)) continue;

        const text = extractBody(msg);
        if (!text) continue;

        const senderName = msg.pushName || msg.key.participant || "Unknown";
        const quotedContext = quotedText.replace(/^\u{1F916}\s*/u, "");

        await handleGroupTrigger(jid, text, senderName, quotedContext, msg.key);
      }
    });

    // ── DM persona trigger ──────────────────────────────────
    sock.ev.on("messages.upsert", async ({ messages: msgs }) => {
      for (const msg of msgs) {
        if (!msg.message) continue;
        if (msg.key.fromMe) continue;

        const remoteJid = msg.key.remoteJid;
        if (!remoteJid || isGroupJid(remoteJid)) continue;
        if (remoteJid === selfChatJid) continue;

        if (msg.key.id && sentByBot.has(msg.key.id)) continue;

        const ts = Number(msg.messageTimestamp || 0);
        if (ts && ts < startTs - 5) continue;

        const text = extractBody(msg);
        if (!text) continue;
        if (isBotMessage(text)) continue;

        if (readConfig().groupsEnabled === false) continue;

        const persona = loadPersonaByJid(remoteJid);
        if (!persona) continue;

        if (!checkRateLimit(remoteJid)) {
          const entry = groupRateLimits.get(remoteJid);
          const resetTime = new Date(entry.windowStart + 3600000).toLocaleTimeString();
          const contactName = msg.pushName || jidToPhone(remoteJid);
          console.log(info(`Rate limit hit for DM ${contactName}`));
          try {
            await botReply(selfChatJid, `⚠️ Rate limit reached for DM with ${contactName} (${DEFAULT_RATE_LIMIT}/hr). Auto-paused until ${resetTime}.`);
          } catch { /* ignore */ }
          continue;
        }

        const contactName = msg.pushName || jidToPhone(remoteJid);
        console.log(`[dm] ${contactName}: ${text.slice(0, 80)}`);

        const cancelAck = ackTimer(msg.key);
        try {
          const history = loadGroupHistory(remoteJid, 3600000, 10);
          const result = await processWithBackend({
            type: "dm",
            jid: remoteJid,
            groupName: contactName,
            persona,
            senderName: contactName,
            text,
            quotedContext: null,
            history,
            meta: { selfJid: selfChatJid, timestamp: new Date().toISOString() },
          });
          await cancelAck();

          if (result.actions) await executeActions(result.actions, remoteJid, msg.key, safeSend);

          if (result.text) {
            await safeSend(remoteJid, { text: BOT_PREFIX + result.text });
          }
        } catch (err) {
          await cancelAck();
          console.log(error(`DM handler error (${contactName}): ${err.message}`));
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
