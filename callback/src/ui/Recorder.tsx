import { useEffect, useRef, useState } from 'react';
import { deleteRecording, getRecording, saveRecording } from '../lib/idb';
import { uid, nowIso } from '../lib/text';
import { Banner } from './kit';

export interface RecordingResult {
  id: string;
  durationSec: number;
}

/** Records audio or video on request, keeps it on the device, and releases devices when done. */
export function Recorder({ kind, sessionId, onSaved, disabled }: { kind: 'audio' | 'video'; sessionId: string; onSaved: (r: RecordingResult) => void; disabled?: boolean }) {
  const [state, setState] = useState<'idle' | 'recording' | 'paused' | 'review'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timer = useRef<number | null>(null);
  const preview = useRef<HTMLVideoElement>(null);

  const release = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => () => { release(); if (url) URL.revokeObjectURL(url); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record. You can type your answer instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(kind === 'video' ? { audio: true, video: true } : { audio: true });
      streamRef.current = stream;
      if (kind === 'video' && preview.current) {
        preview.current.srcObject = stream;
        preview.current.muted = true;
        void preview.current.play();
      }
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || (kind === 'video' ? 'video/webm' : 'audio/webm') });
        blobRef.current = blob;
        if (url) URL.revokeObjectURL(url);
        setUrl(URL.createObjectURL(blob));
        setState('review');
        release();
      };
      rec.onerror = () => {
        setError('Recording stopped unexpectedly (a device may have been disconnected). Your typed notes are kept — try again.');
        release();
        setState('idle');
      };
      stream.getTracks().forEach((t) => (t.onended = () => rec.state !== 'inactive' && rec.stop()));
      recRef.current = rec;
      rec.start(1000);
      setElapsed(0);
      setState('recording');
      timer.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(
        name === 'NotAllowedError'
          ? 'Permission was denied. You can allow access in your browser’s site settings, or answer by text.'
          : name === 'NotFoundError'
            ? `No ${kind === 'video' ? 'camera or microphone' : 'microphone'} was found. Connect one, or answer by text.`
            : 'Recording could not start. Answer by text, or try again.',
      );
      release();
    }
  }

  function pause() {
    const r = recRef.current;
    if (!r) return;
    if (r.state === 'recording') {
      r.pause();
      if (timer.current) window.clearInterval(timer.current);
      setState('paused');
    } else if (r.state === 'paused') {
      r.resume();
      timer.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
      setState('recording');
    }
  }

  async function keep() {
    if (!blobRef.current) return;
    const id = uid('rec');
    try {
      await saveRecording({ id, sessionId, kind, mime: blobRef.current.type, durationSec: elapsed, createdAt: nowIso() }, blobRef.current);
      onSaved({ id, durationSec: elapsed });
      discard();
    } catch {
      setError('There is not enough storage to keep this recording. Delete old recordings in Settings, or type your answer.');
    }
  }

  function discard() {
    blobRef.current = null;
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
    setState('idle');
    setElapsed(0);
  }

  const mm = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  return (
    <div className="card soft flat">
      {error && <Banner tone="warn">{error}</Banner>}
      {kind === 'video' && (state === 'recording' || state === 'paused') && <video ref={preview} style={{ width: '100%', maxWidth: 360, borderRadius: 8 }} playsInline aria-label="Camera preview" />}
      {kind === 'video' && state === 'idle' && <video ref={preview} style={{ display: 'none' }} playsInline />}
      <div className="row">
        {state === 'idle' && <button className="btn" onClick={start} disabled={disabled}>● Record {kind}</button>}
        {(state === 'recording' || state === 'paused') && (
          <>
            <span className="row" role="status" aria-live="polite">{state === 'recording' && <span className="rec-dot" aria-hidden="true" />} {state === 'recording' ? 'Recording' : 'Paused'} {mm}</span>
            <button className="btn small" onClick={pause}>{state === 'recording' ? 'Pause' : 'Resume'}</button>
            <button className="btn small primary" onClick={() => recRef.current?.stop()}>Stop</button>
          </>
        )}
        {state === 'review' && url && (
          <div className="stack" style={{ width: '100%' }}>
            {kind === 'video' ? <video src={url} controls style={{ width: '100%', maxWidth: 420, borderRadius: 8 }} /> : <audio src={url} controls />}
            <div className="row">
              <button className="btn small primary" onClick={keep}>Keep recording ({mm})</button>
              <button className="btn small danger" onClick={discard}>Delete and re-record</button>
            </div>
          </div>
        )}
      </div>
      <p className="small muted" style={{ marginTop: 6 }}>Recordings stay on this device. Transcription is not configured — after recording, type what you said so it can be reviewed.</p>
    </div>
  );
}

export function Playback({ id, onDelete }: { id: string; onDelete?: () => void }) {
  const [src, setSrc] = useState<{ url: string; kind: string } | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let u: string | null = null;
    getRecording(id).then((r) => {
      if (!r) return setMissing(true);
      u = URL.createObjectURL(r.blob);
      setSrc({ url: u, kind: r.kind });
    }).catch(() => setMissing(true));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [id]);
  if (missing) return <span className="small muted">Recording deleted.</span>;
  if (!src) return null;
  return (
    <div className="row">
      {src.kind === 'video' ? <video src={src.url} controls style={{ width: '100%', maxWidth: 320, borderRadius: 8 }} /> : <audio src={src.url} controls />}
      {onDelete && <button className="btn small ghost danger" onClick={async () => { await deleteRecording(id); onDelete(); }}>Delete this recording</button>}
    </div>
  );
}
