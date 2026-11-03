import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import type { Criterion, CriterionScore, Feedback, ID, Session, Turn } from '../lib/types';
import { Badge, Banner, Empty, ModeTag } from '../ui/kit';
import { endEarly, markSaved, MAX_FOLLOWUPS, skipQuestion, startRetry, stateLabel, submitAnswer } from '../lib/session';
import { comparability, currentFeedback, evaluableText, feedbackFor, feedbackIsStale, firstAnswerTurn, latestTranscript, modeLabel, retryTurn } from '../lib/derive';
import { FIXTURE, fixtureFeedback, RUBRIC_VERSION } from '../lib/demo';
import { localFactSignals, nowIso, uid, wordCount } from '../lib/text';
import { speak, stopSpeaking } from '../lib/services';
import { HYPOTHETICAL_FORMATS } from '../lib/questions';
import { Playback, Recorder, type RecordingResult } from '../ui/Recorder';
import { RUBRIC_ANCHORS } from './Answers';
import type { EvalOut, TurnOut } from '../lib/ai/types';
import { buildEnvelope, runAI, textSource, useAIStatus, useAITask } from '../lib/ai/client';
import { AIBusy, AIOutcome } from '../ui/AIBits';
import type { InterviewerDecision } from '../lib/session';

const CRITERIA: [Criterion, string][] = [['relevance', 'Relevance'], ['evidence_ownership', 'Evidence and ownership'], ['organization', 'Organization'], ['clear_language', 'Clear language']];

