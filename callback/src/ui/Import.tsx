import { useRef, useState } from 'react';
import { extractFile, ExtractError, type ExtractControl } from '../lib/parse';
import { applyRedactions, suggestRedactions, wordCount, type RedactionMatch } from '../lib/text';
import { Banner, Field } from './kit';

/**
 * Import or paste a document, review the extracted text, optionally redact contact details,
 * then save. Nothing is uploaded; extraction happens in the browser.
 */
export function ImportBox({ label, initial, onSave, saveLabel = 'Save text', placeholder }: { label: string; initial: string; onSave: (text: string, filename: string | null) => void; saveLabel?: string; placeholder?: string }) {
  const [text, setText] = useState(initial);
  const [filename, setFilename] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<RedactionMatch[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [beforeRedaction, setBeforeRedaction] = useState<string | null>(null);
  const ctl = useRef<ExtractControl | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const id = label.replace(/\W+/g, '-').toLowerCase();

  async function onFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    setWarnings([]);
    const c: ExtractControl = { cancelled: false, onProgress: (m) => setBusy(m) };
    ctl.current = c;
    setBusy('Starting…');
    try {
      const res = await extractFile(f, c);
      if (c.cancelled) return;
      setText(res.text);
      setFilename(res.filename);
      setWarnings(res.warnings);
      setSuggestions(null);
    } catch (e) {
      setError(e instanceof ExtractError ? e.message : 'This file could not be read. Paste the text instead.');
    } finally {
      if (ctl.current === c) setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function cancel() {
    if (ctl.current) ctl.current.cancelled = true;
    setBusy(null);
    setError('Import cancelled. Your previous text is unchanged.');
  }

  function findContacts() {
    const s = suggestRedactions(text);
    setSuggestions(s);
    setSelected(new Set(s.map((_, i) => i)));
  }

  function applySelected() {
    if (!suggestions) return;
    setBeforeRedaction(text);
    setText(applyRedactions(text, suggestions.filter((_, i) => selected.has(i))));
    setSuggestions(null);
  }

  return (
    <div className="stack">
      <div className="row">
        <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" className="visually-hidden" id={id + '-file'} onChange={(e) => onFile(e.target.files?.[0])} />
        <label htmlFor={id + '-file'} className="btn" style={{ margin: 0 }}>
          ⬆ Import file
        </label>
        <span className="small muted">PDF (first 10 pages), DOCX, TXT, or MD · up to 10 MB · read on this device, not uploaded</span>
      </div>
      {busy && (
        <div className="row" role="status">
          <span>{busy}</span>
          <button className="btn small" onClick={cancel}>
            Cancel
          </button>
        </div>
      )}
      {error && <Banner tone="danger">{error}</Banner>}
      {warnings.map((w) => (
        <Banner tone="warn" key={w}>
          {w}
        </Banner>
      ))}
      <Field label={label} id={id} hint={`${filename ? filename + ' · ' : ''}${wordCount(text)} words · You can edit the extracted text before saving.`}>
        <textarea id={id} value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={placeholder} />
      </Field>
      <div className="row">
        <button className="btn primary" disabled={!text.trim() || !!busy} onClick={() => onSave(text, filename)}>
          {saveLabel}
        </button>
        <button className="btn" disabled={!text.trim()} onClick={findContacts}>
          Find contact details to remove
        </button>
        {beforeRedaction !== null && (
          <button
            className="btn ghost"
            onClick={() => {
              setText(beforeRedaction);
              setBeforeRedaction(null);
            }}
          >
            Undo removal
          </button>
        )}
      </div>
      {suggestions && (
        <div className="card soft">
          {suggestions.length === 0 ? (
            <p>No email addresses or phone numbers were found. This check is limited — review the text for other personal details yourself.</p>
          ) : (
            <>
              <p>Select what to remove. Years, date ranges, percentages, and business metrics are left in place. This does not remove all personal information.</p>
              <ul className="check-list">
                {suggestions.map((s, i) => (
                  <li key={i}>
                    <label style={{ fontWeight: 400 }}>
                      <input
                        type="checkbox"
                        checked={selected.has(i)}
                        onChange={(e) => {
                          const n = new Set(selected);
                          if (e.target.checked) n.add(i);
                          else n.delete(i);
                          setSelected(n);
                        }}
                      />{' '}
                      {s.kind === 'email' ? 'Email' : 'Phone'}: <code>{s.text}</code>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="row">
                <button className="btn" onClick={applySelected} disabled={!selected.size}>
                  Remove selected
                </button>
                <button className="btn ghost" onClick={() => setSuggestions(null)}>
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
