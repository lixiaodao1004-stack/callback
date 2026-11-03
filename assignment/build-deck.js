// Builds Callback_Lesson7_Midterm.pptx — elevator pitch + prototype presentation.
// Run: node build-deck.js   (screenshots come from capture.mjs → shots/)
const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');
const { applyTheme } = require(process.env.PPTX_SKILL + '/scripts/apply_theme.js');

const OUT = 'Callback_Lesson7_Midterm.pptx';
const THEME = {
  name: 'Callback',
  headFontFace: 'Cambria',
  bodyFontFace: 'Calibri',
  colors: {
    dk1: '14201B', // ink
    lt1: 'FFFFFF',
    dk2: '0B4F3A', // deep evidence green
    lt2: 'EEF4F1', // pale green-grey
    accent1: '0C7A58', // Callback green (primary actions, "after", retry)
    accent2: '6A6588', // muted violet ("before", first attempt)
    accent3: 'E0A526', // amber highlight
    accent4: '5B6570', // muted slate
    accent5: 'B42318', // boundary red
    accent6: 'DCE8E2', // card tint
    hlink: '0C7A58',
    folHlink: '6A6588',
  },
};

const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9'; // 10 x 5.625 in
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = 'Callback — Lesson 7 Mid-Term';
pres.subject = 'Elevator pitch and product prototype';
const C = pres.SchemeColor;

// PNG dimensions straight from the header, so images keep their aspect ratio.
function png(file) {
  const b = fs.readFileSync(path.join('shots', file));
  return { path: path.join('shots', file), w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function fitImage(slide, file, x, y, maxW, maxH, name) {
  const im = png(file);
  let w = maxW;
  let h = (im.h / im.w) * w;
  if (h > maxH) { h = maxH; w = (im.w / im.h) * h; }
  slide.addImage({ path: im.path, x, y, w, h, objectName: name, altText: name, shadow: { type: 'outer', color: '14201B', opacity: 0.18, blur: 6, offset: 2, angle: 90 } });
  return { w, h };
}

// ---------------- layouts ----------------
pres.defineSlideMaster({
  title: 'DARK_TITLE',
  background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: 'eyebrow', type: 'body', x: 0.6, y: 0.55, w: 8.8, h: 0.35, fontSize: 12, color: C.accent6, bold: true, charSpacing: 2, margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 1.35, w: 8.8, h: 1.1, fontSize: 54, bold: true, color: C.background1, fontFace: THEME.headFontFace, align: 'left', margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: 0.6, y: 2.5, w: 8.6, h: 1.3, fontSize: 24, color: C.background1, fontFace: THEME.headFontFace, italic: true, margin: 0, valign: 'top' }, text: '' } },
  ],
});
pres.defineSlideMaster({
  title: 'CONTENT',
  background: { color: C.background1 },
  margin: [0.4, 0.5, 0.45, 0.5],
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0.5, y: 0.3, w: 9.0, h: 0.7, fontSize: 30, bold: true, color: C.text2, fontFace: THEME.headFontFace, valign: 'middle', align: 'left', margin: 0 }, text: '' } },
    { text: { text: 'Callback · Lesson 7 Mid-Term', options: { x: 0.5, y: 5.22, w: 5, h: 0.25, fontSize: 10, color: C.accent4, margin: 0 } } },
  ],
  slideNumber: { x: 9.0, y: 5.22, w: 0.5, h: 0.25, fontSize: 10, color: C.accent4, align: 'right' },
});

function content(section, title) {
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: section });
  s.addText(title, { placeholder: 'title' });
  return s;
}
const T = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, color: C.text1, fontSize: 14, valign: 'top', ...o });
function card(s, x, y, w, h, name, fill = C.background2) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { color: fill }, objectName: name });
}
function chip(s, x, y, text, fill, color, w = 1.2) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.28, rectRadius: 0.14, fill: { color: fill }, line: { color: fill }, objectName: 'chip ' + text });
  T(s, text, { x, y, w, h: 0.28, fontSize: 11, bold: true, color, align: 'center', valign: 'middle' });
}

