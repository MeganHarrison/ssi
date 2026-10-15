const SCALE_FIELDS = [
  ['listeningComprehension', 'LC'],
  ['oralExpression', 'OE'],
  ['readingComprehension', 'RC'],
  ['writtenExpression', 'WE'],
];

const COMPOSITE_FIELDS = [
  ['oralLanguage', 'OL'],
  ['writtenLanguage', 'WL'],
  ['receptiveLanguage', 'RL'],
  ['expressiveLanguage', 'EL'],
  ['overallLanguage', 'Overall'],
];

/**
 * @param {string} label
 * @param {{ rawScore?: number | null, standardScore?: number | null, percentileRank?: number | null } | null | undefined} scores
 */
export function formatScaleScore(label, scores) {
  if (!scores) return null;
  const values = [
    scores.rawScore == null ? null : `Raw=${scores.rawScore}`,
    scores.standardScore == null ? null : `SS=${scores.standardScore}`,
    scores.percentileRank == null ? null : `PR=${scores.percentileRank}`,
  ].filter(Boolean);
  return values.length ? `${label}: ${values.join(' ')}` : null;
}

/**
 * @param {Record<string, { rawScore?: number | null, standardScore?: number | null, percentileRank?: number | null } | null | undefined> | null | undefined} scores
 * @returns {Record<string, number>}
 */
export function scoreTemplateFields(scores, composites) {
  const fields = {};
  for (const [source, entries] of [[scores, SCALE_FIELDS], [composites, COMPOSITE_FIELDS]]) {
    for (const [scale, prefix] of entries) {
      const value = source?.[scale];
      if (!value) continue;
      for (const [property, suffix] of [['rawScore', 'RawScore'], ['standardScore', 'StandardScore'], ['percentileRank', 'Percentile']]) {
        const score = value[property];
        if (score != null) fields[`${prefix}_${suffix}`] = score;
      }
    }
  }
  return fields;
}
