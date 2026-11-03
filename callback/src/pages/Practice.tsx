import { useRef, useState } from 'react';
import { useStore } from '../lib/store';
import type { Question, QuestionFormat, Session, WorkspaceDoc } from '../lib/types';
import { Badge, Banner, Empty, Field, Tabs, go } from '../ui/kit';
import { createSession, stateLabel } from '../lib/session';
import { FORMAT_LABEL } from '../lib/questions';
import { activeJobs, needsForJob } from '../lib/derive';
import { nowIso, uid } from '../lib/text';
import { download } from '../lib/materials';
import { SessionView } from './SessionView';
import { DiagnosisTab, DiscoveryTab } from './Innovations';

const TABS: [string, string][] = [['start', 'Start practice'], ['library', 'Question library'], ['workspaces', 'Professional workspaces'], ['diagnosis', 'Find what to practice next'], ['discovery', 'Discover the team’s priority']];

export function PracticePage({ route }: { route: string[] }) {
  const sub = route[1] ?? 'start';
  if (sub === 'session' && route[2]) return <SessionView id={route[2]} />;
  const tab = sub === 'new' || sub === 'start' ? 'start' : sub;
  return (
    <>
      <h1>Practice room</h1>
      <Tabs tabs={TABS} current={tab} base="/practice" />
      {tab === 'start' && <StartTab key={route.join('/')} presetNeed={sub === 'new' ? route[2] : undefined} presetQuestion={sub === 'start' ? route[2] : undefined} />}
      {tab === 'library' && <LibraryTab />}
      {tab === 'workspaces' && <WorkspacesTab />}
      {tab === 'diagnosis' && <DiagnosisTab />}
      {tab === 'discovery' && <DiscoveryTab />}
    </>
  );
}

// Formats outside the current STEM-interview demo. Data is unchanged; the UI keeps them behind filters.
const LATER: QuestionFormat[] = ['coding', 'system_design', 'salary'];
const LATER_NOTE = 'Later expansion — not part of the current STEM-interview demo.';

const PANEL_DEFAULT = ['Priya (analytics manager, fictional)', 'Tom (operations lead, fictional)'];

