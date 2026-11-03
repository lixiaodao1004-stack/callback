// Shared entities. Every screen reads these; nothing keeps its own copy.

export type ID = string;
export type WorkspaceKind = 'demo' | 'personal';

export interface Profile {
  id: ID;
  name: string;
  resumeSourceId: ID | null;
  preferredLanguage: string; // language for gathering details
  practiceLanguage: string; // output language for practice
  revision: number;
}

export type SourceKind = 'resume' | 'jd' | 'research' | 'candidate_input' | 'supporting';

export interface SourceDocument {
  id: ID;
  kind: SourceKind;
  title: string;
  text: string; // original text exactly as supplied
  language: string;
  url: string | null;
  revision: number;
  fictional: boolean;
  jobId: ID | null;
  retrievedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Offsets are derived by code against a specific revision.
export interface SourceSpan {
  sourceId: ID;
  revision: number;
  quote: string;
  start: number;
  end: number;
}

export type Ownership = 'personal' | 'team' | 'unclear';

export interface ConfirmedFact {
  id: ID;
  storyId: ID;
  text: string;
  spans: SourceSpan[];
  confirmed: boolean; // only confirmed facts feed drafts
  origin: 'source' | 'user_added';
  qualifiers: string[];
  ownership: Ownership;
  createdAt: string;
}

export type ApplicationStatus = 'researching' | 'applied' | 'interviewing' | 'offer' | 'closed';

export interface ResearchClaim {
  id: ID;
  text: string;
  label: 'jd_explicit' | 'source_backed' | 'hypothesis' | 'not_verified';
  sourceId: ID | null;
  section: 'company' | 'role' | 'topics' | 'questions';
}

export interface Job {
  id: ID;
  company: string;
  role: string;
  level: string;
  url: string;
  location: string;
  status: ApplicationStatus;
  jdSourceId: ID | null;
  archived: boolean;
  fictional: boolean;
  research: ResearchClaim[];
  createdAt: string;
}

export interface InterviewRound {
  id: ID;
  jobId: ID;
  name: string;
  date: string; // ISO local date-time "YYYY-MM-DDTHH:mm"
  timezone: string;
  format: string;
  notes: string;
  askedQuestions: string; // user recollection, private
  debrief: string;
  followups: string;
}

export interface JobNeed {
  id: ID;
  jobId: ID;
  title: string;
  kind: 'goal' | 'qualification';
  priority: 'high' | 'medium' | 'low';
  basis: 'explicit' | 'interpretation';
  jdSpan: SourceSpan | null;
  explanation: string;
  order: number;
  confirmed: boolean;
  jdRevision: number;
}

export interface Story {
  id: ID;
  title: string;
  category: 'work' | 'coursework' | 'research' | 'volunteering' | 'club' | 'personal' | 'teaching';
  context: string;
  role: string;
  actions: string;
  decision: string;
  result: string;
  howKnown: string;
  collaborators: string;
  dates: string;
  scope: string;
  qualifiers: string[];
  themes: string[];
  openQuestions: string[];
  cues: string[]; // user-confirmed memory cues
  revision: number;
  fictional: boolean;
}

export type Relationship = 'direct' | 'transferable' | 'needs_detail' | 'none_added';
export type Validation = 'valid' | 'unverified' | 'stale';

export interface EvidenceLink {
  id: ID;
  jobId: ID;
  needId: ID;
  storyId: ID | null;
  factIds: ID[];
  relationship: Relationship;
  reason: string;
  qualifierNote: string;
  nextQuestion: string;
  review: 'proposed' | 'confirmed';
  // input revisions this link was built against — staleness is derived from these
  jdRevision: number;
  storyRevision: number;
}

export type QuestionFormat =
  | 'recruiter'
  | 'behavioral'
  | 'technical'
  | 'product_case'
  | 'data_analysis'
  | 'coding'
  | 'system_design'
  | 'salary';

export interface Question {
  id: ID;
  text: string;
  format: QuestionFormat;
  theme: string;
  difficulty: 'intro' | 'standard' | 'stretch';
  stage: 'recruiter' | 'hiring_manager' | 'technical' | 'final';
  origin: 'seed' | 'user' | 'generated';
  jobId: ID | null;
  needId: ID | null;
  language: string;
  saved?: boolean; // in the user's "Saved" collection
}

export interface AnswerVersion {
  id: ID;
  jobId: ID | null;
  questionId: ID;
  needId: ID | null;
  storyId: ID | null;
  factIds: ID[];
  text: string;
  kind: 'independent_first' | 'edit' | 'reference';
  length: 'short' | 'standard' | 'deep';
  structure: 'intro' | 'star' | 'reasoning';
  storyRevision: number | null;
  createdAt: string;
}

export type SessionState =
  | 'setup'
  | 'first_question'
  | 'first_answer'
  | 'followup_cycle'
  | 'coaching_summary'
  | 'independent_retry'
  | 'feedback'
  | 'saved';

export type Probe = 'action' | 'decision' | 'outcome' | 'evidence' | 'relevance' | 'clarification' | 'assumptions' | 'validation' | 'tradeoff';

export interface Turn {
  id: ID;
  role: 'interviewer' | 'candidate' | 'coach';
  speaker: string;
  kind: 'main' | 'followup' | 'answer' | 'followup_answer' | 'coaching' | 'retry_prompt' | 'retry' | 'close';
  text: string;
  mainIndex: number;
  probe: Probe | null;
  recordingId: ID | null;
  durationSec: number | null;
  skipped: boolean;
  at: string;
}

export interface TranscriptVersion {
  id: ID;
  turnId: ID;
  sessionId: ID;
  text: string;
  version: number;
  origin: 'manual_entry' | 'correction' | 'service';
  note: string;
  createdAt: string;
}

export interface Session {
  id: ID;
  jobId: ID | null;
  needId: ID | null;
  questionIds: ID[];
  kind: 'drill' | 'full' | 'panel';
  mode: 'text' | 'audio' | 'video';
  style: 'friendly' | 'neutral' | 'challenging';
  panel: string[];
  state: SessionState;
  paused: boolean;
  endedEarly: boolean;
  turns: Turn[];
  mainIndex: number;
  followupsUsed: number[]; // per main question
  assisted: boolean; // reference viewed before the retry
  fixtureId: string | null;
  createdAt: string;
  updatedAt: string;
  durationMin: number;
}

export type Criterion = 'relevance' | 'evidence_ownership' | 'organization' | 'clear_language';

export interface CriterionScore {
  criterion: Criterion;
  score: 1 | 2 | 3 | 4 | null;
  reason: string;
  quote: string;
}

export interface Feedback {
  id: ID;
  sessionId: ID;
  turnId: ID;
  answerText: string; // the exact text evaluated
  transcriptVersionId: ID | null;
  rubricVersion: string;
  mode: 'prepared_example' | 'self_review' | 'live';
  assisted: boolean;
  scores: CriterionScore[];
  strengths: { text: string; quote: string }[];
  priorityFix: { text: string; nextAction: string } | null;
  dispute: string;
  supersedes: ID | null;
  createdAt: string;
  formatChecks?: { label: string; observation: string; basis: 'reasoning_review' | 'actual_execution' | 'not_observed' }[];
  aiMeta?: { requestId: string; promptVersion: string; model: string; servedByFallback: boolean };
}

export type FocusCategory = 'add_details' | 'organization' | 'target_language' | 'independent_recall' | 'insufficient_evidence';

export interface DiagnosticRun {
  id: ID;
  storyId: ID | null;
  questionId: ID | null;
  step: number;
  original: string;
  difficulty: string;
  supplement: string; // preferred-language details, may be empty (declined)
  supplementDeclined: boolean;
  proposedFacts: string[];
  confirmedNewFactIds: ID[];
  cue: string;
  retry: string;
  laterPrompt: string;
  laterAnswer: string;
  factsAtOriginal: ID[];
  factsAtRetry: ID[];
  choices: { focus: FocusCategory; priority: number; reason: string }[];
  status: 'in_progress' | 'accepted' | 'dismissed';
  taskIds: ID[];
  createdAt: string;
}

export interface DiscoveryTurn {
  role: 'candidate' | 'interviewer';
  text: string;
  revealed: string[];
  phase: 'clarify' | 'answer' | 'followup';
}

export interface DiscoveryRun {
  id: ID;
  jobId: ID | null;
  scenarioId: string;
  turns: DiscoveryTurn[];
  revealed: string[];
  storyId: ID | null;
  storyChanges: { storyId: ID | null; afterRevealCount: number }[];
  answer: string;
  followupsUsed: number;
  phase: 'brief' | 'clarify' | 'answer' | 'followup' | 'debrief';
  selfReview: Record<string, boolean>;
  createdAt: string;
  // Assessed mode: the scenario is held by the server; only the run id is stored here.
  serverRunId?: string | null;
  revealedTexts?: Record<string, string>;
  debrief?: { scenarioId: string; label: string; priority: string; total: number } | null;
}

export type TaskType =
  | 'collect_fact'
  | 'prepare_story'
  | 'practice_question'
  | 'independent_retry'
  | 'review_research'
  | 'discovery_drill'
  | 'flashcard_review'
  | 'material';

export interface PrepTask {
  id: ID;
  key: string;
  jobId: ID | null;
  title: string;
  type: TaskType;
  minutes: number;
  rationale: string;
  prerequisites: ID[];
  needIds: ID[];
  storyIds: ID[];
  questionId: ID | null;
  status: 'todo' | 'done' | 'skipped';
  pinned: boolean;
  importance: number; // 1-5, user-adjustable
  source: 'rule' | 'diagnosis' | 'user' | 'prepared_example';
  createdAt: string;
}

export interface PrepPlan {
  id: ID;
  jobId: ID | null;
  budgetMinutes: number;
  sessionLength: number;
  focusNeedId: ID | null;
  horizonDays: number;
  scheduledIds: ID[];
  unscheduledIds: ID[];
  explanation: string[];
  computedAt: string;
}

export interface MaterialVersion {
  id: ID;
  jobId: ID;
  type: 'resume' | 'cover_letter' | 'summary' | 'follow_up' | 'prep_card';
  title: string;
  text: string;
  factIds: ID[];
  storyRevisions: Record<ID, number>;
  jdRevision: number | null;
  version: number;
  createdAt: string;
}

export interface Flashcard {
  id: ID;
  questionId: ID;
  storyId: ID | null;
  front: string;
  cues: string[];
  selfRecall: 'again' | 'hard' | 'good' | 'easy' | null;
  interval: number;
  nextReview: string; // YYYY-MM-DD
  history: { at: string; rating: string }[];
}

export interface Assignment {
  id: ID;
  title: string;
  questions: string[];
  dueDate: string;
  modes: ('text' | 'audio' | 'video')[];
  rubric: string;
  studentIds: string[];
  createdAt: string;
}

export interface ShareGrant {
  id: ID;
  snapshotOf: ID; // session id
  snapshotText: string;
  scope: { summary: boolean; transcript: boolean; recording: boolean; materials: boolean };
  purpose: string;
  counselor: string;
  revoked: boolean;
  createdAt: string;
  annotations: { quote: string; note: string }[];
}

export interface WorkspaceDoc {
  id: ID;
  kind: 'coding' | 'system_design' | 'case' | 'salary';
  title: string;
  fields: Record<string, string>;
  revisions: { at: string; fields: Record<string, string> }[];
  questionId: ID | null;
}

export interface Data {
  workspaceKind: WorkspaceKind;
  profile: Profile;
  sources: Record<ID, SourceDocument>;
  facts: Record<ID, ConfirmedFact>;
  jobs: Record<ID, Job>;
  rounds: Record<ID, InterviewRound>;
  needs: Record<ID, JobNeed>;
  stories: Record<ID, Story>;
  links: Record<ID, EvidenceLink>;
  questions: Record<ID, Question>;
  answers: Record<ID, AnswerVersion>;
  sessions: Record<ID, Session>;
  transcripts: Record<ID, TranscriptVersion>;
  feedback: Record<ID, Feedback>;
  diagnostics: Record<ID, DiagnosticRun>;
  discoveries: Record<ID, DiscoveryRun>;
  tasks: Record<ID, PrepTask>;
  plans: Record<ID, PrepPlan>;
  materials: Record<ID, MaterialVersion>;
  flashcards: Record<ID, Flashcard>;
  assignments: Record<ID, Assignment>;
  shares: Record<ID, ShareGrant>;
  docs: Record<ID, WorkspaceDoc>;
  currentJobId: ID | null;
}

export interface Prefs {
  theme: 'system' | 'light' | 'dark';
  timezone: string;
  speakPrompts: boolean;
  defaultMode: 'text' | 'audio' | 'video';
  reducedMotion: boolean;
}

export interface GuideState {
  step: number; // 0-4
  dismissed: boolean;
  completed: boolean[];
}

export interface Persisted {
  schema: 2;
  active: WorkspaceKind;
  workspaces: { demo: Data | null; personal: Data };
  prefs: Prefs;
  guide: GuideState;
}
