import { WebSocketServer } from "ws";
import { createSTTSession } from "./stt.js";
import { textToSpeech, pcmToMulaw } from "./tts.js";
import { addTranscript } from "./db.js";

/**
 * Create a WebSocket server for Twilio Media Streams.
 * Handles bidirectional audio: receives caller audio, sends AI responses.
 *
 * @param {object} opts
 * @param {import("http").Server} opts.server - HTTP server to attach to
 * @param {string} opts.openaiApiKey - OpenAI API key
 * @param {string} opts.ttsVoice - TTS voice name
 * @param {Function} opts.onSpeech - async (callSid, text, fromNumber) => response text
 * @param {Function} [opts.onConnect] - async (callSid, fromNumber) => greeting text (optional)
 * @returns {WebSocketServer}
 */
export function createMediaStreamServer(opts) {
  const { server, openaiApiKey, ttsVoice, onSpeech, onConnect } = opts;

  const wss = new WebSocketServer({ server, path: "/media-stream" });

  wss.on("connection", (ws) => {
    let callSid = null;
    let streamSid = null;
    let fromNumber = null;
    let sttSession = null;
    let isSpeaking = false;

    console.log("[media] new connection");

    // Set up STT
    sttSession = createSTTSession({
      apiKey: openaiApiKey,
      onTranscript: async (text) => {
        if (!callSid || isSpeaking) return;

        console.log(`[media] caller said: ${text}`);
        addTranscript(callSid, "user", text);

        isSpeaking = true;
        try {
          // Get response from brain
          const response = await onSpeech(callSid, text, fromNumber);
          if (!response) {
            isSpeaking = false;
            return;
          }

          console.log(`[media] brain said: ${response.slice(0, 80)}`);
          addTranscript(callSid, "assistant", response);

          // Convert to speech and send back
          const pcmAudio = await textToSpeech(response, {
            apiKey: openaiApiKey,
            voice: ttsVoice,
          });
          const mulawAudio = pcmToMulaw(pcmAudio);

          // Send audio in chunks (Twilio expects base64 mu-law in JSON messages)
          const chunkSize = 640; // ~80ms at 8kHz
          for (let i = 0; i < mulawAudio.length; i += chunkSize) {
            const chunk = mulawAudio.subarray(i, i + chunkSize);
            if (ws.readyState === ws.OPEN && streamSid) {
              ws.send(JSON.stringify({
                event: "media",
                streamSid,
                media: {
                  payload: chunk.toString("base64"),
                },
              }));
            }
          }

          // Mark end of audio
          if (ws.readyState === ws.OPEN && streamSid) {
            ws.send(JSON.stringify({
              event: "mark",
              streamSid,
              mark: { name: `response-${Date.now()}` },
            }));
          }
        } catch (err) {
          console.log(`[media] error: ${err.message}`);
        } finally {
          isSpeaking = false;
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

            // Notify brain of connection so it can send a greeting
            if (onConnect) {
              (async () => {
                isSpeaking = true;
                try {
                  const greeting = await onConnect(callSid, fromNumber);
                  if (!greeting) { isSpeaking = false; return; }

                  console.log(`[media] greeting: ${greeting.slice(0, 80)}`);
                  addTranscript(callSid, "assistant", greeting);

                  const pcmAudio = await textToSpeech(greeting, {
                    apiKey: openaiApiKey,
                    voice: ttsVoice,
                  });
                  const mulawAudio = pcmToMulaw(pcmAudio);

                  const chunkSize = 640;
                  for (let i = 0; i < mulawAudio.length; i += chunkSize) {
                    const chunk = mulawAudio.subarray(i, i + chunkSize);
                    if (ws.readyState === ws.OPEN && streamSid) {
                      ws.send(JSON.stringify({
                        event: "media",
                        streamSid,
                        media: { payload: chunk.toString("base64") },
                      }));
                    }
                  }

                  if (ws.readyState === ws.OPEN && streamSid) {
                    ws.send(JSON.stringify({
                      event: "mark",
                      streamSid,
                      mark: { name: `greeting-${Date.now()}` },
                    }));
                  }
                } catch (err) {
                  console.log(`[media] greeting error: ${err.message}`);
                } finally {
                  isSpeaking = false;
                }
              })();
            }
            break;

          case "media":
            // Forward audio to STT
            if (msg.media?.payload && sttSession) {
              sttSession.sendAudio(msg.media.payload);
            }
            break;

          case "mark":
            // Audio playback completed
            break;

          case "stop":
            console.log(`[media] stream stopped: callSid=${callSid}`);
            break;
        }
      } catch { /* ignore parse errors */ }
    });

    ws.on("close", () => {
      console.log(`[media] connection closed: callSid=${callSid}`);
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
