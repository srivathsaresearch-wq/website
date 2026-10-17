# Research by Srivathsa: website

Static site for **researchbysrivathsa.com**: plain HTML, one CSS file and small vanilla JS files. No framework and no build step. Hosted on GitHub Pages, with DNS (and optionally email) on Cloudflare.

Read `CLAUDE.md` for the design and compliance rules, `HANDOFF.md` for what's still a placeholder, and `backend-notes.md` for forms, payments and bookings.

## What's where

```
index.html  classes.html  support.html  learn.html  about.html
faq.html  contact.html  legal.html  thank-you.html  404.html
config.js            ← all settings: social links, prices, support switch, form and payment URLs, analytics IDs
testimonials.json    ← feedback cards (shown only when consent AND verified are true)
team.json            ← team cards (shown only when verified is true)
assets/css/site.css  ← all styles; design tokens in :root; self-hosted fonts at the top
assets/js/include.js ← shared header, mobile menu and footer + disclaimer (edit once, every page updates)
assets/js/next-class.js ← next Saturday class: date, local time, countdown, "Live now", JSON-LD
assets/js/site.js    ← motion, forms, flip cards, quiz, Rule of 72, support switch, cookie notice
assets/fonts/        ← Bricolage Grotesque + Mukta (WOFF2, SIL Open Font License)
assets/img/og-image.png  ← social share image (source: assets/svg/og-image.svg)
CNAME  robots.txt  sitemap.xml  favicon.svg  _config.yml
```

## Everyday edits

| To change… | Edit |
|---|---|
| Nav links, footer, disclaimer | `assets/js/include.js` (and the `<noscript>` fallback lines in each page if links change) |
| Prices, social links, one-year support on/off | `config.js` |
| Feedback | `testimonials.json`: first name, rating, feedback text, date as `YYYY-MM-DD`, `consent`, `verified`, and `"show": false` to hide an entry. If you replace summaries with people's own words, change the label on Home and Classes back to "Feedback from our pilot session. Individual experiences vary." |
| Team | `team.json`: add real, verified people only |
| Class day/time | The weekly slot (Saturday 15:00–16:00 IST) is in `assets/js/next-class.js` (`getClass`) and in the page copy |

**Opening one-year support.** Set `SUPPORT_ENABLED: true` in `config.js` once the Razorpay ₹3,000 page is in `SUPPORT_PAYMENT_LINK` (redirecting to `/thank-you.html?type=support`). The sheet script sends each paying member a welcome email.

## Run locally

```
python -m http.server 5173 --directory site
```
Then open http://localhost:5173. (JSON files load with `fetch`, so open via a server, not by double-clicking.)

## Deploy: GitHub Pages + Cloudflare

### 1. GitHub
1. The repository is `github.com/srivathsaresearch-wq/website` (public, branch `main`). GitHub Pages on a free account needs a public repo.
2. Repo **Settings → Pages**: Source = *Deploy from a branch*, Branch = `main`, folder `/ (root)`. Save.
3. Custom domain: enter `researchbysrivathsa.com` and save. (The `CNAME` file already contains it.) Add the domain in GitHub **before** changing DNS, so nobody else can claim it.
4. Recommended: verify the domain at your GitHub **account** Settings → Pages → *Add a domain*. GitHub gives you a TXT record (`_github-pages-challenge-srivathsaresearch-wq`); add it in Cloudflare DNS.

### 2. Cloudflare DNS (Dashboard → your domain → DNS → Records)
Delete any default A/AAAA/CNAME records for `@` and `www`, then add (all set to **DNS only**, grey cloud):

| Type | Name | Content |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| AAAA | @ | 2606:50c0:8000::153 |
| AAAA | @ | 2606:50c0:8001::153 |
| AAAA | @ | 2606:50c0:8002::153 |
| AAAA | @ | 2606:50c0:8003::153 |
| CNAME | www | `srivathsaresearch-wq.github.io` |

(IPs from GitHub's docs, checked October 2026. The AAAA records are optional but recommended. Don't add a wildcard `*` record.)

### 3. HTTPS
Wait for the DNS check in Settings → Pages to pass (minutes to 24 hours). When GitHub has issued the certificate, tick **Enforce HTTPS**.

### 4. Cloudflare proxy (orange cloud): optional
Not needed. GitHub Pages already serves over HTTPS from a CDN. Turning the proxy on adds Cloudflare caching, analytics and rules, but it can block GitHub from renewing its certificate. If you do turn it on, do it only **after** Enforce HTTPS works, and set **SSL/TLS → Overview → Full** (Full (strict) also works while GitHub's certificate is valid). Never use *Flexible*: it causes redirect loops. Recommendation: leave it grey unless you need a Cloudflare feature.

### 5. www → main domain
With the CNAME file set to `researchbysrivathsa.com` and the `www` CNAME above, GitHub Pages redirects `www.researchbysrivathsa.com` to `researchbysrivathsa.com` automatically. If you proxy through Cloudflare, you can instead add **Rules → Redirect Rules → "Redirect from WWW to root"** (301, keep the path and query string).

### 6. Email: hello@researchbysrivathsa.com → your inbox
1. Cloudflare → your domain → **Email → Email Routing → Get started**.
2. Add custom addresses `hello` and `info` (grievance and data requests), each with *Send to an email*: your personal inbox.
3. Cloudflare emails that inbox a verification link. Click it.
4. Let Cloudflare add the MX and TXT (SPF) records it suggests, then enable routing.
5. Send a test from another account. Email Routing only *receives*. To *reply as* hello@, set up "Send mail as" in Gmail with an SMTP service (for example, a free tier at Brevo or Zoho Mail), and add the DKIM record that service gives you.

## Before launch
- `grep -n 'class="ph' *.html` lists every placeholder chip still showing. All must be filled or removed.
- Fill the remaining `config.js` placeholders (see `backend-notes.md`) and run the ₹1 test-mode checklist.
- Legal text and the footer disclaimer reviewed by a lawyer (including the DPDP Act 2023).
