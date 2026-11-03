// Deterministic session controller. Code owns counters and transitions; nothing a model or
// a repeated click returns can add a fourth follow-up or skip a state.
import type { Probe, Question, Session, Turn } from './types';
import { FIXTURE } from './demo';
import { HYPOTHETICAL_FORMATS } from './questions';
import { nowIso, uid } from './text';

export const MAX_FOLLOWUPS = 3;

export interface SessionConfig {
  jobId: string | null;
  needId: string | null;
  needTitle?: string;
  questionIds: string[];
  kind: Session['kind'];
  mode: Session['mode'];
  style: Session['style'];
  panel: string[];
  durationMin: number;
}

export function createSession(cfg: SessionConfig, questions: Record<string, Question>, fixtureEligible: boolean): Session {
  const t = nowIso();
  const s: Session = {
    id: uid('sess'),
    jobId: cfg.jobId,
    needId: cfg.needId,
    questionIds: cfg.questionIds,
    kind: cfg.kind,
    mode: cfg.mode,
    style: cfg.style,
    panel: cfg.panel,
    state: 'first_question',
    paused: false,
    endedEarly: false,
    turns: [],
    mainIndex: 0,
    followupsUsed: cfg.questionIds.map(() => 0),
    assisted: false,
    fixtureId: fixtureEligible && cfg.kind === 'drill' && questions[cfg.questionIds[0]]?.text === FIXTURE.question ? FIXTURE.id : null,
    createdAt: t,
    updatedAt: t,
    durationMin: cfg.durationMin,
  };
  return askMain(s, questions, 0);
}

function speakerFor(s: Session, mainIndex: number): string {
  if (s.kind === 'panel' && s.panel.length) return s.panel[mainIndex % s.panel.length];
  return 'Interviewer';
}

function push(s: Session, turn: Omit<Turn, 'id' | 'at' | 'recordingId' | 'durationSec' | 'skipped'> & Partial<Turn>): Session {
  const full: Turn = { id: uid('t'), at: nowIso(), recordingId: null, durationSec: null, skipped: false, ...turn };
  return { ...s, turns: [...s.turns, full], updatedAt: nowIso() };
}

function stylePrefix(style: Session['style']): string {
  return style === 'friendly' ? 'Thanks. ' : style === 'challenging' ? 'Be specific: ' : '';
}

function askMain(s: Session, questions: Record<string, Question>, index: number): Session {
  const q = questions[s.questionIds[index]];
  const next = push({ ...s, mainIndex: index, state: 'first_answer' }, { role: 'interviewer', speaker: speakerFor(s, index), kind: 'main', text: q?.text ?? '(question missing)', mainIndex: index, probe: null });
  return next;
}

// ---- Offline follow-up rules -------------------------------------------------------------
// Signals are checked across the whole transcript for the current main question, so an
// outcome already explained is never asked for again because a later sentence lacks a number.
const SIGNALS: Record<Probe, RegExp> = {
  evidence: /\b(used|relied on|adopted|for (the )?\d+|\d+\s+(users|people|supervisors|managers|students|customers|teams?))\b/i,
  outcome: /\b(result|outcome|led to|so that|which (helped|meant|let)|reduced|improved|increased|decreased|cut|saved|launched|adopted|measur|do not have|don't have|cannot claim|can't claim|changed)\b|%/i,
  relevance: /\b(this (role|internship|position|job|team)|your (team|need|role|company)|relevant|connect)/i,
  action: /\bI (built|wrote|designed|created|led|analy[sz]ed|decided|chose|implemented|ran|made|proposed|cleaned|tested)\b/i,
  decision: /\b(decided|chose|trade-?off|instead of|rather than|because)\b/i,
  clarification: /\?/,
  assumptions: /\b(assum|clarif|first I would ask|depends on)/i,
  validation: /\b(test|measur|metric|check|validat|a\/b|experiment|compare)/i,
  tradeoff: /\b(trade-?off|instead|downside|cost|alternatively|but)\b/i,
};

const PROBE_TEXT: Record<Probe, (need?: string) => string> = {
  evidence: () => 'Who used that work, and what did it help them do?',
  outcome: () => 'What can you say about the outcome of that work?',
  relevance: (need) => (need ? `How does that experience connect to the need to ${need.toLowerCase()}?` : 'How does that experience connect to this role?'),
  action: () => 'What did you personally do, as opposed to the team?',
  decision: () => 'What was one decision you made along the way, and why?',
  clarification: () => 'Could you clarify the part you consider most important?',
  assumptions: () => 'What assumptions are you making, and what would you ask first?',
  validation: () => 'How would you check whether your approach worked?',
  tradeoff: () => 'What trade-off did you consider, and what would you give up?',
};

