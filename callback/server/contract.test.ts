import { describe, expect, it, beforeEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { validate, TASKS, EnvelopeSchema } from './contract';
import { runTask, __setClientForTests } from './ai';
import type { Envelope } from '../src/lib/ai/types';
import { buildMeiDemo, MEI_JD, MEI_RESUME } from '../src/lib/demo';

const base = (task: Envelope['task_id'], extra: Partial<Envelope> = {}): Envelope => ({
  task_id: task,
  job_id: 'job_bayline',
  input_revision: 'r1',
  locale: 'en',
  mode: 'live',
  sources: [
    { id: 'src_bayline_jd', revision: 1, kind: 'jd', text: MEI_JD, language: 'en', url_or_null: null },
    { id: 'src_mei_resume', revision: 1, kind: 'resume', text: MEI_RESUME, language: 'en', url_or_null: null },
  ],
  facts: Object.values(buildMeiDemo().facts).map((f) => ({ id: f.id, text: f.text, source_refs: [], confirmed_by_user: true, qualifiers: f.qualifiers, ownership: f.ownership, story_id: f.storyId })),
  stories: [{ id: 'st_dashboard', title: 'Dashboard', fields: {} }, { id: 'st_capstone', title: 'Capstone', fields: {} }],
  job_needs: [{ id: 'n_dash', title: 'Build dashboards', kind: 'goal', basis: 'explicit', jd_quote: null }],
  task_payload: {},
  ...extra,
});
const ok = { status: 'ok', question: '', explanation: '' };
const ANSWER = 'I built a Power BI dashboard that 12 warehouse supervisors used.';
const evalEnv = () => base('evaluate_answer', { sources: [{ id: 'answer', revision: 1, kind: 'answer', text: ANSWER, language: 'en', url_or_null: null }] });
const score = (criterion: string, s: number | null) => ({ criterion, score: s, reason: 'r', answer_refs: [{ source_id: 'answer', revision: 1, quote: 'I built a Power BI dashboard' }] });
const evalOut = (scores: unknown[], extra = {}) => ({ ...ok, scores, strengths: [], priority_fix: null, unanswered: [], format_checks: [], ...extra });
const FOUR = (a = 3) => [score('relevance', a), score('evidence_ownership', 3), score('organization', 3), score('clear_language', null)];

describe('validators', () => {
  it('rejects scores of 0 and 5 but accepts null with a reason', () => {
    expect(validate('evaluate_answer', evalEnv(), evalOut(FOUR(0)) as never).fatal[0].code).toBe('range');
    expect(validate('evaluate_answer', evalEnv(), evalOut(FOUR(5)) as never).fatal[0].code).toBe('range');
    expect(validate('evaluate_answer', evalEnv(), evalOut(FOUR(4)) as never).fatal).toHaveLength(0);
  });
  it('requires exactly four unique criteria', () => {
    expect(validate('evaluate_answer', evalEnv(), evalOut(FOUR().slice(0, 3)) as never).fatal[0].code).toBe('count');
  });
  it('drops quotes that do not match the answer and rejects invented sources', () => {
    const bad = evalOut([{ ...score('relevance', 3), answer_refs: [{ source_id: 'answer', revision: 1, quote: 'reduced delays by 30%' }] }, ...FOUR().slice(1)]);
    const v = validate('evaluate_answer', evalEnv(), bad as never);
    expect(v.flagged.some((i) => i.code === 'unmatched_quote')).toBe(true);
    expect((v.data as { scores: { answer_refs: unknown[] }[] }).scores[0].answer_refs).toHaveLength(0);
    const inv = evalOut([{ ...score('relevance', 3), answer_refs: [{ source_id: 'src_9999', revision: 1, quote: 'x' }] }, ...FOUR().slice(1)]);
    expect(validate('evaluate_answer', evalEnv(), inv as never).fatal[0].code).toBe('unknown_id');
  });
  it('forbids actual_execution without execution results', () => {
    const v = validate('evaluate_answer', evalEnv(), evalOut(FOUR(), { format_checks: [{ label: 'tests', observation: 'all pass', basis: 'actual_execution' }] }) as never);
    expect(v.fatal[0].code).toBe('not_allowed');
  });
  it('rejects invalid enums at the schema layer', () => {
    expect(TASKS.evaluate_answer.schema.safeParse(evalOut([{ ...score('charisma', 3) }, ...FOUR().slice(1)])).success).toBe(false);
  });
  it('rejects invented fact ids and unsupported numbers in drafts, and dropped "simulated"', () => {
    const env = base('answer_draft');
    expect(validate('answer_draft', env, { ...ok, answer: 'I built a dashboard.', claims: [{ text: 'built', fact_ids: ['f_made_up'] }], hypothetical_assumptions: [], cues: [], unresolved: [] } as never).fatal[0].code).toBe('unknown_id');
    expect(validate('answer_draft', env, { ...ok, answer: 'My dashboard cut late shipments by 30%.', claims: [{ text: 'x', fact_ids: ['f_dash'] }], hypothetical_assumptions: [], cues: [], unresolved: [] } as never).fatal.some((i) => i.code === 'unsupported_claim')).toBe(true);
    expect(validate('answer_draft', env, { ...ok, answer: 'My schedule cut empty-station hours by 18%.', claims: [{ text: 'x', fact_ids: ['f_sim18'] }], hypothetical_assumptions: [], cues: [], unresolved: [] } as never).fatal.some((i) => /simulated/.test(i.message))).toBe(true);
    expect(validate('answer_draft', env, { ...ok, answer: 'A new rebalancing schedule cut simulated empty-station hours by 18%.', claims: [{ text: 'x', fact_ids: ['f_sim18'] }], hypothetical_assumptions: [], cues: ['a'], unresolved: [] } as never).fatal).toHaveLength(0);
  });
  it('interviewer cannot follow up when only close is allowed', () => {
    const env = base('interviewer_turn', { task_payload: { allowed_actions: ['close'] } });
    expect(validate('interviewer_turn', env, { ...ok, message: 'One more question?', action: 'followup', probe: 'outcome', target_need_id_or_null: null, reason: '' } as never).fatal[0].code).toBe('not_allowed');
  });
  it('needs: invalid JD quote is flagged unverified, not counted as a gap', () => {
    const v = validate('extract_needs', base('extract_needs'), { ...ok, needs: [{ local_key: 'n1', title: 'Dashboards', kind: 'goal', priority: 'high', basis: 'explicit', jd_refs: [{ source_id: 'src_bayline_jd', revision: 1, quote: 'build world-class AI' }], explanation: 'x' }], clarify_questions: [] } as never);
    expect(v.fatal).toHaveLength(0);
    expect((v.data as { needs: { verified: boolean }[] }).needs[0].verified).toBe(false);
  });
  it('match: none_added cannot cite facts; facts must belong to the story', () => {
    const env = base('match_evidence');
    expect(validate('match_evidence', env, { ...ok, links: [{ need_id: 'n_dash', story_id_or_null: null, fact_ids: ['f_dash'], relationship: 'none_added', reason: '', next_question: '' }], unmapped_need_ids: [] } as never).fatal[0].code).toBe('not_allowed');
    expect(validate('match_evidence', env, { ...ok, links: [{ need_id: 'n_dash', story_id_or_null: 'st_capstone', fact_ids: ['f_dash'], relationship: 'direct', reason: '', next_question: '' }], unmapped_need_ids: [] } as never).fatal[0].code).toBe('not_allowed');
  });
  it('tasks: minutes out of range and prerequisite cycles are rejected', () => {
    const t = (k: string, pre: string[], m = 10) => ({ local_key: k, title: k, task_type: 'collect_fact', need_ids: [], story_ids: [], question_id_or_null: null, estimated_minutes: m, prerequisite_local_keys: pre, reason: '' });
    expect(validate('propose_tasks', base('propose_tasks'), { ...ok, tasks: [t('a', [], 90)], missing_context: [] } as never).fatal[0].code).toBe('range');
    expect(validate('propose_tasks', base('propose_tasks'), { ...ok, tasks: [t('a', ['b']), t('b', ['a'])], missing_context: [] } as never).fatal.some((i) => i.code === 'cycle')).toBe(true);
  });
  it('envelope schema rejects unexpected task ids', () => {
    expect(EnvelopeSchema.safeParse({ ...base('evaluate_answer'), task_id: 'grant_admin' }).success).toBe(false);
  });
});

describe('runTask with a fake client', () => {
  let calls: number;
  const fake = (responses: (() => unknown)[]) => ({ beta: { messages: { parse: async () => { const r = responses[Math.min(calls, responses.length - 1)]; calls++; return r(); } } } });
  const resp = (parsed: unknown, stop = 'end_turn') => () => ({ stop_reason: stop, parsed_output: parsed, usage: {} });
  beforeEach(() => { calls = 0; });
  const signal = new AbortController().signal;

  it('retries once on an invalid score, then succeeds', async () => {
    __setClientForTests(fake([resp(evalOut(FOUR(5))), resp(evalOut(FOUR(3)))]));
    const r = await runTask(evalEnv(), 'req1', signal);
    expect(r.status).toBe('ok');
    expect(calls).toBe(2);
  });
  it('returns review_required after two invalid outputs — never a fixture score', async () => {
    __setClientForTests(fake([resp(evalOut(FOUR(0)))]));
    const r = await runTask(evalEnv(), 'req2', signal);
    expect(r.status).toBe('review_required');
    expect(calls).toBe(2);
  });
  it('treats unparseable JSON as correctable, then reports review_required', async () => {
    __setClientForTests(fake([resp(null)]));
    expect((await runTask(evalEnv(), 'req3', signal)).status).toBe('review_required');
  });
  it('maps refusal, rate limits, timeouts, and cancellation to honest unavailable states', async () => {
    __setClientForTests(fake([resp(null, 'refusal')]));
    expect(await runTask(evalEnv(), 'r', signal)).toMatchObject({ status: 'unavailable', reason: 'refused' });
    __setClientForTests(fake([() => { throw new Anthropic.RateLimitError(429, undefined, 'slow down', new Headers()); }]));
    expect(await runTask(evalEnv(), 'r', signal)).toMatchObject({ status: 'unavailable', reason: 'rate_limited' });
    __setClientForTests(fake([() => { throw new Anthropic.APIConnectionTimeoutError(); }]));
    expect(await runTask(evalEnv(), 'r', signal)).toMatchObject({ status: 'unavailable', reason: 'timeout' });
    __setClientForTests(fake([() => { throw new Anthropic.APIUserAbortError(); }]));
    expect(await runTask(evalEnv(), 'r', signal)).toMatchObject({ status: 'unavailable', reason: 'cancelled' });
  });
  it('passes through needs_input and echoes the input revision for late-response checks', async () => {
    __setClientForTests(fake([resp({ status: 'needs_input', question: 'Which project?', explanation: '' })]));
    const r = await runTask({ ...evalEnv(), input_revision: 'rev-42' }, 'r', signal);
    expect(r).toMatchObject({ status: 'needs_input', meta: { inputRevision: 'rev-42' } });
  });
});
