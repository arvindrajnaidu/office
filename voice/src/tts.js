import OpenAI from "openai";

/**
 * Convert text to speech audio using OpenAI TTS API.
 * Returns a Buffer of audio in the specified format.
 *
 * @param {string} text - Text to speak
 * @param {object} opts
 * @param {string} opts.apiKey - OpenAI API key
 * @param {string} [opts.voice] - Voice name (default "nova")
 * @param {string} [opts.model] - Model name (default "gpt-4o-mini-tts")
 * @param {string} [opts.format] - Audio format (default "pcm16")
 * @returns {Promise<Buffer>}
 */
export async function textToSpeech(text, opts = {}) {
  const openai = new OpenAI({ apiKey: opts.apiKey });

  const response = await openai.audio.speech.create({
    model: opts.model || "gpt-4o-mini-tts",
    voice: opts.voice || "nova",
    input: text,
    response_format: "pcm",
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Convert PCM16 audio to mu-law for Twilio.
 * Twilio media streams expect mu-law 8kHz mono.
 */
export function pcm16ToMulaw(pcmBuffer) {
  const mulaw = Buffer.alloc(pcmBuffer.length / 2);
  for (let i = 0; i < mulaw.length; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2);
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
