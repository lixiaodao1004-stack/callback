import { useState } from 'react';
import { useStore } from '../lib/store';
import type { Job, MaterialVersion } from '../lib/types';
import { Badge, Banner, Empty } from '../ui/kit';
import { composeFollowUp, composePrepCard, composeResumeBullets, composeSummary, download, printText, snapshotRevisions, type Composed } from '../lib/materials';
import { linkValidation, materialIsStale, needsForJob } from '../lib/derive';
import { nowIso, uid } from '../lib/text';
import { AIMaterialPanel } from './AIPanels';
import { useAIStatus } from '../lib/ai/client';

const TYPES: [MaterialVersion['type'], string][] = [
  ['prep_card', 'Preparation card'],
  ['resume', 'Tailored resume bullets'],
  ['summary', 'Professional summary'],
  ['cover_letter', 'Cover letter draft'],
  ['follow_up', 'Thank-you / follow-up draft'],
];

function composeCoverLetter(d: ReturnType<typeof useStore>['d'], job: Job): Composed {
  const bullets = composeResumeBullets(d, job.id);
  const company = job.company.replace(/ \(fictional\)/, '') || '[Company]';
  const backed = job.research.filter((r) => r.label === 'jd_explicit' || (r.label === 'source_backed' && r.sourceId && d.sources[r.sourceId]));
  const text = [
    'Dear Hiring Team,',
    '',
    `I am applying for the ${job.role || '[role]'} position at ${company}.${backed[0] ? ` I noticed that ${backed[0].text.charAt(0).toLowerCase() + backed[0].text.slice(1)}` : ' [Add one company detail from a verified source.]'}`,
    '',
    'Relevant experience:',
    bullets.text,
    '',
    '[Explain in your own words why this role interests you.]',
    '',
    'Sincerely,',
    d.profile.name || '[Your name]',
  ].join('\n');
  return { ...bullets, text, unresolved: backed.length ? [] : ['No verified company detail to reference.'] };
}

export function MaterialsTab({ job }: { job: Job }) {
  const { d, mutate } = useStore();
  const [type, setType] = useState<MaterialVersion['type']>('prep_card');
  const versions = Object.values(d.materials).filter((m) => m.jobId === job.id && m.type === type).sort((a, b) => a.version - b.version);
  const latest = versions[versions.length - 1];
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? latest?.text ?? '';
  const needs = needsForJob(d, job.id);
  const quals = needs.filter((n) => n.kind === 'qualification');
  const ai = useAIStatus();

  function generate() {
    const c = type === 'prep_card' ? composePrepCard(d, job.id) : type === 'resume' ? composeResumeBullets(d, job.id) : type === 'summary' ? composeSummary(d, job.id) : type === 'follow_up' ? composeFollowUp(d, job.id) : composeCoverLetter(d, job);
    mutate((x) => {
      const id = uid('mat');
      x.materials[id] = { id, jobId: job.id, type, title: TYPES.find((t) => t[0] === type)![1], text: c.text, factIds: c.factIds, ...snapshotRevisions(x, job.id, c.storyIds), version: versions.length + 1, createdAt: nowIso() };
    });
    setDraft(null);
  }

  function saveEdit() {
    if (!latest || draft === null) return;
    mutate((x) => {
      const id = uid('mat');
      x.materials[id] = { ...latest, id, text: draft, version: versions.length + 1, createdAt: nowIso() };
    });
    setDraft(null);
  }

  const filename = `${(job.role || 'job').replace(/\W+/g, '-').toLowerCase()}-${type}`;
  return (
    <div className="stack">
      <Banner tone="info">Materials are built only from confirmed facts and verified research. Drafting a follow-up email never sends it. {ai.configured ? '“Generate” composes directly from your records; “Draft with AI” writes a draft whose every claim is checked against your facts.' : 'AI drafting is not configured; these are composed directly from your records.'}</Banner>
      <div className="row">
        {TYPES.map(([k, l]) => <button key={k} className={`btn small ${type === k ? 'primary' : ''}`} onClick={() => { setType(k); setDraft(null); }}>{l}</button>)}
      </div>
      <div className="grid two">
        <section className="card">
          <div className="row between">
            <h2 style={{ margin: 0 }}>{TYPES.find((t) => t[0] === type)![1]}</h2>
            {latest && <span className="small muted">Version {latest.version}</span>}
          </div>
          {latest && materialIsStale(d, latest) && <Banner tone="warn">A story or the JD changed after this version was made. Regenerate or review it.</Banner>}
          {!latest ? (
            <Empty title="Nothing generated yet" action={<button className="btn primary" onClick={generate}>Generate from my confirmed facts</button>} />
          ) : (
            <>
              <textarea aria-label="Material text" value={text} onChange={(e) => setDraft(e.target.value)} rows={18} style={{ fontFamily: 'var(--sans)' }} />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn primary" disabled={draft === null} onClick={saveEdit}>Save as new version</button>
                <button className="btn" onClick={generate}>Regenerate</button>
                <button className="btn" onClick={() => download(filename + '.txt', text)}>Export .txt</button>
                <button className="btn" onClick={() => download(filename + '.md', text)}>Export .md</button>
                <button className="btn" onClick={() => printText(filename, text)}>Print / Save as PDF</button>
              </div>
              <AIMaterialPanel job={job} type={type} existing={text} onDone={() => setDraft(null)} />
              <p className="small muted">DOCX export is not available in this prototype. PDF uses your browser’s print dialog, which produces a real PDF.</p>
            </>
          )}
        </section>
        <div className="stack">
          <section className="card">
            <h3>Facts used</h3>
            {latest?.factIds.length ? (
              <ul className="small">{latest.factIds.map((f) => <li key={f}>{d.facts[f] ? <>{d.facts[f].text} {d.facts[f].origin === 'user_added' && <Badge>Self-reported</Badge>}</> : <Badge tone="warn">Fact removed</Badge>}</li>)}</ul>
            ) : <p className="small muted">None yet.</p>}
          </section>
          <section className="card">
            <h3>JD requirement coverage</h3>
            <p className="small muted">This is not an applicant-tracking-system score. It shows which requested items have supported evidence.</p>
            <ul className="small check-list">
              {needs.map((n) => {
                const link = Object.values(d.links).find((l) => l.needId === n.id && (l.relationship === 'direct' || l.relationship === 'transferable') && l.storyId && linkValidation(d, l) === 'valid');
                const mention = Object.values(d.links).find((l) => l.needId === n.id && l.relationship === 'needs_detail');
                return <li key={n.id}>{link ? '✓' : mention ? '◌' : '○'} {n.title} <span className="muted">— {link ? 'demonstrated in a story' : mention ? 'mentioned only (e.g., skills list)' : 'preparation gap'}</span></li>;
              })}
            </ul>
            {quals.length === 0 && needs.length === 0 && <p className="small">Add needs in the Value map.</p>}
          </section>
          <section className="card">
            <h3>Version history</h3>
            {versions.length === 0 ? <p className="small muted">No versions.</p> : <ol className="small">{versions.map((v) => <li key={v.id}>v{v.version} · {new Date(v.createdAt).toLocaleString()} {materialIsStale(d, v) && <Badge tone="warn">↻ stale</Badge>}</li>)}</ol>}
          </section>
        </div>
      </div>
    </div>
  );
}