// ================= 1. Title =================
pres.addSection({ title: 'Elevator pitch' });
{
  const s = pres.addSlide({ masterName: 'DARK_TITLE', sectionTitle: 'Elevator pitch' });
  s.addText('LESSON 7 · MID-TERM · PRODUCT PROTOTYPE', { placeholder: 'eyebrow' });
  s.addText('Callback', { placeholder: 'title' });
  s.addText('We help you own the room — with clear, provable words.', { placeholder: 'body' });
  T(s, 'For STEM students first: turn real work into evidence you can explain, alone, in the interview.', { x: 0.6, y: 3.9, w: 8.4, h: 0.6, fontSize: 16, color: C.accent6 });
  T(s, 'Fictional customer: Mei Lin · Financial figures are labeled assumptions · Callback does not predict hiring', { x: 0.6, y: 4.9, w: 8.8, h: 0.3, fontSize: 11, color: C.accent6 });
  s.addNotes(
    'ELEVATOR PITCH (about 2 minutes across slides 1–4)\n\n' +
      'Every year, international STEM students walk into interviews with real results — a model that works, a dashboard people use — and walk out unheard. Not because the work is weak, but because they cannot narrate it under pressure. We built Callback. We help you own the room — with clear, provable words.',
  );
}

// ================= 2. Problem =================
{
  const s = content('Elevator pitch', 'Strong results, weak narration');
  card(s, 0.5, 1.25, 4.1, 2.7, 'Before quote card', C.accent6);
  chip(s, 0.75, 1.45, 'BEFORE · MEI', C.accent2, C.background1, 1.4);
  T(s, '“I’m a data science student. I know Python, SQL, and Power BI.”', { x: 0.75, y: 1.95, w: 3.6, h: 1.2, fontSize: 20, italic: true, fontFace: THEME.headFontFace, color: C.text2 });
  T(s, 'True — and it proves nothing. No one used it, nothing changed, no link to the job.', { x: 0.75, y: 3.2, w: 3.6, h: 0.6, fontSize: 13, color: C.accent4 });

  const rows = [
    ['✓', 'The work is real', 'Projects, internships, and research with results the student did produce.'],
    ['?', 'Follow-ups expose the gap', 'Who used it? What changed? What did you decide? Answers fall apart.'],
    ['!', 'Generic AI writes for you', 'Polished answers that overclaim — and that you can’t defend live.'],
  ];
  rows.forEach(([icon, head, body], i) => {
    const y = 1.25 + i * 0.92;
    s.addShape(pres.shapes.OVAL, { x: 5.0, y: y + 0.05, w: 0.5, h: 0.5, fill: { color: i === 2 ? C.accent5 : C.accent1 }, line: { color: i === 2 ? C.accent5 : C.accent1 }, objectName: 'icon ' + head });
    T(s, icon, { x: 5.0, y: y + 0.05, w: 0.5, h: 0.5, fontSize: 18, bold: true, color: C.background1, align: 'center', valign: 'middle' });
    T(s, head, { x: 5.7, y, w: 3.8, h: 0.3, fontSize: 16, bold: true, color: C.text2 });
    T(s, body, { x: 5.7, y: y + 0.33, w: 3.8, h: 0.5, fontSize: 13, color: C.text1 });
  });
  T(s, 'Results are the proof. Narration is the missing skill.', { x: 0.5, y: 4.3, w: 9, h: 0.5, fontSize: 22, italic: true, bold: true, fontFace: THEME.headFontFace, color: C.accent1 });
  s.addNotes('Here is Mei, a fictional data science student. Her first answer: "I know Python, SQL, and Power BI." True — but it proves nothing. Results are the proof. Narration is the missing skill.');
}

// ================= 3. Core loop =================
{
  const s = content('Elevator pitch', 'One loop from resume to a defensible answer');
  const steps = [
    ['Paste resume + JD', 'Read on your device; contact details can be removed first.'],
    ['Pick up to 3 job needs', 'Each need quotes the exact JD sentence.'],
    ['Map your evidence', 'Only facts you supplied and confirmed. Qualifiers stay.'],
    ['Answer + up to 3 follow-ups', 'Probes what’s missing: who used it, what changed, fit.'],
    ['Feedback that quotes you', 'Four rubric scores, one priority fix, your own words.'],
    ['Retry, coaching hidden', 'Compare first vs. retry; diagnosis says what to practice.'],
  ];
  const w = 2.75, h = 1.45, gx = 0.375, gy = 0.4;
  steps.forEach(([head, body], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.5 + col * (w + gx), y = 1.25 + row * (h + gy);
    card(s, x, y, w, h, 'step ' + (i + 1), i === 5 ? C.accent6 : C.background2);
    s.addShape(pres.shapes.OVAL, { x: x + 0.2, y: y + 0.2, w: 0.42, h: 0.42, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: 'step number ' + (i + 1) });
    T(s, String(i + 1), { x: x + 0.2, y: y + 0.2, w: 0.42, h: 0.42, fontSize: 15, bold: true, color: C.background1, align: 'center', valign: 'middle' });
    T(s, head, { x: x + 0.75, y: y + 0.2, w: w - 0.9, h: 0.45, fontSize: 15, bold: true, color: C.text2, valign: 'middle' });
    T(s, body, { x: x + 0.2, y: y + 0.75, w: w - 0.4, h: 0.62, fontSize: 13, color: C.text1 });
    if (col < 2) s.addShape(pres.shapes.RIGHT_ARROW, { x: x + w + 0.07, y: y + h / 2 - 0.12, w: 0.24, h: 0.24, fill: { color: C.accent4 }, line: { color: C.accent4 }, objectName: 'arrow ' + (i + 1) });
  });
  s.addNotes('Callback trains that skill in one loop. Paste your resume and the job description. Pick the three needs that matter. Connect each to evidence you actually supplied. Then practice: answer one question, get up to three follow-ups on what is missing, see feedback that quotes your own words, and retry with the coaching hidden — so you find out what you can explain alone.');
}

