# Backend notes: forms, payments and bookings (no server)

The site is static (GitHub Pages). Everything that needs a server is done by hosted tools, linked from `config.js`. **Never put secrets in this repo.** Form endpoints, payment-page links and booking links are public by design; API keys, webhook secrets and Razorpay key secrets are not, and live only inside the tools themselves.

> Free-tier limits change. The figures below are what the providers advertised around October 2026, some only via third-party sites. Check each pricing page before relying on them.

## How the pieces connect

```
Class (₹199)
  site form ──POST──▶ Formspree ──▶ Make scenario ──▶ Google Sheet "Class sign-ups"
      └─ browser redirects to CLASS_PAYMENT_LINK (Razorpay Payment Page, ₹199)
            └─ Razorpay webhook "payment.captured" ──▶ Make scenario
                   ├─ mark row "Paid" in the sheet
                   ├─ email: Zoom link + date/time (IST) + .ics calendar invite
                   ├─ schedule reminders: 24 h and 1 h before
                   └─ after class: feedback form (asks consent to quote) + newsletter opt-in
            └─ Razorpay "redirect after payment" ──▶ /thank-you.html?type=class

1-1 (₹3,000), only when ONE_TO_ONE_ENABLED = true
  intake form ──POST──▶ Formspree ──▶ Make ──▶ private Google Sheet "1-1 bookings"
      └─ redirect to ONE_TO_ONE_PAYMENT_LINK (Razorpay, ₹3,000)
            └─ redirect after payment ──▶ /thank-you.html?type=1to1 (Cal.com embedded)
            └─ webhook ──▶ Make ──▶ same sheet row: "Paid", payment id
  Cal.com booking ──webhook──▶ Make ──▶ same sheet row: booking time, Zoom link
  after the session: send written summary + feedback form
```

The site sends these hidden fields with every form: `form_type` (`class`, `interest`, `intake`, `contact`, `newsletter`), `page`, `_subject`, and for the class form `class_date` (e.g. `2026-10-17T15:00:00+05:30`) and `class_date_label`. `_gotcha` is a honeypot: Formspree drops submissions where it's filled.

---

## 1. Formspree (form endpoints)

Free plan: about 50 submissions a month, unlimited forms, spam filtering. Paid tiers raise the cap. If you outgrow it, a Make "Custom webhook" URL can replace the Formspree URL directly (the site just POSTs form data).

1. Sign up at formspree.io with hello@researchbysrivathsa.com (once Email Routing works) or your own email.
2. Create four forms: **Class sign-up**, **1-1 intake** (also receives "register interest"), **Newsletter**, **Contact**. (Newsletter can go to an email tool instead, see §6.)
3. For each, copy the endpoint (`https://formspree.io/f/xxxxxxx`) into `config.js`:
   `CLASS_FORM_ENDPOINT`, `ONE_TO_ONE_INTAKE_ENDPOINT`, `NEWSLETTER_ENDPOINT`, `CONTACT_ENDPOINT`.
