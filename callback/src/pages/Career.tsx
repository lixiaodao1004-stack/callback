import { useState } from 'react';
import { useStore } from '../lib/store';
import type { ShareGrant } from '../lib/types';
import { Badge, Banner, Empty, Field } from '../ui/kit';
import { canViewSession, COHORT_SESSIONS, COHORT_STUDENTS, cohortCards, type DemoRole } from '../lib/cohort';
import { currentFeedback, firstAnswerTurn, retryTurn } from '../lib/derive';
import { nowIso, uid } from '../lib/text';

export function CareerPage() {
  const { kind, loadDemo } = useStore();
  if (kind !== 'demo') {
    return (
      <>
        <h1>Career center</h1>
        <Banner tone="info">Accounts and organizations are not configured, so there is no real counselor to share with yet. Your work stays on this device.</Banner>
        <div className="card section">
          <h2>What will be possible</h2>
          <ul>
            <li>Share a selected report or session snapshot with an assigned counselor — summary only by default, never recordings unless you choose.</li>
            <li>Revoke access at any time (copies already downloaded cannot be recalled).</li>
            <li>Receive assignments and annotated feedback.</li>
          </ul>
          <SharePreview />
          <button className="btn" onClick={loadDemo} style={{ marginTop: 12 }}>See the fictional cohort demo</button>
        </div>
      </>
    );
  }
  return <DemoCareer />;
}

function SharePreview() {
  const { d } = useStore();
  const sessions = Object.values(d.sessions).filter((s) => s.state === 'saved' || s.state === 'feedback');
  const [sid, setSid] = useState(sessions[0]?.id ?? '');
  const [scope, setScope] = useState({ summary: true, transcript: false, recording: false, materials: false });
  if (!sessions.length) return <p className="small muted">Complete a session to preview what sharing would include.</p>;
  return (
    <div className="card soft flat">
      <h3>Preview what would be shared</h3>
      <Field label="Session" id="sp-s"><select id="sp-s" value={sid} onChange={(e) => setSid(e.target.value)}>{sessions.map((s) => <option key={s.id} value={s.id}>{d.questions[s.questionIds[0]]?.text}</option>)}</select></Field>
      {(['summary', 'transcript', 'recording', 'materials'] as const).map((k) => <label key={k} style={{ fontWeight: 400 }}><input type="checkbox" checked={scope[k]} onChange={(e) => setScope({ ...scope, [k]: e.target.checked })} /> {k}</label>)}
      <pre className="source-text small" style={{ marginTop: 8 }}>{snapshot(d, sid, scope)}</pre>
      <button className="btn" disabled title="Accounts are not configured">Share with counselor (unavailable)</button>
    </div>
  );
}

function snapshot(d: ReturnType<typeof useStore>['d'], sid: string, scope: ShareGrant['scope']): string {
  const s = d.sessions[sid];
  if (!s) return '';
  const f = firstAnswerTurn(s); const r = retryTurn(s);
  const fb = r ? currentFeedback(d, r.id) : f ? currentFeedback(d, f.id) : undefined;
  const lines = [`Question: ${d.questions[s.questionIds[0]]?.text}`];
  if (scope.summary) lines.push(`Summary: ${r && !r.skipped ? 'first answer and an independent retry' : 'first answer only'}${fb ? `; latest ${fb.mode.replace('_', ' ')}: ${fb.scores.map((x) => x.score ?? '—').join('/')}` : ''}`, fb?.priorityFix ? `Focus: ${fb.priorityFix.text}` : '');
  if (scope.transcript) lines.push('', 'Transcript:', ...s.turns.filter((t) => t.role !== 'coach').map((t) => `${t.role === 'candidate' ? 'Student' : t.speaker}: ${t.text}`));
  if (scope.recording) lines.push('', `Recordings: ${s.turns.filter((t) => t.recordingId).length}`);
  if (scope.materials) lines.push('', 'Materials: (selected materials would be attached)');
  return lines.filter((x) => x !== undefined).join('\n');
}

