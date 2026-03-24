# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Reference Projects

Always consult these sibling projects for architectural decisions:
- `/Users/arvindnaidu/myws/mybrowserlive` — The deployment platform for this assistant. Reference for how users will deploy and run the bot.
- `/Users/arvindnaidu/myws/whatsapp/openclaw` — The inspiration project for this codebase. Reference for design patterns and architectural choices.

## Overview

WhatsApp CLI is a Node.js command-line tool built on the [Baileys](https://github.com/WhiskeySockets/Baileys) WhatsApp Web protocol library. It provides direct CLI commands for WhatsApp operations, an MCP server for AI tool integration, and an agentic chatbot that responds to self-chat messages.

## Commands

```bash
npm start                    # Run the CLI (alias for node bin/whatsapp.mjs)
node bin/whatsapp.mjs        # Default action: runs setup wizard if needed, then starts the bot
node bin/whatsapp.mjs login  # Authenticate via QR code
node bin/whatsapp.mjs listen # Stream incoming messages
node bin/whatsapp.mjs mcp    # Start MCP server over stdio
node bin/whatsapp.mjs send <to> <message>
node bin/whatsapp.mjs chats
node bin/whatsapp.mjs messages <chat-id>
```

No test suite or linter is configured.

## Architecture

**ESM-only** (`"type": "module"` in package.json). All imports use `.js` extensions.

### Entry flow
- `bin/whatsapp.mjs` → `src/cli.js` (Commander program) → registers all subcommands
- Default action (no subcommand): runs `src/setup.js` (first-time wizard for WhatsApp login + LLM API key), then `src/bot/index.js` (agentic bot)

### Session management (`src/session.js`)
Central module for Baileys socket lifecycle. All commands use `createSocket()` / `connectAndWait()` to get an authenticated socket. Auth credentials stored in `~/.whatsapp-cli/auth/`. Includes in-memory message store for retry decryption.

### Bot system (`src/bot/`)
- `index.js` — `startBot()`: connects, caches all incoming messages in a `Map<jid, msg[]>`, listens for self-chat messages (messages you send to yourself), dispatches to NLU
- `nlu.js` — Manages conversation history (auto-resets after 5min inactivity), calls `agentChat()` with tools
- `llm.js` — Dual-provider LLM client (Anthropic Claude / OpenAI GPT). Uses raw `fetch()` against APIs (no SDK). Implements agentic tool-use loop (max 10 rounds). Provider resolved from env vars (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) or `~/.whatsapp-cli/config.json`
- `tools.js` — Tool definitions in provider-agnostic schema, converted to Anthropic/OpenAI formats. Tools: `list_groups`, `search_groups`, `read_messages`, `search_messages`, `extract_links`, `create_video_digest`. Tool executor is bound to bot context (groups list, message cache, socket)
- `resolve-group.js` — Fuzzy group name matching

### MCP server (`src/commands/mcp.js`)
Separate from the bot. Uses `@modelcontextprotocol/sdk` to expose WhatsApp tools (send_message, list_chats, get_messages, search_chats, get_group_info) over stdio transport.

### Config (`src/config.js`)
JSON config at `~/.whatsapp-cli/config.json`. Stores `llmProvider`, `llmKey`, `setupComplete`.

### Utilities (`src/utils/`)
- `jid.js` — Phone ↔ JID conversion, group JID detection
- `formatters.js` — Message extraction (`extractBody` unwraps Baileys message containers), chalk-based terminal formatting
- `normalize.js`, `poll-helpers.js` — Additional message processing

### Key patterns
- All bot replies are prefixed with `🤖 ` to avoid infinite loops (bot ignores its own messages)
- Messages are only available from the bot's runtime cache — no persistent message storage
- Group resolution accepts either JID (`120363xxx@g.us`) or fuzzy name match
