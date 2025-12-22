# SSI Voice Memo App - Task List

A web application to help complete SSI evaluation reports (OWLS II forms) by:
1. Accepting voice memo transcripts
2. Using an AI chat agent to ask follow-up questions
3. Auto-filling the PDF form (preserving exact format)

---

## Phase 1: Environment Setup

### 1.1 Supabase Configuration
- [ ] Create Supabase project at https://supabase.com
- [ ] Get Project URL, Anon Key, and Service Role Key from Settings > API
- [ ] Create `.env.local` from `.env.template` with actual credentials
- [ ] Run `npx supabase login`
- [ ] Run `npx supabase link` (requires database password)
- [ ] Run `npx supabase config push`
- [ ] Run `npx supabase migrations up --linked`

### 1.2 PDF Setup
- [ ] Copy OWLS II PDF to `/nextjs/public/` folder
- [ ] Verify PDF structure and identify all fillable fields
- [ ] Document field names, types, and validation requirements

### 1.3 API Keys
- [ ] Set up OpenAI API key for chat agent (or Anthropic Claude API)
- [ ] Add API key to environment variables

---

## Phase 2: PDF Analysis & Schema Design

### 2.1 PDF Field Extraction
- [ ] Install pdf-lib or similar library for PDF manipulation
- [ ] Parse PDF to identify all form fields
- [ ] Create JSON schema mapping voice transcript data to PDF fields
- [ ] Document OWLS II form sections:
  - Client Information (Name, DOB, Age, etc.)
  - Examiner Information
  - Test Dates
  - Listening Comprehension scores
  - Oral Expression scores
  - Reading Comprehension scores
  - Written Expression scores
  - Composite scores
  - Notes/Observations

### 2.2 Database Schema
- [ ] Create `evaluations` table for storing assessment data
- [ ] Create `transcripts` table for voice memo transcripts
- [ ] Create `chat_sessions` table for follow-up conversations
- [ ] Set up Row Level Security (RLS) policies
- [ ] Create migration files

---

## Phase 3: Voice Transcript Upload Feature

### 3.1 Upload Interface
- [ ] Create `/app/app/evaluation/page.tsx` - Main evaluation page
- [ ] Build transcript upload component with drag-and-drop
- [ ] Support text file upload (.txt)
- [ ] Support audio file upload with transcription (.m4a, .mp3, .wav)
- [ ] Add copy-paste text input option
- [ ] Create progress indicators for upload/processing

### 3.2 Audio Transcription (Optional Enhancement)
- [ ] Integrate with OpenAI Whisper API for audio transcription
- [ ] Or use browser-based speech-to-text
- [ ] Handle transcription errors gracefully

### 3.3 Transcript Storage
- [ ] Store transcripts in Supabase storage bucket
- [ ] Link transcripts to user accounts
- [ ] Add transcript history/management

---

## Phase 4: AI Chat Agent for Follow-up Questions