function probeOrder(format: Question['format'] | undefined): Probe[] {
  if (format && HYPOTHETICAL_FORMATS.includes(format)) return ['assumptions', 'validation', 'tradeoff'];
  if (format === 'recruiter') return ['relevance', 'evidence', 'decision'];
  if (format === 'technical') return ['decision', 'validation', 'tradeoff'];
  return ['evidence', 'outcome', 'relevance', 'action', 'decision'];
}

export function behavioralOrderFor(theme: string | undefined): Probe[] {
  // Conflict and judgment stories hinge on personal action and decisions before outcomes.
  return theme && /collaboration|judgment|learning/.test(theme) ? ['action', 'decision', 'outcome', 'relevance', 'evidence'] : ['evidence', 'outcome', 'relevance', 'action', 'decision'];
}

export function chooseProbe(s: Session, q: Question | undefined): Probe | null {
  const mi = s.mainIndex;
  const turnsForMain = s.turns.filter((t) => t.mainIndex === mi);
  const transcript = turnsForMain.filter((t) => t.role === 'candidate').map((t) => t.text).join(' ');
  const asked = new Set(turnsForMain.filter((t) => t.kind === 'followup').map((t) => t.probe));
  const order = q?.format === 'behavioral' ? behavioralOrderFor(q.theme) : probeOrder(q?.format);
  for (const p of order) {
    if (asked.has(p)) continue;
    if (SIGNALS[p].test(transcript)) continue;
    return p;
  }
  return null;
}

export function coachingFor(s: Session, mainIndex: number): string {
  if (s.fixtureId) return FIXTURE.coaching;
  const probes = s.turns.filter((t) => t.mainIndex === mainIndex && t.kind === 'followup').map((t) => t.probe);
  const cues: Record<string, string> = {
    evidence: 'say who used or benefited from the work',
    outcome: 'state what changed, or say plainly what you cannot claim',
    relevance: 'connect it to the role’s need in one sentence',
    action: 'make your personal actions clear',
    decision: 'name one decision and why you made it',
    assumptions: 'state your assumptions and first questions up front',
    validation: 'say how you would check the approach worked',
    tradeoff: 'name a trade-off you considered',
  };
  const list = probes.map((p) => (p ? cues[p] : '')).filter(Boolean);
  if (!list.length) return 'Your answer already covered the points the follow-up rules check. In your retry, keep the same facts and lead with your main point.';
  return `Checklist for your retry (from the follow-ups you were asked): ${list.join('; ')}. Use only facts you have confirmed, and keep any qualifiers such as "simulated" or "team result".`;
}

/**
 * Submit a candidate answer. `expectedTurns` guards against duplicate submissions:
 * a click that was rendered against an older transcript is ignored.
 */
/** An interviewer decision proposed by the AI (A5). The controller still owns limits and transitions. */
export interface InterviewerDecision {
  action: 'followup' | 'close' | 'main_question';
  message: string;
  probe: Probe | null;
}

export function submitAnswer(s: Session, text: string, questions: Record<string, Question>, expectedTurns: number, needTitle?: string, extra?: Partial<Turn>, decision?: InterviewerDecision | null): { session: Session; error?: string } {
  if (s.turns.length !== expectedTurns) return { session: s, error: 'This answer was already submitted.' };
  if (s.paused) return { session: s, error: 'Resume the session first.' };
  const body = text.trim();
  if (!body) return { session: s, error: 'Write or record an answer, or use Skip.' };
  const mi = s.mainIndex;
  const q = questions[s.questionIds[mi]];

  if (s.state === 'independent_retry') {
    const next = push(s, { role: 'candidate', speaker: 'You', kind: 'retry', text: body, mainIndex: mi, probe: null, ...extra });
    return { session: { ...next, state: 'feedback' } };
  }
  if (s.state !== 'first_answer' && s.state !== 'followup_cycle') return { session: s, error: 'This step does not accept an answer.' };

  const kind: Turn['kind'] = s.state === 'first_answer' ? 'answer' : 'followup_answer';
  const next = push(s, { role: 'candidate', speaker: 'You', kind, text: body, mainIndex: mi, probe: null, ...extra });
  return { session: afterCandidate(next, questions, q, needTitle, decision ?? null) };
}

