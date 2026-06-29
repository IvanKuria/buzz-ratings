/**
 * @file photo.ts
 * Best-effort resolution of a Georgia Tech professor headshot.
 *
 * There is no GT-wide photo API (the directory is CAPTCHA-walled; RMP has no
 * photos). Real headshots live on departmental Drupal sites at
 * `https://<dept-host>/people/<first-last>`, served as image-style derivatives
 * under `/sites/default/files/styles/.../public/...`. The filename is arbitrary
 * and there's no og:image, so we fetch the profile HTML and extract the src.
 *
 * Coverage is partial (College of Computing / Sciences are best; engineering
 * schools use other schemes) and many profiles use GT's default "gt-bling"
 * placeholder, which we treat as "no photo" so the UI falls back to initials.
 * The failure mode is a miss, not a wrong face.
 */

/** chrome.storage.local prefix; `cache_` is swept by the clearCache route. */
const PHOTO_CACHE_PREFIX = 'cache_photo_';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const FETCH_TIMEOUT_MS = 8000;

interface PhotoCacheEntry {
  timestamp: number;
  /** Resolved absolute URL, or '' for a cached miss. */
  url: string;
}

/**
 * RMP department text -> GT Drupal faculty host. First match wins. Only
 * departments with a verified `/people/<slug>` Drupal site are listed; add more
 * as they're confirmed.
 */
const DEPT_HOSTS: { match: RegExp; host: string }[] = [
  { match: /comput|^cs$|cse|informatics|cybersecur|machine learning/i, host: 'www.cc.gatech.edu' },
  { match: /math/i, host: 'math.gatech.edu' },
  { match: /physic/i, host: 'physics.gatech.edu' },
  { match: /chemistr|biochem/i, host: 'chemistry.gatech.edu' },
  { match: /biolog|bioscience/i, host: 'biosciences.gatech.edu' },
  { match: /psycholog/i, host: 'psychology.gatech.edu' },
];

/** Strips accents/punctuation; lowercases; spaces -> single hyphens. */
function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Builds the Drupal `/people` slug from a "Last, First" (or "First Last") name.
 * GT slugs are first-name-first and keep every surname token:
 *   "Nagel, Kristine"          -> "kristine-nagel"
 *   "Borela Valente, Rodrigo"  -> "rodrigo-borela-valente"
 */
export function nameToSlug(name: string): string | null {
  if (!name) return null;
  let display = name.trim();
  if (display.includes(',')) {
    const [last, first] = display.split(',', 2).map((p) => p.trim());
    if (!last || !first) return null;
    display = `${first} ${last}`;
  }
  const slug = slugify(display);
  return slug || null;
}

/** Extracts a dept host from a `*.gatech.edu` email (bare gatech.edu -> null). */
function hostFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const m = email.match(/@([a-z0-9.-]+\.gatech\.edu)\s*$/i);
  if (!m) return null;
  const host = m[1].toLowerCase();
  if (host === 'gatech.edu') return null;
  // College of Computing email host is cc.gatech.edu, but its site is www.cc...
  return host === 'cc.gatech.edu' ? 'www.cc.gatech.edu' : host;
}

/** Fetches one faculty page and extracts a real (non-placeholder) headshot URL. */
async function fetchPhotoFromHost(
  host: string,
  slug: string
): Promise<string | null> {
  const pageUrl = `https://${host}/people/${slug}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(pageUrl, { signal: controller.signal });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(
      /\/sites\/default\/files\/styles\/[^"']*?\/public\/[^"']+\.(?:jpe?g|png)[^"']*/i
    );
    if (!m) return null;
    const src = m[0];
    // GT default placeholder -> treat as no photo.
    if (/default_images|gt-bling/i.test(src)) return null;
    return src.startsWith('http') ? src : `https://${host}${src}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const cacheKey = (name: string, email: string | null): string =>
  `${PHOTO_CACHE_PREFIX}${name}|${email || ''}`;

function readCache(key: string): Promise<string | null | undefined> {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        resolve(undefined);
        return;
      }
      chrome.storage.local.get(key, (items) => {
        if (chrome.runtime?.lastError) return resolve(undefined);
        const entry = items?.[key] as PhotoCacheEntry | undefined;
        if (entry && Date.now() - entry.timestamp < TTL_MS) {
          resolve(entry.url); // '' is a cached miss
        } else {
          resolve(undefined);
        }
      });
    } catch {
      resolve(undefined);
    }
  });
}

function writeCache(key: string, url: string): void {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    const entry: PhotoCacheEntry = { timestamp: Date.now(), url };
    chrome.storage.local.set({ [key]: entry });
  } catch {
    /* ignore */
  }
}

/**
 * Resolves a headshot URL for a professor, or null if none is found.
 * Tries the email's department host first, then department-name mapped hosts.
 * Caches both hits and misses.
 */
export async function resolveProfessorPhoto(opts: {
  name: string;
  email: string | null;
  department: string | null;
}): Promise<string | null> {
  const { name, email, department } = opts;
  const slug = nameToSlug(name);
  if (!slug) return null;

  const key = cacheKey(name, email);
  const cached = await readCache(key);
  if (cached !== undefined) return cached || null;

  // Candidate hosts: email-derived first (most specific), then dept-mapped.
  const hosts: string[] = [];
  const emailHost = hostFromEmail(email);
  if (emailHost) hosts.push(emailHost);
  if (department) {
    for (const { match, host } of DEPT_HOSTS) {
      if (match.test(department) && !hosts.includes(host)) hosts.push(host);
    }
  }

  for (const host of hosts) {
    const url = await fetchPhotoFromHost(host, slug);
    if (url) {
      writeCache(key, url);
      return url;
    }
  }

  writeCache(key, ''); // cache the miss
  return null;
}