### 4.1 Chat Interface
- [ ] Create `/app/app/evaluation/chat/page.tsx` - Chat page
- [ ] Build chat UI component with message history
- [ ] Style for mobile-friendly use (mom's phone)
- [ ] Add typing indicators and loading states

### 4.2 AI Integration
- [ ] Create API route `/app/api/chat/route.ts`
- [ ] Integrate with OpenAI GPT-4 or Claude API
- [ ] Build system prompt for OWLS II data extraction
- [ ] Parse transcript and identify missing information
- [ ] Generate intelligent follow-up questions
- [ ] Extract structured data from conversation

### 4.3 Prompt Engineering
- [ ] Create detailed system prompt understanding OWLS II form
- [ ] Include all required fields and their formats
- [ ] Add validation rules (age ranges, score ranges, etc.)
- [ ] Handle ambiguous or unclear responses
- [ ] Maintain conversation context

### 4.4 Data Extraction
- [ ] Parse AI responses to extract form field values
- [ ] Validate extracted data against schema
- [ ] Flag uncertain or missing data
- [ ] Allow manual corrections

---

## Phase 5: PDF Form Filling

### 5.1 PDF Library Setup
- [ ] Install `pdf-lib` for PDF manipulation
- [ ] Create PDF filling utility functions
- [ ] Test filling a sample form

### 5.2 Form Filling Logic
- [ ] Create `/app/api/generate-pdf/route.ts`
- [ ] Map extracted data to PDF form fields
- [ ] Handle different field types (text, checkbox, dropdown)
- [ ] Preserve original PDF formatting exactly
- [ ] Add signature/date fields if needed

### 5.3 PDF Preview & Download
- [ ] Create PDF preview component
- [ ] Add download button for completed PDF
- [ ] Support print functionality
- [ ] Allow re-editing before final download

---

## Phase 6: Complete UI Workflow

### 6.1 Navigation & Layout
- [ ] Update navigation to include "New Evaluation" link
- [ ] Create evaluation dashboard showing past reports
- [ ] Add status indicators (draft, complete, submitted)

### 6.2 Step-by-Step Wizard
- [ ] Step 1: Upload transcript or paste text
- [ ] Step 2: AI chat for follow-up questions
- [ ] Step 3: Review extracted data
- [ ] Step 4: Preview and download PDF

### 6.3 Mobile Optimization
- [ ] Ensure responsive design for phone use
- [ ] Large touch targets for buttons
- [ ] Clear, readable fonts
- [ ] Simple navigation

### 6.4 Error Handling
- [ ] Handle upload failures gracefully
- [ ] Retry logic for API calls
- [ ] Clear error messages
- [ ] Data recovery/autosave

---

## Phase 7: Testing & Quality Assurance

### 7.1 Unit Testing
- [ ] Test PDF field extraction
- [ ] Test data validation
- [ ] Test AI prompt responses
- [ ] Test PDF generation

### 7.2 Integration Testing
- [ ] Test full workflow end-to-end
- [ ] Test with real OWLS II transcripts
- [ ] Test on mobile devices
- [ ] Test different browsers

### 7.3 User Acceptance Testing
- [ ] Have mom test the complete workflow
- [ ] Gather feedback on usability
- [ ] Iterate based on feedback

---

## Phase 8: Deployment

### 8.1 Production Setup
- [ ] Configure Vercel deployment
- [ ] Set production environment variables
- [ ] Update Supabase config for production URL
- [ ] Enable HTTPS

### 8.2 Monitoring
- [ ] Set up error tracking (Sentry or similar)
- [ ] Add analytics for usage tracking
- [ ] Monitor API costs (OpenAI/Claude)

---

## Technical Stack Summary

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 15, React 19, Tailwind CSS |
| Backend | Next.js API Routes, Supabase |
| Database | PostgreSQL (Supabase) |
| Auth | Supabase Auth |
| AI Chat | OpenAI GPT-4 or Anthropic Claude |
| PDF | pdf-lib |
| Hosting | Vercel |

---

## Files to Create

```
nextjs/src/
├── app/
│   ├── app/
│   │   └── evaluation/
│   │       ├── page.tsx           # Main evaluation page
│   │       ├── new/
│   │       │   └── page.tsx       # New evaluation wizard
│   │       ├── chat/
│   │       │   └── page.tsx       # Chat interface
│   │       └── [id]/
│   │           └── page.tsx       # View/edit specific evaluation
│   └── api/
│       ├── chat/
│       │   └── route.ts           # AI chat endpoint
│       ├── transcribe/
│       │   └── route.ts           # Audio transcription endpoint
│       └── generate-pdf/
│           └── route.ts           # PDF generation endpoint
├── components/
│   ├── TranscriptUpload.tsx       # Upload component
│   ├── ChatInterface.tsx          # Chat UI
│   ├── EvaluationForm.tsx         # Form review/edit
│   ├── PDFPreview.tsx             # PDF preview
│   └── EvaluationWizard.tsx       # Step-by-step wizard
├── lib/
│   ├── pdf/
│   │   ├── parser.ts              # PDF field extraction
│   │   └── filler.ts              # PDF form filling
│   ├── ai/
│   │   ├── prompts.ts             # System prompts
│   │   └── extractor.ts           # Data extraction
│   └── schema/
│       └── owls-ii.ts             # OWLS II form schema
```

---

## Database Tables to Create

```sql
-- Evaluations table
CREATE TABLE evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'draft',
  client_name TEXT,
  client_dob DATE,
  examiner_name TEXT,
  test_date DATE,
  form_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transcripts table
CREATE TABLE transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID REFERENCES evaluations(id),
  content TEXT,
  source TEXT, -- 'upload', 'paste', 'audio'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages table
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID REFERENCES evaluations(id),
  role TEXT, -- 'user', 'assistant'
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Next Steps (Immediate)

1. **Upload the OWLS II PDF** to `/nextjs/public/` folder
2. **Set up Supabase** with your credentials in `.env.local`
3. **Analyze PDF fields** to create the form schema
4. **Begin building** the evaluation workflow

---

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Setup | Foundation work |
| Phase 2: PDF Analysis | Critical path |
| Phase 3: Upload Feature | Core feature |
| Phase 4: AI Chat | Core feature |
| Phase 5: PDF Filling | Core feature |
| Phase 6: UI Polish | Important |
| Phase 7: Testing | Required |
| Phase 8: Deployment | Final step |
