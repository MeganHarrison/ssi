import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { createSSRSassClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { resolveEvaluationFormData, storedEvaluationFormData } from '@/lib/evaluation-form-data.mjs';
import { getVerifiedSupabaseUser } from '@/lib/supabase/verified-user.mjs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Extract structured data from chat messages using AI
async function extractFormData(messages: { role: string; content: string }[]) {
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

  try {
    return JSON.parse(response.choices[0].message.content || '{}');
  } catch {
    console.error('Failed to parse extraction response');
    return {};
  }
}

export async function POST(req: NextRequest) {
  try {
    const { evaluationId, messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages required' }, { status: 400 });
    }

    const client = await createSSRSassClient();
    const supabase = client.getSupabaseClient();
    if (!await getVerifiedSupabaseUser(supabase)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let savedFormData: Record<string, unknown> | null = null;
    if (evaluationId) {
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
        return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 });
      }
      savedFormData = storedEvaluationFormData(data as unknown as Record<string, unknown>);
    }

    // Do not let an empty AI extraction erase a saved evaluation when the user
    // downloads its PDF without adding any new chat messages.
    const extractedFormData = await extractFormData(messages);
    const resolved = resolveEvaluationFormData(savedFormData, extractedFormData);
    if (!resolved.formData) {
      return NextResponse.json({ error: 'No evaluation data is available to generate a PDF' }, { status: 422 });
    }
    const formData = resolved.formData as unknown as {
      client?: { name?: string; dateOfBirth?: string; ageYears?: number; ageMonths?: number; gender?: string; grade?: string; school?: string };
      examiner?: { name?: string; title?: string };
      testDate?: string;
      scores?: Record<string, { standardScore?: number; percentileRank?: number } | undefined>;
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
      // Create a simple report PDF with extracted data
      const page = pdfDoc.addPage([612, 792]); // Letter size
      const { height } = page.getSize();

      let yPosition = height - 50;
      const lineHeight = 20;

      // Title
      page.drawText('OWLS II Evaluation Report', {
        x: 50,
        y: yPosition,
        size: 18,
      });
      yPosition -= lineHeight * 2;

      // Helper function to add a line
      const addLine = (label: string, value: string | number | null | undefined) => {
        if (value !== null && value !== undefined) {
          page.drawText(`${label}: ${value}`, {
            x: 50,
            y: yPosition,
            size: 12,
          });
          yPosition -= lineHeight;
        }
      };

      // Client Information
      page.drawText('Client Information', { x: 50, y: yPosition, size: 14 });
      yPosition -= lineHeight;

      addLine('Name', formData.client?.name);
      addLine('Date of Birth', formData.client?.dateOfBirth);
      addLine('Age', formData.client?.ageYears && formData.client?.ageMonths
        ? `${formData.client.ageYears} years, ${formData.client.ageMonths} months`
        : formData.client?.ageYears);
      addLine('Gender', formData.client?.gender);
      addLine('Grade', formData.client?.grade);
      addLine('School', formData.client?.school);

      yPosition -= lineHeight;

      // Examiner Information
      page.drawText('Examiner Information', { x: 50, y: yPosition, size: 14 });
      yPosition -= lineHeight;

      addLine('Examiner', formData.examiner?.name);
      addLine('Title', formData.examiner?.title);
      addLine('Test Date', formData.testDate);

      yPosition -= lineHeight;

      // Scores
      if (formData.scores) {
        page.drawText('Scores', { x: 50, y: yPosition, size: 14 });
        yPosition -= lineHeight;

        const addScores = (label: string, scores: { standardScore?: number; percentileRank?: number } | undefined) => {
          if (scores?.standardScore || scores?.percentileRank) {
            let scoreText = `${label}: `;
            if (scores.standardScore) scoreText += `SS=${scores.standardScore}`;
            if (scores.percentileRank) scoreText += ` PR=${scores.percentileRank}`;
            page.drawText(scoreText, { x: 50, y: yPosition, size: 12 });
            yPosition -= lineHeight;
          }
        };

        addScores('Listening Comprehension', formData.scores.listeningComprehension);
        addScores('Oral Expression', formData.scores.oralExpression);
        addScores('Reading Comprehension', formData.scores.readingComprehension);
        addScores('Written Expression', formData.scores.writtenExpression);
      }

      yPosition -= lineHeight;

      // Notes
      if (formData.notes) {
        page.drawText('Notes', { x: 50, y: yPosition, size: 14 });
        yPosition -= lineHeight;

        // Wrap long text
        const words = formData.notes.split(' ');
        let line = '';
        for (const word of words) {
          if (line.length + word.length > 80) {
            page.drawText(line, { x: 50, y: yPosition, size: 10 });
            yPosition -= lineHeight * 0.8;
            line = word + ' ';
          } else {
            line += word + ' ';
          }
        }
        if (line) {
          page.drawText(line, { x: 50, y: yPosition, size: 10 });
          yPosition -= lineHeight;
        }
      }

      // Recommendations
      if (formData.recommendations) {
        yPosition -= lineHeight;
        page.drawText('Recommendations', { x: 50, y: yPosition, size: 14 });
        yPosition -= lineHeight;

        const words = formData.recommendations.split(' ');
        let line = '';
        for (const word of words) {
          if (line.length + word.length > 80) {
            page.drawText(line, { x: 50, y: yPosition, size: 10 });
            yPosition -= lineHeight * 0.8;
            line = word + ' ';
          } else {
            line += word + ' ';
          }
        }
        if (line) {
          page.drawText(line, { x: 50, y: yPosition, size: 10 });
        }
      }

      // Footer note
      page.drawText(
        'Note: This is a generated report. Please upload the official OWLS II PDF template for form filling.',
        { x: 50, y: 50, size: 8 }
      );
    } else {
      // Fill the actual PDF form fields
      const form = pdfDoc.getForm();

      // Map extracted data to form fields
      // This will need to be updated based on actual PDF field names
      try {
        const setField = (fieldName: string, value: string | number | null | undefined) => {
          if (value !== null && value !== undefined) {
            try {
              const field = form.getTextField(fieldName);
              field.setText(String(value));
            } catch {
              // Field not found, skip
            }
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

        // Score fields
        setField('LC_StandardScore', formData.scores?.listeningComprehension?.standardScore);
        setField('LC_Percentile', formData.scores?.listeningComprehension?.percentileRank);
        setField('OE_StandardScore', formData.scores?.oralExpression?.standardScore);
        setField('OE_Percentile', formData.scores?.oralExpression?.percentileRank);
        setField('RC_StandardScore', formData.scores?.readingComprehension?.standardScore);
        setField('RC_Percentile', formData.scores?.readingComprehension?.percentileRank);
        setField('WE_StandardScore', formData.scores?.writtenExpression?.standardScore);
        setField('WE_Percentile', formData.scores?.writtenExpression?.percentileRank);

        setField('Notes', formData.notes);
        setField('Recommendations', formData.recommendations);
      } catch (error) {
        console.error('Error filling form fields:', error);
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
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