export function SessionView({ id }: { id: ID }) {
  const { d, p, mutate } = useStore();
  const s = d.sessions[id];
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [rec, setRec] = useState<RecordingResult | null>(null);
  const [muted, setMuted] = useState(!p.prefs.speakPrompts);
  const lastSpoken = useRef<string | null>(null);
  const ai = useAIStatus();
  const [thinking, setThinking] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const lastInterviewer = s ? [...s.turns].reverse().find((t) => t.role === 'interviewer') : undefined;

  useEffect(() => {
    if (!s || muted || !lastInterviewer || lastSpoken.current === lastInterviewer.id) return;
    if (s.state === 'feedback' || s.state === 'saved') return;
    lastSpoken.current = lastInterviewer.id;
    speak(lastInterviewer.text, d.profile.practiceLanguage === 'zh' ? 'zh-CN' : 'en-US');
  }, [lastInterviewer?.id, muted]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopSpeaking(), []);

  if (!s) return <div className="card"><Empty title="Session not found" action={<a className="btn" href="#/practice">Back to Practice room</a>} /></div>;
  const need = s.needId ? d.needs[s.needId] : undefined;
  const accepting = !s.paused && (s.state === 'first_answer' || s.state === 'followup_cycle' || s.state === 'independent_retry');
  const recorded = s.mode !== 'text';
  const update = (fn: (x: Session) => Session) => mutate((x) => { x.sessions[id] = fn(x.sessions[id]); });

  async function submit() {
    if (thinking) return;
    setErr(null);
    setAiNote(null);
    const expected = s.turns.length;
    if (!text.trim()) return setErr('Write or record an answer, or use Skip.');
    let decision: InterviewerDecision | null = null;
    // A5: the AI proposes the next interviewer turn; the controller enforces the limits.
    if (ai.configured && !s.fixtureId && (s.state === 'first_answer' || s.state === 'followup_cycle')) {
      setThinking(true);
      const mi = s.mainIndex;
      const used = s.followupsUsed[mi] ?? 0;
      const transcript = [...s.turns.filter((t) => t.mainIndex === mi).map((t) => ({ speaker: t.role === 'candidate' ? 'candidate' : 'interviewer', text: t.text })), { speaker: 'candidate', text: text.trim() }];
      const qq = d.questions[s.questionIds[mi]];
      const env = buildEnvelope(d, 'interviewer_turn', { jobId: s.jobId, includeNeeds: !!s.jobId, payload: { main_question: qq?.text, format: qq?.format, selected_need: need?.title ?? null, transcript, question_index: mi + 1, question_count: s.questionIds.length, followups_used: used, max_followups: MAX_FOLLOWUPS, allowed_actions: used < MAX_FOLLOWUPS ? ['followup', 'close'] : ['close'], interviewer_style: s.style }, revisionExtra: `${s.id}:${expected}` });
      const r = await runAI<TurnOut>(env);
      setThinking(false);
      if (r.status === 'ok') decision = { action: r.data.action, message: r.data.message, probe: r.data.probe === 'none' ? null : r.data.probe };
      else setAiNote('The AI interviewer was unavailable for this turn, so the offline follow-up rules were used.');
    }
    let error: string | undefined;
    let newTurnId: string | null = null;
    mutate((x) => {
      const cur = x.sessions[id];
      const r = submitAnswer(cur, text, x.questions, expected, need?.title, rec ? { recordingId: rec.id, durationSec: rec.durationSec } : undefined, decision);
      error = r.error;
      if (!r.error) {
        x.sessions[id] = r.session;
        const t = r.session.turns.filter((tt) => tt.role === 'candidate').pop()!;
        newTurnId = t.id;
        if (recorded) {
          const tvId = uid('tv');
          x.transcripts[tvId] = { id: tvId, turnId: t.id, sessionId: id, text: text.trim(), version: 1, origin: 'manual_entry', note: 'Typed by you after recording', createdAt: nowIso() };
        }
      }
    });
    if (error) setErr(error);
    else if (newTurnId !== null) {
      setText('');
      setRec(null);
    }
  }

  // During the independent retry, earlier coaching and answers are hidden.
  const hideEarlier = s.state === 'independent_retry';
  const visible = hideEarlier ? s.turns.filter((t) => t.kind === 'retry_prompt' || t.kind === 'retry') : s.turns;

  return (
    <>
      <p className="small"><a href="#/practice">← Practice room</a></p>
      <div className="row between">
        <div>
          <h1 style={{ marginBottom: 4 }}>{s.kind === 'drill' ? 'Single-question drill' : s.kind === 'panel' ? 'Panel practice' : 'Practice interview'}</h1>
          <div className="row">
            <Badge tone="info">{stateLabel(s)}</Badge>
            <Badge>{s.mode}</Badge>
            {need && <Badge tone="green">Need: {need.title}</Badge>}
            {s.fixtureId && <Badge tone="violet">◆ Prepared example</Badge>}
            {s.assisted && <Badge tone="warn">Assisted retry</Badge>}
            {!s.fixtureId && (ai.configured ? <ModeTag mode="live" /> : <ModeTag mode="rules" />)}
          </div>
        </div>
        <div className="row">
          {s.state !== 'feedback' && s.state !== 'saved' && (
            <>
              <button className="btn small" onClick={() => update((x) => ({ ...x, paused: !x.paused, updatedAt: nowIso() }))}>{s.paused ? 'Resume' : 'Pause'}</button>
              <button className="btn small" onClick={() => update(endEarly)}>Finish early</button>
            </>
          )}
          {'speechSynthesis' in window && (
            <>
              <button className="btn small ghost" onClick={() => { setMuted(!muted); if (!muted) stopSpeaking(); }} aria-pressed={!muted}>{muted ? '🔇 Voice off' : '🔊 Voice on'}</button>
              {lastInterviewer && <button className="btn small ghost" onClick={() => speak(lastInterviewer.text)}>Replay question</button>}
            </>
          )}
        </div>
      </div>
      {s.kind !== 'drill' && <p className="small muted">Question {s.mainIndex + 1} of {s.questionIds.length} · up to {MAX_FOLLOWUPS} follow-ups each · {s.durationMin} min</p>}
      {!s.fixtureId && <p className="small muted">{ai.configured ? 'Follow-ups come from the AI interviewer, which reads your whole answer. Callback still enforces at most three per question.' : 'Follow-ups come from offline rules that look for missing information across your whole answer (AI interviewer not configured).'}</p>}
      {aiNote && <Banner tone="info">{aiNote}</Banner>}

      <div className="card section">
        <div className="chat" aria-live="polite">
          {hideEarlier && <p className="small muted">Earlier turns and coaching are hidden during your independent retry.</p>}
          {visible.map((t) => <TurnBubble key={t.id} t={t} s={s} />)}
        </div>
      </div>

      {s.paused && <Banner tone="info">Session paused. Your progress is saved — resume any time, even after closing the page.</Banner>}

      {accepting && (
        <section className="card section">
          {s.state === 'independent_retry' && <Banner tone="info">Answer the same question again, completely, without coaching. This is your second complete answer for comparison.</Banner>}
          {recorded && <Recorder kind={s.mode as 'audio' | 'video'} sessionId={id} onSaved={setRec} />}
          {rec && <p className="small">✓ Recording kept ({rec.durationSec}s). Now type what you said.</p>}
          <label htmlFor="answer" style={{ marginTop: 8 }}>{recorded ? 'Transcript of what you said (typed by you)' : 'Your answer'}</label>
          <textarea id="answer" value={text} onChange={(e) => setText(e.target.value)} rows={5} aria-invalid={!!err} />
          {err && <p className="error-text" role="alert">⚠ {err}</p>}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={submit} disabled={!text.trim() || thinking}>{thinking ? 'Interviewer is thinking…' : 'Submit answer'}</button>
            <button className="btn" onClick={() => update((x) => skipQuestion(x, d.questions, x.turns.length))}>Skip</button>
            <span className="small muted">{wordCount(text)} words</span>
          </div>
        </section>
      )}

      {s.state === 'coaching_summary' && !s.paused && (
        <section className="card section">
          <h2>Next: independent retry</h2>
          <p>You will get the same question again with coaching hidden.</p>
          <div className="row">
            <button className="btn primary" onClick={() => update((x) => startRetry(x, d.questions))}>Start independent retry</button>
            {s.fixtureId && !s.assisted && <button className="btn" onClick={() => update((x) => ({ ...x, assisted: true }))}>View reference rewrite first (marks retry as assisted)</button>}
          </div>
          {s.assisted && s.fixtureId && <div className="card soft flat" style={{ marginTop: 10 }}><Badge tone="warn">Reference — your retry will be labeled assisted</Badge><p className="quote" style={{ marginTop: 6 }}>“{FIXTURE.reference}”</p></div>}
          {!s.fixtureId && <p className="small muted">Reference rewrites require the AI service, which is not configured.</p>}
        </section>
      )}

      {(s.state === 'feedback' || s.state === 'saved') && <FeedbackPanel s={s} />}
    </>
  );
}

