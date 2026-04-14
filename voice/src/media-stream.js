import { WebSocketServer } from "ws";
import { createSTTSession } from "./stt.js";
import { createTtsQueue } from "./tts-queue.js";
import { addTranscript } from "./db.js";

/**
 * Create a WebSocket server for Twilio Media Streams.
 * Handles bidirectional audio: receives caller audio, sends AI responses.
 *
 * @param {object} opts
 * @param {import("http").Server} opts.server - HTTP server to attach to
 * @param {string} opts.openaiApiKey - OpenAI API key
 * @param {string} [opts.ttsVoice] - TTS voice name
 * @param {string} [opts.ttsInstructions] - Tone/pace prompt for TTS
 * @param {Function} opts.onSpeech - async (callSid, text, fromNumber) => response text
 * @param {Function} [opts.onConnect] - async (callSid, fromNumber) => { text, audio? } | string | null
 * @returns {WebSocketServer}
 */
export function createMediaStreamServer(opts) {
  const { server, openaiApiKey, ttsVoice, ttsInstructions, onSpeech, onConnect } = opts;

  const wss = new WebSocketServer({ server, path: "/media-stream" });

  wss.on("connection", (ws) => {
    let callSid = null;
    let streamSid = null;
    let fromNumber = null;
    let sttSession = null;

    console.log("[media] new connection");

    function sendFrame(frame) {
      if (ws.readyState !== ws.OPEN || !streamSid) return;
      ws.send(JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: frame.toString("base64") },
      }));
    }

    function sendTwilioClear() {
      if (ws.readyState !== ws.OPEN || !streamSid) return;
      ws.send(JSON.stringify({ event: "clear", streamSid }));
    }

    const ttsQueue = createTtsQueue({
      apiKey: openaiApiKey,
      voice: ttsVoice,
      instructions: ttsInstructions,
      sendFrame,
      onClear: sendTwilioClear,
    });

    sttSession = createSTTSession({
      apiKey: openaiApiKey,
      onSpeechStart: () => {
        // Barge-in: caller started speaking while bot may be talking.
        // Drop everything queued/playing so the caller's new turn lands cleanly.
        ttsQueue.clear();
      },
      onTranscript: async (text) => {
        if (!callSid) return;

        console.log(`[media] caller said: ${text}`);
        addTranscript(callSid, "user", text);

        try {
          const response = await onSpeech(callSid, text, fromNumber);
          if (!response) return;

          console.log(`[media] brain said: ${response.slice(0, 80)}`);
          addTranscript(callSid, "assistant", response);
          ttsQueue.enqueue(response);
        } catch (err) {
          console.log(`[media] error: ${err.message}`);
        }
      },
      onError: (err) => {
        console.log(`[media] stt error: ${err.message}`);
      },
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.event) {
          case "connected":
            console.log("[media] stream connected");
            break;

          case "start":
            callSid = msg.start?.callSid;
            streamSid = msg.start?.streamSid;
            fromNumber = msg.start?.customParameters?.from || null;
            console.log(`[media] stream started: callSid=${callSid} from=${fromNumber}`);

            if (onConnect) {
              (async () => {
                try {
                  const greeting = await onConnect(callSid, fromNumber);
                  if (!greeting) return;

                  // Accept either a plain string or { text, audio } for pre-warmed caches.
                  const text = typeof greeting === "string" ? greeting : greeting.text;
                  const cachedAudio = typeof greeting === "string" ? null : greeting.audio;

                  if (text) {
                    console.log(`[media] greeting: ${text.slice(0, 80)}`);
                    addTranscript(callSid, "assistant", text);
                  }

                  if (cachedAudio) {
                    ttsQueue.enqueueAudio(cachedAudio);
                  } else if (text) {
                    ttsQueue.enqueue(text);
                  }
                } catch (err) {
                  console.log(`[media] greeting error: ${err.message}`);
                }
              })();
            }
            break;

          case "media":
            if (msg.media?.payload && sttSession) {
              sttSession.sendAudio(msg.media.payload);
            }
            break;

          case "mark":
            break;

          case "stop":
            console.log(`[media] stream stopped: callSid=${callSid}`);
            break;
        }
      } catch { /* ignore parse errors */ }
    });

    ws.on("close", () => {
      console.log(`[media] connection closed: callSid=${callSid}`);
      ttsQueue.clear();
      if (sttSession) {
        sttSession.close();
        sttSession = null;
      }
    });

    ws.on("error", (err) => {
      console.log(`[media] ws error: ${err.message}`);
    });
  });

  return wss;
}
