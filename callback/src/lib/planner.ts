// Deterministic prep scheduler. Transparent rule weights, stable tie-breaking, hard budget.
import type { PrepTask } from './types';
import { addDays } from './text';

export const WEIGHTS = {
  importance: 10, // per importance point (1-5)
  focusNeed: 30, // task targets the selected focus need
  uncoveredNeed: 10, // task targets a need with no supported evidence
  repeatedDifficulty: 10, // task came from an observed difficulty (diagnosis)
  diminishing: 8, // subtracted per already-scheduled task covering the same need
  pinned: 1000,
};

export interface PlanInput {
  tasks: PrepTask[];
  startDate: string; // YYYY-MM-DD in the user's timezone
  horizonDays: number; // >= 1
  minutesPerDay: number;
  unavailableDates: string[];
  sessionLength: number; // break inserted after this many continuous minutes
  breakMinutes: number;
  focusNeedId: string | null;
  uncoveredNeedIds: string[];
  interviewDate: string | null; // YYYY-MM-DD
}

export interface ScheduledItem {
  taskId: string;
  date: string;
  startMinute: number;
  score: number;
}

export interface PlanResult {
  scheduled: ScheduledItem[];
  unscheduled: { taskId: string; reason: string }[];
  completed: string[];
  days: { date: string; capacity: number; used: number }[];
  budget: number;
  used: number;
  explanation: string[];
}

export function baseScore(t: PrepTask, input: PlanInput): number {
  let s = t.importance * WEIGHTS.importance;
  if (input.focusNeedId && t.needIds.includes(input.focusNeedId)) s += WEIGHTS.focusNeed;
  if (t.needIds.some((n) => input.uncoveredNeedIds.includes(n))) s += WEIGHTS.uncoveredNeed;
  if (t.source === 'diagnosis') s += WEIGHTS.repeatedDifficulty;
  if (t.pinned) s += WEIGHTS.pinned;
  return s;
}

function tieBreak(a: PrepTask, b: PrepTask): number {
  return a.key.localeCompare(b.key) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

export function hasCycle(tasks: PrepTask[]): boolean {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const state = new Map<string, number>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const p of byId.get(id)?.prerequisites ?? []) if (byId.has(p) && visit(p)) return true;
    state.set(id, 2);
    return false;
  };
  return tasks.some((t) => visit(t.id));
}

