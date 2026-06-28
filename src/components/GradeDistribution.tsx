import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { GRADES_CACHE_PREFIX } from '@/lib/constants';
import { logger } from '@/lib/logger';
import type {
  GradeApiResponse,
  GradeAggregate,
  GradeCacheEntry,
  GradeDistributionEntry,
  LetterGrade,
  CourseCritiqueResponse,
  CourseCritiqueRow,
} from '@/types';

// Georgia Tech "Course Critique" public API (Georgia Tech SGA). Data is
// course-scoped; we fetch a whole course and filter to the requested
// instructor client-side. The manifest grants host_permission for this origin,
// so the side panel can call it directly.
const API_BASE_URL =
  'https://c4citk6s9k.execute-api.us-east-1.amazonaws.com/prod/data';

const GRADE_COLORS: Record<string, string> = {
  'A+': '#22c55e',
  A: '#22c55e',
  'A-': '#4ade80',
  'B+': '#84cc16',
  B: '#a3e635',
  'B-': '#bef264',
  'C+': '#facc15',
  C: '#fbbf24',
  'C-': '#f59e0b',
  'D+': '#fb923c',
  D: '#f97316',
  'D-': '#ea580c',
  F: '#ef4444',
};

// ── Cache config ─────────────────────────────────────────────────────────────
// Successful responses are cached in chrome.storage.local under keys prefixed
// with `cache_` so the existing background `clearCache` route (which removes any
// key starting with `cache_`) wipes them when the user clears data.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FETCH_TIMEOUT_MS = 12000; // API Gateway can be slow on cold paths

type GradeStatus = 'loading' | 'success' | 'error' | 'not_found' | 'no_data';

// Display shape after defensive defaults are applied; grade maps are guaranteed
// to be plain number records (never undefined-valued or missing).
interface GradeDisplayData {
  totalStudents: number;
  gpa: number | null;
  letterGrades: Record<string, number>;
  otherGrades: Record<string, number>;
}

interface GradeDistributionProps {
  instructorName: string;
  course: string | null;
}

const cacheKeyFor = (instructor: string, course: string | null): string =>
  `${GRADES_CACHE_PREFIX}${instructor || ''}_${course || ''}`;

const readCache = (key: string): Promise<GradeApiResponse | null> =>
  new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        resolve(null);
        return;
      }
      chrome.storage.local.get(key, (items) => {
        if (chrome.runtime?.lastError) {
          resolve(null);
          return;
        }
        const entry = items?.[key] as GradeCacheEntry | undefined;
        if (
          entry &&
          entry.timestamp &&
          Date.now() - entry.timestamp < CACHE_TTL_MS
        ) {
          resolve(entry.data);
        } else {
          resolve(null);
        }
      });
    } catch {
      resolve(null);
    }
  });

const writeCache = (key: string, data: GradeApiResponse): void => {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    const entry: GradeCacheEntry = { timestamp: Date.now(), data };
    chrome.storage.local.set({ [key]: entry });
  } catch {
    /* ignore cache write failures */
  }
};