function StartTab({ presetNeed, presetQuestion }: { presetNeed?: string; presetQuestion?: string }) {
  const { d, p, mutate } = useStore();
  const jobs = activeJobs(d);
  const presetJob = presetNeed ? d.needs[presetNeed]?.jobId : presetQuestion ? d.questions[presetQuestion]?.jobId : null;
  const [jobId, setJobId] = useState<string>(presetJob ?? d.currentJobId ?? jobs[0]?.id ?? '');
  const needs = needsForJob(d, jobId || null);
  const [needId, setNeedId] = useState<string>(presetNeed ?? '');
  const [kind, setKind] = useState<Session['kind']>('drill');
  const [mode, setMode] = useState<Session['mode']>(p.prefs.defaultMode);
  const [style, setStyle] = useState<Session['style']>('neutral');
  const [duration, setDuration] = useState(15);
  const [panel, setPanel] = useState(PANEL_DEFAULT.join('\n'));
  const questions = Object.values(d.questions).filter((q) => q.jobId === null || q.jobId === jobId);
  const defaultQ = presetQuestion ?? (needId ? questions.find((q) => q.needId === needId)?.id : undefined) ?? (d.workspaceKind === 'demo' ? 'q_fixture' : questions[0]?.id) ?? '';
  const [qid, setQid] = useState(defaultQ);
  const [multi, setMulti] = useState<string[]>([]);
  const [showLater, setShowLater] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessions = Object.values(d.sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const open = sessions.filter((s) => s.state !== 'saved');

  function start() {
    const ids = kind === 'drill' ? [qid] : multi;
    if (!ids.length || ids.some((x) => !d.questions[x])) return setError(kind === 'drill' ? 'Choose a question.' : 'Choose at least one question.');
    const panelList = panel.split('\n').map((x) => x.trim()).filter(Boolean);
    if (kind === 'panel' && !panelList.length) return setError('Add at least one panel role.');
    const s = createSession({ jobId: jobId || null, needId: needId || null, questionIds: ids, kind, mode, style, panel: kind === 'panel' ? panelList : [], durationMin: duration }, d.questions, d.workspaceKind === 'demo');
    mutate((x) => { x.sessions[s.id] = s; });
    go(`/practice/session/${s.id}`);
  }

  return (
    <div className="grid two">
      <section className="card">
        <h2>Set up a session</h2>
        <div className="grid two">
          <Field label="Job" id="ps-job">
            <select id="ps-job" value={jobId} onChange={(e) => { setJobId(e.target.value); setNeedId(''); }}>
              <option value="">No specific job</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.role || 'Untitled'} — {j.company || '?'}</option>)}
            </select>
          </Field>
          <Field label="Job need" id="ps-need">
            <select id="ps-need" value={needId} onChange={(e) => setNeedId(e.target.value)}>
              <option value="">None</option>
              {needs.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
            </select>
          </Field>
          <Field label="Session type" id="ps-kind">
            <select id="ps-kind" value={kind} onChange={(e) => setKind(e.target.value as Session['kind'])}>
              <option value="drill">Single-question drill (with retry)</option>
              <option value="full">Full practice interview</option>
              <option value="panel">Panel practice</option>
            </select>
          </Field>
          <Field label="Mode" id="ps-mode" hint="Microphone/camera permission is requested only when you press Record.">
            <select id="ps-mode" value={mode} onChange={(e) => setMode(e.target.value as Session['mode'])}>
              <option value="text">Text</option><option value="audio">Audio</option><option value="video">Video</option>
            </select>
          </Field>
          <Field label="Interviewer style" id="ps-style" hint="Changes tone and challenge, never evaluation fairness.">
            <select id="ps-style" value={style} onChange={(e) => setStyle(e.target.value as Session['style'])}>
              <option value="friendly">Friendly</option><option value="neutral">Neutral</option><option value="challenging">Challenging</option>
            </select>
          </Field>
          <Field label="Duration (minutes)" id="ps-dur"><input id="ps-dur" type="number" min={5} max={90} value={duration} onChange={(e) => setDuration(Math.max(5, Math.min(90, Number(e.target.value) || 15)))} /></Field>
        </div>
        {kind === 'drill' ? (
          <Field label="Question" id="ps-q">
            <select id="ps-q" value={qid} onChange={(e) => setQid(e.target.value)}>
              <optgroup label="Core practice">
                {questions.filter((q) => !LATER.includes(q.format)).map((q) => <option key={q.id} value={q.id}>{q.origin === 'generated' ? '◆ ' : ''}[{FORMAT_LABEL[q.format]}] {q.text}</option>)}
              </optgroup>
              <optgroup label="Later expansion (coding, system design, salary)">
                {questions.filter((q) => LATER.includes(q.format)).map((q) => <option key={q.id} value={q.id}>[{FORMAT_LABEL[q.format]} · later] {q.text}</option>)}
              </optgroup>
            </select>
          </Field>
        ) : (
          <fieldset style={{ border: 'none', padding: 0 }}>
            <legend style={{ fontWeight: 500, fontSize: '0.9rem' }}>Questions ({multi.length} selected — at most 3 follow-ups each)</legend>
            <div style={{ maxHeight: 220, overflow: 'auto' }} className="card flat soft">
              {questions.filter((q) => showLater || !LATER.includes(q.format) || multi.includes(q.id)).map((q) => (
                <label key={q.id} style={{ fontWeight: 400 }} className="small">
                  <input type="checkbox" checked={multi.includes(q.id)} onChange={(e) => setMulti(e.target.checked ? [...multi, q.id] : multi.filter((x) => x !== q.id))} /> [{FORMAT_LABEL[q.format]}{LATER.includes(q.format) ? ' · later' : ''}] {q.text}
                </label>
              ))}
            </div>
            <label className="small" style={{ fontWeight: 400, marginTop: 4 }}><input type="checkbox" checked={showLater} onChange={(e) => setShowLater(e.target.checked)} /> Show later-expansion formats (coding, system design, salary)</label>
          </fieldset>
        )}
        {kind === 'drill' && d.questions[qid] && LATER.includes(d.questions[qid].format) && <p className="small muted">{LATER_NOTE}</p>}
        {kind === 'panel' && <Field label="Panel roles (one per line, fictional)" id="ps-panel" hint="Roles take turns, one at a time."><textarea id="ps-panel" rows={3} value={panel} onChange={(e) => setPanel(e.target.value)} /></Field>}
        {error && <p className="error-text" role="alert">⚠ {error}</p>}
        <button className="btn primary" onClick={start} style={{ marginTop: 8 }}>Start session</button>
      </section>
      <section className="card">
        <h2>Your sessions</h2>
        {sessions.length === 0 ? <Empty title="No sessions yet">Start one on the left.</Empty> : (
          <>
            {open.length > 0 && <p className="small"><strong>{open.length}</strong> unfinished — resume any time.</p>}
            <ul className="check-list">
              {sessions.slice(0, 12).map((s) => (
                <li key={s.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <a href={`#/practice/session/${s.id}`}>{d.questions[s.questionIds[0]]?.text ?? 'Session'}</a>
                  <div className="row small"><Badge>{stateLabel(s)}</Badge><Badge>{s.mode}</Badge>{s.fixtureId && <Badge tone="violet">◆ Prepared example</Badge>}<span className="muted">{new Date(s.updatedAt).toLocaleString()}</span></div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function LibraryTab() {
  const { d, mutate } = useStore();
  const [search, setSearch] = useState('');
  const [format, setFormat] = useState<'' | QuestionFormat>('');
  const [stage, setStage] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [origin, setOrigin] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [includeLater, setIncludeLater] = useState(false);
  const [newQ, setNewQ] = useState({ text: '', format: 'behavioral' as QuestionFormat });
  const qs = Object.values(d.questions).filter((q) =>
    (!search || q.text.toLowerCase().includes(search.toLowerCase()) || q.theme.toLowerCase().includes(search.toLowerCase())) &&
    (!format || q.format === format) && (!stage || q.stage === stage) && (!difficulty || q.difficulty === difficulty) && (!origin || q.origin === origin) && (!savedOnly || q.saved) && (includeLater || !!format || !LATER.includes(q.format)));
  const hiddenLater = !includeLater && !format ? Object.values(d.questions).filter((q) => LATER.includes(q.format)).length : 0;
  return (
    <div className="stack">
      <Banner tone="info">Seeded questions are original practice questions. “Generated” questions come from your confirmed job needs. None are leaked or confirmed company questions.</Banner>
      <div className="card">
        <div className="grid three">
          <Field label="Search" id="ql-s"><input id="ql-s" type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></Field>
          <Field label="Format" id="ql-f"><select id="ql-f" value={format} onChange={(e) => setFormat(e.target.value as QuestionFormat)}><option value="">All core formats</option>{Object.entries(FORMAT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}{LATER.includes(k as QuestionFormat) ? ' (later expansion)' : ''}</option>)}</select></Field>
          <Field label="Interview stage" id="ql-st"><select id="ql-st" value={stage} onChange={(e) => setStage(e.target.value)}><option value="">All</option><option value="recruiter">Recruiter</option><option value="hiring_manager">Hiring manager</option><option value="technical">Technical</option><option value="final">Final</option></select></Field>
          <Field label="Difficulty" id="ql-d"><select id="ql-d" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option value="">All</option><option value="intro">Intro</option><option value="standard">Standard</option><option value="stretch">Stretch</option></select></Field>
          <Field label="Source" id="ql-o"><select id="ql-o" value={origin} onChange={(e) => setOrigin(e.target.value)}><option value="">All</option><option value="seed">Seeded</option><option value="generated">Generated from a need</option><option value="user">Written by you</option></select></Field>
          <div className="field"><label>&nbsp;</label><label style={{ fontWeight: 400 }}><input type="checkbox" checked={savedOnly} onChange={(e) => setSavedOnly(e.target.checked)} /> Saved collection only</label><label style={{ fontWeight: 400 }}><input type="checkbox" checked={includeLater} onChange={(e) => setIncludeLater(e.target.checked)} /> Include later expansion</label></div>
        </div>
      </div>
      <p className="small muted">{qs.length} question(s){hiddenLater > 0 && ` · ${hiddenLater} later-expansion questions (coding, system design, salary) hidden`}</p>
      <div className="card">
        {qs.length === 0 ? <Empty title="No questions match">Clear a filter or add your own.</Empty> : (
          <ul className="check-list">
            {qs.map((q) => (
              <li key={q.id} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <button className="btn small ghost" aria-label={q.saved ? 'Remove from saved' : 'Save to collection'} aria-pressed={!!q.saved} onClick={() => mutate((x) => { x.questions[q.id].saved = !q.saved; })}>{q.saved ? '★' : '☆'}</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>{q.text}</div>
                  <div className="row small"><Badge>{FORMAT_LABEL[q.format]}</Badge>{LATER.includes(q.format) && <Badge tone="warn">Later expansion</Badge>}<Badge tone="neutral">{q.difficulty}</Badge>{q.origin === 'generated' && <Badge tone="violet">Generated practice question</Badge>}{q.origin === 'user' && <Badge tone="info">Yours</Badge>}<span className="muted">{q.theme}</span></div>
                </div>
                <a className="btn small" href={`#/practice/start/${q.id}`}>Practice</a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <section className="card">
        <h3>Add your own question</h3>
        <div className="grid two">
          <Field label="Question" id="nq-t"><input id="nq-t" type="text" value={newQ.text} onChange={(e) => setNewQ({ ...newQ, text: e.target.value })} /></Field>
          <Field label="Format" id="nq-f"><select id="nq-f" value={newQ.format} onChange={(e) => setNewQ({ ...newQ, format: e.target.value as QuestionFormat })}>{Object.entries(FORMAT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        </div>
        <button className="btn primary" disabled={!newQ.text.trim()} onClick={() => { mutate((x) => { const id = uid('q'); x.questions[id] = { id, text: newQ.text.trim(), format: newQ.format, theme: 'custom', difficulty: 'standard', stage: 'hiring_manager', origin: 'user', jobId: null, needId: null, language: x.profile.practiceLanguage } satisfies Question; }); setNewQ({ ...newQ, text: '' }); }}>Add question</button>
      </section>
    </div>
  );
}

// ---------------- Professional workspaces ----------------
const WS_FIELDS: Record<WorkspaceDoc['kind'], [string, string, boolean][]> = {
  coding: [['language', 'Language', false], ['problem', 'Problem', true], ['code', 'Code', true], ['tests', 'Test cases (input → expected)', true], ['notes', 'Reasoning notes', true]],
  system_design: [['requirements', 'Requirements', true], ['components', 'Components and data flow', true], ['tradeoffs', 'Trade-offs', true], ['discussion', 'Discussion notes', true]],
  case: [['assumptions', 'Assumptions', true], ['clarifying', 'Clarifying questions', true], ['analysis', 'Analysis', true], ['scratch', 'Scratchpad / table', true], ['recommendation', 'Recommendation', true]],
  salary: [['components', 'Offer components to clarify', true], ['numbers', 'Numbers (your own or clearly fictional)', true], ['wording', 'Practice wording', true], ['other', 'Non-salary factors to ask about', true]],
};
const WS_LABEL: Record<WorkspaceDoc['kind'], string> = { coding: 'Coding', system_design: 'System design', case: 'Product / data case', salary: 'Salary practice' };

function WorkspacesTab() {
  const { d, mutate } = useStore();
  const [kind, setKind] = useState<WorkspaceDoc['kind']>('case');
  const docs = Object.values(d.docs).filter((x) => x.kind === kind);
  const [docId, setDocId] = useState<string | null>(docs[0]?.id ?? null);
  const doc = docId ? d.docs[docId] : undefined;
  const fmtFor: Record<WorkspaceDoc['kind'], QuestionFormat[]> = { coding: ['coding'], system_design: ['system_design'], case: ['product_case', 'data_analysis'], salary: ['salary'] };
  const qs = Object.values(d.questions).filter((q) => fmtFor[kind].includes(q.format));

  function create(questionId: string | null) {
    const id = uid('doc');
    const q = questionId ? d.questions[questionId] : undefined;
    mutate((x) => { x.docs[id] = { id, kind, title: q?.text ?? `${WS_LABEL[kind]} workspace`, fields: kind === 'coding' ? { language: 'python', problem: q?.text ?? '' } : {}, revisions: [], questionId }; });
    setDocId(id);
  }

  return (
    <div className="stack">
      <div className="row">
        {(Object.keys(WS_LABEL) as WorkspaceDoc['kind'][]).map((k) => <button key={k} className={`btn small ${kind === k ? 'primary' : ''}`} onClick={() => { setKind(k); setDocId(Object.values(d.docs).find((x) => x.kind === k)?.id ?? null); }}>{WS_LABEL[k]}{k !== 'case' ? ' · later' : ''}</button>)}
      </div>
      {kind !== 'case' && <Banner tone="info">{LATER_NOTE} The workspace is kept for testing.</Banner>}
      {kind === 'salary' && <Banner tone="warn">Use your own offer numbers or clearly fictional ones. Callback has no salary benchmark source configured, so it shows none.</Banner>}
      {kind === 'case' && <Banner tone="info">Case answers are hypothetical. Your reasoning is reviewed; nothing here is written into your stories as experience.</Banner>}
      <div className="grid two">
        <section className="card">
          <h3>Start from a question</h3>
          <ul className="check-list">{qs.map((q) => <li key={q.id} className="row" style={{ padding: '4px 0' }}><button className="btn small" onClick={() => create(q.id)}>Open</button> <span className="small">{q.text}</span></li>)}</ul>
          <button className="btn small" onClick={() => create(null)}>Blank workspace</button>
          {docs.length > 0 && (
            <>
              <h3 style={{ marginTop: 12 }}>Saved</h3>
              <ul>{docs.map((x) => <li key={x.id}><button className="btn small ghost" onClick={() => setDocId(x.id)} aria-pressed={docId === x.id}>{x.title}</button> <span className="small muted">{x.revisions.length} revision(s)</span></li>)}</ul>
            </>
          )}
        </section>
        {doc ? <DocEditor key={doc.id} doc={doc} /> : <div className="card"><Empty title="No workspace open">Open one from a question.</Empty></div>}
      </div>
    </div>
  );
}

function DocEditor({ doc }: { doc: WorkspaceDoc }) {
  const { mutate } = useStore();
  const [fields, setFields] = useState<Record<string, string>>(doc.fields);
  const dirty = JSON.stringify(fields) !== JSON.stringify(doc.fields);
  const save = () => mutate((x) => { const dd = x.docs[doc.id]; dd.revisions.push({ at: nowIso(), fields: dd.fields }); dd.fields = fields; });
  const exportMd = () => download(`${doc.title.replace(/\W+/g, '-').toLowerCase()}.md`, `# ${doc.title}\n\n` + WS_FIELDS[doc.kind].map(([k, l]) => `## ${l}\n\n${fields[k] ?? ''}\n`).join('\n'));
  return (
    <section className="card">
      <h3>{doc.title}</h3>
      {doc.kind === 'system_design' && <DesignCanvas fields={fields} setFields={setFields} />}
      {WS_FIELDS[doc.kind].map(([k, l, multi]) => (
        <Field key={k} label={l} id={`${doc.id}-${k}`}>
          {k === 'language' ? (
            <select id={`${doc.id}-${k}`} value={fields[k] ?? 'python'} onChange={(e) => setFields({ ...fields, [k]: e.target.value })}>{['python', 'javascript', 'java', 'c++', 'sql'].map((x) => <option key={x}>{x}</option>)}</select>
          ) : multi ? (
            <textarea id={`${doc.id}-${k}`} className={k === 'code' ? 'code' : ''} value={fields[k] ?? ''} onChange={(e) => setFields({ ...fields, [k]: e.target.value })} rows={k === 'code' ? 12 : 3} spellCheck={k !== 'code'} />
          ) : null}
        </Field>
      ))}
      <div className="row">
        <button className="btn primary" disabled={!dirty} onClick={save}>Save revision</button>
        {doc.kind === 'coding' && <button className="btn" disabled title="No isolated test runner is configured">Run tests (unavailable)</button>}
        <button className="btn" onClick={exportMd}>Export .md</button>
      </div>
      {doc.kind === 'coding' && <p className="small muted">Tests are not executed: no isolated sandbox is configured. Any review of this code is a reasoning review, not an execution result.</p>}
      {doc.revisions.length > 0 && <details><summary className="small">Revision history ({doc.revisions.length})</summary><ol className="small">{doc.revisions.map((r, i) => <li key={i}>{new Date(r.at).toLocaleString()} <button className="btn small ghost" onClick={() => setFields(r.fields)}>Restore</button></li>)}</ol></details>}
    </section>
  );
}

/** Minimal component canvas: nodes stored as "name@x,y" lines in fields.canvas. Draggable with mouse or touch; arrow keys move the focused node. */
function DesignCanvas({ fields, setFields }: { fields: Record<string, string>; setFields: (f: Record<string, string>) => void }) {
  const nodes = (fields.canvas ?? 'Client@20,20\nAPI@170,60\nQueue@170,160\nWorker@320,110\nStorage@320,200').split('\n').filter(Boolean).map((l) => { const [n, pos] = l.split('@'); const [x, y] = (pos ?? '0,0').split(',').map(Number); return { n, x, y }; });
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const [name, setName] = useState('');
  const write = (ns: typeof nodes) => setFields({ ...fields, canvas: ns.map((x) => `${x.n}@${Math.round(x.x)},${Math.round(x.y)}`).join('\n') });
  return (
    <div className="field">
      <label>Component canvas</label>
      <div className="design-canvas" ref={ref}
        onPointerMove={(e) => { if (drag.current === null || !ref.current) return; const r = ref.current.getBoundingClientRect(); const ns = [...nodes]; ns[drag.current] = { ...ns[drag.current], x: Math.max(0, Math.min(r.width - 60, e.clientX - r.left - 30)), y: Math.max(0, Math.min(r.height - 30, e.clientY - r.top - 12)) }; write(ns); }}
        onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
        {nodes.map((nd, i) => (
          <div key={i} className="design-node" style={{ left: nd.x, top: nd.y }} tabIndex={0} role="button" aria-label={`${nd.n}, use arrow keys to move`}
            onPointerDown={(e) => { drag.current = i; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
            onKeyDown={(e) => { const m: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }; const dd = m[e.key]; if (!dd) return; e.preventDefault(); const ns = [...nodes]; ns[i] = { ...nd, x: Math.max(0, nd.x + dd[0]), y: Math.max(0, nd.y + dd[1]) }; write(ns); }}>
            {nd.n}
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <input type="text" aria-label="New component name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Component name" style={{ width: 'auto', flex: 1 }} />
        <button className="btn small" disabled={!name.trim() || name.includes('@')} onClick={() => { write([...nodes, { n: name.trim(), x: 20, y: 200 }]); setName(''); }}>Add</button>
        <button className="btn small ghost" disabled={!nodes.length} onClick={() => write(nodes.slice(0, -1))}>Remove last</button>
      </div>
    </div>
  );
}