function TurnBubble({ t, s }: { t: Turn; s: Session }) {
  const { d, mutate } = useStore();
  const [editing, setEditing] = useState(false);
  const tv = latestTranscript(d, t.id);
  const [draft, setDraft] = useState(tv?.text ?? t.text);
  const cls = t.role === 'coach' ? 'coach' : t.role === 'candidate' ? 'candidate' : 'interviewer';
  const label = t.role === 'candidate' ? (t.kind === 'retry' ? 'You — independent retry' : t.kind === 'answer' ? 'You — first answer' : 'You') : t.speaker + (t.kind === 'followup' && t.probe ? ` · follow-up (${t.probe})` : t.kind === 'retry_prompt' ? ' · same question, retry' : '');
  return (
    <div className={`bubble ${cls}`}>
      <div className="who">{label}</div>
      {t.skipped ? <em className="muted">Skipped — no answer recorded.</em> : <div>{tv ? tv.text : t.text}</div>}
      {tv && <div className="small muted">Transcript v{tv.version} ({tv.origin === 'manual_entry' ? 'typed' : 'corrected'}){t.durationSec ? ` · ${t.durationSec}s recording` : ''}</div>}
      {t.recordingId && <Playback id={t.recordingId} onDelete={() => mutate((x) => { const tt = x.sessions[s.id].turns.find((y) => y.id === t.id); if (tt) tt.recordingId = null; })} />}
      {tv && !editing && <button className="btn small ghost" onClick={() => setEditing(true)}>Correct transcript</button>}
      {editing && (
        <div className="stack" style={{ marginTop: 6 }}>
          <textarea aria-label="Corrected transcript" value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} />
          <div className="row">
            <button className="btn small primary" disabled={draft.trim() === tv?.text} onClick={() => { mutate((x) => { const id = uid('tv'); x.transcripts[id] = { id, turnId: t.id, sessionId: s.id, text: draft.trim(), version: (tv?.version ?? 0) + 1, origin: 'correction', note: 'Corrected by you', createdAt: nowIso() }; }); setEditing(false); }}>Save as new version</button>
            <button className="btn small ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
          <span className="small muted">The original recording and earlier transcript versions are kept. Feedback on the old version is marked outdated.</span>
        </div>
      )}
    </div>
  );
}

