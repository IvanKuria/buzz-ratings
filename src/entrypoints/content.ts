/**
 * @file content.ts
 * WXT content script entrypoint (isolated world).
 *
 * Injects professor rating bars into Georgia Tech's "Browse Classes" results
 * grid (Ellucian Banner SSB). The grid is a FooTable that collapses columns
 * responsively, so instead of scraping shifting cell DOM we join on the stable
 * `tr[data-id]` attribute, which equals the section `id` in Banner's
 * `searchResults` JSON. That JSON is captured by the MAIN-world companion script
 * (bannerData.content.ts) and delivered here via window.postMessage.
 */

import '@/assets/rating-bar.css';
import {
  createMountPoint,
  renderComponent,
  unmountComponent,
  isPlaceholderName,
} from '@/lib/content/shared/mountHelper';
import RatingBar from '@/components/RatingBar';
import type {
  ProfessorData,
  ProfessorBundle,
  FetchProfessorDataResponse,
  BannerSection,
  BannerSectionsMessage,
} from '@/types';

const MSG_SOURCE = 'buzzratings:sections';
const ROW_SELECTOR = '#table1 tbody tr[data-id]';
const PROCESSED_ATTR = 'data-bz-processed';

/** Latest section data keyed by section id (== row data-id). */
const sections = new Map<string, BannerSection>();

/**
 * Asks the background worker for RMP data by name. We pass the 'jdoe' sentinel
 * as the UID so the background skips any campus-directory lookup and keys the
 * RMP cache by name (GT has no campus-directory source).
 */
function fetchProfessorData(name: string): Promise<FetchProfessorDataResponse> {
  return chrome.runtime.sendMessage({
    action: 'fetchProfessorData',
    ID: 'jdoe',
    name,
  });
}

/**
 * Builds a full-width sibling row that holds the rating bar. A dedicated row is
 * resilient to FooTable's responsive column collapsing (the data row may have
 * only the expand cell when narrow) and is keyed back to its section row so we
 * can avoid duplicates and clean up on re-render.
 */
function buildBarRow(sectionId: string): {
  row: HTMLTableRowElement;
  mount: HTMLElement;
} {
  const row = document.createElement('tr');
  row.className = 'rms-bar-row';
  row.setAttribute('data-bz-for', sectionId);
  const td = document.createElement('td');
  td.colSpan = 99; // clamps to the table's real column count
  td.className = 'rms-bar-cell';
  const mount = createMountPoint(td, 'rms-rating-bar-root');
  row.appendChild(td);
  return { row, mount };
}

/**
 * Processes a single results row: resolves its instructor from section data,
 * injects a loading bar, then fills it with RMP data (or removes it if none).
 */
async function processRow(tr: HTMLTableRowElement): Promise<void> {
  const id = tr.getAttribute('data-id');
  if (!id) return;

  const section = sections.get(id);
  // Section data may not have arrived yet; leave the row unmarked so a later
  // scan (triggered when sections post in) can pick it up.
  if (!section) return;

  const name = section.instructorName;
  // Mark processed now so concurrent scans don't double-inject. Placeholder /
  // missing instructors are marked too — nothing to show, never retry.
  tr.setAttribute(PROCESSED_ATTR, '1');
  if (!name || isPlaceholderName(name)) return;

  // Guard against a stale bar row left by a previous pass.
  const existing = tr.parentElement?.querySelector(
    `tr.rms-bar-row[data-bz-for="${CSS.escape(id)}"]`
  );
  if (existing) return;

  const { row, mount } = buildBarRow(id);
  tr.parentElement?.insertBefore(row, tr.nextSibling);
  renderComponent(mount, RatingBar, { professorData: null, loading: true });

  let bundle: ProfessorBundle | null = null;
  try {
    const resp = await fetchProfessorData(name);
    bundle = resp && !('error' in resp) ? resp : null;
  } catch {
    bundle = null;
  }

  // No RMP match -> remove the bar entirely (no empty UI).
  if (!bundle || !bundle.rateMyProfessor) {
    unmountComponent(mount);
    row.remove();
    return;
  }

  const professorData: ProfessorData = {
    apiData: null,
    rateMyProfessor: bundle.rateMyProfessor,
    reviews: bundle.reviews || [],
    localResearchTopic: null,
    localClassesTaught: null,
    instructorName: name,
    course: section.course,
  };
  renderComponent(mount, RatingBar, { professorData, loading: false });
}

/** Scans all unprocessed result rows and processes them. Idempotent. */
function scan(): void {
  const rows = document.querySelectorAll<HTMLTableRowElement>(ROW_SELECTOR);
  rows.forEach((tr) => {
    if (tr.getAttribute(PROCESSED_ATTR)) return;
    void processRow(tr);
  });
}

export default defineContentScript({
  matches: ['https://registration.banner.gatech.edu/*'],
  runAt: 'document_start',
  cssInjectionMode: 'manifest',

  main() {
    // Receive section data from the MAIN-world interceptor.
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as Partial<BannerSectionsMessage> | null;
      if (!data || data.source !== MSG_SOURCE || !Array.isArray(data.sections)) {
        return;
      }
      for (const s of data.sections) {
        if (s?.id) sections.set(s.id, s);
      }
      scan();
    });

    // Re-scan as the FooTable renders / re-renders (search, sort, paginate).
    // FooTable rebuilds tbody on those actions, dropping our bar rows and the
    // PROCESSED_ATTR markers, so scan() re-injects. scan() ignores our own
    // injected rows (they have no data-id), so this never loops.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(scan, 150);
    });

    const start = () => {
      observer.observe(document.body, { childList: true, subtree: true });
      scan();
    };
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
  },
});
