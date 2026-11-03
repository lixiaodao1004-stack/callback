import type { ReactNode } from 'react';
import type { AIResult } from '../lib/ai/types';
import { UNAVAILABLE_TEXT, useAIStatus } from '../lib/ai/client';
import { Badge, Banner } from './kit';

export function AIModeBadge() {
  const s = useAIStatus();
  if (!s.checked) return null;
  if (s.configured) return <Badge tone="green">● Live AI</Badge>;
  return <Badge tone="neutral">{s.offline ? '○ AI backend not running' : '○ AI not configured'}</Badge>;
}

/** Renders every non-ok outcome honestly. Returns null for ok results. */
export function AIOutcome({ result, onRetry, staleNotice, children }: { result: AIResult | null; onRetry?: () => void; staleNotice?: boolean; children?: ReactNode }) {
  if (staleNotice) return <Banner tone="warn">The inputs changed while AI was working, so that response was discarded. Run it again for the current version.</Banner>;
  if (!result || result.status === 'ok') return null;
  const retry = onRetry && <button className="btn small" onClick={onRetry} style={{ marginLeft: 8 }}>Retry</button>;
  switch (result.status) {
    case 'unavailable':
      return result.reason === 'cancelled' ? <Banner tone="info">Cancelled. Nothing was changed.</Banner> : <Banner tone="warn">{UNAVAILABLE_TEXT} <span className="small muted">({result.message})</span>{retry}{children}</Banner>;
    case 'review_required':
      return (
        <Banner tone="warn">
          The AI output did not pass validation twice, so it is not shown as AI output. Nothing about your experience is implied.{retry}
          <details><summary className="small">What failed</summary><ul className="small">{result.issues.slice(0, 6).map((i, k) => <li key={k}>{i.message}</li>)}</ul></details>
        </Banner>
      );
    case 'needs_input':
      return <Banner tone="info"><strong>AI needs more information:</strong> {result.question}</Banner>;
    case 'insufficient_evidence':
      return <Banner tone="info"><strong>Not enough evidence:</strong> {result.explanation}</Banner>;
  }
}

export function AIBusy({ busy, onCancel, label = 'AI is working…' }: { busy: boolean; onCancel: () => void; label?: string }) {
  if (!busy) return null;
  return (
    <span className="row small" role="status">
      {label} <button className="btn small ghost" onClick={onCancel}>Cancel</button>
    </span>
  );
}
