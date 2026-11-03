import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import type { Data, ID, PrepTask, TaskType } from '../lib/types';
import { Badge, Banner, Empty, Field, Tabs } from '../ui/kit';
import { comparability, currentFeedback, firstAnswerTurn, linkValidation, modeLabel, needsForJob, retryTurn, activeJobs } from '../lib/derive';
import { diffPlans, nextInterval, planTasks, WEIGHTS } from '../lib/planner';
import { addTask } from '../lib/ops';
import { addDays, nowIso, todayLocal, uid, zonedToInstant } from '../lib/text';
import { AIPlanPanel } from './AIPanels';

const TABS: [string, string][] = [['overview', 'Overview'], ['plan', 'Plan my prep time'], ['flashcards', 'Flashcards']];

export function ProgressPage({ route }: { route: string[] }) {
  const tab = route[1] ?? 'overview';
  return (
    <>
      <h1>Progress</h1>
      <Tabs tabs={TABS} current={tab} base="/progress" />
      {tab === 'overview' && <Overview />}
      {tab === 'plan' && <PlanTab />}
      {tab === 'flashcards' && <Flashcards />}
    </>
  );
}

function Overview() {
  const { d } = useStore();
  const sessions = Object.values(d.sessions);
  const drills = sessions.filter((s) => s.kind === 'drill');
  const completedDrills = drills.filter((s) => (s.state === 'feedback' || s.state === 'saved') && firstAnswerTurn(s) && !firstAnswerTurn(s)!.skipped);
  const retries = drills.filter((s) => { const r = retryTurn(s); return r && !r.skipped; });
  const independent = retries.filter((s) => !s.assisted);
  const goalNeeds = Object.values(d.needs).filter((n) => n.kind === 'goal' && d.jobs[n.jobId] && !d.jobs[n.jobId].archived);
  const supported = goalNeeds.filter((n) => Object.values(d.links).some((l) => l.needId === n.id && l.storyId && (l.relationship === 'direct' || l.relationship === 'transferable') && linkValidation(d, l) === 'valid'));
  const practiced = supported.filter((n) => sessions.some((s) => s.needId === n.id));
  const fbs = Object.values(d.feedback);
  const byMode = (m: string) => fbs.filter((f) => f.mode === m).length;
  const selfRecall = Object.values(d.flashcards).filter((f) => f.selfRecall).length;

  return (
    <div className="stack">
      <div className="grid three">
        <Stat label="Completed drills" value={completedDrills.length} of={drills.length} />
        <Stat label="Independent retries" value={independent.length} of={drills.length} note={retries.length > independent.length ? `${retries.length - independent.length} assisted retry(ies) counted separately` : undefined} />
        <Stat label="Supported needs practiced" value={practiced.length} of={supported.length} />
        <Stat label="Flashcards self-rated" value={selfRecall} of={Object.keys(d.flashcards).length} note="Self-reported recall, not evaluated performance" />
      </div>
      <section className="card">
        <h2>Evaluations by source</h2>
        <p className="small muted">Prepared example scores, your self-reviews, and live AI evaluations are kept apart and never averaged together.</p>
        <ul><li>Prepared example: {byMode('prepared_example')}</li><li>Self-review: {byMode('self_review')}</li><li>Live AI: {byMode('live')} <span className="small muted">(not configured)</span></li></ul>
      </section>
      <section className="card">
        <h2>Same-question comparisons</h2>
        {drills.length === 0 ? <Empty title="No drills yet">Complete a drill with an independent retry to compare like with like.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Question</th><th>Comparison</th><th>Mode</th></tr></thead>
              <tbody>
                {drills.map((s) => {
                  const f = firstAnswerTurn(s); const r = retryTurn(s);
                  const a = f ? currentFeedback(d, f.id) : undefined; const b = r ? currentFeedback(d, r.id) : undefined;
                  const c = comparability(a, b, true);
                  return (
                    <tr key={s.id}>
                      <td><a href={`#/practice/session/${s.id}`}>{d.questions[s.questionIds[0]]?.text}</a></td>
                      <td>{!r || r.skipped ? <Badge>Not completed</Badge> : c.eligible ? <span>{a!.scores.map((x) => x.score ?? '—').join('/')} → {b!.scores.map((x) => x.score ?? '—').join('/')}</span> : <span className="small muted">{c.reasons[0]}</span>}</td>
                      <td>{a ? modeLabel(a.mode) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted">Scores are listed as relevance / evidence / organization / clear language. Technical and behavioral rubrics are never averaged together. No readiness percentage or hiring prediction is shown.</p>
      </section>
    </div>
  );
}

function Stat({ label, value, of, note }: { label: string; value: number; of: number; note?: string }) {
  return (
    <div className="card">
      <div className="small muted">{label}</div>
      <div className="stat">{value} <span className="muted" style={{ fontSize: '1rem' }}>/ {of}</span></div>
      {note && <div className="small muted">{note}</div>}
    </div>
  );
}

const TYPE_LABEL: Record<TaskType, string> = { collect_fact: 'Confirm a fact', prepare_story: 'Prepare a story', practice_question: 'Practice a question', independent_retry: 'Unassisted retry', review_research: 'Review research', discovery_drill: 'Clarifying-question drill', flashcard_review: 'Flashcard review', material: 'Material task' };

/** Rule-based task candidates linked to real objects. */
function candidateTasks(d: Data, jobId: ID | null): Omit<PrepTask, 'id' | 'createdAt' | 'key' | 'status' | 'pinned'>[] {
  if (!jobId) return [];
  const out: Omit<PrepTask, 'id' | 'createdAt' | 'key' | 'status' | 'pinned'>[] = [];
  const needs = needsForJob(d, jobId).filter((n) => n.kind === 'goal');
  for (const n of needs) {
    const links = Object.values(d.links).filter((l) => l.needId === n.id && l.storyId && linkValidation(d, l) === 'valid' && (l.relationship === 'direct' || l.relationship === 'transferable'));
    if (!links.length) {
      out.push({ jobId, title: `Find or add evidence for “${n.title}”`, type: 'prepare_story', minutes: 10, rationale: 'No supported evidence yet for this need.', prerequisites: [], needIds: [n.id], storyIds: [], questionId: null, importance: n.priority === 'high' ? 4 : 3, source: 'rule' });
      continue;
    }
    for (const l of links) {
      const st = d.stories[l.storyId!];
      if (st && !st.howKnown.trim()) out.push({ jobId, title: `Confirm how you know the result of “${st.title}”`, type: 'collect_fact', minutes: 5, rationale: '“How the result is known” is blank.', prerequisites: [], needIds: [n.id], storyIds: [st.id], questionId: null, importance: 3, source: 'rule' });
    }
    const practiced = Object.values(d.sessions).some((s) => s.needId === n.id);
    if (!practiced) out.push({ jobId, title: `Practice a question for “${n.title}”`, type: 'practice_question', minutes: 10, rationale: 'Supported, but not practiced yet.', prerequisites: [], needIds: [n.id], storyIds: links.map((l) => l.storyId!), questionId: Object.values(d.questions).find((q) => q.needId === n.id)?.id ?? null, importance: n.priority === 'high' ? 4 : 3, source: 'rule' });
  }
  for (const s of Object.values(d.sessions).filter((x) => x.jobId === jobId && x.kind === 'drill')) {
    const r = retryTurn(s);
    if (!r || r.skipped) out.push({ jobId, title: `Unassisted retry: ${d.questions[s.questionIds[0]]?.text ?? ''}`, type: 'independent_retry', minutes: 5, rationale: 'The drill has no completed independent retry.', prerequisites: [], needIds: s.needId ? [s.needId] : [], storyIds: [], questionId: s.questionIds[0], importance: 3, source: 'rule' });
  }
  if (!d.jobs[jobId]?.research.length) out.push({ jobId, title: 'Add one sourced company note', type: 'review_research', minutes: 10, rationale: 'No research notes yet.', prerequisites: [], needIds: [], storyIds: [], questionId: null, importance: 2, source: 'rule' });
  if (!Object.values(d.discoveries).some((x) => x.jobId === jobId)) out.push({ jobId, title: 'Rehearse clarifying questions (team-priority drill)', type: 'discovery_drill', minutes: 10, rationale: 'You have not practiced asking about the team’s priority.', prerequisites: [], needIds: [], storyIds: [], questionId: null, importance: 2, source: 'rule' });
  return out;
}

function PlanTab() {
  const { d, p, mutate } = useStore();
  const jobs = activeJobs(d);
  const [jobId, setJobId] = useState<string>(d.currentJobId ?? jobs[0]?.id ?? '');
  const tz = p.prefs.timezone;
  const today = todayLocal(tz);
  const upcomingRound = Object.values(d.rounds).filter((r) => r.jobId === jobId && r.date).sort((a, b) => a.date.localeCompare(b.date)).find((r) => zonedToInstant(r.date, r.timezone || tz).getTime() > Date.now() - 86400000 * 30);
  const roundDate = upcomingRound ? new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(zonedToInstant(upcomingRound.date, upcomingRound.timezone || tz)) : '';
  const isDemo = d.workspaceKind === 'demo';
  const [interviewDate, setInterviewDate] = useState(isDemo ? '' : roundDate);
  const [horizon, setHorizon] = useState(isDemo ? 1 : 7);
  const [perDay, setPerDay] = useState(20);
  const [sessionLength, setSessionLength] = useState(30);
  const [breakMin, setBreakMin] = useState(5);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [unavailInput, setUnavailInput] = useState('');
  const needs = needsForJob(d, jobId || null);
  const [focus, setFocus] = useState<string>(isDemo ? 'n_dash' : '');
  const tasks = Object.values(d.tasks).filter((t) => t.jobId === (jobId || null));
  const uncovered = needs.filter((n) => n.kind === 'goal' && !Object.values(d.links).some((l) => l.needId === n.id && l.storyId && linkValidation(d, l) === 'valid')).map((n) => n.id);
  const result = useMemo(() => planTasks({ tasks, startDate: today, horizonDays: horizon, minutesPerDay: perDay, unavailableDates: unavailable, sessionLength, breakMinutes: breakMin, focusNeedId: focus || null, uncoveredNeedIds: uncovered, interviewDate: interviewDate || null }), [JSON.stringify(tasks), today, horizon, perDay, unavailable.join(), sessionLength, breakMin, focus, uncovered.join(), interviewDate]);
  const plan = Object.values(d.plans).find((x) => x.jobId === (jobId || null));
  const titles = Object.fromEntries(tasks.map((t) => [t.id, t.title]));
  const moved = plan ? diffPlans(plan.scheduledIds, result.scheduled.map((s) => s.taskId), titles) : [];
  const cands = candidateTasks(d, jobId || null).filter((c) => !tasks.some((t) => t.title === c.title));
  const [taskErr, setTaskErr] = useState<string | null>(null);

  function savePlan() {
    mutate((x) => {
      const existing = Object.values(x.plans).find((y) => y.jobId === (jobId || null));
      const id = existing?.id ?? uid('plan');
      x.plans[id] = { id, jobId: jobId || null, budgetMinutes: result.budget, sessionLength, focusNeedId: focus || null, horizonDays: horizon, scheduledIds: result.scheduled.map((s) => s.taskId), unscheduledIds: result.unscheduled.map((u) => u.taskId), explanation: result.explanation, computedAt: nowIso() };
    });
  }
  const setTask = (id: ID, patch: Partial<PrepTask>) => mutate((x) => { Object.assign(x.tasks[id], patch); });

  return (
    <div className="stack">
      <Banner tone="info">Plans are scheduled by transparent rules within the minutes you give. Estimates are planning estimates, not predicted hiring gains. Callback never reads or writes your calendar.</Banner>
      <div className="grid two">
        <section className="card">
          <h2>Your time</h2>
          <div className="grid two">
            <Field label="Job" id="pl-j"><select id="pl-j" value={jobId} onChange={(e) => setJobId(e.target.value)}><option value="">No job</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.role || 'Untitled'}</option>)}</select></Field>
            <Field label="Focus need" id="pl-f"><select id="pl-f" value={focus} onChange={(e) => setFocus(e.target.value)}><option value="">None</option>{needs.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}</select></Field>
            <Field label={`Interview date (${tz})`} id="pl-i" hint={upcomingRound ? `From round “${upcomingRound.name}”` : 'Optional'}><input id="pl-i" type="date" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} /></Field>
            <Field label="Plan horizon (days)" id="pl-h"><input id="pl-h" type="number" min={1} max={60} value={horizon} onChange={(e) => setHorizon(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} /></Field>
            <Field label="Minutes available per day" id="pl-m"><input id="pl-m" type="number" min={0} max={600} value={perDay} onChange={(e) => setPerDay(Math.max(0, Math.min(600, Number(e.target.value) || 0)))} /></Field>
            <Field label="Preferred session length (min)" id="pl-s"><input id="pl-s" type="number" min={5} max={180} value={sessionLength} onChange={(e) => setSessionLength(Math.max(5, Number(e.target.value) || 30))} /></Field>
            <Field label="Break between sessions (min)" id="pl-b"><input id="pl-b" type="number" min={0} max={60} value={breakMin} onChange={(e) => setBreakMin(Math.max(0, Number(e.target.value) || 0))} /></Field>
            <Field label="Unavailable dates" id="pl-u">
              <div className="row"><input id="pl-u" type="date" value={unavailInput} onChange={(e) => setUnavailInput(e.target.value)} style={{ width: 'auto', flex: 1 }} /><button className="btn small" disabled={!unavailInput} onClick={() => { setUnavailable([...new Set([...unavailable, unavailInput])]); setUnavailInput(''); }}>Add</button></div>
              <div className="row" style={{ marginTop: 4 }}>{unavailable.map((u) => <button key={u} className="btn small ghost" onClick={() => setUnavailable(unavailable.filter((x) => x !== u))}>{u} ✕</button>)}</div>
            </Field>
          </div>
          <details><summary className="small">How tasks are ranked</summary><p className="small">Score = importance × {WEIGHTS.importance} + {WEIGHTS.focusNeed} if it targets your focus need + {WEIGHTS.uncoveredNeed} if it targets an uncovered need + {WEIGHTS.repeatedDifficulty} if it came from practice diagnosis − {WEIGHTS.diminishing} for each already-scheduled task on the same need. Pinned tasks go first. Ties break by task key. Prerequisites always come first; nothing is scheduled past your budget.</p></details>
        </section>

        <section className="card">
          <div className="row between"><h2 style={{ margin: 0 }}>Plan</h2><button className="btn primary small" onClick={savePlan}>Save plan</button></div>
          <ul className="small">{result.explanation.map((e) => <li key={e}>{e}</li>)}</ul>
          {plan && moved.length > 0 && <Banner tone="info"><strong>Changed since saved plan:</strong> {moved.join(' · ')}</Banner>}
          {result.scheduled.length === 0 ? <p className="muted">No tasks scheduled.</p> : (
            result.days.filter((dd) => result.scheduled.some((s) => s.date === dd.date)).map((dd) => (
              <div key={dd.date} style={{ marginBottom: 8 }}>
                <strong>{dd.date}</strong> <span className="small muted">{dd.used}/{dd.capacity} min</span>
                <ol className="small">{result.scheduled.filter((s) => s.date === dd.date).map((s) => <li key={s.taskId}>{d.tasks[s.taskId].title} · {d.tasks[s.taskId].minutes} min <span className="muted">(starts at +{s.startMinute} min)</span></li>)}</ol>
              </div>
            ))
          )}
          {result.unscheduled.length > 0 && (
            <>
              <h4>Not scheduled</h4>
              <ul className="small">{result.unscheduled.map((u) => <li key={u.taskId}>{d.tasks[u.taskId].title} — <span className="muted">{u.reason}</span></li>)}</ul>
              <p className="small">Options: add minutes, extend the horizon, or choose a focus need.</p>
            </>
          )}
        </section>
      </div>

      <section className="card">
        <h2>Tasks</h2>
        {taskErr && <p className="error-text">{taskErr}</p>}
        {tasks.length === 0 ? <p className="muted">No tasks yet. Add suggested tasks below.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Task</th><th>Min</th><th>Importance</th><th>Status</th><th>Pin</th></tr></thead>
              <tbody>
                {tasks.sort((a, b) => a.key.localeCompare(b.key)).map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.key}</strong> {t.title}
                      <div className="small muted">{TYPE_LABEL[t.type]} · {t.rationale}{t.prerequisites.length ? ` · after ${t.prerequisites.map((pp) => d.tasks[pp]?.key ?? '?').join(', ')}` : ''} · source: {t.source === 'prepared_example' ? 'prepared example' : t.source}</div>
                    </td>
                    <td><input type="number" aria-label="Minutes" min={1} max={60} value={t.minutes} onChange={(e) => { const v = Math.round(Number(e.target.value)); if (v >= 1 && v <= 60) { setTask(t.id, { minutes: v }); setTaskErr(null); } else setTaskErr('Task minutes must be a whole number from 1 to 60.'); }} style={{ width: 70 }} /></td>
                    <td><select aria-label="Importance" value={t.importance} onChange={(e) => setTask(t.id, { importance: Number(e.target.value) })} style={{ width: 70 }}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></td>
                    <td><select aria-label="Status" value={t.status} onChange={(e) => setTask(t.id, { status: e.target.value as PrepTask['status'] })} style={{ width: 'auto' }}><option value="todo">To do</option><option value="done">Done</option><option value="skipped">Skipped</option></select></td>
                    <td><input type="checkbox" aria-label="Pin task" checked={t.pinned} onChange={(e) => setTask(t.id, { pinned: e.target.checked })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cands.length > 0 && (
          <>
            <h3 style={{ marginTop: 12 }}>Suggested tasks (from rules)</h3>
            <ul className="check-list">{cands.map((c) => <li key={c.title} className="row" style={{ padding: '4px 0' }}><button className="btn small" onClick={() => mutate((x) => { addTask(x, c); })}>+ Add</button> <span className="small">{c.title} · {c.minutes} min <span className="muted">— {c.rationale}</span></span></li>)}</ul>
          </>
        )}
        <AIPlanPanel jobId={jobId || null} />
      </section>
    </div>
  );
}

function Flashcards() {
  const { d, p, mutate } = useStore();
  const today = todayLocal(p.prefs.timezone);
  const cards = Object.values(d.flashcards).sort((a, b) => a.nextReview.localeCompare(b.nextReview));
  const due = cards.filter((c) => c.nextReview <= today);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  return (
    <div className="stack">
      <Banner tone="info">Review rule: Again → tomorrow · Hard → same interval · Good → interval × 2 (at least 2 days) · Easy → interval × 3 (at least 4 days). You can edit any date. This is a simple declared rule, not a proven learning method. Reminders appear only here; no notifications are sent.</Banner>
      <p><strong>{due.length}</strong> due today of {cards.length}.</p>
      {cards.length === 0 && <div className="card"><Empty title="No flashcards">Make one from the Answer Builder in a job’s Answers tab.</Empty></div>}
      {cards.map((c) => (
        <div className="card" key={c.id}>
          <div className="row between"><strong>{c.front}</strong>{c.nextReview <= today ? <Badge tone="warn">Due</Badge> : <Badge>Next {c.nextReview}</Badge>}</div>
          {!shown[c.id] ? <button className="btn small" style={{ marginTop: 8 }} onClick={() => setShown({ ...shown, [c.id]: true })}>Show my cues</button> : (
            <>
              <ul>{c.cues.length ? c.cues.map((q) => <li key={q}>{q}</li>) : <li className="muted">No cues — add memory cues to the story.</li>}</ul>
              <div className="row">
                <span className="small">How well did you recall it?</span>
                {(['again', 'hard', 'good', 'easy'] as const).map((r) => (
                  <button key={r} className="btn small" onClick={() => { mutate((x) => { const f = x.flashcards[c.id]; const iv = nextInterval(f.interval, r); f.interval = iv; f.selfRecall = r; f.nextReview = addDays(today, iv); f.history.push({ at: nowIso(), rating: r }); }); setShown({ ...shown, [c.id]: false }); }}>{r}</button>
                ))}
              </div>
            </>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <label className="small" htmlFor={`nr-${c.id}`} style={{ margin: 0 }}>Next review</label>
            <input id={`nr-${c.id}`} type="date" value={c.nextReview} onChange={(e) => e.target.value && mutate((x) => { x.flashcards[c.id].nextReview = e.target.value; })} style={{ width: 'auto' }} />
            <span className="small muted">Self-rated {c.history.length} time(s)</span>
            <button className="btn small ghost danger" onClick={() => mutate((x) => { delete x.flashcards[c.id]; })}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
