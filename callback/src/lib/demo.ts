import type { ConfirmedFact, Data, EvidenceLink, Feedback, JobNeed, PrepTask, Session, SourceDocument, Story, Turn } from './types';
import { makeSpan, nowIso } from './text';
import { seedQuestions } from './questions';

export const MEI_JD = `Bayline Freight (fictional) is hiring a Data Analyst Intern for Summer 2027. Our on-time delivery rate fell from 94% to 88% this year, and we need to know why. You will analyze route and warehouse data to find the causes of late deliveries. You will build dashboards our operations managers use every morning. You will present recommendations to leadership, including people without a technical background. Requirements: SQL, Python, and Tableau or Power BI.`;

export const MEI_RESUME = `Mei Lin (fictional)
M.S. in Data Science, Bayview University, Boston (expected 2028).
Capstone: analyzed 2.1 million bike-share trips in Python to find stations with chronic shortages; a new rebalancing schedule cut simulated empty-station hours by 18%.
Data Analyst Intern, regional e-commerce company, Shanghai (2025): built a Power BI dashboard that 12 warehouse supervisors used to track late shipments in their daily stand-up.
Teaching assistant, Intro to Statistics: led weekly review sessions for 40 students.
Skills: Python, SQL, Tableau, Power BI, scikit-learn.`;

export const HOME_BEFORE = "I'm a data science student. I know Python, SQL, and Power BI.";
export const HOME_AFTER = 'I built a shipment dashboard used by 12 supervisors and analyzed 2.1 million trips in a university project.';

// Appendix B — prepared single-question drill. Only exact matches show the prepared result.
export const FIXTURE = {
  id: 'fixture_mei_dashboard_drill_v1',
  question: "Tell me about a time your work supported a team's daily operational decisions.",
  first: 'During my internship, I built a Power BI dashboard for the warehouse team.',
  followups: [
    { probe: 'evidence' as const, q: 'Who used the dashboard, and what did it help them monitor?', a: 'Twelve warehouse supervisors used it to track late shipments in their daily stand-up.' },
    { probe: 'outcome' as const, q: 'What can you say about the outcome of that work?', a: 'I can say it was used in their daily stand-up. I do not have a measured reduction in late shipments.' },
    { probe: 'relevance' as const, q: 'How does that experience connect to this internship?', a: 'This role needs reporting managers can use each morning. My relevant experience is building a dashboard that supported the daily discussion of late shipments.' },
  ],
  coaching:
    'Your first answer named the tool and deliverable. Add who used it, the operational task it supported, and the connection to this role. Keep the boundary: adoption is supported; a delivery improvement is not.',
  retry:
    'During my internship at a regional e-commerce company, I built a Power BI dashboard that 12 warehouse supervisors used to track late shipments in their daily stand-up. That experience is relevant to your need for daily operational reporting. I can demonstrate that the dashboard was used; I cannot claim it reduced delivery delays.',
  strongestQuote: '12 warehouse supervisors used to track late shipments in their daily stand-up',
  practiceNext: 'Add one real design decision you personally made, and explain why you chose it.',
  reference:
    'I built a Power BI dashboard that 12 warehouse supervisors used in their daily stand-up to track late shipments. That gives me relevant experience for your need for daily operational reporting.',
  transferQuestion: 'Tell me about a time you made information useful to someone else.',
  scores: {
    first: { relevance: 2, evidence_ownership: 2, organization: 3, clear_language: 3 },
    retry: { relevance: 4, evidence_ownership: 3, organization: 4, clear_language: 4 },
  },
};

export const RUBRIC_VERSION = 'core-rubric-v1';

export function emptyData(kind: 'demo' | 'personal'): Data {
  return {
    workspaceKind: kind,
    profile: { id: 'profile', name: '', resumeSourceId: null, preferredLanguage: 'en', practiceLanguage: 'en', revision: 1 },
    sources: {},
    facts: {},
    jobs: {},
    rounds: {},
    needs: {},
    stories: {},
    links: {},
    questions: seedQuestions(),
    answers: {},
    sessions: {},
    transcripts: {},
    feedback: {},
    diagnostics: {},
    discoveries: {},
    tasks: {},
    plans: {},
    materials: {},
    flashcards: {},
    assignments: {},
    shares: {},
    docs: {},
    currentJobId: null,
  };
}

