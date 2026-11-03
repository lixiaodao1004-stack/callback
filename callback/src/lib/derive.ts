// Derived state. Staleness is computed from stored input revisions rather than propagated,
// so an edit anywhere can never leave a dependent record silently "fresh".
import type { AnswerVersion, Data, EvidenceLink, Feedback, ID, Job, MaterialVersion, Session, SourceDocument, TranscriptVersion } from './types';
import { checkSpan } from './text';

export function jdOf(d: Data, job: Job | undefined): SourceDocument | undefined {
  return job?.jdSourceId ? d.sources[job.jdSourceId] : undefined;
}

export function linkValidation(d: Data, l: EvidenceLink): 'valid' | 'unverified' | 'stale' {
  const job = d.jobs[l.jobId];
  const jd = jdOf(d, job);
  if (jd && jd.revision !== l.jdRevision) return 'stale';
  if (l.storyId) {
    const st = d.stories[l.storyId];
    if (!st) return 'stale';
    if (st.revision !== l.storyRevision) return 'stale';
  }
  for (const fid of l.factIds) {
    const f = d.facts[fid];
    if (!f) return 'stale';
    for (const s of f.spans) if (checkSpan(s, d.sources[s.sourceId]).status === 'unverified') return 'unverified';
  }
  const need = d.needs[l.needId];
  if (need?.jdSpan && checkSpan(need.jdSpan, d.sources[need.jdSpan.sourceId]).status === 'unverified') return 'unverified';
  return 'valid';
}

export function needIsStale(d: Data, needId: ID): boolean {
  const n = d.needs[needId];
  if (!n) return true;
  const jd = jdOf(d, d.jobs[n.jobId]);
  return !!jd && jd.revision !== n.jdRevision;
}

export function answerIsStale(d: Data, a: AnswerVersion): boolean {
  if (a.storyId && a.storyRevision !== null) {
    const st = d.stories[a.storyId];
    if (!st || st.revision !== a.storyRevision) return true;
  }
  return a.factIds.some((f) => !d.facts[f]);
}

export function materialIsStale(d: Data, m: MaterialVersion): boolean {
  for (const [sid, rev] of Object.entries(m.storyRevisions)) if (d.stories[sid]?.revision !== rev) return true;
  if (m.jdRevision !== null) {
    const jd = jdOf(d, d.jobs[m.jobId]);
    if (jd && jd.revision !== m.jdRevision) return true;
  }
  return m.factIds.some((f) => !d.facts[f]);
}

export function latestTranscript(d: Data, turnId: ID): TranscriptVersion | undefined {
  return Object.values(d.transcripts)
    .filter((t) => t.turnId === turnId)
    .sort((a, b) => b.version - a.version)[0];
}

export function feedbackIsStale(d: Data, f: Feedback): boolean {
  if (f.transcriptVersionId) {
    const latest = latestTranscript(d, f.turnId);
    if (latest && latest.id !== f.transcriptVersionId) return true;
  }
  const s = d.sessions[f.sessionId];
  const t = s?.turns.find((x) => x.id === f.turnId);
  if (t && !f.transcriptVersionId && t.text.trim() !== f.answerText.trim()) return true;
  return Object.values(d.feedback).some((o) => o.supersedes === f.id);
}

export function feedbackFor(d: Data, turnId: ID): Feedback[] {
  return Object.values(d.feedback)
    .filter((f) => f.turnId === turnId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function currentFeedback(d: Data, turnId: ID): Feedback | undefined {
  const list = feedbackFor(d, turnId).filter((f) => !Object.values(d.feedback).some((o) => o.supersedes === f.id));
  return list[list.length - 1];
}

/** The answer text a feedback should evaluate: the latest corrected transcript if any. */
export function evaluableText(d: Data, s: Session, turnId: ID): { text: string; transcriptVersionId: ID | null } {
  const tv = latestTranscript(d, turnId);
  if (tv) return { text: tv.text, transcriptVersionId: tv.id };
  return { text: s.turns.find((t) => t.id === turnId)?.text ?? '', transcriptVersionId: null };
}

export function firstAnswerTurn(s: Session, mainIndex = 0) {
  return s.turns.find((t) => t.kind === 'answer' && t.mainIndex === mainIndex);
}
export function retryTurn(s: Session, mainIndex = 0) {
  return s.turns.find((t) => t.kind === 'retry' && t.mainIndex === mainIndex);
}

export type Comparability = { eligible: true } | { eligible: false; reasons: string[] };

/** Server-side rule in the spec; here a pure function used by every comparison view. */
export function comparability(a: Feedback | undefined, b: Feedback | undefined, sameQuestion: boolean): Comparability {
  const reasons: string[] = [];
  if (!a || !b) return { eligible: false, reasons: ['One of the answers has no evaluation yet.'] };
  if (!sameQuestion) reasons.push('Different questions.');
  if (a.rubricVersion !== b.rubricVersion) reasons.push('Different rubric versions.');
  if (a.mode !== b.mode) reasons.push(`Different evaluation modes (${modeLabel(a.mode)} vs ${modeLabel(b.mode)}).`);
  if (a.assisted !== b.assisted) reasons.push('Assistance conditions differ (reference answer was viewed before one attempt).');
  if (reasons.length) return { eligible: false, reasons };
  return { eligible: true };
}

export function modeLabel(m: Feedback['mode']): string {
  return m === 'prepared_example' ? 'Prepared example' : m === 'self_review' ? 'Self-review' : 'Live AI';
}

export function jobScoped<T extends { jobId: ID | null }>(items: Record<ID, T>, jobId: ID | null): T[] {
  return Object.values(items).filter((x) => x.jobId === jobId);
}

export function needsForJob(d: Data, jobId: ID | null) {
  return Object.values(d.needs)
    .filter((n) => n.jobId === jobId)
    .sort((a, b) => a.order - b.order);
}

export function factsForStory(d: Data, storyId: ID) {
  return Object.values(d.facts).filter((f) => f.storyId === storyId);
}

export function activeJobs(d: Data) {
  return Object.values(d.jobs).filter((j) => !j.archived);
}
