import OpenAI from "openai";

/**
 * 20ms of mu-law audio at 8kHz = 160 bytes. Twilio Media Streams expects
 * outbound audio paced at this granularity.
 */
export const MULAW_FRAME_BYTES = 160;

/**
 * Convert text to speech audio using OpenAI TTS API.
 * Returns a Buffer of PCM audio (24kHz 16-bit mono).
 *
 * @param {string} text - Text to speak
 * @param {object} opts
 * @param {string} opts.apiKey - OpenAI API key
 * @param {string} [opts.voice] - Voice name (default "coral")
 * @param {string} [opts.model] - Model name (default "gpt-4o-mini-tts")
 * @param {string} [opts.instructions] - Tone/pacing prompt for gpt-4o-mini-tts
 * @returns {Promise<Buffer>}
 */
export async function textToSpeech(text, opts = {}) {
  const openai = new OpenAI({ apiKey: opts.apiKey });

  const params = {
    model: opts.model || "gpt-4o-mini-tts",
    voice: opts.voice || "coral",
    input: text,
    response_format: "pcm",
  };
  if (opts.instructions) params.instructions = opts.instructions;

  const response = await openai.audio.speech.create(params);

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * 13-tap windowed-sinc low-pass with Hamming window, cutoff ~3.4kHz at 24kHz.
 * Applied before 3:1 decimation to 8kHz to avoid the aliasing hiss on fricatives
 * that the old naive decimator produced.
 */
const ANTI_ALIAS_TAPS = (() => {
  const N = 13;
  const fc = 0.14; // normalized cutoff: 3.36kHz / 24kHz
  const taps = new Float32Array(N);
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const n = i - (N - 1) / 2;
    const sinc = n === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * n) / (Math.PI * n);
    const hamming = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1));
    taps[i] = sinc * hamming;
    sum += taps[i];
  }
  for (let i = 0; i < N; i++) taps[i] /= sum;
  return taps;
})();

const FILTER_HALF = (ANTI_ALIAS_TAPS.length - 1) >> 1;

/**
 * Convert PCM audio (24kHz 16-bit mono) to mu-law (8kHz mono) for Twilio.
 * Low-pass filters then decimates 3:1.
 */
export function pcmToMulaw(pcmBuffer) {
  const RATIO = 3;
  const numInputSamples = pcmBuffer.length / 2;
  const numOutputSamples = Math.floor(numInputSamples / RATIO);
  const mulaw = Buffer.alloc(numOutputSamples);

  for (let i = 0; i < numOutputSamples; i++) {
    const center = i * RATIO;
    let acc = 0;
    for (let k = 0; k < ANTI_ALIAS_TAPS.length; k++) {
      const idx = center + k - FILTER_HALF;
      if (idx < 0 || idx >= numInputSamples) continue;
      acc += pcmBuffer.readInt16LE(idx * 2) * ANTI_ALIAS_TAPS[k];
    }
    let sample = Math.round(acc);
    if (sample > 32767) sample = 32767;
    else if (sample < -32768) sample = -32768;
    mulaw[i] = linearToMulaw(sample);
  }

  return mulaw;
}

function linearToMulaw(sample) {
  const MULAW_MAX = 0x1FFF;
  const MULAW_BIAS = 33;
  const sign = (sample >> 8) & 0x80;

  if (sign !== 0) sample = -sample;
  if (sample > MULAW_MAX) sample = MULAW_MAX;

  sample = sample + MULAW_BIAS;
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}
  const mantissa = (sample >> (exponent + 3)) & 0x0F;
  const mulawByte = ~(sign | (exponent << 4) | mantissa);

  return mulawByte & 0xFF;
}
