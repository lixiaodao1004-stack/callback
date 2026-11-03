import { useState } from 'react';
import { useStore } from '../lib/store';
import { serviceStatuses } from '../lib/services';
import { useAIStatus } from '../lib/ai/client';
import { Badge, Banner, Confirm, Field } from '../ui/kit';
import { download } from '../lib/materials';
import { listRecordings, deleteRecording, type RecordingMeta } from '../lib/idb';

const ZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney'];
const LANGS: [string, string][] = [['en', 'English'], ['zh', '中文'], ['es', 'Español'], ['hi', 'हिन्दी'], ['ko', '한국어'], ['ja', '日本語'], ['fr', 'Français']];

export function SettingsPage() {
  const { p, d, mutate, setPrefs, deleteAll, resetDemo, kind } = useStore();
  const [confirmAll, setConfirmAll] = useState(false);
  const [recs, setRecs] = useState<RecordingMeta[] | null>(null);
  const [recErr, setRecErr] = useState<string | null>(null);
  const ai = useAIStatus();
  const services = serviceStatuses().map((sv) => sv.id === 'ai' ? { ...sv, available: ai.configured, detail: ai.configured ? `Connected through the Callback backend (${ai.model}). Only validated output is shown as AI output.` : ai.offline ? 'The Callback backend is not running. Start it with “npm run api”.' : 'The backend is running but has no API key. Add ANTHROPIC_API_KEY to .env and restart it.' } : sv);
  const zones = ZONES.includes(p.prefs.timezone) ? ZONES : [p.prefs.timezone, ...ZONES];

  return (
    <>
      <h1>Settings</h1>
      <div className="grid two">
        <section className="card">
          <h2>Profile and language</h2>
          <Field label="Name" id="pname">
            <input id="pname" type="text" value={d.profile.name} onChange={(e) => mutate((x) => { x.profile.name = e.target.value; })} />
          </Field>
          <Field label="Language for gathering details" id="plang" hint="You can describe your experience in this language. Facts keep their original wording.">
            <select id="plang" value={d.profile.preferredLanguage} onChange={(e) => mutate((x) => { x.profile.preferredLanguage = e.target.value; })}>
              {LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Practice (interview) language" id="olang">
            <select id="olang" value={d.profile.practiceLanguage} onChange={(e) => mutate((x) => { x.profile.practiceLanguage = e.target.value; })}>
              {LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Timezone" id="tz" hint="Interview dates and plans display in this timezone, including daylight-saving changes.">
            <select id="tz" value={p.prefs.timezone} onChange={(e) => setPrefs((x) => ({ ...x, timezone: e.target.value }))}>
              {zones.map((z) => <option key={z}>{z}</option>)}
            </select>
          </Field>
        </section>

        <section className="card">
          <h2>Appearance and recording</h2>
          <Field label="Theme" id="theme">
            <select id="theme" value={p.prefs.theme} onChange={(e) => setPrefs((x) => ({ ...x, theme: e.target.value as 'system' }))}>
              <option value="system">Match system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Field>
          <label style={{ fontWeight: 400 }}>
            <input type="checkbox" checked={p.prefs.reducedMotion} onChange={(e) => setPrefs((x) => ({ ...x, reducedMotion: e.target.checked }))} /> Reduce motion
          </label>
          <label style={{ fontWeight: 400, marginTop: 8 }}>
            <input type="checkbox" checked={p.prefs.speakPrompts} onChange={(e) => setPrefs((x) => ({ ...x, speakPrompts: e.target.checked }))} /> Read interviewer questions aloud (browser speech)
          </label>
          <Field label="Default practice mode" id="dmode" hint="Microphone and camera are only requested when you start recording.">
            <select id="dmode" value={p.prefs.defaultMode} onChange={(e) => setPrefs((x) => ({ ...x, defaultMode: e.target.value as 'text' }))}>
              <option value="text">Text</option>
              <option value="audio">Audio</option>
              <option value="video">Video</option>
            </select>
          </Field>
        </section>
      </div>

      <section className="card section">
        <h2>Services and integrations</h2>
        <p className="small muted">Shows what is actually connected. Nothing here reveals keys or secrets.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Service</th><th>Status</th><th>What would be sent</th></tr></thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong><div className="small muted">{s.detail}</div></td>
                  <td>{s.available ? <Badge tone="green">● Available</Badge> : <Badge tone="neutral">○ Not configured</Badge>}</td>
                  <td className="small">{s.sendsData}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card section">
        <h2>Data controls</h2>
        <div className="stack">
          <div className="row">
            <button className="btn" onClick={() => download(`callback-${kind}-export.json`, JSON.stringify(d, null, 2), 'application/json')}>Export this workspace (JSON)</button>
            {kind === 'demo' && <button className="btn" onClick={resetDemo}>Reset Mei’s example</button>}
          </div>
          <div>
            <h3>Recordings on this device</h3>
            <button className="btn small" onClick={() => listRecordings().then(setRecs).catch(() => setRecErr('Recordings storage is unavailable in this browser.'))}>Show recordings</button>
            {recErr && <p className="error-text">{recErr}</p>}
            {recs && (recs.length === 0 ? <p className="small muted">No recordings stored.</p> : (
              <ul>
                {recs.map((r) => (
                  <li key={r.id} className="row">
                    {r.kind} · {Math.round(r.durationSec)}s · {new Date(r.createdAt).toLocaleString()}
                    <button className="btn small danger" onClick={async () => { await deleteRecording(r.id); setRecs(recs.filter((x) => x.id !== r.id)); mutate((x) => { for (const s of Object.values(x.sessions)) for (const t of s.turns) if (t.recordingId === r.id) t.recordingId = null; }); }}>Delete this recording</button>
                  </li>
                ))}
              </ul>
            ))}
          </div>
          <div>
            <h3>Delete all Callback data</h3>
            <p className="small muted">Removes both workspaces, all recordings, and settings stored by Callback on this device. Other websites’ data is not touched. This cannot be undone — export first if you want a copy.</p>
            <button className="btn danger" onClick={() => setConfirmAll(true)}>Delete all Callback data</button>
          </div>
        </div>
      </section>
      <Banner tone="info">Accounts and sync are not configured. Your work is saved on this device only.</Banner>

      <Confirm open={confirmAll} title="Delete all Callback data?" confirmLabel="Delete everything" danger onCancel={() => setConfirmAll(false)} onConfirm={async () => { setConfirmAll(false); await deleteAll(); }}>
        <p>This removes every job, story, session, recording, and setting stored by Callback in this browser. It cannot be undone.</p>
      </Confirm>
    </>
  );
}
