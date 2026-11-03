import { useState } from 'react';
import { useStore } from '../lib/store';
import type { ConfirmedFact, ID, Story } from '../lib/types';
import { Badge, Banner, Confirm, Empty, Field, Highlighted, go } from '../ui/kit';
import { ImportBox } from '../ui/Import';
import { saveResume } from '../lib/ops';
import { AIStoryCoach } from './AIPanels';
import { addFactFromSource, bumpStory, confirmFact, newStory, proposeUserFact, rematchFact, removeFact } from '../lib/ops';
import { factsForStory, linkValidation } from '../lib/derive';
import { checkSpan } from '../lib/text';

export function StoriesPage({ route }: { route: string[] }) {
  if (route[1]) return <StoryDetail id={route[1]} />;
  return <StoryList />;
}

function StoryList() {
  const { d, mutate } = useStore();
  const stories = Object.values(d.stories);
  const resume = d.profile.resumeSourceId ? d.sources[d.profile.resumeSourceId] : undefined;
  const used = new Set(Object.values(d.facts).flatMap((f) => f.spans.map((s) => s.quote)));
  const lines = resume ? resume.text.split('\n').map((l) => l.trim()).filter((l) => l.length > 25 && !used.has(l)) : [];
  return (
    <>
      <div className="row between">
        <h1>My stories</h1>
        <button className="btn primary" onClick={() => { let id = ''; mutate((x) => { id = newStory(x, 'New story'); }); setTimeout(() => go(`/stories/${id}`)); }}>+ New story</button>
      </div>
      <p className="muted">Reusable evidence from work, coursework, research, volunteering, clubs, and personal projects. Facts stay linked to your original wording.</p>
      {stories.length === 0 ? (
        <div className="card"><Empty title="No stories yet">{resume ? 'Create stories from lines of your resume below, or start from scratch.' : 'Add your resume in the first-run guide, or start a story from scratch.'}</Empty></div>
      ) : (
        <div className="grid two">
          {stories.map((s) => {
            const facts = factsForStory(d, s.id);
            const links = Object.values(d.links).filter((l) => l.storyId === s.id);
            const review = links.filter((l) => linkValidation(d, l) !== 'valid').length;
            return (
              <a className="card" key={s.id} href={`#/stories/${s.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="row between"><h3 style={{ margin: 0 }}>{s.title}</h3><Badge>{s.category}</Badge></div>
                <p className="small muted">{facts.filter((f) => f.confirmed).length} confirmed fact(s) · used for {links.length} need(s){s.openQuestions.length ? ` · ${s.openQuestions.length} open question(s)` : ''}</p>
                {s.qualifiers.length > 0 && <div className="row">{s.qualifiers.map((q) => <Badge key={q} tone="violet">{q}</Badge>)}</div>}
                {review > 0 && <p className="small" style={{ color: 'var(--warn)' }}>↻ {review} link(s) need review</p>}
              </a>
            );
          })}
        </div>
      )}
      <section className="card section">
        <details open={!resume}>
          <summary><strong>Your resume</strong> {resume && <span className="small muted">· revision {resume.revision}</span>}</summary>
          <p className="small muted" style={{ marginTop: 8 }}>Editing your resume re-checks every quoted fact. Facts whose text is no longer present are marked “Source could not be verified” for you to review.</p>
          <ImportBox key={resume?.revision ?? 0} label="Resume text" initial={resume?.text ?? ''} onSave={(t, f) => mutate((x) => saveResume(x, t, f))} saveLabel="Save resume" />
        </details>
      </section>
      {lines.length > 0 && (
        <section className="card section">
          <h2>Start a story from your resume</h2>
          <p className="small muted">Each line becomes a story with that line as a confirmed, sourced fact.</p>
          <ul className="check-list">
            {lines.map((l) => (
              <li key={l} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <button className="btn small" onClick={() => { let id = ''; mutate((x) => { id = newStory(x, l.split(/[:;,(]/)[0].slice(0, 60)); addFactFromSource(x, id, x.sources[resume!.id], l); }); setTimeout(() => go(`/stories/${id}`)); }}>+ Story</button>
                <span className="small">{l}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

const FIELDS: [keyof Story, string, string][] = [
  ['context', 'Context', 'Where and when did this happen?'],
  ['role', 'Your role', 'What was your role, and who else was involved?'],
  ['actions', 'What you did', 'What did you personally do?'],
  ['decision', 'A decision or trade-off', 'What was one decision you made, and why?'],
  ['result', 'Result', 'What changed? A qualitative outcome is fine.'],
  ['howKnown', 'How the result is known', 'How do you know that result — measured, observed, or reported by someone?'],
  ['collaborators', 'Collaborators', 'Who did you work with?'],
  ['dates', 'Dates', 'When did this take place?'],
  ['scope', 'Scope', 'How large was the work — people, data, time?'],
];

function coachQuestion(s: Story): string | null {
  for (const [k, , q] of FIELDS) if (!String(s[k] ?? '').trim()) return q;
  return s.openQuestions[0] ?? null;
}

function StoryDetail({ id }: { id: ID }) {
  const { d, mutate, offerUndo } = useStore();
  const s = d.stories[id];
  const [factText, setFactText] = useState('');
  const [ownership, setOwnership] = useState<ConfirmedFact['ownership']>('unclear');
  const [quote, setQuote] = useState('');
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [coachAnswer, setCoachAnswer] = useState('');
  if (!s) return <div className="card"><Empty title="Story not found" action={<a className="btn" href="#/stories">Back</a>} /></div>;
  const facts = factsForStory(d, id);
  const resume = d.profile.resumeSourceId ? d.sources[d.profile.resumeSourceId] : undefined;
  const links = Object.values(d.links).filter((l) => l.storyId === id);
  // Title, category, themes, and cues are presentation; they do not invalidate evidence.
  const set = (k: keyof Story, v: unknown) => mutate((x) => { (x.stories[id] as unknown as Record<string, unknown>)[k] = v; if (!['title', 'category', 'themes', 'cues', 'openQuestions'].includes(k)) bumpStory(x, id); });
  const cq = coachQuestion(s);

  return (
    <>
      <p className="small"><a href="#/stories">← My stories</a></p>
      <div className="row between">
        <input type="text" aria-label="Story title" value={s.title} onChange={(e) => set('title', e.target.value)} style={{ fontSize: '1.3rem', fontWeight: 700, maxWidth: 560 }} />
        <span className="small muted">Revision {s.revision}</span>
      </div>
      {s.fictional && <Banner tone="demo">Fictional example story. Blank fields are details the example candidate has not supplied — they are intentionally left empty.</Banner>}
      {links.length > 0 && <p className="small muted">Changing this story marks {links.length} evidence link(s) and any dependent answers or materials for review. Past practice transcripts stay as history.</p>}

      <div className="grid two section">
        <section className="card">
          <h2>Story details</h2>
          <Field label="Category" id="st-cat">
            <select id="st-cat" value={s.category} onChange={(e) => set('category', e.target.value)}>
              {['work', 'coursework', 'research', 'volunteering', 'club', 'personal', 'teaching'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          {FIELDS.map(([k, label]) => (
            <Field key={k} label={label} id={`st-${k}`}>
              <textarea id={`st-${k}`} rows={2} value={String(s[k] ?? '')} onChange={(e) => set(k, e.target.value)} placeholder="Not supplied yet" />
            </Field>
          ))}
          <Field label="Qualifiers (comma-separated)" id="st-q" hint="For example: simulated, pilot, team result, proposed.">
            <input id="st-q" type="text" value={s.qualifiers.join(', ')} onChange={(e) => set('qualifiers', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />
          </Field>
          <Field label="Skills and themes (comma-separated)" id="st-th">
            <input id="st-th" type="text" value={s.themes.join(', ')} onChange={(e) => set('themes', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />
          </Field>
          <Field label="Memory cues (up to three, comma-separated)" id="st-cues" hint="Short prompts you confirm yourself. They appear on flashcards and preparation cards.">
            <input id="st-cues" type="text" value={s.cues.join(', ')} onChange={(e) => set('cues', e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 3))} />
          </Field>
        </section>

        <div className="stack">
          <section className="card">
            <h2>Story coach</h2>
            <p className="small muted">One missing detail at a time. The question below comes from the empty fields; the AI coach (when available) asks from the whole story. Replies become proposed facts for you to confirm — nothing is added silently.</p>
            {cq ? (
              <>
                <p><strong>{cq}</strong></p>
                <textarea aria-label="Your answer to the coach" value={coachAnswer} onChange={(e) => setCoachAnswer(e.target.value)} rows={3} placeholder="Answer in any language you prefer." />
                <div className="row">
                  <button className="btn primary small" disabled={!coachAnswer.trim()} onClick={() => { mutate((x) => { proposeUserFact(x, id, coachAnswer.trim()); }); setCoachAnswer(''); }}>Propose as a fact</button>
                  {s.openQuestions.includes(cq) && <button className="btn small ghost" onClick={() => set('openQuestions', s.openQuestions.filter((q) => q !== cq))}>Dismiss question</button>}
                </div>
              </>
            ) : <p className="muted">No open questions. Add more in the details form.</p>}
            <AIStoryCoach storyId={id} />
          </section>

          <section className="card">
            <h2>Facts</h2>
            <p className="small muted">Only confirmed facts can be used in answers and materials.</p>
            {facts.length === 0 && <p className="muted">No facts yet.</p>}
            <ul className="check-list">
              {facts.map((f) => <FactRow key={f.id} fact={f} />)}
            </ul>
            <h3 style={{ marginTop: 12 }}>Add from your resume</h3>
            {resume ? (
              <>
                <Field label="Exact quote from your resume" id="fq" error={quoteErr}><textarea id="fq" rows={2} value={quote} onChange={(e) => setQuote(e.target.value)} /></Field>
                <button className="btn small" disabled={!quote.trim()} onClick={() => { let ok = true; mutate((x) => { ok = addFactFromSource(x, id, x.sources[resume.id], quote) !== null; }); if (ok) { setQuote(''); setQuoteErr(null); } else setQuoteErr('That text was not found in your current resume. Copy it exactly, or add it below as a self-reported fact.'); }}>Add sourced fact</button>
              </>
            ) : <p className="small">No resume saved.</p>}
            <h3 style={{ marginTop: 12 }}>Add a self-reported fact</h3>
            <Field label="Fact" id="ff" hint="Not in any document. It is saved unconfirmed until you confirm it, and labeled self-reported."><textarea id="ff" rows={2} value={factText} onChange={(e) => setFactText(e.target.value)} /></Field>
            <Field label="Ownership" id="fo"><select id="fo" value={ownership} onChange={(e) => setOwnership(e.target.value as ConfirmedFact['ownership'])}><option value="personal">My personal work</option><option value="team">Team result</option><option value="unclear">Unclear / mixed</option></select></Field>
            <button className="btn small" disabled={!factText.trim()} onClick={() => { mutate((x) => { proposeUserFact(x, id, factText.trim(), ownership); }); setFactText(''); }}>Propose fact</button>
          </section>

          <section className="card">
            <h3>Used as evidence for</h3>
            {links.length === 0 ? <p className="small muted">Not linked to any job need.</p> : <ul>{links.map((l) => <li key={l.id}><a href={`#/jobs/${l.jobId}/valuemap`}>{d.needs[l.needId]?.title}</a> <span className="small muted">({d.jobs[l.jobId]?.role})</span></li>)}</ul>}
            <button className="btn small danger" onClick={() => setConfirmDel(true)}>Delete story</button>
          </section>
        </div>
      </div>
      <Confirm open={confirmDel} title="Delete this story?" confirmLabel="Delete story" danger onCancel={() => setConfirmDel(false)} onConfirm={() => { mutate((x) => { for (const f of Object.values(x.facts)) if (f.storyId === id) delete x.facts[f.id]; for (const l of Object.values(x.links)) if (l.storyId === id) delete x.links[l.id]; delete x.stories[id]; }); offerUndo('Story deleted.'); setConfirmDel(false); go('/stories'); }}>
        <p>This deletes the story, its facts, and {links.length} evidence link(s) across all jobs. Past practice transcripts are kept.</p>
      </Confirm>
    </>
  );
}

function FactRow({ fact }: { fact: ConfirmedFact }) {
  const { d, mutate } = useStore();
  const [show, setShow] = useState(false);
  const span = fact.spans[0];
  const src = span ? d.sources[span.sourceId] : undefined;
  const chk = span ? checkSpan(span, src) : null;
  return (
    <li style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div><span className="quote">“{fact.text}”</span></div>
      <div className="row" style={{ marginTop: 4 }}>
        {fact.confirmed ? <Badge tone="green">✓ Confirmed</Badge> : <Badge tone="warn">Proposed — needs confirmation</Badge>}
        {fact.origin === 'user_added' ? <Badge tone="neutral">Self-reported</Badge> : chk?.status === 'unverified' ? <Badge tone="danger">Source could not be verified</Badge> : <Badge tone="info">From resume</Badge>}
        <Badge tone="neutral">{fact.ownership === 'personal' ? 'Personal' : fact.ownership === 'team' ? 'Team result' : 'Ownership unclear'}</Badge>
        {fact.qualifiers.map((q) => <Badge key={q} tone="violet">{q}</Badge>)}
      </div>
      <div className="row" style={{ marginTop: 4 }}>
        {!fact.confirmed && <button className="btn small primary" onClick={() => mutate((x) => confirmFact(x, fact.id))}>Confirm fact</button>}
        {span && chk?.status !== 'unverified' && <button className="btn small ghost" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'} original</button>}
        {chk?.status === 'unverified' && <button className="btn small" onClick={() => mutate((x) => { rematchFact(x, fact.id); })}>Try to rematch</button>}
        <select aria-label="Ownership" value={fact.ownership} onChange={(e) => mutate((x) => { x.facts[fact.id].ownership = e.target.value as ConfirmedFact['ownership']; bumpStory(x, fact.storyId); })} style={{ width: 'auto' }}>
          <option value="personal">Personal</option><option value="team">Team result</option><option value="unclear">Unclear</option>
        </select>
        <input type="text" aria-label="Qualifiers" placeholder="qualifiers, comma-separated" value={fact.qualifiers.join(', ')} onChange={(e) => mutate((x) => { x.facts[fact.id].qualifiers = e.target.value.split(',').map((q) => q.trim()).filter(Boolean); bumpStory(x, fact.storyId); })} style={{ width: 'auto', flex: 1, minWidth: 140 }} />
        <button className="btn small ghost danger" onClick={() => mutate((x) => removeFact(x, fact.id))}>Remove</button>
      </div>
      {show && src && chk && <Highlighted text={src.text} start={chk.start} end={chk.end} />}
    </li>
  );
}