// ================= 4. Innovations =================
{
  const s = content('Elevator pitch', 'Three things that make it different');
  const cards = [
    ['AI follow-ups that probe, not praise', 'Answer one question. Get up to 3 follow-ups on what’s missing — who used it, what changed, how it fits this role.', '“Who used the dashboard, and what did it help them monitor?”'],
    ['Language support for international students', 'Think it through in your preferred language first. Nothing is added to your story until you confirm it.', 'Write details in Chinese → confirm the fact → practice in English.'],
    ['Feedback as rewrite + progress tracking', 'Not just a score. A quoted priority fix, a retry with coaching hidden, and first vs. retry side by side.', 'Mei’s relevance: first 2 → retry 4 (fictional prepared example).'],
  ];
  const w = 2.85, gap = 0.225;
  cards.forEach(([head, body, ex], i) => {
    const x = 0.5 + i * (w + gap), y = 1.25;
    card(s, x, y, w, 3.65, 'innovation ' + (i + 1), i === 0 ? C.accent6 : C.background2);
    T(s, head, { x: x + 0.22, y: y + 0.22, w: w - 0.44, h: 0.8, fontSize: 17, bold: true, color: C.text2, fontFace: THEME.headFontFace });
    T(s, body, { x: x + 0.22, y: y + 1.1, w: w - 0.44, h: 1.4, fontSize: 14 });
    T(s, ex, { x: x + 0.22, y: y + 2.65, w: w - 0.44, h: 0.8, fontSize: 12, italic: true, color: C.accent1 });
  });
  s.addNotes('Three things make it different. Follow-ups that probe instead of praise. Language support: think it through in Chinese or Hindi first, and nothing enters your story until you confirm it. And feedback that shows progress — first answer versus retry. Mei went from "I know Power BI" to "Twelve supervisors used my dashboard in their daily stand-up" — and Callback stopped her from claiming it cut delays, because she cannot prove that. We start free with campus pilots, then an affordable student plan. Let me show you the prototype.\n\n[END OF 2-MINUTE PITCH]');
}

// ================= 5. Use case: Mei =================
pres.addSection({ title: 'Customer use case' });
{
  const s = content('Customer use case', 'Use case: Mei Lin applies to Bayline Freight');
  card(s, 0.5, 1.2, 3.55, 3.75, 'Mei persona card', C.background2);
  chip(s, 0.7, 1.38, 'FICTIONAL CUSTOMER', C.accent2, C.background1, 1.75);
  T(s, 'Mei Lin', { x: 0.7, y: 1.8, w: 3.2, h: 0.4, fontSize: 22, bold: true, fontFace: THEME.headFontFace, color: C.text2 });
  T(s, [
    { text: 'M.S. Data Science, Bayview University (expected 2028)', options: { breakLine: true } },
    { text: 'Target: Data Analyst Intern, Summer 2027', options: { breakLine: true } },
    { text: '20 minutes a day to prepare', options: {} },
  ], { x: 0.7, y: 2.25, w: 3.2, h: 1.0, fontSize: 13, paraSpaceAfter: 4 });
  T(s, 'JD need', { x: 0.7, y: 3.3, w: 3.2, h: 0.25, fontSize: 11, bold: true, color: C.accent4, charSpacing: 1 });
  T(s, '“build dashboards our operations managers use every morning”', { x: 0.7, y: 3.55, w: 3.2, h: 0.55, fontSize: 13, italic: true, color: C.text2 });
  T(s, 'Her evidence', { x: 0.7, y: 4.1, w: 3.2, h: 0.25, fontSize: 11, bold: true, color: C.accent4, charSpacing: 1 });
  T(s, 'Power BI dashboard used by 12 warehouse supervisors in their daily stand-up.', { x: 0.7, y: 4.35, w: 3.2, h: 0.5, fontSize: 13 });
  const im = fitImage(s, 'valuemap.png', 4.35, 1.25, 5.15, 2.6, 'Value map screenshot: direct evidence card');
  T(s, 'Value map in the prototype: the JD quote and her resume quote are both verified against the source. “Direct evidence” — with the boundary written down.', { x: 4.35, y: 1.25 + im.h + 0.2, w: 5.15, h: 0.75, fontSize: 13, color: C.accent4 });
  s.addNotes('Our fictional customer is Mei Lin, applying for a data analyst internship at a fictional freight company whose on-time delivery fell. Callback pulls the job need straight from the JD and links it to the one piece of evidence that matches: her dashboard. Note the boundary line: it shows adoption, not delivery improvement.');
}

