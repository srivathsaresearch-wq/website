# Hand-off: Research by Srivathsa site

**Status (17 Oct 2026):** built for launch on GitHub Pages, committed locally; the GitHub repo (`srivathsaresearch-wq/website`) is still empty until the `upload-to-github` folder is uploaded. All ten pages are done. The shareable handoff doc is at https://claude.ai/code/artifact/bbff8e6a-e32a-4dd8-8c14-f7ef7b2e8ec8. Forms, payments and bookings are wired to `config.js` and run in demo mode until the endpoints are filled in. Rules and conventions are in `CLAUDE.md`, deploy steps in `README.md`, and backend set-up in `backend-notes.md`.

## What's built
| Page | Sections |
|---|---|
| `index.html` | hero with live next-class card · trust line · what you'll learn · sticky how-it-works · statement · next class + sign-up · one-year support teaser · Myth or fact flip cards · feedback · about strip · FAQ teaser · newsletter |
| `classes.html` | hero with ₹199 count-up and live date · six-part outline · for / not for · format (Saturday 3–4 pm IST, Google Meet, 1 hour) · sign-up → Razorpay · feedback · class FAQs |
| `support.html` | one-year support, ₹3,000 a year: email questions + monthly members' Q&A call · what's included · for / not for · 4 steps · sign-up → Razorpay ₹3,000 (**switched on 17 Oct 2026**; set SUPPORT_ENABLED false to go back to register interest) · FAQs |
| `learn.html` | featured explainer · topic filters + 12 cards (4 carousels live, 8 explainers still sample titles) · 60-second quiz · Rule of 72 · three illustrative stories · carousel preview · RBI repo rate chart (real data, as of 7 Oct 2026) · newsletter |
| `carousels.html` | the four carousels in full: falling rupee, equity/debt/gold, SIP or lump sum, red flags of a tips group (linked from the Learn cards and the footer) |
| `about.html` | why we exist · four principles · risk first, then returns · team (from `team.json`) · socials |
| `faq.html` | five groups (class, payment, advice and safety, one-year support, about us) |
| `contact.html` | form · email · Instagram and LinkedIn · grievances · safety note |
| `legal.html` | disclaimer · privacy (what we collect, why, deletion) · cookies · terms · refunds and cancellations. **Draft, to be reviewed before launch** |
| `thank-you.html` | message by `?type=class` / `?type=support` |
| `404.html` | friendly not-found with links home and to the class |

Weight: one page plus shared CSS/JS is about 110–140 KB before gzip, plus about 150–200 KB of self-hosted fonts on first visit (cached after).

## Still needed from the client
Run `grep -n 'class="ph' *.html` to see each one in place.

**Decided (filled in, 16 Oct 2026):** English, sometimes Hindi or Kannada · no recordings shared · seats limited to a small group · reminders by email · no GST · pay online through Razorpay, including UPI · no refunds; reschedule once · reply within 1 day · grievance and data requests to info@researchbysrivathsa.com · data kept no more than 5 years · laws and courts of India · no SEBI or licence mentions anywhere.

**Also decided (17 Oct 2026):** the 1-1 personal-advice session is replaced by one-year support (education only, ₹3,000 a year: email questions and a monthly members' Q&A call; register interest for now) · all payments non-refundable, including when we cancel a class (we move people to the next one) · legal text approved, draft banners removed · the class runs on Google Meet, with links made automatically by `_backend/Code.gs`; sign-ups go to a Google Sheet owned by srivathsaresearch@gmail.com (see `_backend/SETUP.md`). **Earlier:** hello@researchbysrivathsa.com confirmed · no affiliate links or paid partnerships · 1-1 is one hour with the founder (CFA Charterholder) and focuses on personal advice · About states the team has handled billions of dollars for institutional clients and worked with retail investors for 5 years (client-confirmed).

**Still open:** set up info@ alongside hello@ (Email Routing) · analytics tools, before switching any on · update the RBI chart after each MPC decision (next due early December 2026) · real explainers to replace the sample titles · dates for each feedback entry in `testimonials.json` · Razorpay is wired as on-site Checkout (no Payment Page needed): add the key id and secret to Apps Script Script properties, then test with a test-mode payment (`_backend/SETUP.md` §3) · deploying `_backend/Code.gs` from srivathsaresearch@gmail.com (see `_backend/SETUP.md`).

**Config (`config.js`):** `CLASS_FORM_ENDPOINT`, `CLASS_PAYMENT_LINK`, `FORMS_ENDPOINT`, `SUPPORT_PAYMENT_LINK`, `NEWSLETTER_ENDPOINT`, `CONTACT_ENDPOINT`, `ANALYTICS_ID`, `META_PIXEL_ID`.

## Copy to confirm
- Bundle copy was kept wherever it existed, so these brief lines are **not** used yet. Swap them in if you prefer: hero "Investing in India, explained simply." and subline, buttons "Join the next class (₹199)" / "See what you'll learn", trust strip "Independent. Educational. Risk-first.", classes headline "Your first investing class. ₹199.", the three brief card titles, and how-it-works "Pick a class / Learn in one live hour / Leave with a clear next step".
- "small research team" (home, about) and "Leads our research team." (founder card): confirm or soften.
- "CFA charterholder" now follows CFA Institute style (lower-case c). Still worth checking their full designation-use rules before launch.

## Engineering notes
- Fonts are self-hosted WOFF2 (Google Fonts subsets). The ₹ sign is served from the small latin-ext files, so the ~100 KB Devanagari files load only for Hindi text.
- The `tweaks.js` review panel and its CSS overrides were removed.
- `_config.yml` keeps the Markdown notes off the live site; `_explorations/` is never published.
- Known limits: smooth accordions and cross-page fades work in Chromium; other browsers open instantly. Both fine.
- Phase 2 idea (not built): a Cloudflare Worker to verify Razorpay webhooks instantly instead of every 10 minutes. See `backend-notes.md` §8.
