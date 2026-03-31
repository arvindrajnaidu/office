# Voice Channel

A command-line tool for AI-powered phone calls, built on [Twilio](https://www.twilio.com/) and [OpenAI](https://platform.openai.com/).

Incoming calls are answered, caller speech is transcribed in real time via OpenAI Realtime STT, the text is dispatched to your AI backend, and the response is spoken back via OpenAI TTS — all with sub-second latency.

## Features

- **Live voice calls** — answer phone calls and have real-time AI conversations
- **Speech-to-text** — OpenAI Realtime API with voice activity detection
- **Text-to-speech** — OpenAI TTS with 6 voice options (nova, alloy, echo, fable, onyx, shimmer)
- **Caller greeting** — brain is notified on call connect and can speak a greeting before the caller says anything
- **Call transcripts** — full conversation history stored in SQLite
- **CLI commands** — check status, view call history
- **MCP server** — expose voice tools over stdio for AI integrations

## Quick Start

### With npm

```bash
npx @buzzie-ai/voice-channel        # Run directly
# or
npm install -g @buzzie-ai/voice-channel
voice-bot                            # First run walks you through setup
```

### From source

```bash
git clone https://github.com/arvindrajnaidu/office.git
cd office/voice
npm install
npm start
```

## Prerequisites

1. **Twilio account** — [console.twilio.com](https://console.twilio.com)
   - Account SID and Auth Token (from the dashboard)
   - A phone number with voice capabilities

2. **OpenAI API key** — [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   - Used for both speech-to-text (Realtime API) and text-to-speech

3. **Public webhook URL** — Twilio needs to reach your server
   - **Development:** use a tunnel to expose `localhost:3100` publicly
   - **Production:** your server's public URL

## Usage

### Bot mode (default)

```bash
voice-bot
# or
npm start
```

On first run, a setup wizard walks you through Twilio credentials, OpenAI API key, and webhook URL configuration. After that, the bot starts a webhook server and automatically configures your Twilio phone number.

**How it works:**

```
Caller dials your Twilio number
  → Twilio POSTs to /voice/incoming
  → TwiML opens a bidirectional WebSocket media stream
  → Caller audio (mu-law) → OpenAI Realtime STT → text transcript
  → Transcript dispatched to your backend (brain)
  → Backend response → OpenAI TTS → audio → caller hears the reply
```

**Call connected event:** When a call connects, the brain receives an envelope with `meta.event: "call_connected"` and empty `text`. The brain can return a greeting (e.g., "Hello! How can I help you?") that is spoken immediately before the caller says anything. Return no text to stay silent and wait for the caller.

### CLI commands

```bash
voice-bot                # Start webhook server + media stream handler
voice-bot status         # Check Twilio + OpenAI credentials
voice-bot calls          # List call history
voice-bot mcp            # Start MCP server over stdio
```

### MCP server

The MCP server exposes voice tools over stdio, compatible with Claude Desktop and other MCP clients.

```bash
voice-bot mcp
```

Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "voice": {
      "command": "npx",
      "args": ["@buzzie-ai/voice-channel", "mcp"]
    }
  }
}
```

## Configuration

### Environment variables

| Variable | Description |
|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Twilio phone number (e.g., `+18005551234`) |
| `OPENAI_API_KEY` | OpenAI API key (for STT and TTS) |
| `WEBHOOK_URL` | Public URL for Twilio callbacks |
| `TTS_VOICE` | TTS voice name (default: `nova`) |
| `VOICE_CLI_HOME` | Override config directory (default: `~/.voice-cli`) |
| `BUZZIE_API_PORT` | Webhook + API server port (default: `3100`) |
| `BUZZIE_API_TOKEN` | Bearer token for outbound API auth |

### Config file

The setup wizard writes to `~/.voice-cli/config.json`:

```json
{
  "twilioAccountSid": "AC...",
  "twilioAuthToken": "auth_token",
  "twilioPhoneNumber": "+18005551234",
  "openaiApiKey": "sk-...",
  "webhookUrl": "https://your-server.example.com",
  "ttsVoice": "nova",
  "setupComplete": true,
  "backend": {
    "type": "http",
    "url": "http://localhost:3000/api/chat"
  }
}
```

Environment variables take precedence over the config file.

### TTS voices

| Voice | Description |
|-------|-------------|
| `nova` | Warm and friendly (default) |
| `alloy` | Balanced and clear |
| `echo` | Smooth and resonant |
| `fable` | Expressive and animated |
| `onyx` | Deep and authoritative |
| `shimmer` | Bright and upbeat |

## Integrating a Custom Backend

Voice Channel is a **communication layer** — it handles Twilio connectivity, speech-to-text, text-to-speech, and audio streaming. Business logic (LLM calls, CRM lookups, custom workflows) lives in a separate **backend**.

### Backend interface

Your backend receives a JSON POST and returns a JSON response. The format is identical to all other buzzie-ai channels.

**Request** (what your backend receives):

```json
{
  "type": "dm",
  "jid": "+14155551234",
  "senderName": "+14155551234",
  "text": "I'd like to check my order status",
  "history": [
    { "role": "assistant", "content": "Hello! How can I help you today?" },
    { "role": "user", "content": "I'd like to check my order status" }
  ],
  "meta": {
    "selfJid": "+18005551234",
    "timestamp": "2026-03-24T10:00:00Z",
    "channel": "voice",
    "callSid": "CA1234567890abcdef"
  }
}
```

For the call connected event, `text` is empty and `meta.event` is `"call_connected"`.

**Response** (what your backend returns):

```json
{
  "text": "Sure! What's your order number?",
  "actions": []
}
```

The `text` is converted to speech and played to the caller. `actions` are optional side effects (send a message to another channel, etc.).

### Configuration

Add a `backend` key to `~/.voice-cli/config.json`:

**HTTP backend** — POST conversation to an endpoint:

```json
{
  "backend": {
    "type": "http",
    "url": "https://my-bot.example.com/api/chat",
    "headers": { "Authorization": "Bearer ${MY_BOT_TOKEN}" },
    "timeout": 30000
  }
}
```

### Example: Building an HTTP backend

A minimal Express server:

```js
import express from "express";
const app = express();
app.use(express.json());

app.post("/api/chat", (req, res) => {
  const { text, senderName, meta } = req.body;

  // Handle call connected — return a greeting
  if (meta?.event === "call_connected") {
    return res.json({ text: "Hello! Thanks for calling. How can I help you?" });
  }

  // Handle caller speech
  res.json({ text: `You said: "${text}". Let me look into that for you.` });
});

app.listen(3000, () => console.log("Backend listening on :3000"));
```

## Programmatic Usage

```js
import { startBot } from "@buzzie-ai/voice-channel";

await startBot();
```

## Architecture

- **ESM-only** (`"type": "module"`)
- **Entry:** `bin/voice.mjs` → `src/cli.js` (Commander) → subcommands
- **Webhook:** `src/webhook.js` — HTTP server for Twilio callbacks (`/voice/incoming`, `/voice/status`)
- **Media stream:** `src/media-stream.js` — WebSocket server for bidirectional audio
- **STT:** `src/stt.js` — OpenAI Realtime API (WebSocket) with server-side VAD
- **TTS:** `src/tts.js` — OpenAI TTS API with PCM → mu-law conversion (24kHz → 8kHz downsampling)
- **DB:** `src/db.js` — SQLite for call records and transcripts

## License

MIT
