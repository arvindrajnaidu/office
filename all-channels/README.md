# Buzzie AI — All Channels

A single Docker image that runs all buzzie-ai channels together. Any brain can launch a VM or container with this image and have WhatsApp, Telegram, Email, and Voice all running.

Channels that aren't configured are silently skipped — you only need to provide credentials for the channels you want.

## Quick Start

```bash
docker build -f all-channels/Dockerfile -t buzzie .

docker run -d \
  -e BACKEND_URL=http://my-brain:3000/api/chat \
  -e TELEGRAM_BOT_TOKEN=123456:ABC... \
  -v buzzie_data:/data \
  -p 3102:3102 \
  buzzie
```

This starts only Telegram (the only configured channel). WhatsApp, Email, and Voice are skipped.

## Ports

Each channel runs its own API server on a dedicated port:

| Channel | Port | Purpose |
|---------|------|---------|
| Voice | 3100 | Twilio webhooks + media stream + push API |
| WhatsApp | 3101 | Push API (send messages from brain) |
| Telegram | 3102 | Push API |
| Email | 3103 | Push API |

Only expose ports for channels you're using.

## Environment Variables

### Shared

| Variable | Required | Description |
|----------|----------|-------------|
| `BACKEND_URL` | Yes | Your brain's HTTP endpoint (receives message envelopes) |
| `BACKEND_TOKEN` | No | Bearer token added to backend requests |

### WhatsApp

| Variable | Required | Description |
|----------|----------|-------------|
| `WHATSAPP_CLI_HOME` | No | Data directory (default: `/data/whatsapp`) |
| `WHATSAPP_API_PORT` | No | API port (default: `3101`) |

WhatsApp requires pre-seeded Baileys auth credentials at `$WHATSAPP_CLI_HOME/auth/creds.json`. You must log in on a machine first (run `npx @buzzie-ai/whatsapp-channel login`), then copy the `auth/` directory into the volume.

### Telegram

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from @BotFather |
| `TELEGRAM_CLI_HOME` | No | Data directory (default: `/data/telegram`) |
| `TELEGRAM_API_PORT` | No | API port (default: `3102`) |

### Email

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | Yes | Resend API key |
| `EMAIL_FROM` | Yes | Sender email address (on a verified domain) |
| `EMAIL_CLI_HOME` | No | Data directory (default: `/data/email`) |
| `EMAIL_API_PORT` | No | API port (default: `3103`) |

### Voice

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Yes | Twilio phone number (e.g., `+18005551234`) |
| `OPENAI_API_KEY` | Yes | OpenAI API key (for STT and TTS) |
| `WEBHOOK_URL` | Yes | Public URL for Twilio callbacks |
| `TTS_VOICE` | No | TTS voice (default: `nova`) |
| `VOICE_CLI_HOME` | No | Data directory (default: `/data/voice`) |
| `VOICE_API_PORT` | No | API port (default: `3100`) |

### LLM (for built-in bot mode)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `OPENAI_API_KEY` | OpenAI GPT API key |

Only needed if a channel uses the built-in LLM backend instead of an HTTP backend.

## Docker Compose

```yaml
services:
  buzzie:
    build:
      context: .
      dockerfile: all-channels/Dockerfile
    ports:
      - "3100:3100"   # Voice
      - "3101:3101"   # WhatsApp
      - "3102:3102"   # Telegram
      - "3103:3103"   # Email
    environment:
      BACKEND_URL: http://brain:3000/api/chat
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      RESEND_API_KEY: ${RESEND_API_KEY}
      EMAIL_FROM: ${EMAIL_FROM}
      TWILIO_ACCOUNT_SID: ${TWILIO_ACCOUNT_SID}
      TWILIO_AUTH_TOKEN: ${TWILIO_AUTH_TOKEN}
      TWILIO_PHONE_NUMBER: ${TWILIO_PHONE_NUMBER}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      WEBHOOK_URL: ${WEBHOOK_URL}
    volumes:
      - buzzie_data:/data
    init: true
    restart: unless-stopped

volumes:
  buzzie_data:
```

## Data Persistence

All channel data is stored under `/data/` with per-channel subdirectories:

```
/data/
  whatsapp/    config.json, auth/, messages.db
  telegram/    config.json, messages.db
  email/       config.json, messages.db
  voice/       config.json, calls.db
```

