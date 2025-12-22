import { PDFDocument, PDFTextField, PDFCheckBox } from 'pdf-lib';

export interface PDFFieldInfo {
  name: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'unknown';
  value?: string | boolean;
}

/**
 * Analyzes a PDF and extracts all form field information
 */
export async function analyzePdfFields(pdfBytes: ArrayBuffer): Promise<PDFFieldInfo[]> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  return fields.map((field) => {
    const name = field.getName();
    let type: PDFFieldInfo['type'] = 'unknown';
    let value: string | boolean | undefined;

    if (field instanceof PDFTextField) {
      type = 'text';
      value = field.getText() || undefined;
    } else if (field instanceof PDFCheckBox) {
      type = 'checkbox';
      value = field.isChecked();
    }

    return { name, type, value };
  });
}

/**
 * Fills a PDF form with the provided data
 */
export async function fillPdfForm(
  pdfBytes: ArrayBuffer,
  data: Record<string, string | boolean | number | null | undefined>
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();

  for (const [fieldName, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;

    try {
      const field = form.getField(fieldName);

      if (field instanceof PDFTextField) {
        field.setText(String(value));
      } else if (field instanceof PDFCheckBox) {
        if (value === true || value === 'true' || value === 'yes' || value === 1) {
          field.check();
        } else {
          field.uncheck();
        }
      }
    } catch (error) {
      // Field not found or incompatible type, skip
      console.warn(`Could not set field "${fieldName}":`, error);
    }
  }

  // Flatten the form to prevent editing
  // Uncomment if you want the PDF to be read-only
  // form.flatten();

  return pdfDoc.save();
}

/**
 * Creates a field name mapping from PDF fields to our schema
 */
export function createFieldMapping(pdfFields: PDFFieldInfo[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  // Common patterns to look for
  const patterns: Record<string, RegExp[]> = {
    'client.name': [/name/i, /client/i, /student/i, /examinee/i],
    'client.dateOfBirth': [/dob/i, /birth/i, /date.*birth/i],
    'client.ageYears': [/age.*year/i, /years/i],
    'client.ageMonths': [/age.*month/i, /months/i],
    'client.gender': [/gender/i, /sex/i],
    'client.grade': [/grade/i],
    'client.school': [/school/i],
    'examiner.name': [/examiner/i, /evaluator/i, /clinician/i],
    'test.testDate': [/test.*date/i, /exam.*date/i, /date.*test/i, /date.*exam/i],
    'scores.listeningComprehension.standardScore': [/lc.*standard/i, /listen.*standard/i],
    'scores.listeningComprehension.percentileRank': [/lc.*percent/i, /listen.*percent/i],
    'scores.oralExpression.standardScore': [/oe.*standard/i, /oral.*express.*standard/i],
    'scores.oralExpression.percentileRank': [/oe.*percent/i, /oral.*express.*percent/i],
    'scores.readingComprehension.standardScore': [/rc.*standard/i, /read.*standard/i],
    'scores.readingComprehension.percentileRank': [/rc.*percent/i, /read.*percent/i],
    'scores.writtenExpression.standardScore': [/we.*standard/i, /writ.*standard/i],
    'scores.writtenExpression.percentileRank': [/we.*percent/i, /writ.*percent/i],
  };

  for (const pdfField of pdfFields) {
    for (const [schemaField, regexPatterns] of Object.entries(patterns)) {
      if (regexPatterns.some(regex => regex.test(pdfField.name))) {
        mapping[schemaField] = pdfField.name;
        break;
      }
    }
  }

  return mapping;
}

/**
 * Converts our schema data to PDF field values using a mapping
 */
export function mapSchemaToFields(
  data: Record<string, unknown>,
  mapping: Record<string, string>
): Record<string, string | boolean | number> {
  const result: Record<string, string | boolean | number> = {};

  const getValue = (obj: Record<string, unknown>, path: string): unknown => {
    return path.split('.').reduce((current: unknown, key) => {
      if (current && typeof current === 'object' && key in current) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  };

  for (const [schemaPath, pdfFieldName] of Object.entries(mapping)) {
    const value = getValue(data, schemaPath);
    if (value !== null && value !== undefined) {
      if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
        result[pdfFieldName] = value;
      }
    }
  }

  return result;
}
