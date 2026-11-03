// Callback backend. Keeps the API key server-side, validates every request and response,
// and never logs private source, answer, or transcript bodies.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { AIResult, DiscoveryReply, Envelope } from '../src/lib/ai/types';
import { EnvelopeSchema, MAX_INPUT_CHARS, PROMPT_VERSION } from './contract';
import { MODEL, discoveryTurn, isConfigured, runTask } from './ai';
import { BRIEF, SCENARIOS, respondToQuestion, type Scenario } from '../src/lib/discovery';

if (existsSync('.env')) process.loadEnvFile('.env');
const PORT = Number(process.env.CALLBACK_API_PORT ?? 8787);
const MAX_BODY = 1_000_000;

// ---- rate limiting (per client address, sliding window) ----
const WINDOW_MS = 60_000;
const LIMIT = Number(process.env.CALLBACK_RATE_LIMIT ?? 30);
const hits = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(key, list);
  return list.length > LIMIT;
}

// ---- duplicate expensive submissions share one in-flight request ----
const inflight = new Map<string, Promise<AIResult>>();

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error('too_large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function log(entry: Record<string, unknown>) {
  // Metadata only: never request bodies.
  console.log(JSON.stringify({ at: new Date().toISOString(), ...entry }));
}

// ---- discovery runs: scenario state lives only here ----
interface Run { scenario: Scenario; revealed: string[]; createdAt: number; closed: boolean }
const runs = new Map<string, Run>();
const topicOf = (factId: string) => factId.split('.')[1] ?? factId;

async function handleAI(req: IncomingMessage, res: ServerResponse) {
  const requestId = randomUUID();
  const started = Date.now();
  if (!isConfigured()) return send(res, 503, { status: 'unavailable', reason: 'not_configured', message: 'AI is not configured on the server.' } satisfies AIResult);
  if (rateLimited(req.socket.remoteAddress ?? 'local')) return send(res, 429, { status: 'unavailable', reason: 'rate_limited', message: 'Too many AI requests. Wait a minute and try again.' } satisfies AIResult);
  let body: unknown;
  try {
    body = await readJson(req);
  } catch (e) {
    return send(res, (e as Error).message === 'too_large' ? 413 : 400, { status: 'unavailable', reason: (e as Error).message === 'too_large' ? 'too_large' : 'error', message: 'Request could not be read.' } satisfies AIResult);
  }
  const parsed = EnvelopeSchema.safeParse(body);
  if (!parsed.success) return send(res, 400, { status: 'unavailable', reason: 'error', message: 'Request did not match the expected shape.' } satisfies AIResult);
  const env = parsed.data as Envelope;
  const size = JSON.stringify(env).length;
  if (size > MAX_INPUT_CHARS) return send(res, 413, { status: 'unavailable', reason: 'too_large', message: `This request is too large (${size.toLocaleString()} characters; limit ${MAX_INPUT_CHARS.toLocaleString()}). Select fewer sources or shorten the text — your draft is unchanged.` } satisfies AIResult);

  const key = createHash('sha256').update(JSON.stringify(env)).digest('hex');
  const ctl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ctl.abort(); });
  let p = inflight.get(key);
  const shared = !!p;
  if (!p) {
    p = runTask(env, requestId, ctl.signal).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  const result = await p;
  log({ requestId, task: env.task_id, status: result.status, ms: Date.now() - started, shared, attempts: 'meta' in result ? result.meta.attempts : 0 });
  const code = result.status === 'unavailable' ? (result.reason === 'rate_limited' ? 429 : result.reason === 'timeout' ? 504 : result.reason === 'cancelled' ? 499 : 502) : 200;
  if (!res.writableEnded && !res.destroyed) send(res, code, result);
}

async function handleDiscovery(path: string, req: IncomingMessage, res: ServerResponse) {
  let body: Record<string, unknown> = {};
  try {
    body = (await readJson(req)) as Record<string, unknown>;
  } catch {
    return send(res, 400, { error: 'bad request' });
  }
  if (path === '/api/discovery/start') {
    const prev = typeof body.previousRunId === 'string' ? runs.get(body.previousRunId)?.scenario.id : undefined;
    const pool = SCENARIOS.filter((s) => s.id !== prev);
    const scenario = pool[Math.floor(Math.random() * pool.length)];
    const runId = randomUUID();
    runs.set(runId, { scenario, revealed: [], createdAt: Date.now(), closed: false });
    // Only the brief goes to the browser — never the scenario id or its facts.
    return send(res, 200, { runId, brief: BRIEF });
  }
  const run = typeof body.runId === 'string' ? runs.get(body.runId) : undefined;
  if (!run) return send(res, 404, { error: 'Unknown or expired run.' });
  if (path === '/api/discovery/ask') {
    if (run.closed) return send(res, 409, { error: 'This run has ended.' });
    const question = String(body.question ?? '').slice(0, 500);
    if (!question.trim()) return send(res, 400, { error: 'Empty question.' });
    const allowed = Object.values(run.scenario.facts);
    let reply: DiscoveryReply;
    const ctl = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ctl.abort(); });
    const live = isConfigured() && !rateLimited(req.socket.remoteAddress ?? 'local') ? await discoveryTurn(allowed, run.revealed, question, ctl.signal) : null;
    if (live) {
      // Server-side whitelist: only ids from this run's scenario can be revealed.
      const ids = live.revealed.filter((id) => allowed.some((f) => f.id === id));
      reply = { message: live.message, revealed: ids.map((id) => ({ id, text: allowed.find((f) => f.id === id)!.text })), mode: 'live' };
      run.revealed.push(...ids.filter((id) => !run.revealed.includes(id)));
    } else {
      const r = respondToQuestion(run.scenario, question, run.revealed);
      reply = { message: r.text, revealed: r.revealed.map((id) => ({ id, text: allowed.find((f) => f.id === id)!.text })), mode: 'authored' };
      run.revealed.push(...r.revealed.filter((id) => !run.revealed.includes(id)));
    }
    // Fact ids carry the scenario letter; the browser only sees the topic.
    return send(res, 200, { ...reply, revealed: reply.revealed.map((f) => ({ id: topicOf(f.id), text: f.text })) });
  }
  if (path === '/api/discovery/debrief') {
    run.closed = true;
    return send(res, 200, { scenarioId: run.scenario.id, label: run.scenario.label, priority: run.scenario.priority, revealed: run.revealed.map(topicOf), total: Object.keys(run.scenario.facts).length });
  }
  return send(res, 404, { error: 'not found' });
}

export const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/api/ai/status') {
      return send(res, 200, { configured: isConfigured(), model: isConfigured() ? MODEL : null, promptVersion: PROMPT_VERSION, discoveryAssessed: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/ai/run') return await handleAI(req, res);
    if (req.method === 'POST' && url.pathname.startsWith('/api/discovery/')) return await handleDiscovery(url.pathname, req, res);
    send(res, 404, { error: 'not found' });
  } catch (e) {
    log({ error: (e as Error).name, path: url.pathname });
    if (!res.headersSent) send(res, 500, { status: 'unavailable', reason: 'error', message: 'Server error.' });
  }
});

// Expire discovery runs after two hours.
setInterval(() => { for (const [k, r] of runs) if (Date.now() - r.createdAt > 7_200_000) runs.delete(k); }, 600_000).unref();

if (process.env.CALLBACK_NO_LISTEN !== '1') {
  server.listen(PORT, '127.0.0.1', () => log({ msg: `Callback API on http://127.0.0.1:${PORT}`, aiConfigured: isConfigured(), model: MODEL }));
}
