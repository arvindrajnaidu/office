import { createDispatcher, createApiServer } from "@buzzie-ai/core";
import { createBot, resolveToken } from "../session.js";
import { openDb, closeDb, upsertMessage, loadConversationHistory, loadGroupHistory } from "../db.js";
import { readConfig, loadPersonaByJid } from "../config.js";
import { success, error, info } from "../utils/formatters.js";
import { createTelegramAdapter } from "../adapter.js";
import { startScheduler } from "./scheduler.js";

const BOT_PREFIX = "\u{1F916} ";
const DEFAULT_PERSONA = "You are a helpful assistant. Be concise and relevant.";

// Per-chat rate limiter
const chatRateLimits = new Map();
const DEFAULT_RATE_LIMIT = 10;

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

async function executeActions(actions, defaultChatId, bot) {
  for (const action of actions) {
    switch (action.type) {
      case "reply_text":
        await bot.api.sendMessage(defaultChatId, BOT_PREFIX + action.text);
        break;
      case "send_message":
        await bot.api.sendMessage(action.jid || defaultChatId, action.text);
        break;
      case "react":
        try {
          await bot.api.setMessageReaction(defaultChatId, Number(action.targetMsgKey), [
            { type: "emoji", emoji: action.emoji },
          ]);
        } catch { /* reactions may not be supported */ }
        break;
      default:
        console.log(`  [bot] Unknown action type: ${action.type}`);
    }
  }
}

export async function startBot(opts = {}) {
  openDb();

  const config = readConfig();
  const token = resolveToken(config);
  if (!token) {
    console.log(error("No bot token. Run setup or set TELEGRAM_BOT_TOKEN."));
    process.exit(1);
  }

  const backendConfig = config.backend || { type: "builtin" };
  if (backendConfig.type !== "http") {
    console.log(info("No HTTP backend configured — running in builtin mode (deprecated)."));
    console.log(info("Set up the assistant app and configure:"));
    console.log(info('  backend: {"type":"http","url":"http://localhost:3000/api/chat"}'));
  }

  const bot = createBot(token);
  const botInfo = await bot.api.getMe();
  const botId = botInfo.id;
  const botUsername = botInfo.username;

  console.log(success(`Connected as @${botUsername} (${botInfo.first_name})`));

  // Adapter + Dispatcher
  const adapter = createTelegramAdapter({ getBot: () => bot });

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

  console.log(success("Bot ready. Send a DM to get started.\n"));

  // ── Message handler ──────────────────────────────────────

  bot.on("message", async (ctx) => {
    const msg = ctx.message;
    const chatId = String(msg.chat.id);
    const text = msg.text || msg.caption || "";

    // Cache every message
    upsertMessage(msg, botId);

    // Skip bot's own messages
    if (msg.from?.id === botId) return;
    if (isBotMessage(text)) return;
    if (!text) return;

    const isPrivate = msg.chat.type === "private";
    const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";

    // ── DM trigger ──────────────────────────────────────
    if (isPrivate) {
      console.log(`[dm] ${msg.from?.first_name}: ${text.slice(0, 80)}`);

      const persona = loadPersonaByJid(chatId);
      const type = persona ? "dm" : "self_chat";

      try {
        const history = type === "self_chat"
          ? loadConversationHistory(3600000, 20)
          : loadGroupHistory(chatId, 3600000, 10);

        const result = await processWithBackend({
          type,
          jid: chatId,
          groupName: msg.from?.first_name || chatId,
          persona: persona || undefined,
          senderName: msg.from?.first_name || msg.from?.username || "User",
          text,
          history,
          meta: { selfJid: String(botId), timestamp: new Date().toISOString() },
        });

        if (result.actions) await executeActions(result.actions, chatId, bot);

        if (result.text) {
          await bot.api.sendMessage(chatId, BOT_PREFIX + result.text);
        }
      } catch (err) {
        console.log(error(`DM handler error: ${err.message}`));
        try {
          await bot.api.sendMessage(chatId, BOT_PREFIX + `Something went wrong: ${err.message}`);
        } catch { /* ignore */ }
      }
      return;
    }

    // ── Group trigger ───────────────────────────────────
    if (isGroup) {
      // Check if bot is mentioned or message is a reply to bot
      const mentionsBot = msg.entities?.some(e =>
        e.type === "mention" && text.substring(e.offset, e.offset + e.length) === `@${botUsername}`
      );
      const repliesToBot = msg.reply_to_message?.from?.id === botId;
      const persona = loadPersonaByJid(chatId);

      if (!mentionsBot && !repliesToBot && !persona) return;

      if (config.groupsEnabled === false) return;

      if (!checkRateLimit(chatId)) {
        console.log(info(`Rate limit hit for group ${chatId}`));
        return;
      }

      const senderName = msg.from?.first_name || msg.from?.username || "Unknown";
      const groupName = msg.chat.title || chatId;
      // Strip bot mention from text
      const cleanText = text.replace(new RegExp(`@${botUsername}\\b`, "g"), "").trim();

      console.log(`[group] ${groupName} | ${senderName}: ${cleanText.slice(0, 80)}`);

      try {
        const history = loadGroupHistory(chatId, 3600000, 10);
        const result = await processWithBackend({
          type: "group",
          jid: chatId,
          groupName,
          persona: persona || DEFAULT_PERSONA,
          senderName,
          text: cleanText,
          quotedContext: null,
          history,
          meta: { selfJid: String(botId), timestamp: new Date().toISOString() },
        });

        if (result.actions) await executeActions(result.actions, chatId, bot);

        if (result.text) {
          await bot.api.sendMessage(chatId, BOT_PREFIX + result.text, {
            reply_to_message_id: msg.message_id,
          });
        }
      } catch (err) {
        console.log(error(`Group handler error: ${err.message}`));
      }
    }
  });

  // Start long-polling
  bot.start();

  const stopScheduler = startScheduler(bot);

  process.on("SIGINT", () => {
    console.log("\n" + info("Shutting down bot..."));
    stopScheduler();
    bot.stop();
    closeDb();
    process.exit(0);
  });
}