// ================= 6. Use case: drill =================
{
  const s = content('Customer use case', 'Mei’s drill: probe, retry, compare');
  // Left: the follow-up exchange from the prepared drill, as native text.
  const turns = [
    ['Interviewer', 'Tell me about a time your work supported a team’s daily operational decisions.', false],
    ['Mei', 'During my internship, I built a Power BI dashboard for the warehouse team.', true],
    ['Follow-up 1 · evidence', 'Who used the dashboard, and what did it help them monitor?', false],
    ['Follow-up 2 · outcome', 'What can you say about the outcome of that work?', false],
    ['Follow-up 3 · relevance', 'How does that experience connect to this internship?', false],
  ];
  turns.forEach(([who, text, mine], i) => {
    const y = 1.2 + i * 0.75, x = mine ? 1.0 : 0.5;
    card(s, x, y, 3.95, 0.66, 'turn ' + i, mine ? C.accent6 : C.background2);
    T(s, who, { x: x + 0.15, y: y + 0.07, w: 3.65, h: 0.2, fontSize: 10, bold: true, color: C.accent4 });
    T(s, text, { x: x + 0.15, y: y + 0.27, w: 3.65, h: 0.36, fontSize: 12, color: C.text1 });
  });
  // Right: first vs. retry scores (prepared, fictional).
  const sc = (t, tone) => ({ text: t, options: { fontSize: 14, bold: true, align: 'center', color: tone === 'r' ? C.accent1 : C.accent2 } });
  const lab = (t) => ({ text: t, options: { fontSize: 13, color: C.text1 } });
  const hd = (t, align = 'left') => ({ text: t, options: { fontSize: 12, bold: true, color: C.background1, fill: { color: C.text2 }, align } });
  s.addTable([
    [hd('Criterion'), hd('First', 'center'), hd('Retry', 'center')],
    [lab('Relevance'), sc('2'), sc('4', 'r')],
    [lab('Evidence and ownership'), sc('2'), sc('3', 'r')],
    [lab('Organization'), sc('3'), sc('4', 'r')],
    [lab('Clear language'), sc('3'), sc('4', 'r')],
  ], { x: 5.15, y: 1.2, w: 4.35, colW: [2.35, 1.0, 1.0], rowH: 0.34, border: { type: 'solid', pt: 0.5, color: 'DCE8E2' }, fill: { color: C.background1 }, valign: 'middle', margin: 0.06, objectName: 'first vs retry scores' });
  T(s, 'Same question, coaching hidden. Prepared fictional scores.', { x: 5.15, y: 3.0, w: 4.35, h: 0.25, fontSize: 11, color: C.accent4 });
  card(s, 5.15, 3.35, 4.35, 1.65, 'after quote', C.accent6);
  chip(s, 5.33, 3.48, 'INDEPENDENT RETRY', C.accent1, C.background1, 1.75);
  T(s, '“…a Power BI dashboard that 12 warehouse supervisors used to track late shipments in their daily stand-up. … I cannot claim it reduced delivery delays.”', { x: 5.33, y: 3.85, w: 4.0, h: 1.1, fontSize: 13, italic: true, color: C.text2 });
  s.addNotes('In the drill, the interviewer asks who used the dashboard, what changed, and how it connects to this role. Then Mei answers the same question again with the coaching hidden. Relevance goes from 2 to 4 — and the boundary stays: she does not claim delays went down. These are prepared, fictional scores.');
}

