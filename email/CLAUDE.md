# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Reference Projects

Always consult these sibling projects for architectural decisions:
- `/Users/arvindnaidu/myws/@buzzie-ai/telegram` — The Telegram channel. This email channel follows the same architecture.
- `/Users/arvindnaidu/myws/@buzzie-ai/core` — The core library providing ChannelAdapter interface, dispatcher, and API server.

## Overview

Email channel CLI is a Node.js command-line tool built on the Resend API for sending and receiving emails. It polls for incoming emails, dispatches to an AI backend, and sends replies — following the same pattern as the other buzzie-ai channels.

## Commands

```bash
npm start                              # Run the CLI
node bin/email.mjs                     # Default: setup wizard if needed, then start bot
node bin/email.mjs status              # Check Resend API key + config
node bin/email.mjs send <to> <subject> # Send an email
node bin/email.mjs emails              # List sent/received emails
node bin/email.mjs listen              # Poll and stream incoming emails
node bin/email.mjs mcp                 # Start MCP server over stdio
```

No test suite or linter is configured.

## Architecture

**ESM-only** (`"type": "module"` in package.json). All imports use `.js` extensions.

### Entry flow
- `bin/email.mjs` → `src/cli.js` (Commander program) → registers all subcommands
- Default action: runs `src/setup.js` (Resend API key + from address + LLM key), then `src/bot/index.js`

### Email integration
- Uses the `resend` npm package (official Resend Node.js SDK)
- Sends via `resend.emails.send()`
- Receives by polling `GET /emails/receiving` (Resend inbound email API)
- `src/poller.js` — EmailPoller EventEmitter that polls for new received emails

### Key patterns
- All bot replies prefixed with `🤖 ` to avoid loops
- Polls Resend API for inbound emails (10s default interval)
- Subject line auto-generated from first line of text or "Re: ..." for replies
- chatId = email address (the "jid" equivalent)
