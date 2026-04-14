import { textToSpeech, pcmToMulaw, MULAW_FRAME_BYTES } from "./tts.js";

const FRAME_INTERVAL_MS = 20;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Split a brain response into sentence-sized chunks for incremental TTS.
 * Keeps punctuation so the TTS model can prosody accordingly.
 */
export function splitSentences(text) {
  if (!text) return [];
  const parts = text.match(/[^.!?\n]+[.!?\n]*/g) || [];
  return parts.map((s) => s.trim()).filter(Boolean);
}

/**
 * Create a streaming TTS queue that synthesizes sentences in parallel and
 * plays them back in order, 20ms mu-law frames at a time, to a sender
 * function. `clear()` aborts in-flight playback for barge-in.
 *
 * @param {object} opts
 * @param {string} opts.apiKey - OpenAI API key
 * @param {string} [opts.voice]
 * @param {string} [opts.instructions]
 * @param {(frame: Buffer) => void} opts.sendFrame - Ship one 160-byte mu-law frame to Twilio
 * @param {() => void} [opts.onClear] - Called when clear() fires, to notify Twilio
 */
export function createTtsQueue(opts) {
  const { apiKey, voice, instructions, sendFrame, onClear } = opts;

  let queue = [];
  let controller = new AbortController();
  let draining = false;

  async function synthesize(text, signal) {
    try {
      const pcm = await textToSpeech(text, { apiKey, voice, instructions });
      if (signal.aborted) return null;
      return pcmToMulaw(pcm);
    } catch (err) {
      if (!signal.aborted) console.log(`[tts-queue] synth error: ${err.message}`);
      return null;
    }
  }

  async function playBuffer(buf, signal) {
    for (let i = 0; i < buf.length; i += MULAW_FRAME_BYTES) {
      if (signal.aborted) return;
      const end = Math.min(i + MULAW_FRAME_BYTES, buf.length);
      sendFrame(buf.subarray(i, end));
      await sleep(FRAME_INTERVAL_MS);
    }
  }

  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item.signal.aborted) continue;
        const buf = await item.promise;
        if (!buf || item.signal.aborted) continue;
        await playBuffer(buf, item.signal);
      }
    } finally {
      draining = false;
    }
  }

  function enqueue(text) {
    if (!text) return;
    const sentences = splitSentences(text);
    for (const sentence of sentences) {
      const signal = controller.signal;
      const promise = synthesize(sentence, signal);
      queue.push({ promise, signal });
    }
    drain();
  }

  /** Enqueue pre-synthesized mu-law bytes (used for cached greetings). */
  function enqueueAudio(mulawBuffer) {
    if (!mulawBuffer || mulawBuffer.length === 0) return;
    const signal = controller.signal;
    queue.push({ promise: Promise.resolve(mulawBuffer), signal });
    drain();
  }

  function clear() {
    controller.abort();
    controller = new AbortController();
    queue = [];
    onClear?.();
  }

  return { enqueue, enqueueAudio, clear };
}
