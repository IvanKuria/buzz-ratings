/**
 * Grade distribution data for the side panel.
 *
 * Source of truth for the *display* shapes (GradeApiResponse / GradeAggregate /
 * GradeDistributionEntry) is src/components/GradeDistribution, which now maps
 * Georgia Tech "Course Critique" data into these shapes.
 *
 * The CourseCritique* types below describe the raw upstream API response from
 * `${base}/course?courseID=<SUBJECT NUMBER>` (e.g. "CS 1331"). The component
 * fetches by course and filters to the requested instructor client-side.
 */

export type LetterGrade =
  | 'A+'
  | 'A'
  | 'A-'
  | 'B+'
  | 'B'
  | 'B-'
  | 'C+'
  | 'C'
  | 'C-'
  | 'D+'
  | 'D'
  | 'D-'
  | 'F';

export type OtherGrade = 'P' | 'NP' | 'S' | 'U' | 'I' | 'W';

export interface GradeAggregate {
  letterGrades: Partial<Record<LetterGrade, number>>;
  otherGrades: Partial<Record<OtherGrade, number>>;
  totalStudents: number;
  gpa: number | null;
}

export interface GradeDistributionEntry extends GradeAggregate {
  quarter: string;
  year: number;
}

export interface GradeApiResponse {
  success: boolean;
  error?: string;
  course?: string;
  matchedInstructor?: string;
  distributions: GradeDistributionEntry[];
  aggregated: GradeAggregate;
}

/** chrome.storage.local cache entry, key `cache_grades_<instructor>_<course>`. */
export interface GradeCacheEntry {
  timestamp: number;
  data: GradeApiResponse;
}

// ── Course Critique (Georgia Tech) raw API shapes ────────────────────────────
// Endpoint: GET `${base}/course?courseID=CS 1331`
// Returns one course with a `raw` array of per-instructor, per-term, per-section
// rows. Grade buckets (A/B/C/D/F/W) are PERCENTAGES (they sum to ~100), not
// counts. There is no per-section student count — only a coarse
// `class_size_group` text bucket. Any numeric field can be null when a term's
// grades have not been posted yet.

/** One header entry describing the course itself. */
export interface CourseCritiqueHeader {
  course_name?: string;
  description?: string;
  credits?: string;
  full_name?: string;
}

/** One per-instructor / per-term / per-section row from the `raw` array. */
export interface CourseCritiqueRow {
  instructor_id: string;
  /** e.g. "Fall 2023", "Spring 2011", "Summer 2020". */
  Term: string;
  /** "Last, First" format, e.g. "Musaev, Aibek". */
  instructor_name: string;
  /** e.g. "Very Large (50 students or more)", "Small (10-20 students)". */
  class_size_group: string;
  GPA: number | null;
  /** Percentage of the class (0-100), not a count. */
  A: number | null;
  B: number | null;
  C: number | null;
  D: number | null;
  F: number | null;
  /** Withdrawal percentage. */
  W: number | null;
}

export interface CourseCritiqueResponse {
  header?: CourseCritiqueHeader[];
  relatedCourses?: unknown;
  raw?: CourseCritiqueRow[];
}
