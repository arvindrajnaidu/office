/**
 * Backend dispatcher — routes inbound messages to the appropriate backend.
 *
 * Two backend types:
 * - "builtin": calls an injected handler function (the channel's built-in bot)
 * - "http": POSTs the message envelope to an external URL
 *
 * @param {object} config
 * @param {object} config.backend - default backend: { type, url?, headers?, timeout? }
 * @param {object} [config.groupBackends] - per-JID overrides: { [jid]: backendConfig }
 * @param {Function} [config.builtinHandler] - async (envelope) => { text?, actions? }
 * @returns {{ dispatch(envelope: object): Promise<{text?: string, actions?: Array}> }}
 */
export function createDispatcher(config) {
  const { backend = { type: "builtin" }, groupBackends, builtinHandler } = config;

  function resolveBackend(jid) {
    if (jid && groupBackends?.[jid]) {
      return groupBackends[jid];
    }
    return backend;
  }

  return {
    async dispatch(envelope) {
      const resolved = resolveBackend(envelope.jid);

      switch (resolved.type) {
        case "builtin":
          if (!builtinHandler) {
            throw new Error("Builtin backend requires a builtinHandler function");
          }
          return builtinHandler(envelope);

        case "http":
          return handleHttp(envelope, resolved);

        default:
          throw new Error(`Unknown backend type: ${resolved.type}`);
      }
    },
  };
}

/**
 * HTTP backend: POST the envelope to an external endpoint.
 */
async function handleHttp(envelope, backend) {
  const { url, headers = {}, timeout = 30000 } = backend;

  if (!url) throw new Error("HTTP backend requires a 'url' in config");

  // Build the payload (exclude internal context — only send serializable data)
  const payload = {
    type: envelope.type,
    jid: envelope.jid,
    groupName: envelope.groupName,
    persona: envelope.persona,
    senderName: envelope.senderName,
    text: envelope.text,
    history: envelope.history,
    quotedContext: envelope.quotedContext,
    meta: envelope.meta,
  };

  // Interpolate env vars in header values: ${VAR_NAME}
  const resolvedHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    resolvedHeaders[key] = value.replace(
      /\$\{(\w+)\}/g,
      (_, name) => process.env[name] || "",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...resolvedHeaders,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP backend returned ${res.status}: ${await res.text()}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
