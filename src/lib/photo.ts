/**
 * @file photo.ts
 * Best-effort resolution of a Georgia Tech professor headshot.
 *
 * GT exposes no public photo/directory API (Drupal JSON:API + REST are disabled
 * site-wide; the directory is reCAPTCHA-walled; BuzzAPI needs credentials). The
 * only source is departmental faculty web pages, which vary by college. This
 * module maps each college to its host + person-page slug pattern(s), fetches
 * the page, and uses DOMParser to pick the real headshot <img> (the rendered
 * src works verbatim — the ?itok= token isn't enforced). GT's default
 * "gt-bling" placeholder is treated as no photo, so the UI falls back to
 * initials. The failure mode is a miss, never a wrong face.
 *
 * Runs in the side panel (a browser context), so DOMParser + fetch with the
 * extension's *.gatech.edu host permission are available.
 */

/** chrome.storage.local prefix; `cache_` is swept by the clearCache route. */
const PHOTO_CACHE_PREFIX = 'cache_photo_';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const FETCH_TIMEOUT_MS = 8000;
const MAX_HOSTS = 3; // cap fetches per professor

interface PhotoCacheEntry {
  timestamp: number;
  /** Resolved absolute URL, or '' for a cached miss. */
  url: string;
}

/**
 * Slug template tokens:
 *   {fl}   first-last  ("Rodrigo Borela Valente" -> rodrigo-borela-valente)
 *   {lf}   last-first  (EAS uses this order)
 *   {last} surname only
 * Hosts with non-derivable slugs (numeric IDs, opaque usernames) are omitted —
 * they'd 404 or need a directory lookup; those professors fall back to initials.
 */
interface DeptSite {
  host: string;
  paths: string[];
  /** email domains that route here (besides the host itself) */
  emailHosts?: string[];
  /** RMP department matcher */
  deptMatch?: RegExp;
  /** host to resolve relative image src against (default: host) */
  imageHost?: string;
}

const SITES: DeptSite[] = [
  // College of Computing
  {
    host: 'www.cc.gatech.edu',
    paths: ['/people/{fl}'],
    emailHosts: ['cc.gatech.edu'],
    deptMatch: /comput|^cs$|cse|informatics|cybersec|machine learning/i,
  },
  // College of Sciences
  { host: 'math.gatech.edu', paths: ['/people/{fl}'], deptMatch: /math/i },
  {
    host: 'chemistry.gatech.edu',
    paths: ['/people/{fl}'],
    deptMatch: /chemistr|biochem/i,
  },
  {
    host: 'biosciences.gatech.edu',
    paths: ['/people/{fl}'],
    emailHosts: ['biology.gatech.edu'],
    deptMatch: /biolog|bioscience|neurosci/i,
  },
  { host: 'physics.gatech.edu', paths: ['/people/{fl}'], deptMatch: /physic/i },
  {
    host: 'eas.gatech.edu',
    paths: ['/people/{lf}', '/people/{fl}'],
    deptMatch: /earth|atmospher|ocean|geoscience|climate/i,
  },
  {
    host: 'psychology.gatech.edu',
    paths: ['/people/{fl}'],
    deptMatch: /psycholog/i,
  },
  // College of Engineering
  {
    host: 'ece.gatech.edu',
    paths: ['/directory/{fl}'],
    deptMatch: /electric|computer eng|^ece$/i,
  },
  {
    host: 'www.me.gatech.edu',
    paths: ['/faculty/{last}', '/faculty/{fl}'],
    emailHosts: ['me.gatech.edu'],
    deptMatch: /mechanical|nuclear|robotics/i,
  },
  {
    host: 'www.ae.gatech.edu',
    paths: ['/directory/person/{fl}'],
    emailHosts: ['ae.gatech.edu', 'aerospace.gatech.edu'],
    deptMatch: /aerospace/i,
  },
  {
    host: 'ce.gatech.edu',
    paths: ['/people/{fl}'],
    deptMatch: /civil|environmental eng/i,
  },
  {
    host: 'www.chbe.gatech.edu',
    paths: ['/directory/person/{fl}'],
    emailHosts: ['chbe.gatech.edu'],
    deptMatch: /chemical|biomolecular/i,
  },
  {
    host: 'bme.gatech.edu',
    paths: ['/bio/{fl}'],
    imageHost: 'gatech.edu',
    deptMatch: /biomedical/i,
  },
  {
    host: 'www.mse.gatech.edu',
    paths: ['/people/{fl}'],
    emailHosts: ['mse.gatech.edu'],
    deptMatch: /material/i,
  },
  {
    host: 'www.isye.gatech.edu',
    paths: ['/users/{fl}'],
    emailHosts: ['isye.gatech.edu'],
    deptMatch: /industrial|systems eng|operations research/i,
  },
  // Scheller College of Business
  {
    host: 'www.scheller.gatech.edu',
    paths: ['/directory/faculty/{last}/index.html'],
    emailHosts: ['scheller.gatech.edu'],
    deptMatch: /business|management|account|finance|marketing|scheller/i,
  },
  // College of Design
  {
    host: 'design.gatech.edu',
    paths: ['/people/{fl}'],
    deptMatch: /architect|building construction|industrial design|music|design/i,
  },
  { host: 'arch.gatech.edu', paths: ['/people/{fl}'], deptMatch: /architect/i },
  {
    host: 'planning.gatech.edu',
    paths: ['/people/{fl}'],
    deptMatch: /city|regional planning|urban/i,
  },
  { host: 'music.gatech.edu', paths: ['/people/{fl}', '/{fl}'], deptMatch: /music/i },
  // Ivan Allen College of Liberal Arts
  {
    host: 'econ.gatech.edu',
    paths: ['/people/person/{fl}'],
    deptMatch: /econ/i,
  },
  {
    host: 'spp.gatech.edu',
    paths: ['/people/person/{fl}'],
    deptMatch: /public policy/i,
  },
  {
    host: 'lmc.gatech.edu',
    paths: ['/people/person/{fl}'],
    deptMatch: /literature|media|communicat|film/i,
  },
  {
    host: 'hsoc.gatech.edu',
    paths: ['/people/person/{fl}'],
    deptMatch: /history|sociolog|anthropolog/i,
  },
  {
    host: 'modlangs.gatech.edu',
    paths: ['/people/person/{fl}'],
    deptMatch: /language|linguist|spanish|french|chinese|german|japanese/i,
  },
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

interface NameParts {
  first: string;
  last: string;
}

/** Parses "Last, First [Middle]" (or "First Last") into first/last. */
function parseName(name: string): NameParts | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (trimmed.includes(',')) {
    const [last, first] = trimmed.split(',', 2).map((p) => p.trim());
    if (!last || !first) return null;
    return { first, last };
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  return { first: tokens[0], last: tokens.slice(1).join(' ') };
}

/** Expands a slug template against a name. */
function buildPath(template: string, parts: NameParts): string {
  const fl = slugify(`${parts.first} ${parts.last}`);
  const lf = slugify(`${parts.last} ${parts.first}`);
  const last = slugify(parts.last);
  return template
    .replace('{fl}', fl)
    .replace('{lf}', lf)
    .replace('{last}', last);
}

/** Extracts a dept email host (bare gatech.edu -> null). */
function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const m = email.match(/@([a-z0-9.-]+\.gatech\.edu)\s*$/i);
  if (!m) return null;
  const host = m[1].toLowerCase();
  return host === 'gatech.edu' ? null : host;
}

