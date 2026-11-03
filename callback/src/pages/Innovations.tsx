import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import type { DiagnosticRun, DiscoveryRun, FocusCategory, ID } from '../lib/types';
import { Badge, Banner, Empty, Field, Stepper } from '../ui/kit';
import { factsForStory } from '../lib/derive';
import { nowIso, uid, wordCount } from '../lib/text';
import { addTask, confirmFact, proposeUserFact } from '../lib/ops';
import { AIDiagnosisPanel } from './AIPanels';
import { discoveryAsk, discoveryDebrief, discoveryStart, useAIStatus } from '../lib/ai/client';
import { BRIEF, DISCOVERY_FOLLOWUPS, factText, pickScenario, respondToQuestion, scenarioById, SCENARIOS } from '../lib/discovery';

// ======================= Innovation 1: Find what to practice next =======================
const FOCUS: Record<FocusCategory, string> = {
  add_details: 'Add concrete experience details',
  organization: 'Organize the explanation',
  target_language: 'Practice target-language retrieval',
  independent_recall: 'Practice without cues',
  insufficient_evidence: 'Insufficient evidence so far',
};
const DIFFICULTIES = ['I could not remember specific details', 'I did not know how to order my points', 'I knew what to say but could not find the words in the interview language', 'Something else'];
const STEPS = ['Original answer', 'What felt difficult', 'Add details', 'Cued retry', 'Later check (optional)', 'Suggestions'];

export function DiagnosisTab() {
  const { d, mutate } = useStore();
  const runs = Object.values(d.diagnostics).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [runId, setRunId] = useState<ID | null>(runs.find((r) => r.status === 'in_progress')?.id ?? null);
  const run = runId ? d.diagnostics[runId] : undefined;

  if (!run) {
    return (
      <div className="stack">
        <section className="card">
          <h2>Find what to practice next</h2>
          <p>A short, optional protocol: answer once, say what felt hard, optionally add details in your preferred language, then retry with a small organization cue. It suggests a useful next exercise — not a judgment about you or your language ability.</p>
          <button className="btn primary" disabled={!Object.keys(d.stories).length} onClick={() => { const id = uid('diag'); mutate((x) => { x.diagnostics[id] = { id, storyId: null, questionId: null, step: 0, original: '', difficulty: '', supplement: '', supplementDeclined: false, proposedFacts: [], confirmedNewFactIds: [], cue: 'Your decision → what you did → what changed', retry: '', laterPrompt: '', laterAnswer: '', factsAtOriginal: [], factsAtRetry: [], choices: [], status: 'in_progress', taskIds: [], createdAt: nowIso() } satisfies DiagnosticRun; }); setRunId(id); }}>Start</button>
          {!Object.keys(d.stories).length && <p className="small muted">Create at least one story first.</p>}
        </section>
        {runs.length > 0 && (
          <section className="card">
            <h3>Past runs</h3>
            <ul>{runs.map((r) => <li key={r.id}><button className="btn small ghost" onClick={() => setRunId(r.id)}>{d.stories[r.storyId ?? '']?.title ?? 'Untitled'} · {r.status}</button></li>)}</ul>
          </section>
        )}
      </div>
    );
  }
  return <DiagnosisRun run={run} onClose={() => setRunId(null)} />;
}

