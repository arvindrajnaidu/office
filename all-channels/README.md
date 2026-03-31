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