const isPlaceholder = (src: string): boolean =>
  /default_images|gt-bling|default-avatar|silhouette/i.test(src);

function absolutize(src: string, host: string): string {
  if (src.startsWith('http')) return src;
  if (src.startsWith('//')) return `https:${src}`;
  return `https://${host}${src.startsWith('/') ? '' : '/'}${src}`;
}

/**
 * Picks the headshot <img> from a faculty page via DOMParser, in priority:
 * styled derivative -> profile/card-classed file image -> any non-logo
 * /sites/default/files (or Scheller /_files/images/directory) image.
 */
function extractPhoto(html: string, imageHost: string): string | null {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return null;
  }
  const imgs = Array.from(doc.querySelectorAll('img'));
  const srcOf = (i: Element): string =>
    i.getAttribute('src') || i.getAttribute('data-src') || '';

  const styled = imgs.find((i) => {
    const s = srcOf(i);
    return /\/sites\/default\/files\/styles\/[^"']+\/public\//i.test(s) && !isPlaceholder(s);
  });
  if (styled) return absolutize(srcOf(styled), imageHost);

  const classed = imgs.find((i) => {
    const s = srcOf(i);
    return (
      /(profile|headshot|portrait|card|people|bio|img-fluid)/i.test(i.className) &&
      /(\/sites\/default\/files\/|\/_files\/images\/directory\/)/i.test(s) &&
      !isPlaceholder(s)
    );
  });
  if (classed) return absolutize(srcOf(classed), imageHost);

  const generic = imgs.find((i) => {
    const s = srcOf(i);
    return (
      /(\/sites\/default\/files\/|\/_files\/images\/directory\/)/i.test(s) &&
      !isPlaceholder(s) &&
      !/logo|icon|banner|header|footer|sprite|favicon/i.test(s)
    );
  });
  return generic ? absolutize(srcOf(generic), imageHost) : null;
}

async function fetchPhoto(site: DeptSite, parts: NameParts): Promise<string | null> {
  for (const template of site.paths) {
    const path = buildPath(template, parts);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`https://${site.host}${path}`, {
        signal: controller.signal,
      });
      if (res.ok) {
        const html = await res.text();
        const url = extractPhoto(html, site.imageHost || site.host);
        if (url) return url;
      }
    } catch {
      /* try next path/host */
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** Ranks the sites to try for this professor (email host first, then dept). */
function candidateSites(
  email: string | null,
  department: string | null
): DeptSite[] {
  const ranked: DeptSite[] = [];
  const domain = emailDomain(email);
  if (domain) {
    const byEmail = SITES.find(
      (s) => s.host === domain || s.host === `www.${domain}` || s.emailHosts?.includes(domain)
    );
    if (byEmail) ranked.push(byEmail);
  }
  if (department) {
    for (const s of SITES) {
      if (s.deptMatch?.test(department) && !ranked.includes(s)) ranked.push(s);
    }
  }
  return ranked.slice(0, MAX_HOSTS);
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
          resolve(entry.url);
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
 * Caches both hits and misses.
 */
export async function resolveProfessorPhoto(opts: {
  name: string;
  email: string | null;
  department: string | null;
}): Promise<string | null> {
  const { name, email, department } = opts;
  const parts = parseName(name);
  if (!parts) return null;

  const key = cacheKey(name, email);
  const cached = await readCache(key);
  if (cached !== undefined) return cached || null;

  const sites = candidateSites(email, department);
  for (const site of sites) {
    const url = await fetchPhoto(site, parts);
    if (url) {
      writeCache(key, url);
      return url;
    }
  }

  writeCache(key, ''); // cache the miss
  return null;
}
