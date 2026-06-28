/**
 * A single class section distilled from Georgia Tech's Banner SSB
 * `searchResults` JSON. `id` matches the rendered `tr[data-id]` in the results
 * grid, which is how the content script joins data to DOM rows.
 */
export interface BannerSection {
  /** Section id; equals the results-row `data-id` attribute. */
  id: string;
  /** Course code, e.g. "CS 1100". Null when subject/number are absent. */
  course: string | null;
  /** Primary instructor as "Last, First". Null for staff/unassigned. */
  instructorName: string | null;
  /** Primary instructor gatech.edu email, when Banner exposes it. */
  instructorEmail: string | null;
}

/** window.postMessage payload sent from the MAIN-world interceptor. */
export interface BannerSectionsMessage {
  source: 'buzzratings:sections';
  sections: BannerSection[];
}
