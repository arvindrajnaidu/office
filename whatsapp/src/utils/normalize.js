/**
 * Normalize text by replacing curly quotes, ellipsis, nbsp, and collapsing whitespace.
 * Extracted from Whatsapp/src/ReliableWhatsAppListener.js
 */
export function normalize(text) {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
