import type { SourceDocument, SourceSpan } from './types';

let counter = 0;
export function uid(prefix: string): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const nowIso = () => new Date().toISOString();

/**
 * Documented normalization for quote matching:
 *  - case-insensitive
 *  - any run of whitespace counts as one space
 *  - curly single/double quotes are treated as straight quotes
 *  - en/em dashes are treated as hyphens
 * Returns the normalized string plus a map from each normalized index to the original index,
 * so matches can be shown in the original wording at original offsets.
 */
export function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  let lastWasSpace = false;
  for (let i = 0; i < text.length; i++) {
    let ch = text[i];
    if (/\s/.test(ch)) {
      if (lastWasSpace) continue;
      ch = ' ';
      lastWasSpace = true;
    } else {
      lastWasSpace = false;
      if (ch === '‘' || ch === '’') ch = "'";
      else if (ch === '“' || ch === '”') ch = '"';
      else if (ch === '–' || ch === '—') ch = '-';
      ch = ch.toLowerCase();
    }
    norm += ch;
    map.push(i);
  }
  return { norm, map };
}

export function normalize(text: string): string {
  return normalizeWithMap(text).norm.trim();
}

/** Locate a quote inside a source. Returns original-text offsets or null. */
export function locateQuote(sourceText: string, quote: string): { start: number; end: number } | null {
  const q = normalize(quote);
  if (!q) return null;
  const { norm, map } = normalizeWithMap(sourceText);
  const idx = norm.indexOf(q);
  if (idx < 0) return null;
  const start = map[idx];
  const end = map[idx + q.length - 1] + 1;
  return { start, end };
}

export function makeSpan(source: SourceDocument, quote: string): SourceSpan | null {
  const loc = locateQuote(source.text, quote);
  if (!loc) return null;
  return { sourceId: source.id, revision: source.revision, quote: source.text.slice(loc.start, loc.end), start: loc.start, end: loc.end };
}

export type SpanStatus = 'valid' | 'moved' | 'unverified' | 'missing_source';

/**
 * A span is valid when it still matches its source at the current revision.
 * If the source was edited but the quote is still present, the span is re-located ("moved").
 */
export function checkSpan(span: SourceSpan, source: SourceDocument | undefined): { status: SpanStatus; start?: number; end?: number } {
  if (!source) return { status: 'missing_source' };
  if (span.revision === source.revision) {
    const exact = source.text.slice(span.start, span.end);
    if (normalize(exact) === normalize(span.quote)) return { status: 'valid', start: span.start, end: span.end };
  }
  const loc = locateQuote(source.text, span.quote);
  if (loc) return { status: span.revision === source.revision ? 'valid' : 'moved', ...loc };
  return { status: 'unverified' };
}

export function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  // CJK characters count individually; other words by whitespace
  const cjk = (t.match(/[㐀-鿿]/g) || []).length;
  const rest = t.replace(/[㐀-鿿]/g, ' ').trim();
  return cjk + (rest ? rest.split(/\s+/).length : 0);
}

/** Planning estimate: ~130 spoken words per minute. Shown to users as an estimate. */
export function speakingSeconds(text: string): number {
  return Math.round((wordCount(text) / 130) * 60);
}

export interface RedactionMatch {
  start: number;
  end: number;
  text: string;
  kind: 'email' | 'phone';
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Phone-like: optional +country, groups separated by space/dot/dash/parens, 9-15 digits overall.
const PHONE_RE = /(\+?\d{1,3}[\s.-]?)?(\(\d{2,4}\)[\s.-]?)?\d{2,4}[\s.-]\d{3,4}[\s.-]\d{3,4}\b|\+\d{8,14}\b|\b1[3-9]\d{9}\b/g;

/**
 * Suggest contact details to redact. Conservative: years, year ranges (2025-2027),
 * percentages, and comma-grouped metrics (50,000) are never suggested.
 */
export function suggestRedactions(text: string): RedactionMatch[] {
  const out: RedactionMatch[] = [];
  for (const m of text.matchAll(EMAIL_RE)) out.push({ start: m.index!, end: m.index! + m[0].length, text: m[0], kind: 'email' });
  for (const m of text.matchAll(PHONE_RE)) {
    const s = m[0].trim();
    const start = m.index! + m[0].indexOf(s);
    const digits = s.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) continue;
    if (/^\d{4}\s?[-–]\s?\d{4}$/.test(s)) continue; // year range
    if (/^\d{1,3}(,\d{3})+$/.test(s)) continue; // metric
    if (out.some((o) => start < o.end && start + s.length > o.start)) continue;
    out.push({ start, end: start + s.length, text: s, kind: 'phone' });
  }
  return out.sort((a, b) => a.start - b.start);
}

export function applyRedactions(text: string, matches: RedactionMatch[]): string {
  let result = '';
  let pos = 0;
  for (const m of [...matches].sort((a, b) => a.start - b.start)) {
    result += text.slice(pos, m.start) + (m.kind === 'email' ? '[email removed]' : '[phone removed]');
    pos = m.end;
  }
  return result + text.slice(pos);
}

/** Numbers (with optional % and grouping) that appear in text. */
export function extractNumbers(text: string): string[] {
  const words: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', twenty: '20', forty: '40' };
  const nums = (text.match(/\d[\d,]*(\.\d+)?%?/g) || []).map((n) => n.replace(/,/g, '').replace(/\.$/, ''));
  for (const w of text.toLowerCase().match(/\b[a-z]+\b/g) || []) if (words[w]) nums.push(words[w]);
  return nums;
}

const OWNERSHIP_INFLATION = /\b(i (single-handedly|alone|personally) |i led (the )?(entire|whole)|entire project|by myself|i owned (the )?(entire|whole))/i;

/**
 * Local review signals (not a semantic evaluation): numbers that do not appear in the
 * confirmed facts, and wording that may inflate ownership.
 */
export function localFactSignals(answer: string, factTexts: string[]): { unsupportedNumbers: string[]; ownershipFlag: boolean; simulatedDropped: boolean } {
  const known = new Set(factTexts.flatMap(extractNumbers).map((n) => n.replace('%', '')));
  const unsupportedNumbers = [...new Set(extractNumbers(answer))].filter((n) => !known.has(n.replace('%', '')) && !/^(19|20)\d\d$/.test(n));
  const factsMentionSimulated = factTexts.some((f) => /simulat/i.test(f));
  const answerUsesSimFact = factTexts.some((f) => /simulat/i.test(f) && extractNumbers(f).some((n) => extractNumbers(answer).includes(n)));
  const simulatedDropped = factsMentionSimulated && answerUsesSimFact && !/simulat/i.test(answer);
  return { unsupportedNumbers, ownershipFlag: OWNERSHIP_INFLATION.test(answer), simulatedDropped };
}

export function todayLocal(tz?: string): string {
  const d = new Date();
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Convert a wall-clock time in a zone to an instant (handles DST by iterating on the offset).
 */
export function zonedToInstant(local: string, tz: string): Date {
  const guess = new Date(local + 'Z');
  const offsetAt = (d: Date) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d);
    const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
    const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
    return asUtc - d.getTime();
  };
  try {
    let t = guess.getTime() - offsetAt(guess);
    t = guess.getTime() - offsetAt(new Date(t));
    return new Date(t);
  } catch {
    return guess;
  }
}

export function formatInZone(instant: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: tz, dateStyle: 'medium', timeStyle: 'short', timeZoneName: 'short' }).format(instant);
  } catch {
    return instant.toString();
  }
}
