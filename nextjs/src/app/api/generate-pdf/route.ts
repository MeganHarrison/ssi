import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { embedUnicodeFonts, fontForUnicodeText, UnsupportedPdfCharacterError } from '@/lib/pdf/unicode-fonts.mjs';
import { createSSRSassClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import {
  EvaluationExtractionValidationError,
  parseEvaluationExtraction,
  resolveEvaluationFormData,
  storedEvaluationFormData,
} from '@/lib/evaluation-form-data.mjs';
import { renderFallbackEvaluationReport } from '@/lib/evaluation-report.mjs';
import { scoreTemplateFields } from '@/lib/score-export.mjs';
import { getVerifiedSupabaseUser } from '@/lib/supabase/verified-user.mjs';
import {
  MAX_PDF_REQUEST_BYTES,
  RequestBodyError,
  loadEvaluationChatHistory,
  parsePdfRequest,
  readJsonRequestBody,
} from '@/lib/evaluation-chat.mjs';

// Extract structured data from chat messages using AI
async function extractFormData(messages: { role: string; content: string }[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured for PDF extraction');
  const openai = new OpenAI({ apiKey });
  const conversationText = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n\n');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a data extraction assistant. Extract OWLS II evaluation form data from the conversation and return it as JSON.

Return ONLY a valid JSON object with this structure:
{
  "client": {
    "name": "string or null",
    "dateOfBirth": "YYYY-MM-DD or null",
    "ageYears": number or null,
    "ageMonths": number or null,
    "gender": "string or null",
    "grade": "string or null",
    "school": "string or null"
  },
  "examiner": {
    "name": "string or null",
    "title": "string or null"
  },
  "testDate": "YYYY-MM-DD or null",
  "scores": {
    "listeningComprehension": {
      "rawScore": number or null,
      "standardScore": number or null,
      "percentileRank": number or null
    },
    "oralExpression": { same structure },
    "readingComprehension": { same structure },
    "writtenExpression": { same structure }
  },
  "composites": {
    "oralLanguage": { "standardScore": number or null, "percentileRank": number or null },
    "writtenLanguage": { "standardScore": number or null, "percentileRank": number or null },
    "receptiveLanguage": { "standardScore": number or null, "percentileRank": number or null },
    "expressiveLanguage": { "standardScore": number or null, "percentileRank": number or null },
    "overallLanguage": { "standardScore": number or null, "percentileRank": number or null }
  },
  "notes": "string or null",
  "recommendations": "string or null"
}

Only include fields that have actual values mentioned in the conversation.`,
      },
      {
        role: 'user',
        content: `Extract form data from this conversation:\n\n${conversationText}`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.choices[0].message.content || '{}');
  } catch {
    throw new EvaluationExtractionValidationError();
  }
  return parseEvaluationExtraction(parsed);
}

export async function POST(req: NextRequest) {
  try {
    const client = await createSSRSassClient();
    const supabase = client.getSupabaseClient();
    if (!await getVerifiedSupabaseUser(supabase)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let input;
    try {
      input = parsePdfRequest(await readJsonRequestBody(req, MAX_PDF_REQUEST_BYTES));
    } catch (error) {
      if (error instanceof RequestBodyError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
    const { evaluationId } = input;

    let savedFormData: Record<string, unknown> | null = null;
    const { data, error } = await supabase
      .from('evaluations')
      .select('id, form_data, client_name, client_dob, client_age_years, client_age_months, client_gender, client_grade, client_school, examiner_name, examiner_title, test_date, listening_comprehension, oral_expression, reading_comprehension, written_expression, composite_scores, notes, recommendations')
      .eq('id', evaluationId)
      .maybeSingle();

    if (error) {
      console.error('Error loading evaluation for PDF generation:', error);
      return NextResponse.json({ error: 'Could not load evaluation data' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Evaluation not found or unavailable to your account.' }, { status: 404 });
    }
    savedFormData = storedEvaluationFormData(data as unknown as Record<string, unknown>);

    let messages;
    try {
      messages = await loadEvaluationChatHistory(supabase, evaluationId);
    } catch (historyError) {
      console.error('Error loading evaluation chat for PDF generation:', historyError);
      return NextResponse.json({ error: 'Could not load the saved evaluation conversation' }, { status: 500 });
    }

    if (messages.length > 0 && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'PDF extraction is unavailable because OPENAI_API_KEY is not configured on this deployment.' },
        { status: 503 }
      );
    }

    // Do not let an empty AI extraction erase a saved evaluation when the user
    // downloads its PDF without adding any new chat messages.
    let extractedFormData = {};
    try {
      extractedFormData = messages.length > 0 ? await extractFormData(messages) : {};
    } catch (error) {
      if (error instanceof EvaluationExtractionValidationError) {
        return NextResponse.json({ error: 'The extracted evaluation data was invalid. Review the transcript and try again.' }, { status: 502 });
      }
      throw error;
    }
    const resolved = resolveEvaluationFormData(savedFormData, extractedFormData);
    if (!resolved.formData) {
      return NextResponse.json({ error: 'No evaluation data is available to generate a PDF' }, { status: 422 });
    }
    const formData = resolved.formData as unknown as {
      client?: { name?: string; dateOfBirth?: string; ageYears?: number; ageMonths?: number; gender?: string; grade?: string; school?: string };
      examiner?: { name?: string; title?: string };
      testDate?: string;
      scores?: Record<string, { standardScore?: number; percentileRank?: number } | undefined>;
      composites?: Record<string, { standardScore?: number; percentileRank?: number } | undefined>;
      notes?: string;
      recommendations?: string;
    };

    // Try to load the OWLS II PDF template
    // For now, we'll create a simple PDF with the extracted data
    // Once the actual PDF is uploaded, this will be updated to fill the actual form

    let pdfDoc: PDFDocument;
    let usedTemplate = false;

    try {
      // Try to fetch the template PDF
      const templatePath = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/templates/owls-ii-template.pdf`;
      const templateResponse = await fetch(templatePath);

      if (templateResponse.ok) {
        const templateBytes = await templateResponse.arrayBuffer();
        pdfDoc = await PDFDocument.load(templateBytes);
        usedTemplate = true;
      } else {
        // Create a new PDF if template not available
        pdfDoc = await PDFDocument.create();
      }
    } catch {
      // Create a new PDF if template loading fails
      pdfDoc = await PDFDocument.create();
    }

    if (!usedTemplate) {
      await renderFallbackEvaluationReport(pdfDoc, formData);
    } else {
      // Fill the actual PDF form fields
      const form = pdfDoc.getForm();
      const unicodeFonts = await embedUnicodeFonts(pdfDoc);

      // Map extracted data to form fields
      // This will need to be updated based on actual PDF field names
      {
        const setField = (fieldName: string, value: string | number | null | undefined) => {
          if (value !== null && value !== undefined) {
            let field;
            try {
              field = form.getTextField(fieldName);
            } catch {
              // Field not found, skip
              return;
            }
            const text = String(value);
            field.setText(text);
            field.updateAppearances(fontForUnicodeText(text, unicodeFonts));
          }
        };

        // Common field name patterns - adjust based on actual PDF
        setField('ClientName', formData.client?.name);
        setField('DOB', formData.client?.dateOfBirth);
        setField('Age', `${formData.client?.ageYears || ''} years ${formData.client?.ageMonths || ''} months`);
        setField('Gender', formData.client?.gender);
        setField('Grade', formData.client?.grade);
        setField('School', formData.client?.school);
        setField('Examiner', formData.examiner?.name);
        setField('ExaminerTitle', formData.examiner?.title);
        setField('TestDate', formData.testDate);

        // Score fields; zero is a valid raw score and must not be dropped.
        for (const [field, score] of Object.entries(scoreTemplateFields(formData.scores, formData.composites))) {
          setField(field, score);
        }

        setField('Notes', formData.notes);
        setField('Recommendations', formData.recommendations);
      }
    }

    // Save the evaluation data to database
    if (evaluationId && resolved.shouldPersist) {
      try {
        const { error } = await supabase
          .from('evaluations')
          .update({
            client_name: formData.client?.name,
            client_dob: formData.client?.dateOfBirth,
            examiner_name: formData.examiner?.name,
            test_date: formData.testDate,
            form_data: formData,
            status: 'complete',
            updated_at: new Date().toISOString(),
          })
          .eq('id', evaluationId);
        if (error) {
          console.error('Error saving evaluation:', error);
          return NextResponse.json({ error: 'Could not save extracted evaluation data' }, { status: 500 });
        }
      } catch (error) {
        console.error('Error saving evaluation:', error);
        return NextResponse.json({ error: 'Could not save extracted evaluation data' }, { status: 500 });
      }
    }

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();

    // Return PDF as download
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="OWLS-II-Evaluation.pdf"`,
      },
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    if (error instanceof UnsupportedPdfCharacterError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
