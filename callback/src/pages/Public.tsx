import { useStore } from '../lib/store';
import { HOME_BEFORE } from '../lib/demo';
import { go } from '../ui/kit';

export function PublicHeader() {
  return (
    <header className="public-header">
      <a className="brand" href="#/home" style={{ padding: 0 }}>
        <span className="brand-dot" aria-hidden="true">C</span> Callback
      </a>
      <div className="spacer" />
      <nav className="row" aria-label="Public">
        <a className="btn ghost small" href="#/centers">Career centers</a>
        <a className="btn ghost small" href="#/about">About</a>
        <a className="btn ghost small" href="#/privacy">Privacy</a>
        <a className="btn small" href="#/dashboard">Open workspace</a>
      </nav>
    </header>
  );
}

// Home copy only. The Mei fixture in lib/demo.ts is unchanged.
const AFTER_SOUND_BITE = 'I help operations managers see late shipments every morning.';
const AFTER_EVIDENCE = 'Twelve supervisors used my dashboard in their daily stand-up.';

const INNOVATIONS: { title: string; body: string; example: string }[] = [
  {
    title: 'AI follow-ups that probe, not praise',
    body: 'Answer one question. Get up to 3 follow-ups on what’s missing — who used it, what changed, how it fits this role.',
    example: '“Who used the dashboard, and what did it help them monitor?”',
  },
  {
    title: 'Language support for international students',
    body: 'Think it through in your preferred language first. Nothing is added to your story until you confirm it.',
    example: 'Write details in 中文 → confirm the fact → practice in English.',
  },
  {
    title: 'Feedback as rewrite + progress tracking',
    body: 'Not just a score. Get a quoted priority fix, retry with coaching hidden, and compare first vs. retry to see what you can explain alone.',
    example: 'Mei’s relevance: first 2 → retry 4 (fictional prepared example).',
  },
];

const ROADMAP: { phase: string; when: string; what: string; now: boolean }[] = [
  { phase: 'Phase 1', when: 'now', what: 'STEM student interviews', now: true },
  { phase: 'Phase 2', when: 'later', what: 'All majors', now: false },
  { phase: 'Phase 3', when: 'later', what: 'Career advancement / promotion reviews', now: false },
];

