/**
 * ChannelAdapter interface — every channel (WhatsApp, iMessage, email) implements this.
 * Core calls these methods; the channel translates them to its protocol.
 *
 * Required methods must be implemented by every adapter.
 * Optional methods are auto-discovered by the API server — only routes for
 * implemented methods are exposed.
 */

/**
 * Required adapter method names — every adapter must implement these.
 */
export const RequiredMethods = [
  "sendText",
  "sendImage",
  "sendDocument",
  "sendReaction",
  "getGroups",
  "getChats",
  "getMessages",
  "getContacts",
];

/**
 * Optional adapter method names — adapters implement as applicable.
 * The API server checks typeof adapter[method] === 'function' before exposing a route.
 */
export const OptionalMethods = [
  "searchMessages",
  "extractLinks",
  "sendVideo",
  "sendPoll",
  "downloadVideo",
  "createDigest",
  "listOutputFiles",
  "sendOutputFile",
  "queryDb",
  "getScheduled",
  "createScheduled",
  "cancelScheduled",
  "getConfig",
  "updateConfig",
];

/**
 * All adapter method names (required + optional).
 */
export const AdapterMethods = [...RequiredMethods, ...OptionalMethods];

/**
 * Validate that an object implements the ChannelAdapter interface.
 * Throws if any required method is missing.
 */
export function validateAdapter(adapter) {
  const missing = RequiredMethods.filter((m) => typeof adapter[m] !== "function");
  if (missing.length > 0) {
    throw new Error(`Adapter missing required methods: ${missing.join(", ")}`);
  }
  return adapter;
}
