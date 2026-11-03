import { useEffect } from 'react';
import { StoreProvider, useStore } from './lib/store';
import { Banner, useRoute } from './ui/kit';
import { Home, CentersPage, AboutPage, PrivacyPage, PublicHeader } from './pages/Public';
import { Dashboard } from './pages/Dashboard';
import { JobsPage } from './pages/Jobs';
import { StoriesPage } from './pages/Stories';
import { PracticePage } from './pages/Practice';
import { ProgressPage } from './pages/Progress';
import { CareerPage } from './pages/Career';
import { SettingsPage } from './pages/Settings';
import { GuidePage } from './pages/Guide';

const NAV: [string, string, string, string][] = [
  ['dashboard', 'Dashboard', '⌂', 'Home'],
  ['jobs', 'Target jobs', '◎', 'Jobs'],
  ['stories', 'My stories', '❏', 'Stories'],
  ['practice', 'Practice room', '◉', 'Practice'],
  ['progress', 'Progress', '↗', 'Progress'],
  ['career', 'Career center', '✦', 'Center'],
];

function Shell() {
  const route = useRoute();
  const { p, kind, switchWorkspace, saveError, undo } = useStore();
  const top = route[0] ?? '';

  useEffect(() => {
    const root = document.documentElement;
    if (p.prefs.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', p.prefs.theme);
    root.classList.toggle('reduce-motion', p.prefs.reducedMotion);
  }, [p.prefs.theme, p.prefs.reducedMotion]);

  const isPublic = ['', 'home', 'centers', 'about', 'privacy'].includes(top);
  if (isPublic) {
    return (
      <div className="public-wrap">
        <a className="skip-link" href="#main">Skip to content</a>
        <PublicHeader />
        <main id="main">
          {top === 'centers' ? <CentersPage /> : top === 'about' ? <AboutPage /> : top === 'privacy' ? <PrivacyPage /> : <Home />}
        </main>
      </div>
    );
  }

  let page;
  switch (top) {
    case 'dashboard': page = <Dashboard />; break;
    case 'jobs': page = <JobsPage route={route} />; break;
    case 'stories': page = <StoriesPage route={route} />; break;
    case 'practice': page = <PracticePage route={route} />; break;
    case 'progress': page = <ProgressPage route={route} />; break;
    case 'career': page = <CareerPage />; break;
    case 'settings': page = <SettingsPage />; break;
    case 'guide': page = <GuidePage />; break;
    default: page = <Dashboard />;
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <nav className="sidebar" aria-label="Main">
        <a className="brand" href="#/home">
          <span className="brand-dot" aria-hidden="true">C</span> Callback
        </a>
        {NAV.map(([k, label, icon]) => (
          <a key={k} className="nav-link" href={`#/${k}`} aria-current={top === k ? 'page' : undefined}>
            <span aria-hidden="true">{icon}</span> {label}
          </a>
        ))}
        <div className="nav-sep" />
        <a className="nav-link" href="#/guide" aria-current={top === 'guide' ? 'page' : undefined}>
          <span aria-hidden="true">➜</span> First-run guide
        </a>
        <a className="nav-link" href="#/settings" aria-current={top === 'settings' ? 'page' : undefined}>
          <span aria-hidden="true">⚙</span> Settings
        </a>
        <div className="spacer" />
        <div className="small muted" style={{ padding: '8px 10px' }}>
          Saved on this device only. Accounts are not configured.
        </div>
      </nav>
      <main className="main" id="main">
        <div className="topbar">
          <label htmlFor="ws" className="visually-hidden">Workspace</label>
          <select id="ws" value={kind} onChange={(e) => switchWorkspace(e.target.value as 'demo' | 'personal')} style={{ width: 'auto', maxWidth: '100%' }}>
            <option value="personal">My workspace</option>
            <option value="demo">Mei’s example (fictional)</option>
          </select>
          <div className="spacer" />
          <a className="btn small ghost" href="#/settings" aria-label="Settings">⚙ <span className="small">Settings</span></a>
        </div>
        {kind === 'demo' && (
          <Banner tone="demo">
            <strong>Fictional example workspace.</strong> Mei Lin, Bayline Freight, and every answer here are invented for demonstration. Prepared scores apply only to the exact example text.
          </Banner>
        )}
        {saveError && <Banner tone="danger">{saveError}</Banner>}
        <div style={{ marginTop: 16 }}>{page}</div>
      </main>
      <nav className="mobile-nav" aria-label="Main">
        {NAV.map(([k, label, icon, short]) => (
          <a key={k} href={`#/${k}`} aria-current={top === k ? 'page' : undefined} aria-label={label}>
            <span aria-hidden="true" style={{ fontSize: '1.1rem' }}>{icon}</span>
            {short}
          </a>
        ))}
      </nav>
      {undo && (
        <div className="toast" role="status">
          {undo.label}
          <button onClick={undo.run}>Undo</button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