// ================= 7. Market fit =================
pres.addSection({ title: 'Market and goals' });
{
  const s = content('Market and goals', 'Market fit: who it’s for and what we add');
  card(s, 0.5, 1.2, 2.9, 3.8, 'target customer card', C.accent6);
  T(s, 'WHO', { x: 0.7, y: 1.38, w: 2.5, h: 0.25, fontSize: 11, bold: true, color: C.accent4, charSpacing: 1 });
  T(s, 'STEM students preparing for internship and first-job interviews', { x: 0.7, y: 1.65, w: 2.5, h: 0.9, fontSize: 15, bold: true, color: C.text2 });
  T(s, 'International students first: real results, interviews in a second language.', { x: 0.7, y: 2.6, w: 2.5, h: 0.8, fontSize: 13 });
  T(s, 'WHO PAYS', { x: 0.7, y: 3.5, w: 2.5, h: 0.25, fontSize: 11, bold: true, color: C.accent4, charSpacing: 1 });
  T(s, 'Students (low-cost plan). Career centers later, after pilots.', { x: 0.7, y: 3.77, w: 2.5, h: 0.8, fontSize: 13 });

  const hdr = (t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: C.text2 }, fontSize: 12 } });
  const cell = (t, strong) => ({ text: t, options: { fontSize: 12, color: strong ? C.accent1 : C.text1, bold: !!strong } });
  s.addTable(
    [
      [hdr('What students need'), hdr('Generic AI chat'), hdr('Mock-interview apps'), hdr('Callback')],
      [cell('Claims you can defend'), cell('Writes freely, can overclaim'), cell('Varies by product'), cell('Every claim cites a confirmed fact', true)],
      [cell('Follow-ups on what’s missing'), cell('Only if you ask'), cell('Often offered'), cell('Up to 3, targeted', true)],
      [cell('Proof you can say it alone'), cell('Not tracked'), cell('Partly'), cell('Hidden-coaching retry + comparison', true)],
      [cell('Think in your own language'), cell('Yes'), cell('Varies'), cell('Yes — confirmed before use', true)],
    ],
    { x: 3.65, y: 1.2, w: 5.85, colW: [1.55, 1.35, 1.35, 1.6], border: { type: 'solid', pt: 0.5, color: 'DCE8E2' }, fill: { color: C.background1 }, valign: 'middle', rowH: 0.62, margin: 0.06, objectName: 'market comparison table' },
  );
  T(s, 'Category-level view from public product pages; not tested across every plan.', { x: 3.65, y: 4.55, w: 5.85, h: 0.3, fontSize: 10, color: C.accent4 });
  s.addNotes('Our first market is STEM students — international students first — preparing for internship and first-job interviews. Generic AI chat will happily write an answer you cannot defend. Mock-interview apps vary. Callback adds three things: every claim cites a fact you confirmed, follow-ups target what is missing, and a hidden-coaching retry shows what you can say alone.');
}

// ================= 8. Goals & objectives =================
{
  const s = content('Market and goals', 'Company goal and pilot objectives');
  card(s, 0.5, 1.2, 9.0, 0.85, 'mission', C.text2);
  T(s, 'Goal: every STEM student can explain their real work clearly and honestly — without a script.', { x: 0.75, y: 1.2, w: 8.5, h: 0.85, fontSize: 17, bold: true, color: C.background1, valign: 'middle', fontFace: THEME.headFontFace });
  const objs = [
    ['O1 · Prove learning', 'In blind counselor review, the retry is rated clearer than the first answer in most pairs.', 'Target: > 60% of pairs'],
    ['O2 · Prove demand', 'Run campus pilots and see students finish the full loop, including the unassisted retry.', 'Target: 2 pilots, 100 students, 40% finish a retry'],
    ['O3 · Prove the model', 'Keep AI cost per active student low enough for a student-priced plan.', 'Target: AI cost < $2.50 per student per month'],
  ];
  const w = 2.85, gap = 0.225;
  objs.forEach(([head, body, target], i) => {
    const x = 0.5 + i * (w + gap), y = 2.3;
    card(s, x, y, w, 2.65, head, C.background2);
    T(s, head, { x: x + 0.2, y: y + 0.2, w: w - 0.4, h: 0.4, fontSize: 16, bold: true, color: C.text2 });
    T(s, body, { x: x + 0.2, y: y + 0.65, w: w - 0.4, h: 1.15, fontSize: 13 });
    T(s, target, { x: x + 0.2, y: y + 1.9, w: w - 0.4, h: 0.6, fontSize: 13, bold: true, color: C.accent1 });
  });
  T(s, 'Targets for the pilot phase, not results. No customers or measured outcomes yet.', { x: 0.5, y: 4.98, w: 9, h: 0.22, fontSize: 10, color: C.accent4 });
  s.addNotes('The company goal is simple: every STEM student can explain their real work clearly and honestly. For the pilot phase we set three objectives — prove learning, prove demand, and prove the model. These are targets; we have no customers or measured outcomes yet.');
}

