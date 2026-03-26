import {
  makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { join } from "path";
import { homedir } from "os";
import { existsSync, rmSync, readFileSync } from "fs";
import { mkdir } from "fs/promises";
import qrcode from "qrcode-terminal";

const DEFAULT_AUTH_DIR = join(process.env.WHATSAPP_CLI_HOME || join(homedir(), ".whatsapp-cli"), "auth");

// Suppress noisy libsignal logs (raw crypto key dumps, transient decrypt failures)
const _origInfo = console.info;
console.info = (...args) => {
  if (typeof args[0] === "string" && args[0].startsWith("Closing session")) return;
  _origInfo.apply(console, args);
};
const _origError = console.error;
console.error = (...args) => {
  if (typeof args[0] === "string" && (
    args[0].includes("Failed to decrypt message") ||
    args[0].startsWith("Session error")
  )) return;
  _origError.apply(console, args);
};

let credsSaveQueue = Promise.resolve();

function enqueueSaveCreds(saveCreds) {
  credsSaveQueue = credsSaveQueue
    .then(() => saveCreds())
    .catch((err) => console.error("Failed saving creds:", err.message));
}

export function getAuthDir(override) {
  return override || DEFAULT_AUTH_DIR;
}

export function authExists(authDir) {
  return existsSync(join(authDir, "creds.json"));
}

export function readSelfId(authDir) {
  try {
    const credsPath = join(authDir, "creds.json");
    if (!existsSync(credsPath)) return null;
    const creds = JSON.parse(readFileSync(credsPath, "utf8"));
    return creds.me?.id || null;
  } catch {
    return null;
  }
}

export function clearAuth(authDir) {
  if (existsSync(authDir)) {
    rmSync(authDir, { recursive: true, force: true });
  }
}

/**
 * Create a Baileys socket with auth state management.
 * @param {object} opts
 * @param {string} [opts.authDir] - Override auth directory
 * @param {boolean} [opts.printQr] - Show QR in terminal
 * @param {boolean} [opts.verbose] - Enable Baileys debug logging
 * @param {(qr: string) => void} [opts.onQr] - QR callback
 * @param {(update: object) => void} [opts.onConnectionUpdate] - Connection update callback
 * @returns {Promise<ReturnType<typeof makeWASocket>>}
 */
export async function createSocket(opts = {}) {
  const authDir = getAuthDir(opts.authDir);
  await mkdir(authDir, { recursive: true });

  const logger = pino({ level: opts.verbose ? "info" : "silent" });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    version,
    logger,
    browser: ["WhatsApp-CLI", "cli", "1.0.0"],
    syncFullHistory: true,
    markOnlineOnConnect: false,
    // v7: automatic session recreation for failed decryption
    enableAutoSessionRecreation: true,
    // v7: built-in message cache for retry handling
    enableRecentMessageCache: true,
    getMessage: async (key) => {
      // v7's enableRecentMessageCache handles most retries internally.
      // This is a fallback for messages not in the built-in cache.
      return undefined;
    },
  });

  sock.ev.on("creds.update", () => enqueueSaveCreds(saveCreds));

  sock.ev.on("connection.update", (update) => {
    const { qr, connection, lastDisconnect } = update;
    if (qr) {
      opts.onQr?.(qr);
      if (opts.printQr) {
        qrcode.generate(qr, { small: true });
      }
    }
    opts.onConnectionUpdate?.(update);
    if (connection === "close") {
      const code =
        lastDisconnect?.error?.output?.statusCode ??
        lastDisconnect?.error?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.error("Session logged out. Run: whatsapp login");
      }
    }
  });

  if (sock.ws && typeof sock.ws.on === "function") {
    sock.ws.on("error", (err) => {
      if (opts.verbose) console.error("WebSocket error:", err.message);
    });
  }

  return sock;
}

/**
 * Wait for the socket connection to open.
 */
export function waitForConnection(sock) {
  return new Promise((resolve, reject) => {
    const handler = (update) => {
      if (update.connection === "open") {
        sock.ev.off("connection.update", handler);
        resolve();
      }
      if (update.connection === "close") {
        sock.ev.off("connection.update", handler);
        reject(
          update.lastDisconnect?.error || new Error("Connection closed"),
        );
      }
    };
    sock.ev.on("connection.update", handler);
  });
}

/**
 * Create socket and wait for connection to open. Convenience wrapper.
 */
export async function connectAndWait(opts = {}) {
  const sock = await createSocket(opts);
  await waitForConnection(sock);
  return sock;
}
