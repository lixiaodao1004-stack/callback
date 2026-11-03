// "Discover the team's priority" — authored offline scenario engine.
// All facts here are fictional simulation facts. They are never written to research,
// stories, or JD records.

export type Topic = 'success' | 'current_state' | 'users' | 'pain' | 'measure' | 'data' | 'team';

export interface Scenario {
  id: 'A' | 'B' | 'C';
  label: string;
  priority: string;
  facts: Record<Topic, { id: string; text: string }>;
}

export const BRIEF =
  'You are interviewing for the Bayline Freight (fictional) Data Analyst Intern role. The JD says on-time delivery fell from 94% to 88%, and the intern will analyze route and warehouse data, build daily dashboards, and present to leadership. Ask the hiring manager questions to understand what matters most right now, then answer: “Tell me about experience that would help our team this summer.”';

export const SCENARIOS: Scenario[] = [
  {
    id: 'A',
    label: 'Adoption',
    priority: 'Dashboards exist, but daily manager use is inconsistent. Success means useful reporting becomes part of operational decisions.',
    facts: {
      success: { id: 'A.success', text: 'Honestly, success is managers actually opening the reports in their morning meeting and using them to decide where to send people.' },
      current_state: { id: 'A.current', text: 'We already have several dashboards. Some managers check them daily; others never open them.' },
      users: { id: 'A.users', text: 'The main users are about twenty site operations managers, most of whom are not analysts.' },
      pain: { id: 'A.pain', text: 'The frustrating part is that we build reports and then they sit unused.' },
      measure: { id: 'A.measure', text: 'We would look at whether managers use the dashboard in their stand-ups and whether they act on it.' },
      data: { id: 'A.data', text: 'The data is mostly fine. Route and scan data refresh overnight.' },
      team: { id: 'A.team', text: 'You would sit with a small analytics team that supports operations.' },
    },
  },
  {
    id: 'B',
    label: 'Diagnosis',
    priority: 'Delay patterns are poorly understood. Success means identifying credible causes and testing explanations.',
    facts: {
      success: { id: 'B.success', text: 'Success would be a credible explanation of why deliveries are late, with evidence we can test.' },
      current_state: { id: 'B.current', text: 'Right now we have lots of theories — weather, staffing, a new routing tool — but no clear answer.' },
      users: { id: 'B.users', text: 'Operations directors will use the findings to decide what to fix first.' },
      pain: { id: 'B.pain', text: 'The hard part is that delays cluster in ways nobody has explained yet.' },
      measure: { id: 'B.measure', text: 'We would want causes that hold up when we check them against new weeks of data.' },
      data: { id: 'B.data', text: 'Some warehouse timestamps are missing, which makes root-cause work harder.' },
      team: { id: 'B.team', text: 'You would work with two analysts and an operations researcher.' },
    },
  },
  {
    id: 'C',
    label: 'Communication',
    priority: 'Analysts produce reports, but leadership does not understand the recommendations. Success means explaining evidence and uncertainty clearly.',
    facts: {
      success: { id: 'C.success', text: 'Success is leadership understanding our recommendations well enough to make a decision.' },
      current_state: { id: 'C.current', text: 'The analysis is decent, but our presentations lose people quickly.' },
      users: { id: 'C.users', text: 'The audience is the leadership team, including finance and HR leaders without a technical background.' },
      pain: { id: 'C.pain', text: 'Leaders often ask, “So what should we do?” after a long technical slide deck.' },
      measure: { id: 'C.measure', text: 'We would know it worked if leaders can repeat the recommendation and its main uncertainty.' },
      data: { id: 'C.data', text: 'Data access is not the main problem for this role.' },
      team: { id: 'C.team', text: 'You would present alongside a senior analyst at monthly reviews.' },
    },
  },
];

// Several paraphrases per topic — sensible questions are accepted, not one exact keyword.
const TOPIC_PATTERNS: Record<Topic, RegExp[]> = {
  success: [/success/i, /\bpriorit/i, /most important/i, /matter(s)? most/i, /\bgoal/i, /great (job|summer|intern)/i, /look like if/i, /what would (make|be) .*(win|great|good)/i, /biggest (need|focus)/i, /main focus/i, /what do you (want|need|hope)/i, /\bexpect/i],
  current_state: [/current(ly)?/i, /right now/i, /today/i, /already (have|exist)/i, /existing/i, /how (do|does) .* (work|today)/i, /state of/i, /where (are|is) (you|the team)/i],
  users: [/\bwho\b.*(use|read|audience|see|consum)/i, /\busers?\b/i, /audience/i, /stakeholder/i, /\bfor whom\b/i, /who (will|would) (use|see|read)/i, /managers?/i, /leadership/i],
  pain: [/challeng/i, /problem/i, /pain/i, /frustrat/i, /struggl/i, /hard(est)? part/i, /difficult/i, /what('s| is) (not )?working/i, /obstacle/i, /blocker/i],
  measure: [/measur/i, /metric/i, /\bkpi/i, /how (will|would) you know/i, /evaluat/i, /track/i, /indicator/i],
  data: [/\bdata\b/i, /timestamp/i, /quality/i, /sources?\b/i, /databas/i, /\bsql\b/i],
  team: [/\bteam\b/i, /work with/i, /report to/i, /colleague/i, /\bmentor/i],
};

const INJECTION = /(hidden|secret|system prompt|ignore (all|previous|the|your)|reveal|scenario (id|letter)|which scenario|answer key|rubric|evaluation (criteria|instructions)|developer|jailbreak|print (your|the) (instructions|prompt)|what are you scored)/i;

export interface ScenarioReply {
  text: string;
  revealed: string[];
  kind: 'answer_clarification' | 'refusal' | 'irrelevant';
}

/** Intent recognition over authored branches. Only facts from the selected scenario can be revealed. */
export function respondToQuestion(scenario: Scenario, question: string, alreadyRevealed: string[]): ScenarioReply {
  if (INJECTION.test(question)) {
    return { text: 'I’m here as the hiring manager, so I can’t share anything like that. Happy to talk about the team and what we need, though.', revealed: [], kind: 'refusal' };
  }
  const topics = (Object.keys(TOPIC_PATTERNS) as Topic[]).filter((t) => TOPIC_PATTERNS[t].some((re) => re.test(question)));
  if (!topics.length) {
    return { text: 'That’s not something I can say much about for this role. Is there anything about the team’s work or what we need this summer you’d like to know?', revealed: [], kind: 'irrelevant' };
  }
  // At most two topics per question, in a stable order of usefulness.
  const order: Topic[] = ['success', 'pain', 'current_state', 'users', 'measure', 'data', 'team'];
  const chosen = order.filter((t) => topics.includes(t)).slice(0, 2);
  const facts = chosen.map((t) => scenario.facts[t]);
  const fresh = facts.filter((f) => !alreadyRevealed.includes(f.id));
  const text = facts.map((f) => (alreadyRevealed.includes(f.id) ? 'As I mentioned, ' + f.text.charAt(0).toLowerCase() + f.text.slice(1) : f.text)).join(' ');
  return { text, revealed: fresh.map((f) => f.id), kind: 'answer_clarification' };
}

export const DISCOVERY_FOLLOWUPS = [
  'How would you adapt that experience to what I described about our team?',
  'What would you want to find out in your first week?',
  'What part of that experience does not transfer directly here?',
];

export function pickScenario(previous: string | null): Scenario {
  const pool = SCENARIOS.filter((s) => s.id !== previous);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function factText(id: string): string {
  for (const s of SCENARIOS) for (const f of Object.values(s.facts)) if (f.id === id) return f.text;
  return '';
}
