// Deterministic material composition from confirmed facts only. Every personal line cites fact IDs.
import type { Data, ID, MaterialVersion } from './types';
import { jdOf, linkValidation, needsForJob, factsForStory } from './derive';

export interface Composed {
  text: string;
  factIds: ID[];
  storyIds: ID[];
  unresolved: string[];
}

function supportedLinks(d: Data, jobId: ID) {
  return Object.values(d.links).filter((l) => l.jobId === jobId && l.storyId && (l.relationship === 'direct' || l.relationship === 'transferable') && linkValidation(d, l) === 'valid');
}

export function composePrepCard(d: Data, jobId: ID): Composed {
  const job = d.jobs[jobId];
  const needs = needsForJob(d, jobId).filter((n) => n.kind === 'goal').slice(0, 3);
  const links = supportedLinks(d, jobId);
  const storyIds = [...new Set(links.map((l) => l.storyId!))].slice(0, 3);
  const factIds: ID[] = [];
  const unresolved: string[] = [];
  const lines: string[] = [];
  lines.push(`PREPARATION CARD — ${job?.role || 'Untitled role'}${job?.company ? ' · ' + job.company : ''}`);
  lines.push('');
  lines.push('Job needs');
  needs.forEach((n, i) => lines.push(`  ${i + 1}. ${n.title}${n.basis === 'interpretation' ? ' (interpretation)' : ''}`));
  if (!needs.length) lines.push('  No confirmed needs yet.');
  lines.push('');
  lines.push(`Stories (${storyIds.length} supported${storyIds.length < 3 ? ` — fewer than three have supported evidence` : ''})`);
  for (const sid of storyIds) {
    const st = d.stories[sid];
    const facts = factsForStory(d, sid).filter((f) => f.confirmed);
    lines.push(`  ■ ${st.title}`);
    const cues = st.cues.length ? st.cues.slice(0, 3) : [];
    lines.push(`    Cues: ${cues.length ? cues.join(' · ') : '(add up to three memory cues in My stories)'}`);
    if (!cues.length) unresolved.push(`Add memory cues for “${st.title}”.`);
    for (const f of facts) {
      factIds.push(f.id);
      lines.push(`    • ${f.text}${f.qualifiers.length ? ` [${f.qualifiers.join(', ')}]` : ''}${f.origin === 'user_added' ? ' (self-reported)' : ''}`);
    }
    const l = links.find((x) => x.storyId === sid);
    if (l?.qualifierNote) lines.push(`    Boundary: ${l.qualifierNote}`);
    st.openQuestions.forEach((q) => unresolved.push(`${st.title}: ${q}`));
  }
  lines.push('');
  lines.push('Questions to ask the employer');
  const qs = (job?.research ?? []).filter((r) => r.section === 'questions');
  if (qs.length) qs.forEach((q) => lines.push(`  • ${q.text}`));
  else lines.push('  (none saved yet)');
  lines.push('');
  lines.push('Unresolved details');
  if (unresolved.length) unresolved.forEach((u) => lines.push(`  • ${u}`));
  else lines.push('  None');
  return { text: lines.join('\n'), factIds, storyIds, unresolved };
}

export function composeFollowUp(d: Data, jobId: ID): Composed {
  const job = d.jobs[jobId];
  const links = supportedLinks(d, jobId);
  const first = links[0];
  const fact = first ? d.facts[first.factIds[0]] : undefined;
  const need = first ? d.needs[first.needId] : undefined;
  const lines = [
    `Subject: Thank you — ${job?.role || '[role]'}`,
    '',
    'Dear [interviewer name],',
    '',
    `Thank you for taking the time to talk with me about the ${job?.role || '[role]'} position${job?.company ? ' at ' + job.company.replace(/ \(fictional\)/, '') : ''}.`,
  ];
  if (fact && need) lines.push(`I enjoyed discussing how my experience — ${fact.text.charAt(0).toLowerCase() + fact.text.slice(1)} — relates to your need to ${need.title.toLowerCase()}.`);
  else lines.push('[Add one specific point from your conversation.]');
  lines.push('', '[Optional: one question or detail you want to follow up on.]', '', 'Best regards,', d.profile.name || '[Your name]');
  return { text: lines.join('\n'), factIds: fact ? [fact.id] : [], storyIds: first?.storyId ? [first.storyId] : [], unresolved: fact ? [] : ['No supported evidence link to reference yet.'] };
}

export function composeResumeBullets(d: Data, jobId: ID): Composed {
  const links = supportedLinks(d, jobId);
  const lines: string[] = [];
  const factIds: ID[] = [];
  const storyIds: ID[] = [];
  for (const l of links) {
    const need = d.needs[l.needId];
    for (const fid of l.factIds) {
      const f = d.facts[fid];
      if (!f || !f.confirmed || factIds.includes(fid)) continue;
      factIds.push(fid);
      if (l.storyId && !storyIds.includes(l.storyId)) storyIds.push(l.storyId);
      const t = f.text.charAt(0).toUpperCase() + f.text.slice(1);
      lines.push(`• ${t.replace(/\.$/, '')}.   ← supports: ${need?.title ?? 'need'} (${l.relationship})`);
    }
  }
  return { text: lines.join('\n') || '(No supported evidence links yet. Confirm mappings in the Value map.)', factIds, storyIds, unresolved: [] };
}

export function composeSummary(d: Data, jobId: ID): Composed {
  const resume = d.profile.resumeSourceId ? d.sources[d.profile.resumeSourceId] : undefined;
  const firstLine = resume?.text.split('\n').find((l) => /\b(M\.?S|B\.?S|B\.?A|degree|university|college)\b/i.test(l));
  const links = supportedLinks(d, jobId);
  const fact = links.find((l) => l.relationship === 'direct') ?? links[0];
  const f = fact ? d.facts[fact.factIds[0]] : undefined;
  const text = [firstLine ? firstLine.trim() : '[Education line from your resume]', f ? `Experience: ${f.text}${f.qualifiers.length ? ` (${f.qualifiers.join(', ')})` : ''}.` : '[Add a supported experience]'].join(' ');
  return { text, factIds: f ? [f.id] : [], storyIds: fact?.storyId ? [fact.storyId] : [], unresolved: [] };
}

export function snapshotRevisions(d: Data, jobId: ID, storyIds: ID[]): Pick<MaterialVersion, 'storyRevisions' | 'jdRevision'> {
  const storyRevisions: Record<ID, number> = {};
  for (const s of storyIds) if (d.stories[s]) storyRevisions[s] = d.stories[s].revision;
  return { storyRevisions, jdRevision: jdOf(d, d.jobs[jobId])?.revision ?? null };
}

export function download(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens the browser's print dialog for a real PDF via "Save as PDF". */
export function printText(title: string, text: string) {
  const w = window.open('', '_blank');
  if (!w) return false;
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:12pt/1.5 system-ui,sans-serif;margin:2cm;color:#111}pre{white-space:pre-wrap;word-break:break-word;font:inherit}</style></head><body><pre>${esc(text)}</pre></body></html>`);
  w.document.close();
  w.focus();
  w.print();
  return true;
}