export function Home() {
  const { loadDemo, switchWorkspace } = useStore();
  return (
    <>
      <section className="hero">
        <h1>We help you own the room — with clear, provable words.</h1>
        <p className="muted" style={{ maxWidth: 640, fontSize: '1.05rem' }}>
          For STEM students first: turn real work into evidence you can explain, alone, in the interview.
        </p>
        <div className="row" style={{ marginTop: 16 }}>
          <button
            className="btn primary"
            onClick={() => {
              switchWorkspace('personal');
              go('/guide');
            }}
          >
            Prepare for my interview
          </button>
          <button
            className="btn"
            onClick={() => {
              loadDemo();
              go('/dashboard');
            }}
          >
            Try Mei’s example
          </button>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>Mei Lin is fictional. Callback does not predict hiring.</p>
      </section>

      <section className="grid three section" aria-label="What is new">
        {INNOVATIONS.map((c) => (
          <div className="card" key={c.title}>
            <h3>{c.title}</h3>
            <p className="muted">{c.body}</p>
            <p className="small quote" style={{ margin: 0 }}>{c.example}</p>
          </div>
        ))}
      </section>

      <section className="section">
        <h2>Mei, before and after</h2>
        <div className="compare-grid">
          <div className="card" style={{ borderColor: 'var(--compare)' }}>
            <span className="badge violet">Before</span>
            <p className="quote" style={{ marginTop: 8 }}>“{HOME_BEFORE}”</p>
          </div>
          <div className="card" style={{ borderColor: 'var(--primary)' }}>
            <span className="badge green">After</span>
            <p className="quote" style={{ marginTop: 8 }}>
              “{AFTER_SOUND_BITE} <mark>{AFTER_EVIDENCE}</mark>”
            </p>
            <p className="small muted">Adoption shown. Delivery improvement not claimed.</p>
          </div>
        </div>
      </section>

      <section className="section" aria-label="Roadmap">
        <h2>Roadmap</h2>
        <ol className="grid three" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {ROADMAP.map((r) => (
            <li key={r.phase} className={`card${r.now ? '' : ' soft'}`} style={r.now ? { borderColor: 'var(--primary)' } : { color: 'var(--muted)' }}>
              <div className="row">
                <strong>{r.phase}</strong>
                <span className={`badge ${r.now ? 'green' : 'neutral'}`}>{r.when}</span>
              </div>
              <p style={{ margin: '6px 0 0' }}>{r.what}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section card soft">
        <h3>What Callback does not do</h3>
        <ul>
          <li>No answers during a real interview. Preparation only.</li>
          <li>No hiring predictions.</li>
          <li>Never adds achievements you did not supply and confirm.</li>
        </ul>
      </section>

      <section className="section">
        <h3>Pricing</h3>
        <p className="muted">Free campus pilots first, then an affordable student plan. No customers, prices, or measured outcomes yet — both are hypotheses.</p>
      </section>
    </>
  );
}

export function CentersPage() {
  return (
    <section className="section">
      <h1>For career centers</h1>
      <p className="muted" style={{ maxWidth: 680 }}>
        A possible course or cohort pilot: counselors create practice assignments, students choose what to share, and counselors respond to explicit support requests.
      </p>
      <div className="grid two section">
        <div className="card">
          <h3>What a pilot could include</h3>
          <ul>
            <li>Assignments with questions, due dates, allowed modes, and a rubric</li>
            <li>Opt-in, revocable sharing of selected summaries — never blanket account access</li>
            <li>Aggregate views with counts and denominators</li>
            <li>Counselor annotations on quoted passages</li>
          </ul>
        </div>
        <div className="card">
          <h3>Questions a pilot should evaluate</h3>
          <ul>
            <li>Do counselors understand a student’s specific difficulty faster?</li>
            <li>Are independent retries clearer under blind review with the same rubric?</li>
            <li>Are students willing to share selected materials?</li>
            <li>Which features duplicate tools the campus already provides?</li>
          </ul>
        </div>
      </div>
      <p className="small muted section">There are no customers, testimonials, prices, or measured outcomes yet. Licensing for career centers is an option to test after pilots, not decided. See the fictional demo in the Career center workspace.</p>
      <a className="btn" href="#/career">Open the fictional cohort demo</a>
    </section>
  );
}

export function AboutPage() {
  return (
    <section className="section" style={{ maxWidth: 720 }}>
      <h1>About Callback</h1>
      <p>Callback is an interview-preparation prototype. It focuses on three workflows beyond basic mock interviews:</p>
      <ol>
        <li><strong>Find what to practice next</strong> — compares an original answer, added facts, and a cued retry to suggest whether to add details, organize, or practice language retrieval.</li>
        <li><strong>Discover the team’s priority</strong> — practice asking clarifying questions of a simulated employer and adapting your answer.</li>
        <li><strong>Plan my prep time</strong> — schedule concrete tasks within the minutes you actually have.</li>
      </ol>
      <p className="muted">These are product design directions, not claims of being the first or only tool to do them.</p>
    </section>
  );
}

export function PrivacyPage() {
  return (
    <section className="section" style={{ maxWidth: 720 }}>
      <h1>Privacy</h1>
      <h3>Where your data lives now</h3>
      <p>In this prototype everything is stored in your browser on this device: text in local storage, recordings in IndexedDB. Uploaded files are read in the browser and are not sent anywhere.</p>
      <h3>Connected services</h3>
      <p>No AI, transcription, search, or account service is configured. When one is enabled, Callback will say what is sent (for example, only the selected recording for transcription) before it is sent.</p>
      <h3>Spoken prompts</h3>
      <p>If you turn on spoken interviewer prompts, your browser’s speech feature reads the interviewer’s questions. Depending on your browser and voice, this may be processed by the browser or operating system vendor. Your documents are never spoken.</p>
      <h3>Deleting data</h3>
      <p>Settings → Data controls lets you delete a job, a recording, or all Callback data. Deleting all Callback data does not touch other websites’ storage.</p>
    </section>
  );
}
