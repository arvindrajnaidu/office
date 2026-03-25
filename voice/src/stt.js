import { WebSocket } from "ws";

/**
 * OpenAI Realtime API speech-to-text.
 * Connects via WebSocket, receives audio chunks, emits transcription events.
 *
 * @param {object} opts
 * @param {string} opts.apiKey - OpenAI API key
 * @param {string} [opts.model] - Model (default "gpt-4o-transcribe")
 * @param {Function} opts.onTranscript - Called with final transcript text
 * @param {Function} [opts.onError] - Called on error
 * @returns {{ sendAudio(base64Audio: string): void, close(): void }}
 */
export function createSTTSession(opts) {
  const { apiKey, model = "gpt-4o-transcribe", onTranscript, onError } = opts;

  const url = "wss://api.openai.com/v1/realtime?intent=transcription";
  const ws = new WebSocket(url, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  let sessionReady = false;

  ws.on("open", () => {
    // Configure the transcription session
    ws.send(JSON.stringify({
      type: "transcription_session.update",
      session: {
        input_audio_format: "g711_ulaw",
        input_audio_transcription: {
          model,
          language: "en",
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          silence_duration_ms: 800,
        },
      },
    }));
    sessionReady = true;
  });

  ws.on("message", (data) => {
    try {
      const event = JSON.parse(data.toString());

      if (event.type === "conversation.item.input_audio_transcription.completed") {
        const text = event.transcript?.trim();
        if (text) {
          onTranscript(text);
        }
      }

      if (event.type === "error") {
        console.log(`[stt] error: ${event.error?.message || JSON.stringify(event.error)}`);
        onError?.(new Error(event.error?.message || "STT error"));
      }
    } catch { /* ignore parse errors */ }
  });

  ws.on("error", (err) => {
    console.log(`[stt] websocket error: ${err.message}`);
    onError?.(err);
  });

  ws.on("close", () => {
    sessionReady = false;
  });

  return {
    sendAudio(base64Audio) {
      if (!sessionReady || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: base64Audio,
      }));
    },

    close() {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    },
  };
}