function src(id: string, kind: SourceDocument['kind'], title: string, text: string, jobId: string | null): SourceDocument {
  const t = nowIso();
  return { id, kind, title, text, language: 'en', url: null, revision: 1, fictional: true, jobId, retrievedAt: null, createdAt: t, updatedAt: t };
}

function story(id: string, s: Partial<Story> & Pick<Story, 'title' | 'category'>): Story {
  return {
    id,
    context: '',
    role: '',
    actions: '',
    decision: '',
    result: '',
    howKnown: '',
    collaborators: '',
    dates: '',
    scope: '',
    qualifiers: [],
    themes: [],
    openQuestions: [],
    cues: [],
    revision: 1,
    fictional: true,
    ...s,
  };
}

export function buildMeiDemo(): Data {
  const d = emptyData('demo');
  const t = nowIso();
  const resume = src('src_mei_resume', 'resume', 'Mei Lin resume (fictional)', MEI_RESUME, null);
  const jd = src('src_bayline_jd', 'jd', 'Bayline Freight JD (fictional)', MEI_JD, 'job_bayline');
  d.sources[resume.id] = resume;
  d.sources[jd.id] = jd;
  d.profile = { ...d.profile, name: 'Mei Lin (fictional)', resumeSourceId: resume.id };

  d.jobs.job_bayline = {
    id: 'job_bayline',
    company: 'Bayline Freight (fictional)',
    role: 'Data Analyst Intern, Summer 2027',
    level: 'Intern',
    url: '',
    location: '',
    status: 'interviewing',
    jdSourceId: jd.id,
    archived: false,
    fictional: true,
    research: [
      { id: 'rc1', text: 'On-time delivery rate fell from 94% to 88% this year.', label: 'jd_explicit', sourceId: jd.id, section: 'company' },
      { id: 'rc2', text: 'Analyze route and warehouse data; build daily dashboards; present to leadership.', label: 'jd_explicit', sourceId: jd.id, section: 'role' },
      { id: 'rc3', text: 'Delay root-cause analysis and dashboard adoption may come up as topics.', label: 'hypothesis', sourceId: null, section: 'topics' },
      { id: 'rc4', text: 'Which delivery metric do operations managers check first each morning?', label: 'hypothesis', sourceId: null, section: 'questions' },
    ],
    createdAt: t,
  };
  d.currentJobId = 'job_bayline';
  d.rounds.round_1 = {
    id: 'round_1',
    jobId: 'job_bayline',
    name: 'Hiring manager screen',
    date: '2027-02-10T10:00',
    timezone: 'America/New_York',
    format: 'Video, 30 min',
    notes: 'Fictional example round.',
    askedQuestions: '',
    debrief: '',
    followups: '',
  };

  d.stories.st_capstone = story('st_capstone', {
    title: 'Bike-share shortage capstone',
    category: 'coursework',
    context: 'University capstone, M.S. Data Science, Bayview University.',
    actions: 'Analyzed 2.1 million bike-share trips in Python to find stations with chronic shortages.',
    result: 'A new rebalancing schedule cut simulated empty-station hours by 18%.',
    qualifiers: ['simulated result', 'university project', 'not deployed'],
    themes: ['operational analysis', 'Python'],
    openQuestions: ['What was your personal role versus the team’s?', 'How was the 18% simulated result measured?', 'Which decision did you personally make?'],
  });
  d.stories.st_dashboard = story('st_dashboard', {
    title: 'Late-shipment dashboard internship',
    category: 'work',
    context: 'Data Analyst Intern, regional e-commerce company, Shanghai (2025).',
    actions: 'Built a Power BI dashboard.',
    result: '12 warehouse supervisors used it to track late shipments in their daily stand-up.',
    howKnown: '',
    dates: '2025',
    qualifiers: ['adoption shown; no measured reduction in late shipments'],
    themes: ['dashboards', 'operations reporting', 'Power BI'],
    openQuestions: ['What design decision did you personally make, and why?', 'How do you know the supervisors used it daily?'],
  });
  d.stories.st_ta = story('st_ta', {
    title: 'Statistics teaching assistant',
    category: 'teaching',
    context: 'Teaching assistant, Intro to Statistics.',
    actions: 'Led weekly review sessions for 40 students.',
    qualifiers: ['teaching audience, not leadership'],
    themes: ['explaining to non-specialists'],
    openQuestions: ['Give one example of explaining a hard idea simply.', 'How did you know students understood?'],
  });

  const factDefs: [string, string, string, string[], ConfirmedFact['ownership']][] = [
    ['f_trips', 'st_capstone', 'analyzed 2.1 million bike-share trips in Python to find stations with chronic shortages', ['university capstone'], 'unclear'],
    ['f_sim18', 'st_capstone', 'a new rebalancing schedule cut simulated empty-station hours by 18%', ['simulated', 'not deployed'], 'unclear'],
    ['f_dash', 'st_dashboard', 'built a Power BI dashboard that 12 warehouse supervisors used to track late shipments in their daily stand-up', ['adoption, not measured improvement'], 'personal'],
    ['f_intern', 'st_dashboard', 'Data Analyst Intern, regional e-commerce company, Shanghai (2025)', [], 'personal'],
    ['f_ta', 'st_ta', 'led weekly review sessions for 40 students', ['teaching'], 'personal'],
  ];
  for (const [id, storyId, quote, qualifiers, ownership] of factDefs) {
    const span = makeSpan(resume, quote)!;
    d.facts[id] = { id, storyId, text: span.quote, spans: [span], confirmed: true, origin: 'source', qualifiers, ownership, createdAt: t };
  }

  const needDefs: [string, string, JobNeed['kind'], JobNeed['priority'], string, string][] = [
    ['n_delays', 'Investigate operational delays', 'goal', 'high', 'find the causes of late deliveries', 'The JD asks for the causes of late deliveries after on-time delivery fell.'],
    ['n_dash', 'Build dashboards for daily operations', 'goal', 'high', 'build dashboards our operations managers use every morning', 'Dashboards are for daily use by operations managers.'],
    ['n_present', 'Explain recommendations to non-technical leaders', 'goal', 'high', 'present recommendations to leadership, including people without a technical background', 'Recommendations go to leadership, including non-technical people.'],
    ['n_sql', 'SQL', 'qualification', 'medium', 'SQL', 'Skill requested in the JD.'],
    ['n_python', 'Python', 'qualification', 'medium', 'Python', 'Skill requested in the JD.'],
    ['n_bi', 'Tableau or Power BI', 'qualification', 'medium', 'Tableau or Power BI', 'BI tool requested in the JD.'],
  ];
  needDefs.forEach(([id, title, kind, priority, quote, explanation], i) => {
    d.needs[id] = { id, jobId: 'job_bayline', title, kind, priority, basis: 'explicit', jdSpan: makeSpan(jd, quote), explanation, order: i, confirmed: true, jdRevision: 1 };
  });

  const link = (id: string, needId: string, storyId: string | null, factIds: string[], relationship: EvidenceLink['relationship'], reason: string, qualifierNote: string, nextQuestion: string): EvidenceLink => ({
    id,
    jobId: 'job_bayline',
    needId,
    storyId,
    factIds,
    relationship,
    reason,
    qualifierNote,
    nextQuestion,
    review: 'confirmed',
    jdRevision: 1,
    storyRevision: 1,
  });
  d.links.l_delays = link('l_delays', 'n_delays', 'st_capstone', ['f_trips'], 'transferable', 'Operational analysis of shortages is relevant to finding causes of late deliveries.', 'The resume does not establish delivery-delay analysis or real-world deployment; the 18% result is simulated.', 'How did you decide which stations counted as “chronic” shortages?');
  d.links.l_dash = link('l_dash', 'n_dash', 'st_dashboard', ['f_dash'], 'direct', 'A dashboard used daily by 12 warehouse supervisors matches a dashboard managers use every morning.', 'Shows adoption. Do not claim the dashboard reduced late shipments.', 'What design decision did you personally make?');
  d.links.l_present = link('l_present', 'n_present', 'st_ta', ['f_ta'], 'transferable', 'Leading review sessions involves explaining technical material to non-specialists.', 'Teaching is relevant; persuading leadership is not established.', 'Describe one time you explained a result to someone without a statistics background.');
  for (const [lid, nid] of [['l_sql', 'n_sql'], ['l_python', 'n_python'], ['l_bi', 'n_bi']]) {
    d.links[lid] = link(lid, nid, null, [], 'needs_detail', 'Listed in the resume skills line. A skills-list mention is not proof of a specific project.', '', 'Which project shows you using this skill, and what did you do with it?');
  }

  // Appendix B question + prepared session
  d.questions.q_fixture = { id: 'q_fixture', text: FIXTURE.question, format: 'behavioral', theme: 'operational reporting', difficulty: 'standard', stage: 'hiring_manager', origin: 'generated', jobId: 'job_bayline', needId: 'n_dash', language: 'en' };
  d.questions.q_transfer = { id: 'q_transfer', text: FIXTURE.transferQuestion, format: 'behavioral', theme: 'transfer check', difficulty: 'standard', stage: 'hiring_manager', origin: 'generated', jobId: 'job_bayline', needId: null, language: 'en' };

  const turn = (i: number, role: Turn['role'], speaker: string, kind: Turn['kind'], text: string, probe: Turn['probe'] = null): Turn => ({ id: `t_fx_${i}`, role, speaker, kind, text, mainIndex: 0, probe, recordingId: null, durationSec: null, skipped: false, at: t });
  const turns: Turn[] = [
    turn(0, 'interviewer', 'Interviewer', 'main', FIXTURE.question),
    turn(1, 'candidate', 'Mei (fictional)', 'answer', FIXTURE.first),
  ];
  FIXTURE.followups.forEach((f, i) => {
    turns.push(turn(2 + i * 2, 'interviewer', 'Interviewer', 'followup', f.q, f.probe));
    turns.push(turn(3 + i * 2, 'candidate', 'Mei (fictional)', 'followup_answer', f.a));
  });
  turns.push(turn(8, 'coach', 'Coach', 'coaching', FIXTURE.coaching));
  turns.push(turn(9, 'interviewer', 'Interviewer', 'retry_prompt', FIXTURE.question));
  turns.push(turn(10, 'candidate', 'Mei (fictional)', 'retry', FIXTURE.retry));
  const session: Session = {
    id: 'sess_fixture',
    jobId: 'job_bayline',
    needId: 'n_dash',
    questionIds: ['q_fixture'],
    kind: 'drill',
    mode: 'text',
    style: 'neutral',
    panel: [],
    state: 'saved',
    paused: false,
    endedEarly: false,
    turns,
    mainIndex: 0,
    followupsUsed: [3],
    assisted: false,
    fixtureId: FIXTURE.id,
    createdAt: t,
    updatedAt: t,
    durationMin: 15,
  };
  d.sessions[session.id] = session;
  d.feedback.fb_fx_first = fixtureFeedback(session.id, 't_fx_1', FIXTURE.first, 'first')!;
  d.feedback.fb_fx_retry = fixtureFeedback(session.id, 't_fx_10', FIXTURE.retry, 'retry')!;

  // Prompt 11 example fixture tasks
  const task = (id: string, key: string, title: string, type: PrepTask['type'], minutes: number, prerequisites: string[], needIds: string[], storyIds: string[], rationale: string, questionId: string | null = null): PrepTask => ({
    id, key, jobId: 'job_bayline', title, type, minutes, rationale, prerequisites, needIds, storyIds, questionId, status: 'todo', pinned: false, importance: 3, source: 'prepared_example', createdAt: t,
  });
  d.tasks.task_A = task('task_A', 'A', 'Confirm one dashboard outcome', 'collect_fact', 5, [], ['n_dash'], ['st_dashboard'], 'How the dashboard’s use is known is still blank.');
  d.tasks.task_B = task('task_B', 'B', 'Rehearse the dashboard story', 'practice_question', 10, ['task_A'], ['n_dash'], ['st_dashboard'], 'Targets the daily-reporting need.', 'q_fixture');
  d.tasks.task_C = task('task_C', 'C', 'Unassisted retry of the dashboard answer', 'independent_retry', 5, ['task_B'], ['n_dash'], ['st_dashboard'], 'Checks you can explain it without cues.', 'q_fixture');
  d.tasks.task_D = task('task_D', 'D', 'Review company source notes', 'review_research', 10, [], ['n_present'], [], 'Supports motivation and relevance answers.');

  d.flashcards.fc_1 = { id: 'fc_1', questionId: 'q_fixture', storyId: 'st_dashboard', front: FIXTURE.question, cues: ['Power BI dashboard', '12 supervisors, daily stand-up', 'adoption, not measured reduction'], selfRecall: null, interval: 0, nextReview: new Date().toISOString().slice(0, 10), history: [] };
  return d;
}

