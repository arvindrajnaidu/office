# buzzie-ai

A modular framework for building AI assistants that talk to people through messaging platforms.

**Channels** handle the protocol — connecting, sending, receiving. **Assistants** (your code) handle the brain — deciding what to say and do. They communicate over plain HTTP.

```
┌──────────────┐
│  WhatsApp    │──┐
└──────────────┘  │
┌──────────────┐  │   POST /api/chat      ┌──────────────────┐
│  Telegram    │──┼──────────────────────> │   Your Assistant  │
└──────────────┘  │   { text, history }    │   (Next.js app)   │
┌──────────────┐  │ <────────────────────  │   port 3000       │
│  iMessage    │──┤   { text, actions }    └──────────────────┘
└──────────────┘  │
┌──────────────┐  │
│  Email       │──┘
└──────────────┘
```

## Packages

| Package | Description | Platform |
|---------|-------------|----------|
| `@buzzie-ai/core` | Shared protocol — dispatcher, API server, adapter interface | Any |
| `@buzzie-ai/whatsapp-channel` | WhatsApp via Baileys protocol | Any (Docker, Linux, macOS) |
| `@buzzie-ai/telegram-channel` | Telegram via Grammy (Bot API) | Any (Docker, Linux, macOS) |
| `@buzzie-ai/imessage-channel` | iMessage via macOS Messages.app | macOS only |
| `@buzzie-ai/email-channel` | Email via Resend API | Any (Docker, Linux, macOS) |

## Quick Start — Single Channel

Your assistant is any HTTP server that receives message envelopes and returns responses.

```bash
mkdir my-assistant && cd my-assistant
npm init -y
npm install @buzzie-ai/whatsapp-channel   # or telegram-channel, imessage-channel, email-channel
```

```js
// server.js
import { createServer } from "http";

const server = createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/chat") {
    const body = await new Promise(resolve => {
      let data = "";
      req.on("data", chunk => data += chunk);
      req.on("end", () => resolve(JSON.parse(data)));
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ text: `You said: ${body.text}` }));
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(3000, () => console.log("Assistant running on :3000"));
```

```bash
node server.js          # Terminal 1 — your assistant
npx whatsapp            # Terminal 2 — the channel
```

## Build a Multi-Channel Assistant with Next.js

This guide walks through building a single Next.js app that serves as the brain for all 4 channels simultaneously.

### 1. Create the project

```bash
npx create-next-app@latest my-assistant --js --app --no-src-dir --no-tailwind
cd my-assistant
npm install @buzzie-ai/whatsapp-channel @buzzie-ai/telegram-channel @buzzie-ai/imessage-channel @buzzie-ai/email-channel
```

### 2. Create the chat endpoint

Every channel sends the same envelope format to `POST /api/chat`. Your assistant handles them all in one route:

```js
// app/api/chat/route.js
import { NextResponse } from "next/server";

export async function POST(request) {
  const envelope = await request.json();
  const { type, jid, text, senderName, groupName, persona, history, meta } = envelope;

  // 'type' tells you the context:
  //   "self_chat" — user messaging themselves (WhatsApp) or DM to bot (Telegram)
  //   "dm"        — direct message with a persona set
  //   "group"     — group chat message

  // 'jid' is the channel-specific chat identifier:
  //   WhatsApp:  "14155551234@s.whatsapp.net" or "120363xxx@g.us"
  //   Telegram:  "123456789" (numeric chat ID)
  //   iMessage:  "iMessage;-;+14155551234" or "chat123456"
  //   Email:     "alice@example.com"

  // 'history' is an array of recent messages:
  //   [{ role: "user", content: "..." }, { role: "assistant", content: "..." }]

  // --- Your business logic here ---
  // Call an LLM, query a database, run tools, etc.

  const reply = await handleMessage({ type, jid, text, senderName, groupName, persona, history });

  return NextResponse.json({
    text: reply,
    // Optional: side effects
    // actions: [{ type: "send_message", jid: "other-chat", text: "..." }]
  });
}

async function handleMessage({ type, text, senderName, persona, history }) {
  // Example: call Claude API
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: persona || "You are a helpful assistant. Be concise.",
      messages: [
        ...history || [],
        { role: "user", content: `${senderName}: ${text}` },
      ],
    }),
  });

  const data = await res.json();
  return data.content?.[0]?.text || "Sorry, something went wrong.";
}
```

### 3. Configure channels to point to your app

Each channel needs a `backend` config pointing to your Next.js app. Set this in each channel's config file:

**WhatsApp** (`~/.whatsapp-cli/config.json`):
```json
{ "backend": { "type": "http", "url": "http://localhost:3000/api/chat" } }
```

**Telegram** (`~/.telegram-cli/config.json`):
```json
{ "backend": { "type": "http", "url": "http://localhost:3000/api/chat" } }
```

**iMessage** (`~/.imessage-cli/config.json`):
```json
{ "backend": { "type": "http", "url": "http://localhost:3000/api/chat" } }
```

**Email** (`~/.email-cli/config.json`):
```json
{ "backend": { "type": "http", "url": "http://localhost:3000/api/chat" } }
```

### 4. Start everything

```bash
# Terminal 1 — your assistant
npm run dev

# Terminal 2-5 — channels (start whichever you need)
npx whatsapp                                          # WhatsApp
TELEGRAM_BOT_TOKEN=xxx npx telegram-bot               # Telegram
npx imessage                                          # iMessage (macOS only)
RESEND_API_KEY=re_xxx EMAIL_FROM=bot@you.com npx email-bot  # Email
```

