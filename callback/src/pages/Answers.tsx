import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import type { AnswerVersion, Job } from '../lib/types';
import { Badge, Banner, Field, ModeTag } from '../ui/kit';
import { answerIsStale, factsForStory, needsForJob } from '../lib/derive';
import { localFactSignals, nowIso, speakingSeconds, uid, wordCount } from '../lib/text';
import { FORMAT_LABEL, HYPOTHETICAL_FORMATS } from '../lib/questions';
import { download } from '../lib/materials';
import { addDays, todayLocal } from '../lib/text';
import type { DraftOut, EvalOut } from '../lib/ai/types';
import { buildEnvelope, revisionKey, textSource, useAIStatus, useAITask } from '../lib/ai/client';
import { AIBusy, AIOutcome } from '../ui/AIBits';

const LENGTH_TARGET: Record<AnswerVersion['length'], [number, number, string]> = {
  short: [30, 60, 'about 30–60 seconds'],
  standard: [60, 120, 'about 1–2 minutes'],
  deep: [120, 180, 'about 2–3 minutes'],
};

const RUBRIC_ANCHORS = {
  relevance: ['Does not address the question', 'Partly addresses it', 'Directly addresses it with relevant content', 'Prioritizes what matters and connects it to the role'],
  evidence_ownership: ['General claims only', 'Specific example; unclear personal action or outcome', 'Clear personal action and a concrete outcome', 'Action, outcome, and how it is known are clear, with appropriate scope'],
  organization: ['Hard to follow', 'Recognizable sequence with missing links', 'Coherent and complete', 'Main point and reasoning easy to follow, no excess detail'],
  clear_language: ['Meaning often unclear', 'Understandable but complex or repetitive', 'Mostly clear and concise', 'Precise, economical wording'],
} as const;
export { RUBRIC_ANCHORS };

