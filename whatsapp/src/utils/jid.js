/**
 * JID <-> E.164 conversion helpers
 */

const WHATSAPP_SUFFIX = "@s.whatsapp.net";
const GROUP_SUFFIX = "@g.us";

/** Convert a phone number or JID to a full WhatsApp JID */
export function toJid(phoneOrJid) {
  if (!phoneOrJid) throw new Error("Phone number or JID is required");
  if (phoneOrJid.includes("@")) return phoneOrJid;
  const digits = phoneOrJid.replace(/[^0-9]/g, "");
  if (!digits) throw new Error(`Invalid phone number: ${phoneOrJid}`);
  return digits + WHATSAPP_SUFFIX;
}

/** Extract phone number from a JID */
export function jidToPhone(jid) {
  if (!jid) return "";
  return jid.split("@")[0];
}

/** Check if a JID is a group */
export function isGroupJid(jid) {
  return jid?.endsWith(GROUP_SUFFIX) ?? false;
}
