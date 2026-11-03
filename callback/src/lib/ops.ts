// Mutations on a Data draft. Revisions increment only when content actually changes.
import type { ConfirmedFact, Data, EvidenceLink, ID, Job, JobNeed, PrepTask, SourceDocument, Story } from './types';
import { makeSpan, normalize, nowIso, uid } from './text';
import { jdOf } from './derive';

export function upsertSource(d: Data, id: ID | null, kind: SourceDocument['kind'], title: string, text: string, jobId: ID | null): ID {
  const t = nowIso();
  if (id && d.sources[id]) {
    const s = d.sources[id];
    if (s.text !== text) {
      s.text = text;
      s.revision += 1;
      s.updatedAt = t;
    }
    s.title = title || s.title;
    return id;
  }
  const nid = uid('src');
  d.sources[nid] = { id: nid, kind, title, text, language: 'en', url: null, revision: 1, fictional: d.workspaceKind === 'demo', jobId, retrievedAt: null, createdAt: t, updatedAt: t };
  return nid;
}

export function saveResume(d: Data, text: string, filename: string | null) {
  d.profile.resumeSourceId = upsertSource(d, d.profile.resumeSourceId, 'resume', filename ?? 'Resume', text, null);
}

export function createJob(d: Data, init: Partial<Job> = {}): ID {
  const id = uid('job');
  d.jobs[id] = { id, company: '', role: '', level: '', url: '', location: '', status: 'researching', jdSourceId: null, archived: false, fictional: d.workspaceKind === 'demo', research: [], createdAt: nowIso(), ...init };
  d.currentJobId = id;
  return id;
}

export function saveJD(d: Data, jobId: ID, text: string, filename: string | null) {
  const job = d.jobs[jobId];
  job.jdSourceId = upsertSource(d, job.jdSourceId, 'jd', filename ?? 'Job description', text, jobId);
}

export function duplicateJob(d: Data, jobId: ID): ID {
  const j = d.jobs[jobId];
  const jd = jdOf(d, j);
  const id = createJob(d, { ...j, id: undefined as unknown as string, archived: false, role: (j.role || 'Untitled') + ' (copy)', research: j.research.map((r) => ({ ...r, id: uid('rc') })), jdSourceId: null });
  if (jd) saveJD(d, id, jd.text, jd.title);
  const newJd = jdOf(d, d.jobs[id]);
  for (const n of Object.values(d.needs).filter((x) => x.jobId === jobId)) {
    const nid = uid('need');
    d.needs[nid] = { ...n, id: nid, jobId: id, jdSpan: n.jdSpan && newJd ? makeSpan(newJd, n.jdSpan.quote) : null, jdRevision: newJd?.revision ?? 1 };
  }
  return id;
}

/** Deleting a job removes job-scoped records but never shared stories or facts. */
export function deleteJob(d: Data, jobId: ID) {
  const job = d.jobs[jobId];
  if (!job) return;
  if (job.jdSourceId) delete d.sources[job.jdSourceId];
  for (const s of Object.values(d.sources)) if (s.jobId === jobId) delete d.sources[s.id];
  for (const coll of [d.needs, d.links, d.rounds, d.materials] as Record<ID, { jobId: ID | null }>[]) for (const [k, v] of Object.entries(coll)) if (v.jobId === jobId) delete coll[k];
  for (const [k, v] of Object.entries(d.answers)) if (v.jobId === jobId) delete d.answers[k];
  for (const [k, v] of Object.entries(d.tasks)) if (v.jobId === jobId) delete d.tasks[k];
  for (const [k, v] of Object.entries(d.questions)) if (v.jobId === jobId) delete d.questions[k];
  delete d.jobs[jobId];
  if (d.currentJobId === jobId) d.currentJobId = Object.keys(d.jobs)[0] ?? null;
}

export function addNeed(d: Data, jobId: ID, title: string, quote: string | null, kind: JobNeed['kind'] = 'goal', basis: JobNeed['basis'] = 'explicit'): ID | null {
  const jd = jdOf(d, d.jobs[jobId]);
  const span = jd && quote ? makeSpan(jd, quote) : null;
  if (basis === 'explicit' && quote && !span) return null;
  const id = uid('need');
  const order = Object.values(d.needs).filter((n) => n.jobId === jobId).length;
  d.needs[id] = { id, jobId, title, kind, priority: order < 3 ? 'high' : 'medium', basis: span ? 'explicit' : 'interpretation', jdSpan: span, explanation: '', order, confirmed: true, jdRevision: jd?.revision ?? 1 };
  return id;
}

/** JD sentences as local need suggestions. Users decide which ones are needs. */
export function jdSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12 && s.length < 300);
}