const GradeDistribution = ({
  instructorName,
  course,
}: GradeDistributionProps) => {
  const [status, setStatus] = useState<GradeStatus>('loading');
  const [data, setData] = useState<GradeApiResponse | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState<string>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');

  useEffect(() => {
    // Reset on every instructor/course change so a previous professor's chart
    // does not linger while the new one loads.
    let cancelled = false;
    setStatus('loading');
    setData(null);
    setSelectedQuarter('ALL');
    setSelectedYear('ALL');

    if (!instructorName) {
      setStatus('no_data');
      return;
    }

    // Course Critique is keyed by course; without one we cannot fetch grades.
    if (!course) {
      setStatus('no_data');
      return;
    }
    const courseId = course; // narrowed to string for use inside the closure

    const cacheKey = cacheKeyFor(instructorName, courseId);

    // Single attempt with an AbortController-based timeout. We fetch the whole
    // course from Course Critique, then map + filter to this instructor.
    const attemptFetch = async (): Promise<GradeApiResponse> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const url = `${API_BASE_URL}/course?courseID=${encodeURIComponent(
          courseId
        )}`;
        const response = await fetch(url, { signal: controller.signal });

        // Treat HTTP errors as transient so the retry / error-state path runs
        // instead of being misreported as "instructor not found".
        if (!response.ok) {
          throw new Error(`Course Critique HTTP ${response.status}`);
        }

        const ccData = (await response.json()) as CourseCritiqueResponse;

        // A missing `raw` array means a malformed / error payload (the API
        // returns `{ message: ... }` on failure) — retry rather than show
        // "no data". An empty array is a legitimate "course has no rows".
        if (!Array.isArray(ccData.raw)) {
          throw new Error('Course Critique returned no raw data');
        }

        return mapCourseCritique(ccData, instructorName, courseId);
      } finally {
        clearTimeout(timer);
      }
    };

    const fetchGrades = async () => {
      // Serve fresh cache immediately (covers cold-start / outage).
      const cached = await readCache(cacheKey);
      if (cancelled) return;
      if (cached) {
        if (cached.success) {
          setData(cached);
          setStatus('success');
        }
        // If cache holds a non-success payload we still try the network below.
      }

      // Try network, with ONE retry on failure/timeout.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await attemptFetch();
          if (cancelled) return; // discard out-of-order / stale response

          if (result.success) {
            writeCache(cacheKey, result);
            setData(result);
            setStatus('success');
          } else {
            setStatus(
              result.error === 'instructor_not_found' ? 'not_found' : 'no_data'
            );
          }
          return;
        } catch (error) {
          if (cancelled) return;
          logger.error(
            `Error fetching grade data (attempt ${attempt + 1}):`,
            error
          );
          // Loop will retry once; on final failure fall through.
        }
      }

      if (cancelled) return;
      // If we already painted something usable from cache, keep it.
      if (!(cached && cached.success)) {
        setStatus('error');
      }
    };

    fetchGrades();

    return () => {
      cancelled = true;
    };
  }, [instructorName, course]);

  if (status === 'loading') {
    return (
      <div className="grade-dist-section">
        <div className="grade-dist-loading">Loading grade distribution...</div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="grade-dist-section">
        <h4 className="grade-dist-title">Grade Distribution</h4>
        <div className="grade-dist-error" role="alert">
          Grade data is temporarily unavailable, try again.
        </div>
      </div>
    );
  }

  if (status === 'not_found' || status === 'no_data') {
    return (
      <div className="grade-dist-section">
        <h4 className="grade-dist-title">Grade Distribution</h4>
        <div className="grade-dist-empty">
          No grade distribution data available for this instructor and course
          combination.
        </div>
      </div>
    );
  }

  // status === 'success' guarantees data is set; this guard satisfies strict.
  if (!data) return null;

  const { distributions: rawDistributions, aggregated } = data;
  // Guard against the server omitting the distributions array.
  const distributions = Array.isArray(rawDistributions) ? rawDistributions : [];

  // Get unique quarters and years for filters
  const quarters = [...new Set(distributions.map((d) => d.quarter))];
  const years = [...new Set(distributions.map((d) => d.year))].sort(
    (a, b) => b - a
  );

  // Filter distributions based on selection
  const filteredDistributions = distributions.filter((d) => {
    if (selectedQuarter !== 'ALL' && d.quarter !== selectedQuarter)
      return false;
    if (selectedYear !== 'ALL' && d.year !== parseInt(selectedYear))
      return false;
    return true;
  });

  // Aggregate filtered data or use overall if showing all
  const rawDisplayData: GradeAggregate =
    selectedQuarter === 'ALL' && selectedYear === 'ALL'
      ? aggregated
      : aggregateFiltered(filteredDistributions);

  // Defensive defaults: the server may omit fields. Never iterate undefined.
  const displayData: GradeDisplayData = {
    totalStudents: rawDisplayData?.totalStudents ?? 0,
    gpa: rawDisplayData?.gpa ?? null,
    letterGrades: (rawDisplayData?.letterGrades || {}) as Record<
      string,
      number
    >,
    otherGrades: (rawDisplayData?.otherGrades || {}) as Record<string, number>,
  };

  // Convert to chart format
  const chartData = Object.entries(displayData.letterGrades).map(
    ([grade, count]) => ({
      grade,
      count,
      color: GRADE_COLORS[grade],
    })
  );

  const totalLetterGrades = Object.values(displayData.letterGrades).reduce(
    (a, b) => a + b,
    0
  );

  // Screen-reader summary of the (otherwise opaque) SVG bar chart.
  const chartAriaSummary =
    chartData.length > 0
      ? `Grade distribution: ${chartData
          .map(
            ({ grade, count }) =>
              `${grade}, ${count} student${count === 1 ? '' : 's'}`
          )
          .join('; ')}. Total ${totalLetterGrades} letter grades.`
      : 'No grade distribution data to display.';

  return (
    <div className="grade-dist-section">
      <header className="grade-dist-header">
        <h4 className="grade-dist-title">Grade Distribution</h4>
        {data.course && (
          <span className="grade-dist-course">{data.course}</span>
        )}
      </header>

      {/* Per-term data is available from Course Critique, so the term/year
          filters are meaningful. Hide them gracefully when there is only a
          single term (or none) to avoid showing one-option dropdowns. */}
      {distributions.length > 1 && (
        <div className="grade-dist-filters">
          <div className="grade-dist-filter">
            <label htmlFor="quarter-filter">Term</label>
            <select
              id="quarter-filter"
              value={selectedQuarter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setSelectedQuarter(e.target.value)
              }
            >
              <option value="ALL">All</option>
              {quarters.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </div>
          <div className="grade-dist-filter">
            <label htmlFor="year-filter">Year</label>
            <select
              id="year-filter"
              value={selectedYear}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setSelectedYear(e.target.value)
              }
            >
              <option value="ALL">All</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {filteredDistributions.length === 0 ? (
        <div className="grade-dist-empty">
          No grade data for the selected filters.
        </div>
      ) : (
        <>
          <div
            className="grade-dist-chart"
            role="img"
            aria-label={chartAriaSummary}
          >
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <XAxis dataKey="grade" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value) => [
                    `${value as number} students (${(((value as number) / totalLetterGrades) * 100).toFixed(1)}%)`,
                    'Count',
                  ]}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grade-dist-stats">
            <div className="grade-dist-stat">
              <span className="grade-dist-stat-label">Avg GPA</span>
              <span className="grade-dist-stat-value">
                {displayData.gpa?.toFixed(2) || 'N/A'}
              </span>
            </div>
            <div className="grade-dist-stat">
              <span className="grade-dist-stat-label">Total</span>
              <span className="grade-dist-stat-value">
                {displayData.totalStudents} students
              </span>
            </div>
          </div>

          {Object.keys(displayData.otherGrades).length > 0 && (
            <div className="grade-dist-other">
              <span className="grade-dist-other-label">Other:</span>
              {Object.entries(displayData.otherGrades).map(([grade, count]) => (
                <span key={grade} className="grade-dist-other-item">
                  {grade}: {count}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ── Course Critique mapping ──────────────────────────────────────────────────
// Course Critique returns per-instructor / per-term / per-section rows where the
// grade buckets are PERCENTAGES (not counts) and there is no exact student
// count — only a coarse `class_size_group` text bucket. To feed the existing
// count-based display logic, we estimate a class size per section and synthesize
// integer counts from each percentage. Counts stay additive, so the component's
// own quarter/year re-aggregation keeps working.

// The five letter buckets Course Critique reports (no +/- breakdown exists).
// Narrower than LetterGrade so it also indexes CourseCritiqueRow safely.
type CcLetter = 'A' | 'B' | 'C' | 'D' | 'F';
const CC_LETTERS: CcLetter[] = ['A', 'B', 'C', 'D', 'F'];

/**
 * Map a `class_size_group` label to a representative student count. Labels carry
 * the numeric range (e.g. "Small (10-20 students)"); we use the midpoint. The
 * case varies upstream ("Mid-Size" vs "Mid-size"), so we match on the digits.
 */
function estimateClassSize(group: string | null | undefined): number {
  const g = (group || '').toLowerCase();
  if (g.includes('fewer than 10')) return 5;
  if (g.includes('10-20')) return 15;
  if (g.includes('21-30')) return 25;
  if (g.includes('31-49')) return 40;
  if (g.includes('50')) return 65; // "50 students or more"
  return 25; // sensible default when the bucket is unrecognized
}

/** Split "Fall 2023" into a quarter/season label and a numeric year. */
function parseTerm(term: string): { quarter: string; year: number } {
  const parts = (term || '').trim().split(/\s+/);
  const year = parseInt(parts[parts.length - 1], 10);
  const quarter = parts.slice(0, -1).join(' ') || term || '';
  return { quarter, year: Number.isNaN(year) ? 0 : year };
}

/** A row is usable for the distribution only if it has at least one grade %. */
function rowHasGrades(row: CourseCritiqueRow): boolean {
  return CC_LETTERS.some((g) => row[g] != null) || row.W != null;
}

/**
 * Reduce a set of Course Critique rows into a single GradeAggregate. Counts are
 * synthesized from `percentage * estimatedClassSize`; GPA is the class-size-
 * weighted average of the per-section GPAs Course Critique reports (which is
 * more accurate than recomputing from the coarse buckets).
 */
function buildAggregate(rows: CourseCritiqueRow[]): GradeAggregate {
  const letterGrades: Partial<Record<LetterGrade, number>> = {};
  for (const g of CC_LETTERS) letterGrades[g] = 0;

  let withdrawals = 0;
  let totalStudents = 0;
  let gpaWeightedSum = 0;
  let gpaWeight = 0;

  for (const row of rows) {
    if (!rowHasGrades(row)) continue;
    const size = estimateClassSize(row.class_size_group);
    totalStudents += size;

    for (const g of CC_LETTERS) {
      const pct = row[g] ?? 0;
      letterGrades[g] = (letterGrades[g] ?? 0) + Math.round((pct / 100) * size);
    }
    withdrawals += Math.round(((row.W ?? 0) / 100) * size);

    if (row.GPA != null) {
      gpaWeightedSum += row.GPA * size;
      gpaWeight += size;
    }
  }

  const otherGrades: Partial<Record<'W', number>> = {};
  if (withdrawals > 0) otherGrades.W = withdrawals;

  const gpa =
    gpaWeight > 0 ? Math.round((gpaWeightedSum / gpaWeight) * 100) / 100 : null;

  return { letterGrades, otherGrades, totalStudents, gpa };
}

/** Last name + first initial extracted from a name in either order. */
interface ParsedName {
  last: string;
  initial: string;
}

/**
 * Parse a name into last name + first initial. Handles both "Last, First"
 * (Course Critique and our caller's format) and "First Last". Non-letter
 * characters are stripped so accents/hyphens/periods don't break matching.
 */
function parseName(name: string): ParsedName {
  const normalize = (s: string): string =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^a-z]/g, '');
  const trimmed = (name || '').replace(/\s+/g, ' ').trim();

  if (trimmed.includes(',')) {
    const [lastRaw, firstRaw] = trimmed.split(',', 2).map((p) => p.trim());
    return {
      last: normalize(lastRaw),
      initial: (firstRaw.match(/[a-zA-Z]/)?.[0] || '').toLowerCase(),
    };
  }

  const parts = trimmed.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return {
      last: normalize(parts[parts.length - 1]),
      initial: (parts[0].match(/[a-zA-Z]/)?.[0] || '').toLowerCase(),
    };
  }
  return { last: normalize(trimmed), initial: '' };
}

/**
 * Robust instructor match on last name + first initial. If both sides expose a
 * first initial they must agree; otherwise a last-name match is accepted.
 */
function instructorMatches(target: string, candidate: string): boolean {
  const a = parseName(target);
  const b = parseName(candidate);
  if (!a.last || !b.last || a.last !== b.last) return false;
  if (a.initial && b.initial) return a.initial === b.initial;
  return true;
}

/**
 * Map a Course Critique course response, filtered to a single instructor, into
 * the component's display shape. Produces one per-term distribution entry plus
 * an overall aggregate. Returns a `success: false` payload (mirroring the old
 * server contract) when the instructor isn't found or has no usable grade data.
 */
function mapCourseCritique(
  data: CourseCritiqueResponse,
  instructorName: string,
  course: string
): GradeApiResponse {
  const rows = Array.isArray(data.raw) ? data.raw : [];
  const courseLabel = data.header?.[0]?.full_name || course;

  // Filter to this instructor.
  const instructorRows = rows.filter((r) =>
    instructorMatches(instructorName, r.instructor_name)
  );
  if (instructorRows.length === 0) {
    return {
      success: false,
      error: 'instructor_not_found',
      course: courseLabel,
      distributions: [],
      aggregated: { letterGrades: {}, otherGrades: {}, totalStudents: 0, gpa: null },
    };
  }

  // Keep only rows that actually carry grade data (drop not-yet-posted terms).
  const usableRows = instructorRows.filter(rowHasGrades);
  if (usableRows.length === 0) {
    return {
      success: false,
      error: 'no_data',
      course: courseLabel,
      distributions: [],
      aggregated: { letterGrades: {}, otherGrades: {}, totalStudents: 0, gpa: null },
    };
  }

  // Group rows by term, then aggregate each term's sections.
  const byTerm = new Map<string, CourseCritiqueRow[]>();
  for (const row of usableRows) {
    const bucket = byTerm.get(row.Term);
    if (bucket) bucket.push(row);
    else byTerm.set(row.Term, [row]);
  }

  const distributions: GradeDistributionEntry[] = [];
  for (const [term, termRows] of byTerm) {
    const { quarter, year } = parseTerm(term);
    distributions.push({ ...buildAggregate(termRows), quarter, year });
  }

  // Most-recent term first.
  distributions.sort((a, b) => b.year - a.year);

  return {
    success: true,
    course: courseLabel,
    matchedInstructor: usableRows[0].instructor_name,
    distributions,
    aggregated: buildAggregate(usableRows),
  };
}

// Helper to aggregate filtered distributions
function aggregateFiltered(
  distributions: GradeDistributionEntry[]
): GradeAggregate {
  if (distributions.length === 0) {
    return { letterGrades: {}, otherGrades: {}, totalStudents: 0, gpa: null };
  }

  if (distributions.length === 1) {
    return {
      letterGrades: distributions[0].letterGrades || {},
      otherGrades: distributions[0].otherGrades || {},
      totalStudents: distributions[0].totalStudents || 0,
      gpa: distributions[0].gpa ?? null,
    };
  }

  const letterGrades: Record<string, number> = {};
  const otherGrades: Record<string, number> = {};
  const gradeKeys = [
    'A+',
    'A',
    'A-',
    'B+',
    'B',
    'B-',
    'C+',
    'C',
    'C-',
    'D+',
    'D',
    'D-',
    'F',
  ];
  const otherKeys = ['P', 'NP', 'S', 'U', 'I', 'W'];

  for (const key of gradeKeys) {
    letterGrades[key] = 0;
  }

  for (const dist of distributions) {
    const distLetter = (dist.letterGrades || {}) as Record<string, number>;
    const distOther = (dist.otherGrades || {}) as Record<string, number>;
    for (const key of gradeKeys) {
      letterGrades[key] += distLetter[key] || 0;
    }
    for (const key of otherKeys) {
      if (distOther[key]) {
        otherGrades[key] = (otherGrades[key] || 0) + distOther[key];
      }
    }
  }

  const totalStudents =
    Object.values(letterGrades).reduce((a, b) => a + b, 0) +
    Object.values(otherGrades).reduce((a, b) => a + b, 0);

  // Calculate weighted GPA
  const gradePoints: Record<string, number> = {
    'A+': 4.0,
    A: 4.0,
    'A-': 3.7,
    'B+': 3.3,
    B: 3.0,
    'B-': 2.7,
    'C+': 2.3,
    C: 2.0,
    'C-': 1.7,
    'D+': 1.3,
    D: 1.0,
    'D-': 0.7,
    F: 0.0,
  };

  let totalPoints = 0;
  let gradeCount = 0;
  for (const [grade, count] of Object.entries(letterGrades)) {
    if (gradePoints[grade] !== undefined && count > 0) {
      totalPoints += gradePoints[grade] * count;
      gradeCount += count;
    }
  }

  const gpa =
    gradeCount > 0 ? Math.round((totalPoints / gradeCount) * 100) / 100 : null;

  return { letterGrades, otherGrades, totalStudents, gpa };
}

export default GradeDistribution;
