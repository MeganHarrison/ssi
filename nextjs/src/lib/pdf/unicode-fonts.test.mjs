import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';

import { drawUnicodeText, embedUnicodeFonts, UnsupportedPdfCharacterError } from './unicode-fonts.mjs';

test('fallback reports embed Unicode font subsets and draw Latin, Chinese, and Arabic text', async () => {
  const pdfDoc = await PDFDocument.create();
  const fonts = await embedUnicodeFonts(pdfDoc);
  const page = pdfDoc.addPage([612, 792]);

  drawUnicodeText(page, 'Megan 李明 سارة', { x: 50, y: 700, size: 12 }, fonts);
  const bytes = await pdfDoc.save();

  assert.ok(bytes.byteLength > 0);
  assert.ok(fonts[0].getCharacterSet().includes('M'.codePointAt(0)));
  assert.ok(fonts[1].getCharacterSet().includes('س'.codePointAt(0)));
  assert.ok(fonts[2].getCharacterSet().includes('李'.codePointAt(0)));
  assert.ok(fonts[2].getCharacterSet().includes('明'.codePointAt(0)));
});

test('unsupported characters fail with a specific code point', async () => {
  const pdfDoc = await PDFDocument.create();
  const fonts = await embedUnicodeFonts(pdfDoc);
  const page = pdfDoc.addPage([612, 792]);

  assert.throws(
    () => drawUnicodeText(page, '\uE000', { x: 50, y: 700, size: 12 }, fonts),
    error => error instanceof UnsupportedPdfCharacterError && /U\+E000/.test(error.message),
  );
});