4. In each form's settings: restrict to the domain `researchbysrivathsa.com`, keep the honeypot name `_gotcha`, leave reCAPTCHA off (it blocks low-end phones; the honeypot and time check cover most bots).
5. Plugins → Google Sheets or Webhook → point at the Make scenario in §3 (or use Formspree's own Google Sheets plugin if your plan includes it).

Why not Tally? Tally forms are embedded, not posted to. The site's own forms post data, which suits Formspree or a Make webhook. If you prefer Tally, replace each form with a Tally embed and point Tally's webhook at Make.

## 2. Google Sheets

Create two sheets in your Google Drive, shared with nobody else:

- **Class sign-ups**: `timestamp | name | email | phone | class_date | class_date_label | lang | stage | consent | status (Pending/Paid) | payment_id | amount | reminder_24h_sent | reminder_1h_sent | feedback_sent`
- **1-1 bookings**: `timestamp | name | email | phone | goals | time_horizon | existing_investments | consent | terms | status | payment_id | amount | booking_time | zoom_link | summary_sent | feedback_sent`

Never add columns for PAN, Aadhaar, account numbers or card details. The forms never ask for them.

## 3. Make (automation)

Free plan: about 1,000 credits ("operations") a month, a 15-minute minimum schedule interval, and a limited number of active scenarios. Each module run costs about one credit, so one class sign-up end to end is roughly 8 to 12 credits. Zapier's free plan (about 100 tasks a month, two-step Zaps) doesn't include webhooks, so Make is the better fit here.

Scenarios:

**A. Sign-up → sheet.** Trigger: Webhooks → Custom webhook (paste its URL into Formspree's webhook plugin). Router on `form_type`:
`class` → add row to Class sign-ups with status `Pending`.
`intake` / `interest` → add row to 1-1 bookings (`interest` rows get status `Interest`).
`contact` → email to hello@researchbysrivathsa.com.

**B. Razorpay payment → Paid + emails.** Trigger: Webhooks → Custom webhook (paste into Razorpay, §4). Steps:
1. Verify the event is `payment.captured` (Make's Razorpay app can verify the signature; if using a raw webhook, see phase 2 below).
2. Search the sheet for the row by email (Razorpay Payment Pages collect email; make it a required field there).
3. Update status `Paid`, `payment_id`, `amount`.
4. For ₹199: send the confirmation email with the Zoom link, the date and time in IST, and an `.ics` invite (Make's "Create iCal event" or a text module).
5. For ₹3,000: send "Choose your time" with the Cal.com link (as a backup to the thank-you page).

**C. Reminders.** Trigger: schedule every 15 minutes. Find rows where status = `Paid` and class start is within 24 h (or 1 h) and the reminder flag is empty → send email → set flag.

**D. After class.** Trigger: schedule Saturdays at 16:15 IST. For each `Paid` row for that date → send the feedback form link (the form must ask for written consent before any quote is used) and a newsletter opt-in link.

**E. Cal.com booking (1-1).** Trigger: Cal.com webhook `BOOKING_CREATED` → find the 1-1 row by email → write `booking_time`, `zoom_link`. Flag any booking with no matching `Paid` row (see the warning in §5).

## 4. Razorpay (payments)

Pricing: no set-up fee; a per-transaction fee (about 2% on standard domestic methods; check the current rate). Settlement to your bank in a few working days.

1. Sign up at razorpay.com, complete KYC (needs business/PAN details; this is between you and Razorpay, never on the site).
2. Payment Pages → create **"Investing class, ₹199"**: fixed amount ₹199, fields name, email (required), phone. Under **Settings → after payment**, redirect to `https://researchbysrivathsa.com/thank-you.html?type=class`.
3. Create **"1-1 session, ₹3,000"**: same, redirect to `https://researchbysrivathsa.com/thank-you.html?type=1to1`. Keep it unpublished until 1-1 goes live.
4. Paste the page URLs into `CLASS_PAYMENT_LINK` and `ONE_TO_ONE_PAYMENT_LINK`.
5. Settings → Webhooks → add the Make URL from scenario B, events `payment.captured` (and `payment.failed` if you want to log failures). Set a webhook **secret**; store it only in Make.

### ₹1 test checklist (Razorpay **test mode**) before going live

- [ ] Switch the Razorpay dashboard to **Test mode**. Create a test Payment Page for ₹1 with the same redirect URL.
- [ ] Temporarily put the test page URL in `CLASS_PAYMENT_LINK` on a local copy (don't publish).
- [ ] Run the site locally, fill the class form with your own email, submit.
- [ ] Row appears in "Class sign-ups" with status `Pending` and the right `class_date`.
- [ ] Pay with Razorpay's published test card or test UPI ID (from Razorpay's docs).
- [ ] You land on `/thank-you.html?type=class`.
- [ ] Webhook fires: row becomes `Paid` with a `payment_id`.
- [ ] Confirmation email arrives with Zoom link, date/time in IST, and the calendar invite opens correctly in Google Calendar and on a phone.
- [ ] Reminder scenario: temporarily set a test class 25 h and 2 h ahead and confirm both reminders send once each.
- [ ] Feedback email sends, and the feedback form asks for consent to quote.
- [ ] Repeat for 1-1 with `ONE_TO_ONE_ENABLED = true` locally: intake → ₹1 test page → `/thank-you.html?type=1to1` shows Cal.com → booking writes to "1-1 bookings".
- [ ] Switch to **Live mode**, create the live pages at the real prices, paste the live URLs, publish. Make one real ₹199 payment yourself to check the whole flow (refund it from the dashboard; customer payments are non-refundable, but your own test is fine to reverse).

## 5. Cal.com (1-1 booking)

Free for individuals. Create an event type **"1-1 session"**:
- Length: `SESSION_MINUTES` (60 minutes). Time zone: Asia/Kolkata.
- Location: Zoom (connect the Zoom app so links are generated automatically).
- Connect Google Calendar so busy times are blocked.
- Minimum notice: 24 hours. Turn on reschedule and cancel links in confirmation emails.
- Booking questions: name and email only (everything else came from the intake form).
- Webhook: `BOOKING_CREATED` → Make scenario E.
- Paste the event link into `ONE_TO_ONE_BOOKING_URL`. The thank-you page embeds it with `?embed=true`.

**Warning.** Anyone who finds `/thank-you.html?type=1to1` can open the booking calendar without paying. Mitigations: keep the Cal.com event **hidden** (not on your public Cal.com profile), require booking confirmation (manual approve) and check every booking against a `Paid` row, or move to phase 2. Cal.com's built-in payments don't support Razorpay.

## 6. Newsletter

Simplest: Formspree → sheet, and send from your email tool. Better for double opt-in: a free tier at Buttondown, MailerLite or Brevo. Point `NEWSLETTER_ENDPOINT` at that tool's form-post URL if it accepts plain form posts, or at Make, which adds the subscriber via the tool's API.

## 7. Analytics and Meta Pixel (off until IDs are set)

- `ANALYTICS_PROVIDER: "plausible"` + `ANALYTICS_ID: "researchbysrivathsa.com"`: cookieless, loads without a banner (paid, with a free trial).
- `ANALYTICS_PROVIDER: "ga4"` + `ANALYTICS_ID: "G-XXXXXXX"`: free, sets cookies, so the site shows the cookie notice and loads GA only after "Accept".
- `META_PIXEL_ID`: also waits for "Accept".
- Update the privacy policy (Legal → Cookies) before switching any on.

## 8. Phase 2 (not built): Cloudflare Worker

A small Worker at e.g. `api.researchbysrivathsa.com/razorpay` would receive the Razorpay webhook, verify the `X-Razorpay-Signature` HMAC with the webhook secret (stored as a Worker secret), write to the sheet or a D1 database, and issue a one-time booking token so the Cal.com page only opens for paid customers. The free Workers plan covers this traffic easily.
