import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasMeaningfulFormData,
  formatEvaluationDate,
  mergeManualEvaluationEdits,
  mergeEvaluationFormData,
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
      composite: undefined,
    },
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
      composite: undefined,
    },
    notes: undefined,
    recommendations: undefined,
  });
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
