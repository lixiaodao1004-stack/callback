// Types shared by the browser adapter and the backend. No runtime code here,
// so the browser bundle never includes prompts or schemas.

export type AITask =
  | 'extract_needs'
  | 'match_evidence'
  | 'story_coach'
  | 'answer_draft'
  | 'interviewer_turn'
  | 'evaluate_answer'
  | 'practice_diagnosis'
  | 'research_summary'
  | 'material_draft'
  | 'propose_tasks';

export interface EnvSource {
  id: string;
  revision: number;
  kind: string;
  text: string;
  language: string;
  url_or_null: string | null;
}

export interface EnvRef {
  source_id: string;
  revision: number;
  quote: string;
}

export interface EnvFact {
  id: string;
  text: string;
  source_refs: EnvRef[];
  confirmed_by_user: boolean;
  qualifiers: string[];
  ownership: 'personal' | 'team' | 'unclear';
  story_id: string;
}

export interface EnvStory {
  id: string;
  title: string;
  fields: Record<string, string>;
}

export interface EnvNeed {
  id: string;
  title: string;
  kind: 'goal' | 'qualification';
  basis: 'explicit' | 'interpretation';
  jd_quote: string | null;
}

export interface Envelope {
  task_id: AITask;
  job_id: string | null;
  input_revision: string;
  locale: string;
  mode: 'live';
  sources: EnvSource[];
  facts: EnvFact[];
  stories: EnvStory[];
  job_needs: EnvNeed[];
  task_payload: Record<string, unknown>;
}

export interface Issue {
  code: 'unknown_id' | 'unmatched_quote' | 'stale_revision' | 'too_long' | 'count' | 'range' | 'enum' | 'unsupported_claim' | 'not_allowed' | 'cycle' | 'schema';
  path: string;
  message: string;
}

export interface AIMeta {
  requestId: string;
  task: AITask;
  promptVersion: string;
  model: string;
  inputRevision: string;
  attempts: number;
  servedByFallback: boolean;
}

export type AIResult<T = unknown> =
  | { status: 'ok'; data: T; flagged: Issue[]; meta: AIMeta }
  | { status: 'needs_input'; question: string; meta: AIMeta }
  | { status: 'insufficient_evidence'; explanation: string; meta: AIMeta }
  | { status: 'review_required'; issues: Issue[]; meta: AIMeta }
  | { status: 'unavailable'; reason: 'not_configured' | 'timeout' | 'rate_limited' | 'too_large' | 'cancelled' | 'refused' | 'error'; message: string };

// ---- Task outputs after validation (IDs are the app's, never invented) ----
export interface NeedsOut {
  needs: { local_key: string; title: string; kind: 'goal' | 'qualification'; priority: 'high' | 'medium' | 'low'; basis: 'explicit' | 'interpretation'; jd_refs: EnvRef[]; explanation: string; verified: boolean }[];
  clarify_questions: string[];
}
export interface MatchOut {
  links: { need_id: string; story_id_or_null: string | null; fact_ids: string[]; relationship: 'direct' | 'transferable' | 'needs_detail' | 'none_added'; reason: string; next_question: string }[];
  unmapped_need_ids: string[];
}
export interface CoachOut {
  next_question_or_null: string | null;
  proposed_facts: { text: string; source_refs: EnvRef[]; qualifiers: string[]; ownership: 'personal' | 'team' | 'unclear'; verified: boolean }[];
  unresolved: string[];
}
export interface DraftOut {
  answer: string;
  claims: { text: string; fact_ids: string[] }[];
  hypothetical_assumptions: string[];
  cues: string[];
  unresolved: string[];
}
export interface TurnOut {
  message: string;
  action: 'main_question' | 'followup' | 'close';
  probe: 'action' | 'decision' | 'outcome' | 'evidence' | 'relevance' | 'clarification' | 'none';
  target_need_id_or_null: string | null;
  reason: string;
}
export interface EvalOut {
  scores: { criterion: 'relevance' | 'evidence_ownership' | 'organization' | 'clear_language'; score: 1 | 2 | 3 | 4 | null; reason: string; answer_refs: EnvRef[] }[];
  strengths: { text: string; answer_refs: EnvRef[] }[];
  priority_fix: { text: string; reason: string; answer_refs: EnvRef[]; suggested_task: string } | null;
  unanswered: string[];
  format_checks: { label: string; observation: string; basis: 'reasoning_review' | 'actual_execution' | 'not_observed' }[];
}
export interface DiagnosisOut {
  observations: { text: string; answer_refs: EnvRef[] }[];
  confounds: string[];
  suggested_focus: { focus: 'add_details' | 'organization' | 'target_language' | 'independent_recall'; reason: string; task: string }[];
  certainty: 'tentative' | 'insufficient';
}
export interface ResearchOut {
  claims: { text: string; source_refs: EnvRef[]; as_of_or_null: string | null; verified: boolean }[];
  hypotheses: { text: string; basis: string }[];
  questions_to_ask: string[];
  unknowns: string[];
}
export interface MaterialOut {
  sections: { label: string; text: string; claims: { text: string; fact_ids: string[]; company_source_refs: EnvRef[] }[] }[];
  changes: { before: string; after: string; reason: string }[];
  unresolved: string[];
}
export interface TasksOut {
  tasks: { local_key: string; title: string; task_type: 'collect_fact' | 'prepare_story' | 'practice_question' | 'independent_retry' | 'review_research' | 'discovery_drill' | 'flashcard_review'; need_ids: string[]; story_ids: string[]; question_id_or_null: string | null; estimated_minutes: number; prerequisite_local_keys: string[]; reason: string }[];
  missing_context: string[];
}

export interface DiscoveryReply {
  message: string;
  revealed: { id: string; text: string }[];
  mode: 'live' | 'authored';
}
