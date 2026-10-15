import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';

import { renderFallbackEvaluationReport } from './evaluation-report.mjs';

test('fallback report content continues on new pages before reaching the footer', async () => {
  const pdfDoc = await PDFDocument.create();
  await renderFallbackEvaluationReport(pdfDoc, {
    client: { name: '李明' },
    notes: 'Clinical note. '.repeat(700),
    recommendations: 'Recommendation. '.repeat(700),
  });

  assert.ok(pdfDoc.getPages().length > 1);
  assert.ok((await pdfDoc.save()).byteLength > 0);
});