export function newStory(d: Data, title: string, init: Partial<Story> = {}): ID {
  const id = uid('story');
  d.stories[id] = { id, title, category: 'work', context: '', role: '', actions: '', decision: '', result: '', howKnown: '', collaborators: '', dates: '', scope: '', qualifiers: [], themes: [], openQuestions: [], cues: [], revision: 1, fictional: d.workspaceKind === 'demo', ...init };
  return id;
}

export function bumpStory(d: Data, storyId: ID) {
  if (d.stories[storyId]) d.stories[storyId].revision += 1;
}

export function addFactFromSource(d: Data, storyId: ID, source: SourceDocument, quote: string): ConfirmedFact | null {
  const span = makeSpan(source, quote);
  if (!span) return null;
  const id = uid('fact');
  const sim = /simulat/i.test(quote);
  const f: ConfirmedFact = { id, storyId, text: span.quote, spans: [span], confirmed: true, origin: 'source', qualifiers: sim ? ['simulated'] : [], ownership: 'unclear', createdAt: nowIso() };
  d.facts[id] = f;
  bumpStory(d, storyId);
  return f;
}

/** A user-added fact is proposed (unconfirmed) until the user confirms it. */
export function proposeUserFact(d: Data, storyId: ID, text: string, ownership: ConfirmedFact['ownership'] = 'unclear'): ID {
  const id = uid('fact');
  d.facts[id] = { id, storyId, text, spans: [], confirmed: false, origin: 'user_added', qualifiers: ['self-reported'], ownership, createdAt: nowIso() };
  return id;
}

export function confirmFact(d: Data, factId: ID) {
  const f = d.facts[factId];
  if (!f || f.confirmed) return;
  f.confirmed = true;
  bumpStory(d, f.storyId);
}

export function removeFact(d: Data, factId: ID) {
  const f = d.facts[factId];
  if (!f) return;
  delete d.facts[factId];
  if (f.confirmed) bumpStory(d, f.storyId);
}

export function upsertLink(d: Data, l: Omit<EvidenceLink, 'id' | 'jdRevision' | 'storyRevision'> & { id?: ID }): ID {
  const jd = jdOf(d, d.jobs[l.jobId]);
  const id = l.id ?? uid('link');
  d.links[id] = { ...l, id, jdRevision: jd?.revision ?? 1, storyRevision: l.storyId ? d.stories[l.storyId]?.revision ?? 1 : 0 };
  return id;
}

/** Re-confirm a link against current revisions (after the user reviews it). */
export function refreshLink(d: Data, linkId: ID) {
  const l = d.links[linkId];
  if (!l) return;
  const jd = jdOf(d, d.jobs[l.jobId]);
  l.jdRevision = jd?.revision ?? l.jdRevision;
  if (l.storyId && d.stories[l.storyId]) l.storyRevision = d.stories[l.storyId].revision;
  l.factIds = l.factIds.filter((f) => d.facts[f]);
}

export function refreshNeed(d: Data, needId: ID) {
  const n = d.needs[needId];
  const jd = jdOf(d, d.jobs[n.jobId]);
  if (!jd) return;
  if (n.jdSpan) n.jdSpan = makeSpan(jd, n.jdSpan.quote);
  n.jdRevision = jd.revision;
}

/** Re-locate a fact's quote after its source changed. Returns false if the quote is gone. */
export function rematchFact(d: Data, factId: ID): boolean {
  const f = d.facts[factId];
  let ok = true;
  f.spans = f.spans.map((s) => {
    const src = d.sources[s.sourceId];
    const n = src ? makeSpan(src, s.quote) : null;
    if (!n) ok = false;
    return n ?? s;
  });
  return ok;
}

/** Words shared between a need and a fact. A local suggestion only — never evidence. */
export function sharedWords(a: string, b: string): string[] {
  const stop = new Set(['the', 'and', 'for', 'with', 'that', 'our', 'you', 'your', 'use', 'used', 'will', 'from', 'this', 'are', 'was', 'their', 'into', 'including', 'people', 'without']);
  const words = (s: string) => new Set(normalize(s).split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !stop.has(w)).map((w) => w.replace(/s$/, '')));
  const A = words(a);
  return [...words(b)].filter((w) => A.has(w));
}

export function addTask(d: Data, t: Omit<PrepTask, 'id' | 'createdAt' | 'key' | 'status' | 'pinned'> & Partial<PrepTask>): ID {
  // no duplicates: same type + same targets + same title
  const dup = Object.values(d.tasks).find((x) => x.status === 'todo' && x.type === t.type && x.title === t.title && x.jobId === t.jobId);
  if (dup) return dup.id;
  const id = uid('task');
  const key = 'T' + String(Object.keys(d.tasks).length + 1).padStart(3, '0');
  d.tasks[id] = { status: 'todo', pinned: false, key, createdAt: nowIso(), ...t, id } as PrepTask;
  return id;
}