Mount `/data` as a volume to persist across container restarts.

## Startup Behavior

On startup, the entrypoint:

1. Checks each channel's required credentials
2. Writes a `config.json` for each enabled channel (with `BACKEND_URL` and port)
3. Starts enabled channels concurrently
4. Logs which channels started and which were skipped

```
buzzie-ai: starting all configured channels...

  [skip] whatsapp — not configured
  [start] telegram on port 3102
  [skip] email — not configured
  [skip] voice — not configured

buzzie-ai: 1 channel(s) started, 3 skipped
  active: telegram (:3102)
  skipped: whatsapp, email, voice
```

If no channels are configured, the container exits with an error.

## Building Your Brain

Your brain receives the same JSON envelope from all channels:

```json
{
  "type": "dm",
  "jid": "123456789",
  "senderName": "Alice",
  "text": "Hello!",
  "history": [...],
  "meta": {
    "selfJid": "bot-id",
    "timestamp": "2026-03-30T10:00:00Z",
    "channel": "telegram"
  }
}
```

Return a response:

```json
{
  "text": "Hi Alice! How can I help?",
  "actions": []
}
```

See the individual channel READMEs for channel-specific details (voice greeting events, email subject handling, etc.).

## License

MIT


### Sal scheduled tasks

Set `SAL_WORKER_ENABLED=1` alongside `BACKEND_URL` (Hawk's `/api/channel/chat/<merchant>` endpoint) and `BUZZIE_API_TOKEN`. The container starts a scheduler worker alongside the channel adapters. No separate port or database credentials are required.

The worker makes one authenticated POST at a time to Hawk's `/api/channel/scheduler/<merchant>` endpoint, normally every 15 seconds. Hawk owns persistent schedules, occurrence claims, execution, Activity results, and push delivery. Polling backs off on errors and resumes after restarts. An interrupted execution is recorded for inspection rather than replayed, because it may already have changed an external system.

Run worker transport tests with `node --test all-channels/scheduler-worker.test.js` from the workspace root.

### Persistent browser and owner streaming

Set `SAL_BROWSER_ENABLED=1`, `BUZZIE_API_TOKEN`, and `BACKEND_URL`. Chromium runs continuously as an independent desktop process on a virtual display in this same container. Sal attaches over a loopback-only CDP port on demand, using Playwright’s `noDefaults` mode so the existing browser context keeps its own settings. Taking control detaches that connection before remote keyboard/mouse input is enabled. Persist `SAL_BROWSER_HOME` (default `/data/browser`) on a Railway volume. The browser uses one profile at `$SAL_BROWSER_HOME/profile`; voice remains on port 3100 and the browser HTTP/WebSocket endpoint is port 3104. Give port 3104 its own Railway service domain.

Hawk creates short-lived owner viewer tickets server-side. Viewer tickets travel in a URL fragment and WebSocket subprotocol, never a public query string or the channel API key. Raw VNC is bound to localhost. The stream enforces read-only input server-side until its owner ticket has taken control. Agent browser reads/actions are serialized and blocked during manual control. Manual pause persists across disconnects and restarts and ends only when an owner explicitly returns control.

Automation tools support tabs, public HTTP/HTTPS navigation, bounded page/frame snapshots, element references, typing, keys, and scrolling. Password entry is handed to the owner. A local egress proxy rejects private network addresses and pins DNS resolutions for its outgoing connections. Chromium is launched without a browser sandbox inside this per-owner container; keep the image patched, and treat pages as untrusted data. Downloads are retained under `$SAL_BROWSER_HOME/downloads`; remote file-upload/download UI is not included in the initial viewer.

Native owners can also open Sal → Settings → Browser. App sessions request mobile website rendering, standard mobile user-agent/client hints, and a narrow desktop stream. The viewer can switch back to Desktop. Display changes are serialized with agent actions and never reload pages or read page content. A separate display-only CDP connection maintains device emulation when the Sal automation connection is detached; the owner still has exclusive keyboard/mouse input during manual control. The display choice affects the one shared browser. Server-rendered sites may require an owner-initiated reload to pick up the new request headers.

Tests: `node --test all-channels/browser/browser.test.js all-channels/scheduler-worker.test.js`. The Docker publishing workflow also launches real Chromium and verifies live RFB streaming, agent exclusion during takeover, and profile/tab/manual-pause persistence across container recreation.
