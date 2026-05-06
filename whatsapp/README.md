# WhatsApp CLI

A command-line tool and agentic bot for WhatsApp, built on the [Baileys](https://github.com/WhiskeySockets/Baileys) protocol library.

Send messages, read chats, and run an AI-powered bot that responds to your self-chat messages — all from the terminal.

## Features

- **CLI commands** — send messages, list chats, read message history, send images and polls
- **Agentic bot** — message yourself on WhatsApp and an LLM-powered assistant responds, with tools to search groups, summarize conversations, extract links, and create video digests
- **MCP server** — expose WhatsApp as tools over stdio for AI integrations (Claude Desktop, etc.)
- **Local message store** — incoming messages cached in a local SQLite DB (`better-sqlite3`)
- **Dual LLM support** — works with Anthropic Claude or OpenAI GPT

## Quick start

### With npm

```bash
npx @buzzie-ai/whatsapp-channel            # Run directly
# or
npm install -g @buzzie-ai/whatsapp-channel  # Install globally
whatsapp                                    # First run walks you through setup
```

### From source

```bash
git clone https://github.com/arvindrajnaidu/whatsapp-cli.git
cd whatsapp-cli
npm install

# First run walks you through login + LLM setup
npm start
```

## Usage

### Bot mode (default)

```bash
npm start
# or
node bin/whatsapp.mjs
```

On first run, a setup wizard walks you through QR code authentication and LLM API key configuration. After that, the bot connects and listens for messages you send to yourself on WhatsApp.

**What the bot can do:**

| Tool | Description |
|------|-------------|
| `list_groups` | List all your WhatsApp groups |
| `search_groups` | Fuzzy search groups by name |
| `read_messages` | Read recent messages from a group |
| `search_messages` | Search messages across all chats |
| `extract_links` | Find URLs shared in a group, categorized by platform |
| `create_video_digest` | Download shared videos (Reels, Shorts, TikToks) and combine into one clip |

Example self-chat messages:

> "Summarize what happened in Family Group today"
>
> "Find all YouTube links shared in Tech News this week"
>
> "Create a video digest from Memes Group"

### CLI commands

```bash
whatsapp login                           # Link via QR code
whatsapp login --pairing-code <phone>    # Link via 8-digit pairing code
whatsapp logout                          # Unlink and clear credentials
whatsapp status                          # Show connection status
whatsapp chats                           # List recent chats
whatsapp messages <chat-id>              # Read messages from a chat
whatsapp send <phone-or-jid> <message>   # Send a text message
whatsapp send-image <phone-or-jid> <file> # Send an image
whatsapp send-poll <phone-or-jid> <question> # Send a poll
whatsapp listen                          # Stream incoming messages
whatsapp mcp                             # Start MCP server over stdio
```

### MCP server

The MCP server exposes WhatsApp tools over stdio, compatible with Claude Desktop and other MCP clients.

```bash
node bin/whatsapp.mjs mcp
```

**MCP tools:** `send_message`, `list_chats`, `get_messages`, `search_chats`, `get_group_info`

## Embedded use — `createClient`

When you want to embed WhatsApp into your own Node service (a Claude Code plugin, an MCP server, an alerting daemon), don't use the raw Baileys socket — Baileys' WebSocket dies on keepalive misses and server-side rotations, and silently throws `Connection Closed` forever afterward. Use `createClient` instead. It owns the socket lifecycle, auto-reconnects with exponential backoff, and gives you a stable `send` / `'message'` surface.

> "Client" here means the WhatsApp client object your code talks to. The package is named `whatsapp-channel` because in the wider architecture each delivery surface (WhatsApp, Voice, Email, …) is a "channel" — the package is *one* channel; `createClient()` is the runtime entrypoint into it. This naming sidesteps WhatsApp's own product feature also called "Channels."

```js
import { createClient } from "@buzzie-ai/whatsapp-channel";

const client = await createClient({
  // authDir defaults to ~/.whatsapp-cli/auth — same as the CLI uses
});

// Outbound — works whether or not the underlying socket is currently up.
// During reconnect, the send is queued and flushed on success.
await client.send("16693070940@s.whatsapp.net", { text: "Hello" });

// Inbound
client.on("message", (msg, type) => {
  if (type !== "notify") return;       // skip history-sync messages
  if (msg.key.fromMe) return;
  console.log(msg.key.remoteJid, "→", msg.message?.conversation);
});

// Lifecycle observation
client.on("status", (s) => console.log("client status:", s));
//   'connected' | 'reconnecting' | 'logged_out' | 'closed'

client.on("error", (err) => console.error("client error:", err));

// Clean shutdown (e.g. on SIGTERM)
process.on("SIGTERM", () => client.close());
```

### Reconnect behavior

| Disconnect cause | Client behavior |
|---|---|
| Transient WS drop (keepalive miss, network blip, server rotation) | Reconnects with exponential backoff (1s → 60s, jittered). Pending `send()` calls queue and resolve once reconnected. |
| `DisconnectReason.loggedOut` | Stops. Emits `'status' === 'logged_out'`. Rejects all queued sends. Re-pair via `whatsapp login` to recover. |
| `client.close()` called | Stops. Emits `'status' === 'closed'`. Rejects all queued sends. |

### Options

```js
createClient({
  authDir,                      // override auth directory
  verbose: false,               // verbose Baileys logs
  syncFullHistory: true,        // sync history on first link

  baseBackoffMs: 1000,          // first reconnect delay
  maxBackoffMs: 60_000,         // cap on reconnect delay

  queueWhileDisconnected: true, // queue sends during reconnect (default on)
  maxQueueSize: 100,            // over this, send() rejects with "queue full"
});
```

Set `queueWhileDisconnected: false` to fail-fast instead of queueing — useful for time-sensitive sends where late delivery is worse than no delivery (the caller can implement its own retry/buffering policy).

### Escape hatch

If you need a Baileys feature the client doesn't expose (e.g. presence, profile pictures, group admin operations), grab the raw socket:

```js
const sock = client.getSocket();   // Baileys WASocket, or null if reconnecting
```

The client reserves the right to swap the socket out on reconnect, so don't hold the reference across async boundaries — call `getSocket()` again each time you need it.

Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": ["/path/to/whatsapp-cli/bin/whatsapp.mjs", "mcp"]
    }
  }
}
```

## Configuration

### Environment variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (for Claude) |
| `OPENAI_API_KEY` | OpenAI API key (for GPT) |
| `WHATSAPP_CLI_HOME` | Override config/auth directory (default: `~/.whatsapp-cli`) |

### Config file

The setup wizard writes to `~/.whatsapp-cli/config.json`:

```json
{
  "llmProvider": "anthropic",
  "llmKey": "sk-...",
  "setupComplete": true,
  "syncFullHistory": true,
  "backend": {
    "type": "http",
    "url": "http://localhost:3000/api/chat"
  }
}
```

Environment variables take precedence over the config file.

### History sync

When `syncFullHistory` is set to `true` in the config file, WhatsApp will send full message history on device link. All synced messages are cached in the local SQLite database, giving your backend context from earlier conversations.

**Important:** History sync is negotiated during device registration (QR code scan), not on every reconnect. To enable it on an existing session, you need to re-link:

```bash
whatsapp logout
whatsapp login    # scan QR code — full history will sync
```

When the sync is running, you'll see progress logs:

```
History sync: 347 messages cached (40% done)
History sync: 512 messages cached (80% done)
History sync: 89 messages cached (100% done)
```

## Integrating a Custom Backend

WhatsApp-CLI is a **communication layer** — it handles WhatsApp connectivity, message routing, conversation history, and delivery. Business logic (LLM calls, CRM lookups, custom workflows) lives in a separate **backend**.

By default, the built-in backend handles everything (LLM + tools). You can replace it with your own backend to plug in any logic you want.

### Backend interface

Your backend receives a JSON request and returns a JSON response.

**Request** (what your backend receives):

```json
{
  "type": "self_chat",
  "jid": "6281234@s.whatsapp.net",
  "groupName": "Sales Team",
  "persona": "You are a sales assistant...",
  "senderName": "Alice",
  "history": [
    { "role": "user", "content": "Alice: What's the status of the Acme deal?" },
    { "role": "assistant", "content": "The Acme deal is in stage 3..." }
  ],
  "quotedContext": null,
  "meta": {
    "selfJid": "6281234@s.whatsapp.net",
    "timestamp": "2026-03-23T10:00:00Z"
  }
}
```

- `type` — `"self_chat"`, `"group"`, or `"dm"`
- `history` — recent conversation messages in `[{role, content}]` format
- `quotedContext` — text of the quoted message if this is a reply, or `null`

**Response** (what your backend returns):

```json
{
  "text": "The Acme deal is in stage 3, expected close next week.",
  "actions": [
    { "type": "send_message", "jid": "120363xxx@g.us", "text": "Deal update posted." }
  ]
}
```

Both `text` and `actions` are optional. `text` is sent as the bot's reply. `actions` trigger side-effects.

### Supported action types

| Action | Fields | Description |
|--------|--------|-------------|
| `reply_text` | `text` | Send a text reply to the current chat |
| `send_message` | `jid`, `text` | Send a text message to any chat |
| `react` | `emoji` | React to the triggering message |

### Configuration

Add a `backend` key to `~/.whatsapp-cli/config.json`:

**Built-in (default)** — no config needed:

```json
{ "backend": { "type": "builtin" } }
```

**HTTP backend** — POST conversation to an endpoint:

```json
{
  "backend": {
    "type": "http",
    "url": "https://my-bot.example.com/chat",
    "headers": { "Authorization": "Bearer ${MY_BOT_TOKEN}" },
    "timeout": 30000
  }
}
```

Header values support `${ENV_VAR}` interpolation.

**Per-group overrides** (planned):

```json
{
  "backend": { "type": "builtin" },
  "groupBackends": {
    "120363xxx@g.us": {
      "type": "http",
      "url": "https://crm-bot.example.com/chat"
    }
  }
}
```

### Example: Building an HTTP backend

A minimal Express server that echoes messages:

```js
import express from "express";
const app = express();
app.use(express.json());

app.post("/chat", (req, res) => {
  const { history, senderName, groupName } = req.body;
  const lastMessage = history[history.length - 1]?.content || "";
  res.json({
    text: `Got it, ${senderName}! You said: "${lastMessage}"`,
  });
});

app.listen(3000, () => console.log("Backend listening on :3000"));
```

## Architecture

- **ESM-only** (`"type": "module"`)
- **Entry:** `bin/whatsapp.mjs` -> `src/cli.js` (Commander) -> subcommands
- **Session:** `src/session.js` manages the Baileys socket lifecycle, auth stored in `~/.whatsapp-cli/auth/`
- **Bot:** `src/bot/` — NLU layer with conversation history, dual-provider LLM client (raw `fetch`, no SDK), tool definitions in provider-agnostic schema
- **Backend:** `src/bot/backend.js` — pluggable backend dispatcher (built-in, HTTP, or custom)
- **MCP:** `src/commands/mcp.js` — separate MCP server using `@modelcontextprotocol/sdk`

## License

MIT
