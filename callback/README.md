# Callback — interview-preparation prototype

Local-first React + TypeScript (Vite) build of the Callback prompt kit V2. Everything runs in the browser; no backend is connected yet.

## Run

```bash
npm install
cp .env.example .env   # then put your ANTHROPIC_API_KEY in .env (backend only)
npm run api            # backend on http://127.0.0.1:8787 (separate terminal)
npm run dev            # app on http://localhost:5173 — proxies /api to the backend
npm test               # unit tests (vitest)
npm run build          # type-check (app + server) + production build
```

Without the backend, or without a key, the app still works in local/manual mode and says so wherever AI would be used.

Demo: open the app → **Try Mei’s example**. The workspace switcher (top bar) toggles between the fictional example and your own blank workspace.

## Data modes

| Mode | What it is |
|---|---|
| Prepared example | Mei Lin / Bayline Freight fixtures (prompt 1, Appendix B). Prepared scores show only for the exact fixture text; any edit falls back to self-review. |
| Local / manual | Your workspace. Editing, recording, follow-up rules, self-review, deterministic planning, materials composed from confirmed facts. No semantic scores are invented. |
| Live AI | Via the backend in `server/` when `ANTHROPIC_API_KEY` is set. Only validated output is shown as AI output; failures show “AI feedback is unavailable right now. Your work is saved…” and never fall back to Mei’s scores. |

## AI backend (prompt 13, Appendix A)

- `server/index.ts` — Node HTTP server, bound to 127.0.0.1. Routes: `GET /api/ai/status`, `POST /api/ai/run`, `POST /api/discovery/{start,ask,debrief}`.
- `server/contract.ts` — versioned prompt pack (`callback-runtime-v1`): shared system instruction A0 and tasks A1–A7, A9–A11, each with a structured-output schema (zod) and a strict validator (IDs, enums, counts, word ceilings, 1–4/null scores, quote verification against the exact source revision, unsupported numbers, dropped “simulated”, `actual_execution` only with real results, task cycles and 1–60 minute bounds).
- `server/ai.ts` — Anthropic TypeScript SDK, model `claude-opus-5-5`, `client.beta.messages.parse` with `betaZodOutputFormat`, prompt caching on the system prompt, and server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). One SDK retry for transient errors; one constrained regeneration with the validation issues; then `review_required`.
- Operational: request IDs, 90 s timeout, cancel on client disconnect, per-address rate limit (30/min, `CALLBACK_RATE_LIMIT`), identical in-flight requests share one call, 60,000-character input cap (draft preserved), metadata-only logs. The browser sends only the selected stories, confirmed facts, and needed sources, plus an `input_revision`; responses for an older revision are discarded.
- Untrusted data: all user material is sent inside `<task_data>` and the shared instruction tells the model to ignore embedded instructions; validators, not the model, decide what is displayed.
- Discovery (A8): the server picks the scenario and keeps it in memory; the browser receives only the brief and topic keys until the debrief. With a key, replies are phrased by the model and checked against the scenario's fact whitelist; without one, authored replies are used.
- Not yet: accounts/ownership checks (prompt 15), so the backend is meant for local use only.

Storage: versioned `localStorage` key `callback:v2` (V1 `callback:v1` resume/JD fields migrate automatically); recordings in IndexedDB `callback-recordings`. “Delete all Callback data” removes only `callback:*` keys and that database.

## Services

| Service | Status |
|---|---|
| AI feedback / drafting / need extraction (prompt 13, Appendix A) | Implemented; needs `ANTHROPIC_API_KEY`. **Not yet verified with a live request.** |
| Research search | Not configured — paste sources |
| Transcription | Not configured — type the transcript after recording |
| Spoken prompts | Browser `speechSynthesis` (works where the browser supports it) |
| Recording | MediaRecorder, stored on-device |
| Video observations | Not implemented — playback + self-review checklist |
| Code runner | Not configured — “Run tests” is disabled with a reason |
| Accounts, sync, sharing | Not configured — career center runs as a fictional demo; permission rules are illustrated in `lib/cohort.ts`, not enforced by a server |

## Feature inventory (by prompt)

