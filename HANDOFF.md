# Hand-off: Research by Srivathsa site

**Status (17 Oct 2026, end of day):** live on GitHub Pages from `main` of `srivathsaresearch-wq/website` (custom domain in `CNAME`). Latest commit `8d8fbf4`. The live site has not been re-checked in a browser since the last four pushes; do that first. Forms, payments and bookings are wired to `config.js` and the Apps Script back office (`_backend/`). Rules and conventions are in `CLAUDE.md` (read it before any change), deploy steps in `README.md`, and backend set-up in `backend-notes.md` and `_backend/SETUP.md`. An older shareable handoff page is at https://claude.ai/code/artifact/bbff8e6a-e32a-4dd8-8c14-f7ef7b2e8ec8; it predates the 17 October work below.

## What's built
| Page | Sections |
|---|---|
| `index.html` | hero with live next-class card · trust line · what you'll learn · sticky how-it-works · statement · next class + sign-up · one-year support teaser (dark card) · Myth or fact, **six** flip cards · feedback, **six** cards · about strip · FAQ teaser · newsletter |
| `classes.html` | hero with ₹199 count-up and live date · six-part outline · for / not for · format (Saturday 3–4 pm IST, Google Meet, 1 hour) · sign-up → Razorpay · feedback · class FAQs |
| `support.html` | one-year support, ₹3,000 a year: email questions + monthly members' Q&A call · what's included · for / not for · 4 steps · sign-up → Razorpay ₹3,000 (**switched on 17 Oct 2026**; set `SUPPORT_ENABLED` false to go back to register interest) · FAQs |
| `learn.html` | featured explainer (Inflation, links to its page) · topic filters + 12 cards (4 carousels, 8 explainers, all live) · 60-second quiz · Rule of 72 · **"Play with the ideas"**: 3 cards linking to the interactive illustrations · three illustrative stories · carousel preview · RBI repo rate chart (real data, as of 7 Oct 2026) · newsletter |
| `explainer-*.html` | nine explainers: inflation, repo-rate, gdp, diversification, index-vs-active-funds, tax-on-gains, demat-and-trading-accounts, chasing-last-years-winner, money-needed-soon. Each has "In short", contents, related cards and a class link. Three carry an interactive illustration (see below) |
| `carousels.html` | the four carousels in full: falling rupee, equity/debt/gold, SIP or lump sum, red flags of a tips group |
| `about.html` | why we exist · four principles · risk first, then returns · team (from `team.json`) · socials |
| `faq.html` | five groups (class, payment, advice and safety, one-year support, about us) |
| `contact.html` | form · email · Instagram and LinkedIn · grievances · safety note |
| `legal.html` | disclaimer · privacy (what we collect, why, deletion) · cookies · terms · refunds and cancellations. Text approved by the client on 17 Oct 2026 |
| `thank-you.html` | message by `?type=class` / `?type=support` |
| `404.html` | friendly not-found with links home and to the class |

Weight: one page plus shared CSS/JS is about 110–140 KB before gzip, plus about 150–200 KB of self-hosted fonts on first visit (cached after).

## Done on 17 October 2026 (four pushes)
| Commit | What |
|---|---|
| `82f719b` | Nine explainer pages written and linked from Learn (were "coming soon") · sixth myth card ("Small fees don't really matter") · nav "Join the class" double gap fixed · form fields side by side now line up (support form) |
| `cc4ac3f` | All six feedback entries shown · phone layouts: myth and feedback cards become swipe rows, Learn cards become compact rows (Learn 18 → 15 phone screens, Home 16 → 14), explainer contents become a one-line pill row |
| `228d4f8` | Fuller wording from Surya, Bhuvan and Suraj replaced "Very useful." |
| `8d8fbf4` | Pictures assemble and charts draw as you scroll (CSS only) · three interactive illustrations · without JS, the next-class line no longer repeats the schedule line (Home, Classes, Thank-you) |

