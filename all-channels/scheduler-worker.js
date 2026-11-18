import { setTimeout as sleep } from 'node:timers/promises';

/** One poll at a time; Hawk owns durable schedules, claims, and execution records. */
export function startSchedulerWorker({ backendUrl, token, intervalMs = 15000, timeoutMs = 270000, onStatus = console.log } = {}) {
  if (!backendUrl || !token) throw new Error('Scheduler worker needs the Hawk backend URL and channel token.');
  const endpoint = new URL(backendUrl);
  if (!/^\/api\/channel\/chat\/[^/]+\/?$/.test(endpoint.pathname)) throw new Error('Unsupported Hawk backend URL.');
  endpoint.pathname = endpoint.pathname.replace('/api/channel/chat/', '/api/channel/scheduler/');
  endpoint.search = '';
  endpoint.hash = '';
  const controller = new AbortController();
  let failures = 0;
  const done = (async () => {
    onStatus('[scheduler] Worker started.');
    while (!controller.signal.aborted) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]),
        });
        if (!response.ok) throw new Error(`Hawk HTTP ${response.status}`);
        const result = await response.json();
        failures = 0;
        if (result.status !== 'idle') onStatus(`[scheduler] Run ${result.runId || 'unknown'}: ${result.status}`);
      } catch (error) {
        if (controller.signal.aborted) break;
        failures++;
        onStatus(`[scheduler] Poll failed (${error.name === 'TimeoutError' ? 'timeout' : 'connection or backend error'}); retrying.`);
      }
      const delay = failures ? Math.min(60000, intervalMs * 2 ** Math.min(failures - 1, 4)) : intervalMs;
      try { await sleep(delay, undefined, { signal: controller.signal }); }
      catch { break; }
    }
  })();
  return { stop: () => controller.abort(), done };
}
