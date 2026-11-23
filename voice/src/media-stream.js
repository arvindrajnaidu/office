import { createHmac, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import { createSTTSession } from "./stt.js";
import { createTtsQueue } from "./tts-queue.js";
import { addTranscript } from "./db.js";

export function verifyManagedMediaCall(key, callSid, from, proof) {
  if (typeof callSid !== "string" || !/^CA[a-f0-9]{32}$/i.test(callSid)
      || typeof from !== "string" || !/^\+[1-9]\d{6,14}$/.test(from)) return false;
  const credentials = typeof proof === "string" && /^(\d{10})\.([\w-]{43})$/.exec(proof);
  if (!credentials) return false;
  const [, expires, signature] = credentials;
  const seconds = Number(expires) - Math.floor(Date.now() / 1000);
  if (seconds <= 0 || seconds > 90) return false;
  const expected = createHmac("sha256", key).update(`sal-media:${expires}:${callSid}:${from}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "base64url"));
}

/**
 * Create a WebSocket server for Twilio Media Streams.
 * Handles bidirectional audio: receives caller audio, sends AI responses.
 *
 * @param {object} opts
 * @param {import("http").Server} opts.server - HTTP server to attach to
 * @param {string} [opts.mediaKey] - Worker key for Hawk-managed calls
 * @param {string} opts.openaiApiKey - OpenAI API key
 * @param {string} [opts.ttsVoice] - TTS voice name
 * @param {string} [opts.ttsInstructions] - Tone/pace prompt for TTS
 * @param {Function} opts.onSpeech - async (callSid, text, fromNumber) => response text
 * @param {Function} [opts.onConnect] - async (callSid, fromNumber) => { text, audio? } | string | null
 * @returns {WebSocketServer}
 */
export function createMediaStreamServer(opts) {
  const { server, mediaKey, openaiApiKey, ttsVoice, ttsInstructions, onSpeech, onConnect } = opts;

  const wss = new WebSocketServer({ server, path: "/media-stream" });

  wss.on("connection", (ws) => {
    let callSid = null;
    let streamSid = null;
    let fromNumber = null;
    let sttSession = null;
    let playbackUntil = 0;

    console.log("[media] new connection");

    function sendFrame(frame) {
      if (ws.readyState !== ws.OPEN || !streamSid) return;
      // Twilio plays 8 kHz μ-law audio. Leave time for handset echo to decay.
      playbackUntil = Math.max(playbackUntil, Date.now() + 300);
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

    const openSpeech = () => createSTTSession({
      apiKey: openaiApiKey,
      onSpeechStart: () => {
        // Barge-in: caller started speaking while bot may be talking.
        // Drop everything queued/playing so the caller's new turn lands cleanly.
        ttsQueue.clear();
      },
      onTranscript: async (text) => {
        if (!callSid || Date.now() < playbackUntil) return;

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

    if (!mediaKey) sttSession = openSpeech();
    const handshake = mediaKey && setTimeout(() => ws.close(1008, "Missing call authorization"), 5000);

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.event) {
          case "connected":
            console.log("[media] stream connected");
            break;

          case "start":
            if (streamSid) break;
            if (mediaKey && (!msg.start?.streamSid || !verifyManagedMediaCall(mediaKey, msg.start?.callSid,
              msg.start?.customParameters?.from, msg.start?.customParameters?.proof))) {
              ws.close(1008, "Invalid call authorization");
              return;
            }
            clearTimeout(handshake);
            sttSession ??= openSpeech();
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
            if (msg.media?.payload && sttSession && Date.now() >= playbackUntil) {
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
      clearTimeout(handshake);
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
