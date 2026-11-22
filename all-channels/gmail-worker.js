import { setTimeout as sleep } from 'node:timers/promises';
import { ImapFlow } from 'imapflow';

export async function pollGmailWatch(client, watch, mailbox, connectionId) {
  const uidValidity = mailbox.uidValidity.toString();
  const previous = uidValidity === watch.uidValidity ? watch.cursor : 0;
  const latest = Math.max(0, (Number(mailbox.uidNext) || 1) - 1);
  let cursor = previous;
  const matches = [];
  if (latest > previous) {
    const found = await client.search({
      uid: (previous + 1) + ':' + latest,
      since: new Date(watch.createdAt),
      ...(watch.sender && { from: watch.sender }),
      ...(watch.keyword && { text: watch.keyword }),
    }, { uid: true });
    const all = (found || []).filter(uid => uid > previous && uid <= latest).sort((a, b) => a - b);
    const batch = all.slice(0, 50);
    if (batch.length) {
      for await (const message of client.fetch(batch, { envelope: true, internalDate: true }, { uid: true })) {
        const receivedAt = new Date(message.internalDate);
        if (!Number.isFinite(receivedAt.getTime()) || receivedAt < new Date(watch.createdAt)) continue;
        matches.push({
          uid: message.uid,
          sender: (message.envelope?.from?.map(item => item.address).filter(Boolean).join(', ') || '').slice(0, 320),
          subject: (message.envelope?.subject || '').slice(0, 400),
          receivedAt: receivedAt.toISOString(),
        });
      }
    }
    cursor = all.length > batch.length ? batch.at(-1) : latest;
  }
  return {
    watchId: watch.id, connectionId, previousValidity: watch.uidValidity, previousCursor: watch.cursor,
    uidValidity, cursor, matches,
  };
}

export function startGmailWorker({ backendUrl, token, key, intervalMs = 180000, onStatus = console.log } = {}) {
  const endpoint = new URL(backendUrl);
  if (endpoint.protocol !== 'https:' || !token || !/^[\w-]{43,128}$/.test(key ?? '')
    || !/^\/api\/channel\/chat\/[^/]+\/?$/.test(endpoint.pathname)) throw new Error('Invalid Gmail worker configuration.');
  endpoint.pathname = endpoint.pathname.replace('/api/channel/chat/', '/api/channel/gmail/').replace(/\/$/, '');
  endpoint.search = '';
  endpoint.hash = '';
  const controller = new AbortController();
  const exchange = async body => {
    const response = await fetch(endpoint, {
      method: 'POST', redirect: 'error',
      headers: { Authorization: 'Bearer ' + token, 'X-Sal-Gmail-Worker': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    });
    if (!response.ok) throw new Error('Hawk HTTP ' + response.status);
    return response.json();
  };

  const done = (async () => {
    onStatus('[gmail] Poller started.');
    while (!controller.signal.aborted) {
      let client;
      let timer;
      const stop = () => client?.close();
      try {
        const config = await exchange({ action: 'poll' });
        if (config.watches?.length) {
          client = new ImapFlow({
            host: 'imap.gmail.com', port: 993, secure: true, logger: false, disableAutoIdle: true,
            auth: { user: config.email, pass: config.password },
            connectionTimeout: 8000, greetingTimeout: 7000, socketTimeout: 15000,
          });
          client.on('error', () => {});
          controller.signal.addEventListener('abort', stop, { once: true });
          timer = setTimeout(stop, 45000);
          await client.connect();
          const mailbox = await client.mailboxOpen('INBOX', { readOnly: true });
          for (const watch of config.watches) {
            const data = await pollGmailWatch(client, watch, mailbox, config.connectionId);
            if (data.cursor !== data.previousCursor || data.uidValidity !== data.previousValidity) await exchange(data);
          }
        }
      } catch {
        if (!controller.signal.aborted) onStatus('[gmail] Poll failed; retrying at the next interval.');
      } finally {
        clearTimeout(timer);
        stop();
        controller.signal.removeEventListener('abort', stop);
      }
      try { await sleep(intervalMs, undefined, { signal: controller.signal }); }
      catch { break; }
    }
  })();
  return { stop: () => controller.abort(), done };
}
