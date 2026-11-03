import { useState } from 'react';
import { useStore } from '../lib/store';
import type { ApplicationStatus, Data, ID, Job, JobNeed, Relationship, ResearchClaim } from '../lib/types';
import { Badge, Banner, Confirm, Empty, Field, Highlighted, RelBadge, Tabs, ValidationBadge, go, REL_LABEL } from '../ui/kit';
import { ImportBox } from '../ui/Import';
import { addNeed, createJob, deleteJob, duplicateJob, jdSentences, refreshLink, refreshNeed, saveJD, sharedWords, upsertLink, upsertSource } from '../lib/ops';
import { factsForStory, jdOf, linkValidation, needIsStale, needsForJob } from '../lib/derive';
import { checkSpan, formatInZone, uid, zonedToInstant } from '../lib/text';
import { nextActionFor } from './Dashboard';
import { MaterialsTab } from './Materials';
import { AnswersTab } from './Answers';
import { AIResearchPanel, AIValueMapPanel } from './AIPanels';
import { useAIStatus } from '../lib/ai/client';

export function JobsPage({ route }: { route: string[] }) {
  const jobId = route[1];
  if (jobId) return <JobWorkspace jobId={jobId} tab={route[2] ?? 'overview'} />;
  return <JobList />;
}

function JobList() {
  const { d, mutate } = useStore();
  const [showArchived, setShowArchived] = useState(false);
  const jobs = Object.values(d.jobs).filter((j) => j.archived === showArchived).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <div className="row between">
        <h1>Target jobs</h1>
        <button className="btn primary" onClick={() => { let id = ''; mutate((x) => { id = createJob(x); }); setTimeout(() => go(`/jobs/${id}/overview`)); }}>+ Add job</button>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={`btn small ${!showArchived ? 'primary' : ''}`} onClick={() => setShowArchived(false)}>Active</button>
        <button className={`btn small ${showArchived ? 'primary' : ''}`} onClick={() => setShowArchived(true)}>Archived</button>
      </div>
      {jobs.length === 0 ? (
        <div className="card"><Empty title={showArchived ? 'No archived jobs' : 'No target jobs yet'}>{showArchived ? '' : 'Add a job to manage its description, research, value map, answers, materials, and rounds.'}</Empty></div>
      ) : (
        <div className="grid two">
          {jobs.map((j) => (
            <div className="card" key={j.id}>
              <div className="row between"><h3 style={{ margin: 0 }}>{j.role || 'Untitled role'}</h3><Badge>{j.status}</Badge></div>
              <p className="small muted">{j.company || 'Company not set'}{j.location ? ' · ' + j.location : ''}</p>
              <div className="row">
                <a className="btn small primary" href={`#/jobs/${j.id}/overview`}>Open</a>
                <button className="btn small" onClick={() => { let id = ''; mutate((x) => { id = duplicateJob(x, j.id); }); setTimeout(() => go(`/jobs/${id}/overview`)); }}>Duplicate</button>
                <button className="btn small" onClick={() => mutate((x) => { x.jobs[j.id].archived = !j.archived; })}>{j.archived ? 'Restore' : 'Archive'}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const TABS: [string, string][] = [['overview', 'Overview'], ['research', 'Research'], ['valuemap', 'Value map'], ['answers', 'Answers'], ['materials', 'Materials'], ['rounds', 'Rounds']];

function JobWorkspace({ jobId, tab }: { jobId: ID; tab: string }) {
  const { d, mutate } = useStore();
  const job = d.jobs[jobId];
  if (!job) return <div className="card"><Empty title="Job not found" action={<a className="btn" href="#/jobs">Back to jobs</a>}>It may have been deleted.</Empty></div>;
  if (d.currentJobId !== jobId) setTimeout(() => mutate((x) => { x.currentJobId = jobId; }));
  return (
    <>
      <p className="small"><a href="#/jobs">← Target jobs</a></p>
      <div className="row between">
        <h1 style={{ margin: 0 }}>{job.role || 'Untitled role'}</h1>
        {job.archived && <Badge tone="warn">Archived</Badge>}
      </div>
      <p className="muted">{job.company || 'Company not set'}</p>
      <Tabs tabs={TABS} current={tab} base={`/jobs/${jobId}`} />
      {tab === 'overview' && <Overview job={job} />}
      {tab === 'research' && <Research job={job} />}
      {tab === 'valuemap' && <ValueMap job={job} />}
      {tab === 'answers' && <AnswersTab job={job} />}
      {tab === 'materials' && <MaterialsTab job={job} />}
      {tab === 'rounds' && <Rounds job={job} />}
    </>
  );
}

const STATUSES: ApplicationStatus[] = ['researching', 'applied', 'interviewing', 'offer', 'closed'];

function Overview({ job }: { job: Job }) {
  const { d, mutate, offerUndo } = useStore();
  const [confirmDel, setConfirmDel] = useState(false);
  const jd = jdOf(d, job);
  const set = (k: keyof Job, v: string) => mutate((x) => { (x.jobs[job.id] as unknown as Record<string, unknown>)[k] = v; });
  const na = nextActionFor(d, job.id);
  const staleCount = Object.values(d.links).filter((l) => l.jobId === job.id && linkValidation(d, l) !== 'valid').length + needsForJob(d, job.id).filter((n) => needIsStale(d, n.id)).length;
  return (
    <div className="stack">
      <Banner tone="info">Next: <a href={na.href}>{na.text}</a></Banner>
      {staleCount > 0 && <Banner tone="warn">{staleCount} item(s) depend on an earlier version of the JD or your stories. Review them in the Value map.</Banner>}
      <div className="grid two">
        <section className="card">
          <h2>Details</h2>
          <div className="grid two">
            <Field label="Company" id="j-co"><input id="j-co" type="text" value={job.company} onChange={(e) => set('company', e.target.value)} /></Field>
            <Field label="Role" id="j-role"><input id="j-role" type="text" value={job.role} onChange={(e) => set('role', e.target.value)} /></Field>
            <Field label="Level" id="j-level"><input id="j-level" type="text" value={job.level} onChange={(e) => set('level', e.target.value)} /></Field>
            <Field label="Location" id="j-loc"><input id="j-loc" type="text" value={job.location} onChange={(e) => set('location', e.target.value)} /></Field>
            <Field label="Job URL" id="j-url" hint="Callback cannot read job pages yet. Paste the description below."><input id="j-url" type="url" value={job.url} onChange={(e) => set('url', e.target.value)} /></Field>
            <Field label="Application status" id="j-status"><select id="j-status" value={job.status} onChange={(e) => set('status', e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          </div>
          <div className="row">
            <button className="btn small" onClick={() => mutate((x) => { x.jobs[job.id].archived = !job.archived; })}>{job.archived ? 'Restore job' : 'Archive job'}</button>
            <button className="btn small danger" onClick={() => setConfirmDel(true)}>Delete this job</button>
          </div>
        </section>
        <section className="card">
          <h2>Job description</h2>
          {jd && <p className="small muted">Revision {jd.revision}{jd.fictional ? ' · fictional' : ''}</p>}
          <ImportBox key={jd?.revision ?? 0} label="Job description text" initial={jd?.text ?? ''} onSave={(t, f) => mutate((x) => saveJD(x, job.id, t, f))} saveLabel="Save job description" />
        </section>
      </div>
      <Confirm open={confirmDel} title="Delete this job?" confirmLabel="Delete job" danger onCancel={() => setConfirmDel(false)} onConfirm={() => { mutate((x) => deleteJob(x, job.id)); offerUndo('Job deleted.'); setConfirmDel(false); go('/jobs'); }}>
        <p>This deletes the job description, needs, evidence links, research, rounds, answers, materials, and plan tasks for this job. <strong>Your stories and their facts are kept</strong> because other jobs can reuse them. Practice sessions remain as history.</p>
      </Confirm>
    </div>
  );
}

const LABELS: Record<ResearchClaim['label'], [string, 'green' | 'info' | 'warn' | 'neutral']> = {
  jd_explicit: ['From the JD', 'green'],
  source_backed: ['Source-backed', 'info'],
  hypothesis: ['Preparation hypothesis', 'warn'],
  not_verified: ['Not verified', 'neutral'],
};
const SECTIONS: [ResearchClaim['section'], string][] = [['company', 'What the company does'], ['role', 'What the role asks for'], ['topics', 'Likely topics worth preparing'], ['questions', 'Questions to ask the employer']];

function Research({ job }: { job: Job }) {
  const { d, mutate } = useStore();
  const sources = Object.values(d.sources).filter((s) => s.kind === 'research' && s.jobId === job.id);
  const [src, setSrc] = useState({ title: '', url: '', retrievedAt: new Date().toISOString().slice(0, 10), text: '' });
  const [claim, setClaim] = useState<{ text: string; section: ResearchClaim['section']; sourceId: string }>({ text: '', section: 'company', sourceId: '' });
  return (
    <div className="stack">
      <AIResearchPanel job={job} />
      <Banner tone="info">Live web search is not configured. Paste excerpts from sources you have read. Claims without a source are labeled “Not verified”. Interview-question recollections belong in Rounds and stay private.</Banner>
      <div className="grid two">
        <section className="card">
          <h2>Add a source</h2>
          <Field label="Title" id="rs-t"><input id="rs-t" type="text" value={src.title} onChange={(e) => setSrc({ ...src, title: e.target.value })} /></Field>
          <Field label="URL" id="rs-u"><input id="rs-u" type="url" value={src.url} onChange={(e) => setSrc({ ...src, url: e.target.value })} /></Field>
          <Field label="Date retrieved" id="rs-d"><input id="rs-d" type="date" value={src.retrievedAt} onChange={(e) => setSrc({ ...src, retrievedAt: e.target.value })} /></Field>
          <Field label="Excerpt you read" id="rs-x"><textarea id="rs-x" value={src.text} onChange={(e) => setSrc({ ...src, text: e.target.value })} /></Field>
          <button className="btn primary" disabled={!src.text.trim() || !src.title.trim()} onClick={() => { mutate((x) => { const id = upsertSource(x, null, 'research', src.title, src.text, job.id); x.sources[id].url = src.url || null; x.sources[id].retrievedAt = src.retrievedAt; }); setSrc({ ...src, title: '', url: '', text: '' }); }}>Save source</button>
        </section>
        <section className="card">
          <h2>Add a research note</h2>
          <Field label="Section" id="rc-s"><select id="rc-s" value={claim.section} onChange={(e) => setClaim({ ...claim, section: e.target.value as ResearchClaim['section'] })}>{SECTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Note or claim" id="rc-t"><textarea id="rc-t" value={claim.text} onChange={(e) => setClaim({ ...claim, text: e.target.value })} /></Field>
          <Field label="Supporting source" id="rc-src" hint="Choose “No source” for a hypothesis; it will be labeled.">
            <select id="rc-src" value={claim.sourceId} onChange={(e) => setClaim({ ...claim, sourceId: e.target.value })}>
              <option value="">No source</option>
              {job.jdSourceId && <option value={job.jdSourceId}>Job description</option>}
              {sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </Field>
          <button className="btn primary" disabled={!claim.text.trim()} onClick={() => { mutate((x) => { const label: ResearchClaim['label'] = claim.sourceId === job.jdSourceId && claim.sourceId ? 'jd_explicit' : claim.sourceId ? 'source_backed' : claim.section === 'questions' || claim.section === 'topics' ? 'hypothesis' : 'not_verified'; x.jobs[job.id].research.push({ id: uid('rc'), text: claim.text.trim(), section: claim.section, sourceId: claim.sourceId || null, label }); }); setClaim({ ...claim, text: '' }); }}>Save note</button>
        </section>
      </div>
      {SECTIONS.map(([k, label]) => {
        const items = job.research.filter((r) => r.section === k);
        return (
          <section className="card" key={k}>
            <h3>{label}</h3>
            {items.length === 0 ? <p className="small muted">Nothing yet.</p> : (
              <ul className="check-list">
                {items.map((r) => {
                  const s = r.sourceId ? d.sources[r.sourceId] : undefined;
                  const [l, tone] = LABELS[s || !r.sourceId ? r.label : 'not_verified'];
                  return (
                    <li key={r.id} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                      <Badge tone={tone}>{l}</Badge>
                      <span style={{ flex: 1 }}>{r.text}{s && <span className="small muted"> — {s.title}{s.retrievedAt ? `, retrieved ${s.retrievedAt}` : ''}</span>}</span>
                      <button className="btn small ghost" aria-label="Remove note" onClick={() => mutate((x) => { x.jobs[job.id].research = x.jobs[job.id].research.filter((y) => y.id !== r.id); })}>✕</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
      {sources.length > 0 && (
        <section className="card"><h3>Sources</h3><ul>{sources.map((s) => <li key={s.id}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a> : s.title} <span className="small muted">· retrieved {s.retrievedAt ?? 'unknown'}</span></li>)}</ul></section>
      )}
    </div>
  );
}

// ---------------- Value map ----------------
function ValueMap({ job }: { job: Job }) {
  const { d, mutate } = useStore();
  const jd = jdOf(d, job);
  const needs = needsForJob(d, job.id);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<ID | null>(null);
  const [newNeed, setNewNeed] = useState({ title: '', quote: '', kind: 'goal' as JobNeed['kind'] });
  const [needErr, setNeedErr] = useState<string | null>(null);
  const [view, setView] = useState<'cards' | 'matrix'>('cards');
  const ai = useAIStatus();
  if (!jd) return <div className="card"><Empty title="No job description yet" action={<a className="btn primary" href={`#/jobs/${job.id}/overview`}>Paste the job description</a>}>The value map connects JD needs to your evidence.</Empty></div>;
  const goals = needs.filter((n) => n.kind === 'goal');
  const quals = needs.filter((n) => n.kind === 'qualification');
  const visibleGoals = showAll ? goals : goals.slice(0, 3);

  return (
    <div className="stack">
      <div className="row">
        <button className={`btn small ${view === 'cards' ? 'primary' : ''}`} onClick={() => setView('cards')}>Evidence cards</button>
        <button className={`btn small ${view === 'matrix' ? 'primary' : ''}`} onClick={() => setView('matrix')}>Coverage matrix</button>
        <span className="spacer" />
        {!ai.configured && <Badge tone="neutral">⚙ Manual mode — AI mapping not configured</Badge>}
      </div>
      {view === 'cards' && <AIValueMapPanel job={job} />}
      {view === 'matrix' ? <CoverageMatrix d={d} job={job} /> : (
        <>
          {goals.length === 0 && <Banner tone="info">No needs yet. Add them from JD sentences below — you decide which matter.</Banner>}
          {visibleGoals.map((n, i) => (
            <NeedCard key={n.id} need={n} job={job} index={i} editing={editing === n.id} onEdit={() => setEditing(editing === n.id ? null : n.id)} />
          ))}
          {goals.length > 3 && <button className="btn" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show top 3 only' : `Show ${goals.length - 3} more responsibilities`}</button>}
          {quals.length > 0 && (
            <section className="card">
              <h3>Required qualifications</h3>
              <p className="small muted">Skills requested. A skills-list mention is not proof of a specific project.</p>
              {quals.map((n) => <NeedCard key={n.id} need={n} job={job} index={-1} compact editing={editing === n.id} onEdit={() => setEditing(editing === n.id ? null : n.id)} />)}
            </section>
          )}
        </>
      )}
      <section className="card">
        <h3>Add a need</h3>
        <details>
          <summary>Pick from JD sentences</summary>
          <ul className="check-list" style={{ marginTop: 8 }}>
            {jdSentences(jd.text).map((s) => (
              <li key={s} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <button className="btn small" onClick={() => setNewNeed({ ...newNeed, quote: s, title: newNeed.title || s.slice(0, 60) })}>Use</button>
                <span className="small">{s}</span>
              </li>
            ))}
          </ul>
        </details>
        <div className="grid two" style={{ marginTop: 8 }}>
          <Field label="Need title (≤12 words)" id="nn-t"><input id="nn-t" type="text" value={newNeed.title} onChange={(e) => setNewNeed({ ...newNeed, title: e.target.value })} /></Field>
          <Field label="Kind" id="nn-k"><select id="nn-k" value={newNeed.kind} onChange={(e) => setNewNeed({ ...newNeed, kind: e.target.value as JobNeed['kind'] })}><option value="goal">Responsibility / goal</option><option value="qualification">Qualification</option></select></Field>
        </div>
        <Field label="Exact JD quote (optional — leave empty for your own interpretation)" id="nn-q" error={needErr}><textarea id="nn-q" value={newNeed.quote} onChange={(e) => setNewNeed({ ...newNeed, quote: e.target.value })} rows={2} /></Field>
        <button className="btn primary" disabled={!newNeed.title.trim()} onClick={() => {
          let ok = true;
          mutate((x) => { ok = addNeed(x, job.id, newNeed.title.trim(), newNeed.quote.trim() || null, newNeed.kind, newNeed.quote.trim() ? 'explicit' : 'interpretation') !== null; });
          if (!ok) setNeedErr('That quote was not found in the current JD. Check the wording or leave it empty to mark this as an interpretation.');
          else { setNeedErr(null); setNewNeed({ title: '', quote: '', kind: 'goal' }); }
        }}>Add need</button>
      </section>
    </div>
  );
}

function NeedCard({ need, job, index, editing, onEdit, compact }: { need: JobNeed; job: Job; index: number; editing: boolean; onEdit: () => void; compact?: boolean }) {
  const { d, mutate } = useStore();
  const jd = jdOf(d, job)!;
  const links = Object.values(d.links).filter((l) => l.needId === need.id);
  const needStale = needIsStale(d, need.id);
  const jdCheck = need.jdSpan ? checkSpan(need.jdSpan, jd) : null;
  const [showSrc, setShowSrc] = useState(false);
  const all = needsForJob(d, job.id).filter((n) => n.kind === need.kind);
  const move = (dir: -1 | 1) => mutate((x) => {
    const list = Object.values(x.needs).filter((n) => n.jobId === job.id && n.kind === need.kind).sort((a, b) => a.order - b.order);
    const i = list.findIndex((n) => n.id === need.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const o = list[i].order;
    list[i].order = list[j].order;
    list[j].order = o;
  });

  return (
    <div className={compact ? 'card flat soft' : 'card'} style={{ marginTop: compact ? 8 : 0 }}>
      <div className="row between">
        <div className="row">
          {index >= 0 && <span className="badge neutral">{index + 1}</span>}
          <h3 style={{ margin: 0 }}>{need.title}</h3>
          {need.basis === 'interpretation' && <Badge tone="warn">Interpretation</Badge>}
          {needStale && <Badge tone="warn">↻ JD changed</Badge>}
        </div>
        <div className="row">
          <button className="btn small ghost" aria-label="Move up" disabled={all[0]?.id === need.id} onClick={() => move(-1)}>↑</button>
          <button className="btn small ghost" aria-label="Move down" disabled={all[all.length - 1]?.id === need.id} onClick={() => move(1)}>↓</button>
          <button className="btn small" onClick={onEdit}>{editing ? 'Close' : 'Edit'}</button>
          <a className="btn small" href={`#/practice/new/${need.id}`}>Practice this</a>
        </div>
      </div>
      {need.jdSpan && (
        <p className="small" style={{ marginTop: 6 }}>
          JD: <span className="quote">“{need.jdSpan.quote}”</span>{' '}
          {jdCheck?.status === 'unverified' ? <Badge tone="danger">Quote no longer in JD</Badge> : <button className="btn small ghost" onClick={() => setShowSrc(!showSrc)}>{showSrc ? 'Hide' : 'Show'} in JD</button>}
        </p>
      )}
      {showSrc && jdCheck && <Highlighted text={jd.text} start={jdCheck.start} end={jdCheck.end} />}
      {needStale && (
        <div className="row"><span className="small">The JD was edited after this need was confirmed.</span><button className="btn small" onClick={() => mutate((x) => refreshNeed(x, need.id))}>Re-check and confirm</button></div>
      )}
      {editing && (
        <div className="card soft flat" style={{ marginTop: 8 }}>
          <div className="grid two">
            <Field label="Title" id={`nt-${need.id}`}><input id={`nt-${need.id}`} type="text" value={need.title} onChange={(e) => mutate((x) => { x.needs[need.id].title = e.target.value; })} /></Field>
            <Field label="Priority" id={`np-${need.id}`}><select id={`np-${need.id}`} value={need.priority} onChange={(e) => mutate((x) => { x.needs[need.id].priority = e.target.value as JobNeed['priority']; })}><option>high</option><option>medium</option><option>low</option></select></Field>
          </div>
          <Field label="Explanation" id={`ne-${need.id}`}><textarea id={`ne-${need.id}`} rows={2} value={need.explanation} onChange={(e) => mutate((x) => { x.needs[need.id].explanation = e.target.value; })} /></Field>
          <button className="btn small danger" onClick={() => mutate((x) => { delete x.needs[need.id]; for (const l of Object.values(x.links)) if (l.needId === need.id) delete x.links[l.id]; })}>Remove need</button>
        </div>
      )}
      {links.map((l) => <EvidenceCard key={l.id} linkId={l.id} />)}
      <AddEvidence need={need} job={job} hasLinks={links.length > 0} />
    </div>
  );
}

function EvidenceCard({ linkId }: { linkId: ID }) {
  const { d, mutate } = useStore();
  const l = d.links[linkId];
  const [show, setShow] = useState(false);
  if (!l) return null;
  const v = linkValidation(d, l);
  const story = l.storyId ? d.stories[l.storyId] : undefined;
  const facts = l.factIds.map((f) => d.facts[f]).filter(Boolean);
  const resume = d.profile.resumeSourceId ? d.sources[d.profile.resumeSourceId] : undefined;
  return (
    <div className="card flat" style={{ marginTop: 10, borderLeft: `4px solid ${l.relationship === 'direct' ? 'var(--primary)' : l.relationship === 'transferable' ? 'var(--info)' : 'var(--border)'}` }}>
      <div className="row">
        <RelBadge r={l.relationship} />
        {l.storyId || l.factIds.length ? <ValidationBadge v={v} /> : null}
        {l.review === 'proposed' && <Badge tone="warn">Needs your review</Badge>}
        {story && <a className="small" href={`#/stories/${story.id}`}>{story.title}</a>}
      </div>
      {facts.map((f) => {
        const span = f.spans[0];
        const chk = span ? checkSpan(span, d.sources[span.sourceId]) : null;
        return (
          <div key={f.id} style={{ marginTop: 6 }}>
            <span className="quote">“{f.text}”</span> {f.qualifiers.length > 0 && <span className="small muted">[{f.qualifiers.join(', ')}]</span>}
            {f.origin === 'user_added' && <Badge tone="neutral">Self-reported</Badge>}
            {chk?.status === 'unverified' && <><Badge tone="danger">Source could not be verified</Badge> <span className="small">The quoted text is no longer in your resume. This says nothing about your experience — edit the fact or the resume.</span></>}
            {span && chk && chk.status !== 'unverified' && <button className="btn small ghost" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'} original</button>}
            {show && span && resume && chk && chk.status !== 'unverified' && <Highlighted text={d.sources[span.sourceId]?.text ?? ''} start={chk.start} end={chk.end} />}
          </div>
        );
      })}
      {l.relationship === 'none_added' && <p className="small muted">No evidence added yet. This reflects your current materials, not your ability.</p>}
      <p className="small" style={{ marginTop: 6 }}><strong>Why:</strong> {l.reason || '—'}</p>
      {l.qualifierNote && <p className="small"><strong>Boundary:</strong> {l.qualifierNote}</p>}
      {l.nextQuestion && <p className="small"><strong>Prepare next:</strong> {l.nextQuestion}</p>}
      <div className="row">
        {(v === 'stale' || l.review === 'proposed') && <button className="btn small primary" onClick={() => mutate((x) => { refreshLink(x, l.id); x.links[l.id].review = 'confirmed'; })}>I reviewed this — confirm</button>}
        <select aria-label="Relationship" value={l.relationship} onChange={(e) => mutate((x) => { x.links[l.id].relationship = e.target.value as Relationship; })} style={{ width: 'auto' }}>
          {(Object.keys(REL_LABEL) as Relationship[]).map((r) => <option key={r} value={r}>{REL_LABEL[r]}</option>)}
        </select>
        <button className="btn small ghost danger" onClick={() => mutate((x) => { delete x.links[l.id]; })}>Remove link</button>
      </div>
    </div>
  );
}

function AddEvidence({ need, job, hasLinks }: { need: JobNeed; job: Job; hasLinks: boolean }) {
  const { d, mutate } = useStore();
  const [open, setOpen] = useState(!hasLinks && need.kind === 'goal');
  const [storyId, setStoryId] = useState('');
  const [factIds, setFactIds] = useState<string[]>([]);
  const [rel, setRel] = useState<Relationship>('transferable');
  const [reason, setReason] = useState('');
  const [boundary, setBoundary] = useState('');
  const [nextQ, setNextQ] = useState('');
  const stories = Object.values(d.stories);
  const facts = storyId ? factsForStory(d, storyId).filter((f) => f.confirmed) : [];
  const needText = need.title + ' ' + (need.jdSpan?.quote ?? '');
  const suggestions = Object.values(d.facts)
    .filter((f) => f.confirmed)
    .map((f) => ({ f, w: sharedWords(needText, f.text) }))
    .filter((x) => x.w.length > 0)
    .sort((a, b) => b.w.length - a.w.length)
    .slice(0, 3);
  if (!open) return <button className="btn small" style={{ marginTop: 10 }} onClick={() => setOpen(true)}>+ Select evidence</button>;
  return (
    <div className="card soft flat" style={{ marginTop: 10 }}>
      <h4 style={{ margin: '0 0 8px' }}>Select evidence</h4>
      {stories.length === 0 ? <p className="small">No stories yet. <a href="#/stories">Create stories from your resume</a> first.</p> : (
        <>
          {suggestions.length > 0 && (
            <p className="small muted">Passages sharing words with this need (a starting point only — shared words are not evidence): {suggestions.map((s) => <button key={s.f.id} className="btn small ghost" onClick={() => { setStoryId(s.f.storyId); setFactIds([s.f.id]); }}>“{s.f.text.slice(0, 50)}…”</button>)}</p>
          )}
          <div className="grid two">
            <Field label="Story" id={`ae-s-${need.id}`}>
              <select id={`ae-s-${need.id}`} value={storyId} onChange={(e) => { setStoryId(e.target.value); setFactIds([]); }}>
                <option value="">Choose a story…</option>
                {stories.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </Field>
            <Field label="Relationship" id={`ae-r-${need.id}`}>
              <select id={`ae-r-${need.id}`} value={rel} onChange={(e) => setRel(e.target.value as Relationship)}>
                {(Object.keys(REL_LABEL) as Relationship[]).map((r) => <option key={r} value={r}>{REL_LABEL[r]}</option>)}
              </select>
            </Field>
          </div>
          {storyId && (
            <fieldset style={{ border: 'none', padding: 0, margin: '0 0 10px' }}>
              <legend className="small" style={{ fontWeight: 500 }}>Supporting facts (confirmed only)</legend>
              {facts.length === 0 && <p className="small muted">This story has no confirmed facts yet.</p>}
              {facts.map((f) => (
                <label key={f.id} style={{ fontWeight: 400 }}>
                  <input type="checkbox" checked={factIds.includes(f.id)} onChange={(e) => setFactIds(e.target.checked ? [...factIds, f.id] : factIds.filter((x) => x !== f.id))} /> {f.text} {f.qualifiers.length > 0 && <span className="small muted">[{f.qualifiers.join(', ')}]</span>}
                </label>
              ))}
            </fieldset>
          )}
          <Field label="Why this fits" id={`ae-w-${need.id}`}><textarea id={`ae-w-${need.id}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <Field label="Boundary — what this evidence does not show" id={`ae-b-${need.id}`} hint="For example: simulated result, team project, adoption but no measured improvement."><input id={`ae-b-${need.id}`} type="text" value={boundary} onChange={(e) => setBoundary(e.target.value)} /></Field>
          <Field label="Question to prepare next" id={`ae-n-${need.id}`}><input id={`ae-n-${need.id}`} type="text" value={nextQ} onChange={(e) => setNextQ(e.target.value)} /></Field>
        </>
      )}
      <div className="row">
        <button className="btn primary small" disabled={rel !== 'none_added' && (!storyId || !factIds.length)} onClick={() => {
          mutate((x) => { upsertLink(x, { jobId: job.id, needId: need.id, storyId: rel === 'none_added' ? null : storyId, factIds: rel === 'none_added' ? [] : factIds, relationship: rel, reason, qualifierNote: boundary, nextQuestion: nextQ, review: 'confirmed' }); });
          setOpen(false); setStoryId(''); setFactIds([]); setReason(''); setBoundary(''); setNextQ('');
        }}>Confirm mapping</button>
        <button className="btn small ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function CoverageMatrix({ d, job }: { d: Data; job: Job }) {
  const needs = needsForJob(d, job.id);
  const stories = Object.values(d.stories);
  if (!needs.length || !stories.length) return <div className="card"><Empty title="Nothing to compare yet">Add needs and stories to see coverage.</Empty></div>;
  return (
    <div className="card">
      <p className="small muted">A cell is covered only by a confirmed, verified evidence link — not by shared keywords.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Story</th>{needs.map((n) => <th key={n.id} className="cover-cell">{n.title}</th>)}</tr></thead>
          <tbody>
            {stories.map((s) => (
              <tr key={s.id}>
                <td><a href={`#/stories/${s.id}`}>{s.title}</a></td>
                {needs.map((n) => {
                  const l = Object.values(d.links).find((x) => x.needId === n.id && x.storyId === s.id);
                  if (!l) return <td key={n.id} className="muted">—</td>;
                  const v = linkValidation(d, l);
                  return <td key={n.id} title={l.reason}><RelBadge r={l.relationship} />{v !== 'valid' && <div><ValidationBadge v={v} /></div>}</td>;
                })}
              </tr>
            ))}
            <tr>
              <td><strong>Gaps</strong></td>
              {needs.map((n) => {
                const covered = Object.values(d.links).some((l) => l.needId === n.id && l.storyId && (l.relationship === 'direct' || l.relationship === 'transferable') && linkValidation(d, l) === 'valid');
                return <td key={n.id}>{covered ? <Badge tone="green">✓ Covered</Badge> : <Badge tone="warn">No supported evidence</Badge>}</td>;
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- Rounds ----------------
function Rounds({ job }: { job: Job }) {
  const { d, p, mutate } = useStore();
  const rounds = Object.values(d.rounds).filter((r) => r.jobId === job.id).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="stack">
      <Banner tone="info">Rounds are for scheduling and a manual debrief after the interview. Callback never records a real interview.</Banner>
      <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => mutate((x) => { const id = uid('round'); x.rounds[id] = { id, jobId: job.id, name: 'New round', date: '', timezone: p.prefs.timezone, format: '', notes: '', askedQuestions: '', debrief: '', followups: '' }; })}>+ Add round</button>
      {rounds.length === 0 && <div className="card"><Empty title="No rounds yet">Add interview rounds with dates, timezone, and format.</Empty></div>}
      {rounds.map((r) => {
        const set = (k: string, v: string) => mutate((x) => { (x.rounds[r.id] as unknown as Record<string, string>)[k] = v; });
        const at = r.date ? zonedToInstant(r.date, r.timezone || p.prefs.timezone) : null;
        const past = at ? at.getTime() < Date.now() : false;
        return (
          <section className="card" key={r.id}>
            <div className="grid three">
              <Field label="Name" id={`rn-${r.id}`}><input id={`rn-${r.id}`} type="text" value={r.name} onChange={(e) => set('name', e.target.value)} /></Field>
              <Field label="Date and time (in the round’s timezone)" id={`rd-${r.id}`}><input id={`rd-${r.id}`} type="datetime-local" value={r.date} onChange={(e) => set('date', e.target.value)} /></Field>
              <Field label="Round timezone" id={`rz-${r.id}`}><input id={`rz-${r.id}`} type="text" value={r.timezone} onChange={(e) => set('timezone', e.target.value)} /></Field>
              <Field label="Format" id={`rf-${r.id}`}><input id={`rf-${r.id}`} type="text" value={r.format} onChange={(e) => set('format', e.target.value)} placeholder="Video, 30 min" /></Field>
            </div>
            {at && <p className="small">In your timezone: <strong>{formatInZone(at, p.prefs.timezone)}</strong> {past && <Badge tone="neutral">Past</Badge>}</p>}
            <Field label="Notes" id={`rno-${r.id}`}><textarea id={`rno-${r.id}`} rows={2} value={r.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
            {past && (
              <details open>
                <summary>After-interview debrief (private)</summary>
                <Field label="What was asked (your recollection — private, never shared)" id={`ra-${r.id}`}><textarea id={`ra-${r.id}`} rows={3} value={r.askedQuestions} onChange={(e) => set('askedQuestions', e.target.value)} /></Field>
                <Field label="How you answered (recalled, not a recording)" id={`rb-${r.id}`}><textarea id={`rb-${r.id}`} rows={3} value={r.debrief} onChange={(e) => set('debrief', e.target.value)} /></Field>
                <Field label="Follow-up tasks" id={`rt-${r.id}`}><textarea id={`rt-${r.id}`} rows={2} value={r.followups} onChange={(e) => set('followups', e.target.value)} /></Field>
              </details>
            )}
            <button className="btn small danger" onClick={() => mutate((x) => { delete x.rounds[r.id]; })}>Delete round</button>
          </section>
        );
      })}
    </div>
  );
}
