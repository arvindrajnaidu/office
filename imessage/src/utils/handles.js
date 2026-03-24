/**
 * iMessage handle and chat identifier utilities.
 *
 * iMessage chat identifiers:
 * - DM: "iMessage;-;+14155551234" or "iMessage;-;user@example.com"
 * - Group: "chat123456789" or "iMessage;+;chat123456789"
 */

/**
 * Check if a chat identifier represents a group chat.
 * Group chats in iMessage typically start with "chat" or contain commas (multi-participant).
 */
export function isGroupChat(chatId) {
  if (!chatId) return false;
  // Group chats have "chat" prefix in their identifier
  if (chatId.startsWith("chat")) return true;
  // Some group identifiers contain commas (multiple participants)
  if (chatId.includes(",")) return true;
  return false;
}

/**
 * Normalize a phone number handle — strip whitespace, dashes, parens.
 */
export function normalizeHandle(handle) {
  if (!handle) return "";
  // If it's an email, return as-is
  if (handle.includes("@")) return handle.trim();
  // Strip non-digit chars except leading +
  const cleaned = handle.trim();
  if (cleaned.startsWith("+")) {
    return "+" + cleaned.slice(1).replace(/[^0-9]/g, "");
  }
  return cleaned.replace(/[^0-9]/g, "");
}

/**
 * Format a handle for display.
 */
export function formatHandle(handle) {
  if (!handle) return "Unknown";
  return handle;
}

/**
 * Extract the phone/email handle from a chat identifier.
 * e.g. "iMessage;-;+14155551234" → "+14155551234"
 */
export function extractHandle(chatId) {
  if (!chatId) return "";
  // Format: "iMessage;-;+14155551234" or "SMS;-;+14155551234"
  const parts = chatId.split(";");
  if (parts.length >= 3) {
    return parts[parts.length - 1];
  }
  return chatId;
}
