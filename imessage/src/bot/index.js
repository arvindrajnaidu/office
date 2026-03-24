import { createDispatcher, createApiServer } from "@buzzie-ai/core";
import { checkAccess, createPoller, detectSelfHandle } from "../session.js";
import { openDb, closeDb, upsertMessage, getPersonaByJid, loadConversationHistory, loadGroupHistory } from "../db.js";
import { readConfig, writeConfig, loadPersonaByJid } from "../config.js";
import { isGroupChat, extractHandle } from "../utils/handles.js";
import { success, error, info } from "../utils/formatters.js";
import { sendMessage, sendToGroupChat } from "../imessage/send.js";
import { getChats } from "../imessage/db.js";
import { createIMessageAdapter } from "../adapter.js";
import { startScheduler } from "./scheduler.js";

// All bot replies start with this prefix so we can ignore them
const BOT_PREFIX = "\u{1F916} ";

const DEFAULT_PERSONA = "You are a helpful assistant. Be concise and relevant.";

// Per-chat rate limiter: Map<chatId, { count, windowStart }>
const chatRateLimits = new Map();
const DEFAULT_RATE_LIMIT = 10; // per hour

function checkRateLimit(chatId) {
  const now = Date.now();
  const entry = chatRateLimits.get(chatId);
  if (!entry || now - entry.windowStart > 3600000) {
    chatRateLimits.set(chatId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= DEFAULT_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function isBotMessage(text) {
  return text?.startsWith(BOT_PREFIX);
}

function cacheMessage(msg) {
  const chatId = msg.chatId;
  if (!chatId) return;
  upsertMessage(msg);
  const sender = msg.isFromMe ? "You" : (msg.handle || chatId);
  console.log(`  [db] +1 ${chatId} from=${sender}`);
}

async function safeSend(chatId, text) {
  console.log(`[send] to=${chatId} group=${isGroupChat(chatId)}`);
  try {
    if (isGroupChat(chatId)) {
      const chats = getChats({ limit: 200 });
      const chat = chats.find(c => c.chatId === chatId);
      const name = chat?.displayName || chatId;
      console.log(`[send] sendToGroupChat name=${name}`);
      await sendToGroupChat(name, text);
    } else {
      const handle = extractHandle(chatId);
      console.log(`[send] sendMessage handle=${handle}`);
      await sendMessage(handle, text);
    }
    console.log(`[send] ok`);
  } catch (err) {
    console.log(`[send] error: ${err.message}`);
    throw err;
  }
}

async function executeActions(actions, defaultChatId) {
  console.log(`[actions] executing ${actions.length} action(s)`);
  for (const action of actions) {
    console.log(`[actions] ${action.type} → ${action.jid || defaultChatId}`);
    switch (action.type) {
      case "reply_text":
        await safeSend(defaultChatId, BOT_PREFIX + action.text);
        break;
      case "send_message":
        await safeSend(action.jid || defaultChatId, action.text);
        break;
      case "react":
        console.log(`[actions] sendReaction not supported on iMessage`);
        break;
      case "send_image":
      case "send_document":
        console.log(`[actions] ${action.type} not yet implemented`);
        break;
      default:
        console.log(`[actions] unknown action type: ${action.type}`);
    }
  }
}

export async function startBot(opts = {}) {
  openDb();

  if (!checkAccess()) {
    console.log(error("Cannot read iMessage database. Grant Full Disk Access."));
    process.exit(1);
  }

  const config = readConfig();
  const backendConfig = config.backend || { type: "builtin" };
  if (backendConfig.type !== "http") {
    console.log(info("No HTTP backend configured — running in builtin mode (deprecated)."));
    console.log(info("Set up the assistant app and configure:"));
    console.log(info('  backend: {"type":"http","url":"http://localhost:3000/api/chat"}'));
  } else {
    console.log(info(`Backend: ${backendConfig.url}`));
  }

  // Detect or load self handle for self-chat detection
  let selfHandle = config.selfHandle;
  if (!selfHandle) {
    selfHandle = detectSelfHandle();
    if (selfHandle) {
      writeConfig({ selfHandle });
      console.log(info(`Auto-detected self handle: ${selfHandle}`));
    } else {
      console.log(info("Could not auto-detect self handle. Self-chat detection may not work."));
      console.log(info("Set selfHandle in ~/.imessage-cli/config.json manually."));
    }
  } else {
    console.log(info(`Self handle: ${selfHandle}`));
  }

  // Build chat name map for adapter
  const chats = getChats({ limit: 200 });
  const chatNameMap = new Map(chats.map(c => [c.chatId, c.displayName]));

  // Create adapter + dispatcher
  const adapter = createIMessageAdapter({ chatNameMap });

  const dispatcher = createDispatcher({
    backend: config.backend,
    groupBackends: config.groupBackends,
  });

  const processWithBackend = (request) => dispatcher.dispatch(request);

  // API server (outbound push)
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

  // Create poller (sees both incoming and self-messages)
  const poller = createPoller({ onlyIncoming: false, interval: 3000 });

  console.log(success("Bot ready. Send yourself an iMessage to get started.\n"));

  const startTs = Math.floor(Date.now() / 1000);

  poller.on("message", async (msg) => {
    cacheMessage(msg);

    const chatId = msg.chatId;
    const ts = msg.date ? Math.floor(msg.date.getTime() / 1000) : 0;

    // Skip old messages
    if (ts && ts < startTs - 5) {
      console.log(`  [skip] old message ts=${ts} startTs=${startTs}`);
      return;
    }

    const text = msg.text;
    if (!text) {
      console.log(`  [skip] no text content`);
      return;
    }
    if (isBotMessage(text)) {
      console.log(`  [skip] bot message (has prefix)`);
      return;
    }

    if (msg.isFromMe) {
      // Self-chat: messages I sent to myself
      const isSelfChat = selfHandle && chatId && (
        chatId.includes(selfHandle) ||
        extractHandle(chatId) === selfHandle
      );

      if (!isSelfChat) {
        console.log(`  [skip] fromMe but not self-chat: chatId=${chatId} selfHandle=${selfHandle}`);
        return;
      }

      console.log(`[self] ${text}`);

      try {
        const history = loadConversationHistory(3600000, 20);
        const result = await processWithBackend({
          type: "self_chat",
          jid: chatId,
          senderName: selfHandle,
          text,
          history,
          meta: { selfJid: chatId, timestamp: new Date().toISOString() },
        });

        console.log(`[self] backend responded: text=${result.text ? "yes" : "no"} actions=${result.actions?.length || 0}`);

        if (result.actions) await executeActions(result.actions, chatId);

        if (result.text) {
          console.log(`[self] replying to ${chatId}`);
          await safeSend(chatId, BOT_PREFIX + result.text);
        } else {
          console.log(`[self] no text in response, skipping reply`);
        }
      } catch (err) {
        console.log(error(`Handler error: ${err.message}`));
        try {
          await safeSend(chatId, BOT_PREFIX + `Something went wrong: ${err.message}`);
        } catch (sendErr) {
          console.log(error(`Failed to send error reply: ${sendErr.message}`));
        }
      }
      return;
    }

    // Incoming message
    if (readConfig().groupsEnabled === false) {
      console.log(`  [skip] groups disabled`);
      return;
    }

    if (isGroupChat(chatId)) {
      // Group message — check for persona
      const persona = loadPersonaByJid(chatId);
      if (!persona) {
        console.log(`  [skip] group ${chatId} has no persona`);
        return;
      }

      if (!checkRateLimit(chatId)) {
        console.log(info(`Rate limit hit for ${chatId}`));
        return;
      }

      const senderName = msg.handle || "Unknown";
      const groupName = msg.chatDisplayName || chatNameMap.get(chatId) || chatId;
      console.log(`[group] ${groupName} | ${senderName}: ${text.slice(0, 80)}`);

      try {
        const history = loadGroupHistory(chatId, 3600000, 10);
        const result = await processWithBackend({
          type: "group",
          jid: chatId,
          groupName,
          persona,
          senderName,
          text,
          quotedContext: null,
          history,
          meta: { selfJid: chatId, timestamp: new Date().toISOString() },
        });

        console.log(`[group] backend responded: text=${result.text ? "yes" : "no"} actions=${result.actions?.length || 0}`);

        if (result.actions) await executeActions(result.actions, chatId);

        if (result.text) {
          console.log(`[group] replying to ${chatId}`);
          await safeSend(chatId, BOT_PREFIX + result.text);
        } else {
          console.log(`[group] no text in response, skipping reply`);
        }
      } catch (err) {
        console.log(error(`Group handler error: ${err.message}`));
      }
    } else {
      // DM — check for persona
      const persona = loadPersonaByJid(chatId);
      if (!persona) {
        console.log(`  [skip] DM ${chatId} has no persona`);
        return;
      }

      if (!checkRateLimit(chatId)) {
        console.log(info(`Rate limit hit for DM ${chatId}`));
        return;
      }

      const contactName = msg.handle || chatId;
      console.log(`[dm] ${contactName}: ${text.slice(0, 80)}`);

      try {
        const history = loadGroupHistory(chatId, 3600000, 10);
        const result = await processWithBackend({
          type: "dm",
          jid: chatId,
          groupName: contactName,
          persona,
          senderName: contactName,
          text,
          quotedContext: null,
          history,
          meta: { selfJid: chatId, timestamp: new Date().toISOString() },
        });

        console.log(`[dm] backend responded: text=${result.text ? "yes" : "no"} actions=${result.actions?.length || 0}`);

        if (result.actions) await executeActions(result.actions, chatId);

        if (result.text) {
          console.log(`[dm] replying to ${chatId}`);
          await safeSend(chatId, BOT_PREFIX + result.text);
        } else {
          console.log(`[dm] no text in response, skipping reply`);
        }
      } catch (err) {
        console.log(error(`DM handler error: ${err.message}`));
      }
    }
  });

  poller.on("error", (err) => {
    console.log(error(`Polling error: ${err.message}`));
  });

  poller.start();

  const stopScheduler = startScheduler();

  process.on("SIGINT", () => {
    console.log("\n" + info("Shutting down bot..."));
    stopScheduler();
    poller.stop();
    closeDb();
    process.exit(0);
  });
}
