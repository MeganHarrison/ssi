import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';

const FONT_FILES = [
  'NotoSans-Latin.ttf',
  'NotoSansArabic.ttf',
  'NotoSansSC.ttf',
];

export class UnsupportedPdfCharacterError extends Error {
  constructor(codePoint) {
    super(`The PDF font set does not support character U+${codePoint.toString(16).toUpperCase()}.`);
    this.name = 'UnsupportedPdfCharacterError';
  }
}

/** @param {import('pdf-lib').PDFDocument} pdfDoc */
export async function embedUnicodeFonts(pdfDoc) {
  pdfDoc.registerFontkit(fontkit);
  return Promise.all(FONT_FILES.map(async file => {
    const bytes = await readFile(join(process.cwd(), 'public', 'fonts', file));
    return pdfDoc.embedFont(bytes, { subset: true });
  }));
}

/**
 * @param {import('pdf-lib').PDFPage} page
 * @param {string} value
 * @param {{ x: number; y: number; size: number }} options
 * @param {import('pdf-lib').PDFFont[]} fonts
 */
export function drawUnicodeText(page, value, options, fonts) {
  let run = '';
  let runFont;
  let x = options.x;
  const flush = () => {
    if (!run || !runFont) return;
    page.drawText(run, { ...options, x, font: runFont });
    x += runFont.widthOfTextAtSize(run, options.size);
    run = '';
  };

  for (const character of value) {
    const codePoint = character.codePointAt(0);
    const font = fonts.find(candidate => candidate.getCharacterSet().includes(codePoint));
    if (!font) throw new UnsupportedPdfCharacterError(codePoint);
    if (runFont !== font) {
      flush();
      runFont = font;
    }
    run += character;
  }
  flush();
}