function DiagnosisRun({ run, onClose }: { run: DiagnosticRun; onClose: () => void }) {
  const { d, mutate } = useStore();
  const set = (patch: Partial<DiagnosticRun>) => mutate((x) => { Object.assign(x.diagnostics[run.id], patch); });
  const story = run.storyId ? d.stories[run.storyId] : undefined;
  const storyFacts = run.storyId ? factsForStory(d, run.storyId).filter((f) => f.confirmed) : [];
  const questions = Object.values(d.questions).filter((q) => q.format === 'behavioral' || q.format === 'recruiter' || q.format === 'technical');
  const [proposal, setProposal] = useState('');
  const done = run.status !== 'in_progress';
  const ai = useAIStatus();

  const confounds: string[] = [];
  if (run.confirmedNewFactIds.length) confounds.push(`${run.confirmedNewFactIds.length} new fact(s) were added between attempts, so a better retry may reflect new information, not language alone.`);
  if (run.retry) confounds.push('The retry had an organization cue; it is cue-assisted.');
  if (run.supplement && !run.confirmedNewFactIds.length) confounds.push('You described details in another language but did not add them as facts; they may still have helped you recall.');
  const selfReport = run.difficulty.split('|').filter(Boolean);
  const suggestions: { focus: FocusCategory; reason: string }[] = [];
  if (selfReport.includes(DIFFICULTIES[0]) || run.confirmedNewFactIds.length) suggestions.push({ focus: 'add_details', reason: run.confirmedNewFactIds.length ? 'You added facts that were missing from the first answer.' : 'You reported difficulty recalling details.' });
  if (selfReport.includes(DIFFICULTIES[1])) suggestions.push({ focus: 'organization', reason: 'You reported difficulty ordering your points; compare how the cued retry is structured.' });
  if (selfReport.includes(DIFFICULTIES[2]) && !run.confirmedNewFactIds.length) suggestions.push({ focus: 'target_language', reason: 'You reported finding words was hard, and the same facts were available for both attempts.' });
  if (run.retry) suggestions.push({ focus: 'independent_recall', reason: 'The retry used a cue; check you can do it without one.' });
  if (!suggestions.length) suggestions.push({ focus: 'insufficient_evidence', reason: 'One session gives too little to suggest a focus.' });

  return (
    <div className="stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Find what to practice next</h2>
        <button className="btn small ghost" onClick={onClose}>Close</button>
      </div>
      <Stepper steps={STEPS} current={run.step} />
      {!ai.configured && <Banner tone="info">Automated semantic diagnosis needs the AI service, which is not configured. You get the full protocol, side-by-side answers, and suggestions based on what you reported. Nothing here is a verdict.</Banner>}

      {run.step === 0 && (
        <section className="card">
          <div className="grid two">
            <Field label="Story" id="dg-s"><select id="dg-s" value={run.storyId ?? ''} onChange={(e) => set({ storyId: e.target.value || null })}><option value="">Choose…</option>{Object.values(d.stories).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></Field>
            <Field label="Question" id="dg-q"><select id="dg-q" value={run.questionId ?? ''} onChange={(e) => set({ questionId: e.target.value || null })}><option value="">Choose…</option>{questions.map((q) => <option key={q.id} value={q.id}>{q.text}</option>)}</select></Field>
          </div>
          <Field label="Your answer, in the interview language, without notes" id="dg-o"><textarea id="dg-o" rows={5} value={run.original} onChange={(e) => set({ original: e.target.value })} /></Field>
          <button className="btn primary" disabled={!run.storyId || !run.questionId || !run.original.trim()} onClick={() => set({ step: 1, factsAtOriginal: storyFacts.map((f) => f.id) })}>Next</button>
        </section>
      )}

      {run.step === 1 && (
        <section className="card">
          <fieldset style={{ border: 'none', padding: 0 }}>
            <legend style={{ fontWeight: 500 }}>What felt difficult? (choose any)</legend>
            {DIFFICULTIES.map((x) => <label key={x} style={{ fontWeight: 400 }}><input type="checkbox" checked={selfReport.includes(x)} onChange={(e) => set({ difficulty: (e.target.checked ? [...selfReport, x] : selfReport.filter((y) => y !== x)).join('|') })} /> {x}</label>)}
          </fieldset>
          <Field label={`Optional: describe missing details in your preferred language (${d.profile.preferredLanguage})`} id="dg-sup" hint="This is kept separately. Nothing is added to your story unless you confirm it in the next step."><textarea id="dg-sup" rows={4} value={run.supplement} onChange={(e) => set({ supplement: e.target.value, supplementDeclined: false })} /></Field>
          <div className="row">
            <button className="btn primary" onClick={() => set({ step: run.supplement.trim() ? 2 : 3, supplementDeclined: !run.supplement.trim() })}>{run.supplement.trim() ? 'Next' : 'Skip — no details to add'}</button>
            <button className="btn ghost" onClick={() => set({ step: 0 })}>Back</button>
          </div>
        </section>
      )}

      {run.step === 2 && (
        <section className="card">
          <p>Your supplement: <span className="quote">“{run.supplement}”</span></p>
          <p className="small muted">Write each new fact in the words you want to keep (translation is your own; it is labeled self-reported). Confirm each before it joins the story.</p>
          <div className="row"><input type="text" aria-label="Proposed fact" value={proposal} onChange={(e) => setProposal(e.target.value)} style={{ flex: 1, width: 'auto' }} /><button className="btn small" disabled={!proposal.trim()} onClick={() => { set({ proposedFacts: [...run.proposedFacts, proposal.trim()] }); setProposal(''); }}>Propose</button></div>
          <ul className="check-list">
            {run.proposedFacts.map((pf, i) => {
              const added = run.confirmedNewFactIds.some((id) => d.facts[id]?.text === pf);
              return <li key={i} className="row">{pf} {added ? <Badge tone="green">Confirmed and added</Badge> : <button className="btn small primary" onClick={() => mutate((x) => { const fid = proposeUserFact(x, run.storyId!, pf); confirmFact(x, fid); x.diagnostics[run.id].confirmedNewFactIds.push(fid); })}>Confirm and add to story</button>}</li>;
            })}
          </ul>
          <div className="row"><button className="btn primary" onClick={() => set({ step: 3 })}>Next</button><button className="btn ghost" onClick={() => set({ step: 1 })}>Back</button></div>
        </section>
      )}

      {run.step === 3 && (
        <section className="card">
          <p>Organization cue (not an answer): <strong>{run.cue}</strong></p>
          <Field label="Cue (editable)" id="dg-cue"><input id="dg-cue" type="text" value={run.cue} onChange={(e) => set({ cue: e.target.value })} /></Field>
          <Field label="Retry the same question" id="dg-r"><textarea id="dg-r" rows={5} value={run.retry} onChange={(e) => set({ retry: e.target.value })} /></Field>
          <div className="row"><button className="btn primary" disabled={!run.retry.trim()} onClick={() => set({ step: 4, factsAtRetry: storyFacts.map((f) => f.id) })}>Next</button><button className="btn ghost" onClick={() => set({ step: run.supplementDeclined ? 1 : 2 })}>Back</button></div>
        </section>
      )}

      {run.step === 4 && (
        <section className="card">
          <p>Optional: later, try an equivalent prompt without cues.</p>
          <Field label="Equivalent prompt" id="dg-lp"><input id="dg-lp" type="text" value={run.laterPrompt} placeholder="e.g. Tell me about a time you made information useful to someone else." onChange={(e) => set({ laterPrompt: e.target.value })} /></Field>
          <Field label="Answer (no cues)" id="dg-la"><textarea id="dg-la" rows={4} value={run.laterAnswer} onChange={(e) => set({ laterAnswer: e.target.value })} /></Field>
          <button className="btn primary" onClick={() => set({ step: 5 })}>{run.laterAnswer.trim() ? 'See suggestions' : 'Skip for now'}</button>
        </section>
      )}

      {run.step === 5 && (
        <>
          <div className="grid two">
            <div className="card" style={{ borderTop: '3px solid var(--compare)' }}><h4>Original (no help)</h4><p className="small">{run.original}</p><p className="small muted">{wordCount(run.original)} words · {run.factsAtOriginal.length} confirmed fact(s) available</p></div>
            <div className="card" style={{ borderTop: '3px solid var(--primary)' }}><h4>Retry (cue-assisted)</h4><p className="small">{run.retry || <em>Not completed</em>}</p><p className="small muted">{wordCount(run.retry)} words · {run.factsAtRetry.length} confirmed fact(s) available</p></div>
          </div>
          {run.laterAnswer && <div className="card"><h4>Later check without cues — {run.laterPrompt}</h4><p className="small">{run.laterAnswer}</p></div>}
          <section className="card">
            <h3>Conditions that differ between attempts</h3>
            {confounds.length ? <ul className="small">{confounds.map((c) => <li key={c}>{c}</li>)}</ul> : <p className="small">None recorded.</p>}
            <p className="small muted">One session supports tentative suggestions only.</p>
          </section>
          {!done && <AIDiagnosisPanel run={run} onSuggest={(f) => set({ choices: f.map((x, i) => ({ focus: x.focus, priority: i + 1, reason: `AI observation: ${x.reason} → ${x.task}` })) })} />}
          <section className="card">
            <h3>Suggested focus <Badge tone="neutral">Tentative · from your report</Badge></h3>
            <p className="small muted">Choose, reorder, or dismiss. Each accepted focus creates a concrete practice task.</p>
            {(Object.keys(FOCUS) as FocusCategory[]).map((f) => {
              const sug = suggestions.find((s) => s.focus === f);
              const chosen = run.choices.find((c) => c.focus === f);
              return (
                <div key={f} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <label style={{ fontWeight: 400, flex: 1, minWidth: 200 }}>
                    <input type="checkbox" disabled={done} checked={!!chosen} onChange={(e) => set({ choices: e.target.checked ? [...run.choices, { focus: f, priority: run.choices.length + 1, reason: sug?.reason ?? 'Chosen by you.' }] : run.choices.filter((c) => c.focus !== f) })} /> <strong>{FOCUS[f]}</strong>
                    {sug && <div className="small muted">{sug.reason}</div>}
                  </label>
                  {chosen && <span className="small">Priority {chosen.priority}</span>}
                </div>
              );
            })}
            {!done ? (
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary" disabled={!run.choices.length} onClick={() => mutate((x) => {
                  const r = x.diagnostics[run.id];
                  const q = r.questionId ?? null;
                  const titles: Record<FocusCategory, string> = { add_details: `Add one concrete detail to “${story?.title}”`, organization: `Re-answer with result first: ${x.questions[q ?? '']?.text ?? ''}`, target_language: `Say the same facts aloud twice in the interview language: ${story?.title}`, independent_recall: `Unassisted retry: ${x.questions[q ?? '']?.text ?? ''}`, insufficient_evidence: `Try one more practice answer for “${story?.title}”` };
                  const types: Record<FocusCategory, 'collect_fact' | 'practice_question' | 'independent_retry'> = { add_details: 'collect_fact', organization: 'practice_question', target_language: 'practice_question', independent_recall: 'independent_retry', insufficient_evidence: 'practice_question' };
                  r.taskIds = r.choices.map((c) => addTask(x, { jobId: x.currentJobId, title: titles[c.focus], type: types[c.focus], minutes: c.focus === 'add_details' ? 5 : 10, rationale: `From practice diagnosis: ${c.reason}`, prerequisites: [], needIds: [], storyIds: r.storyId ? [r.storyId] : [], questionId: q, importance: Math.max(1, 5 - c.priority), source: 'diagnosis' }));
                  r.status = 'accepted';
                })}>Accept and create tasks</button>
                <button className="btn" onClick={() => set({ status: 'dismissed' })}>Dismiss suggestions</button>
              </div>
            ) : (
              <p className="small" style={{ marginTop: 8 }}>{run.status === 'accepted' ? <>✓ Created {run.taskIds.length} task(s). <a href="#/progress/plan">See your plan</a>.</> : 'Dismissed. Your protocol history is kept.'}</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ======================= Innovation 2: Discover the team's priority =======================
export function DiscoveryTab() {
  const { d, mutate } = useStore();
  const runs = Object.values(d.discoveries).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [runId, setRunId] = useState<ID | null>(runs.find((r) => r.phase !== 'debrief')?.id ?? null);
  const run = runId ? d.discoveries[runId] : undefined;
  const [starting, setStarting] = useState(false);
  const startRun = async (prev: DiscoveryRun | null) => {
    if (starting) return;
    setStarting(true);
    const id = uid('disc');
    // Prefer assessed mode: the server picks and keeps the scenario.
    const server = await discoveryStart(prev?.serverRunId ?? null);
    setStarting(false);
    if (server) {
      mutate((x) => { x.discoveries[id] = { id, jobId: x.currentJobId, scenarioId: '', turns: [], revealed: [], storyId: null, storyChanges: [], answer: '', followupsUsed: 0, phase: 'brief', selfReview: {}, createdAt: nowIso(), serverRunId: server.runId, revealedTexts: {}, debrief: null } satisfies DiscoveryRun; });
    } else {
      const sc = pickScenario(prev?.scenarioId || null);
      mutate((x) => { x.discoveries[id] = { id, jobId: x.currentJobId, scenarioId: sc.id, turns: [], revealed: [], storyId: null, storyChanges: [], answer: '', followupsUsed: 0, phase: 'brief', selfReview: {}, createdAt: nowIso(), serverRunId: null } satisfies DiscoveryRun; });
    }
    setRunId(id);
  };
  if (!run) {
    return (
      <div className="stack">
        <section className="card">
          <h2>Discover the team’s priority</h2>
          <p>Practice asking clarifying questions of a simulated hiring manager whose priority is hidden, then choose a real story and adapt your answer.</p>
          <Banner tone="demo">Everything the interviewer says beyond the JD is fictional simulation information. It is never saved as company research, job requirements, or your experience.</Banner>
          <Banner tone="info">When the Callback backend is running, the scenario is chosen and kept on the server, so the browser never sees the hidden priority until the debrief. Otherwise it runs in a local practice mode.</Banner>
          <button className="btn primary" style={{ marginTop: 10 }} disabled={starting} onClick={() => startRun(null)}>{starting ? 'Starting…' : 'Start a scenario'}</button>
        </section>
        {runs.length > 0 && <section className="card"><h3>Past runs</h3><ul>{runs.map((r) => <li key={r.id}><button className="btn small ghost" onClick={() => setRunId(r.id)}>{new Date(r.createdAt).toLocaleString()} · {r.phase === 'debrief' ? (r.debrief ? `Scenario ${r.debrief.scenarioId} (${r.debrief.label})` : r.scenarioId ? `Scenario ${r.scenarioId} (${scenarioById(r.scenarioId)?.label})` : 'ended') : 'in progress'}</button></li>)}</ul></section>}
      </div>
    );
  }
  return <DiscoveryRunView run={run} onClose={() => setRunId(null)} onReplay={() => startRun(run)} />;
}

function DiscoveryRunView({ run, onClose, onReplay }: { run: DiscoveryRun; onClose: () => void; onReplay: () => void }) {
  const { d, mutate } = useStore();
  const sc = run.scenarioId ? scenarioById(run.scenarioId) : undefined;
  const assessed = !!run.serverRunId;
  const [asking, setAsking] = useState(false);
  const [askErr, setAskErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [reply, setReply] = useState('');
  const set = (fn: (r: DiscoveryRun) => void) => mutate((x) => fn(x.discoveries[run.id]));
  const clarCount = run.turns.filter((t) => t.role === 'candidate' && t.phase === 'clarify').length;

  async function ask() {
    const text = q.trim();
    if (!text || asking) return;
    if (assessed) {
      setAsking(true);
      setAskErr(null);
      const reply = await discoveryAsk(run.serverRunId!, text);
      setAsking(false);
      if (!reply) return setAskErr('The simulation server did not respond. Your question was not sent — try again.');
      set((r) => {
        const phase = r.phase === 'brief' ? 'clarify' : (r.phase as 'clarify' | 'answer' | 'followup');
        r.turns.push({ role: 'candidate', text, revealed: [], phase });
        r.turns.push({ role: 'interviewer', text: reply.message, revealed: reply.revealed.map((f) => f.id), phase });
        for (const f of reply.revealed) { if (!r.revealed.includes(f.id)) r.revealed.push(f.id); r.revealedTexts = { ...(r.revealedTexts ?? {}), [f.id]: f.text }; }
        if (r.phase === 'brief') r.phase = 'clarify';
      });
      setQ('');
      return;
    }
    if (!sc) return;
    set((r) => {
      const res = respondToQuestion(sc, text, r.revealed);
      r.turns.push({ role: 'candidate', text, revealed: [], phase: r.phase === 'brief' ? 'clarify' : (r.phase as 'clarify' | 'answer' | 'followup') });
      r.turns.push({ role: 'interviewer', text: res.text, revealed: res.revealed, phase: r.phase === 'brief' ? 'clarify' : (r.phase as 'clarify') });
      r.revealed.push(...res.revealed);
      if (r.phase === 'brief') r.phase = 'clarify';
    });
    setQ('');
  }

  function submitAnswer() {
    const text = reply.trim();
    if (!text) return;
    set((r) => {
      if (r.phase === 'answer') {
        r.answer = text;
        r.turns.push({ role: 'candidate', text, revealed: [], phase: 'answer' });
        r.turns.push({ role: 'interviewer', text: DISCOVERY_FOLLOWUPS[0], revealed: [], phase: 'followup' });
        r.followupsUsed = 1;
        r.phase = 'followup';
      } else if (r.phase === 'followup') {
        r.turns.push({ role: 'candidate', text, revealed: [], phase: 'followup' });
        if (r.followupsUsed < 3) {
          r.turns.push({ role: 'interviewer', text: DISCOVERY_FOLLOWUPS[r.followupsUsed], revealed: [], phase: 'followup' });
          r.followupsUsed += 1;
        } else r.phase = 'debrief';
      }
    });
    setReply('');
  }

  // Fetch the hidden priority only once the run has ended.
  const debriefLoaded = useRef(false);
  useEffect(() => {
    if (run.phase !== 'debrief' || !assessed || run.debrief || debriefLoaded.current) return;
    debriefLoaded.current = true;
    void discoveryDebrief(run.serverRunId!).then((db) => db && set((r) => { r.debrief = { scenarioId: db.scenarioId, label: db.label, priority: db.priority, total: db.total }; }));
  }, [run.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const story = run.storyId ? d.stories[run.storyId] : undefined;
  const TOPICS = ['success', 'current_state', 'users', 'pain', 'measure', 'data', 'team'];
  const topicOf = (id: string) => (id.includes('.') ? ({ current: 'current_state' } as Record<string, string>)[id.split('.')[1]] ?? id.split('.')[1] : id);
  const revealedTopics = run.revealed.map(topicOf);
  const unrevealed = TOPICS.filter((t) => !revealedTopics.includes(t)).map((t) => ({ id: `x.${t}` }));
  const priorityLabel = run.debrief ? { id: run.debrief.scenarioId, label: run.debrief.label, priority: run.debrief.priority } : sc ? { id: sc.id, label: sc.label, priority: sc.priority } : null;
  const totalFacts = run.debrief?.total ?? (sc ? Object.keys(sc.facts).length : 7);
  const revealedText = (id: string) => run.revealedTexts?.[id] ?? factText(id);

  return (
    <div className="stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Discover the team’s priority <Badge tone="violet">Simulation</Badge> {assessed ? <Badge tone="green">Assessed mode — scenario held by server</Badge> : <Badge>Local practice mode</Badge>}</h2>
        <button className="btn small ghost" onClick={onClose}>Close</button>
      </div>
      <section className="card soft"><strong>Brief:</strong> {BRIEF}</section>
      <section className="card">
        <div className="chat">
          {run.turns.map((t, i) => (
            <div key={i} className={`bubble ${t.role === 'candidate' ? 'candidate' : 'interviewer'}`}>
              <div className="who">{t.role === 'candidate' ? 'You' : 'Hiring manager (fictional)'}{t.phase === 'clarify' && t.role === 'candidate' ? ' · clarifying question' : ''}</div>
              {t.text}
              {t.revealed.length > 0 && <div className="small muted">Simulation information shared</div>}
            </div>
          ))}
          {run.turns.length === 0 && <p className="muted">Ask the hiring manager a question to begin.</p>}
        </div>
      </section>

      {(run.phase === 'brief' || run.phase === 'clarify') && (
        <section className="card">
          {askErr && <Banner tone="warn">{askErr}</Banner>}
          <Field label="Ask a clarifying question" id="dq" hint="Any sensible wording works. You can ask several."><input id="dq" type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()} /></Field>
          <div className="row">
            <button className="btn primary" onClick={ask} disabled={!q.trim() || asking}>{asking ? 'Asking…' : 'Ask'}</button>
            <button className="btn" onClick={() => set((r) => { r.phase = 'answer'; })} disabled={clarCount === 0 && run.phase === 'brief' ? false : false}>I’m ready to answer</button>
          </div>
        </section>
      )}

      {(run.phase === 'answer' || run.phase === 'followup') && (
        <section className="card">
          {run.phase === 'answer' && <p><strong>Hiring manager:</strong> Tell me about experience that would help our team this summer.</p>}
          <Field label="Choose a real story" id="ds" hint="You can switch stories after learning something new; switches are recorded.">
            <select id="ds" value={run.storyId ?? ''} onChange={(e) => set((r) => { r.storyId = e.target.value || null; r.storyChanges.push({ storyId: r.storyId, afterRevealCount: r.revealed.length }); })}>
              <option value="">Choose…</option>
              {Object.values(d.stories).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </Field>
          {story && <ul className="small">{factsForStory(d, story.id).filter((f) => f.confirmed).map((f) => <li key={f.id}>{f.text}{f.qualifiers.length ? ` [${f.qualifiers.join(', ')}]` : ''}</li>)}</ul>}
          <Field label={run.phase === 'answer' ? 'Your answer' : `Follow-up ${run.followupsUsed} of 3`} id="dr"><textarea id="dr" rows={4} value={reply} onChange={(e) => setReply(e.target.value)} /></Field>
          <div className="row">
            <button className="btn primary" disabled={!reply.trim() || (run.phase === 'answer' && !run.storyId)} onClick={submitAnswer}>Submit</button>
            {run.phase === 'followup' && <button className="btn" onClick={() => set((r) => { r.phase = 'debrief'; })}>Finish</button>}
            <div className="row" style={{ flex: '1 1 100%' }}><input type="text" aria-label="Ask another question" placeholder="Or ask another question…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, width: 'auto' }} /><button className="btn small" disabled={!q.trim()} onClick={ask}>Ask</button></div>
          </div>
        </section>
      )}

      {run.phase === 'debrief' && (
        <section className="card">
          <h3>Debrief <Badge tone="neutral">✎ Self-review (authored scenario)</Badge></h3>
          {priorityLabel ? <p>This run’s fixed priority was <strong>Scenario {priorityLabel.id} — {priorityLabel.label}</strong>: {priorityLabel.priority}</p> : <p className="small muted">Loading the scenario priority from the server…</p>}
          <h4>What you learned ({run.revealed.length} of {totalFacts} pieces of information)</h4>
          {run.revealed.length ? <ul className="small">{run.revealed.map((id) => <li key={id}>{revealedText(id)}</li>)}</ul> : <p className="small">You did not ask about the team. That is fine — you are evaluated only on what was revealed.</p>}
          <h4>Still uncertain</h4>
          <ul className="small">{unrevealed.slice(0, 4).map((f) => <li key={f.id}>{({ success: 'What success looks like', current_state: 'What exists today', users: 'Who uses the work', pain: 'The main frustration', measure: 'How results are measured', data: 'Data quality', team: 'Team setup' } as Record<string, string>)[f.id.split('.')[1]] ?? f.id}</li>)}</ul>
          {run.storyChanges.length > 1 && <p className="small">You switched stories {run.storyChanges.length - 1} time(s), the last after {run.storyChanges[run.storyChanges.length - 1].afterRevealCount} piece(s) of information.</p>}
          <h4>Review yourself</h4>
          {['Did I ask a question that reduced an important uncertainty?', 'Did I choose evidence relevant to what was actually revealed?', 'Did I adjust my answer while keeping the real scope of my experience?', 'Did I avoid assuming information that was never shared?'].map((k) => (
            <label key={k} style={{ fontWeight: 400 }}><input type="checkbox" checked={!!run.selfReview[k]} onChange={(e) => set((r) => { r.selfReview[k] = e.target.checked; })} /> {k}</label>
          ))}
          <p className="small muted">You are never penalized for not guessing unrevealed information. Scenario details stay inside this simulation.</p>
          <div className="row"><button className="btn primary" onClick={onReplay}>Replay with a new scenario</button><button className="btn" onClick={onClose}>Done</button></div>
          <p className="small muted">A replay picks a different scenario from {SCENARIOS.length} and is labeled a new scenario.</p>
        </section>
      )}
      {run.phase !== 'debrief' && <p className="small muted">The scenario’s priority is fixed for this run and does not change based on your answer.</p>}
    </div>
  );
}

export function NoStories() {
  return <Empty title="No stories yet" action={<a className="btn" href="#/stories">Create a story</a>} />;
}
