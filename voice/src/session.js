import twilio from "twilio";

/**
 * Create a Twilio client.
 */
export function createTwilioClient(accountSid, authToken) {
  return twilio(accountSid, authToken);
}

/**
 * Validate Twilio credentials by fetching account info.
 */
export async function checkTwilioCredentials(accountSid, authToken) {
  try {
    const client = twilio(accountSid, authToken);
    const account = await client.api.accounts(accountSid).fetch();
    return { ok: true, friendlyName: account.friendlyName };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Validate OpenAI key.
 */
export async function checkOpenAIKey(apiKey) {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return { ok: res.ok || res.status === 429 };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
