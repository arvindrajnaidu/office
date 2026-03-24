# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Reference Projects

Always consult these sibling projects for architectural decisions:
- `/Users/arvindnaidu/myws/@buzzie-ai/whatsapp` — The WhatsApp channel. This Telegram channel follows the same architecture.
- `/Users/arvindnaidu/myws/@buzzie-ai/core` — The core library providing ChannelAdapter interface, dispatcher, and API server.
- `/Users/arvindnaidu/myws/openclaw/src/telegram` — The original Grammy-based Telegram implementation (inspiration).

## Overview

Telegram channel CLI is a Node.js command-line tool built on Grammy (Telegram Bot API framework). It provides direct CLI commands for Telegram operations, an MCP server for AI tool integration, and an agentic chatbot that responds to DMs and group messages.

## Commands

```bash
npm start                            # Run the CLI (alias for node bin/telegram.mjs)
node bin/telegram.mjs                # Default action: runs setup wizard if needed, then starts the bot
node bin/telegram.mjs status         # Check bot token + config
node bin/telegram.mjs chats          # List cached chats
node bin/telegram.mjs messages <id>  # Show messages for a chat
node bin/telegram.mjs send <id> <msg># Send a message
node bin/telegram.mjs listen         # Stream incoming messages
node bin/telegram.mjs mcp            # Start MCP server over stdio
```

No test suite or linter is configured.

## Architecture

**ESM-only** (`"type": "module"` in package.json). All imports use `.js` extensions.

### Entry flow
- `bin/telegram.mjs` → `src/cli.js` (Commander program) → registers all subcommands
- Default action (no subcommand): runs `src/setup.js` (first-time wizard for bot token + LLM API key), then `src/bot/index.js` (agentic bot)

### Session management (`src/session.js`)
Grammy Bot lifecycle. Creates Bot instance from token, provides `checkToken()` for validation, `createBot()` factory.

### Bot system (`src/bot/`)
- `index.js` — `startBot()`: creates Grammy bot, caches incoming messages, dispatches to backend via @buzzie-ai/core
- `scheduler.js` — 30s polling for scheduled sends

### Adapter (`src/adapter.js`)
Implements @buzzie-ai/core ChannelAdapter interface using Grammy Bot API methods.

### Config (`src/config.js`)
JSON config at `~/.telegram-cli/config.json`. Stores `botToken`, `llmProvider`, `llmKey`, `setupComplete`, `backend`.

### Key patterns
- All bot replies prefixed with `🤖 ` to avoid infinite loops
- Grammy long-polling mode (no webhook/public URL needed)
- DMs trigger self_chat dispatch, group mentions/replies trigger group dispatch
- Messages cached in SQLite for history and search
