# @buzzie-ai/core

Bidirectional channel protocol for messaging bots. Core defines how channels and backends communicate — it has no opinions about business logic.

## Install

```bash
npm install @buzzie-ai/core
```

## Usage

```js
import { createDispatcher, createApiServer, ActionTypes } from "@buzzie-ai/core";

// Inbound: channel receives message → dispatch to backend
const dispatcher = createDispatcher({
  backend: { type: "http", url: "https://my-app.com/api/chat" },
  builtinHandler: async (envelope) => ({ text: "Hello!" }),
});

const response = await dispatcher.dispatch({
  type: "self_chat",
  jid: "123@s.whatsapp.net",
  text: "Hi there",
});

// Outbound: backend pushes message → channel delivers
const api = createApiServer(myAdapter, { token: "secret" });
await api.start(3100);
// POST http://localhost:3100/send { chatId, text }
```

## Components

- **types.js** — `MessageTypes`, `ActionTypes`
- **dispatcher.js** — `createDispatcher(config)` routes envelopes to builtin or HTTP backends
- **api-server.js** — `createApiServer(adapter, opts)` HTTP server for push messaging
- **adapter.js** — `ChannelAdapter` interface that channels implement
