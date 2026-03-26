# iMessage Channel

A command-line tool and agentic bot for iMessage on macOS.

Send messages, read chats, and run an AI-powered bot that responds to your self-chat messages — all from the terminal. Uses the native macOS Messages database and AppleScript, no third-party services required.

## Features

- **CLI commands** — send messages, list conversations, read message history
- **Agentic bot** — message yourself on iMessage and an LLM-powered assistant responds
- **MCP server** — expose iMessage as tools over stdio for AI integrations (Claude Desktop, etc.)
- **Dual LLM support** — works with Anthropic Claude or OpenAI GPT
- **Scheduled messages** — schedule messages to be sent at a future time
- **No external services** — reads directly from macOS Messages database, sends via AppleScript
- **Message history** — stored in SQLite for search and context

## Requirements

- **macOS only** — uses `~/Library/Messages/chat.db` and AppleScript
- **Full Disk Access** — your terminal app needs permission to read the Messages database
  - Go to **System Settings → Privacy & Security → Full Disk Access**
  - Enable your terminal (Terminal.app, iTerm2, VS Code, etc.)

## Quick Start

### With npm

```bash
npx @buzzie-ai/imessage-channel     # Run directly
# or
npm install -g @buzzie-ai/imessage-channel
imessage                             # First run walks you through setup
```

### From source

```bash
git clone https://github.com/arvindrajnaidu/office.git
cd office/imessage
npm install
npm start
```

## Usage

### Bot mode (default)

```bash
imessage
# or
npm start
```

On first run, a setup wizard verifies Full Disk Access and walks you through LLM API key configuration. After that, the bot polls for new messages and responds to self-chat messages (messages you send to yourself).

**How it works:**

1. The bot polls `~/Library/Messages/chat.db` for new messages
2. When you message yourself, it dispatches the text to the backend
3. The backend's reply is sent back via AppleScript

### CLI commands

```bash
imessage                         # Start the bot (setup wizard on first run)
imessage status                  # Check Full Disk Access + config
imessage chats                   # List conversations
imessage messages --handle <phone-or-email>  # Show messages by handle
imessage messages --chat-id <id> # Show messages by chat ID
imessage send <to> <message>     # Send an iMessage
imessage listen                  # Stream incoming messages to the terminal
imessage mcp                     # Start MCP server over stdio
```

### MCP server

The MCP server exposes iMessage tools over stdio, compatible with Claude Desktop and other MCP clients.

```bash
imessage mcp
```

Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "imessage": {
      "command": "npx",
      "args": ["@buzzie-ai/imessage-channel", "mcp"]
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
| `IMESSAGE_CLI_HOME` | Override config directory (default: `~/.imessage-cli`) |
| `BUZZIE_API_PORT` | Backend API port (default: `3100`) |
| `BUZZIE_API_TOKEN` | Bearer token for outbound API auth |

### Config file

The setup wizard writes to `~/.imessage-cli/config.json`:

```json
{
  "llmProvider": "anthropic",
  "llmKey": "sk-ant-...",
  "selfHandle": "+14155551234",
  "setupComplete": true,
  "backend": {
    "type": "http",
    "url": "http://localhost:3000/api/chat"
  }
}
```

Environment variables take precedence over the config file.

The `selfHandle` is auto-detected from your recent messages (your phone number or iCloud email). It determines which chat is "self-chat" for bot mode.

## Integrating a Custom Backend

iMessage Channel is a **communication layer** — it handles reading and sending iMessages via macOS native tools. Business logic (LLM calls, CRM lookups, custom workflows) lives in a separate **backend**.

By default, the built-in backend handles everything (LLM + tools). You can replace it with your own backend to plug in any logic you want.

### Backend interface

Your backend receives a JSON POST and returns a JSON response. The format is identical to all other buzzie-ai channels.

**Request** (what your backend receives):

```json
{
  "type": "self_chat",
  "jid": "iMessage;-;+14155551234",
  "senderName": "+14155551234",
  "text": "Summarize my unread messages",
  "groupName": null,
  "history": [
    { "role": "user", "content": "Summarize my unread messages" }
  ],
  "meta": {
    "selfJid": "+14155551234",
    "timestamp": "2026-03-24T10:00:00Z"
  }
}
```

- `type` — `"self_chat"` (messages to yourself), `"group"` (group chats), or `"dm"`
- `jid` — iMessage chat identifier (e.g., `iMessage;-;+14155551234` or `chat123456`)
- `history` — recent conversation messages in `[{role, content}]` format

**Response** (what your backend returns):

```json
{
  "text": "You have 3 unread messages from Alice about the project deadline.",
  "actions": [
    { "type": "send_message", "jid": "iMessage;-;+14155559999", "text": "Got it, will review!" }
  ]
}
```

Both `text` and `actions` are optional. `text` is sent as the bot's reply. `actions` trigger side-effects.

### Supported action types

| Action | Fields | Description |
|--------|--------|-------------|
| `reply_text` | `text` | Send a text reply to the current chat |
| `send_message` | `jid`, `text` | Send a text message to any chat |

Note: iMessage does not support reactions via AppleScript, so `react` is a no-op.

### Configuration

Add a `backend` key to `~/.imessage-cli/config.json`:

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

### Example: Building an HTTP backend

A minimal Express server:

```js
import express from "express";
const app = express();
app.use(express.json());

app.post("/chat", (req, res) => {
  const { text, senderName } = req.body;
  res.json({
    text: `Got it, ${senderName}! You said: "${text}"`,
  });
});

app.listen(3000, () => console.log("Backend listening on :3000"));
```

## Programmatic Usage

```js
import { startBot } from "@buzzie-ai/imessage-channel";

await startBot();
```

## Architecture

- **ESM-only** (`"type": "module"`)
- **macOS only** — requires Full Disk Access
- **Entry:** `bin/imessage.mjs` → `src/cli.js` (Commander) → subcommands
- **iMessage integration:** `src/imessage/` (inlined library)
  - `db.js` — reads `~/Library/Messages/chat.db` via `sqlite3` CLI with `-json -readonly`
  - `send.js` — sends messages via AppleScript (`osascript`)
  - `poller.js` — `MessagePoller` EventEmitter that polls by ROWID
- **Bot:** `src/bot/index.js` — message poller, dispatches to backend
- **Scheduler:** `src/bot/scheduler.js` — 30s polling for scheduled sends
- **DB:** `src/db.js` — SQLite for message cache and scheduling
- **Adapter:** `src/adapter.js` — implements `@buzzie-ai/core` ChannelAdapter

## Limitations

- **macOS only** — cannot run in Docker or on Linux/Windows
- **No reactions** — AppleScript doesn't support Tapbacks
- **Polling-based** — checks for new messages periodically (not push)
- **Full Disk Access required** — won't work without this permission

## License

MIT