export function AnswersTab({ job }: { job: Job }) {
  const { d, p, mutate } = useStore();
  const needs = needsForJob(d, job.id);
  const questions = Object.values(d.questions).filter((q) => q.jobId === job.id || q.jobId === null);
  const [qid, setQid] = useState(questions.find((q) => q.jobId === job.id)?.id ?? questions[0]?.id ?? '');
  const q = d.questions[qid];
  const [needId, setNeedId] = useState(q?.needId ?? needs[0]?.id ?? '');
  const linkedStoryIds = Object.values(d.links).filter((l) => l.needId === needId && l.storyId).map((l) => l.storyId!);
  const [storyId, setStoryId] = useState(linkedStoryIds[0] ?? '');
  const facts = storyId ? factsForStory(d, storyId).filter((f) => f.confirmed) : [];
  const [factIds, setFactIds] = useState<string[]>([]);
  const versions = Object.values(d.answers).filter((a) => a.questionId === qid && a.jobId === job.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const first = versions.find((v) => v.kind === 'independent_first');
  const latest = versions[versions.length - 1];
  const [text, setText] = useState(latest?.text ?? '');
  const [length, setLength] = useState<AnswerVersion['length']>('standard');
  const [checked, setChecked] = useState(false);
  const [self, setSelf] = useState<Record<string, number | null>>({});
  const structure: AnswerVersion['structure'] = q?.format === 'recruiter' ? 'intro' : q && HYPOTHETICAL_FORMATS.includes(q.format) ? 'reasoning' : 'star';
  const sec = speakingSeconds(text);
  const [lo, hi, label] = LENGTH_TARGET[length];
  const usedFactTexts = (factIds.length ? factIds : facts.map((f) => f.id)).map((id) => d.facts[id]?.text ?? '');
  const signals = useMemo(() => localFactSignals(text, usedFactTexts), [text, usedFactTexts.join('|')]);
  const ai = useAIStatus();
  const evalTask = useAITask<EvalOut>();
  const draftTask = useAITask<DraftOut>();
  const targetWords = { short: 100, standard: 220, deep: 360 }[length];
  const storyList = storyId ? [storyId] : [];
  const runEval = () => {
    const env = buildEnvelope(d, 'evaluate_answer', { jobId: job.id, storyIds: storyList, extraSources: [textSource('answer', text)], payload: { main_question: q?.text, format: q?.format, selected_need: needId ? d.needs[needId]?.title : null, delivery_mode: 'text', assisted: false }, revisionExtra: `${qid}:${text}` });
    return evalTask.run(env, () => env.input_revision);
  };
  const runDraft = () => {
    const env = buildEnvelope(d, 'answer_draft', { jobId: job.id, storyIds: storyList, includeNeeds: true, payload: { question: q?.text, answer_type: structure, desired_language: d.profile.practiceLanguage, target_length: length, target_words: targetWords, selected_fact_ids: factIds, user_original_wording: first?.text ?? null, preserve_vocabulary: !!first } });
    return draftTask.run(env, () => revisionKey(d, job.id, storyList));
  };

  function selectQuestion(id: string) {
    setQid(id);
    const v = Object.values(d.answers).filter((a) => a.questionId === id && a.jobId === job.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    setText(v?.text ?? '');
    setChecked(false);
    const nq = d.questions[id];
    if (nq?.needId) setNeedId(nq.needId);
  }

  function save() {
    mutate((x) => {
      const id = uid('ans');
      const hasFirst = Object.values(x.answers).some((a) => a.questionId === qid && a.jobId === job.id && a.kind === 'independent_first');
      x.answers[id] = { id, jobId: job.id, questionId: qid, needId: needId || null, storyId: storyId || null, factIds, text: text.trim(), kind: hasFirst ? 'edit' : 'independent_first', length, structure, storyRevision: storyId ? x.stories[storyId]?.revision ?? null : null, createdAt: nowIso() };
    });
  }

  const outline = facts.filter((f) => factIds.length === 0 || factIds.includes(f.id));
  const story = storyId ? d.stories[storyId] : undefined;

  function exportCard() {
    if (!story) return;
    const lines = [
      `PREPARATION CARD — ${story.title}`,
      `Question: ${q?.text}`,
      '',
      'Memory cues:',
      ...(story.cues.length ? story.cues.slice(0, 3).map((c) => `  • ${c}`) : ['  (add cues in My stories)']),
      '',
      'Facts you can defend:',
      ...outline.map((f) => `  • ${f.text}${f.qualifiers.length ? ` [${f.qualifiers.join(', ')}]` : ''}`),
      '',
      'Boundaries:',
      ...Object.values(d.links).filter((l) => l.storyId === storyId && l.qualifierNote).map((l) => `  • ${l.qualifierNote}`),
      '',
      'Likely follow-ups:',
      '  • Who used or benefited from it?',
      '  • What did you personally decide, and why?',
      '  • How do you know the result?',
      ...story.openQuestions.map((o) => `  • ${o}`),
    ];
    download(`prep-card-${story.title.replace(/\W+/g, '-').toLowerCase()}.txt`, lines.join('\n'));
  }

  return (
    <div className="grid two">
      <section className="card">
        <h2>Answer Builder</h2>
        <Field label="Question" id="ab-q">
          <select id="ab-q" value={qid} onChange={(e) => selectQuestion(e.target.value)}>
            {questions.map((x) => <option key={x.id} value={x.id}>{x.origin === 'generated' ? '◆ ' : ''}[{FORMAT_LABEL[x.format]}] {x.text}</option>)}
          </select>
        </Field>
        <div className="grid two">
          <Field label="Job need" id="ab-n">
            <select id="ab-n" value={needId} onChange={(e) => setNeedId(e.target.value)}>
              <option value="">None</option>
              {needs.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
            </select>
          </Field>
          <Field label="Story" id="ab-s" hint={linkedStoryIds.length ? 'Stories linked to this need are listed first.' : undefined}>
            <select id="ab-s" value={storyId} onChange={(e) => { setStoryId(e.target.value); setFactIds([]); }}>
              <option value="">None</option>
              {[...Object.values(d.stories)].sort((a, b) => Number(linkedStoryIds.includes(b.id)) - Number(linkedStoryIds.includes(a.id))).map((s) => <option key={s.id} value={s.id}>{linkedStoryIds.includes(s.id) ? '● ' : ''}{s.title}</option>)}
            </select>
          </Field>
        </div>
        {needId && (
          <button className="btn small" onClick={() => mutate((x) => { const id = uid('q'); x.questions[id] = { id, text: `Tell me about experience that shows you can ${d.needs[needId].title.toLowerCase()}.`, format: 'behavioral', theme: d.needs[needId].title, difficulty: 'standard', stage: 'hiring_manager', origin: 'generated', jobId: job.id, needId, language: d.profile.practiceLanguage }; setTimeout(() => selectQuestion(id)); })}>
            + Practice question from this need
          </button>
        )}
        <p className="small muted" style={{ marginTop: 8 }}>
          Suggested structure: <strong>{structure === 'intro' ? 'Opening → background → fit' : structure === 'star' ? 'Situation, task, action, result (or result first)' : 'Clarify → assumptions → approach → how to validate'}</strong>. A guide, not a requirement.
        </p>
        <div className="row" style={{ marginBottom: 8 }}>
          {(['short', 'standard', 'deep'] as const).map((l) => <button key={l} className={`btn small ${length === l ? 'primary' : ''}`} onClick={() => setLength(l)}>{l}</button>)}
          <span className="small muted">Target {label}</span>
        </div>
        <Field label={first ? 'Your answer (edits are saved as new versions)' : 'Write your answer first — your first saved version stays unchanged for comparison'} id="ab-t">
          <textarea id="ab-t" value={text} onChange={(e) => { setText(e.target.value); setChecked(false); }} rows={8} />
        </Field>
        <p className="small muted">{wordCount(text)} words · estimated {sec}s at ~130 words/min {text && (sec < lo ? '· shorter than target' : sec > hi ? '· longer than target' : '· within target')}. Nothing is cut to fit.</p>
        <div className="row">
          <button className="btn primary" disabled={!text.trim() || evalTask.busy} onClick={() => { setChecked(true); if (ai.configured) void runEval(); }}>Check my answer</button>
          <button className="btn" disabled={!text.trim() || text.trim() === latest?.text} onClick={save}>Save version</button>
          {ai.configured ? <ModeTag mode="live" /> : <ModeTag mode="self_review" />}
          <AIBusy busy={evalTask.busy} onCancel={evalTask.cancel} label="Evaluating…" />
        </div>
        {checked && (
          <div className="card soft flat" style={{ marginTop: 12 }}>
            {ai.configured ? (
              <>
                <AIOutcome result={evalTask.result} staleNotice={evalTask.staleNotice} onRetry={runEval} />
                {evalTask.result?.status === 'ok' && (
                  <div className="card flat" style={{ marginBottom: 8 }}>
                    <div className="row"><ModeTag mode="live" /><span className="small muted">Coaching estimates for this text, not a hiring prediction.</span></div>
                    <ul className="check-list small" style={{ marginTop: 6 }}>
                      {evalTask.result.data.scores.map((sc) => <li key={sc.criterion} style={{ padding: '3px 0' }}><span className="score retry">{sc.score ?? '—'}</span> <strong>{sc.criterion.replace('_', ' & ')}</strong> <span className="muted">{sc.reason}</span>{sc.answer_refs[0] && <> — <span className="quote">“{sc.answer_refs[0].quote}”</span></>}</li>)}
                    </ul>
                    {evalTask.result.data.priority_fix && <p className="small"><strong>Fix first:</strong> {evalTask.result.data.priority_fix.text}</p>}
                  </div>
                )}
              </>
            ) : <Banner tone="info">AI feedback is not configured, so this check is a self-review plus local fact signals. No score is invented for you.</Banner>}
            <h4>Local fact signals</h4>
            <ul className="small">
              {signals.unsupportedNumbers.length > 0 ? <li>⚠ Numbers not found in the selected confirmed facts: <strong>{signals.unsupportedNumbers.join(', ')}</strong>. Add them as facts or remove them.</li> : <li>✓ Every number appears in the selected facts.</li>}
              {signals.simulatedDropped && <li>⚠ A number from a <em>simulated</em> result appears without the word “simulated”.</li>}
              {signals.ownershipFlag && <li>⚠ Wording may claim more ownership than your facts show (e.g., “entire project”). Check the fact’s ownership.</li>}
              {wordCount(text) < 8 && <li>Very short answer. Short is fine when it is specific — but a brief claim alone is not evidence.</li>}
            </ul>
            <h4>Rate it yourself</h4>
            {(Object.keys(RUBRIC_ANCHORS) as (keyof typeof RUBRIC_ANCHORS)[]).map((c) => (
              <fieldset key={c} style={{ border: 'none', padding: 0, margin: '0 0 8px' }}>
                <legend className="small" style={{ fontWeight: 600 }}>{c.replace('_', ' & ').replace('evidence & ownership', 'evidence and ownership')}</legend>
                <div className="row">
                  {RUBRIC_ANCHORS[c].map((a, i) => (
                    <label key={i} className="small" style={{ fontWeight: 400, display: 'flex', gap: 4 }} title={a}>
                      <input type="radio" name={`self-${c}`} checked={self[c] === i + 1} onChange={() => setSelf({ ...self, [c]: i + 1 })} /> {i + 1}
                    </label>
                  ))}
                  <label className="small" style={{ fontWeight: 400 }}><input type="radio" name={`self-${c}`} checked={self[c] === null} onChange={() => setSelf({ ...self, [c]: null })} /> not sure</label>
                </div>
                {self[c] && <div className="small muted">{RUBRIC_ANCHORS[c][(self[c] as number) - 1]}</div>}
              </fieldset>
            ))}
            <p className="small muted">Self-ratings are recorded as self-review in practice sessions; they are never mixed with prepared or live scores.</p>
          </div>
        )}
      </section>

      <div className="stack">
        <section className="card">
          <h3>Facts for this answer</h3>
          {!storyId ? <p className="small muted">Choose a story to see its confirmed facts.</p> : facts.length === 0 ? <p className="small muted">This story has no confirmed facts.</p> : (
            <>
              {facts.map((f) => (
                <label key={f.id} style={{ fontWeight: 400 }}>
                  <input type="checkbox" checked={factIds.includes(f.id)} onChange={(e) => setFactIds(e.target.checked ? [...factIds, f.id] : factIds.filter((x) => x !== f.id))} /> {f.text} {f.qualifiers.length > 0 && <span className="small muted">[{f.qualifiers.join(', ')}]</span>}
                </label>
              ))}
            </>
          )}
        </section>
        <section className="card">
          <h3>Reference draft</h3>
          {ai.configured ? (
            <>
              <p className="small muted">Write your own answer first; the draft uses only confirmed facts of the selected story.</p>
              <div className="row"><button className="btn small" disabled={!storyId || draftTask.busy} onClick={runDraft}>Get a reference draft</button><AIBusy busy={draftTask.busy} onCancel={draftTask.cancel} /></div>
              {!storyId && <p className="small muted">Choose a story first.</p>}
              <AIOutcome result={draftTask.result} staleNotice={draftTask.staleNotice} onRetry={runDraft} />
              {draftTask.result?.status === 'ok' && (
                <div className="card flat" style={{ margin: '8px 0' }}>
                  <Badge tone="info">Reference draft — not your independent answer</Badge>
                  <p style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{draftTask.result.data.answer}</p>
                  <details><summary className="small">Claims and their facts ({draftTask.result.data.claims.length})</summary><ul className="small">{draftTask.result.data.claims.map((c, i) => <li key={i}>{c.text} <span className="muted">← {c.fact_ids.map((f) => d.facts[f]?.text.slice(0, 40)).join('; ')}</span></li>)}</ul></details>
                  {draftTask.result.data.hypothetical_assumptions.length > 0 && <p className="small"><strong>Assumptions (not achievements):</strong> {draftTask.result.data.hypothetical_assumptions.join(' · ')}</p>}
                  {draftTask.result.data.cues.length > 0 && <p className="small"><strong>Suggested cues:</strong> {draftTask.result.data.cues.join(' · ')} {story && <button className="btn small ghost" onClick={() => mutate((x) => { x.stories[story.id].cues = (draftTask.result as { data: DraftOut }).data.cues.slice(0, 3); })}>Use as my cues</button>}</p>}
                  {draftTask.result.data.unresolved.length > 0 && <p className="small" style={{ color: 'var(--warn)' }}>Unresolved: {draftTask.result.data.unresolved.join(' · ')}</p>}
                  <button className="btn small" onClick={() => mutate((x) => { const id = uid('ans'); const r = draftTask.result as { data: DraftOut }; x.answers[id] = { id, jobId: job.id, questionId: qid, needId: needId || null, storyId: storyId || null, factIds: [...new Set(r.data.claims.flatMap((c) => c.fact_ids))], text: r.data.answer, kind: 'reference', length, structure, storyRevision: storyId ? x.stories[storyId]?.revision ?? null : null, createdAt: nowIso() }; })}>Save as reference version</button>
                </div>
              )}
              <p className="small muted">Outline of your confirmed facts:</p>
            </>
          ) : <Banner tone="info">Reference drafts need the AI service, which is not configured. Below is an outline of your own confirmed facts — use it to write in your own words.</Banner>}
          {outline.length > 0 ? <ul className="small">{outline.map((f) => <li key={f.id}>{f.text}{f.qualifiers.length ? ` [${f.qualifiers.join(', ')}]` : ''}</li>)}</ul> : <p className="small muted">No facts selected.</p>}
          {story && <button className="btn small" onClick={exportCard}>Export preparation card (.txt)</button>}
          {story && q && (
            <button className="btn small" style={{ marginLeft: 6 }} onClick={() => mutate((x) => { const id = uid('fc'); x.flashcards[id] = { id, questionId: q.id, storyId: story.id, front: q.text, cues: story.cues.slice(0, 3), selfRecall: null, interval: 0, nextReview: todayLocal(p.prefs.timezone), history: [] }; })}>
              Make a flashcard
            </button>
          )}
          {story && !story.cues.length && <p className="small muted">Tip: add memory cues to the story so flashcards show them.</p>}
        </section>
        <section className="card">
          <h3>Versions</h3>
          {versions.length === 0 ? <p className="small muted">No saved versions.</p> : (
            <ol className="small">
              {versions.map((v) => (
                <li key={v.id}>
                  {v.kind === 'independent_first' ? <Badge tone="violet">First independent</Badge> : v.kind === 'reference' ? <Badge tone="info">AI reference</Badge> : <Badge>Edit</Badge>} {v.length} {answerIsStale(d, v) && <Badge tone="warn">↻ Story changed</Badge>}
                  <div className="muted">{v.text.slice(0, 140)}{v.text.length > 140 ? '…' : ''}</div>
                </li>
              ))}
            </ol>
          )}
          <p className="small muted">Next flashcard review rule: see Progress → Flashcards. Today is {todayLocal(p.prefs.timezone)}; a “good” recall moves the card to about {addDays(todayLocal(p.prefs.timezone), 2)}.</p>
        </section>
      </div>
    </div>
  );
}