function afterCandidate(s: Session, questions: Record<string, Question>, q: Question | undefined, needTitle: string | undefined, decision: InterviewerDecision | null): Session {
  const mi = s.mainIndex;
  const used = s.followupsUsed[mi] ?? 0;
  if (decision && !s.fixtureId) {
    // A follow-up beyond the limit is never honored, whatever the model returns.
    if (decision.action === 'followup' && used < MAX_FOLLOWUPS && decision.message.trim()) {
      const followupsUsed = [...s.followupsUsed];
      followupsUsed[mi] = used + 1;
      return push({ ...s, followupsUsed, state: 'followup_cycle' }, { role: 'interviewer', speaker: speakerFor(s, mi), kind: 'followup', text: decision.message.trim(), mainIndex: mi, probe: decision.probe });
    }
    return closeMain(s, questions);
  }
  let probe: Probe | null = null;
  let text = '';
  if (used < MAX_FOLLOWUPS) {
    if (s.fixtureId) {
      const f = FIXTURE.followups[used];
      if (f) {
        probe = f.probe;
        text = f.q;
      }
    } else {
      probe = chooseProbe(s, q);
      if (probe) text = stylePrefix(s.style) + PROBE_TEXT[probe](needTitle);
    }
  }
  if (probe) {
    const followupsUsed = [...s.followupsUsed];
    followupsUsed[mi] = used + 1;
    return push({ ...s, followupsUsed, state: 'followup_cycle' }, { role: 'interviewer', speaker: speakerFor(s, mi), kind: 'followup', text, mainIndex: mi, probe });
  }
  return closeMain(s, questions);
}

function closeMain(s: Session, questions: Record<string, Question>): Session {
  const mi = s.mainIndex;
  if (s.kind === 'drill') {
    return push({ ...s, state: 'coaching_summary' }, { role: 'coach', speaker: 'Coach', kind: 'coaching', text: coachingFor(s, mi), mainIndex: mi, probe: null });
  }
  if (mi + 1 < s.questionIds.length) return askMain(s, questions, mi + 1);
  const closed = push(s, { role: 'interviewer', speaker: speakerFor(s, mi), kind: 'close', text: 'That’s all the questions for this practice interview. Thank you.', mainIndex: mi, probe: null });
  return { ...closed, state: 'feedback' };
}

export function skipQuestion(s: Session, questions: Record<string, Question>, expectedTurns: number): Session {
  if (s.turns.length !== expectedTurns || s.paused) return s;
  if (s.state !== 'first_answer' && s.state !== 'followup_cycle' && s.state !== 'independent_retry') return s;
  const mi = s.mainIndex;
  const marked = push(s, { role: 'candidate', speaker: 'You', kind: s.state === 'independent_retry' ? 'retry' : s.state === 'first_answer' ? 'answer' : 'followup_answer', text: '', mainIndex: mi, probe: null, skipped: true });
  if (s.state === 'independent_retry') return { ...marked, state: 'feedback' };
  if (s.state === 'first_answer' && s.kind !== 'drill') return mi + 1 < s.questionIds.length ? askMain(marked, questions, mi + 1) : { ...marked, state: 'feedback' };
  if (s.state === 'first_answer') return { ...marked, state: 'feedback', endedEarly: true };
  return closeMain(marked, questions);
}

export function startRetry(s: Session, questions: Record<string, Question>): Session {
  if (s.state !== 'coaching_summary') return s;
  const q = questions[s.questionIds[s.mainIndex]];
  return push({ ...s, state: 'independent_retry' }, { role: 'interviewer', speaker: speakerFor(s, s.mainIndex), kind: 'retry_prompt', text: q?.text ?? '', mainIndex: s.mainIndex, probe: null });
}

export function endEarly(s: Session): Session {
  if (s.state === 'feedback' || s.state === 'saved') return s;
  return { ...s, state: 'feedback', endedEarly: true, paused: false, updatedAt: nowIso() };
}

export function markSaved(s: Session): Session {
  return s.state === 'feedback' ? { ...s, state: 'saved', updatedAt: nowIso() } : s;
}

export function stateLabel(s: Session): string {
  const map: Record<Session['state'], string> = {
    setup: 'Setup',
    first_question: 'Question',
    first_answer: 'Your answer',
    followup_cycle: `Follow-up ${s.followupsUsed[s.mainIndex] ?? 0} of ${MAX_FOLLOWUPS}`,
    coaching_summary: 'Coaching summary',
    independent_retry: 'Independent retry',
    feedback: 'Feedback',
    saved: 'Saved',
  };
  return (s.paused ? 'Paused · ' : '') + map[s.state] + (s.endedEarly ? ' · ended early' : '');
}
