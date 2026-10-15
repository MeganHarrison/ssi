import { drawUnicodeText, embedUnicodeFonts } from './pdf/unicode-fonts.mjs';
import { formatScaleScore } from './score-export.mjs';

const PAGE_SIZE = [612, 792];
const TOP_MARGIN = 742;
const BOTTOM_MARGIN = 72;
const LINE_HEIGHT = 20;

/** @param {string} value @param {number} maxChars */
function wrapText(value, maxChars = 88) {
  const lines = [];
  let line = '';
  for (const word of value.split(/\s+/u)) {
    const parts = [...word].reduce((chunks, character) => {
      const last = chunks.at(-1) ?? '';
      if ([...last].length >= maxChars) chunks.push(character);
      else if (chunks.length) chunks[chunks.length - 1] = last + character;
      else chunks.push(character);
      return chunks;
    }, []);
    for (const part of parts) {
      if (line && [...line, ' ', ...part].length > maxChars) {
        lines.push(line);
        line = part;
      } else {
        line = line ? `${line} ${part}` : part;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Render a fallback evaluation report with explicit page-boundary handling.
 * @param {import('pdf-lib').PDFDocument} pdfDoc
 * @param {Record<string, any>} formData
 */
export async function renderFallbackEvaluationReport(pdfDoc, formData) {
  const unicodeFonts = await embedUnicodeFonts(pdfDoc);
  let page = pdfDoc.addPage(PAGE_SIZE);
  let yPosition = TOP_MARGIN;

  const ensureSpace = (points = LINE_HEIGHT) => {
    if (yPosition - points < BOTTOM_MARGIN) {
      page = pdfDoc.addPage(PAGE_SIZE);
      yPosition = TOP_MARGIN;
    }
  };
  const drawLine = (value, size = 12) => {
    ensureSpace();
    drawUnicodeText(page, value, { x: 50, y: yPosition, size }, unicodeFonts);
    yPosition -= LINE_HEIGHT;
  };
  const addLine = (label, value) => {
    if (value !== null && value !== undefined && value !== '') drawLine(`${label}: ${value}`);
  };
  const addHeading = value => {
    ensureSpace(LINE_HEIGHT * 1.5);
    drawLine(value, 14);
  };
  const addParagraph = (label, value) => {
    if (!value) return;
    addHeading(label);
    for (const line of wrapText(value, 88)) drawLine(line, 10);
  };

  drawLine('OWLS II Evaluation Report', 18);
  addHeading('Client Information');
  addLine('Name', formData.client?.name);
  addLine('Date of Birth', formData.client?.dateOfBirth);
  const age = formData.client?.ageYears != null
    ? `${formData.client.ageYears} years${formData.client.ageMonths != null ? `, ${formData.client.ageMonths} months` : ''}`
    : undefined;
  addLine('Age', age);
  addLine('Gender', formData.client?.gender);
  addLine('Grade', formData.client?.grade);
  addLine('School', formData.client?.school);

  addHeading('Examiner Information');
  addLine('Examiner', formData.examiner?.name);
  addLine('Title', formData.examiner?.title);
  addLine('Test Date', formData.testDate);

  if (formData.scores) {
    addHeading('Scores');
    const addScores = (label, scores) => {
      const scoreText = formatScaleScore(label, scores);
      if (scoreText) drawLine(scoreText);
    };
    addScores('Listening Comprehension', formData.scores.listeningComprehension);
    addScores('Oral Expression', formData.scores.oralExpression);
    addScores('Reading Comprehension', formData.scores.readingComprehension);
    addScores('Written Expression', formData.scores.writtenExpression);
  }

  if (formData.composites) {
    addHeading('Composite Scores');
    const addComposite = (label, scores) => {
      const scoreText = formatScaleScore(label, scores);
      if (scoreText) drawLine(scoreText);
    };
    addComposite('Oral Language Composite', formData.composites.oralLanguage);
    addComposite('Written Language Composite', formData.composites.writtenLanguage);
    addComposite('Receptive Language Composite', formData.composites.receptiveLanguage);
    addComposite('Expressive Language Composite', formData.composites.expressiveLanguage);
    addComposite('Overall Language Composite', formData.composites.overallLanguage);
  }

  addParagraph('Notes', formData.notes);
  addParagraph('Recommendations', formData.recommendations);

  for (const reportPage of pdfDoc.getPages()) {
    reportPage.drawText('Note: This is a generated report. Please upload the official OWLS II PDF template for form filling.', {
      x: 50, y: 36, size: 8,
    });
  }
}