// ================= 9. Roadmap =================
pres.addSection({ title: 'Roadmap and money' });
{
  const s = content('Roadmap and money', 'Roadmap aligned to the goals');
  const phases = [
    { name: 'Phase 1 — now', what: 'STEM student interviews', serves: 'Serves O1 · O2 · O3', now: true },
    { name: 'Phase 2 — later', what: 'All majors', serves: 'Grows O2 once O1 is proven', now: false },
    { name: 'Phase 3 — later', what: 'Career advancement, promotion reviews', serves: 'New segment after O3 holds', now: false },
  ];
  const w = 2.85, gap = 0.225;
  phases.forEach((p, i) => {
    const x = 0.5 + i * (w + gap), y = 1.2;
    card(s, x, y, w, 1.3, p.name, p.now ? C.accent1 : C.background2);
    T(s, p.name, { x: x + 0.2, y: y + 0.15, w: w - 0.4, h: 0.3, fontSize: 14, bold: true, color: p.now ? C.background1 : C.accent4 });
    T(s, p.what, { x: x + 0.2, y: y + 0.42, w: w - 0.4, h: 0.5, fontSize: 14, bold: true, color: p.now ? C.background1 : C.accent4 });
    T(s, p.serves, { x: x + 0.2, y: y + 0.98, w: w - 0.4, h: 0.25, fontSize: 11, color: p.now ? C.accent6 : C.accent4 });
    if (i < 2) s.addShape(pres.shapes.RIGHT_ARROW, { x: x + w + 0.02, y: y + 0.46, w: 0.18, h: 0.22, fill: { color: C.accent4 }, line: { color: C.accent4 }, objectName: 'phase arrow ' + i });
  });
  card(s, 0.5, 2.7, 4.4, 2.3, 'built in prototype', C.accent6);
  T(s, 'Built in the Phase 1 prototype', { x: 0.7, y: 2.83, w: 4.0, h: 0.3, fontSize: 15, bold: true, color: C.text2 });
  T(s, [
    { text: 'Value map with source-verified quotes', options: { bullet: true, breakLine: true } },
    { text: 'Drill: ≤ 3 follow-ups, hidden-coaching retry', options: { bullet: true, breakLine: true } },
    { text: 'Rubric feedback + first-vs-retry comparison', options: { bullet: true, breakLine: true } },
    { text: 'Practice diagnosis, team-priority simulation', options: { bullet: true, breakLine: true } },
    { text: 'Prep-time planner within your minutes', options: { bullet: true, breakLine: true } },
    { text: 'AI backend with output validation', options: { bullet: true } },
  ], { x: 0.7, y: 3.16, w: 4.0, h: 1.8, fontSize: 13, paraSpaceAfter: 2 });
  card(s, 5.1, 2.7, 4.4, 2.3, 'next before pilot', C.background2);
  T(s, 'Next, before the first pilot', { x: 5.3, y: 2.83, w: 4.0, h: 0.3, fontSize: 15, bold: true, color: C.text2 });
  T(s, [
    { text: 'Verify live AI on real student answers (O1)', options: { bullet: true, breakLine: true } },
    { text: 'Speech-to-text for spoken practice (O1)', options: { bullet: true, breakLine: true } },
    { text: 'Accounts + opt-in sharing with counselors (O2)', options: { bullet: true, breakLine: true } },
    { text: 'Cost tracking per student (O3)', options: { bullet: true } },
  ], { x: 5.3, y: 3.16, w: 4.0, h: 1.8, fontSize: 13, paraSpaceAfter: 2 });
  s.addNotes('The roadmap follows the goals. Phase 1, now, is STEM student interviews — that is what the prototype covers. Phase 2 opens to all majors, and Phase 3 moves to career advancement; both come later, only after the pilot objectives hold. Before the first pilot we need live-AI verification, speech-to-text, accounts with opt-in sharing, and cost tracking.');
}

