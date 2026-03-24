# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Reference Projects

Always consult these sibling projects for architectural decisions:
- `/Users/arvindnaidu/myws/@buzzie-ai/whatsapp` — The WhatsApp adapter. This iMessage adapter follows the same architecture.
- `/Users/arvindnaidu/myws/@buzzie-ai/core` — The core library providing ChannelAdapter interface, dispatcher, and API server.
- `/Users/arvindnaidu/myws/imessage/imessage-node` — The original iMessage library (inlined into `src/imessage/`).

## Overview

iMessage CLI is a macOS-only Node.js command-line tool that reads messages from the macOS Messages database (`~/Library/Messages/chat.db`) and sends messages via AppleScript. It provides direct CLI commands for iMessage operations, an MCP server for AI tool integration, and an agentic chatbot that responds to self-chat messages.

## Commands

```bash
npm start                        # Run the CLI (alias for node bin/imessage.mjs)
node bin/imessage.mjs            # Default action: runs setup wizard if needed, then starts the bot
node bin/imessage.mjs status     # Check Full Disk Access + config
node bin/imessage.mjs chats      # List conversations
node bin/imessage.mjs messages   # Show messages (--handle or --chat-id required)
node bin/imessage.mjs send <to> <message>  # Send an iMessage
node bin/imessage.mjs listen     # Stream incoming messages
node bin/imessage.mjs mcp        # Start MCP server over stdio
```

No test suite or linter is configured.

## Architecture

**ESM-only** (`"type": "module"` in package.json). All imports use `.js` extensions.

### Entry flow
- `bin/imessage.mjs` → `src/cli.js` (Commander program) → registers all subcommands
- Default action (no subcommand): runs `src/setup.js` (first-time wizard for FDA check + LLM API key), then `src/bot/index.js` (agentic bot)

### iMessage integration (`src/imessage/`)
Inlined from the `imessage-node` library. Zero native dependencies — uses macOS system tools:
- `db.js` — Reads `~/Library/Messages/chat.db` via `sqlite3` CLI with `-json -readonly` flags
- `send.js` — Sends messages and files via AppleScript (`osascript`)
- `poller.js` — `MessagePoller` EventEmitter that polls for new messages by ROWID

### Session management (`src/session.js`)
- `checkAccess()` — Verifies Full Disk Access by attempting to read chat.db
- `createPoller()` — Factory for MessagePoller with bot defaults
- `detectSelfHandle()` — Auto-detects user's phone/email from recent messages

### Bot system (`src/bot/`)
- `index.js` — `startBot()`: opens DB, creates poller, listens for messages, dispatches to backend via @buzzie-ai/core
- `scheduler.js` — 30s polling for scheduled sends

### Adapter (`src/adapter.js`)
Implements @buzzie-ai/core ChannelAdapter interface. Maps core methods to iMessage operations:
- `sendText` → AppleScript `sendMessage` or `sendToGroupChat`
- `sendImage`/`sendDocument` → write to temp file, send via AppleScript POSIX file
- `sendReaction` → no-op (AppleScript doesn't support Tapbacks)
- `getChats`/`getGroups` → query chat.db directly

### Config (`src/config.js`)
JSON config at `~/.imessage-cli/config.json`. Stores `llmProvider`, `llmKey`, `selfHandle`, `setupComplete`, `backend`.

### Key patterns
- All bot replies prefixed with `🤖 ` to avoid infinite loops
- macOS only — requires Full Disk Access permission
- No persistent connection needed — reads local SQLite database
- Self-chat = messages sent to a chat containing your own handle
