# WhatsApp CLI

A command-line tool and agentic bot for WhatsApp, built on the [Baileys](https://github.com/WhiskeySockets/Baileys) protocol library.

Send messages, read chats, and run an AI-powered bot that responds to your self-chat messages — all from the terminal.

## Features

- **CLI commands** — send messages, list chats, read message history, send images and polls
- **Agentic bot** — message yourself on WhatsApp and an LLM-powered assistant responds, with tools to search groups, summarize conversations, extract links, and create video digests
- **MCP server** — expose WhatsApp as tools over stdio for AI integrations (Claude Desktop, etc.)
- **Dual LLM support** — works with Anthropic Claude or OpenAI GPT
- **Docker-ready** — pre-built multi-arch images on GHCR, or build locally

## Quick start

### With npm

```bash
npx @buzzie-ai/whatsapp            # Run directly
# or
npm install -g @buzzie-ai/whatsapp  # Install globally
whatsapp                            # First run walks you through setup
```

### With Docker (recommended for servers)

```bash
curl -fsSL https://raw.githubusercontent.com/arvindrajnaidu/whatsapp-cli/main/docker-setup.sh | bash
```

Or step by step:

```bash
# Pull and start
docker compose up -d

# Link your WhatsApp account (use pairing code for headless servers)
docker compose exec whatsapp-bot node bin/whatsapp.mjs login --pairing-code 60123456789

# Enter the 8-digit code on your phone — done
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

## Docker

### Pre-built image

Multi-arch images (amd64 + arm64) are published to GHCR on every push to `main`:

```bash
docker pull ghcr.io/arvindrajnaidu/whatsapp-cli:latest
```

### docker-compose.yml

```bash
# Use the pre-built image
docker compose up -d

# Or build locally
WHATSAPP_IMAGE=whatsapp-cli:local docker compose up --build
```

Create a `.env` file:

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

Auth credentials are persisted in the `whatsapp_data` Docker volume.

### Common Docker commands

```bash
# Link WhatsApp via QR code (interactive — needs a terminal)
docker compose run --rm whatsapp-bot node bin/whatsapp.mjs login

# Link via pairing code (headless servers)
docker compose run --rm whatsapp-bot node bin/whatsapp.mjs login --pairing-code 60123456789

# Unlink WhatsApp
docker compose run --rm whatsapp-bot node bin/whatsapp.mjs logout

# View live logs
docker compose logs -f

# Restart the bot (e.g. after pulling a new image)
docker compose pull && docker compose up -d

# Stop the bot
docker compose down

# Open a shell inside the container
docker compose exec whatsapp-bot sh
```

### Deploy to a GCP Compute Engine instance

```bash
# SSH into the instance
gcloud compute ssh <instance-name> --zone <zone> --project <project-id>

# Install Docker
sudo apt-get update && sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Create project directory
mkdir -p ~/whatsapp-bot && cd ~/whatsapp-bot

# Create docker-compose.yml and .env (add your API key)
cat > docker-compose.yml <<'EOF'
services:
  whatsapp-bot:
    image: ghcr.io/arvindrajnaidu/whatsapp-cli:latest
    environment:
      WHATSAPP_CLI_HOME: /data
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
    volumes:
      - whatsapp_data:/data
    init: true
    restart: unless-stopped

volumes:
  whatsapp_data:
EOF

echo "OPENAI_API_KEY=sk-..." > .env

# Authenticate with GHCR (if the image is private)
echo "<github-token>" | sudo docker login ghcr.io -u <github-username> --password-stdin

# Pull and start
sudo docker compose pull && sudo docker compose up -d

# Link WhatsApp (scan the QR code)
sudo docker compose run --rm whatsapp-bot node bin/whatsapp.mjs login

# Verify it's running
sudo docker compose logs -f
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