function FeedbackPanel({ s }: { s: Session }) {
  const { mutate } = useStore();
  const mains = s.questionIds.map((_, i) => i);
  return (
    <section className="section">
      <div className="row between">
        <h2>Feedback</h2>
        {s.state === 'feedback' ? <button className="btn primary" onClick={() => mutate((x) => { x.sessions[s.id] = markSaved(x.sessions[s.id]); })}>Save session</button> : <Badge tone="green">✓ Saved</Badge>}
      </div>
      <Banner tone="info">Scores are coaching estimates for a single complete answer — not a hiring prediction. Follow-up replies inform coaching but are not merged into the evaluated answer.</Banner>
      {mains.map((mi) => <MainFeedback key={mi} s={s} mi={mi} />)}
      {s.fixtureId && (
        <div className="card section">
          <h3>Transfer check (separate series)</h3>
          <p>“{FIXTURE.transferQuestion}”</p>
          <p className="small muted">A different question checks whether the skill transfers. It is evaluated on its own, never compared with this drill.</p>
          <a className="btn" href={`#/practice/start/q_transfer`}>Try the transfer question</a>
        </div>
      )}
    </section>
  );
}

function MainFeedback({ s, mi }: { s: Session; mi: number }) {
  const { d } = useStore();
  const q = d.questions[s.questionIds[mi]];
  const first = firstAnswerTurn(s, mi);
  const retry = retryTurn(s, mi);
  const fbFirst = first ? currentFeedback(d, first.id) : undefined;
  const fbRetry = retry ? currentFeedback(d, retry.id) : undefined;
  const cmp = comparability(fbFirst, fbRetry, true);
  const hypothetical = q && HYPOTHETICAL_FORMATS.includes(q.format);
  return (
    <div className="card section">
      <h3>{q?.text}</h3>
      {!first || first.skipped ? <p className="muted">Not answered — no feedback is generated for a skipped or empty answer.</p> : (
        <div className="grid two">
          <AnswerEval s={s} turn={first} label="First complete answer" tone="first" />
          {s.kind === 'drill' && (retry && !retry.skipped ? <AnswerEval s={s} turn={retry} label={s.assisted ? 'Retry (assisted)' : 'Independent retry'} tone="retry" /> : <div className="card flat soft"><h4>Retry</h4><Badge>Not completed</Badge><p className="small muted">No retry was completed, so there is nothing to compare.</p></div>)}
        </div>
      )}
      {s.kind === 'drill' && fbFirst && fbRetry && (
        <div className="card flat section">
          <h4>Comparison</h4>
          {cmp.eligible ? (
            <table>
              <thead><tr><th>Criterion</th><th>First</th><th>Retry</th></tr></thead>
              <tbody>
                {CRITERIA.map(([c, l]) => {
                  const a = fbFirst.scores.find((x) => x.criterion === c)?.score ?? null;
                  const b = fbRetry.scores.find((x) => x.criterion === c)?.score ?? null;
                  return <tr key={c}><td>{l}</td><td><span className="score first">{a ?? '—'}</span></td><td><span className="score retry">{b ?? '—'}</span></td></tr>;
                })}
              </tbody>
            </table>
          ) : (
            <>
              <p>Shown side by side without a numeric improvement claim:</p>
              <ul className="small">{cmp.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </>
          )}
          <p className="small muted">Mode: {modeLabel(fbFirst.mode)}{fbFirst.mode !== fbRetry.mode ? ` / ${modeLabel(fbRetry.mode)}` : ''}. First scores are never changed.</p>
        </div>
      )}
      {s.fixtureId && retry && fbRetry && (
        <div className="card flat section">
          <h4>What worked</h4>
          <p>The strongest supported evidence in your retry:</p>
          <p className="quote">“{highlightIn(retry.text, FIXTURE.strongestQuote)}”</p>
          <h4>Practice next</h4>
          <p>{FIXTURE.practiceNext} <span className="small muted">This is a question for you — not permission to invent a decision.</span></p>
          <h4>Reference rewrite (shown after your retry)</h4>
          <p className="quote">“{FIXTURE.reference}”</p>
        </div>
      )}
      {hypothetical && <ReasoningChecks format={q.format} />}
      {s.mode !== 'text' && first && <DeliveryObservations s={s} mi={mi} />}
    </div>
  );
}

function highlightIn(text: string, q: string) {
  const i = text.indexOf(q);
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{q}</mark>{text.slice(i + q.length)}</>;
}

function AnswerEval({ s, turn, label, tone }: { s: Session; turn: Turn; label: string; tone: 'first' | 'retry' }) {
  const { d, mutate } = useStore();
  const fb = currentFeedback(d, turn.id);
  const history = feedbackFor(d, turn.id);
  const { text, transcriptVersionId } = evaluableText(d, s, turn.id);
  const [self, setSelf] = useState<Record<Criterion, number | null | undefined>>({ relevance: undefined, evidence_ownership: undefined, organization: undefined, clear_language: undefined });
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [dispute, setDispute] = useState('');
  const [showForm, setShowForm] = useState(false);
  const fixture = s.fixtureId && !transcriptVersionId ? fixtureFeedback(s.id, turn.id, text, tone === 'first' ? 'first' : 'retry') : null;
  const factTexts = Object.values(d.facts).filter((f) => f.confirmed).map((f) => f.text);
  const signals = localFactSignals(text, factTexts);
  const stale = fb ? feedbackIsStale(d, fb) : false;
  const ai = useAIStatus();
  const evalTask = useAITask<EvalOut>();
  const q = d.questions[s.questionIds[turn.mainIndex]];

  async function evaluateLive(disputeText: string, supersedes: ID | null) {
    const env = buildEnvelope(d, 'evaluate_answer', {
      jobId: s.jobId,
      extraSources: [textSource('answer', text)],
      payload: { main_question: q?.text, format: q?.format, selected_need: s.needId ? d.needs[s.needId]?.title : null, delivery_mode: s.mode, assisted: tone === 'retry' && s.assisted, dispute: disputeText || null, previous_scores: supersedes ? fb?.scores.map((x) => ({ criterion: x.criterion, score: x.score })) : null },
      revisionExtra: `${turn.id}:${transcriptVersionId ?? 'text'}:${text.length}`,
    });
    const r = await evalTask.run(env, () => env.input_revision);
    if (r?.status !== 'ok') return;
    const o = r.data;
    mutate((x) => {
      const id = uid('fb');
      x.feedback[id] = {
        id, sessionId: s.id, turnId: turn.id, answerText: text, transcriptVersionId, rubricVersion: RUBRIC_VERSION, mode: 'live', assisted: tone === 'retry' && s.assisted,
        scores: o.scores.map((sc) => ({ criterion: sc.criterion, score: sc.score, reason: sc.reason, quote: sc.answer_refs[0]?.quote ?? '' })),
        strengths: o.strengths.map((st) => ({ text: st.text, quote: st.answer_refs[0]?.quote ?? '' })),
        priorityFix: o.priority_fix ? { text: o.priority_fix.text, nextAction: o.priority_fix.suggested_task } : null,
        dispute: disputeText, supersedes, createdAt: nowIso(), formatChecks: o.format_checks,
        aiMeta: { requestId: r.meta.requestId, promptVersion: r.meta.promptVersion, model: r.meta.model, servedByFallback: r.meta.servedByFallback },
      };
    });
    setDispute('');
  }

  function saveSelf(supersedes: ID | null) {
    const scores: CriterionScore[] = CRITERIA.map(([c]) => ({ criterion: c, score: (self[c] ?? null) as CriterionScore['score'], reason: reasons[c] || (self[c] == null ? 'Not rated — you marked this as not observed or unsure.' : 'Self-rated'), quote: '' }));
    mutate((x) => {
      const id = uid('fb');
      x.feedback[id] = { id, sessionId: s.id, turnId: turn.id, answerText: text, transcriptVersionId, rubricVersion: RUBRIC_VERSION, mode: 'self_review', assisted: tone === 'retry' && s.assisted, scores, strengths: [], priorityFix: reasons.fix ? { text: reasons.fix, nextAction: 'Practice this in your next attempt.' } : null, dispute, supersedes, createdAt: nowIso() };
    });
    setShowForm(false);
    setDispute('');
  }

  return (
    <div className={`card flat ${tone === 'first' ? '' : ''}`} style={{ borderTop: `3px solid ${tone === 'first' ? 'var(--compare)' : 'var(--primary)'}` }}>
      <h4>{label}</h4>
      <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
      {transcriptVersionId && <p className="small muted">Evaluating transcript v{latestTranscript(d, turn.id)?.version}.</p>}
      {(signals.unsupportedNumbers.length > 0 || signals.ownershipFlag || signals.simulatedDropped) && (
        <div className="small" style={{ color: 'var(--warn)' }}>
          {signals.unsupportedNumbers.length > 0 && <div>⚠ Numbers not in your confirmed facts: {signals.unsupportedNumbers.join(', ')}</div>}
          {signals.simulatedDropped && <div>⚠ A simulated result is stated without “simulated”.</div>}
          {signals.ownershipFlag && <div>⚠ Wording may overstate ownership.</div>}
        </div>
      )}
      {fb && !stale ? (
        <>
          <div className="row"><ModeTag mode={fb.mode} />{fb.supersedes && <Badge tone="info">Re-evaluation</Badge>}</div>
          <ul className="check-list small" style={{ marginTop: 6 }}>
            {fb.scores.map((sc) => (
              <li key={sc.criterion} style={{ padding: '4px 0' }}>
                <span className={`score ${tone}`}>{sc.score ?? '—'}</span> <strong>{CRITERIA.find((c) => c[0] === sc.criterion)?.[1]}</strong>
                <div className="muted">{sc.reason}{sc.quote && <> — <span className="quote">“{sc.quote}”</span></>}</div>
              </li>
            ))}
          </ul>
          {fb.strengths.length > 0 && fb.mode === 'live' && <div className="small"><strong>What worked:</strong> {fb.strengths.map((st, i) => <div key={i}>{st.text}{st.quote && <> — <span className="quote">“{st.quote}”</span></>}</div>)}</div>}
          {fb.priorityFix && <p className="small"><strong>Fix first:</strong> {fb.priorityFix.text}{fb.mode === 'live' && fb.priorityFix.nextAction && <span className="muted"> · Next: {fb.priorityFix.nextAction}</span>}</p>}
          {fb.formatChecks && fb.formatChecks.length > 0 && <div className="small"><strong>Format checks:</strong> {fb.formatChecks.map((f, i) => <div key={i}>{f.label}: {f.observation} <Badge>{f.basis === 'actual_execution' ? 'executed' : f.basis === 'reasoning_review' ? 'reasoning review — not executed' : 'not observed'}</Badge></div>)}</div>}
          {fb.dispute && <p className="small"><strong>Your added context:</strong> {fb.dispute}</p>}
          <details>
            <summary className="small">Disagree? Add missing context</summary>
            <textarea aria-label="Context" value={dispute} onChange={(e) => setDispute(e.target.value)} rows={2} />
            <p className="small muted">{fb.mode === 'prepared_example' ? 'Prepared example feedback is fixed. Your context is recorded with a new self-review; the original stays visible in history.' : 'This creates a labeled re-evaluation. The original is kept. Asking for a higher score alone does not change it.'}</p>
            <div className="row">
              {ai.configured && fb.mode !== 'prepared_example' && <button className="btn small primary" disabled={!dispute.trim() || evalTask.busy} onClick={() => evaluateLive(dispute.trim(), fb.id)}>Re-evaluate with AI</button>}
              <button className="btn small" disabled={!dispute.trim()} onClick={() => setShowForm(true)}>Re-evaluate with self-review</button>
            </div>
          </details>
        </>
      ) : (
        <>
          {stale && fb && <Banner tone="warn">This feedback was for an earlier transcript or answer version. It is outdated — re-evaluate the corrected text.</Banner>}
          {fixture && !fb ? (
            <button className="btn small primary" onClick={() => mutate((x) => { const f: Feedback = { ...fixture, id: uid('fb') }; x.feedback[f.id] = f; })}>Show prepared example feedback</button>
          ) : (
            <>
              {s.fixtureId && !fixture && <p className="small muted">This text differs from the prepared example, so prepared scores do not apply.</p>}
              {ai.configured ? (
                <div className="row">
                  <button className="btn small primary" disabled={evalTask.busy} onClick={() => evaluateLive('', fb?.id ?? null)}>Evaluate with AI</button>
                  {!showForm && <button className="btn small" onClick={() => setShowForm(true)}>Self-review instead</button>}
                </div>
              ) : (
                <>
                  <p className="small">Automated evaluation is unavailable (AI not configured). Your work is saved — use self-review now, or evaluate later.</p>
                  {!showForm && <button className="btn small" onClick={() => setShowForm(true)}>Self-review this answer</button>}
                </>
              )}
            </>
          )}
        </>
      )}
      <AIBusy busy={evalTask.busy} onCancel={evalTask.cancel} label="Evaluating…" />
      <AIOutcome result={evalTask.result} staleNotice={evalTask.staleNotice} onRetry={() => evaluateLive(dispute.trim(), fb?.id ?? null)} />
      {showForm && (
        <div className="card soft flat" style={{ marginTop: 8 }}>
          {CRITERIA.map(([c, l]) => (
            <fieldset key={c} style={{ border: 'none', padding: 0, margin: '0 0 8px' }}>
              <legend className="small" style={{ fontWeight: 600 }}>{l}</legend>
              <div className="row">
                {[1, 2, 3, 4].map((n) => <label key={n} className="small" style={{ fontWeight: 400 }} title={RUBRIC_ANCHORS[c][n - 1]}><input type="radio" name={`${turn.id}-${c}`} checked={self[c] === n} onChange={() => setSelf({ ...self, [c]: n })} /> {n}</label>)}
                <label className="small" style={{ fontWeight: 400 }}><input type="radio" name={`${turn.id}-${c}`} checked={self[c] === null} onChange={() => setSelf({ ...self, [c]: null })} /> not observed</label>
              </div>
              {typeof self[c] === 'number' && <div className="small muted">{RUBRIC_ANCHORS[c][(self[c] as number) - 1]}</div>}
            </fieldset>
          ))}
          <label htmlFor={`fix-${turn.id}`} className="small">One thing to fix first</label>
          <input id={`fix-${turn.id}`} type="text" value={reasons.fix ?? ''} onChange={(e) => setReasons({ ...reasons, fix: e.target.value })} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn small primary" disabled={CRITERIA.some(([c]) => self[c] === undefined)} onClick={() => saveSelf(fb && !stale ? fb.id : fb?.id ?? null)}>Save self-review</button>
            <button className="btn small ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}
      {history.length > 1 && (
        <details style={{ marginTop: 8 }}>
          <summary className="small">Evaluation history ({history.length})</summary>
          <ol className="small">{history.map((h) => <li key={h.id}>{modeLabel(h.mode)} · {new Date(h.createdAt).toLocaleString()} · {h.scores.map((x) => x.score ?? '—').join('/')}{feedbackIsStale(d, h) ? ' · outdated' : ''}</li>)}</ol>
        </details>
      )}
    </div>
  );
}

function ReasoningChecks({ format }: { format: string }) {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const items = format === 'coding' ? ['Restated the problem and constraints', 'Explained the approach before coding', 'Stated time and space complexity', 'Named edge cases'] : format === 'system_design' ? ['Clarified requirements', 'Described main components', 'Discussed a trade-off', 'Covered failure or duplicate handling'] : format === 'salary' ? ['Clarified offer components', 'Used only real or clearly fictional numbers', 'Stayed respectful and specific'] : ['Stated assumptions', 'Asked a clarifying question', 'Proposed an analysis', 'Said how to validate the result'];
  return (
    <div className="card flat section">
      <h4>Format-specific checks</h4>
      <p className="small muted">Basis: your reasoning review. {format === 'coding' ? 'No code was executed — the test runner is not configured.' : 'Hypothetical answers are judged on reasoning, not personal achievements.'}</p>
      {items.map((i) => <label key={i} style={{ fontWeight: 400 }}><input type="checkbox" checked={!!checks[i]} onChange={(e) => setChecks({ ...checks, [i]: e.target.checked })} /> {i}</label>)}
    </div>
  );
}

function DeliveryObservations({ s, mi }: { s: Session; mi: number }) {
  const { d } = useStore();
  const turns = s.turns.filter((t) => t.mainIndex === mi && t.role === 'candidate' && !t.skipped);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  return (
    <div className="card flat section">
      <h4>Delivery observations</h4>
      <p className="small muted">Only from actual recordings and your typed transcript. These are observations, not a hiring score. Accent and greetings are never penalized.</p>
      <ul className="small">
        {turns.map((t) => {
          const tv = latestTranscript(d, t.id);
          if (!t.durationSec || !tv) return <li key={t.id}>{t.kind}: no recording duration — no speaking rate shown.</li>;
          const words = wordCount(tv.text);
          const wpm = Math.round(words / (t.durationSec / 60));
          const fillers = (tv.text.match(/\b(um+|uh+|erm|you know)\b/gi) || []).length;
          return <li key={t.id}>{t.kind === 'retry' ? 'Retry' : t.kind === 'answer' ? 'First answer' : 'Follow-up reply'}: {t.durationSec}s, {words} words → ~{wpm} words/min (transcript v{tv.version}); filler words written in transcript: {fillers}.</li>;
        })}
      </ul>
      {s.mode === 'video' && (
        <>
          <p className="small"><strong>Video self-review checklist</strong> (automated video analysis is not available):</p>
          {['I could see my face clearly', 'I looked toward the camera when making key points', 'My pace felt steady when I watched it back'].map((c) => (
            <label key={c} style={{ fontWeight: 400 }}><input type="checkbox" checked={!!checks[c]} onChange={(e) => setChecks({ ...checks, [c]: e.target.checked })} /> {c}</label>
          ))}
        </>
      )}
    </div>
  );
}
