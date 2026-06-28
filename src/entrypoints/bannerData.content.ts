/**
 * @file bannerData.content.ts
 * MAIN-world content script.
 *
 * Runs in the page's own JS context (not the isolated extension world) so it can
 * observe the AJAX calls Banner SSB makes for itself. Georgia Tech's "Browse
 * Classes" grid renders from `/searchResults/searchResults`; we tap those
 * responses read-only and forward (id, course, instructor) tuples to the
 * isolated content script via window.postMessage. The isolated script can't see
 * the page's fetch/XHR, hence this split.
 *
 * We never alter request behavior — only clone/parse completed responses.
 */
import type { BannerSection } from '@/types';

const SEARCH_RESULTS_RE = /\/searchResults\/searchResults/;
const MSG_SOURCE = 'buzzratings:sections';

interface RawFaculty {
  displayName?: string | null;
  emailAddress?: string | null;
  primaryIndicator?: boolean;
}
interface RawSection {
  id?: string | number;
  subject?: string;
  courseNumber?: string;
  faculty?: RawFaculty[];
}

function extractSections(json: unknown): BannerSection[] {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  return (data as RawSection[])
    .map((d): BannerSection | null => {
      if (d?.id == null) return null;
      const faculty = Array.isArray(d.faculty) ? d.faculty : [];
      const primary =
        faculty.find((f) => f && f.primaryIndicator) || faculty[0] || null;
      return {
        id: String(d.id),
        course: d.subject && d.courseNumber ? `${d.subject} ${d.courseNumber}` : null,
        instructorName: primary?.displayName ?? null,
        instructorEmail: primary?.emailAddress ?? null,
      };
    })
    .filter((s): s is BannerSection => s !== null);
}

function post(sections: BannerSection[]): void {
  if (sections.length) {
    window.postMessage({ source: MSG_SOURCE, sections }, window.location.origin);
  }
}

export default defineContentScript({
  matches: ['https://registration.banner.gatech.edu/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    // ── Patch fetch ──
    const origFetch = window.fetch;
    window.fetch = async function (...args: Parameters<typeof fetch>) {
      const res = await origFetch.apply(this, args);
      try {
        const input = args[0] as RequestInfo | URL;
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : (input as Request)?.url;
        if (url && SEARCH_RESULTS_RE.test(url)) {
          res
            .clone()
            .json()
            .then((j) => post(extractSections(j)))
            .catch(() => {});
        }
      } catch {
        /* never break the page's fetch */
      }
      return res;
    };

    // ── Patch XHR (Banner uses jQuery.ajax, i.e. XMLHttpRequest) ──
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequest,
      ...openArgs: unknown[]
    ) {
      (this as unknown as { __bzUrl?: string }).__bzUrl = String(openArgs[1] ?? '');
      // @ts-expect-error pass-through to native open
      return origOpen.apply(this, openArgs);
    };
    XMLHttpRequest.prototype.send = function (
      this: XMLHttpRequest,
      ...sendArgs: unknown[]
    ) {
      this.addEventListener('load', () => {
        try {
          const url = (this as unknown as { __bzUrl?: string }).__bzUrl;
          if (url && SEARCH_RESULTS_RE.test(url) && this.responseText) {
            post(extractSections(JSON.parse(this.responseText)));
          }
        } catch {
          /* ignore non-JSON / parse errors */
        }
      });
      // @ts-expect-error pass-through to native send
      return origSend.apply(this, sendArgs);
    };
  },
});
