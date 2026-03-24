import { Resend } from "resend";

/**
 * Create a Resend client instance.
 * @param {string} apiKey - Resend API key (re_...)
 * @returns {Resend}
 */
export function createClient(apiKey) {
  return new Resend(apiKey);
}

/**
 * Validate a Resend API key by listing domains.
 * @param {string} apiKey
 * @returns {Promise<{ok: boolean, domains?: Array, error?: string}>}
 */
export async function checkApiKey(apiKey) {
  try {
    const client = new Resend(apiKey);
    const { data, error } = await client.domains.list();
    if (error) return { ok: false, error: error.message };
    return { ok: true, domains: data?.data || [] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Resolve the Resend API key from env var or config.
 * @param {object} config
 * @returns {string|null}
 */
export function resolveApiKey(config) {
  return process.env.RESEND_API_KEY || config.resendApiKey || null;
}

/**
 * Resolve the default "from" email address.
 * @param {object} config
 * @returns {string|null}
 */
export function resolveFromAddress(config) {
  return process.env.EMAIL_FROM || config.fromAddress || null;
}