function DemoCareer() {
  const { d, mutate } = useStore();
  const [role, setRole] = useState<DemoRole>('counselor');
  const cards = cohortCards();
  const [assign, setAssign] = useState({ title: '', questions: '', due: '', rubric: 'core-rubric-v1' });
  const shares = Object.values(d.shares);
  const [annot, setAnnot] = useState<Record<string, { quote: string; note: string }>>({});
  const meiSession = Object.values(d.sessions).find((s) => s.state === 'saved');
  const [scope, setScope] = useState({ summary: true, transcript: false, recording: false, materials: false });
  const [purpose, setPurpose] = useState('Feedback on my dashboard story before my interview');

  return (
    <>
      <div className="row between">
        <h1>Career center <Badge tone="violet">Fictional cohort</Badge></h1>
        <div className="row">
          <label htmlFor="role" className="small" style={{ margin: 0 }}>Demo role</label>
          <select id="role" value={role} onChange={(e) => setRole(e.target.value as DemoRole)} style={{ width: 'auto' }}>
            <option value="student">Student (Mei L.)</option>
            <option value="counselor">Counselor</option>
            <option value="admin">Organization admin</option>
          </select>
        </div>
      </div>
      <Banner tone="demo">Six fictional students in a fictional organization. These numbers are demo data computed from a fixed ledger — not product impact. Switching roles only changes this fictional view; real permissions require server-side accounts, which are not configured.</Banner>

      {role !== 'student' && (
        <div className="grid three section">
          <Card label="Active students" value={`${cards.activeStudents}/${cards.totalStudents}`} />
          <Card label="Completed sessions" value={String(cards.completedSessions)} />
          <Card label="Independent retries" value={`${cards.independentRetries}/${cards.completedSessions}`} />
          <Card label="Open support requests" value={String(cards.openSupportRequests)} />
          <Card label="Sessions with missing evidence" value={`${cards.missingEvidence}/${cards.completedSessions}`} />
          <Card label="Sessions without a retry" value={`${cards.incompleteRetries}/${cards.completedSessions}`} />
        </div>
      )}

      {role === 'counselor' && (
        <>
          <section className="card section">
            <h2>Support requests (explicitly asked for)</h2>
            <ul>{COHORT_STUDENTS.filter((s) => s.supportRequest).map((s) => <li key={s.id}><strong>{s.name}</strong>: {s.supportRequest}</li>)}</ul>
            <p className="small muted">Low activity alone is not treated as a need for intervention.</p>
          </section>
          <section className="card section">
            <h2>Students</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Student</th><th>Sessions</th><th>Independent retries</th><th>Shared summaries</th></tr></thead>
                <tbody>
                  {COHORT_STUDENTS.map((st) => {
                    const ss = COHORT_SESSIONS.filter((x) => x.studentId === st.id);
                    return <tr key={st.id}><td>{st.name}{st.supportRequest && <> <Badge tone="info">Asked for help</Badge></>}</td><td>{ss.length}</td><td>{ss.filter((x) => x.independentRetry).length}/{ss.length}</td><td>{ss.filter((x) => canViewSession('counselor', null, x, 'summary')).length}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
            <p className="small muted">Transcripts are never visible without the student’s explicit share. Individual rubric scores are integers.</p>
          </section>
          <section className="card section">
            <h2>Shared with you</h2>
            {shares.length === 0 ? <p className="muted">Nothing shared yet. Switch to the student role to share a snapshot.</p> : shares.map((g) => (
              <div key={g.id} className="card flat" style={{ marginTop: 8 }}>
                <div className="row"><strong>Mei L.</strong> <span className="small muted">— {g.purpose}</span>{g.revoked && <Badge tone="danger">Access revoked</Badge>}</div>
                {g.revoked ? <p className="small">The student revoked access. Content is no longer available here.</p> : (
                  <>
                    <pre className="source-text small">{g.snapshotText}</pre>
                    <p className="small muted">Shared: {Object.entries(g.scope).filter(([, v]) => v).map(([k]) => k).join(', ')}</p>
                    {g.annotations.map((a, i) => <p key={i} className="small">On <span className="quote">“{a.quote}”</span>: {a.note}</p>)}
                    <div className="grid two">
                      <input type="text" aria-label="Quoted passage" placeholder="Quote a passage" value={annot[g.id]?.quote ?? ''} onChange={(e) => setAnnot({ ...annot, [g.id]: { quote: e.target.value, note: annot[g.id]?.note ?? '' } })} />
                      <input type="text" aria-label="Annotation" placeholder="Your note" value={annot[g.id]?.note ?? ''} onChange={(e) => setAnnot({ ...annot, [g.id]: { note: e.target.value, quote: annot[g.id]?.quote ?? '' } })} />
                    </div>
                    <button className="btn small" style={{ marginTop: 6 }} disabled={!annot[g.id]?.quote || !annot[g.id]?.note || !g.snapshotText.includes(annot[g.id].quote)} onClick={() => { mutate((x) => { x.shares[g.id].annotations.push(annot[g.id]); }); setAnnot({ ...annot, [g.id]: { quote: '', note: '' } }); }}>Add annotation</button>
                    {annot[g.id]?.quote && !g.snapshotText.includes(annot[g.id].quote) && <p className="small muted">The quote must match the shared text exactly.</p>}
                  </>
                )}
              </div>
            ))}
          </section>
          <section className="card section">
            <h2>Create an assignment</h2>
            <div className="grid two">
              <Field label="Title" id="as-t"><input id="as-t" type="text" value={assign.title} onChange={(e) => setAssign({ ...assign, title: e.target.value })} /></Field>
              <Field label="Due date" id="as-d"><input id="as-d" type="date" value={assign.due} onChange={(e) => setAssign({ ...assign, due: e.target.value })} /></Field>
            </div>
            <Field label="Questions (one per line)" id="as-q"><textarea id="as-q" rows={3} value={assign.questions} onChange={(e) => setAssign({ ...assign, questions: e.target.value })} /></Field>
            <Field label="Rubric" id="as-r"><select id="as-r" value={assign.rubric} onChange={(e) => setAssign({ ...assign, rubric: e.target.value })}><option value="core-rubric-v1">Core content rubric v1</option></select></Field>
            <button className="btn primary" disabled={!assign.title.trim() || !assign.questions.trim() || !assign.due} onClick={() => { mutate((x) => { const id = uid('asg'); x.assignments[id] = { id, title: assign.title.trim(), questions: assign.questions.split('\n').map((q) => q.trim()).filter(Boolean), dueDate: assign.due, modes: ['text', 'audio'], rubric: assign.rubric, studentIds: COHORT_STUDENTS.map((s) => s.id), createdAt: nowIso() }; }); setAssign({ title: '', questions: '', due: '', rubric: 'core-rubric-v1' }); }}>Create assignment</button>
            {Object.values(d.assignments).length > 0 && <ul style={{ marginTop: 10 }}>{Object.values(d.assignments).map((a) => <li key={a.id}>{a.title} · due {a.dueDate} · {a.questions.length} question(s) · 0/{a.studentIds.length} submitted</li>)}</ul>}
          </section>
        </>
      )}

      {role === 'admin' && (
        <section className="card section">
          <h2>Organization</h2>
          <p>Members: {COHORT_STUDENTS.length} students, 1 counselor (all fictional). Admins see aggregates only — not individual summaries or transcripts.</p>
          <p className="small muted">Rubric: core content rubric v1. Outcome data, if collected, would be optional student-reported entries with dates — never attributed to the product.</p>
        </section>
      )}

      {role === 'student' && (
        <section className="card section">
          <h2>Share with your counselor</h2>
          {!meiSession ? <Empty title="No saved session to share" /> : (
            <>
              <p className="small">Choose exactly what to share. The default is a summary only — no transcript or recording.</p>
              {(['summary', 'transcript', 'recording', 'materials'] as const).map((k) => <label key={k} style={{ fontWeight: 400 }}><input type="checkbox" checked={scope[k]} onChange={(e) => setScope({ ...scope, [k]: e.target.checked })} /> {k}</label>)}
              <Field label="Purpose" id="sh-p"><input id="sh-p" type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} /></Field>
              <pre className="source-text small">{snapshot(d, meiSession.id, scope)}</pre>
              <button className="btn primary" disabled={!Object.values(scope).some(Boolean) || !purpose.trim()} onClick={() => mutate((x) => { const id = uid('share'); x.shares[id] = { id, snapshotOf: meiSession.id, snapshotText: snapshot(x, meiSession.id, scope), scope, purpose: purpose.trim(), counselor: 'Ms. Rivera (fictional)', revoked: false, createdAt: nowIso(), annotations: [] }; })}>Share this snapshot</button>
              <h3 style={{ marginTop: 16 }}>Your shares</h3>
              {shares.length === 0 ? <p className="small muted">None.</p> : (
                <ul className="check-list">
                  {shares.map((g) => (
                    <li key={g.id} className="row" style={{ padding: '4px 0' }}>
                      {g.purpose} · {Object.entries(g.scope).filter(([, v]) => v).map(([k]) => k).join(', ')} {g.revoked ? <Badge tone="danger">Revoked</Badge> : <button className="btn small danger" onClick={() => mutate((x) => { x.shares[g.id].revoked = true; })}>Revoke access</button>}
                      {g.annotations.length > 0 && <span className="small">· {g.annotations.length} counselor note(s)</span>}
                    </li>
                  ))}
                </ul>
              )}
              <p className="small muted">Revoking blocks further access in the app. It cannot recall a copy the counselor already downloaded.</p>
            </>
          )}
        </section>
      )}
    </>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return <div className="card"><div className="small muted">{label}</div><div className="stat">{value}</div></div>;
}
