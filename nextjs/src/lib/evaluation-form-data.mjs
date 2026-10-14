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

/** @param {unknown} value */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
