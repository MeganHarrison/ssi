// OWLS II (Oral and Written Language Scales, Second Edition) Form Schema
// This schema defines all fields that need to be extracted and filled in the PDF

export interface ClientInfo {
  name: string;
  dateOfBirth: string; // YYYY-MM-DD
  ageYears: number;
  ageMonths: number;
  gender?: 'male' | 'female' | 'other';
  grade?: string;
  school?: string;
}

export interface ExaminerInfo {
  name: string;
  title?: string;
  credentials?: string;
}

export interface TestInfo {
  testDate: string; // YYYY-MM-DD
  formUsed?: string; // Form A or Form B
}

// Score structure for each scale
export interface ScaleScore {
  rawScore?: number;
  standardScore?: number;
  percentileRank?: number;
  ageEquivalent?: string;
  gradeEquivalent?: string;
  confidenceInterval?: {
    lower: number;
    upper: number;
  };
  descriptiveCategory?: 'Exceptional' | 'Above Average' | 'Average' | 'Below Average' | 'Possibly Disordered';
}

// OWLS II has four main scales
export interface OWLSIIScores {
  listeningComprehension?: ScaleScore;
  oralExpression?: ScaleScore;
  readingComprehension?: ScaleScore;
  writtenExpression?: ScaleScore;
}

// Composite scores derived from the four scales
export interface CompositeScores {
  oralLanguage?: ScaleScore; // LC + OE
  writtenLanguage?: ScaleScore; // RC + WE
  receptiveLanguage?: ScaleScore; // LC + RC
  expressiveLanguage?: ScaleScore; // OE + WE
  overallLanguage?: ScaleScore; // All four scales
}

// Complete OWLS II Evaluation
export interface OWLSIIEvaluation {
  id?: string;
  status: 'draft' | 'in_progress' | 'complete';

  // Core information
  client: ClientInfo;
  examiner: ExaminerInfo;
  test: TestInfo;

  // Scores
  scores: OWLSIIScores;
  composites: CompositeScores;

  // Additional observations
  notes?: string;
  recommendations?: string;

  // Behavioral observations during testing
  behavioralObservations?: {
    attention?: string;
    cooperation?: string;
    effort?: string;
    other?: string;
  };

  // Metadata
  createdAt?: string;
  updatedAt?: string;
}

// Fields required for a complete evaluation
export const REQUIRED_FIELDS = [
  'client.name',
  'client.dateOfBirth',
  'examiner.name',
  'test.testDate',
] as const;

// Fields that the AI should try to extract from transcripts
export const EXTRACTABLE_FIELDS = [
  // Client info
  { field: 'client.name', question: "What is the client's full name?" },
  { field: 'client.dateOfBirth', question: "What is the client's date of birth?" },
  { field: 'client.ageYears', question: "What is the client's age in years?" },
  { field: 'client.ageMonths', question: "What is the client's age in months (in addition to years)?" },
  { field: 'client.gender', question: "What is the client's gender?" },
  { field: 'client.grade', question: "What grade is the client in?" },
  { field: 'client.school', question: "What school does the client attend?" },

  // Examiner info
  { field: 'examiner.name', question: "Who conducted this evaluation?" },
  { field: 'examiner.title', question: "What is the examiner's title or credentials?" },

  // Test info
  { field: 'test.testDate', question: "When was this evaluation conducted?" },

  // Listening Comprehension scores
  { field: 'scores.listeningComprehension.rawScore', question: "What was the raw score for Listening Comprehension?" },
  { field: 'scores.listeningComprehension.standardScore', question: "What was the standard score for Listening Comprehension?" },
  { field: 'scores.listeningComprehension.percentileRank', question: "What was the percentile rank for Listening Comprehension?" },

  // Oral Expression scores
  { field: 'scores.oralExpression.rawScore', question: "What was the raw score for Oral Expression?" },
  { field: 'scores.oralExpression.standardScore', question: "What was the standard score for Oral Expression?" },
  { field: 'scores.oralExpression.percentileRank', question: "What was the percentile rank for Oral Expression?" },

  // Reading Comprehension scores
  { field: 'scores.readingComprehension.rawScore', question: "What was the raw score for Reading Comprehension?" },
  { field: 'scores.readingComprehension.standardScore', question: "What was the standard score for Reading Comprehension?" },
  { field: 'scores.readingComprehension.percentileRank', question: "What was the percentile rank for Reading Comprehension?" },

  // Written Expression scores
  { field: 'scores.writtenExpression.rawScore', question: "What was the raw score for Written Expression?" },
  { field: 'scores.writtenExpression.standardScore', question: "What was the standard score for Written Expression?" },
  { field: 'scores.writtenExpression.percentileRank', question: "What was the percentile rank for Written Expression?" },

  // Notes
  { field: 'notes', question: "Are there any additional notes or observations to include?" },
  { field: 'recommendations', question: "What recommendations were made based on this evaluation?" },
] as const;

// Validation rules for scores
export const VALIDATION_RULES = {
  standardScore: { min: 40, max: 160 }, // Standard scores typically range 40-160
  percentileRank: { min: 0, max: 100 },
  ageYears: { min: 3, max: 21 }, // OWLS II is for ages 3-21
  ageMonths: { min: 0, max: 11 },
};

// Helper to get descriptive category from standard score
export function getDescriptiveCategory(standardScore: number): ScaleScore['descriptiveCategory'] {
  if (standardScore >= 130) return 'Exceptional';
  if (standardScore >= 115) return 'Above Average';
  if (standardScore >= 85) return 'Average';
  if (standardScore >= 70) return 'Below Average';
  return 'Possibly Disordered';
}

// Create empty evaluation template
export function createEmptyEvaluation(): OWLSIIEvaluation {
  return {
    status: 'draft',
    client: {
      name: '',
      dateOfBirth: '',
      ageYears: 0,
      ageMonths: 0,
    },
    examiner: {
      name: '',
    },
    test: {
      testDate: '',
    },
    scores: {},
    composites: {},
  };
}