export function planTasks(input: PlanInput): PlanResult {
  const explanation: string[] = [];
  let horizon = Math.max(0, Math.floor(input.horizonDays));
  let start = input.startDate;
  if (input.interviewDate) {
    if (input.interviewDate < input.startDate) explanation.push('The interview date has passed. Planning over your chosen horizon instead.');
    else {
      const daysUntil = Math.round((Date.parse(input.interviewDate) - Date.parse(input.startDate)) / 86400000);
      if (daysUntil < horizon) {
        horizon = daysUntil + 1;
        explanation.push(`Limited to ${horizon} day(s) because the interview is on ${input.interviewDate}.`);
      }
    }
  }
  const days: PlanResult['days'] = [];
  const continuous: number[] = [];
  for (let i = 0; i < horizon; i++) {
    const date = addDays(start, i);
    const unavailable = input.unavailableDates.includes(date);
    days.push({ date, capacity: unavailable ? 0 : Math.max(0, Math.floor(input.minutesPerDay)), used: 0 });
    continuous.push(0);
  }
  const unavailableCount = days.filter((d) => d.capacity === 0 && input.minutesPerDay > 0).length;
  if (unavailableCount) explanation.push(`${unavailableCount} day(s) marked unavailable.`);
  const budget = days.reduce((a, d) => a + d.capacity, 0);

  const all = input.tasks;
  const byId = new Map(all.map((t) => [t.id, t]));
  const completed = all.filter((t) => t.status === 'done').map((t) => t.id);
  const done = new Set(completed);
  const pending = all.filter((t) => t.status === 'todo');
  const unscheduled: PlanResult['unscheduled'] = [];
  const scheduled: ScheduledItem[] = [];
  const placedAt = new Map<string, { dayIdx: number; end: number }>();
  const needCount = new Map<string, number>();

  if (hasCycle(pending)) explanation.push('Some prerequisites form a loop; those tasks cannot be scheduled.');

  const blockedReason = (t: PrepTask): string | null => {
    for (const p of t.prerequisites) {
      const pt = byId.get(p);
      if (!pt) return 'Its prerequisite no longer exists.';
      if (pt.status === 'skipped') return `Prerequisite “${pt.title}” was skipped.`;
    }
    return null;
  };

  const remaining = new Set(pending.map((t) => t.id));
  for (const t of pending) {
    const r = blockedReason(t);
    if (r) {
      unscheduled.push({ taskId: t.id, reason: r });
      remaining.delete(t.id);
    }
  }

  const score = (t: PrepTask) => baseScore(t, input) - t.needIds.reduce((a, n) => a + (needCount.get(n) ?? 0) * WEIGHTS.diminishing, 0);

  // Greedy: repeatedly place the best available task (all prerequisites done or placed).
  for (;;) {
    const avail = [...remaining].map((id) => byId.get(id)!).filter((t) => t.prerequisites.every((p) => done.has(p) || placedAt.has(p)));
    if (!avail.length) break;
    avail.sort((a, b) => score(b) - score(a) || tieBreak(a, b));
    let placedOne = false;
    for (const t of avail) {
      const earliest = t.prerequisites.reduce((acc, p) => {
        const pa = placedAt.get(p);
        return pa ? Math.max(acc, pa.dayIdx) : acc;
      }, 0);
      for (let di = earliest; di < days.length; di++) {
        const day = days[di];
        // A break is required before a task that would push continuous work past the session length.
        const breaks = continuous[di] > 0 && continuous[di] + t.minutes > Math.max(1, input.sessionLength) ? input.breakMinutes : 0;
        if (day.used + breaks + t.minutes <= day.capacity) {
          const startMinute = day.used + breaks;
          day.used = startMinute + t.minutes;
          continuous[di] = (breaks ? 0 : continuous[di]) + t.minutes;
          scheduled.push({ taskId: t.id, date: day.date, startMinute, score: score(t) });
          placedAt.set(t.id, { dayIdx: di, end: day.used });
          for (const n of t.needIds) needCount.set(n, (needCount.get(n) ?? 0) + 1);
          remaining.delete(t.id);
          placedOne = true;
          break;
        }
      }
      if (placedOne) break;
    }
    if (!placedOne) break;
  }

  for (const id of remaining) {
    const t = byId.get(id)!;
    const prereqUnplaced = t.prerequisites.find((p) => !done.has(p) && !placedAt.has(p));
    unscheduled.push({
      taskId: id,
      reason: prereqUnplaced ? `Waits on “${byId.get(prereqUnplaced)?.title ?? 'a prerequisite'}”, which did not fit.` : budget === 0 ? 'No time available in this plan.' : `Needs ${t.minutes} min; not enough time left.`,
    });
  }

  const used = scheduled.reduce((a, s) => a + byId.get(s.taskId)!.minutes, 0);
  if (budget === 0) explanation.push('No minutes available, so the plan is empty. Add time or choose a longer horizon.');
  else explanation.push(`Scheduled ${scheduled.length} task(s), ${used} of ${budget} available minutes.`);
  if (unscheduled.length) explanation.push(`${unscheduled.length} task(s) not scheduled — extend the budget or choose a focus.`);
  return { scheduled, unscheduled, completed, days, budget, used, explanation };
}

/** What moved between two plans, for the compact "what changed" note. */
export function diffPlans(prev: string[], next: string[], titles: Record<string, string>): string[] {
  const out: string[] = [];
  for (const id of next) if (!prev.includes(id)) out.push(`Added: ${titles[id] ?? id}`);
  for (const id of prev) if (!next.includes(id)) out.push(`Removed: ${titles[id] ?? id}`);
  next.forEach((id, i) => {
    const j = prev.indexOf(id);
    if (j >= 0 && j !== i) out.push(`Moved: ${titles[id] ?? id} (${j + 1} → ${i + 1})`);
  });
  return out;
}

/** Declared flashcard rule: again→1 day, hard→max(1, interval), good→interval×2 (min 2), easy→interval×3 (min 4). */
export function nextInterval(prev: number, rating: 'again' | 'hard' | 'good' | 'easy'): number {
  if (rating === 'again') return 1;
  if (rating === 'hard') return Math.max(1, prev);
  if (rating === 'good') return Math.max(2, prev * 2);
  return Math.max(4, prev * 3);
}
