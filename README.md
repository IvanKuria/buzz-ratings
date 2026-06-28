<div align="center">

<img src="assets/buzzratings-icon.png" alt="BuzzRatings icon" width="120" height="120" />

# BuzzRatings

Rate My Professors ratings and grade distributions, shown right where you browse Georgia Tech courses on OSCAR.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-success.svg)](https://github.com/IvanKuria/buzz-ratings/releases)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Built with WXT](https://img.shields.io/badge/built%20with-WXT-67217A.svg)](https://wxt.dev)

</div>

## Overview

BuzzRatings is a Chrome extension for Georgia Tech students. It pulls Rate My Professors ratings and historical grade distributions directly into the OSCAR "Browse Classes" experience, so you can size up a class without leaving the page or juggling browser tabs.

It works on GT's public class search — no login required — so you can browse and compare instructors before you ever sign in to register.

## Features

- **Inline ratings.** Every section in the Browse Classes results gets a rating bar showing the professor's Rate My Professors score, review count, and would-retake percentage.
- **Grade distributions.** View historical grade breakdowns and average GPA per instructor and course, powered by [Course Critique](https://critique.gatech.edu).
- **Professor profiles.** Click "Details" to open a side panel with the full Rate My Professors profile: quality, difficulty, would-take-again, top tags, and recent reviews.
- **Smart matching.** Multi-strategy name matching handles Banner's "Last, First" instructor format and resolves it against the right RMP professor.
- **Fast.** Lazy-loaded modules and one-week caching keep repeat visits instant.
- **Privacy first.** All cached data is stored locally. No analytics, no tracking, no data collection.

## How It Works

Open OSCAR → **Browse Classes**, pick a term, and run a search. BuzzRatings detects each class section and renders an inline rating bar beneath it:

```
★ 4.4 (33)    85% would retake    Details ->
```

Click **Details** to open the side panel with the full professor profile, including Rate My Professors reviews, department, and the Course Critique grade distribution.

> Browse Classes is publicly accessible at
> `registration.banner.gatech.edu` without signing in, so BuzzRatings works for prospective students and during open browsing — not just inside registration.

## Install

> Not yet on the Chrome Web Store. Manual install for now:

1. Clone or download this repo.
2. Run `npm install && npm run build`.
3. Open `chrome://extensions/` and enable **Developer mode**.
4. Click **Load unpacked** and select the `.output/chrome-mv3` folder.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [WXT](https://wxt.dev) (Vite-based extension framework) |
| UI | React 18, Tailwind CSS, [shadcn/ui](https://ui.shadcn.com) |
| Charts | [Recharts](https://recharts.org) |
| Animation | [Framer Motion](https://motion.dev) |
| Search | [Fuse.js](https://fusejs.io) (fuzzy name matching) |
| APIs | Rate My Professors GraphQL, Course Critique |
| Extension | Chrome Manifest V3, Side Panel API |

## Development

```bash
git clone https://github.com/IvanKuria/buzz-ratings.git
cd buzz-ratings
npm install
npm run dev
```

Then load `.output/chrome-mv3-dev` as an unpacked extension in Chrome.

## Architecture

Georgia Tech's class search runs on Ellucian Banner SSB — a single-page app that renders results from a JSON endpoint into a responsive (FooTable) grid. Rather than scrape the shifting table cells, BuzzRatings taps the data the page already loads and joins it to rows by their stable `data-id`.

```
MAIN-world script         Content script (isolated)      Background SW              Side Panel
-----------------         -------------------------      ------------              ----------
Tap searchResults JSON -> Join JSON id -> tr[data-id] -> Fetch RMP (GraphQL)   -> Professor profile
(instructor, course)      Inject rating bar per row      Match best professor      Grade distribution
                          Open side panel on "Details" -> Cache in storage         Reviews carousel
```

- **MAIN-world interceptor** (`bannerData.content.ts`) runs in the page context to read Banner's own `searchResults` responses (read-only) and forwards each section's instructor + course to the content script.
- **Content script** (`content.ts`, isolated world) joins that data to result rows by `data-id` and renders the inline rating bar — independent of how FooTable collapses columns.
- **Background service worker** handles Rate My Professors GraphQL calls, name matching, and caching.
- **Side panel** displays the full professor profile, including the Course Critique grade distribution, when "Details" is clicked.

## Privacy

- All cached data is stored locally in `chrome.storage.local`.
- No analytics or telemetry.
- Network requests go only to `ratemyprofessors.com` and the Course Critique API.
- Permissions are scoped to `registration.banner.gatech.edu`.

## Credits

Grade distribution data comes from [Course Critique](https://critique.gatech.edu), maintained by GT's Student Government Association. Adapted from [Rate My Slugs](https://github.com/IvanKuria/rate-my-slugs) (UC Santa Cruz).

## License

MIT. See [LICENSE](LICENSE) for details.
</content>
