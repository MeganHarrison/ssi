-- SSI Evaluation Tables for OWLS II Form Filling App

-- Evaluations table - stores the main evaluation data
CREATE TABLE IF NOT EXISTS evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'complete')),

  -- Client Information
  client_name TEXT,
  client_dob DATE,
  client_age_years INTEGER,
  client_age_months INTEGER,
  client_gender TEXT,
  client_grade TEXT,
  client_school TEXT,

  -- Examiner Information
  examiner_name TEXT,
  examiner_title TEXT,

  -- Test Information
  test_date DATE,

  -- OWLS II Scores (stored as JSONB for flexibility)
  listening_comprehension JSONB,
  oral_expression JSONB,
  reading_comprehension JSONB,
  written_expression JSONB,
  composite_scores JSONB,

  -- Notes and observations
  notes TEXT,
  recommendations TEXT,

  -- Complete form data as JSON backup
  form_data JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transcripts table - stores voice memo transcripts
CREATE TABLE IF NOT EXISTS transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID REFERENCES evaluations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source TEXT DEFAULT 'paste' CHECK (source IN ('upload', 'paste', 'audio')),
  original_filename TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages table - stores AI conversation history
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID REFERENCES evaluations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  trusted BOOLEAN NOT NULL DEFAULT FALSE,
  extracted_data JSONB, -- Data extracted from this message
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for evaluations
CREATE POLICY "Users can view their own evaluations"
  ON evaluations FOR SELECT
  USING (auth.uid() = owner);

CREATE POLICY "Users can create their own evaluations"
  ON evaluations FOR INSERT
  WITH CHECK (auth.uid() = owner);

CREATE POLICY "Users can update their own evaluations"
  ON evaluations FOR UPDATE
  USING (auth.uid() = owner);

CREATE POLICY "Users can delete their own evaluations"
  ON evaluations FOR DELETE
  USING (auth.uid() = owner);

-- RLS Policies for transcripts (via evaluation ownership)
CREATE POLICY "Users can view transcripts of their evaluations"
  ON transcripts FOR SELECT
  USING (evaluation_id IN (SELECT id FROM evaluations WHERE owner = auth.uid()));

CREATE POLICY "Users can create transcripts for their evaluations"
  ON transcripts FOR INSERT
  WITH CHECK (evaluation_id IN (SELECT id FROM evaluations WHERE owner = auth.uid()));

CREATE POLICY "Users can update transcripts of their evaluations"
  ON transcripts FOR UPDATE
  USING (evaluation_id IN (SELECT id FROM evaluations WHERE owner = auth.uid()));

CREATE POLICY "Users can delete transcripts of their evaluations"
  ON transcripts FOR DELETE
  USING (evaluation_id IN (SELECT id FROM evaluations WHERE owner = auth.uid()));

-- RLS Policies for chat_messages (via evaluation ownership)
CREATE POLICY "Users can view chat messages of their evaluations"
  ON chat_messages FOR SELECT
  USING (evaluation_id IN (SELECT id FROM evaluations WHERE owner = auth.uid()));

CREATE POLICY "Users can create chat messages for their evaluations"
  ON chat_messages FOR INSERT
  WITH CHECK (
    role = 'user'
    AND trusted = FALSE
    AND char_length(content) <= 24000
    AND evaluation_id IN (SELECT id FROM evaluations WHERE owner = auth.uid())
  );

-- Grant permissions
GRANT ALL ON evaluations TO authenticated;
GRANT ALL ON transcripts TO authenticated;
GRANT ALL ON chat_messages TO authenticated;

-- Create indexes for better query performance
CREATE INDEX idx_evaluations_owner ON evaluations(owner);
CREATE INDEX idx_evaluations_status ON evaluations(status);
CREATE INDEX idx_transcripts_evaluation ON transcripts(evaluation_id);
CREATE INDEX idx_chat_messages_evaluation ON chat_messages(evaluation_id);