// ================= 10. Pricing =================
{
  const s = content('Roadmap and money', 'Pricing: free pilots, then a student plan');
  const tiers = [
    { name: 'Campus pilot', price: 'Free', note: 'One term with a cohort. We cover AI costs to measure O1 and O2.', fill: C.background2, color: C.text2 },
    { name: 'Student plan', price: '$9 / month', note: 'Price hypothesis to test. Practice drills, retries, and progress tracking.', fill: C.accent1, color: C.background1 },
    { name: 'Career center license', price: 'Not decided', note: 'An option to test after pilots, not decided.', fill: C.background2, color: C.text2 },
  ];
  const w = 2.85, gap = 0.225;
  tiers.forEach((t, i) => {
    const x = 0.5 + i * (w + gap), y = 1.25;
    card(s, x, y, w, 2.85, t.name, t.fill);
    T(s, t.name, { x: x + 0.22, y: y + 0.22, w: w - 0.44, h: 0.35, fontSize: 16, bold: true, color: t.color });
    T(s, t.price, { x: x + 0.22, y: y + 0.7, w: w - 0.44, h: 0.6, fontSize: 28, bold: true, color: t.color, fontFace: THEME.headFontFace });
    T(s, t.note, { x: x + 0.22, y: y + 1.5, w: w - 0.44, h: 1.1, fontSize: 13, color: t.color });
  });
  T(s, 'How we test the price in pilots: a willingness-to-pay survey and the share of pilot students who choose the paid plan. No customers or prices yet — both are hypotheses.', { x: 0.5, y: 4.35, w: 9, h: 0.6, fontSize: 13, color: C.accent4 });
  s.addNotes('Pricing starts free: campus pilots for one term, where we cover the AI cost. Then an affordable student plan — our hypothesis is nine dollars a month, which we will test with a willingness-to-pay survey and conversion in the pilots. A career center license is an option to test after the pilots; it is not decided.');
}

// ================= 11. Financial model =================
{
  const s = content('Roadmap and money', 'Unit economics per paying student (assumptions)');
  // Bars drawn as shapes on one scale ($0–$10 across 3.2 in) so the chart renders in Keynote as well as PowerPoint.
  T(s, 'Monthly, per paying student (USD)', { x: 0.5, y: 1.2, w: 5.2, h: 0.3, fontSize: 13, bold: true, color: C.text2 });
  const bars = [['Price', 9.0, C.text2], ['AI cost', 2.0, C.accent2], ['Payment fees', 0.56, C.accent2], ['Hosting share', 0.3, C.accent2], ['Contribution', 6.14, C.accent1]];
  const x0 = 1.95, scale = 3.2 / 10, top = 1.7, step = 0.6, bh = 0.38;
  s.addShape(pres.shapes.LINE, { x: x0, y: top - 0.1, w: 0, h: step * bars.length, line: { color: 'B9C9C1', width: 0.75 }, objectName: 'chart axis' });
  bars.forEach(([label, v, color], i) => {
    const y = top + i * step;
    T(s, label, { x: 0.5, y, w: x0 - 0.62, h: bh, fontSize: 13, align: 'right', valign: 'middle', bold: label === 'Contribution' });
    s.addShape(pres.shapes.RECTANGLE, { x: x0, y, w: Math.max(0.04, v * scale), h: bh, fill: { color }, line: { color }, objectName: 'bar ' + label });
    T(s, '$' + v.toFixed(2), { x: x0 + v * scale + 0.1, y, w: 0.9, h: bh, fontSize: 13, bold: true, valign: 'middle', color: C.text1 });
  });
  T(s, '$9.00 − $2.00 − $0.56 − $0.30 = $6.14 contribution', { x: 0.5, y: top + step * bars.length + 0.05, w: 5.2, h: 0.3, fontSize: 12, color: C.accent4 });
  card(s, 6.0, 1.2, 3.5, 1.55, 'break-even', C.accent6);
  T(s, '≈ 82', { x: 6.2, y: 1.3, w: 3.1, h: 0.7, fontSize: 40, bold: true, color: C.accent1, fontFace: THEME.headFontFace });
  T(s, 'paying students a month to cover $500 of fixed costs at $6.14 contribution each', { x: 6.2, y: 2.0, w: 3.1, h: 0.7, fontSize: 12, color: C.text1 });
  T(s, 'Assumptions', { x: 6.0, y: 2.95, w: 3.5, h: 0.3, fontSize: 14, bold: true, color: C.text2 });
  T(s, [
    { text: 'AI: Claude Opus 5.5 list price, $4 / $20 per million input / output tokens', options: { bullet: true, breakLine: true } },
    { text: 'One drill ≈ 13.5k input + 6.4k output tokens ≈ $0.18', options: { bullet: true, breakLine: true } },
    { text: '8 drills + other AI help a month ≈ $2.00', options: { bullet: true, breakLine: true } },
    { text: 'Card fees 2.9% + $0.30; team unpaid in pilots', options: { bullet: true } },
  ], { x: 6.0, y: 3.27, w: 3.5, h: 1.65, fontSize: 12, paraSpaceAfter: 3 });
  s.addNotes('The financial model is unit economics, and every number is an assumption. At a nine-dollar plan, AI costs about two dollars a month per active student, based on Claude Opus 5.5 list prices and about eight drills a month. After card fees and hosting, each paying student contributes about six dollars. With five hundred dollars of monthly fixed costs, break-even is about 82 paying students. Pilots will replace these estimates with measured usage.');
}

