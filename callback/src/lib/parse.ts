// Local document extraction. Files are read in the browser and never uploaded.
// Extracted text is treated as untrusted plain text, never as HTML or instructions.

export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 10;

export interface ExtractResult {
  text: string;
  filename: string;
  pagesRead: number | null;
  totalPages: number | null;
  warnings: string[];
}

export class ExtractError extends Error {}

export interface ExtractControl {
  cancelled: boolean;
  onProgress?: (msg: string) => void;
}

function ext(name: string) {
  return name.toLowerCase().split('.').pop() ?? '';
}

export async function extractFile(file: File, ctl: ExtractControl): Promise<ExtractResult> {
  const e = ext(file.name);
  if (!['pdf', 'docx', 'txt', 'md'].includes(e)) {
    throw new ExtractError(`“.${e}” files are not supported. Export the document as PDF, DOCX, TXT, or MD, or paste the text instead.`);
  }
  if (file.size > MAX_BYTES) throw new ExtractError(`This file is ${(file.size / 1048576).toFixed(1)} MB. The limit is 10 MB. Paste the relevant text instead.`);
  if (file.size === 0) throw new ExtractError('This file is empty.');
  const warnings: string[] = [];
  const check = () => {
    if (ctl.cancelled) throw new ExtractError('Import cancelled.');
  };

  if (e === 'txt' || e === 'md') {
    ctl.onProgress?.('Reading text…');
    const text = await file.text();
    check();
    if (text.includes('\u0000')) throw new ExtractError('This file does not look like plain text. Paste the text instead.');
    return { text: text.replace(/\r\n/g, '\n'), filename: file.name, pagesRead: null, totalPages: null, warnings };
  }

  if (e === 'docx') {
    ctl.onProgress?.('Extracting DOCX text…');
    const mammoth = await import('mammoth');
    check();
    const buf = await file.arrayBuffer();
    check();
    try {
      // extractRawText reads document text only; embedded content and macros are not executed.
      const res = await mammoth.extractRawText({ arrayBuffer: buf });
      check();
      if (res.messages.length) warnings.push('Some parts of the document could not be read; check the preview.');
      const text = res.value.replace(/\n{3,}/g, '\n\n').trim();
      if (!text) throw new ExtractError('No text found in this DOCX. Paste the text instead.');
      return { text, filename: file.name, pagesRead: null, totalPages: null, warnings };
    } catch (err) {
      if (err instanceof ExtractError) throw err;
      throw new ExtractError('This DOCX could not be read. It may be corrupt or password-protected. Paste the text instead.');
    }
  }

  // PDF
  ctl.onProgress?.('Loading PDF reader…');
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  check();
  const buf = await file.arrayBuffer();
  const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'PasswordException') throw new ExtractError('This PDF is password-protected. Remove the password or paste the text instead.');
    throw new ExtractError('This PDF could not be read. It may be corrupt. Paste the text instead.');
  }
  const total = doc.numPages;
  const pages = Math.min(total, MAX_PDF_PAGES);
  if (total > MAX_PDF_PAGES) warnings.push(`Only the first ${MAX_PDF_PAGES} of ${total} pages were read. Paste any relevant content from later pages.`);
  const parts: string[] = [];
  let orderJumps = 0;
  for (let p = 1; p <= pages; p++) {
    check();
    ctl.onProgress?.(`Reading page ${p} of ${pages}…`);
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let line = '';
    const lines: string[] = [];
    for (const item of content.items as { str: string; transform: number[] }[]) {
      const y = item.transform?.[5] ?? 0;
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (y > lastY + 20) orderJumps++; // text moved up the page: possible column layout
        lines.push(line);
        line = '';
      }
      line += item.str;
      lastY = y;
    }
    if (line) lines.push(line);
    parts.push(lines.map((l) => l.trim()).filter(Boolean).join('\n'));
  }
  await task.destroy();
  const text = parts.join('\n\n').trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 30 * pages) warnings.push('Very little text was found. This may be a scanned document. Paste the text instead (OCR is not enabled).');
  if (orderJumps > 2) warnings.push('The reading order may be unusual (for example, columns). Check the preview before using it.');
  return { text, filename: file.name, pagesRead: pages, totalPages: total, warnings };
}
