// Läser text ur CV-filer i webbläsaren: PDF, Word, text och bilder (OCR).

import { PDFJS_BASE, MAMMOTH_URL, TESSERACT_URL } from './config.js';
import { lc } from './text.js';

const loadScript = (src) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) return resolve();
  const s = document.createElement('script');
  s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Kunde inte ladda ' + src));
  document.head.appendChild(s);
});

async function ocr(images, progress) {
  await loadScript(TESSERACT_URL);
  const worker = await Tesseract.createWorker('swe+eng');
  try {
    let out = '';
    for (let i = 0; i < images.length; i++) {
      progress?.(`Läser inskannad text med textigenkänning, sida ${i + 1} av ${images.length}… (kan ta en halv minut)`);
      out += (await worker.recognize(images[i])).data.text + '\n';
    }
    return out;
  } finally {
    await worker.terminate();
  }
}

async function readPdf(file, progress) {
  await loadScript(PDFJS_BASE + 'pdf.min.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    let line = '', out = '', lastY = null;
    for (const item of content.items) {
      const y = item.transform?.[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) { out += line + '\n'; line = ''; }
      line += item.str + (item.hasEOL ? '\n' : ' ');
      lastY = y;
    }
    pages.push(out + line);
  }
  const text = pages.join('\n');
  if (text.replace(/\s/g, '').length >= 30) return text;

  // Ingen text i PDF:en, alltså troligen inskannad: rendera sidorna och kör OCR.
  const canvases = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    canvases.push(canvas);
  }
  return ocr(canvases, progress);
}

async function readDocx(file) {
  await loadScript(MAMMOTH_URL);
  return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
}

// Gamla Word-filer (.doc) är binära. Texten ligger antingen som 8-bitars
// eller UTF-16-tecken, så båda avkodas och den som ger mest läsbar text vinner.
async function readDoc(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const runRe = /[A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9 \t.,:;@()\/+#&%–-]{5,}/g;
  let best = '';
  for (const enc of ['utf-16le', 'windows-1252']) {
    const runs = (new TextDecoder(enc).decode(buf).match(runRe) || []).filter((r) => /[A-Za-zÀ-ÿ]{3}/.test(r));
    const text = runs.join('\n');
    if (text.length > best.length) best = text;
  }
  return best;
}

export async function readCv(file, progress) {
  const name = lc(file.name);
  let text;
  if (name.endsWith('.pdf')) text = await readPdf(file, progress);
  else if (name.endsWith('.docx')) text = await readDocx(file);
  else if (name.endsWith('.doc')) text = await readDoc(file);
  else if (/\.(png|jpe?g|webp)$/.test(name)) text = await ocr([file], progress);
  else text = await file.text();
  text = text.replace(/ /g, ' ');
  if (text.trim().length < 30) throw new Error('Hittade ingen läsbar text i filen. Prova att spara CV:t som PDF eller .docx.');
  return text;
}
