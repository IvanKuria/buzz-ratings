# Chrome Web Store listing — BuzzRatings

Copy/paste fields for the Web Store developer dashboard.

## Basics
- **Name:** BuzzRatings
- **Category:** Education
- **Language:** English (United States)
- **Privacy policy URL:** https://ivankuria.github.io/buzz-ratings/privacy.html
- **Homepage URL (optional):** https://ivankuria.github.io/buzz-ratings/

## Summary (132 chars max)
Rate My Professors ratings and grade distributions, right inside Georgia Tech's OSCAR class search.

## Detailed description
BuzzRatings adds professor ratings and historical grade data directly to Georgia
Tech's OSCAR "Browse Classes" page, so you can size up a class without leaving
the page or juggling tabs.

• Inline ratings — every section shows the professor's Rate My Professors score,
  review count, and would-take-again percentage right under the class.
• Side panel profile — click "Details" for the full breakdown: quality,
  difficulty, would-take-again, top tags, and recent student reviews.
• Grade distributions — average GPA and grade breakdown per instructor and
  course, powered by Course Critique.
• Professor photos — best-effort headshots from departmental faculty pages, with
  a clean initials fallback.
• Works on the public class search — no login required.
• Privacy-first — all data is cached locally. No analytics, no tracking, no
  accounts.

BuzzRatings is an independent, student-built project and is not affiliated with,
endorsed by, or sponsored by the Georgia Institute of Technology or Rate My
Professors.

## Single purpose (required)
BuzzRatings has one purpose: to display professor ratings and course grade
information alongside class listings on Georgia Tech's OSCAR class-search pages.

## Permission justifications (required)
- **storage** — cache fetched ratings, grades, and photo URLs locally so repeat
  visits are fast; nothing is sent anywhere.
- **sidePanel** — show the full professor profile (ratings, tags, reviews,
  grades) in Chrome's side panel when the user clicks "Details".
- **Host: registration.banner.gatech.edu** — the extension's content script runs
  here to read the instructor/course names already shown on the class-search
  results and inject the rating bar.
- **Host: www.ratemyprofessors.com** — fetch professor ratings and reviews.
- **Host: c4citk6s9k.execute-api.us-east-1.amazonaws.com** — fetch Georgia Tech
  grade-distribution data from Course Critique's public API.
- **Host: *.gatech.edu** — fetch public departmental faculty pages to find a
  professor's published headshot. (Broad because GT faculty photos are spread
  across ~20 college subdomains; can be narrowed to specific subdomains if
  required.)

## Data usage disclosures (dashboard certifications)
- Does the extension collect user data? **No.**
- Personally identifiable info: **No.** Health: No. Financial: No.
  Authentication: No. Personal communications: No. Location: No. Web history:
  No. User activity: No. Website content: the extension reads instructor/course
  names from the GT class-search page locally to render ratings, but does not
  transmit or store any user-identifying content.
- I certify: data is **not sold** to third parties; **not used** for purposes
  unrelated to the single purpose; **not used** for creditworthiness/lending.

## Required image assets
- Store icon: 128×128 — `public/icons/app/icon-128.png`
- Screenshots (1280×800 or 640×400, at least 1): see `assets/screenshot-*.png`
  (resize/crop to 1280×800 before upload).
- Small promo tile: 440×280 — `store/promo-small-440x280.png`
- Marquee promo (optional): 1400×560 — `store/promo-marquee-1400x560.png`

## Upload artifact
- `.output/buzz-ratings-1.0.0-chrome.zip` (run `npm run zip` to regenerate)