| # | Status | Notes |
|---|---|---|
| 0 Shell & design | Done | Public Home/Centers/About/Privacy; six workspaces; Settings; mobile nav; dark mode; reduced motion; skip link |
| 1 Data model & demo | Done | Shared entities with IDs/revisions; staleness derived from stored input revisions (`lib/derive.ts`); first-run guide (resumable/skippable) |
| 2 Import, privacy, versions | Done, partly verified | TXT/MD/PDF (10 pages)/DOCX parsed locally with cancel, warnings, editable preview; email/phone redaction with preview + undo. **PDF/DOCX import not exercised in a browser test yet.** |
| 3 Jobs, rounds, research | Done | Create/duplicate/archive/delete (stories kept); DST-aware round times; pasted sources with labels |
| 4 Stories & value map | Done | Sourced and self-reported facts (confirm before use); one-at-a-time coach questions; evidence cards; coverage matrix; unverified ≠ gap |
| 5 Question bank & answers | Done | 24 seeded questions; filters; saved collection; Answer Builder with immutable first version, length targets, local fact signals, prep-card export, flashcards. AI reference drafts unavailable. |
| 6 Text practice | Done | Deterministic state machine, ≤3 follow-ups, pause/resume, skip, finish early, panel roles, duplicate-submit guard; professional workspaces |
| 7 Audio/video | Done, manual transcript | Record/pause/stop/review/delete; transcript versions; outdated-feedback detection |
| 8 Feedback & progress | Done | Core rubric, null for unobserved, comparison eligibility rules, disputes as labeled re-evaluations, denominators |
| 9 Practice diagnosis | Done (offline protocol) | Confounds listed; user-chosen focus creates linked tasks |
| 10 Team-priority discovery | Practice mode | Authored scenarios A/B/C, paraphrase matching, injection refusal. Assessed mode (server-hidden state) needs backend. |
| 11 Plan my prep time | Done | Deterministic scheduler with declared weights; fixture A–D verified at 0/10/20/30 min |
| 12 Materials | Done | Prep card, tailored bullets, summary, cover letter, follow-up; versions; stale detection; TXT/MD/print-to-PDF. **DOCX export not implemented.** |
| 13 AI backend | Implemented | Value map (A1/A2), story coach (A3), Answer Builder draft + check (A4/A6), interviewer turns (A5, limits still code-enforced), session evaluation and disputes (A6), diagnosis (A7), discovery (A8, server-held), research summary (A9), material drafts (A10), task proposals (A11) |
| 14 Search, transcription, speech, video, code runner | Not started | |
| 15 Accounts & career center | Demo only | Fictional cohort computed from a ledger (6/6, 14, 8/14, 2); share/revoke/annotate; assignments |
| 16 Acceptance | Partial | See below |

## Verified

- `npm test`: 42 unit tests. Server tests (with a fake client): out-of-range scores, missing criteria, invented source and fact IDs, unmatched quotes, invalid enums, unsupported numbers, dropped “simulated”, follow-up past the limit, invalid task minutes and cycles, retry-then-succeed, review_required after two failures, unparseable output, refusal, rate limit, timeout, cancellation, revision echo. App tests (the original 24, plus 2 for the AI follow-up limit): — quote normalization/offsets, Mei mapping labels, unverified vs stale, blank workspace has no Mei data, redaction keeps `2025-2027`/`50,000`, simulated-qualifier and ownership flags, follow-up cap and duplicate submit, skip, prepared-score exact-match rule, comparison eligibility, planner budgets/prerequisites/unavailable dates, discovery paraphrases and injection, cohort reconciliation and permission rules, V1 migration.
- In the browser: Mei value map, prepared drill and comparison, custom drill with the 4th follow-up blocked, retry with hidden coaching, self-review persisted across reload, resume edit → “Source could not be verified”, planner 20/30-minute fixture, discovery replies, cohort cards, no horizontal scroll at 360px on the main screens, dark mode, no console errors.

## Known limits

- Live AI requests have not been made yet (no key in the build environment); every AI path is verified only against the fake client and the not-configured state.
- No search, transcription, video analysis, code execution, accounts, or server-side permission enforcement.
- PDF/DOCX extraction and audio/video recording have not been exercised in an automated or manual browser test.
- DOCX export missing; PDF export uses the browser print dialog.
- The bundle includes pdf.js (~1.3 MB worker, loaded only on PDF import).
