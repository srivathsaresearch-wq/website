# Hand-off: Research by Srivathsa site

**Status (16 Oct 2026):** built for launch on GitHub Pages. All ten pages are done. Forms, payments and bookings are wired to `config.js` and run in demo mode until the endpoints are filled in. Rules and conventions are in `CLAUDE.md`, deploy steps in `README.md`, and backend set-up in `backend-notes.md`.

## What's built
| Page | Sections |
|---|---|
| `index.html` | hero with live next-class card · trust line · what you'll learn · sticky how-it-works · statement · next class + sign-up · 1-1 teaser · Myth or fact flip cards · feedback · about strip · FAQ teaser · newsletter |
| `classes.html` | hero with ₹199 count-up and live date · six-part outline · for / not for · format (Saturday 3–4 pm IST, Zoom, 1 hour) · sign-up → Razorpay · feedback · class FAQs |
| `one-to-one.html` | ₹3,000 offer · what you get · for / not for · 4 steps · register interest (switch off) **or** intake → Razorpay (switch on) · FAQs |
| `learn.html` | featured explainer · topic filters + 12 sample-title cards · 60-second quiz · Rule of 72 · three illustrative stories · carousel · sourced-chart template · newsletter |
| `about.html` | why we exist · four principles · risk first, then returns · team (from `team.json`) · socials |
| `faq.html` | five groups (class, payment, advice and safety, 1-1, about us) |
| `contact.html` | form · email · Instagram and LinkedIn · grievances · safety note |
| `legal.html` | disclaimer · privacy (what we collect, why, deletion) · cookies · terms · refunds and cancellations. **Draft, to be reviewed before launch** |
| `thank-you.html` | message by `?type=class` / `?type=1to1`; Cal.com embed for paid 1-1 |
| `404.html` | friendly not-found with links home and to the class |

Weight: one page plus shared CSS/JS is about 110–140 KB before gzip, plus about 150–200 KB of self-hosted fonts on first visit (cached after).

## Still needed from the client
Run `grep -n 'class="ph' *.html` to see each one in place.

**Decided (filled in, 16 Oct 2026):** English, sometimes Hindi or Kannada · no recordings shared · seats limited to a small group · reminders by email · no GST · pay online through Razorpay, including UPI · no refunds; reschedule once · reply within 1 day · grievance and data requests to info@researchbysrivathsa.com · data kept no more than 5 years · laws and courts of India · no SEBI or licence mentions anywhere.

**Still open:** confirm hello@researchbysrivathsa.com and set up info@ too (Email Routing) · 1-1 session length (45 min) and "what you get" details · FAQ wording on personal advice for 1-1 · any affiliate links or paid partnerships · analytics tools, before switching any on · RBI table and date when the chart gets real figures · real explainers to replace the sample titles · dates for each feedback entry in `testimonials.json` · lawyer review of the legal text and footer disclaimer.

**Config (`config.js`):** `CLASS_FORM_ENDPOINT`, `CLASS_PAYMENT_LINK`, `ONE_TO_ONE_INTAKE_ENDPOINT`, `ONE_TO_ONE_PAYMENT_LINK`, `ONE_TO_ONE_BOOKING_URL`, `NEWSLETTER_ENDPOINT`, `CONTACT_ENDPOINT`, `ANALYTICS_ID`, `META_PIXEL_ID`.

## Copy to confirm
- Bundle copy was kept wherever it existed, so these brief lines are **not** used yet. Swap them in if you prefer: hero "Investing in India, explained simply." and subline, buttons "Join the next class (₹199)" / "See what you'll learn", trust strip "Independent. Educational. Risk-first.", classes headline "Your first investing class. ₹199.", the three brief card titles, and how-it-works "Pick a class / Learn in one live hour / Leave with a clear next step".
- "small research team" (home, about) and "Leads our research team." (founder card): confirm or soften.
- "CFA Charterholder": CFA Institute's style guide writes "CFA charterholder". Check against their designation-use rules.

## Engineering notes
- Fonts are self-hosted WOFF2 (Google Fonts subsets). The ₹ sign is served from the small latin-ext files, so the ~100 KB Devanagari files load only for Hindi text.
- The `tweaks.js` review panel and its CSS overrides were removed.
- `_config.yml` keeps the Markdown notes off the live site; `_explorations/` is never published.
- Known limits: smooth accordions and cross-page fades work in Chromium; other browsers open instantly. Both fine.
- Phase 2 idea (not built): a Cloudflare Worker to verify Razorpay webhooks and gate 1-1 booking. See `backend-notes.md` §8.
