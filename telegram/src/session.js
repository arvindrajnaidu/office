import { Bot } from "grammy";

/**
 * Create a Grammy Bot instance.
 * @param {string} token - Telegram bot token from @BotFather
 * @returns {Bot}
 */
export function createBot(token) {
  return new Bot(token);
}

/**
 * Validate a bot token by calling getMe().
 * @param {string} token
 * @returns {Promise<{ok: boolean, botInfo?: object, error?: string}>}
 */
export async function checkToken(token) {
  try {
    const bot = new Bot(token);
    const me = await bot.api.getMe();
    return { ok: true, botInfo: me };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Resolve the bot token from env var or config.
 * @param {object} config - Config object from readConfig()
 * @returns {string|null}
 */
export function resolveToken(config) {
  return process.env.TELEGRAM_BOT_TOKEN || config.botToken || null;
}
