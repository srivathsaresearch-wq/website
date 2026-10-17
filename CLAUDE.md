# Research by Srivathsa: website

Static, ten-page marketing and education site for **researchbysrivathsa.com**, an India-focused investor-education brand. Plain HTML, one CSS file, a few small vanilla JS files. No framework, no build step. Hosted on GitHub Pages.

Read `HANDOFF.md` for what is done, what is still a placeholder, and the launch checklist. `README.md` covers deploy; `backend-notes.md` covers forms, payments and bookings.

## Audience (design for them first)
- First-time investors in India, salaried, roughly ₹3–4 lakh a year.
- Mostly on phones, often on slow mobile data. Many are nervous about money.
- Calm, clear, plain-spoken. One idea per screen. Never salesy.

## Compliance rules (non-negotiable)
These override any copy or design request. If a request conflicts, stop and ask.
1. **Educational content only.** No personalised advice, no buy/sell/hold calls, no single-stock or single-fund names, no promised or implied returns. This includes one-year support (`support.html`, ₹3,000 a year): it is education too (email questions about how things work, and a monthly members' Q&A call), never advice or portfolio reviews. It was switched on at the client's request on 17 October 2026 (`SUPPORT_ENABLED: true` in `config.js`); set it to false to go back to "register interest".
2. **No fake proof.** No invented testimonials, student counts, ratings, "as seen in", or any number that isn't real and sourced. Real feedback lives in `testimonials.json` and shows only when `consent` and `verified` are both true: first name, rating and the feedback exactly as the client supplied it (no surnames or initials, job titles, photos, outcomes or extra words). `"show": false` keeps an entry on file but hidden. Only show feedback that matches what the class actually covers, and never "impact" or results claims. The current entries are summaries, so the label reads "Feedback from our pilot session, summarised. Individual experiences vary." The quotes from Surya (mentions tax-efficient drawdown) and Suraj (mentions investing a first salary) go beyond the class outline; the client chose to show them as written on 17 October 2026, so don't hide them without asking.
3. **Claims must be true and verified.** Do not add team size, credentials (CFA, CA, etc.) or experience unless the client has confirmed them in writing. Verified today (client's written confirmation): the founder is a CFA charterholder and investment strategist; the team has experience handling billions of dollars for institutional clients, and has worked with retail investors for the last five years (as of October 2026). Don't add figures, firm names or returns to that claim.
4. **No SEBI, licence or registration mentions anywhere on the site**, by the client's instruction: no registration numbers, no "check the licence" content, no FAQ about registration, and never state or imply any registration.
5. **Every number shown needs a source and a date.** Use the chart template on `learn.html` (`figure.chart` with `.source`, showing Source and Data as of). Illustrations carry the `.tag-illus` label "Illustration, not real data" and show no figures.
6. **Footer disclaimer on every page**, exact text: "Educational content only. Not investment advice. Investments carry risk, including loss of capital." Replace it only with lawyer-approved wording.
7. **Voice is "we"** (a research team), never "I". UK spelling. **No personal names** anywhere (pages, code comments, metadata, schema, commit messages) except the brand wordmark "Research by Srivathsa" and the first names in `testimonials.json`. Stories on Learn are labelled "Illustrative story" and use no names.
8. **Team cards** come from `team.json` and show only entries with `"verified": true`. Only real people the client names and verifies. Never stock photos, AI headshots or invented names.
9. **No stock photos of people, no rupee-note clichés, no fake dashboards.** Graphics are flat SVG or CSS shapes using the illustration palette.

## Files
```
index.html classes.html support.html learn.html carousels.html about.html faq.html contact.html legal.html thank-you.html 404.html
explainer-*.html          nine explainers linked from learn.html (same shell; "In short", contents, related cards)
config.js                 all settings (social links, prices, support switch, endpoints, analytics IDs)
testimonials.json team.json   data for the feedback and team cards
assets/css/site.css       all styles; @font-face first, then tokens in :root
assets/js/include.js      shared header, mobile menu, footer + disclaimer (blocking, tiny; runs as the page parses)
assets/js/next-class.js   weekly class date, local time, countdown, Live now, Event JSON-LD
assets/js/site.js         nav, reveal, charts, count-up, sticky steps, tilt, filters, carousel, forms,
                          support switch, testimonials/team, flip cards, quiz, rule of 72, thank-you, consent
assets/fonts/             self-hosted WOFF2 subsets
assets/img/og-image.png   share image (source: assets/svg/og-image.svg)
_explorations/            design-stage hero variants (underscore folder: never published by GitHub Pages)
_backend/                 Google Apps Script for the sign-up sheet, payments, Meet links and reminders (never published)
_dev/                     offline tests for _backend/Code.gs (never published)
```
Each page has the same shell: `<head>` meta (title, description, canonical, OG/Twitter), `config.js` and `include.js`, then `<script>RBS.header()</script>` after `<body>` and `<script>RBS.footer()</script>` before `</body>`, each with a `<noscript>` fallback. Change nav, footer or disclaimer in `include.js` only.

## Design tokens (source of truth: `:root` in site.css)
| Token | Value | Use |
|---|---|---|
| `--paper` | `#FAF7F2` | page background |
| `--paper-hi` | `#FFFDF9` | forms, raised cards |
| `--ink` | `#17171C` | text (17:1 on paper) |
| `--ink-2` | `#55534D` | muted text (7:1) |
| `--line` / `--line-strong` | `#E3DED4` / `#B9B3A7` | hairlines / input borders |
| `--accent` | `#0B7564` Peacock | buttons, links, highlights (5.7:1 with white) |
| `--tint` / `--tint-2` | 9% / 18% accent mixed into paper | soft card and band backgrounds |
| `--night` | `#14161F` | footer |
| `--marigold --coral --leaf --sky` | `#F2B33D #EE7D5B #5DAE7B #9CC0F2` | illustration only, never for text |

- **Type:** Bricolage Grotesque (display, 500–700) and Mukta (body, 400/500/600). Mukta covers Devanagari and has a proper ₹ glyph. **Body is never below 18px** (`--step-0`). Scale: `--step--1` to `--step-5`.
- **Space:** 8px rhythm (`--s1` 8 up to `--s8` 128). Section padding is `--section`; side gutter is `--gutter` (16px minimum).
- **Shape:** pill buttons with a 48px minimum height (`.btn`, `.btn.ghost`, `.btn.light`, `.btn.lg`), 20px card radius, 12px fields.
- **Breakpoints:** mobile first. Layouts split at 760px and 900px; the full nav (7 links + socials) appears at 1100px.

## Motion rules
- Animate **transform and opacity only**. No blur filters, no autoplay video, no animation libraries.
- Every duration is multiplied by `--speed`. `prefers-reduced-motion` turns all motion off; so does `data-motion="off"` on `<html>`.
- **Content must be visible without JS.** `site.js` adds `.pre` only to elements that start below the fold, then removes it as they enter the viewport. Never ship an element at `opacity: 0` by default.
- What's in use:
  - Headline lines rise on load (`.reveal-lines .ln > span` with `--i`).
  - Sections rise into view (`[data-reveal]`, stagger with `--rd`).
  - Lines draw themselves and bars grow (`[data-chart]` with `.line` / `.bar`).
  - Numbers count up (`[data-count]`).
  - The how-it-works steps stay sticky on desktop (`.how`).
  - Buttons lift 2px; cards tilt (`[data-tilt]`, mouse only).
  - Accordions open smoothly (`details.acc`, using `::details-content`).
  - Pages cross-fade (`@view-transition`, with a fade-in fallback).

## Components
- **Placeholder chip** `<span class="ph">what's missing</span>` renders a dashed TBC label. Use it for every client-supplied fact. Before launch, `grep -n 'class="ph' *.html` must return nothing.
- **Forms** `form[data-form="class|interest|intake|contact|newsletter"][data-done="id"]` validate on the client, POST to the endpoint in `config.js`, then redirect to the payment link (class, intake) or show the `#id` panel. Each has a `_gotcha` honeypot and a `.form-error`. With no endpoint set they run in demo mode and say so.
- **Next class** any element with `data-nc="next|date|local|countdown"`, plus hidden inputs `class_date` / `class_date_label`, is filled by `next-class.js`. `body[data-event-ld]` adds the Event JSON-LD.
- **Support switch** `[data-when-support="on"]` ships `hidden` and appears only when `SUPPORT_ENABLED` is true; `[data-when-support="off"]` does the opposite.
- **Flip card** `.flip[data-flip]` with `.face.front` and `.face.back`; without JS both faces show.
- **Feedback** `[data-testimonials]`; **team** `[data-team]`.
- **Phone layouts** (bottom of site.css): under 760px `.myth-grid` and `.quotes` become sideways swipe rows with a `.swipe-hint`; under 640px Learn `.post` cards become compact rows; explainer contents (`.x-layout .toc`) become a swipeable pill row.
- **Team card** `.team-card` holds `.photo`, `.role`, an optional `.name`, `.cred` and `.line`.
- **Chart** `figure.chart[data-chart]` contains an SVG with a `<title>`, plus `.tag-illus` or `.source`.
- **Post card** `.post[data-topic="macro|portfolio|tax|mistakes"]`, filtered by `.filters button[data-filter]`.

## Accessibility
- WCAG AA contrast is met with the tokens above. Don't put text on marigold, coral, leaf or sky.
- Visible `:focus-visible` rings, a skip link, `aria-current` on the active nav link, labelled form fields with inline errors, and `aria-pressed` on the filter buttons.
- Decorative SVGs carry `aria-hidden="true"`. Meaningful charts carry `role="img"` and a `<title>`.

## Running locally
```
python -m http.server 5173 --directory site
```
Open via a server (JSON loads with `fetch`).

After any change to `_backend/Code.gs`, run its offline tests from the `site` folder. The last line should read "All Apps Script checks passed."
```
node _dev/test-apps-script.js _backend/Code.gs
```
