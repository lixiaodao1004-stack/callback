// Browser side of the AI adapter. Talks only to /api; never sees a key.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AIResult, AITask, Envelope, EnvFact, EnvSource, EnvStory, EnvNeed, DiscoveryReply } from './types';
import type { Data, ID } from '../types';
import { jdOf } from '../derive';

export interface AIStatus {
  configured: boolean;
  model: string | null;
  offline: boolean; // backend not reachable
  checked: boolean;
}

let statusCache: AIStatus = { configured: false, model: null, offline: false, checked: false };
const listeners = new Set<(s: AIStatus) => void>();

export async function refreshAIStatus(): Promise<AIStatus> {
  try {
    const r = await fetch('/api/ai/status', { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { configured: boolean; model: string | null };
    statusCache = { configured: j.configured, model: j.model, offline: false, checked: true };
  } catch {
    statusCache = { configured: false, model: null, offline: true, checked: true };
  }
  listeners.forEach((l) => l(statusCache));
  return statusCache;
}

export function useAIStatus(): AIStatus {
  const [s, setS] = useState(statusCache);
  useEffect(() => {
    listeners.add(setS);
    if (!statusCache.checked) void refreshAIStatus();
    return () => { listeners.delete(setS); };
  }, []);
  return s;
}

export const UNAVAILABLE_TEXT = 'AI feedback is unavailable right now. Your work is saved. Continue with self-review or retry.';

export async function runAI<T>(env: Envelope, signal?: AbortSignal): Promise<AIResult<T>> {
  try {
    const r = await fetch('/api/ai/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(env), signal });
    const j = (await r.json()) as AIResult<T>;
    return j;
  } catch (e) {
    if ((e as Error).name === 'AbortError') return { status: 'unavailable', reason: 'cancelled', message: 'Request cancelled.' };
    return { status: 'unavailable', reason: 'error', message: 'The AI backend is not reachable.' };
  }
}

/**
 * One task at a time per hook. Ignores repeat clicks while busy, supports cancel, and drops a
 * response whose input revision no longer matches the current one (late response after a switch).
 */
export function useAITask<T>() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult<T> | null>(null);
  const [staleNotice, setStaleNotice] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const run = useCallback(async (env: Envelope, currentRevision: () => string): Promise<AIResult<T> | null> => {
    if (ctl.current) return null; // duplicate submission
    const c = new AbortController();
    ctl.current = c;
    setBusy(true);
    setStaleNotice(false);
    try {
      const r = await runAI<T>(env, c.signal);
      if (c.signal.aborted) return null;
      if (r.status !== 'unavailable' && r.meta.inputRevision !== currentRevision()) {
        setStaleNotice(true);
        setResult(null);
        return null;
      }
      setResult(r);
      return r;
    } finally {
      ctl.current = null;
      setBusy(false);
    }
  }, []);
  const cancel = useCallback(() => { ctl.current?.abort(); ctl.current = null; setBusy(false); }, []);
  useEffect(() => () => ctl.current?.abort(), []);
  return { run, cancel, busy, result, setResult, staleNotice };
}

// --------------------------- envelope building ---------------------------
/** Revision key for the inputs a task depends on. Any edit changes it. */
export function revisionKey(d: Data, jobId: ID | null, storyIds: ID[] = [], extra = ''): string {
  const jd = jobId ? jdOf(d, d.jobs[jobId]) : undefined;
  const resume = d.profile.resumeSourceId ? d.sources[d.profile.resumeSourceId] : undefined;
  const st = storyIds.map((s) => `${s}@${d.stories[s]?.revision ?? 0}`).join(',');
  return `${jobId ?? '-'}|jd${jd?.revision ?? 0}|cv${resume?.revision ?? 0}|${st}|${extra}`;
}

export interface EnvOptions {
  jobId: ID | null;
  sourceIds?: ID[];
  extraSources?: EnvSource[];
  storyIds?: ID[];
  includeNeeds?: boolean;
  payload: Record<string, unknown>;
  revisionExtra?: string;
}

/** Send only what the task needs: the selected stories and their confirmed facts, not the archive. */
export function buildEnvelope(d: Data, task: AITask, o: EnvOptions): Envelope {
  const storyIds = o.storyIds ?? [];
  const sources: EnvSource[] = (o.sourceIds ?? []).map((id) => d.sources[id]).filter(Boolean).map((s) => ({ id: s.id, revision: s.revision, kind: s.kind, text: s.text, language: s.language, url_or_null: s.url }));
  const facts: EnvFact[] = Object.values(d.facts)
    .filter((f) => storyIds.includes(f.storyId) && f.confirmed)
    .map((f) => ({ id: f.id, text: f.text, source_refs: f.spans.map((sp) => ({ source_id: sp.sourceId, revision: sp.revision, quote: sp.quote })), confirmed_by_user: f.confirmed, qualifiers: f.qualifiers, ownership: f.ownership, story_id: f.storyId }));
  const stories: EnvStory[] = storyIds.map((id) => d.stories[id]).filter(Boolean).map((s) => ({ id: s.id, title: s.title, fields: { context: s.context, role: s.role, actions: s.actions, decision: s.decision, result: s.result, how_known: s.howKnown, collaborators: s.collaborators, dates: s.dates, scope: s.scope, qualifiers: s.qualifiers.join(', '), open_questions: s.openQuestions.join(' | ') } }));
  const job_needs: EnvNeed[] = o.includeNeeds && o.jobId ? Object.values(d.needs).filter((n) => n.jobId === o.jobId).sort((a, b) => a.order - b.order).map((n) => ({ id: n.id, title: n.title, kind: n.kind, basis: n.basis, jd_quote: n.jdSpan?.quote ?? null })) : [];
  return {
    task_id: task,
    job_id: o.jobId,
    input_revision: revisionKey(d, o.jobId, storyIds, o.revisionExtra),
    locale: d.profile.practiceLanguage,
    mode: 'live',
    sources: [...sources, ...(o.extraSources ?? [])],
    facts,
    stories,
    job_needs,
    task_payload: o.payload,
  };
}

export function textSource(id: string, text: string, kind = 'answer'): EnvSource {
  return { id, revision: 1, kind, text, language: 'en', url_or_null: null };
}

// --------------------------- discovery (server-held scenario) ---------------------------
export async function discoveryStart(previousRunId: string | null): Promise<{ runId: string; brief: string } | null> {
  try {
    const r = await fetch('/api/discovery/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ previousRunId }) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
export async function discoveryAsk(runId: string, question: string): Promise<DiscoveryReply | null> {
  try {
    const r = await fetch('/api/discovery/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId, question }) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
export async function discoveryDebrief(runId: string): Promise<{ scenarioId: string; label: string; priority: string; revealed: string[]; total: number } | null> {
  try {
    const r = await fetch('/api/discovery/debrief', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId }) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
