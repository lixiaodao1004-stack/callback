import { useState } from 'react';
import { useStore } from '../lib/store';
import { ImportBox } from '../ui/Import';
import { Banner, Stepper, go } from '../ui/kit';
import { addNeed, createJob, jdSentences, saveJD, saveResume } from '../lib/ops';
import { jdOf, linkValidation, needsForJob } from '../lib/derive';
import { nowIso, uid, wordCount } from '../lib/text';
import { createSession } from '../lib/session';

const STEPS = ['Your job', 'Value map', 'Opening', 'Practice', 'Feedback'];

export function GuidePage() {
  const { d, p, mutate, setGuide } = useStore();
  const step = p.guide.step;
  const setStep = (s: number) => setGuide((g) => ({ ...g, step: s }));
  const complete = (i: number) => setGuide((g) => ({ ...g, completed: g.completed.map((c, j) => (j === i ? true : c)), step: Math.min(4, i + 1) }));
  const jobId = d.currentJobId && d.jobs[d.currentJobId] ? d.currentJobId : null;
  const job = jobId ? d.jobs[jobId] : undefined;
  const resume = d.profile.resumeSourceId ? d.sources[d.profile.resumeSourceId] : undefined;
  const jd = jdOf(d, job);
  const needs = jobId ? needsForJob(d, jobId) : [];
  const opening = Object.values(d.answers).filter((a) => a.questionId === 'q_seed_01' && a.jobId === jobId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  // The opening is stored as two lines: sound bite, then evidence.
  const [soundBite, setSoundBite] = useState(opening?.text.split('\n')[0] ?? '');
  const [evidence, setEvidence] = useState(opening?.text.split('\n').slice(1).join(' ') ?? '');
  const wc = wordCount(soundBite);
  const soundBiteTooLong = wc > 20;
  const lastSession = Object.values(d.sessions).filter((s) => s.jobId === jobId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  return (
    <>
      <div className="row between">
        <h1>First-run guide</h1>
        <button className="btn ghost" onClick={() => { setGuide((g) => ({ ...g, dismissed: true })); go('/dashboard'); }}>Skip guide</button>
      </div>
      <p className="muted">Five short steps. Each links to the full workspace, and you can leave and resume any time.</p>
      <p><strong>Results are the proof. Narration is the missing skill.</strong></p>
      <nav aria-label="Guide steps">
        <div className="row" style={{ marginBottom: 8 }}>
          {STEPS.map((s, i) => (
            <button key={s} className={`btn small ${i === step ? 'primary' : ''}`} onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}>
              {p.guide.completed[i] ? '✓ ' : `${i + 1}. `}{s}
            </button>
          ))}
        </div>
      </nav>
      <Stepper steps={STEPS} current={step} done={p.guide.completed} />

      {step === 0 && (
        <div className="grid two">
          <section className="card">
            <h2>Your resume</h2>
            {resume && <Banner tone="info">Saved (revision {resume.revision}). Editing it marks dependent evidence for review.</Banner>}
            <ImportBox label="Resume text" initial={resume?.text ?? ''} onSave={(t, f) => mutate((x) => saveResume(x, t, f))} saveLabel="Save resume" placeholder="Paste your resume, or import a file." />
          </section>
          <section className="card">
            <h2>The job</h2>
            <div className="grid two">
              <div className="field"><label htmlFor="g-co">Company (optional)</label><input id="g-co" type="text" value={job?.company ?? ''} onChange={(e) => mutate((x) => { const id = x.currentJobId && x.jobs[x.currentJobId] ? x.currentJobId : createJob(x); x.jobs[id].company = e.target.value; })} /></div>
              <div className="field"><label htmlFor="g-role">Role (optional)</label><input id="g-role" type="text" value={job?.role ?? ''} onChange={(e) => mutate((x) => { const id = x.currentJobId && x.jobs[x.currentJobId] ? x.currentJobId : createJob(x); x.jobs[id].role = e.target.value; })} /></div>
            </div>
            <ImportBox label="Job description" initial={jd?.text ?? ''} onSave={(t, f) => mutate((x) => { const id = x.currentJobId && x.jobs[x.currentJobId] ? x.currentJobId : createJob(x); saveJD(x, id, t, f); })} saveLabel="Save job description" placeholder="Paste the job description." />
          </section>
          <div className="row">
            <button className="btn primary" disabled={!resume || !jd} onClick={() => complete(0)}>Continue to Value map</button>
            {(!resume || !jd) && <span className="small muted">Save both texts to continue.</span>}
          </div>
        </div>
      )}

      {step === 1 && (
        <section className="card">
          <h2>Review up to three important needs</h2>
          {!jd || !jobId ? <p>Add a job description first.</p> : (
            <>
              {needs.length > 0 && (
                <ol>{needs.slice(0, 3).map((n) => <li key={n.id}>{n.title} {n.jdSpan && <span className="small muted quote">— “{n.jdSpan.quote}”</span>}</li>)}</ol>
              )}
              {needs.length < 3 && (
                <>
                  <p className="small muted">AI need extraction is not configured. Pick sentences from the JD that describe what the employer needs. You can rename them in the Value map.</p>
                  <ul className="check-list">
                    {jdSentences(jd.text).filter((s) => !needs.some((n) => n.jdSpan?.quote === s)).slice(0, 12).map((s) => (
                      <li key={s} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                        <button className="btn small" disabled={needs.length >= 3} onClick={() => mutate((x) => { addNeed(x, jobId, s.length > 70 ? s.slice(0, s.lastIndexOf(' ', 70)) + '…' : s, s); })}>+ Need</button>
                        <span className="small">{s}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p>Next, select evidence from your stories for each need.</p>
              <div className="row">
                <a className="btn" href={`#/jobs/${jobId}/valuemap`}>Open Value map to select evidence</a>
                <button className="btn primary" disabled={!needs.length} onClick={() => complete(1)}>Continue</button>
              </div>
              <p className="small muted">Evidence links confirmed: {Object.values(d.links).filter((l) => l.jobId === jobId && l.storyId && linkValidation(d, l) === 'valid').length}</p>
            </>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="card">
          <h2>Write a short opening</h2>
          <p className="muted small">A sound bite is not bragging. It says what you can do for them, then evidence proves it.</p>

          <div className="field">
            <label htmlFor="g-soundbite">Line 1 — Sound bite (required, max 20 words)</label>
            <div className="hint">Template: <strong>I help [who] [benefit they want].</strong></div>
            <div className="hint">Mei’s example: <span className="quote">“I help operations managers see late shipments every morning.”</span></div>
            <textarea id="g-soundbite" value={soundBite} onChange={(e) => setSoundBite(e.target.value.replace(/\n/g, ' '))} rows={2} aria-invalid={soundBiteTooLong} aria-describedby="g-soundbite-count" style={{ marginTop: 6 }} />
            <div id="g-soundbite-count" className={soundBiteTooLong ? 'error-text' : 'hint'} role={soundBiteTooLong ? 'alert' : undefined}>
              {wc} / 20 words{soundBiteTooLong && ' · shorten it to 20 words or fewer'}
            </div>
          </div>

          <div className="field">
            <label htmlFor="g-evidence">Line 2 — Evidence sentence (not counted above)</label>
            <div className="hint">Mei’s example: <span className="quote">“Twelve supervisors used my dashboard to track late shipments in their daily stand-up. I cannot claim it reduced delivery delays.”</span></div>
            <textarea id="g-evidence" value={evidence} onChange={(e) => setEvidence(e.target.value.replace(/\n/g, ' '))} rows={3} style={{ marginTop: 6 }} />
          </div>

          <div className="row">
            <button className="btn primary" disabled={!soundBite.trim() || soundBiteTooLong} onClick={() => { const text = [soundBite.trim(), evidence.trim()].filter(Boolean).join('\n'); mutate((x) => { const first = !Object.values(x.answers).some((a) => a.questionId === 'q_seed_01' && a.jobId === jobId); const id = uid('ans'); x.answers[id] = { id, jobId, questionId: 'q_seed_01', needId: null, storyId: null, factIds: [], text, kind: first ? 'independent_first' : 'edit', length: 'short', structure: 'intro', storyRevision: null, createdAt: nowIso() }; }); complete(2); }}>Save and continue</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="card">
          <h2>Practice one question</h2>
          <p>Answer one question, respond to up to three follow-ups, then retry with coaching hidden.</p>
          <button className="btn primary" disabled={!jobId} onClick={() => {
            const need = needs.find((n) => n.kind === 'goal') ?? needs[0];
            const qid = d.workspaceKind === 'demo' ? 'q_fixture' : 'q_seed_04';
            const s = createSession({ jobId, needId: need?.id ?? null, questionIds: [qid], kind: 'drill', mode: 'text', style: 'neutral', panel: [], durationMin: 15 }, d.questions, d.workspaceKind === 'demo');
            mutate((x) => { x.sessions[s.id] = s; });
            complete(3);
            go(`/practice/session/${s.id}`);
          }}>Start a practice drill</button>
          <p className="small muted">Or choose any question in the <a href="#/practice">Practice room</a>.</p>
        </section>
      )}

      {step === 4 && (
        <section className="card">
          <h2>Review feedback and retry</h2>
          {lastSession ? <a className="btn primary" href={`#/practice/session/${lastSession.id}`}>Open your latest session</a> : <p>Complete a practice drill first.</p>}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => { complete(4); go('/dashboard'); }}>Finish guide</button>
          </div>
        </section>
      )}
    </>
  );
}
