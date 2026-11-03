import { useState } from 'react';
import { useStore } from '../lib/store';
import type { DiagnosticRun, ID, Job, MaterialVersion, ResearchClaim } from '../lib/types';
import type { CoachOut, DiagnosisOut, MatchOut, MaterialOut, NeedsOut, ResearchOut, TasksOut } from '../lib/ai/types';
import { buildEnvelope, revisionKey, textSource, useAIStatus, useAITask } from '../lib/ai/client';
import { AIBusy, AIModeBadge, AIOutcome } from '../ui/AIBits';
import { Badge, REL_LABEL, RelBadge } from '../ui/kit';
import { addNeed, addTask, proposeUserFact, upsertLink } from '../lib/ops';
import { jdOf, needsForJob, linkValidation } from '../lib/derive';
import { makeSpan, nowIso, uid } from '../lib/text';
import { snapshotRevisions } from '../lib/materials';

function useLive() {
  const s = useAIStatus();
  return s.configured;
}

// ---------------- Value map: A1 needs + A2 evidence ----------------
export function AIValueMapPanel({ job }: { job: Job }) {
  const { d, mutate } = useStore();
  const live = useLive();
  const needsTask = useAITask<NeedsOut>();
  const matchTask = useAITask<MatchOut>();
  const jd = jdOf(d, job);
  const storyIds = Object.keys(d.stories);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  if (!live) return <div className="row small"><AIModeBadge /><span className="muted">AI suggestions appear here when the backend is configured.</span></div>;

  const runNeeds = () => jd && needsTask.run(buildEnvelope(d, 'extract_needs', { jobId: job.id, sourceIds: [jd.id], payload: {} }), () => revisionKey(d, job.id));
  const runMatch = () => matchTask.run(buildEnvelope(d, 'match_evidence', { jobId: job.id, storyIds, includeNeeds: true, payload: {} }), () => revisionKey(d, job.id, storyIds));
  const nr = needsTask.result?.status === 'ok' ? needsTask.result : null;
  const mr = matchTask.result?.status === 'ok' ? matchTask.result : null;

  return (
    <section className="card soft">
      <div className="row between"><h3 style={{ margin: 0 }}>AI suggestions</h3><AIModeBadge /></div>
      <p className="small muted">Proposals only. Nothing is added until you accept it; persistent IDs are assigned by Callback.</p>
      <div className="row">
        <button className="btn small" disabled={!jd || needsTask.busy} onClick={runNeeds}>Suggest job needs</button>
        <button className="btn small" disabled={!storyIds.length || !needsForJob(d, job.id).length || matchTask.busy} onClick={runMatch}>Suggest evidence for each need</button>
        <AIBusy busy={needsTask.busy || matchTask.busy} onCancel={() => { needsTask.cancel(); matchTask.cancel(); }} />
      </div>
      <AIOutcome result={needsTask.result} staleNotice={needsTask.staleNotice} onRetry={runNeeds} />
      <AIOutcome result={matchTask.result} staleNotice={matchTask.staleNotice} onRetry={runMatch} />
      {nr && (
        <div style={{ marginTop: 10 }}>
          <h4>Proposed needs</h4>
          {nr.data.needs.length === 0 && <p className="small">No distinct needs found.</p>}
          <ul className="check-list">
            {nr.data.needs.map((n) => {
              const quote = n.jd_refs[0]?.quote ?? null;
              const exists = needsForJob(d, job.id).some((x) => x.title === n.title);
              return (
                <li key={n.local_key} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <div className="row"><strong>{n.title}</strong><Badge>{n.kind}</Badge><Badge tone={n.priority === 'high' ? 'green' : 'neutral'}>{n.priority}</Badge>{n.basis === 'interpretation' ? <Badge tone="warn">Interpretation</Badge> : n.verified ? <Badge tone="green">✓ JD quote verified</Badge> : <Badge tone="danger">Source could not be verified</Badge>}</div>
                  {quote && <div className="small quote">“{quote}”</div>}
                  <div className="small muted">{n.explanation}</div>
                  <button className="btn small" disabled={exists || accepted.has(n.local_key)} onClick={() => { mutate((x) => { const id = addNeed(x, job.id, n.title, n.verified ? quote : null, n.kind, n.verified && n.basis === 'explicit' ? 'explicit' : 'interpretation'); if (id) { x.needs[id].priority = n.priority; x.needs[id].explanation = n.explanation; } }); setAccepted(new Set([...accepted, n.local_key])); }}>{exists || accepted.has(n.local_key) ? 'Added' : 'Accept'}</button>
                </li>
              );
            })}
          </ul>
          {nr.data.clarify_questions.length > 0 && <><h4>Questions to clarify with the employer</h4><ul className="small">{nr.data.clarify_questions.map((q) => <li key={q}>{q}</li>)}</ul></>}
        </div>
      )}
      {mr && (
        <div style={{ marginTop: 10 }}>
          <h4>Proposed evidence links</h4>
          <ul className="check-list">
            {mr.data.links.map((l, i) => {
              const exists = Object.values(d.links).some((x) => x.needId === l.need_id && x.storyId === l.story_id_or_null && linkValidation(d, x) !== 'stale');
              return (
                <li key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <div className="row"><strong>{d.needs[l.need_id]?.title}</strong> ← {l.story_id_or_null ? d.stories[l.story_id_or_null]?.title : '—'} <RelBadge r={l.relationship} /></div>
                  {l.fact_ids.map((f) => <div key={f} className="small quote">“{d.facts[f]?.text}”</div>)}
                  <div className="small">{l.reason}</div>
                  {l.next_question && <div className="small muted">Prepare next: {l.next_question}</div>}
                  <button className="btn small" disabled={exists} onClick={() => mutate((x) => { upsertLink(x, { jobId: job.id, needId: l.need_id, storyId: l.story_id_or_null, factIds: l.fact_ids, relationship: l.relationship, reason: l.reason, qualifierNote: '', nextQuestion: l.next_question, review: 'proposed' }); })}>{exists ? 'Already linked' : `Add for review (${REL_LABEL[l.relationship]})`}</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

// ---------------- Story coach: A3 ----------------
export function AIStoryCoach({ storyId }: { storyId: ID }) {
  const { d, mutate } = useStore();
  const live = useLive();
  const task = useAITask<CoachOut>();
  const [answer, setAnswer] = useState('');
  const [answerSourceId, setAnswerSourceId] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());
  if (!live) return null;
  const story = d.stories[storyId];
  const need = Object.values(d.links).find((l) => l.storyId === storyId);
  async function ask() {
    let sid = answerSourceId;
    if (answer.trim()) {
      // Save the reply as its own source so proposed facts can be quoted from it.
      sid = uid('src');
      const id = sid;
      mutate((x) => { x.sources[id] = { id, kind: 'candidate_input', title: `Coach reply — ${story.title}`, text: answer.trim(), language: x.profile.preferredLanguage, url: null, revision: 1, fictional: x.workspaceKind === 'demo', jobId: null, retrievedAt: null, createdAt: nowIso(), updatedAt: nowIso() }; });
      setAnswerSourceId(sid);
    }
    const lastQ = task.result?.status === 'ok' ? task.result.data.next_question_or_null : null;
    const extra = sid && answer.trim() ? [textSource(sid, answer.trim(), 'candidate_input')] : [];
    await task.run(buildEnvelope(d, 'story_coach', { jobId: need?.jobId ?? null, storyIds: [storyId], extraSources: extra, payload: { story_id: storyId, target_need: need ? d.needs[need.needId]?.title : null, previous_question: lastQ, preferred_language: d.profile.preferredLanguage } }), () => revisionKey(d, need?.jobId ?? null, [storyId]));
    setAdded(new Set());
  }
  const r = task.result?.status === 'ok' ? task.result.data : null;
  return (
    <div className="card flat" style={{ marginTop: 10 }}>
      <div className="row between"><strong>AI coach</strong><AIModeBadge /></div>
      {r?.next_question_or_null && <p><strong>{r.next_question_or_null}</strong></p>}
      <textarea aria-label="Reply to the AI coach" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={r ? 'Reply in any language…' : 'Optional: share a detail, or just ask for the next question.'} />
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn small primary" disabled={task.busy} onClick={ask}>{r ? 'Send reply' : 'Ask the AI coach'}</button>
        <AIBusy busy={task.busy} onCancel={task.cancel} />
      </div>
      <AIOutcome result={task.result} staleNotice={task.staleNotice} onRetry={ask} />
      {r && r.proposed_facts.length > 0 && (
        <ul className="check-list" style={{ marginTop: 8 }}>
          {r.proposed_facts.map((p, i) => (
            <li key={i} style={{ padding: '4px 0' }}>
              <div>{p.text} {p.verified ? <Badge tone="info">Quoted from your reply</Badge> : <Badge tone="danger">Source could not be verified</Badge>} <Badge>{p.ownership}</Badge></div>
              <button className="btn small" disabled={added.has(i)} onClick={() => { mutate((x) => { const fid = proposeUserFact(x, storyId, p.text, p.ownership); const ref = p.source_refs[0]; const src = ref ? x.sources[ref.source_id] : undefined; const span = src && p.verified ? makeSpan(src, ref.quote) : null; if (span) x.facts[fid].spans = [span]; x.facts[fid].qualifiers = [...new Set(['self-reported', ...p.qualifiers])]; }); setAdded(new Set([...added, i])); }}>{added.has(i) ? 'Proposed — confirm it below' : 'Propose as fact'}</button>
            </li>
          ))}
        </ul>
      )}
      {r && r.unresolved.length > 0 && <p className="small muted">Still unresolved: {r.unresolved.join(' · ')}</p>}
    </div>
  );
}

// ---------------- Research: A9 ----------------
export function AIResearchPanel({ job }: { job: Job }) {
  const { d, mutate } = useStore();
  const live = useLive();
  const task = useAITask<ResearchOut>();
  const [added, setAdded] = useState<Set<string>>(new Set());
  if (!live) return null;
  const sources = Object.values(d.sources).filter((s) => (s.kind === 'research' && s.jobId === job.id) || s.id === job.jdSourceId);
  const run = () => task.run(buildEnvelope(d, 'research_summary', { jobId: job.id, sourceIds: sources.map((s) => s.id), payload: { source_dates: Object.fromEntries(sources.map((s) => [s.id, s.retrievedAt ?? null])) }, revisionExtra: sources.map((s) => `${s.id}@${s.revision}`).join(',') }), () => revisionKey(d, job.id, [], sources.map((s) => `${s.id}@${s.revision}`).join(',')));
  const r = task.result?.status === 'ok' ? task.result.data : null;
  const add = (key: string, text: string, label: ResearchClaim['label'], section: ResearchClaim['section'], sourceId: string | null) => { mutate((x) => { x.jobs[job.id].research.push({ id: uid('rc'), text, label, section, sourceId }); }); setAdded(new Set([...added, key])); };
  return (
    <section className="card soft">
      <div className="row between"><h3 style={{ margin: 0 }}>Summarize sources with AI</h3><AIModeBadge /></div>
      <p className="small muted">Uses only the {sources.length} source(s) you saved (JD + pasted excerpts). No web search.</p>
      <div className="row"><button className="btn small" disabled={!sources.length || task.busy} onClick={run}>Summarize</button><AIBusy busy={task.busy} onCancel={task.cancel} /></div>
      <AIOutcome result={task.result} staleNotice={task.staleNotice} onRetry={run} />
      {r && (
        <div className="stack" style={{ marginTop: 8 }}>
          {r.claims.map((c, i) => {
            const src = c.source_refs[0]?.source_id;
            const label: ResearchClaim['label'] = !c.verified ? 'not_verified' : src === job.jdSourceId ? 'jd_explicit' : 'source_backed';
            return <div key={i} className="row small"><span style={{ flex: 1 }}>{c.text} {c.verified ? <Badge tone="green">✓ excerpt verified</Badge> : <Badge tone="danger">Not verified</Badge>} {c.as_of_or_null && <span className="muted">as of {c.as_of_or_null}</span>}</span><button className="btn small" disabled={added.has('c' + i)} onClick={() => add('c' + i, c.text, label, 'company', c.verified ? src ?? null : null)}>Save note</button></div>;
          })}
          {r.hypotheses.map((h, i) => <div key={'h' + i} className="row small"><span style={{ flex: 1 }}>{h.text} <Badge tone="warn">Hypothesis</Badge> <span className="muted">{h.basis}</span></span><button className="btn small" disabled={added.has('h' + i)} onClick={() => add('h' + i, h.text, 'hypothesis', 'topics', null)}>Save</button></div>)}
          {r.questions_to_ask.map((q, i) => <div key={'q' + i} className="row small"><span style={{ flex: 1 }}>{q} <Badge>Question to ask</Badge></span><button className="btn small" disabled={added.has('q' + i)} onClick={() => add('q' + i, q, 'hypothesis', 'questions', null)}>Save</button></div>)}
          {r.unknowns.length > 0 && <p className="small muted">Not covered by your sources: {r.unknowns.join(' · ')}</p>}
        </div>
      )}
    </section>
  );
}

// ---------------- Materials: A10 ----------------
export function AIMaterialPanel({ job, type, existing, onDone }: { job: Job; type: MaterialVersion['type']; existing: string; onDone: () => void }) {
  const { d, mutate } = useStore();
  const live = useLive();
  const task = useAITask<MaterialOut>();
  if (!live) return null;
  const storyIds = [...new Set(Object.values(d.links).filter((l) => l.jobId === job.id && l.storyId && linkValidation(d, l) === 'valid').map((l) => l.storyId!))];
  const research = Object.values(d.sources).filter((s) => (s.kind === 'research' && s.jobId === job.id) || s.id === job.jdSourceId).map((s) => s.id);
  const run = () => task.run(buildEnvelope(d, 'material_draft', { jobId: job.id, storyIds, sourceIds: research, includeNeeds: true, payload: { material_type: type, target_job: `${job.role} at ${job.company}`, existing_text: existing, candidate_name: d.profile.name } }), () => revisionKey(d, job.id, storyIds));
  const r = task.result?.status === 'ok' ? task.result.data : null;
  const text = r ? r.sections.map((s) => (s.label ? `${s.label}\n${s.text}` : s.text)).join('\n\n') : '';
  return (
    <div className="card soft flat" style={{ marginTop: 10 }}>
      <div className="row"><button className="btn small" disabled={task.busy} onClick={run}>Draft with AI</button><AIModeBadge /><AIBusy busy={task.busy} onCancel={task.cancel} /></div>
      <AIOutcome result={task.result} staleNotice={task.staleNotice} onRetry={run} />
      {r && (
        <>
          <pre className="source-text small" style={{ marginTop: 8 }}>{text}</pre>
          {r.changes.length > 0 && <details><summary className="small">What changed and why ({r.changes.length})</summary><ul className="small">{r.changes.map((c, i) => <li key={i}><s>{c.before}</s> → {c.after} <span className="muted">— {c.reason}</span></li>)}</ul></details>}
          {r.unresolved.length > 0 && <p className="small" style={{ color: 'var(--warn)' }}>Unresolved: {r.unresolved.join(' · ')}</p>}
          <button className="btn small primary" onClick={() => { const fids = [...new Set(r.sections.flatMap((s) => s.claims.flatMap((c) => c.fact_ids)))]; mutate((x) => { const n = Object.values(x.materials).filter((m) => m.jobId === job.id && m.type === type).length; const id = uid('mat'); x.materials[id] = { id, jobId: job.id, type, title: `${type} (AI draft)`, text, factIds: fids, ...snapshotRevisions(x, job.id, storyIds), version: n + 1, createdAt: nowIso() }; }); onDone(); }}>Save as new version</button>
        </>
      )}
    </div>
  );
}

// ---------------- Plan: A11 ----------------
export function AIPlanPanel({ jobId }: { jobId: ID | null }) {
  const { d, mutate } = useStore();
  const live = useLive();
  const task = useAITask<TasksOut>();
  const [done, setDone] = useState(false);
  if (!live || !jobId) return null;
  const storyIds = Object.keys(d.stories);
  const questionIds = Object.values(d.questions).filter((q) => q.jobId === jobId || q.origin !== 'seed').map((q) => q.id).concat(Object.keys(d.questions).filter((k) => k.startsWith('q_seed')));
  const sessions = Object.values(d.sessions).filter((s) => s.jobId === jobId).map((s) => ({ question_id: s.questionIds[0], need_id: s.needId, state: s.state, retry_done: s.turns.some((t) => t.kind === 'retry' && !t.skipped) }));
  const run = () => { setDone(false); return task.run(buildEnvelope(d, 'propose_tasks', { jobId, storyIds, includeNeeds: true, payload: { question_ids: questionIds, practice_observations: sessions, existing_task_titles: Object.values(d.tasks).filter((t) => t.jobId === jobId).map((t) => t.title) } }), () => revisionKey(d, jobId, storyIds)); };
  const r = task.result?.status === 'ok' ? task.result.data : null;
  return (
    <div className="card soft flat" style={{ marginTop: 10 }}>
      <div className="row"><button className="btn small" disabled={task.busy} onClick={run}>Propose tasks with AI</button><AIModeBadge /><AIBusy busy={task.busy} onCancel={task.cancel} /></div>
      <p className="small muted">AI suggests task candidates; the scheduler above still decides what fits your budget.</p>
      <AIOutcome result={task.result} staleNotice={task.staleNotice} onRetry={run} />
      {r && (
        <>
          <ul className="small">{r.tasks.map((t) => <li key={t.local_key}>{t.title} · {t.estimated_minutes} min <span className="muted">— {t.reason}{t.prerequisite_local_keys.length ? ` (after ${t.prerequisite_local_keys.join(', ')})` : ''}</span></li>)}</ul>
          {r.missing_context.length > 0 && <p className="small muted">Missing context: {r.missing_context.join(' · ')}</p>}
          <button className="btn small primary" disabled={done || !r.tasks.length} onClick={() => { mutate((x) => { const map = new Map<string, string>(); for (const t of r.tasks) { const id = addTask(x, { jobId, title: t.title, type: t.task_type, minutes: t.estimated_minutes, rationale: `AI suggestion: ${t.reason}`, prerequisites: [], needIds: t.need_ids, storyIds: t.story_ids, questionId: t.question_id_or_null, importance: 3, source: 'rule' }); map.set(t.local_key, id); } for (const t of r.tasks) { const id = map.get(t.local_key)!; x.tasks[id].prerequisites = t.prerequisite_local_keys.map((k) => map.get(k)!).filter(Boolean); } }); setDone(true); }}>{done ? 'Added' : `Add ${r.tasks.length} task(s)`}</button>
        </>
      )}
    </div>
  );
}

// ---------------- Diagnosis: A7 ----------------
export function AIDiagnosisPanel({ run: dr, onSuggest }: { run: DiagnosticRun; onSuggest: (focus: DiagnosisOut['suggested_focus']) => void }) {
  const { d } = useStore();
  const live = useLive();
  const task = useAITask<DiagnosisOut>();
  if (!live) return null;
  const storyIds = dr.storyId ? [dr.storyId] : [];
  const extra = [textSource('original', dr.original), ...(dr.retry ? [textSource('retry', dr.retry)] : []), ...(dr.supplement ? [textSource('supplement', dr.supplement, 'candidate_input')] : [])];
  const run = () => task.run(buildEnvelope(d, 'practice_diagnosis', { jobId: null, storyIds, extraSources: extra, payload: { question: d.questions[dr.questionId ?? '']?.text, self_report: dr.difficulty.split('|').filter(Boolean), supplement_declined: dr.supplementDeclined, cue: dr.cue, facts_available_at_original: dr.factsAtOriginal, facts_available_at_retry: dr.factsAtRetry, new_fact_ids_added_between_attempts: dr.confirmedNewFactIds, later_prompt: dr.laterPrompt, later_answer: dr.laterAnswer }, revisionExtra: dr.id }), () => revisionKey(d, null, storyIds, dr.id));
  const r = task.result?.status === 'ok' ? task.result.data : null;
  return (
    <section className="card">
      <div className="row between"><h3 style={{ margin: 0 }}>AI observations</h3><AIModeBadge /></div>
      <div className="row" style={{ marginTop: 6 }}><button className="btn small" disabled={task.busy} onClick={run}>Analyze my attempts</button><AIBusy busy={task.busy} onCancel={task.cancel} /></div>
      <AIOutcome result={task.result} staleNotice={task.staleNotice} onRetry={run} />
      {r && (
        <>
          <p className="small"><Badge tone="neutral">{r.certainty === 'tentative' ? 'Tentative' : 'Insufficient evidence'}</Badge> — one session supports tentative suggestions only.</p>
          <ul className="small">{r.observations.map((o, i) => <li key={i}>{o.text}{o.answer_refs[0] && <> — <span className="quote">“{o.answer_refs[0].quote}”</span></>}</li>)}</ul>
          {r.confounds.length > 0 && <p className="small"><strong>Confounds:</strong> {r.confounds.join(' · ')}</p>}
          {r.suggested_focus.length > 0 && <button className="btn small" onClick={() => onSuggest(r.suggested_focus)}>Use these as suggestions below (you still choose)</button>}
        </>
      )}
    </section>
  );
}

