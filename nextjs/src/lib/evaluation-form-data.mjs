/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function hasMeaningfulFormData(value) {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(hasMeaningfulFormData);
  if (value && typeof value === 'object') {
    return Object.values(value).some(hasMeaningfulFormData);
  }
  return false;
}

/**
 * Merge an AI extraction into saved evaluation data without letting null or
 * blank extraction fields erase values already reviewed and stored.
 *
 * @param {unknown} saved
 * @param {unknown} extracted
 * @returns {Record<string, unknown>}
 */
export function mergeEvaluationFormData(saved, extracted) {
  const savedObject = isRecord(saved) ? saved : {};
  if (!isRecord(extracted)) return savedObject;

  const merged = { ...savedObject };
  for (const [key, value] of Object.entries(extracted)) {
    if (isRecord(value)) {
      const nested = mergeEvaluationFormData(savedObject[key], value);
      if (hasMeaningfulFormData(nested)) merged[key] = nested;
    } else if (hasMeaningfulFormData(value)) {
      merged[key] = value;
    }
  }
  return merged;
}

/**
 * @param {unknown} saved
 * @param {unknown} extracted
 * @returns {{ formData: Record<string, unknown> | null, shouldPersist: boolean }}
 */
export function resolveEvaluationFormData(saved, extracted) {
  const hasNewData = hasMeaningfulFormData(extracted);
  const formData = hasNewData
    ? mergeEvaluationFormData(saved, extracted)
    : isRecord(saved) ? saved : null;

  return {
    formData: formData && hasMeaningfulFormData(formData) ? formData : null,
    shouldPersist: hasNewData,
  };
}

/**
 * @param {Record<string, unknown>} row
 * @returns {Record<string, unknown> | null}
 */
export function storedEvaluationFormData(row) {
  const fallback = {
    client: {
      name: row.client_name,
      dateOfBirth: row.client_dob,
      ageYears: row.client_age_years,
      ageMonths: row.client_age_months,
      gender: row.client_gender,
      grade: row.client_grade,
      school: row.client_school,
    },
    examiner: { name: row.examiner_name, title: row.examiner_title },
    testDate: row.test_date,
    scores: {
      listeningComprehension: row.listening_comprehension,
      oralExpression: row.oral_expression,
      readingComprehension: row.reading_comprehension,
      writtenExpression: row.written_expression,
      composite: row.composite_scores,
    },
    notes: row.notes,
    recommendations: row.recommendations,
  };
  const saved = isRecord(row.form_data)
    ? mergeEvaluationFormData(fallback, row.form_data)
    : fallback;
  return hasMeaningfulFormData(saved) ? saved : null;
}

/**
 * Apply the detail-page's manual corrections to both the legacy columns and
 * the nested form_data shape used by PDF generation. Explicit nulls are kept
 * so clearing a field does not reveal an older value on the next export.
 *
 * @param {unknown} saved
 * @param {{ client_name?: string | null, client_dob?: string | null, examiner_name?: string | null, test_date?: string | null }} edits
 * @returns {Record<string, unknown>}
 */
export function mergeManualEvaluationEdits(saved, edits) {
  const form = isRecord(saved) ? saved : {};
  const valueOrNull = (value) => typeof value === 'string' && value.trim() === '' ? null : value ?? null;
  return {
    ...form,
    client: {
      ...(isRecord(form.client) ? form.client : {}),
      name: valueOrNull(edits.client_name),
      dateOfBirth: valueOrNull(edits.client_dob),
    },
    examiner: {
      ...(isRecord(form.examiner) ? form.examiner : {}),
      name: valueOrNull(edits.examiner_name),
    },
    testDate: valueOrNull(edits.test_date),
  };
}

/**
 * Format SQL DATE values in UTC so the calendar day is stable across browser
 * time zones. Timestamp strings keep the browser's local-time formatting.
 *
 * @param {string | null | undefined} value
 * @param {string} locale
 * @param {Intl.DateTimeFormatOptions} options
 * @returns {string}
 */
export function formatEvaluationDate(value, locale = 'en-US', options = {}) {
  if (!value) return 'Not set';
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isDateOnly ? `${value}T00:00:00.000Z` : value);
  return date.toLocaleDateString(locale, isDateOnly ? { ...options, timeZone: 'UTC' } : options);
}

/** @param {unknown} value */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
