import { createDispatcher, createApiServer } from "@buzzie-ai/core";
import { openDb, closeDb, upsertCall, updateCallStatus, loadConversationHistory } from "../db.js";
import { readConfig, resolveTwilioConfig, resolveOpenAIKey, resolveWebhookUrl, resolveTtsVoice } from "../config.js";
import { createWebhookServer } from "../webhook.js";
import { createMediaStreamServer } from "../media-stream.js";
import { createVoiceAdapter } from "../adapter.js";
import { createTwilioClient } from "../session.js";
import { success, error, info } from "../utils/formatters.js";

export async function startBot(opts = {}) {
  openDb();

  const config = readConfig();
  const twilio = resolveTwilioConfig(config);
  const openaiKey = resolveOpenAIKey(config);
  const webhookUrl = resolveWebhookUrl(config);
  const ttsVoice = resolveTtsVoice(config);

  if (!twilio.accountSid || !twilio.authToken) {
    console.log(error("Twilio credentials not configured. Run setup."));
    process.exit(1);
  }
  if (!openaiKey) {
    console.log(error("OpenAI API key not configured. Run setup."));
    process.exit(1);
  }
  if (!webhookUrl) {
    console.log(error("Webhook URL not configured. Run setup."));
    process.exit(1);
  }

  const backendConfig = config.backend || { type: "builtin" };
  if (backendConfig.type !== "http") {
    console.log(info("No HTTP backend configured."));
    console.log(info('  backend: {"type":"http","url":"http://localhost:3000/api/chat"}'));
  }

  // Adapter + Dispatcher
  const adapter = createVoiceAdapter();
  const dispatcher = createDispatcher({
    backend: config.backend,
    groupBackends: config.groupBackends,
  });

  // API server
  const apiConfig = config.api || {};
  const apiPort = apiConfig.port || process.env.BUZZIE_API_PORT || 3100;
  const apiToken = apiConfig.token || process.env.BUZZIE_API_TOKEN;

  // Webhook + media stream handler
  const webhookServer = createWebhookServer({
    webhookUrl,
    onCallStart: (callSid, from, to) => {
      upsertCall(callSid, from, to, "ringing");
    },
    onCallEnd: (callSid, status, duration) => {
      updateCallStatus(callSid, status, duration);
    },
  });

  // Attach media stream WebSocket to the same HTTP server
  createMediaStreamServer({
    server: webhookServer,
    openaiApiKey: openaiKey,
    ttsVoice,
    onSpeech: async (callSid, text, fromNumber) => {
      console.log(`[bot] dispatching: ${fromNumber}: ${text.slice(0, 80)}`);

      try {
        const history = loadConversationHistory(3600000, 20);
        const result = await dispatcher.dispatch({
          type: "dm",
          jid: fromNumber || callSid,
          groupName: fromNumber || callSid,
          senderName: fromNumber || "Caller",
          text,
          history,
          meta: {
            selfJid: twilio.phoneNumber,
            timestamp: new Date().toISOString(),
            channel: "voice",
            callSid,
          },
        });

        return result.text || null;
      } catch (err) {
        console.log(error(`Dispatch error: ${err.message}`));
        return "Sorry, something went wrong. Please try again.";
      }
    },
  });

  // Start API server on same port
  try {
    const api = createApiServer(adapter, { token: apiToken });
    // API server needs its own port if webhook is using apiPort
    // For simplicity, webhook server serves both
  } catch (err) {
    console.log(error(`API server failed: ${err.message}`));
  }

  // Start listening
  webhookServer.listen(Number(apiPort), async () => {
    console.log(success(`Voice bot ready on port ${apiPort}`));
    console.log(info(`Phone: ${twilio.phoneNumber}`));
    console.log(info(`Webhook: ${webhookUrl}/voice/incoming`));
    console.log(info(`Media stream: ${webhookUrl.replace(/^http/, "ws")}/media-stream`));
    console.log(info(`TTS voice: ${ttsVoice}`));

    // Auto-configure Twilio phone number webhooks
    try {
      const client = createTwilioClient(twilio.accountSid, twilio.authToken);
      const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: twilio.phoneNumber });
      if (numbers.length > 0) {
        await numbers[0].update({
          voiceUrl: `${webhookUrl}/voice/incoming`,
          voiceMethod: "POST",
          statusCallback: `${webhookUrl}/voice/status`,
          statusCallbackMethod: "POST",
        });
        console.log(success("Twilio webhooks configured automatically."));
      } else {
        console.log(info(`Phone number ${twilio.phoneNumber} not found in Twilio. Configure webhooks manually.`));
      }
    } catch (err) {
      console.log(error(`Failed to auto-configure Twilio: ${err.message}`));
      console.log(info("Configure manually:"));
      console.log(info(`  Voice URL: ${webhookUrl}/voice/incoming (POST)`));
      console.log(info(`  Status URL: ${webhookUrl}/voice/status (POST)`));
    }

    console.log();
  });

  process.on("SIGINT", () => {
    console.log("\n" + info("Shutting down..."));
    webhookServer.close();
    closeDb();
    process.exit(0);
  });
}
