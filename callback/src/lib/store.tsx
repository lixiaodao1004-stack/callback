import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Data, Persisted, Prefs, SourceDocument, WorkspaceKind } from './types';
import { buildMeiDemo, emptyData } from './demo';
import { nowIso, uid } from './text';
import { clearRecordings } from './idb';

// Only keys with this prefix belong to Callback; reset never touches other storage.
export const KEY_PREFIX = 'callback:';
const KEY = KEY_PREFIX + 'v2';
const V1_KEY = KEY_PREFIX + 'v1';

const defaultPrefs = (): Prefs => ({
  theme: 'system',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  speakPrompts: false,
  defaultMode: 'text',
  reducedMotion: false,
});

function fresh(): Persisted {
  return { schema: 2, active: 'personal', workspaces: { demo: null, personal: emptyData('personal') }, prefs: defaultPrefs(), guide: { step: 0, dismissed: false, completed: [false, false, false, false, false] } };
}

/** V1 stored flat strings for resume/JD and an opening. Carry them into the personal workspace. */
export function migrateV1(v1: unknown): Data {
  const d = emptyData('personal');
  if (!v1 || typeof v1 !== 'object') return d;
  const o = v1 as Record<string, unknown>;
  const t = nowIso();
  const mk = (kind: SourceDocument['kind'], title: string, text: string, jobId: string | null): SourceDocument => ({ id: uid('src'), kind, title, text, language: 'en', url: null, revision: 1, fictional: false, jobId, retrievedAt: null, createdAt: t, updatedAt: t });
  if (typeof o.resume === 'string' && o.resume.trim()) {
    const s = mk('resume', 'Resume (from V1)', o.resume, null);
    d.sources[s.id] = s;
    d.profile.resumeSourceId = s.id;
  }
  if (typeof o.jd === 'string' && o.jd.trim()) {
    const jobId = uid('job');
    const s = mk('jd', 'Job description (from V1)', o.jd, jobId);
    d.sources[s.id] = s;
    d.jobs[jobId] = { id: jobId, company: typeof o.company === 'string' ? o.company : '', role: typeof o.role === 'string' ? o.role : '', level: '', url: '', location: '', status: 'researching', jdSourceId: s.id, archived: false, fictional: false, research: [], createdAt: t };
    d.currentJobId = jobId;
  }
  return d;
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Persisted;
      if (p.schema === 2 && p.workspaces?.personal) return { ...fresh(), ...p, prefs: { ...defaultPrefs(), ...p.prefs } };
    }
    const v1 = localStorage.getItem(V1_KEY);
    if (v1) {
      const p = fresh();
      p.workspaces.personal = migrateV1(JSON.parse(v1));
      return p;
    }
  } catch {
    // corrupted or blocked storage: start clean without touching other keys
  }
  return fresh();
}

interface Store {
  p: Persisted;
  d: Data;
  kind: WorkspaceKind;
  mutate: (fn: (d: Data) => void) => void;
  setPrefs: (fn: (p: Prefs) => Prefs) => void;
  setGuide: (fn: (g: Persisted['guide']) => Persisted['guide']) => void;
  switchWorkspace: (k: WorkspaceKind) => void;
  loadDemo: () => void;
  resetDemo: () => void;
  deleteAll: () => Promise<void>;
  saveError: string | null;
  undo: { label: string; run: () => void } | null;
  offerUndo: (label: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [p, setP] = useState<Persisted>(load);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [undo, setUndo] = useState<Store['undo']>(null);
  const prevRef = useRef<Persisted | null>(null);
  const pRef = useRef(p);
  pRef.current = p;

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
      setSaveError(null);
    } catch {
      setSaveError('Your browser blocked saving. Changes are kept in this tab only — export your data to keep a copy.');
    }
  }, [p]);

  const kind = p.active;
  const d = (kind === 'demo' ? p.workspaces.demo : p.workspaces.personal) ?? p.workspaces.personal;

  const mutate = useCallback((fn: (d: Data) => void) => {
    setP((prev) => {
      const k = prev.active;
      const cur = k === 'demo' ? prev.workspaces.demo : prev.workspaces.personal;
      if (!cur) return prev;
      const next = structuredClone(cur);
      fn(next);
      return { ...prev, workspaces: { ...prev.workspaces, [k]: next } };
    });
  }, []);

  const offerUndo = useCallback((label: string) => {
    const snapshot = prevRef.current;
    if (!snapshot) return;
    setUndo({ label, run: () => { setP(snapshot); setUndo(null); } });
    window.setTimeout(() => setUndo((u) => (u?.label === label ? null : u)), 10000);
  }, []);

  // Snapshot before each change so destructive actions can be undone.
  const mutateWithSnapshot = useCallback(
    (fn: (d: Data) => void) => {
      prevRef.current = pRef.current;
      mutate(fn);
    },
    [mutate],
  );

  const store = useMemo<Store>(
    () => ({
      p,
      d,
      kind,
      mutate: mutateWithSnapshot,
      setPrefs: (fn) => setP((prev) => ({ ...prev, prefs: fn(prev.prefs) })),
      setGuide: (fn) => setP((prev) => ({ ...prev, guide: fn(prev.guide) })),
      switchWorkspace: (k) => setP((prev) => ({ ...prev, active: k, workspaces: { ...prev.workspaces, demo: k === 'demo' && !prev.workspaces.demo ? buildMeiDemo() : prev.workspaces.demo } })),
      loadDemo: () => setP((prev) => ({ ...prev, active: 'demo', workspaces: { ...prev.workspaces, demo: prev.workspaces.demo ?? buildMeiDemo() } })),
      resetDemo: () => setP((prev) => ({ ...prev, workspaces: { ...prev.workspaces, demo: buildMeiDemo() } })),
      deleteAll: async () => {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith(KEY_PREFIX)) localStorage.removeItem(k);
        }
        try {
          await clearRecordings();
        } catch {
          // no recordings store
        }
        setP(fresh());
      },
      saveError,
      undo,
      offerUndo,
    }),
    [p, d, kind, mutateWithSnapshot, saveError, undo, offerUndo],
  );
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}
