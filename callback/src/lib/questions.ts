import type { Question, QuestionFormat } from './types';

export const FORMAT_LABEL: Record<QuestionFormat, string> = {
  recruiter: 'Recruiter',
  behavioral: 'Behavioral',
  technical: 'Technical',
  product_case: 'Product case',
  data_analysis: 'Data analysis',
  coding: 'Coding',
  system_design: 'System design',
  salary: 'Salary conversation',
};

export const HYPOTHETICAL_FORMATS: QuestionFormat[] = ['product_case', 'data_analysis', 'coding', 'system_design', 'salary'];

const SEED: [QuestionFormat, string, string, Question['difficulty'], Question['stage']][] = [
  ['recruiter', 'Walk me through your background.', 'background', 'intro', 'recruiter'],
  ['recruiter', 'Why this role?', 'motivation', 'intro', 'recruiter'],
  ['recruiter', 'What do you want to learn next?', 'growth', 'intro', 'recruiter'],
  ['behavioral', 'Tell me about a disagreement.', 'collaboration', 'standard', 'hiring_manager'],
  ['behavioral', 'Tell me about a decision with incomplete information.', 'judgment', 'standard', 'hiring_manager'],
  ['behavioral', 'Tell me about a mistake and what changed afterward.', 'learning', 'standard', 'hiring_manager'],
  ['technical', 'Explain a technical choice from your project.', 'technical depth', 'standard', 'technical'],
  ['technical', 'How did you test its correctness?', 'quality', 'standard', 'technical'],
  ['technical', 'What limitation would you address next?', 'technical depth', 'stretch', 'technical'],
  ['product_case', 'How would you investigate low adoption of a new feature?', 'adoption', 'standard', 'hiring_manager'],
  ['product_case', 'Which user problem would you prioritize?', 'prioritization', 'standard', 'hiring_manager'],
  ['product_case', 'How would you measure whether a proposed improvement worked?', 'measurement', 'stretch', 'hiring_manager'],
  ['data_analysis', 'How would you investigate a sudden fall in on-time deliveries?', 'diagnosis', 'standard', 'technical'],
  ['data_analysis', 'How would you handle missing warehouse timestamps?', 'data quality', 'standard', 'technical'],
  ['data_analysis', 'What would you put in an operations dashboard and why?', 'reporting', 'standard', 'technical'],
  ['coding', 'Count frequencies in a sequence and explain complexity.', 'hash maps', 'intro', 'technical'],
  ['coding', 'Find two values that sum to a target.', 'hash maps', 'standard', 'technical'],
  ['coding', 'Merge overlapping intervals and describe edge cases.', 'sorting', 'standard', 'technical'],
  ['system_design', 'Design a simple interview-practice recording service.', 'storage', 'standard', 'technical'],
  ['system_design', 'Design notifications for scheduled practice.', 'scheduling', 'standard', 'technical'],
  ['system_design', 'Explain how you would prevent duplicate processing of a submitted answer.', 'idempotency', 'stretch', 'technical'],
  ['salary', 'How would you clarify the components of an offer?', 'offer', 'intro', 'final'],
  ['salary', 'How would you discuss an offer below your target?', 'negotiation', 'standard', 'final'],
  ['salary', 'What non-salary factors would you ask about?', 'offer', 'intro', 'final'],
];

export function seedQuestions(): Record<string, Question> {
  const out: Record<string, Question> = {};
  SEED.forEach(([format, text, theme, difficulty, stage], i) => {
    const id = `q_seed_${String(i + 1).padStart(2, '0')}`;
    out[id] = { id, text, format, theme, difficulty, stage, origin: 'seed', jobId: null, needId: null, language: 'en' };
  });
  return out;
}
