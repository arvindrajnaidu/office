# buzzie-ai

A modular framework for building AI assistants that talk to people through messaging platforms.

**Channels** (WhatsApp, iMessage) handle the protocol — connecting, sending, receiving. **Assistants** (your code) handle the brain — deciding what to say and do. They communicate over plain HTTP.

```
┌──────────────┐     POST /api/chat      ┌──────────────────┐
│   Channel    │ ──────────────────────>  │   Assistant      │
│  (whatsapp)  │   envelope (who, what)   │  (your app)      │
│              │ <──────────────────────  │                  │
│  port 3100   │   { text, actions }      │  port 3000       │
└──────────────┘                          └──────────────────┘
```

## Packages

| Package | Description | Platform |
|---------|-------------|----------|
| `@buzzie-ai/core` | Shared protocol — dispatcher, API server, adapter interface | Any |
| `@buzzie-ai/whatsapp` | WhatsApp channel via Baileys protocol | Any (Docker, Linux, macOS) |
| `@buzzie-ai/imessage` | iMessage channel via macOS Messages.app | macOS only |

## Quick Start — Build an Assistant

Your assistant is any HTTP server that receives message envelopes and returns responses. You don't need this monorepo — just install the channel you want.

### 1. Create your project

```bash
mkdir my-assistant && cd my-assistant
npm init -y
npm install @buzzie-ai/whatsapp
```

### 2. Write your assistant server

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

    // body.text    — the message text
    // body.type    — "self_chat", "group", or "dm"
    // body.history — recent conversation history
    // body.senderName, body.groupName, body.persona, etc.

    // Return a response
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      text: `You said: ${body.text}`,
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(3000, () => console.log("Assistant running on :3000"));
```

### 3. Start everything

```bash
# Terminal 1 — start your assistant
node server.js

# Terminal 2 — start the whatsapp channel
npx whatsapp
# First run walks you through setup (QR code + API key)
# Set backend in ~/.whatsapp-cli/config.json:
#   { "backend": { "type": "http", "url": "http://localhost:3000/api/chat" } }
```

That's it. Message yourself on WhatsApp and your assistant responds.

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
| `react` | `emoji` | React to the original message |

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

## Using Multiple Channels

Run WhatsApp and iMessage side by side, both pointing to the same assistant:

```bash
# Same assistant server handles both
node server.js

# WhatsApp (any platform, or Docker)
npx whatsapp

# iMessage (macOS only — needs Full Disk Access)
npx imessage
```

Both channels send the same envelope format, so your assistant code doesn't need to know which platform the message came from.

## Docker

WhatsApp can run in Docker. iMessage cannot (macOS only).

```bash
# From the monorepo root
docker compose up whatsapp-bot
```

Or with the pre-built image:

```bash
docker run -v whatsapp_data:/data \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  ghcr.io/arvindrajnaidu/whatsapp-cli:latest
```

## Channel CLI Commands

Both channels expose similar CLIs:

```bash
# WhatsApp
whatsapp status          # Check connection
whatsapp chats           # List chats
whatsapp messages <jid>  # Show messages
whatsapp send <to> <msg> # Send a message
whatsapp listen          # Stream incoming messages
whatsapp mcp             # Start MCP server (for AI tool integration)

# iMessage
imessage status          # Check Full Disk Access
imessage chats           # List conversations
imessage messages        # Show messages (--handle or --chat-id)
imessage send <to> <msg> # Send a message
imessage listen          # Stream incoming messages
imessage mcp             # Start MCP server
```

## Development

This is an npm workspaces monorepo.

```bash
npm install              # Install all workspace dependencies
node whatsapp/bin/whatsapp.mjs status
node imessage/bin/imessage.mjs status
```

### Structure

```
@buzzie-ai/
  package.json           # Workspace root
  docker-compose.yml     # WhatsApp Docker deployment
  core/                  # Shared protocol library
  whatsapp/              # WhatsApp channel (Baileys)
  imessage/              # iMessage channel (macOS)
  assistants/            # Example assistant backends
    whatsapp/            # Next.js assistant with LLM + tools
```
