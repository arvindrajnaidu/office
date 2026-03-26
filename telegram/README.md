# Telegram Channel

A command-line tool and agentic bot for Telegram, built on [Grammy](https://grammy.dev/) (Telegram Bot API framework).

Send messages, list chats, and run an AI-powered bot that responds to DMs and group mentions — all from the terminal.

## Features

- **CLI commands** — send messages, list chats, read message history
- **Agentic bot** — DM the bot or mention it in groups and an AI-powered assistant responds
- **MCP server** — expose Telegram as tools over stdio for AI integrations (Claude Desktop, etc.)
- **Long-polling** — no public URL or webhook setup needed
- **Scheduled messages** — schedule messages to be sent at a future time
- **Message history** — all messages stored in SQLite for search and context

## Quick Start

### With npm

```bash
npx @buzzie-ai/telegram-channel     # Run directly
# or
npm install -g @buzzie-ai/telegram-channel
telegram-bot                         # First run walks you through setup
```

### From source

```bash
git clone https://github.com/arvindrajnaidu/office.git
cd office/telegram
npm install
npm start
```

## Prerequisites

1. **Telegram bot token** — create a bot via [@BotFather](https://t.me/BotFather):
   - Open Telegram and message `@BotFather`
   - Send `/newbot`, follow the prompts
   - Copy the bot token (e.g., `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

2. **LLM API key** (for the built-in bot) — one of:
   - [Anthropic API key](https://console.anthropic.com/) (Claude)
   - [OpenAI API key](https://platform.openai.com/api-keys) (GPT)

## Usage

### Bot mode (default)

```bash
telegram-bot
# or
npm start
```

On first run, a setup wizard walks you through bot token and LLM API key configuration. After that, the bot connects via long-polling and listens for messages.

**What the bot responds to:**

- **Direct messages** — any DM to the bot triggers a response
- **Group messages** — the bot responds when mentioned or replied to in groups

### CLI commands

```bash
telegram-bot                 # Start the bot (setup wizard on first run)
telegram-bot status          # Check bot token + config
telegram-bot chats           # List cached chats
telegram-bot messages <id>   # Show messages for a chat ID
telegram-bot send <id> <msg> # Send a text message
telegram-bot listen          # Stream incoming messages to the terminal
telegram-bot mcp             # Start MCP server over stdio
```

### MCP server

The MCP server exposes Telegram tools over stdio, compatible with Claude Desktop and other MCP clients.

```bash
telegram-bot mcp
```

Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "telegram": {
      "command": "npx",
      "args": ["@buzzie-ai/telegram-channel", "mcp"]
    }
  }
}
```

## Configuration

### Environment variables

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather |
| `ANTHROPIC_API_KEY` | Anthropic API key (for Claude) |
| `OPENAI_API_KEY` | OpenAI API key (for GPT) |
| `TELEGRAM_CLI_HOME` | Override config directory (default: `~/.telegram-cli`) |
| `BUZZIE_API_PORT` | Backend API port (default: `3100`) |
| `BUZZIE_API_TOKEN` | Bearer token for outbound API auth |

### Config file

The setup wizard writes to `~/.telegram-cli/config.json`:

```json
{
  "botToken": "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
  "llmProvider": "anthropic",
  "llmKey": "sk-ant-...",
  "setupComplete": true,
  "backend": {
    "type": "http",
    "url": "http://localhost:3000/api/chat"
  }
}
```

Environment variables take precedence over the config file.

## Integrating a Custom Backend

Telegram Channel is a **communication layer** — it handles Telegram connectivity, message routing, conversation history, and delivery. Business logic (LLM calls, CRM lookups, custom workflows) lives in a separate **backend**.

By default, the built-in backend handles everything (LLM + tools). You can replace it with your own backend to plug in any logic you want.

### Backend interface

Your backend receives a JSON POST and returns a JSON response. The format is identical to all other buzzie-ai channels.

**Request** (what your backend receives):

```json
{
  "type": "dm",
  "jid": "123456789",
  "senderName": "Alice",
  "text": "What's the weather like?",
  "groupName": null,
  "history": [
    { "role": "user", "content": "Alice: What's the weather like?" }
  ],
  "meta": {
    "selfJid": "987654321",
    "timestamp": "2026-03-24T10:00:00Z"
  }
}
```

- `type` — `"self_chat"` (DMs), `"group"` (group messages), or `"dm"`
- `jid` — Telegram numeric chat ID (string)
- `history` — recent conversation messages in `[{role, content}]` format

**Response** (what your backend returns):

```json
{
  "text": "It's sunny and 72°F in San Francisco today.",
  "actions": [
    { "type": "send_message", "jid": "-1001234567890", "text": "Weather update posted." }
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

Add a `backend` key to `~/.telegram-cli/config.json`:

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

**Per-chat overrides:**

```json
{
  "backend": { "type": "http", "url": "http://localhost:3000/api/chat" },
  "groupBackends": {
    "-1001234567890": {
      "type": "http",
      "url": "http://localhost:4000/api/chat"
    }
  }
}
```

### Example: Building an HTTP backend

A minimal Express server:

```js
import express from "express";
const app = express();
app.use(express.json());

app.post("/chat", (req, res) => {
  const { text, senderName, groupName } = req.body;
  res.json({
    text: `Got it, ${senderName}! You said: "${text}"`,
  });
});

app.listen(3000, () => console.log("Backend listening on :3000"));
```

## Programmatic Usage

```js
import { startBot } from "@buzzie-ai/telegram-channel";

await startBot();
```

## Architecture

- **ESM-only** (`"type": "module"`)
- **Entry:** `bin/telegram.mjs` → `src/cli.js` (Commander) → subcommands
- **Session:** `src/session.js` — Grammy Bot factory and token validation
- **Bot:** `src/bot/index.js` — long-polling message handler, dispatches to backend
- **Scheduler:** `src/bot/scheduler.js` — 30s polling for scheduled sends
- **DB:** `src/db.js` — SQLite for message storage, contacts, scheduling
- **Adapter:** `src/adapter.js` — implements `@buzzie-ai/core` ChannelAdapter using Grammy Bot API

## License

MIT
