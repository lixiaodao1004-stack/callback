// Fictional career-center demo cohort. Every dashboard number is computed from this ledger.

export interface CohortStudent {
  id: string;
  name: string;
  org: string;
  supportRequest: string | null;
}

export interface CohortSession {
  id: string;
  studentId: string;
  date: string;
  question: string;
  independentRetry: boolean;
  firstScores: [number, number, number, number]; // relevance, evidence, organization, language — integers
  retryScores: [number, number, number, number] | null;
  needGap: 'missing_evidence' | 'none';
  sharedSummary: boolean;
}

export const COHORT_STUDENTS: CohortStudent[] = [
  { id: 'stu_mei', name: 'Mei L.', org: 'org_bayview', supportRequest: null },
  { id: 'stu_arjun', name: 'Arjun S.', org: 'org_bayview', supportRequest: null },
  { id: 'stu_hana', name: 'Hana K.', org: 'org_bayview', supportRequest: null },
  { id: 'stu_diego', name: 'Diego R.', org: 'org_bayview', supportRequest: 'Would like help choosing a story for “Tell me about a disagreement.”' },
  { id: 'stu_yusuf', name: 'Yusuf A.', org: 'org_bayview', supportRequest: null },
  { id: 'stu_lin', name: 'Lin W.', org: 'org_bayview', supportRequest: 'Asked for feedback on a product-case answer structure.' },
];

const PLAN: [string, number, number][] = [
  ['stu_mei', 4, 3],
  ['stu_arjun', 3, 2],
  ['stu_hana', 2, 1],
  ['stu_diego', 1, 0],
  ['stu_yusuf', 3, 2],
  ['stu_lin', 1, 0],
];
const QS = ['Walk me through your background.', 'Tell me about a disagreement.', 'Why this role?', 'How would you investigate low adoption of a new feature?'];

function build(): CohortSession[] {
  const out: CohortSession[] = [];
  let n = 0;
  for (const [sid, sessions, retries] of PLAN) {
    for (let i = 0; i < sessions; i++) {
      n++;
      const first: [number, number, number, number] = [2 + (n % 2), 2 + ((n + 1) % 2), 3, 2 + (n % 3 === 0 ? 1 : 0)];
      const hasRetry = i < retries;
      out.push({
        id: `cs_${String(n).padStart(2, '0')}`,
        studentId: sid,
        date: `2026-10-${String(5 + n).padStart(2, '0')}`,
        question: QS[n % QS.length],
        independentRetry: hasRetry,
        firstScores: first,
        retryScores: hasRetry ? [Math.min(4, first[0] + 1), first[1] + (n % 2), first[2], Math.min(4, first[3] + 1)] as [number, number, number, number] : null,
        needGap: n % 4 === 0 ? 'missing_evidence' : 'none',
        sharedSummary: n % 3 !== 0,
      });
    }
  }
  return out;
}

export const COHORT_SESSIONS: CohortSession[] = build();

export function cohortCards() {
  const active = new Set(COHORT_SESSIONS.map((s) => s.studentId));
  const retries = COHORT_SESSIONS.filter((s) => s.independentRetry).length;
  return {
    activeStudents: active.size,
    totalStudents: COHORT_STUDENTS.length,
    completedSessions: COHORT_SESSIONS.length,
    independentRetries: retries,
    openSupportRequests: COHORT_STUDENTS.filter((s) => s.supportRequest).length,
    missingEvidence: COHORT_SESSIONS.filter((s) => s.needGap === 'missing_evidence').length,
    incompleteRetries: COHORT_SESSIONS.length - retries,
  };
}

export type DemoRole = 'student' | 'counselor' | 'admin';

/**
 * Local demo permission check. This illustrates the rules; real enforcement must happen on the
 * server once accounts are configured.
 */
export function canViewSession(role: DemoRole, viewerStudentId: string | null, s: CohortSession, field: 'summary' | 'transcript'): boolean {
  if (role === 'student') return viewerStudentId === s.studentId;
  if (role === 'counselor') return field === 'summary' && s.sharedSummary;
  return false; // admins see aggregates only
}
