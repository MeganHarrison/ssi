import assert from 'node:assert/strict';
import test from 'node:test';

import { formatScaleScore, scoreTemplateFields } from './score-export.mjs';

test('exports raw-only scores and preserves zero-valued scores', () => {
  assert.equal(formatScaleScore('Listening Comprehension', { rawScore: 0 }), 'Listening Comprehension: Raw=0');
  assert.equal(formatScaleScore('Oral Expression', { rawScore: 0, standardScore: 0, percentileRank: 0 }), 'Oral Expression: Raw=0 SS=0 PR=0');
});

test('maps raw, standard, and percentile scores to template field names', () => {
  assert.deepEqual(scoreTemplateFields({
    listeningComprehension: { rawScore: 0, standardScore: 101, percentileRank: 53 },
    oralExpression: { rawScore: 14 },
  }), {
    LC_RawScore: 0,
    LC_StandardScore: 101,
    LC_Percentile: 53,
    OE_RawScore: 14,
  });
});