All four channels send the exact same envelope to `POST /api/chat`. Your assistant doesn't need to know which channel the message came from — unless you want it to (check `meta.selfJid` or the `jid` format).

### 5. Deploy with Docker (production)

```yaml
# docker-compose.yml
services:
  assistant:
    build: .
    ports: ["3000:3000"]
    environment:
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}

  whatsapp:
    image: ghcr.io/arvindrajnaidu/office/whatsapp-channel:latest
    environment:
      WHATSAPP_CLI_HOME: /data
    volumes: [whatsapp_data:/data]

  telegram:
    image: ghcr.io/arvindrajnaidu/office/telegram-channel:latest
    environment:
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      TELEGRAM_CLI_HOME: /data
    volumes: [telegram_data:/data]

  email:
    image: ghcr.io/arvindrajnaidu/office/email-channel:latest
    environment:
      RESEND_API_KEY: ${RESEND_API_KEY}
      EMAIL_FROM: ${EMAIL_FROM}
      EMAIL_CLI_HOME: /data
    volumes: [email_data:/data]

volumes:
  whatsapp_data:
  telegram_data:
  email_data:
```

Each channel's config should point `backend.url` to `http://assistant:3000/api/chat` (using Docker service names).

iMessage cannot run in Docker (macOS only) — run it natively alongside.

## Envelope Format

When a message arrives, the channel POSTs this to your assistant:

```json
{
  "type": "self_chat",
  "jid": "14155551234@s.whatsapp.net",
  "senderName": "Alice",
  "text": "What meetings do I have today?",
  "history": [
    { "role": "user", "content": "What meetings do I have today?" },
    { "role": "assistant", "content": "You have a standup at 9am and a 1:1 at 2pm." }
  ],
  "groupName": null,
  "persona": null,
  "quotedContext": null,
  "meta": {
    "selfJid": "14155551234@s.whatsapp.net",
    "timestamp": "2026-03-24T10:00:00Z"
  }
}
```

## Response Format

Your assistant returns:

```json
{
  "text": "You have a standup at 9am and a 1:1 at 2pm.",
  "actions": [
    { "type": "send_message", "jid": "group-jid", "text": "Reminder: standup in 5 min" },
    { "type": "react", "emoji": "👍" }
  ]
}
```

**`text`** — Reply to the sender. Optional if you use actions instead.

**`actions`** — Optional list of side effects:

| Action | Fields | Description |
|--------|--------|-------------|
| `reply_text` | `text` | Reply in the same chat |
| `send_message` | `jid`, `text` | Send to a different chat |
| `send_image` | `jid`, `buffer` (base64), `mimeType`, `caption` | Send an image |
| `send_document` | `jid`, `buffer` (base64), `mimeType`, `fileName`, `caption` | Send a file |
| `react` | `emoji` | React to the original message (WhatsApp, Telegram) |

## Per-Group Routing

Different chats can use different assistants:

```json
{
  "backend": { "type": "http", "url": "http://localhost:3000/api/chat" },
  "groupBackends": {
    "120363xxx@g.us": { "type": "http", "url": "http://localhost:4000/api/chat" }
  }
}
```

## Channel CLI Commands

All channels expose similar CLIs:

```bash
# WhatsApp
whatsapp status          # Check connection
whatsapp chats           # List chats
whatsapp messages <jid>  # Show messages
whatsapp send <to> <msg> # Send a message
whatsapp listen          # Stream incoming messages
whatsapp mcp             # Start MCP server

# Telegram
telegram-bot status      # Check bot token
telegram-bot chats       # List cached chats
telegram-bot messages <id> # Show messages
telegram-bot send <id> <msg> # Send a message
telegram-bot listen      # Stream incoming messages
telegram-bot mcp         # Start MCP server

# iMessage (macOS only)
imessage status          # Check Full Disk Access
imessage chats           # List conversations
imessage messages        # Show messages (--handle or --chat-id)
imessage send <to> <msg> # Send a message
imessage listen          # Stream incoming messages
imessage mcp             # Start MCP server

# Email (Resend)
email-bot status         # Check Resend API key
email-bot send <to> <subject> # Send an email
email-bot emails         # List sent/received emails
email-bot listen         # Poll for incoming emails
email-bot mcp            # Start MCP server
```

## Docker

WhatsApp, Telegram, and Email can run in Docker. iMessage cannot (macOS only).

```bash
# From the monorepo root — start all services
docker compose up

# Or individual services
docker compose up whatsapp-bot
docker compose up telegram-bot
docker compose up email-bot
```

## Development

This is an npm workspaces monorepo.

```bash
npm install              # Install all workspace dependencies
node whatsapp/bin/whatsapp.mjs status
node telegram/bin/telegram.mjs status
node imessage/bin/imessage.mjs status
node email/bin/email.mjs status
```

### Structure

```
@buzzie-ai/
  package.json           # Workspace root
  docker-compose.yml     # Multi-channel Docker deployment
  core/                  # Shared protocol library
  whatsapp/              # WhatsApp channel (Baileys)
  telegram/              # Telegram channel (Grammy)
  imessage/              # iMessage channel (macOS)
  email/                 # Email channel (Resend)
  assistants/            # Example assistant backends
    echo/                # Minimal echo assistant for testing
```
