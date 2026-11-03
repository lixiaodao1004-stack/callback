import { useStore } from '../lib/store';
import { activeJobs, linkValidation, needsForJob, jdOf } from '../lib/derive';
import { Badge, Banner, Empty, go } from '../ui/kit';
import { stateLabel } from '../lib/session';
import { createJob } from '../lib/ops';
import { formatInZone, zonedToInstant } from '../lib/text';

export function nextActionFor(d: ReturnType<typeof useStore>['d'], jobId: string): { text: string; href: string } {
  const job = d.jobs[jobId];
  if (!d.profile.resumeSourceId) return { text: 'Add your resume', href: '#/guide' };
  if (!jdOf(d, job)) return { text: 'Paste the job description', href: `#/jobs/${jobId}/overview` };
  const needs = needsForJob(d, jobId);
  if (!needs.length) return { text: 'Choose up to three job needs', href: `#/jobs/${jobId}/valuemap` };
  const links = Object.values(d.links).filter((l) => l.jobId === jobId);
  if (links.some((l) => linkValidation(d, l) !== 'valid')) return { text: 'Review out-of-date or unverified evidence', href: `#/jobs/${jobId}/valuemap` };
  const unmapped = needs.filter((n) => n.kind === 'goal' && !links.some((l) => l.needId === n.id && l.storyId));
  if (unmapped.length) return { text: `Select evidence for “${unmapped[0].title}”`, href: `#/jobs/${jobId}/valuemap` };
  const sessions = Object.values(d.sessions).filter((s) => s.jobId === jobId);
  if (!sessions.length) return { text: 'Practice one question', href: '#/practice' };
  return { text: 'Plan your remaining prep time', href: '#/progress/plan' };
}

export function Dashboard() {
  const { d, p, mutate, kind, loadDemo } = useStore();
  const jobs = activeJobs(d);
  const sessions = Object.values(d.sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const todo = Object.values(d.tasks).filter((t) => t.status === 'todo');
  const upcoming = Object.values(d.rounds)
    .filter((r) => r.date && d.jobs[r.jobId] && !d.jobs[r.jobId].archived)
    .map((r) => ({ r, at: zonedToInstant(r.date, r.timezone || p.prefs.timezone) }))
    .filter((x) => x.at.getTime() > Date.now())
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <>
      <div className="row between">
        <h1>Dashboard</h1>
        {!p.guide.dismissed && !p.guide.completed.every(Boolean) && (
          <a className="btn" href="#/guide">
            {p.guide.completed.some(Boolean) ? 'Resume first-run guide' : 'Start first-run guide'}
          </a>
        )}
      </div>

      {jobs.length === 0 ? (
        <div className="card">
          <Empty
            title="No target jobs yet"
            action={
              <div className="row" style={{ justifyContent: 'center' }}>
                <button className="btn primary" onClick={() => { let id = ''; mutate((x) => { id = createJob(x); }); setTimeout(() => go(`/jobs/${id}/overview`)); }}>
                  Add a target job
                </button>
                {kind === 'personal' && <button className="btn" onClick={() => { loadDemo(); }}>Explore Mei’s example</button>}
              </div>
            }
          >
            Add a job and its description to see what to prepare first.
          </Empty>
        </div>
      ) : (
        <div className="grid two">
          {jobs.map((j) => {
            const na = nextActionFor(d, j.id);
            const needs = needsForJob(d, j.id).filter((n) => n.kind === 'goal');
            const supported = needs.filter((n) => Object.values(d.links).some((l) => l.needId === n.id && l.storyId && (l.relationship === 'direct' || l.relationship === 'transferable') && linkValidation(d, l) === 'valid'));
            return (
              <div className="card" key={j.id}>
                <div className="row between">
                  <h3 style={{ margin: 0 }}>{j.role || 'Untitled role'}</h3>
                  <Badge tone="neutral">{j.status}</Badge>
                </div>
                <p className="muted small">{j.company || 'Company not set'}</p>
                <p className="small">Supported needs: <strong>{supported.length}</strong> of {needs.length}</p>
                <div className="row">
                  <a className="btn primary small" href={na.href}>Next: {na.text}</a>
                  <a className="btn small" href={`#/jobs/${j.id}/overview`}>Open job</a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid two section">
        <section className="card">
          <h2>Upcoming interviews</h2>
          {upcoming.length === 0 ? <p className="muted">No upcoming rounds. Add one in a job’s Rounds tab.</p> : (
            <ul>
              {upcoming.slice(0, 4).map(({ r, at }) => (
                <li key={r.id}><strong>{r.name}</strong> — {d.jobs[r.jobId].role}<br /><span className="small muted">{formatInZone(at, p.prefs.timezone)}</span></li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2>Prep tasks</h2>
          {todo.length === 0 ? <p className="muted">No open tasks.</p> : (
            <ul>{todo.slice(0, 5).map((t) => <li key={t.id}>{t.title} <span className="small muted">· {t.minutes} min</span></li>)}</ul>
          )}
          <a className="btn small" href="#/progress/plan">Plan my prep time</a>
        </section>
      </div>

      <section className="card section">
        <h2>Recent practice</h2>
        {sessions.length === 0 ? <p className="muted">No sessions yet.</p> : (
          <ul>
            {sessions.slice(0, 5).map((s) => (
              <li key={s.id}>
                <a href={`#/practice/session/${s.id}`}>{d.questions[s.questionIds[0]]?.text ?? 'Session'}</a> <span className="small muted">· {stateLabel(s)} · {s.mode}</span>
                {s.fixtureId && <> <Badge tone="violet">◆ Prepared example</Badge></>}
              </li>
            ))}
          </ul>
        )}
      </section>
      {kind === 'personal' && Object.keys(d.jobs).length === 0 && <div className="section"><Banner tone="info">This is your own workspace. It contains none of Mei’s example data.</Banner></div>}
    </>
  );
}