// ================= 12. Prototype =================
pres.addSection({ title: 'Prototype' });
{
  const s = content('Prototype', 'Prototype: what the live demo shows');
  const a = fitImage(s, 'opening.png', 0.5, 1.2, 4.6, 2.5, 'Guide opening step screenshot');
  T(s, 'Opening: a sound bite (≤ 20 words), then evidence.', { x: 0.5, y: 1.2 + a.h + 0.1, w: 4.6, h: 0.3, fontSize: 12, color: C.accent4 });
  const b = fitImage(s, 'plan.png', 0.5 + a.w + 0.25, 1.2, 9.5 - (0.5 + a.w + 0.25), 2.5, 'Prep planner screenshot');
  T(s, 'Planner: 20 minutes → A+B+C scheduled, D left out.', { x: 0.5 + a.w + 0.25, y: 1.2 + b.h + 0.1, w: 9.5 - (0.5 + a.w + 0.25), h: 0.45, fontSize: 12, color: C.accent4 });
  card(s, 0.5, 4.05, 9.0, 0.95, 'demo path', C.background2);
  T(s, [
    { text: 'Demo path: ', options: { bold: true, color: C.text2 } },
    { text: 'Home → Try Mei’s example → Value map → Drill with follow-ups → First vs. retry → Plan my prep time.', options: {} },
  ], { x: 0.7, y: 4.12, w: 8.6, h: 0.4, fontSize: 13 });
  T(s, 'Built with Claude Code from a 17-step prompt kit: React + TypeScript, local-first storage, Claude Opus 5.5 backend with validated output, 42 automated tests.', { x: 0.7, y: 4.5, w: 8.6, h: 0.45, fontSize: 12, color: C.accent4 });
  s.addNotes('Now the live prototype. I will open the home page, load Mei\'s fictional example, show the value map, run the drill with follow-ups, compare the first answer with the retry, and finish with the prep planner. The prototype was built with Claude Code from a seventeen-step prompt kit; it runs locally, with an AI backend whose output is validated before it is shown.');
}

// ================= 13. Close =================
pres.addSection({ title: 'Close' });
{
  const s = pres.addSlide({ masterName: 'DARK_TITLE', sectionTitle: 'Close' });
  s.addText('THE ASK', { placeholder: 'eyebrow' });
  s.addText('Help us run the first pilot', { placeholder: 'title' });
  s.addText('One campus career center for a free spring pilot, and ten STEM students to try the drill this month.', { placeholder: 'body' });
  T(s, [
    { text: 'What Callback does not do', options: { bold: true, breakLine: true } },
    { text: 'No answers during a real interview. Preparation only.', options: { breakLine: true } },
    { text: 'No hiring predictions.', options: { breakLine: true } },
    { text: 'Never adds achievements you did not supply and confirm.', options: {} },
  ], { x: 0.6, y: 3.85, w: 6.0, h: 1.2, fontSize: 13, color: C.accent6, paraSpaceAfter: 2 });
  T(s, 'We help you own the room — with clear, provable words.', { x: 0.6, y: 5.05, w: 8.8, h: 0.3, fontSize: 12, italic: true, color: C.background1 });
  s.addNotes('To close: we are looking for one campus career center for a free spring pilot, and ten STEM students to try the drill this month. And a reminder of what Callback will never do: give answers during a real interview, predict hiring, or add achievements you did not supply. We help you own the room — with clear, provable words. Thank you.');
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('wrote', OUT);
})();