/** Prepared feedback exists only for the exact fixture text. Any edit disables it. */
export function fixtureFeedback(sessionId: string, turnId: string, answer: string, which: 'first' | 'retry'): Feedback | null {
  const expected = which === 'first' ? FIXTURE.first : FIXTURE.retry;
  if (answer.trim() !== expected) return null;
  const s = FIXTURE.scores[which];
  const reasons =
    which === 'first'
      ? {
          relevance: 'Names a dashboard but does not say how it supported daily decisions or this role.',
          evidence_ownership: 'A specific deliverable ("I built"), but who used it and what changed are missing.',
          organization: 'A short, coherent statement; there is little to organize yet.',
          clear_language: 'Clear and understandable wording.',
        }
      : {
          relevance: 'Connects the dashboard directly to the stated need for daily operational reporting.',
          evidence_ownership: 'Clear personal action and concrete adoption outcome; how use is known is not stated.',
          organization: 'Context, outcome, relevance, then boundary — easy to follow.',
          clear_language: 'Precise wording, and the boundary is stated plainly.',
        };
  const quotes = which === 'first' ? { relevance: 'for the warehouse team', evidence_ownership: 'I built a Power BI dashboard', organization: '', clear_language: 'I built a Power BI dashboard' } : { relevance: 'relevant to your need for daily operational reporting', evidence_ownership: FIXTURE.strongestQuote, organization: '', clear_language: 'I cannot claim it reduced delivery delays' };
  return {
    id: which === 'first' ? 'fb_fx_first' : 'fb_fx_retry',
    sessionId,
    turnId,
    answerText: answer,
    transcriptVersionId: null,
    rubricVersion: RUBRIC_VERSION,
    mode: 'prepared_example',
    assisted: false,
    scores: (['relevance', 'evidence_ownership', 'organization', 'clear_language'] as const).map((c) => ({ criterion: c, score: s[c] as 1 | 2 | 3 | 4, reason: reasons[c], quote: quotes[c] })),
    strengths: which === 'retry' ? [{ text: 'Specific, supported adoption evidence.', quote: FIXTURE.strongestQuote }] : [{ text: 'Names a concrete deliverable you built.', quote: 'I built a Power BI dashboard' }],
    priorityFix: which === 'retry' ? { text: FIXTURE.practiceNext, nextAction: 'Answer the story coach question about a design decision.' } : { text: 'Say who used it and what it helped them do.', nextAction: 'Answer the follow-ups, then retry.' },
    dispute: '',
    supersedes: null,
    createdAt: nowIso(),
  };
}