**Interactive illustrations** (made-up numbers, tagged "Illustration · made-up numbers" with `[hypothetical]` on each figure; a deliberate, labelled exception to the "illustrations show no figures" rule, like the Rule of 72):
- Inflation basket, `explainer-inflation.html#try-basket`: years slider and 4/6/8% choice; items fade as ₹1,000 buys less.
- Fee piles, `explainer-index-vs-active-funds.html#try-fees`: ₹1,00,000 at 0.5% vs a chosen higher cost, investment assumed flat (same set-up as the "fee you never see" story).
- Spread your eggs, `explainer-diversification.html#try-eggs`: 1–6 baskets; "one basket drops" vs "a bad day for every basket" (always loses half of what's left, whatever the basket count, so spreading never looks worse).

## Audit follow-up, 17 October 2026 (evening)
An outside UX/CRO/SEO audit was pasted in. Several of its findings came from a text-only scrape and are not real problems: the error and "Almost there" messages are hidden until used, and the Saturday date is filled in by `next-class.js` (the "this coming Saturday" text is only the no-JS fallback). Changes made:
- **Home:** title "Investing basics for beginners in India · Research by Srivathsa" and a new description; lede names first-time investors in India; hero button "Reserve my seat · ₹199" with a line under it (1 hour, Google Meet, Saturdays 3–4 pm IST, no experience needed); sign-up form shows "Step 1 of 2" and the refund/reschedule terms beside the button.
- **Classes:** new title and description; hero button "Reserve my seat · ₹199"; "After the class, you'll understand" card (four learning goals, labelled "not promised results"); form shows "Step 1 of 2" and a fuller note (Razorpay incl. UPI, Meet link by email, non-refundable, move once).
- **Support:** the HTML now ships in the "on" state, so the raw page no longer carries "Opening soon" next to "Join for a year" (it was hidden by JS, but crawlers and scrapers saw both).
- **About:** "We only list real, verified people here" replaced with the verified credentials line.
- **Funnel events** in `site.js` (see `CLAUDE.md` › Components). They only report once Plausible or GA4 is chosen.
- Live site checked: robots, sitemap and canonical are fine and nothing is set to noindex. Whether Google has indexed it can only be seen in Search Console (not yet set up).

**Declined or waiting on the client** (audit asked for them): the founder's full name and photo (rule 7, no personal names; needs the client to change the rule); replacing the hero headline (copy choice, see "Copy to confirm"; the audit's suggestion was "New to investing in India? Learn the basics before you put your money in."); dates on the feedback (still `[add date]`).

**Two new explainers (audit content gaps, 17 Oct 2026):** `explainer-reading-a-fund-factsheet.html` (NAV, expense ratio and exit load, holdings, benchmark, riskometer, how performance is shown, what to look at first) and `explainer-how-to-start-investing.html` (goals, time horizon, emergency money and debt, risk, accounts with a link to the demat explainer, common first mistakes). Both are in the "How portfolios work" filter on Learn (start-investing is now the first card; grid is 10 explainers and 4 carousels, 14 pieces) and in `sitemap.xml`. They show no real figures, so nothing needs a source; the three pictures (factsheet layout, riskometer dial, timeline jars) are labelled illustrations. The only outside link is AMFI's site, for daily NAVs. Checked in headless Chrome at 390px and 1280px: no sideways scroll, no console errors. Worth a read by the client before pushing, and then inspect both in Search Console.

## Decisions made on 17 October 2026
- **No separate reviews page yet.** Six short quotes from one pilot session would make a thin page, the nav already has seven links, and feedback already shows on Home and Classes. Revisit at about 15–20 dated reviews from several sessions, linked from the footer and a "See all feedback" link, not the main nav.
- **Surya's and Suraj's quotes shown as written**, at the client's choice, although they go beyond the class outline (tax-efficient drawdown; investing a first salary). Recorded in `CLAUDE.md` rule 2.
- **Higgsfield (AI video) not used on the site**: it conflicts with the no-autoplay-video and no-AI-people rules and slow mobile data. Possibly useful for Instagram/LinkedIn clips.
- **Gemini review (pasted in by the client):** the one real bug (repeated schedule line without JS) is fixed. Declined: mock reviews (rule 2, no fake proof) and a footer line about SEBI/RIA (rule 4, no SEBI mentions). Everything else it asked for was already in place.

## Still open
- **GA4 is live** (`G-YJ8K3HM6DL` in `config.js`, loads only after a yes on the cookie notice). The cookies paragraph in `legal.html` was rewritten for GA4 on 17 Oct 2026 at the site owner's go-ahead; confirm the client is happy with it, as the rest of the legal text was client-approved.
- **Google Search Console:** add the domain, submit `sitemap.xml`, and inspect `/`, `/classes.html` and two explainers. A public `site:` search showed nothing on 17 Oct, likely because the domain is new.
- **Dates for the feedback** in `testimonials.json` (all six read `[add date]`). One pilot date would cover them.
- **Check the live site** on a phone after the pushes above.
- RBI chart after each MPC decision: it appears on `learn.html` and `explainer-repo-rate.html` (next due early December 2026).
- **Email moved to Zoho Mail (27 Oct 2026).** Cloudflare Email Routing is off; Zoho MX, SPF, DKIM and the ZeptoMail records are in Cloudflare DNS (README §6). The site and the script now use the Zoho mailbox bhargava@researchbysrivathsa.com everywhere (contact, privacy/grievance, Reply-To) in place of hello@ and info@, at the client's choice. Paste the updated `_backend/Code.gs` into Apps Script and deploy a new version so Reply-To changes too.
- Razorpay is wired as on-site Checkout: add the key id and secret to Apps Script Script properties, then test with a test-mode payment (`_backend/SETUP.md` §3) · deploy `_backend/Code.gs` from srivathsaresearch@gmail.com.
- Optional phone work, not started: Learn stories (3.5 phone screens) could show title + lesson with "Read the story" to expand; Home "What you'll learn" and "Three steps" (about 2 screens each) could be tightened.

