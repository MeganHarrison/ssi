import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasMeaningfulFormData,
  formatEvaluationDate,
  mergeManualEvaluationEdits,
  mergeEvaluationFormData,
  EvaluationExtractionValidationError,
  parseEvaluationExtraction,
  resolveEvaluationFormData,
  storedEvaluationFormData,
} from './evaluation-form-data.mjs';

test('an empty extraction reuses saved data and does not write it back as complete', () => {
  const saved = {
    client: { name: 'Saved Client', dateOfBirth: '2012-03-04' },
    scores: { listeningComprehension: { standardScore: 0 } },
  };
  const extracted = { client: { name: null }, scores: { listeningComprehension: null } };

  assert.equal(hasMeaningfulFormData(extracted), false);
  assert.deepEqual(resolveEvaluationFormData(saved, extracted), {
    formData: saved,
    shouldPersist: false,
  });
});

test('partial extraction preserves saved fields while applying new values', () => {
  const saved = {
    client: { name: 'Saved Client', grade: '4' },
    notes: 'Reviewed notes',
  };

  assert.deepEqual(mergeEvaluationFormData(saved, {
    client: { name: '', school: 'Lincoln School' },
    notes: null,
  }), {
    client: { name: 'Saved Client', grade: '4', school: 'Lincoln School' },
    notes: 'Reviewed notes',
  });
});

test('new extraction cannot overwrite fields explicitly reviewed in the saved evaluation', () => {
  const saved = mergeManualEvaluationEdits({
    client: { name: 'AI name', dateOfBirth: '2012-03-04' },
    examiner: { name: 'AI examiner' },
    testDate: '2026-10-14',
    scores: {},
  }, {
    client_name: 'Corrected name',
    client_dob: '2012-03-05',
    examiner_name: 'Corrected examiner',
    test_date: '2026-10-15',
  });

  assert.deepEqual(resolveEvaluationFormData(saved, {
    client: { name: 'Old transcript name', dateOfBirth: '2012-03-04', school: 'Lincoln' },
    examiner: { name: 'Old transcript examiner' },
    testDate: '2026-10-14',
  }).formData, {
    client: { name: 'Corrected name', dateOfBirth: '2012-03-05', school: 'Lincoln' },
    examiner: { name: 'Corrected examiner' },
    testDate: '2026-10-15',
    scores: {},
    manualOverrides: ['client.name', 'client.dateOfBirth', 'examiner.name', 'testDate'],
  });
});

test('manual clearing remains authoritative over a value re-extracted from old chat', () => {
  const saved = mergeManualEvaluationEdits({ client: { name: 'Old name' } }, {
    client_name: '', client_dob: '', examiner_name: '', test_date: '',
  });
  const resolved = resolveEvaluationFormData(saved, { client: { name: 'Old name from chat' } });
  assert.equal(resolved.formData.client.name, null);
});

test('zero and false are valid extracted values, but a wholly empty record is rejected', () => {
  assert.equal(hasMeaningfulFormData({ score: 0, administered: false }), true);
  assert.deepEqual(resolveEvaluationFormData(null, { client: { name: null }, score: null }), {
    formData: null,
    shouldPersist: false,
  });
});

test('saved detail columns remain downloadable when form_data was never populated', () => {
  assert.deepEqual(storedEvaluationFormData({
    form_data: null,
    client_name: 'Saved Client',
    client_dob: '2012-03-04',
    examiner_name: 'Examiner',
    test_date: '2026-10-14',
  }), {
    client: {
      name: 'Saved Client',
      dateOfBirth: '2012-03-04',
      ageYears: undefined,
      ageMonths: undefined,
      gender: undefined,
      grade: undefined,
      school: undefined,
    },
    examiner: { name: 'Examiner', title: undefined },
    testDate: '2026-10-14',
    scores: {
      listeningComprehension: undefined,
      oralExpression: undefined,
      readingComprehension: undefined,
      writtenExpression: undefined,
    },
    composites: undefined,
    notes: undefined,
    recommendations: undefined,
  });
});

test('partially populated form_data keeps saved detail-column values too', () => {
  assert.deepEqual(storedEvaluationFormData({
    form_data: { client: { school: 'Lincoln School' } },
    client_name: 'Saved Client',
    client_dob: '2012-03-04',
  }), {
    client: {
      name: 'Saved Client',
      dateOfBirth: '2012-03-04',
      ageYears: undefined,
      ageMonths: undefined,
      gender: undefined,
      grade: undefined,
      school: 'Lincoln School',
    },
    examiner: { name: undefined, title: undefined },
    testDate: undefined,
    scores: {
      listeningComprehension: undefined,
      oralExpression: undefined,
      readingComprehension: undefined,
      writtenExpression: undefined,
    },
    composites: undefined,
    notes: undefined,
    recommendations: undefined,
  });
});

test('legacy composite score columns are exposed in the PDF composite structure', () => {
  const composites = {
    oralLanguage: { standardScore: 111, percentileRank: 77 },
    overallLanguage: { standardScore: 103, percentileRank: 58 },
  };
  assert.deepEqual(storedEvaluationFormData({
    form_data: null,
    composite_scores: composites,
  }).composites, composites);
});

test('manual corrections update nested PDF data and preserve unrelated fields', () => {
  assert.deepEqual(mergeManualEvaluationEdits({
    client: { name: 'Old name', dateOfBirth: '2010-01-02', school: 'Lincoln' },
    examiner: { name: 'Old examiner', title: 'CCC-SLP' },
    testDate: '2026-01-01',
    notes: 'Reviewed',
  }, {
    client_name: 'Corrected name',
    client_dob: '2010-01-03',
    examiner_name: '',
    test_date: '2026-02-02',
  }), {
    manualOverrides: ['client.name', 'client.dateOfBirth', 'examiner.name', 'testDate'],
    client: { name: 'Corrected name', dateOfBirth: '2010-01-03', school: 'Lincoln' },
    examiner: { name: null, title: 'CCC-SLP' },
    testDate: '2026-02-02',
    notes: 'Reviewed',
  });
});

test('date-only values keep their calendar day in negative UTC offsets', () => {
  assert.equal(formatEvaluationDate('2026-01-15', 'en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: 'long', day: 'numeric',
  }), 'January 15, 2026');
  assert.equal(formatEvaluationDate(null), 'Not set');
});

test('extracted form values are validated before rendering or persistence', () => {
  assert.deepEqual(parseEvaluationExtraction({
    client: { name: 'Megan', dateOfBirth: '2012-03-04', ageYears: 14, ageMonths: 0 },
    testDate: '2026-10-15',
    scores: { listeningComprehension: { rawScore: 0, standardScore: 100, percentileRank: 50 } },
    notes: 'Reviewed',
  }), {
    client: { name: 'Megan', dateOfBirth: '2012-03-04', ageYears: 14, ageMonths: 0 },
    testDate: '2026-10-15',
    scores: { listeningComprehension: { rawScore: 0, standardScore: 100, percentileRank: 50 } },
    notes: 'Reviewed',
  });

  for (const invalid of [
    { notes: ['not', 'text'] },
    { client: { dateOfBirth: '2026-02-30' } },
    { scores: { oralExpression: { percentileRank: 101 } } },
    { composites: { overallLanguage: { standardScore: 200 } } },
  ]) {
    assert.throws(() => parseEvaluationExtraction(invalid), EvaluationExtractionValidationError);
  }
});
