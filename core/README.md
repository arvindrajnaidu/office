# @buzzie-ai/core

Shared protocol library for buzzie-ai channels. Defines how channels and backends communicate — dispatcher, API server, adapter interface, message types.

Core has no opinions about business logic. It provides the plumbing that all channels share.

## Install

```bash
npm install @buzzie-ai/core
```

## Components

### Dispatcher

Routes inbound message envelopes to a backend (builtin function or HTTP endpoint).

```js
import { createDispatcher } from "@buzzie-ai/core";

const dispatcher = createDispatcher({
  backend: { type: "http", url: "https://my-app.com/api/chat" },
});

const response = await dispatcher.dispatch({
  type: "dm",
  jid: "123@s.whatsapp.net",
  senderName: "Alice",
  text: "Hello!",
  history: [],
  meta: { selfJid: "bot@s.whatsapp.net", timestamp: "2026-03-24T10:00:00Z" },
});

console.log(response.text);    // "Hi Alice!"
console.log(response.actions); // [{ type: "react", emoji: "👋" }]
```

**Backend types:**

| Type | Config | Description |
|------|--------|-------------|
| `builtin` | `{ type: "builtin" }` | Calls an injected `builtinHandler(envelope)` function |
| `http` | `{ type: "http", url, headers?, timeout? }` | POSTs the envelope to a URL |

**Per-chat routing** — different chats can use different backends:

```js
const dispatcher = createDispatcher({
  backend: { type: "http", url: "http://localhost:3000/api/chat" },
  groupBackends: {
    "120363xxx@g.us": { type: "http", url: "http://localhost:4000/api/chat" },
  },
});
```

**Header interpolation** — reference environment variables in HTTP headers:

```json
{ "headers": { "Authorization": "Bearer ${MY_BOT_TOKEN}" } }
```

### API Server

HTTP server that lets backends push messages to a channel. Routes are auto-discovered from the adapter — only methods the adapter implements get endpoints.

```js
import { createApiServer } from "@buzzie-ai/core";

const api = createApiServer(myAdapter, { token: "secret" });
await api.start(3100);
```

All requests require `Authorization: Bearer <token>` if a token is configured.

**Push routes (POST):**

| Route | Body | Description |
|-------|------|-------------|
| `/send` | `{ chatId, text }` | Send a text message |
| `/send-image` | `{ chatId, buffer, mimeType, fileName?, caption? }` | Send an image (`buffer` is base64) |
| `/send-document` | `{ chatId, buffer, mimeType, fileName, caption? }` | Send a document |
| `/react` | `{ chatId, emoji, targetMsgKey }` | React to a message |
| `/send-video` | `{ chatId, buffer, mimeType, fileName?, caption? }` | Send a video |
| `/send-poll` | `{ chatId, question, options }` | Send a poll |

**Query routes (GET):**

| Route | Params | Description |
|-------|--------|-------------|
| `/groups` | — | List groups |
| `/chats` | — | List chats |
| `/contacts` | — | List contacts |
| `/messages/:chatId` | `?days=7&limit=100` | Get messages from a chat |
| `/search-messages` | `?query=...&sender=...` | Search messages |
| `/extract-links` | `?chatId=...&days=7` | Extract links from a chat |

**Management routes:**

| Route | Method | Description |
|-------|--------|-------------|
| `/scheduled` | GET | List scheduled messages |
| `/scheduled` | POST | Create a scheduled message |
| `/scheduled/:id` | DELETE | Cancel a scheduled message |
| `/config` | GET | Get channel config |
| `/config` | POST | Update channel config |
| `/query` | GET | Run a SQL query (`?sql=...`) |

### Adapter Interface

Every channel implements the `ChannelAdapter` interface. Core validates required methods at startup and auto-discovers optional ones.

**Required methods** (every adapter must implement):

| Method | Signature | Description |
|--------|-----------|-------------|
| `sendText` | `(chatId, text)` | Send a text message |
| `sendImage` | `(chatId, buffer, opts)` | Send an image |
| `sendDocument` | `(chatId, buffer, opts)` | Send a document/file |
| `sendReaction` | `(chatId, emoji, targetMsgKey)` | React to a message |
| `getGroups` | `()` | List groups/channels |
| `getChats` | `()` | List all chats |
| `getMessages` | `(chatId, opts)` | Get message history |
| `getContacts` | `()` | List contacts |

**Optional methods** (implement as applicable):

`searchMessages`, `extractLinks`, `sendVideo`, `sendPoll`, `downloadVideo`, `createDigest`, `listOutputFiles`, `sendOutputFile`, `queryDb`, `getScheduled`, `createScheduled`, `cancelScheduled`, `getConfig`, `updateConfig`

```js
import { validateAdapter } from "@buzzie-ai/core";

const adapter = createMyAdapter();
validateAdapter(adapter); // throws if required methods are missing
```

### Message Types

```js
import { MessageTypes, ActionTypes } from "@buzzie-ai/core";

MessageTypes.SELF_CHAT  // "self_chat" — user messaging themselves
MessageTypes.GROUP      // "group"     — group chat message
MessageTypes.DM         // "dm"        — direct message
```

### Action Types

Actions are side effects a backend can return alongside or instead of a text reply:

```js
ActionTypes.REPLY_TEXT     // "reply_text"     — reply in the same chat
ActionTypes.SEND_MESSAGE   // "send_message"   — send to a different chat
ActionTypes.SEND_IMAGE     // "send_image"     — send an image to a chat
ActionTypes.SEND_DOCUMENT  // "send_document"  — send a file to a chat
ActionTypes.REACT          // "react"          — react with an emoji
```

## Envelope Format

When a message arrives, the channel builds this envelope and dispatches it to the backend:

```json
{
  "type": "self_chat",
  "jid": "14155551234@s.whatsapp.net",
  "senderName": "Alice",
  "text": "What meetings do I have today?",
  "groupName": null,
  "persona": null,
  "history": [
    { "role": "user", "content": "What meetings do I have today?" },
    { "role": "assistant", "content": "You have a standup at 9am." }
  ],
  "quotedContext": null,
  "meta": {
    "selfJid": "14155551234@s.whatsapp.net",
    "timestamp": "2026-03-24T10:00:00Z"
  }
}
```

## Response Format

The backend returns:

```json
{
  "text": "You have a standup at 9am and a 1:1 at 2pm.",
  "actions": [
    { "type": "send_message", "jid": "group-jid", "text": "Reminder: standup in 5 min" },
    { "type": "react", "emoji": "👍" }
  ]
}
```

Both `text` and `actions` are optional.

## License

MIT