**Decided earlier (16 Oct 2026):** English, sometimes Hindi or Kannada · no recordings shared · seats limited to a small group · reminders by email · no GST · pay online through Razorpay, including UPI · no refunds; reschedule once · reply within 1 day · grievance and data requests to info@researchbysrivathsa.com (bhargava@ from 27 Oct 2026) · data kept no more than 5 years · laws and courts of India · no SEBI or licence mentions anywhere.

**Also decided (17 Oct 2026):** the 1-1 personal-advice session is replaced by one-year support (education only, ₹3,000 a year: email questions and a monthly members' Q&A call) · all payments non-refundable, including when we cancel a class (we move people to the next one) · legal text approved, draft banners removed · the class runs on Google Meet, with links made automatically by `_backend/Code.gs`; sign-ups go to a Google Sheet owned by srivathsaresearch@gmail.com · hello@researchbysrivathsa.com confirmed (replaced by bhargava@ on 27 Oct 2026) · no affiliate links or paid partnerships · About states the team has handled billions of dollars for institutional clients and worked with retail investors for 5 years (client-confirmed).

**Config (`config.js`):** `CLASS_FORM_ENDPOINT`, `CLASS_PAYMENT_LINK`, `FORMS_ENDPOINT`, `SUPPORT_PAYMENT_LINK`, `NEWSLETTER_ENDPOINT`, `CONTACT_ENDPOINT`, `ANALYTICS_ID`, `META_PIXEL_ID`, `SUPPORT_ENABLED`.

## Copy to confirm
- Bundle copy was kept wherever it existed, so these brief lines are **not** used yet. Swap them in if you prefer: hero "Investing in India, explained simply." and subline, buttons "Join the next class (₹199)" / "See what you'll learn", trust strip "Independent. Educational. Risk-first.", classes headline "Your first investing class. ₹199.", the three brief card titles, and how-it-works "Pick a class / Learn in one live hour / Leave with a clear next step".
- "small research team" (home, about) and "Leads our research team." (founder card): confirm or soften.
- "CFA charterholder" follows CFA Institute style (lower-case c). Still worth checking their full designation-use rules.

## Engineering notes
- **Explainer pages are hand-edited source.** They were first generated by a one-off script that isn't in the repo; edit the HTML directly. Same for the toys' starting pictures (their layout rules are mirrored in `site.js`, so if you change basket or egg positions, change both).
- **Scroll animations** use `animation-timeline: view()` (Chrome/Edge on Android and desktop; others show the finished page). Anything meant to assemble must not sit inside an `overflow: hidden` box, which becomes the scroller; Learn cards use `overflow: clip` for this reason. Details in `CLAUDE.md` › Motion rules.
- **Testing motion:** the Claude desktop browser pane pauses rendering when hidden, so scroll animations and reveals look frozen there. Use headless Chrome instead: `puppeteer-core` is installed under `brag-output-2026-10-17-005158/work/node_modules`, with Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`.
- Browser cache: the local Python server doesn't send no-cache headers, so after editing CSS/JS/JSON, force a reload to see changes.
- Fonts are self-hosted WOFF2 (Google Fonts subsets). The ₹ sign is served from the small latin-ext files, so the ~100 KB Devanagari files load only for Hindi text.
- `_config.yml` keeps the Markdown notes (this file, `CLAUDE.md`, `README.md`, `backend-notes.md`) off the live site; `_explorations/`, `_backend/` and `_dev/` are never published.
- Known limits: smooth accordions, cross-page fades and scroll-linked motion work in Chromium; other browsers open instantly. Both fine.
- Phase 2 idea (not built): a Cloudflare Worker to verify Razorpay webhooks instantly instead of every 10 minutes. See `backend-notes.md` §8.
