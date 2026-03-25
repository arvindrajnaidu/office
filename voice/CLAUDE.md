# CLAUDE.md

## Reference Projects

- `/Users/arvindnaidu/myws/@buzzie-ai/whatsapp` — WhatsApp channel, same architecture pattern
- `/Users/arvindnaidu/myws/@buzzie-ai/core` — Core library (ChannelAdapter, dispatcher, API server)
- `/Users/arvindnaidu/myws/openclaw/extensions/voice-call` — Production voice implementation (inspiration)

## Overview

Voice channel enables AI-powered phone calls via Twilio. Incoming calls are answered, audio is transcribed via OpenAI Realtime STT, text is dispatched to the brain, and the response is spoken back via OpenAI TTS.

## Architecture

```
Caller → Twilio → Webhook → TwiML (open media stream)
                → WebSocket (bidirectional audio)
                → mu-law audio → OpenAI STT → text → brain
                → brain response → OpenAI TTS → audio → caller
```

## Commands

```bash
voice-bot status          # Check Twilio + OpenAI credentials
voice-bot calls           # List call history
voice-bot                 # Start webhook server + media stream handler
```

**ESM-only**. All imports use `.js` extensions.

## Key patterns

- Twilio webhook receives calls, returns TwiML to open bidirectional media stream
- WebSocket handles real-time audio between Twilio and STT/TTS
- Brain receives same envelope format as all other channels
- Call transcripts stored in SQLite
