// High-level API (recommended for embedded use — auto-reconnects, stable
// send/receive surface).
export { createChannel } from "./channel.js";

// Lower-level building blocks (raw Baileys socket — caller must manage WS
// lifecycle themselves; prefer createChannel unless you have a reason).
export { createSocket, connectAndWait, waitForConnection, getAuthDir, authExists } from "./session.js";

// Auth + config helpers
export { runSetup } from "./setup.js";
export { readConfig, writeConfig } from "./config.js";

// Standalone agentic bot (self-chat assistant; not for plugin/server use)
export { startBot } from "./bot/index.js";
