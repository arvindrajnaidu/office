# Email Channel

A command-line tool and agentic bot for email, built on the [Resend](https://resend.com/) API.

Send and receive emails, and run an AI-powered bot that automatically replies to incoming emails — all from the terminal.

## Features

- **CLI commands** — send emails (text and HTML), list sent/received emails
- **Agentic bot** — incoming emails are dispatched to an AI backend that generates replies
- **MCP server** — expose email as tools over stdio for AI integrations (Claude Desktop, etc.)
- **Dual LLM support** — works with Anthropic Claude or OpenAI GPT
- **Scheduled messages** — schedule emails to be sent at a future time
- **Inbound polling** — polls the Resend API for incoming emails
- **Message history** — all emails stored in SQLite for search and context

## Quick Start

### With npm

```bash
npx @buzzie-ai/email-channel        # Run directly
# or
npm install -g @buzzie-ai/email-channel
email-bot                            # First run walks you through setup
```

### From source

```bash
git clone https://github.com/arvindrajnaidu/office.git
cd office/email
npm install
npm start
```

## Prerequisites

1. **Resend account** — [resend.com](https://resend.com/)
   - Create an API key at [resend.com/api-keys](https://resend.com/api-keys)
   - Verify a domain (or use the free `onboarding@resend.dev` for testing)

2. **Inbound email** — to receive emails, configure a Resend inbound webhook or use their receiving API

3. **LLM API key** (for the built-in bot) — one of:
   - [Anthropic API key](https://console.anthropic.com/) (Claude)
   - [OpenAI API key](https://platform.openai.com/api-keys) (GPT)

## Usage

### Bot mode (default)

```bash
email-bot
# or
npm start
```

On first run, a setup wizard walks you through Resend API key, sender address, and LLM configuration. After that, the bot polls for incoming emails and dispatches them to the backend.

**How it works:**

1. The bot polls the Resend API for new inbound emails (every 10 seconds)
2. When an email arrives, the subject and body are dispatched to the backend
3. The backend's reply is sent back as a reply email via Resend

### CLI commands

```bash
email-bot                        # Start the bot (setup wizard on first run)
email-bot status                 # Check Resend API key + config
email-bot send <to> <subject>    # Send an email
  --body <text>                  #   Text body
  --html <html>                  #   HTML body
  --from <address>               #   Override sender address
email-bot emails                 # List sent/received emails
email-bot listen                 # Poll and stream incoming emails to the terminal
email-bot mcp                    # Start MCP server over stdio
```

### MCP server

The MCP server exposes email tools over stdio, compatible with Claude Desktop and other MCP clients.

```bash
email-bot mcp
```

Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "email": {
      "command": "npx",
      "args": ["@buzzie-ai/email-channel", "mcp"]
    }
  }
}
```

## Configuration

### Environment variables

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | Default sender address (must be on a verified domain) |
| `ANTHROPIC_API_KEY` | Anthropic API key (for Claude) |
| `OPENAI_API_KEY` | OpenAI API key (for GPT) |
| `EMAIL_CLI_HOME` | Override config directory (default: `~/.email-cli`) |
| `BUZZIE_API_PORT` | Backend API port (default: `3100`) |
| `BUZZIE_API_TOKEN` | Bearer token for outbound API auth |

### Config file

The setup wizard writes to `~/.email-cli/config.json`:

```json
{
  "resendApiKey": "re_xxx",
  "fromAddress": "bot@yourdomain.com",
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

Email Channel is a **communication layer** — it handles email sending and receiving via the Resend API. Business logic (LLM calls, CRM lookups, custom workflows) lives in a separate **backend**.

By default, the built-in backend handles everything (LLM + tools). You can replace it with your own backend to plug in any logic you want.

### Backend interface

Your backend receives a JSON POST and returns a JSON response. The format is identical to all other buzzie-ai channels.

**Request** (what your backend receives):

```json
{
  "type": "dm",
  "jid": "alice@example.com",
  "senderName": "alice@example.com",
  "text": "Meeting tomorrow\n\nHi, can we reschedule our 2pm meeting to 3pm?",
  "groupName": null,
  "history": [
    { "role": "user", "content": "alice@example.com: Meeting tomorrow\n\nHi, can we reschedule..." }
  ],
  "meta": {
    "selfJid": "bot@yourdomain.com",
    "timestamp": "2026-03-24T10:00:00Z"
  }
}
```

- `type` — always `"dm"` for email (no group concept)
- `jid` — the sender's email address
- `text` — email subject + body, separated by `\n\n`
- `history` — recent conversation messages in `[{role, content}]` format

**Response** (what your backend returns):

```json
{
  "text": "Sure! I've moved the meeting to 3pm. See you then.",
  "actions": [
    { "type": "send_message", "jid": "bob@example.com", "text": "Meeting with Alice moved to 3pm" }
  ]
}
```

Both `text` and `actions` are optional. `text` is sent as a reply email with subject `Re: <original subject>`. `actions` trigger side-effects.

### Supported action types

| Action | Fields | Description |
|--------|--------|-------------|
| `reply_text` | `text` | Send a reply email to the sender |
| `send_message` | `jid`, `text` | Send an email to any address |

### Configuration

Add a `backend` key to `~/.email-cli/config.json`:

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
  const [subject, ...bodyLines] = text.split("\n\n");
  res.json({
    text: `Thanks for your email "${subject}". I'll get back to you shortly.`,
  });
});

app.listen(3000, () => console.log("Backend listening on :3000"));
```

## Docker

Email Channel can run in Docker for server deployments:

```yaml
# docker-compose.yml
services:
  email:
    image: ghcr.io/arvindrajnaidu/office/email-channel:latest
    environment:
      RESEND_API_KEY: ${RESEND_API_KEY}
      EMAIL_FROM: ${EMAIL_FROM}
      EMAIL_CLI_HOME: /data
    volumes:
      - email_data:/data

volumes:
  email_data:
```

```bash
docker compose up -d
```

## Programmatic Usage

```js
import { startBot } from "@buzzie-ai/email-channel";

await startBot();
```

## Architecture

- **ESM-only** (`"type": "module"`)
- **Entry:** `bin/email.mjs` → `src/cli.js` (Commander) → subcommands
- **Session:** `src/session.js` — Resend client factory and API key validation
- **Poller:** `src/poller.js` — `EmailPoller` EventEmitter, polls Resend API every 10s
- **Bot:** `src/bot/index.js` — email handler, dispatches to backend
- **Scheduler:** `src/bot/scheduler.js` — 30s polling for scheduled sends
- **DB:** `src/db.js` — SQLite for message storage, contacts, scheduling
- **Adapter:** `src/adapter.js` — implements `@buzzie-ai/core` ChannelAdapter using Resend SDK

## License

MIT
