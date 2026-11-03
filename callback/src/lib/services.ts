// Service adapters. Each reports its real availability; none pretends to succeed.

export interface ServiceStatus {
  id: string;
  name: string;
  available: boolean;
  detail: string;
  sendsData: string;
}

export function serviceStatuses(): ServiceStatus[] {
  const speech = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const media = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  return [
    { id: 'ai', name: 'AI feedback and drafting', available: false, detail: 'No backend is configured. Self-review and the prepared example work; automated evaluation is unavailable.', sendsData: 'When configured: the selected answer, story facts, and job needs — not your whole archive.' },
    { id: 'research', name: 'Company research search', available: false, detail: 'Not configured. Paste sources manually; unverified claims are labeled.', sendsData: 'When configured: search queries and the URLs you choose.' },
    { id: 'transcription', name: 'Transcription', available: false, detail: 'Not configured. Type or paste a transcript for each recording.', sendsData: 'When configured: only the recording you choose to submit.' },
    { id: 'speech', name: 'Spoken interviewer prompts', available: speech, detail: speech ? 'Uses your browser’s built-in speech voices.' : 'Your browser has no speech synthesis.', sendsData: 'Interviewer questions only. Depending on the browser and voice, speech may be processed by the operating system or browser vendor.' },
    { id: 'recording', name: 'Audio and video recording', available: media, detail: media ? 'Recordings stay on this device (IndexedDB).' : 'This browser cannot record.', sendsData: 'Nothing leaves the device.' },
    { id: 'video', name: 'Automated video observations', available: false, detail: 'Not implemented. Use playback and the self-review checklist.', sendsData: '—' },
    { id: 'runner', name: 'Code test runner', available: false, detail: 'No isolated sandbox is configured. Code can be saved and reviewed, but tests are not executed.', sendsData: 'When configured: the code you choose to run.' },
    { id: 'accounts', name: 'Accounts, sync, and sharing', available: false, detail: 'Not configured. Your work is saved on this device only.', sendsData: 'When configured: the records you choose to sync or share.' },
  ];
}

export function speak(text: string, lang = 'en-US') {
  if (!('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  window.speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
