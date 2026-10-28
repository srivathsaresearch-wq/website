/**
 * Research by Srivathsa: back office for the website, as a Google Apps Script.
 *
 * Lives in Extensions → Apps Script of the Google Sheet owned by the business Google account
 * (set-up steps are in SETUP.md next to this file). Everything runs inside that Google account, for free:
 *
 *   1. Website forms → tabs in the sheet. Class sign-ups, one-year support (interest and sign-ups), contact, newsletter.
 *      Contact and support messages are also emailed to you, with Reply-To set to the sender.
 *   2. Every 10 minutes: new captured Razorpay payments are read from the Razorpay API and the matching
 *      sign-up row turns "Paid". A payment with no matching sign-up still gets a row, so nobody is lost.
 *   3. Each paid class seat: the person is added as a guest to that Saturday's Google Calendar event,
 *      which carries a Google Meet link made automatically (or your fixed Zoom link), and gets a confirmation email.
 *   4. Reminder emails 24 hours and 1 hour before class, and a feedback email afterwards.
 *   5. Each paid one-year support sign-up gets a welcome email, with the dates their year starts and ends,
 *      and an email about SUPPORT_ENDING_REMINDER_DAYS before their year ends (it never renews by itself).
 *      Once a month there is a members' Q&A call: one Google Calendar event with a Meet link per call, and every
 *      member whose year covers that date is added as a guest (and emailed) MEMBERS_CALL_INVITE_DAYS before it.
 *      emailInterestList (run by hand, once) tells everyone who registered interest that support is open.
 *   6. Razorpay Standard Checkout: the website asks this script to create an order (action=create_order),
 *      opens the Razorpay window, then sends the result back (action=verify_payment). The script checks the
 *      signature with HMAC-SHA256 and the Razorpay key secret, and only then marks the row "Paid" and sends the emails.
 *      The price always comes from SETTINGS below, never from the browser.
 *   7. Sign-ups that never pay (window closed, payment failed, walked away) turn from "Pending" to "Not paid"
 *      after UNPAID_AFTER_HOURS. Trying again reuses the same row, so the sheet doesn't fill with duplicates.
 *   8. Once a day the sheet checks itself (checkSheet) and emails you only if something needs a look.
 *
 * Columns are found by their heading in row 1, so you can add your own columns or move them around.
 * Keep the headings this script made as they are.
 *
 * Secrets (the Razorpay key id and key secret) go in Project Settings → Script properties.
 * Never paste them into this file, into the sheet or into the website.
 */

const SETTINGS = {
  BUSINESS_NAME: 'Research by Srivathsa',
  REPLY_TO: 'bhargava@researchbysrivathsa.com',   // replies to our emails go here
  NOTIFY_EMAIL: '',                            // new contact/support messages go here; blank = this Google account
  TIMEZONE: 'Asia/Kolkata',

  /* weekly class: Saturday (6), 15:00 IST, 60 minutes */
  CLASS_WEEKDAY: 6,
  CLASS_START: '15:00',
  CLASS_MINUTES: 60,
  CLASS_TITLE: 'Investing basics, start to finish (live class)',
  CLASS_PRICE_INR: 199,                        // the price Checkout charges for a class seat
  CLASS_AMOUNTS_INR: [199],                    // amounts the 10-minute payment check treats as a class seat
  SUPPORT_PRICE_INR: 3000,                     // the price Checkout charges for one-year support
  SUPPORT_AMOUNTS_INR: [3000],
  SUPPORT_JOIN_URL: 'https://researchbysrivathsa.com/support.html#join-support',
  SUPPORT_ENDING_REMINDER_DAYS: 14,            // the "your year ends soon" email goes about this many days before `ends`

  /* limits against bots and floods (counted across all visitors). Real traffic is far below these. */
  MAX_FORMS_PER_10_MIN: 60,      // form submissions; above this, new ones get "please try again"
  MAX_ORDERS_PER_HOUR: 120,      // payment windows opened, all visitors together
  MAX_ORDERS_PER_EMAIL_HOUR: 10, // payment windows opened by one email address
  MAX_ALERTS_PER_HOUR: 20,       // contact/support alert emails to us; above this rows are still saved, the alert is skipped,
                                 // so a flood can't use up Gmail's daily quota that class confirmations need

  /* monthly members' Q&A call for one-year support, always on Google Meet. Nothing is sent until a date is set. */
  MEMBERS_CALL_DAY: 0,           // day of the month, e.g. 15 (a day the month doesn't have means its last day); 0 = not set
  MEMBERS_CALL_DATES: [],        // or exact dates, e.g. ['2026-11-15', '2026-12-13']; a filled list wins over MEMBERS_CALL_DAY
  MEMBERS_CALL_START: '19:00',   // IST
  MEMBERS_CALL_MINUTES: 60,
  MEMBERS_CALL_TITLE: 'Members\' Q&A call (one-year support)',
  MEMBERS_CALL_INVITE_DAYS: 7,   // members are invited this many days before each call; anyone who joins after that, straight away

  /* how people join the class */
  MEETING_TOOL: 'meet',          // 'meet' = a new Google Meet link per Saturday, made automatically
                                 // 'fixed' = everyone gets FIXED_MEETING_LINK (e.g. a recurring Zoom meeting)
  FIXED_MEETING_LINK: '',
  CALENDAR_ID: 'primary',
  SEND_CALENDAR_INVITES: true,   // Google Calendar also emails each paid guest an invite with the link

  /* sign-ups that never pay */
  UNPAID_AFTER_HOURS: 2,         // a "Pending" row with no payment after this long turns "Not paid"
  UNPAID_EMAIL: true,            // then one friendly "your booking isn't finished" email (once; never for rows over 2 days old)
  CLASS_JOIN_URL: 'https://researchbysrivathsa.com/classes.html#join',
                                 // (a payment that still arrives later turns it "Paid" as normal)
  DAILY_CHECK_HOUR: 9,           // around this hour (IST) the sheet checks itself and emails you only if something is wrong

  /* links used in emails */
  FEEDBACK_FORM_URL: '',         // e.g. a Google Form; the feedback email is skipped while this is blank
  TEST_EMAIL: ''                 // your own second address, for testBooking()
};

// Sign-up statuses: Pending (form sent, no payment yet) → Paid, or → Not paid after UNPAID_AFTER_HOURS.
// "Interest" is a one-year support register-interest row. Rows in any of OPEN_ can still be matched to a payment.
const OPEN_ = ['Pending', 'Not paid', 'Interest'];

const TABS = {
  class: {
    name: 'Class sign-ups',
    cols: ['timestamp', 'name', 'email', 'phone', 'class_date', 'class_date_label', 'lang', 'stage', 'consent',
      'status', 'payment_id', 'amount_inr', 'meeting_link', 'confirmation_sent', 'reminder_24h_sent',
      'reminder_1h_sent', 'feedback_sent', 'unpaid_email_sent', 'notes']
  },
  support: {
    name: 'One-year support',
    cols: ['timestamp', 'form_type', 'name', 'email', 'phone', 'goals', 'consent', 'terms', 'status', 'payment_id',
      'amount_inr', 'starts', 'ends', 'welcome_sent', 'ending_reminder_sent', 'last_call_invite', 'unpaid_email_sent', 'notes']
  },
  contact: { name: 'Contact', cols: ['timestamp', 'name', 'email', 'topic', 'message', 'status', 'notes'] },
  newsletter: { name: 'Newsletter', cols: ['timestamp', 'email', 'page', 'status'] },
  payments: {
    name: 'Payments',
    cols: ['seen_at', 'payment_id', 'paid_at', 'email', 'phone', 'amount_inr', 'method', 'matched_to', 'notes']
  }
};

const PRODUCTS = {
  class: { tab: 'class', label: 'Investing basics class', inr: () => SETTINGS.CLASS_PRICE_INR },
  support: { tab: 'support', label: 'One-year support', inr: () => SETTINGS.SUPPORT_PRICE_INR }
};

const DISCLAIMER = 'Educational content only. Not investment advice. Investments carry risk, including loss of capital.';
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR, IST_ = 5.5 * HOUR;

/* ===================== one-time set-up ===================== */

/** Run once from the editor: makes the tabs and the 10-minute timer. Safe to run again. */
function setup() {
  if (typeof Calendar === 'undefined') throw new Error('Add the Google Calendar API service first: Services (+) → Google Calendar API → Add.');
  Object.keys(TABS).forEach(sheet_);
  const first = SpreadsheetApp.getActive().getSheetByName('Sheet1');
  if (first && first.getLastRow() === 0 && SpreadsheetApp.getActive().getSheets().length > 1) SpreadsheetApp.getActive().deleteSheet(first);
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'every10Minutes').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('every10Minutes').timeBased().everyMinutes(10).create();
  colourStatuses_();
  console.log('Set-up done. Next: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).');
}

// Paid green, Pending amber, Not paid grey, in the status column of the sign-up tabs. Cosmetic only.
function colourStatuses_() {
  ['class', 'support'].forEach(key => {
    try {
      const sh = sheet_(key), col = header_(sh, key).indexOf('status') + 1;
      const range = sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1);
      const rule = (text, bg) => SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(text).setBackground(bg).setRanges([range]).build();
      const others = sh.getConditionalFormatRules().filter(r => !r.getRanges().some(x => x.getColumn() === col));
      sh.setConditionalFormatRules(others.concat([rule('Paid', '#D9F2E3'), rule('Pending', '#FCEFD2'), rule('Not paid', '#ECEAE6'), rule('Interest', '#E3EEFC')]));
    } catch (err) { console.log('Status colours skipped: ' + err); }
  });
}

/** Optional check: books TEST_EMAIL into the next class as if they had paid, then sends everything. */
function testBooking() {
  if (!SETTINGS.TEST_EMAIL) throw new Error('Put a test address in SETTINGS.TEST_EMAIL first (not this account itself).');
  const start = nextClass_();
  append_('class', {
    timestamp: new Date(), name: 'Test booking', email: SETTINGS.TEST_EMAIL.toLowerCase(), class_date: iso_(start),
    class_date_label: label_(start), status: 'Paid', payment_id: 'test', notes: 'Made by testBooking(); delete this row after checking'
  });
  processPaidClassRows_();
  console.log('Check ' + SETTINGS.TEST_EMAIL + ' for the confirmation and the calendar invite.');
}

/* ===================== website forms ===================== */

function doGet() {
  return ContentService.createTextOutput('Research by Srivathsa forms endpoint is running.');
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  const many = (e && e.parameters) || {};
  if (p._gotcha) return json_(true);                     // honeypot filled: a bot, pretend it worked
  if (p.action) return json_(paymentApi_(p));            // Razorpay Checkout: create_order, verify_payment

  const type = String(p.form_type || '');
  const email = clean_(p.email).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(TYPES_, type) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json_(false);

  // the same form from the same address twice inside a minute is a double tap, not two sign-ups
  const cache = CacheService.getScriptCache(), key = ('f:' + type + ':' + email).slice(0, 240);
  if (cache.get(key)) return json_(true);
  if (!rateOk_('forms', SETTINGS.MAX_FORMS_PER_10_MIN, 600)) {
    console.error('Form limit reached (' + SETTINGS.MAX_FORMS_PER_10_MIN + ' in 10 minutes); refused a ' + type + ' form');
    return json_(false);
  }
  cache.put(key, '1', 60);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    TYPES_[type](p, many, email);
  } finally {
    lock.releaseLock();
  }
  return json_(true);
}

const TYPES_ = {
  class(p, many, email) {
    // the browser sends the class it showed; fall back to the next class if that one has already started
    let start = parseDate_(p.class_date);
    if (!start || start.getTime() <= Date.now()) start = nextClass_();
    const fields = {
      name: p.name, email, phone: p.phone, class_date: iso_(start), class_date_label: label_(start),
      lang: p.lang, stage: p.stage, consent: p.consent || (p.ack && p.privacy ? 'yes' : ''), status: 'Pending'
    };
    // trying again (window closed, payment failed): reuse their unpaid row for the same class
    if (!retry_('class', fields, r => r.class_date === fields.class_date)) append_('class', Object.assign({ timestamp: new Date() }, fields));
  },
  interest(p, many, email) { supportForm_('interest', p, email); },
  support(p, many, email) { supportForm_('support', p, email); },
  contact(p, many, email) {
    append_('contact', { timestamp: new Date(), name: p.name, email, topic: p.topic, message: p.message, status: 'New' });
    notify_('Website message: ' + clean_(p.topic || 'contact'), email,
      'From: ' + clean_(p.name) + ' <' + email + '>\nTopic: ' + clean_(p.topic) + '\n\n' + clean_(p.message, 1500) +
      '\n\nReply to this email to answer them. It is also in the "Contact" tab.');
  },
  newsletter(p, many, email) {
    const { rows } = read_('newsletter');
    if (rows.some(r => r.email === email && r.status !== 'Unsubscribed')) return;
    append_('newsletter', { timestamp: new Date(), email, page: p.page, status: 'Subscribed' });
  }
};

function supportForm_(kind, p, email) {
  const fields = {
    form_type: kind, name: p.name, email, phone: p.phone, goals: p.goals || p.goal,
    consent: p.consent, terms: p.terms, status: kind === 'interest' ? 'Interest' : 'Pending'
  };
  if (kind === 'interest') {
    if (read_('support').rows.some(r => r.email === email)) return;   // already on the list
  } else if (retry_('support', fields, r => r.form_type === 'support' && r.status !== 'Interest')) {
    return;                                                            // trying again: no second alert
  }
  append_('support', Object.assign({ timestamp: new Date() }, fields));
  notify_((kind === 'interest' ? 'Support interest: ' : 'Support sign-up (payment next): ') + clean_(p.name), email,
    'Name: ' + clean_(p.name) + '\nEmail: ' + email + (p.phone ? '\nPhone: ' + clean_(p.phone) : '') +
    ((p.goals || p.goal) ? '\nWants to understand: ' + clean_(p.goals || p.goal, 1200) : '') +
    '\n\nIt is also in the "' + TABS.support.name + '" tab.');
}

// If this email already has an unpaid row (Pending or Not paid) that `same` accepts, refresh it instead of adding a row.
// The timestamp restarts, so the UNPAID_AFTER_HOURS clock starts again from this try.
function retry_(tab, fields, same) {
  const { sh, cols, rows } = read_(tab);
  const row = rows.filter(r => r.email === fields.email && (r.status === 'Pending' || r.status === 'Not paid') && same(r)).pop();
  if (!row) return false;
  const keep = {};
  Object.keys(fields).forEach(k => { if (fields[k] != null && fields[k] !== '') keep[k] = fields[k]; });
  keep.notes = 'Tried again ' + stamp_();
  update_(sh, cols, row._row, keep);
  setTime_(sh, cols, row._row, 'timestamp', new Date());
  return true;
}

/* ===================== Razorpay Checkout (create order, verify payment) =====================
   Apps Script web apps always answer with HTTP 200, so every reply carries its own "status"
   (200, 400, 401, 500) and "ok" for the website to read. */

function paymentApi_(p) {
  try {
    if (p.action === 'create_order') return createOrder_(p);
    if (p.action === 'verify_payment') return verifyPayment_(p);
    return reply_(400, 'unknown_action', 'Something went wrong. Please try again.');
  } catch (err) {
    console.error('paymentApi_ ' + p.action + ': ' + (err && err.stack || err));
    return reply_(500, 'server', 'Something went wrong on our side. Please try again, or email ' + SETTINGS.REPLY_TO + '.');
  }
}

function reply_(status, error, message, extra) {
  return Object.assign({ ok: false, status, error, message }, extra || {});
}

function razorpayKeys_() {
  const props = PropertiesService.getScriptProperties();
  // trim: a space or line break picked up when pasting makes Razorpay reject the key (401)
  const id = String(props.getProperty('RAZORPAY_KEY_ID') || '').trim(), secret = String(props.getProperty('RAZORPAY_KEY_SECRET') || '').trim();
  return id && secret ? { id, secret } : null;
}

function razorpay_(keys, method, path, body) {
  const opt = { method, muteHttpExceptions: true, headers: { Authorization: 'Basic ' + Utilities.base64Encode(keys.id + ':' + keys.secret) } };
  if (body) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
  const res = UrlFetchApp.fetch('https://api.razorpay.com/v1' + path, opt);
  let data = {};
  try { data = JSON.parse(res.getContentText()); } catch (e) { /* keep {} */ }
  return { code: res.getResponseCode(), data };
}

// Step 1: the website sends the product and the visitor's details; we make the Razorpay order.
function createOrder_(p) {
  const product = PRODUCTS[String(p.product || '')];
  const email = clean_(p.email).toLowerCase();
  if (!product || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply_(400, 'bad_request', 'Please check your details and try again.');
  if (!rateOk_('order:' + email, SETTINGS.MAX_ORDERS_PER_EMAIL_HOUR, 3600) || !rateOk_('orders', SETTINGS.MAX_ORDERS_PER_HOUR, 3600)) {
    return reply_(429, 'busy', 'Too many tries in a short time. Please wait a few minutes and try again, or email ' + SETTINGS.REPLY_TO + '.');
  }
  const keys = razorpayKeys_();
  if (!keys) return reply_(500, 'not_configured', 'Online payment is not switched on yet. Your details are saved. Please email ' + SETTINGS.REPLY_TO + ' and we will sort it out.');

  const paise = Math.round(product.inr() * 100);          // the price is ours, never the browser's
  if (!(paise >= 100)) return reply_(500, 'bad_amount', 'Something went wrong on our side. Please email ' + SETTINGS.REPLY_TO + '.');

  const notes = { product: p.product, email, name: clean_(p.name, 100), phone: clean_(p.phone, 20) };
  if (p.product === 'class') notes.class_date = iso_(classStartFor_(p.class_date));
  const res = razorpay_(keys, 'post', '/orders', {
    amount: paise, currency: 'INR', receipt: ('rbs_' + p.product + '_' + Date.now()).slice(0, 40), notes
  });
  if (res.code === 401) {
    console.error('Razorpay rejected the key id / secret in Script properties');
    return reply_(401, 'auth', 'Online payment is not set up correctly yet. Your details are saved. Please email ' + SETTINGS.REPLY_TO + '.');
  }
  if (res.code !== 200 || !res.data.id) {
    console.error('Razorpay create order ' + res.code + ': ' + JSON.stringify(res.data).slice(0, 300));
    return reply_(500, 'razorpay', 'We could not start the payment. Please try again in a moment.');
  }
  return {
    ok: true, status: 200, order_id: res.data.id, amount: res.data.amount, currency: res.data.currency,
    key_id: keys.id, name: SETTINGS.BUSINESS_NAME, description: product.label
  };
}

// Step 2: the Razorpay window returns three values; only a matching signature marks anything as paid.
function verifyPayment_(p) {
  const orderId = clean_(p.razorpay_order_id, 60), payId = clean_(p.razorpay_payment_id, 60), sig = clean_(p.razorpay_signature, 128);
  if (!orderId || !payId || !sig) return reply_(400, 'missing_fields', 'Missing payment details.');
  const keys = razorpayKeys_();
  if (!keys) return reply_(500, 'not_configured', 'Online payment is not switched on yet.');

  if (!safeEqual_(hmacHex_(orderId + '|' + payId, keys.secret), sig.toLowerCase())) {
    console.error('Signature mismatch for ' + payId);
    return reply_(400, 'bad_signature', 'We could not confirm this payment.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const paid = razorpay_(keys, 'get', '/payments/' + encodeURIComponent(payId));
    if (paid.code !== 200 || paid.data.order_id !== orderId) return reply_(400, 'unknown_payment', 'We could not confirm this payment.');
    // authorised but not captured (auto-capture off or slow): capture it now, so it is never auto-refunded
    if (paid.data.status === 'authorized') paid.data = capture_(keys, paid.data) || paid.data;
    if (paid.data.status !== 'captured') {
      // still not captured: the 10-minute payment check finishes the job
      return { ok: true, status: 200, state: 'pending_capture' };
    }
    if (read_('payments').rows.some(r => r.payment_id === payId)) return { ok: true, status: 200, state: 'already_recorded' };

    const order = razorpay_(keys, 'get', '/orders/' + encodeURIComponent(orderId));
    const pay = paid.data;
    pay.notes = Object.assign({}, order.data.notes || {}, Array.isArray(pay.notes) ? {} : pay.notes);
    recordPayment_(pay);
    processPaidClassRows_();
    processPaidSupport_();
  } finally {
    lock.releaseLock();
  }
  return { ok: true, status: 200, state: 'paid' };
}

// Captures an authorised payment for one of our prices. Returns the captured payment, or null.
function capture_(keys, pay) {
  const known = SETTINGS.CLASS_AMOUNTS_INR.concat(SETTINGS.SUPPORT_AMOUNTS_INR, [SETTINGS.CLASS_PRICE_INR, SETTINGS.SUPPORT_PRICE_INR]);
  if (known.indexOf(pay.amount / 100) === -1) return null;
  const res = razorpay_(keys, 'post', '/payments/' + encodeURIComponent(pay.id) + '/capture', { amount: pay.amount, currency: pay.currency || 'INR' });
  if (res.code === 200 && res.data.status === 'captured') return res.data;
  console.error('Capture ' + pay.id + ' ' + res.code + ': ' + JSON.stringify(res.data).slice(0, 300));
  return null;
}

function hmacHex_(message, key) {
  return Utilities.computeHmacSha256Signature(message, key).map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// The class this order is for: the date the form showed, unless that class has already started.
function classStartFor_(v) {
  const d = parseDate_(v);
  return d && d.getTime() > Date.now() ? d : nextClass_();
}

/* ===================== the 10-minute timer ===================== */

function every10Minutes() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;                      // the last run is still going
  try {
    [syncRazorpay_, processPaidClassRows_, sendClassReminders_, processPaidSupport_, sendSupportEndingReminders_,
      inviteToMembersCalls_, expireUnpaid_, emailUnpaid_, dailyCheck_].forEach(step => {
      try { step(); } catch (err) { console.error(step.name + ': ' + (err && err.stack || err)); }
    });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- 1. Razorpay → "Paid" ---------- */

function syncRazorpay_() {
  const props = PropertiesService.getScriptProperties();
  const keys = razorpayKeys_();
  if (!keys) return;                                     // not connected yet: mark rows "Paid" by hand instead

  const now = Math.floor(Date.now() / 1000);
  const last = Number(props.getProperty('RAZORPAY_SYNCED_TO')) || now - 3 * 86400;
  const from = last - 3600;                              // overlap, so a payment captured late is not missed
  const seen = new Set(read_('payments').rows.map(r => r.payment_id));

  let skip = 0, items;
  do {
    const res = razorpay_(keys, 'get', '/payments?from=' + from + '&to=' + now + '&count=100&skip=' + skip);
    if (res.code !== 200) throw new Error('Razorpay said ' + res.code + ': ' + JSON.stringify(res.data).slice(0, 300));
    items = res.data.items || [];
    items.slice().reverse().forEach(pay => {
      if (seen.has(pay.id)) return;
      // authorised for a few minutes and still not captured: capture it ourselves
      if (pay.status === 'authorized' && pay.created_at < now - 300) pay = Object.assign({ notes: pay.notes }, capture_(keys, pay) || pay);
      if (pay.status === 'captured') { seen.add(pay.id); recordPayment_(pay); }
      else if (pay.status === 'failed') noteFailure_(pay);
    });
    skip += items.length;
  } while (items.length === 100);
  props.setProperty('RAZORPAY_SYNCED_TO', String(now));
}

// A failed attempt is written on the person's unpaid row, so you can see why they didn't get through.
function noteFailure_(pay) {
  const notes = pay.notes && !Array.isArray(pay.notes) ? pay.notes : {};
  const email = clean_(notes.email || pay.email).toLowerCase();
  if (!email) return;
  const tab = SETTINGS.SUPPORT_AMOUNTS_INR.indexOf(pay.amount / 100) !== -1 ? 'support' : 'class';
  const { sh, cols, rows } = read_(tab);
  const row = rows.filter(r => r.email === email && (r.status === 'Pending' || r.status === 'Not paid')).pop();
  if (!row || String(row.notes).indexOf(pay.id) !== -1) return;
  const why = clean_(pay.error_description || pay.error_reason || 'no reason given', 160);
  update_(sh, cols, row._row, { notes: 'Payment ' + pay.id + ' failed ' + iso_(new Date(pay.created_at * 1000)).slice(0, 16).replace('T', ' ') + ': ' + why });
}

function recordPayment_(pay) {
  const notes = pay.notes && !Array.isArray(pay.notes) ? pay.notes : {};
  const email = clean_(notes.email || pay.email).toLowerCase();   // notes.email is the address given on the website form
  const rupees = pay.amount / 100;
  // Payment Pages store their form fields in notes; the name field's key depends on how the page was built
  const nameKey = Object.keys(notes).find(k => /name/i.test(k));
  const who = { email, name: nameKey ? clean_(notes[nameKey]) : '', phone: clean_(pay.contact), pay };

  let matched = 'not matched';
  const product = PRODUCTS[notes.product];
  if (product && rupees === product.inr()) matched = markPaid_(product.tab, who);
  else if (SETTINGS.CLASS_AMOUNTS_INR.indexOf(rupees) !== -1) matched = markPaid_('class', who);
  else if (SETTINGS.SUPPORT_AMOUNTS_INR.indexOf(rupees) !== -1) matched = markPaid_('support', who);

  append_('payments', {
    seen_at: new Date(), payment_id: pay.id, paid_at: iso_(new Date(pay.created_at * 1000)), email, phone: pay.contact,
    amount_inr: rupees, method: pay.method, matched_to: matched
  });
  if (matched === 'not matched') {
    notify_('Razorpay payment we could not match: ₹' + rupees, '', 'Payment ' + pay.id + ' from ' + (email || 'no email') +
      ' for ₹' + rupees + ' does not match the class or support price. See the "Payments" tab.');
  }
}

// Marks the newest unpaid sign-up from the same email as paid, or adds a row if there isn't one.
function markPaid_(tab, who) {
  const { sh, cols, rows } = read_(tab);
  // newest open row wins; a support sign-up beats an older register-interest row
  const open = rows.filter(r => r.email === who.email && OPEN_.indexOf(r.status) !== -1);
  const row = open.filter(r => r.status !== 'Interest').pop() || open.pop();
  const fields = { status: 'Paid', payment_id: who.pay.id, amount_inr: who.pay.amount / 100 };
  if (row && row.status === 'Not paid') fields.notes = 'Paid after being marked Not paid';
  if (tab === 'support') {
    // the year runs from the day of payment
    const paid = new Date(who.pay.created_at * 1000), end = new Date(paid);
    end.setFullYear(end.getFullYear() + 1);
    fields.starts = dayIST_(paid);
    fields.ends = dayIST_(end);
  }
  if (tab === 'class') {
    // paid after their class started (or never picked one): they get the next class instead
    const start = row && parseDate_(row.class_date);
    if (!start || start.getTime() <= Date.now()) {
      const next = nextClass_();
      fields.class_date = iso_(next);
      fields.class_date_label = label_(next);
    }
  }
  if (row) {
    update_(sh, cols, row._row, fields);
    return TABS[tab].name + ' row ' + row._row;
  }
  const r = append_(tab, Object.assign({ timestamp: new Date(), form_type: 'payment', name: who.name, email: who.email, phone: who.phone,
    notes: 'Row made from the Razorpay payment: no website sign-up with this email' }, fields));
  return TABS[tab].name + ' row ' + r + ' (new)';
}

/* ---------- 2. paid class seat → calendar guest + confirmation ---------- */

function processPaidClassRows_() {
  const { sh, cols, rows } = read_('class');
  rows.filter(r => r.status === 'Paid' && !r.confirmation_sent && r.email).forEach(r => {
    try {
      let start = parseDate_(r.class_date);
      if (!start || start.getTime() <= Date.now()) {
        start = nextClass_();
        update_(sh, cols, r._row, { class_date: iso_(start), class_date_label: label_(start) });
      }
      const link = addClassGuest_(start, r.email, r.name);
      sendMail_(r.email, 'You\'re booked: ' + label_(start, true), confirmationText_(r, start, link));
      update_(sh, cols, r._row, { meeting_link: link, confirmation_sent: stamp_() });
    } catch (err) {
      update_(sh, cols, r._row, { notes: 'Confirmation failed, will retry: ' + String(err).slice(0, 200) });
      console.error('Row ' + r._row + ': ' + (err && err.stack || err));
    }
  });
}

// One calendar event per class date, made on first use; each paid person is added as a guest.
// Guests can't see each other's emails, and joining with the invited email skips the "ask to join" wait.
function addClassGuest_(start, email, name) {
  let ev = classEvent_(start);
  const guests = ev.attendees || [];
  const want = [{ email, name }];
  // a replacement event (the old one was deleted by hand): bring everyone already booked for this class across,
  // so the whole class still shares one meeting
  const booked = ev._new ? read_('class') : null;
  const moved = booked ? booked.rows.filter(r => r.status === 'Paid' && r.email && r.email !== email && r.confirmation_sent && r.class_date === iso_(start)) : [];
  moved.forEach(r => want.push({ email: r.email, name: r.name }));
  const add = want.filter(w => !guests.some(g => String(g.email).toLowerCase() === w.email));
  if (add.length) {
    add.forEach(w => guests.push({ email: w.email, displayName: w.name || undefined }));
    ev = Calendar.Events.patch({ attendees: guests }, SETTINGS.CALENDAR_ID, ev.id,
      { sendUpdates: SETTINGS.SEND_CALENDAR_INVITES ? 'all' : 'none', conferenceDataVersion: 1 });
  }
  const link = meetingLink_(ev);
  if (!link) throw new Error('The calendar event has no meeting link yet');
  moved.forEach(r => update_(booked.sh, booked.cols, r._row, { meeting_link: link }));   // their reminders carry the new link
  return link;
}

function classEvent_(start) {
  return calendarEvent_('EVENT_', start, {
    title: SETTINGS.CLASS_TITLE, minutes: SETTINGS.CLASS_MINUTES, meet: SETTINGS.MEETING_TOOL === 'meet',
    description: 'Live class from ' + SETTINGS.BUSINESS_NAME + '. Please join with the email address this invite was sent to.\n\n' +
      'Not recorded. General Q&A only, not personal advice.\n' + DISCLAIMER
  });
}

// One event per start time, made on first use and remembered in Script properties under prefix + start time.
function calendarEvent_(prefix, start, o) {
  const props = PropertiesService.getScriptProperties();
  const key = prefix + iso_(start).slice(0, 16);
  const saved = props.getProperty(key);
  if (saved) {
    const ev = savedEvent_(saved);
    if (ev && ev.status !== 'cancelled') return ev;
  }
  // the remembered id is missing or gone: look on the calendar first, so one session never gets two meetings
  const found = findEvent_(key, start, o.title);
  if (found) {
    props.setProperty(key, found.id);
    return found;
  }
  const end = new Date(start.getTime() + o.minutes * MIN);
  const body = {
    summary: o.title,
    description: o.description,
    start: { dateTime: start.toISOString(), timeZone: SETTINGS.TIMEZONE },
    end: { dateTime: end.toISOString(), timeZone: SETTINGS.TIMEZONE },
    guestsCanSeeOtherGuests: false,
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    extendedProperties: { private: { rbsKey: key } }    // lets findEvent_ recognise it later
  };
  if (o.meet) {
    body.conferenceData = { createRequest: { requestId: Utilities.getUuid(), conferenceSolutionKey: { type: 'hangoutsMeet' } } };
  } else {
    body.location = SETTINGS.FIXED_MEETING_LINK;
  }
  let ev = Calendar.Events.insert(body, SETTINGS.CALENDAR_ID, { conferenceDataVersion: 1, sendUpdates: 'none' });
  // Google sometimes takes a moment to attach the Meet link
  for (let i = 0; i < 5 && o.meet && !meetingLink_(ev, true); i++) {
    Utilities.sleep(2000);
    ev = Calendar.Events.get(SETTINGS.CALENDAR_ID, ev.id);
  }
  props.setProperty(key, ev.id);
  ev._new = true;
  return ev;
}

// The event behind a remembered id, or null if it has been deleted. Any other Calendar error is thrown,
// so a passing hiccup means "try again in 10 minutes", never "make a second meeting".
function savedEvent_(id) {
  try {
    return Calendar.Events.get(SETTINGS.CALENDAR_ID, id) || null;
  } catch (err) {
    if (/not found|404|410|deleted/i.test(String(err))) return null;
    throw err;
  }
}

// An event already on the calendar for this session: ours by its private key, or one starting at the same minute with the same title.
function findEvent_(key, start, title) {
  const res = Calendar.Events.list(SETTINGS.CALENDAR_ID, {
    timeMin: new Date(start.getTime() - MIN).toISOString(), timeMax: new Date(start.getTime() + MIN).toISOString(),
    singleEvents: true, maxResults: 50
  });
  const same = ((res && res.items) || []).filter(e => e.status !== 'cancelled' && e.start && new Date(e.start.dateTime).getTime() === start.getTime());
  return same.find(e => ((e.extendedProperties || {}).private || {}).rbsKey === key) || same.find(e => e.summary === title) || null;
}

// The link a booked person should use now: the class event's current link (updating their row if it changed), else the one they were sent.
function liveClassLink_(sh, cols, r, start) {
  try {
    const id = PropertiesService.getScriptProperties().getProperty('EVENT_' + iso_(start).slice(0, 16));
    const ev = id && savedEvent_(id);
    const link = ev && ev.status !== 'cancelled' && meetingLink_(ev);
    if (link && link !== r.meeting_link) update_(sh, cols, r._row, { meeting_link: link });
    return link || r.meeting_link;
  } catch (err) {
    return r.meeting_link;
  }
}

function meetingLink_(ev, meet = SETTINGS.MEETING_TOOL === 'meet') {
  if (!meet) return SETTINGS.FIXED_MEETING_LINK;
  if (ev.hangoutLink) return ev.hangoutLink;
  const video = ev.conferenceData && (ev.conferenceData.entryPoints || []).find(x => x.entryPointType === 'video');
  return video ? video.uri : '';
}

/* ---------- 3. reminders and feedback ---------- */

function sendClassReminders_() {
  const { sh, cols, rows } = read_('class');
  const now = Date.now();
  rows.filter(r => r.status === 'Paid' && r.confirmation_sent && r.email).forEach(r => {
    try { remindOne_(sh, cols, r, now); } catch (err) { console.error('Reminder row ' + r._row + ': ' + (err && err.stack || err)); }
  });
}

function remindOne_(sh, cols, r, now) {
  const start = parseDate_(r.class_date);
  if (!start) return;
  const until = start.getTime() - now;
  const sentAgo = now - (parseDate_(r.confirmation_sent) || new Date(0)).getTime();
  const link = () => liveClassLink_(sh, cols, r, start);   // always the class's one current link

  if (!r.reminder_24h_sent && until <= 24 * HOUR && until > HOUR) {
    // booked within the last few hours: the confirmation is reminder enough
    const skip = until < 3 * HOUR || sentAgo < 3 * HOUR;
    if (!skip) sendMail_(r.email, 'Tomorrow: your class at ' + timeIST_(start) + ' IST', reminderText_(r, start, link(), 'tomorrow'));
    update_(sh, cols, r._row, { reminder_24h_sent: skip ? 'skipped' : stamp_() });
  }
  if (!r.reminder_1h_sent && until <= 70 * MIN && until > 0) {
    const skip = sentAgo < 30 * MIN;
    if (!skip) sendMail_(r.email, 'Starting soon: your class at ' + timeIST_(start) + ' IST', reminderText_(r, start, link(), 'soon'));
    update_(sh, cols, r._row, { reminder_1h_sent: skip ? 'skipped' : stamp_() });
  }
  const after = now - (start.getTime() + SETTINGS.CLASS_MINUTES * MIN);
  if (!r.feedback_sent && SETTINGS.FEEDBACK_FORM_URL && after > 15 * MIN && after < 3 * 24 * HOUR) {
    sendMail_(r.email, 'How was the class?', feedbackText_(r));
    update_(sh, cols, r._row, { feedback_sent: stamp_() });
  }
}

/* ---------- 4. paid one-year support → welcome email ---------- */

function processPaidSupport_() {
  const { sh, cols, rows } = read_('support');
  rows.filter(r => r.status === 'Paid' && !r.welcome_sent && r.email).forEach(r => {
    try { welcomeOne_(sh, cols, r); } catch (err) { console.error('Welcome row ' + r._row + ': ' + (err && err.stack || err)); }
  });
}

function welcomeOne_(sh, cols, r) {
  const next = membersCalls_(new Date(), new Date(Date.now() + 400 * DAY))[0];
  sendMail_(r.email, 'Welcome to one-year support', [
    'Hi ' + first_(r.name) + ',', '',
    'Thank you, your payment has come through. Your one-year support runs from ' + (r.starts || 'today') +
      (r.ends ? ' to ' + r.ends : ' for 12 months') + '.', '',
    'How it works:',
    '- Questions: email them to ' + SETTINGS.REPLY_TO + ' (or just reply to this email) from this address. We reply within 1 day.',
    '- Members\' Q&A call: once a month, live on Google Meet. ' + (next ? 'The next one is on ' + callLabel_(next) +
      ', and we\'ll email you the link ahead of each call.' : 'We\'ll email you the date and link ahead of each one.'), '',
    'Ask about anything to do with how investing works. We explain how things work; we don\'t tell anyone what to buy, sell or hold.', '',
    r.payment_id && r.payment_id !== 'test' ? 'Payment reference: ' + r.payment_id + '\n' : '',
    'Glad to have you with us,', SETTINGS.BUSINESS_NAME, '', DISCLAIMER
  ].join('\n'));
  update_(sh, cols, r._row, { welcome_sent: stamp_() });
}

/* ---------- 5. one-year support ends soon → reminder ---------- */

function sendSupportEndingReminders_() {
  const { sh, cols, rows } = read_('support');
  const now = Date.now(), paid = rows.filter(r => r.status === 'Paid' && r.email);
  paid.filter(r => !r.ending_reminder_sent).forEach(r => {
    try {
      const end = parseDay_(r.ends);                     // midnight IST on their last day; checkSheet lists dates it can't read
      if (!end || end.getTime() - now > SETTINGS.SUPPORT_ENDING_REMINDER_DAYS * DAY) return;
      if (now >= end.getTime() + DAY) return update_(sh, cols, r._row, { ending_reminder_sent: 'skipped: year already over' });
      // already paid for another year that ends later: no "join again" email
      if (paid.some(o => o !== r && o.email === r.email && parseDay_(o.ends) > end)) return update_(sh, cols, r._row, { ending_reminder_sent: 'skipped: renewed' });
      sendMail_(r.email, 'Your one-year support ends on ' + dayIST_(end), endingText_(r, end));
      update_(sh, cols, r._row, { ending_reminder_sent: stamp_() });
    } catch (err) { console.error('Ending reminder row ' + r._row + ': ' + (err && err.stack || err)); }
  });
}

/* ---------- 6. monthly members' Q&A call → calendar guests + email ---------- */

// Members' call start times after `from`, up to `to`: MEMBERS_CALL_DATES if filled, otherwise MEMBERS_CALL_DAY of each month.
function membersCalls_(from, to) {
  const hm = SETTINGS.MEMBERS_CALL_START.split(':').map(Number), out = [];
  const at = (y, m, d, h, min) => new Date(Date.UTC(y, m, d, h, min) - IST_);
  if (SETTINGS.MEMBERS_CALL_DATES.length) {
    SETTINGS.MEMBERS_CALL_DATES.forEach(v => {
      const m = CALL_DATE_.exec(String(v).trim());
      if (m) out.push(at(+m[1], m[2] - 1, +m[3], m[4] ? +m[4] : hm[0], m[4] ? +m[5] : hm[1]));
    });
  } else if (SETTINGS.MEMBERS_CALL_DAY > 0) {
    const t = new Date(from.getTime() + IST_);
    for (let i = 0; i < 14; i++) {
      const y = t.getUTCFullYear(), m = t.getUTCMonth() + i, last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      out.push(at(y, m, Math.min(SETTINGS.MEMBERS_CALL_DAY, last), hm[0], hm[1]));
    }
  }
  return out.filter(d => d > from && d <= to).sort((a, b) => a - b);
}

const CALL_DATE_ = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/;   // 2026-11-15, or 2026-11-15 19:00 (IST)

// A paid year covers a call from its first day to its last day, both included.
function covers_(r, start) {
  const from = parseDay_(r.starts), end = parseDay_(r.ends);
  return !!end && (!from || from <= start) && start.getTime() < end.getTime() + DAY;
}

function inviteToMembersCalls_() {
  const now = new Date();
  const planned = new Set(membersCalls_(now, new Date(now.getTime() + 400 * DAY)).map(iso_));
  membersCalls_(now, new Date(now.getTime() + SETTINGS.MEMBERS_CALL_INVITE_DAYS * DAY)).forEach(start => {
    const { sh, cols, rows } = read_('support');
    const members = rows.filter(r => r.status === 'Paid' && r.email && covers_(r, start));
    if (!members.length) return;                         // nobody to invite: no event
    const link = addCallGuests_(start, members);
    // one email per person per call, even with two rows (a renewal). last_call_invite is the latest call they were emailed
    // about: this one, or a later one still planned (two calls in one week). A call moved earlier is emailed again.
    const when = iso_(start);
    const invited = r => r.last_call_invite === when || (parseDate_(r.last_call_invite) > start && planned.has(r.last_call_invite));
    const told = new Set(members.filter(invited).map(r => r.email));
    members.filter(r => !invited(r)).forEach(r => {
      try {
        if (!told.has(r.email)) sendMail_(r.email, 'Members\' Q&A call: ' + label_(start, true), callText_(r, start, link));
        told.add(r.email);
        update_(sh, cols, r._row, { last_call_invite: when });
      } catch (err) { console.error('Call invite row ' + r._row + ': ' + (err && err.stack || err)); }
    });
  });
}

// Adds everyone not on the call's guest list yet, in one change, so earlier guests aren't sent the invite again.
function addCallGuests_(start, members) {
  let ev = calendarEvent_('CALL_EVENT_', start, {
    title: SETTINGS.MEMBERS_CALL_TITLE, minutes: SETTINGS.MEMBERS_CALL_MINUTES, meet: true,
    description: 'Monthly members\' Q&A call for one-year support from ' + SETTINGS.BUSINESS_NAME +
      '. Please join with the email address this invite was sent to.\n\n' +
      'Not recorded. General questions about how investing works, not personal advice.\n' + DISCLAIMER
  });
  const guests = (ev.attendees || []).slice(), have = new Set(guests.map(g => String(g.email).toLowerCase()));
  members.forEach(r => {
    if (have.has(r.email)) return;
    have.add(r.email);
    guests.push({ email: r.email, displayName: r.name || undefined });
  });
  if (guests.length > (ev.attendees || []).length) {
    ev = Calendar.Events.patch({ attendees: guests }, SETTINGS.CALENDAR_ID, ev.id,
      { sendUpdates: SETTINGS.SEND_CALENDAR_INVITES ? 'all' : 'none', conferenceDataVersion: 1 });
  }
  const link = meetingLink_(ev, true);
  if (!link) throw new Error('The members\' call event has no Meet link yet');
  return link;
}

/* ---------- 7. one-off: tell the register-interest list that support is open ---------- */

/** Run by hand from the editor, once: emails each "Interest" row that support is open. Never runs by itself. */
function emailInterestList() {
  const { sh, cols, rows } = read_('support');
  const SENT = 'Support-open email sent';
  const joined = new Set(rows.filter(r => r.status !== 'Interest').map(r => r.email));   // signed up, paid or cancelled
  const done = new Set(rows.filter(r => String(r.notes).indexOf(SENT) !== -1).map(r => r.email));
  let room = MailApp.getRemainingDailyQuota() - 10;      // keep a few for today's class and support emails
  const out = { sent: 0, skipped: 0, left: 0 };
  rows.filter(r => r.status === 'Interest' && r.email && !/Support-open email (sent|skipped)/.test(r.notes)).forEach(r => {
    const note = text => update_(sh, cols, r._row, { notes: r.notes ? r.notes + ' · ' + text : text });
    if (joined.has(r.email) || done.has(r.email)) {
      note('Support-open email skipped: ' + (joined.has(r.email) ? 'already has a sign-up row' : 'sent on another row'));
      out.skipped++;
      return;
    }
    if (out.sent >= room) { out.left++; return; }
    try {
      sendMail_(r.email, 'One-year support is now open', interestText_(r));
    } catch (err) {
      console.error('Interest row ' + r._row + ': ' + err);
      room = 0; out.left++;
      return;
    }
    done.add(r.email);
    out.sent++;
    note(SENT + ' ' + stamp_());
  });
  console.log('Sent ' + out.sent + ', skipped ' + out.skipped + ' (already signed up or already emailed). ' +
    (out.left ? out.left + ' still to send: today\'s email limit is nearly used up, so run emailInterestList again tomorrow.' : 'Nobody is left to email.'));
  return out;
}

/* ---------- 8. sign-ups that never paid → "Not paid" ---------- */

function expireUnpaid_() {
  const cutoff = Date.now() - SETTINGS.UNPAID_AFTER_HOURS * HOUR;
  const why = 'No payment within ' + SETTINGS.UNPAID_AFTER_HOURS + ' hours';
  ['class', 'support'].forEach(tab => {
    const { sh, cols, rows } = read_(tab);
    rows.filter(r => r.status === 'Pending').forEach(r => {
      const t = parseDate_(r.timestamp);
      if (!t || t.getTime() > cutoff) return;
      update_(sh, cols, r._row, { status: 'Not paid', notes: r.notes ? r.notes + ' · ' + why : why });
    });
  });
}

// One friendly email to someone whose booking wasn't finished: once per person per week, only for sign-ups from the
// last 2 days (older rows stay quiet), and never if they have since paid.
function emailUnpaid_() {
  if (!SETTINGS.UNPAID_EMAIL) return;
  const now = Date.now();
  ['class', 'support'].forEach(tab => {
    const { sh, cols, rows } = read_(tab);
    rows.filter(r => r.status === 'Not paid' && r.email && !r.unpaid_email_sent).forEach(r => {
      const t = parseDate_(r.timestamp);
      if (!t || now - t.getTime() > 2 * DAY) return;
      const mine = rows.filter(x => x.email === r.email);
      const paid = mine.some(x => x.status === 'Paid' && (tab === 'class'
        ? (parseDate_(x.class_date) || new Date(0)).getTime() > now
        : (parseDay_(x.ends) || new Date(now + DAY)).getTime() > now));
      const lately = mine.some(x => x.unpaid_email_sent && now - (parseDate_(x.unpaid_email_sent) || new Date(0)).getTime() < 7 * DAY);
      if (paid || lately) { update_(sh, cols, r._row, { unpaid_email_sent: 'skipped' }); return; }
      try {
        if (tab === 'class') sendMail_(r.email, 'Your seat isn\'t booked yet', unpaidClassText_(r));
        else sendMail_(r.email, 'Your one-year support isn\'t set up yet', unpaidSupportText_(r));
        update_(sh, cols, r._row, { unpaid_email_sent: stamp_() });
      } catch (err) {
        console.error('Unpaid email row ' + r._row + ': ' + err);   // tried again on the next run
      }
    });
  });
}

/* ---------- 9. the sheet checks itself ---------- */

const KNOWN_STATUS_ = { class: ['Pending', 'Paid', 'Not paid', 'Cancelled'], support: ['Interest', 'Pending', 'Paid', 'Not paid', 'Cancelled'] };

/** Run from the editor any time: lists anything in the sheet that needs a look (see the log below the code). */
function checkSheet() {
  const problems = sheetProblems_(true);
  const next = nextClass_(), seats = read_('class').rows.filter(r => r.status === 'Paid' && r.class_date === iso_(next)).length;
  console.log('Next class ' + label_(next) + ': ' + seats + ' paid seat' + (seats === 1 ? '' : 's') + '.');
  console.log(problems.length ? 'Needs a look:\n- ' + problems.join('\n- ') : 'All good: nothing in the sheet needs a look.');
  return problems;
}

// Once a day, after DAILY_CHECK_HOUR IST: email the owner only if the check finds something.
function dailyCheck_() {
  const props = PropertiesService.getScriptProperties(), now = stamp_();
  const today = now.slice(0, 10), hour = Number(now.slice(11, 13));
  if (hour < SETTINGS.DAILY_CHECK_HOUR || props.getProperty('LAST_CHECK') === today) return;
  props.setProperty('LAST_CHECK', today);
  const problems = sheetProblems_(false);
  if (!problems.length) return;
  notify_('Sheet check: ' + problems.length + ' thing' + (problems.length === 1 ? '' : 's') + ' to look at', '',
    'Today\'s check of the sign-up sheet found:\n\n- ' + problems.join('\n- ') +
    '\n\nTo see this list again, open Extensions → Apps Script, pick checkSheet and press Run.');
}

function sheetProblems_(manual) {
  const out = [], now = Date.now(), keys = razorpayKeys_();
  const age = r => { const t = parseDate_(r.timestamp); return t ? now - t.getTime() : null; };
  if (!keys) out.push('Razorpay keys are missing from Script properties, so nobody can pay on the site.');
  else if (manual && /^rzp_test_/.test(keys.id)) out.push('Razorpay is in test mode (the key id starts rzp_test_), so no real money is being taken yet.');
  if (manual && !ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'every10Minutes')) {
    out.push('The 10-minute timer is missing, so payments, emails and reminders are not running. Run setup once.');
  }

  const members = new Set();
  ['class', 'support'].forEach(tab => {
    const name = TABS[tab].name, paidTwice = {}, links = {};
    read_(tab).rows.forEach(r => {
      if (!r.status && !r.email) return;                           // blank row
      const at = name + ' row ' + r._row + (r.email ? ' (' + r.email + ')' : '');
      const a = age(r);
      if (!r.email) out.push(at + ': no email address, so the script can\'t contact them.');
      if (KNOWN_STATUS_[tab].indexOf(r.status) === -1) out.push(at + ': the status "' + r.status + '" isn\'t one the script knows (' + KNOWN_STATUS_[tab].join(', ') + '). Check the spelling.');
      if (r.status === 'Pending' && a === null) out.push(at + ': Pending with no readable timestamp, so it will never turn Not paid. Fill in the timestamp or change the status.');
      if (r.status === 'Pending' && a > (SETTINGS.UNPAID_AFTER_HOURS + 1) * HOUR) out.push(at + ': still Pending after ' + SETTINGS.UNPAID_AFTER_HOURS + ' hours. Is the 10-minute timer running?');
      if (r.status !== 'Paid' || !r.email) return;
      if (tab === 'class') {
        if (!r.confirmation_sent && (a === null || a > 30 * MIN)) out.push(at + ': Paid, but no confirmation email has gone out. ' + (r.notes || ''));
        const when = parseDate_(r.class_date);
        if (r.meeting_link && when && when.getTime() > now) {
          const seen = links[r.class_date];
          if (!seen) links[r.class_date] = { link: r.meeting_link, row: r._row };
          else if (seen.link !== r.meeting_link) out.push(name + ' rows ' + seen.row + ' and ' + r._row + ': two different Meet links for ' + (r.class_date_label || r.class_date) +
            '. Everyone in one class should share one link. Reminders send the current link, but check the calendar for a second event that day.');
        }
        const k = r.email + ' ' + r.class_date;
        if (paidTwice[k]) out.push(name + ' rows ' + paidTwice[k] + ' and ' + r._row + ': ' + r.email + ' has paid twice for ' + (r.class_date_label || r.class_date) + '. Move one seat to a later Saturday and let them know.');
        else paidTwice[k] = r._row;
      } else {
        if (!r.welcome_sent && (a === null || a > 30 * MIN)) out.push(at + ': Paid, but no welcome email has gone out.');
        if (!r.starts || !r.ends) out.push(at + ': Paid, but the start and end dates of their year are blank.');
        const unreadable = ['starts', 'ends'].filter(c => r[c] && !parseDay_(r[c]));
        if (unreadable.length) out.push(at + ': the ' + unreadable.join(' and ') + ' date can\'t be read. Write it like 17 October 2027, or the end-of-year email and call invites can\'t go out.');
        const end = parseDay_(r.ends);
        if (end && end.getTime() + DAY > now) members.add(r.email);
      }
    });
  });

  SETTINGS.MEMBERS_CALL_DATES.filter(v => !CALL_DATE_.test(String(v).trim())).forEach(v => {
    out.push('MEMBERS_CALL_DATES in SETTINGS has "' + v + '", which isn\'t a date the script can read. Write it like 2026-11-15.');
  });
  if (members.size && !membersCalls_(new Date(now), new Date(now + 45 * DAY)).length) {
    out.push(members.size + ' one-year support member' + (members.size === 1 ? ' is' : 's are') + ' current, but no members\' Q&A call is set for the next 45 days. ' +
      'Set MEMBERS_CALL_DAY or MEMBERS_CALL_DATES in SETTINGS, then deploy a new version.');
  }

  if (manual) {
    const month = now - 30 * 24 * HOUR;
    read_('payments').rows.filter(p => p.matched_to === 'not matched' && (parseDate_(p.seen_at) || new Date(0)).getTime() > month).forEach(p => {
      out.push(TABS.payments.name + ' row ' + p._row + ': ₹' + p.amount_inr + ' from ' + (p.email || 'no email') + ' (' + p.payment_id + ') isn\'t matched to a sign-up.');
    });
  }
  return out;
}

/* ===================== email text ===================== */

function joinHelp_(meet = SETTINGS.MEETING_TOOL === 'meet') {
  return meet
    ? 'It runs on Google Meet: open the link in a browser on a laptop, or in the Google Meet app on your phone. If this email address has a Google account, sign in with it and you will be let straight in; otherwise tap "Ask to join" and we will let you in.'
    : 'Open the link a few minutes early to check your sound and camera.';
}

function confirmationText_(r, start, link) {
  return [
    'Hi ' + first_(r.name) + ',', '',
    'Your seat for "' + SETTINGS.CLASS_TITLE.replace(' (live class)', '') + '" is confirmed.', '',
    'When: ' + label_(start), 'Join: ' + link, '',
    joinHelp_(), '',
    'Good to know:',
    '- The class is live and not recorded.',
    '- Questions get general answers, not personal advice.',
    '- Can\'t make it? Reply before the class starts and we\'ll move you to a later Saturday (once).', '',
    'We\'ll remind you 24 hours and 1 hour before.' + (SETTINGS.SEND_CALENDAR_INVITES ? ' A calendar invite is on its way too.' : ''), '',
    r.payment_id && r.payment_id !== 'test' ? 'Payment reference: ' + r.payment_id + '\n' : '',
    'See you there,', SETTINGS.BUSINESS_NAME, '', DISCLAIMER
  ].join('\n');
}

function reminderText_(r, start, link, when) {
  return [
    'Hi ' + first_(r.name) + ',', '',
    (when === 'tomorrow' ? 'A reminder that your class is tomorrow: ' : 'Your class starts in about an hour: ') + label_(start) + '.', '',
    'Join: ' + link, '', joinHelp_(), '',
    SETTINGS.BUSINESS_NAME, DISCLAIMER
  ].join('\n');
}

function feedbackText_(r) {
  return [
    'Hi ' + first_(r.name) + ',', '',
    'Thank you for joining the class. Could you tell us how it went? It takes two minutes:', SETTINGS.FEEDBACK_FORM_URL, '',
    'We only ever quote feedback with your written permission, and only with your first name.', '',
    SETTINGS.BUSINESS_NAME, DISCLAIMER
  ].join('\n');
}

function endingText_(r, end) {
  const last = dayIST_(end), call = membersCalls_(new Date(), new Date(end.getTime() + DAY))[0];
  return [
    'Hi ' + first_(r.name) + ',', '',
    'A quick note that your one-year support ends on ' + last + '. It doesn\'t renew by itself, so you won\'t be charged again.', '',
    'Until then, keep emailing us your questions' + (call ? ', and do join the members\' Q&A call on ' + callLabel_(call) : '') + '.', '',
    'If you\'d like another year, you can join again here: ' + SETTINGS.SUPPORT_JOIN_URL,
    'A new year runs from the day you pay, so there\'s no need to do it before ' + last + '.', '',
    'Thank you for learning with us,', SETTINGS.BUSINESS_NAME, '', DISCLAIMER
  ].join('\n');
}

function callText_(r, start, link) {
  return [
    'Hi ' + first_(r.name) + ',', '',
    'Our next members\' Q&A call is on ' + callLabel_(start) + '.', '',
    'Join: ' + link, '',
    joinHelp_(true), '',
    'Good to know:',
    '- Bring your questions about how investing works. We answer in general terms, not personal advice.',
    '- The call is live and not recorded.',
    '- Please don\'t share account numbers, ID numbers or passwords on the call.',
    '- Other members can\'t see your email address on the invite.',
    '- Can\'t make it? There\'s one every month, and you can always email us your question instead.', '',
    SETTINGS.SEND_CALENDAR_INVITES ? 'A calendar invite is on its way too.\n' : '',
    'See you there,', SETTINGS.BUSINESS_NAME, '', DISCLAIMER
  ].join('\n');
}

function unpaidClassText_(r) {
  // the class they picked, unless it starts within the hour or has passed: then the next one
  let start = parseDate_(r.class_date);
  if (!start || start.getTime() < Date.now() + HOUR) start = nextClass_(new Date(Date.now() + HOUR));
  return [
    'Hi ' + first_(r.name) + ',', '',
    'You started booking a seat for our live class, "' + SETTINGS.CLASS_TITLE.replace(' (live class)', '') + '", ' +
      'but the payment didn\'t go through, so your seat isn\'t booked yet.', '',
    'If you\'d still like to join, the next class is on ' + label_(start) + '. You can finish booking here; it takes a minute:',
    SETTINGS.CLASS_JOIN_URL, '',
    unpaidHelp_(),
    SETTINGS.BUSINESS_NAME, '', DISCLAIMER
  ].join('\n');
}

function unpaidSupportText_(r) {
  return [
    'Hi ' + first_(r.name) + ',', '',
    'You started signing up for one-year support, but the payment didn\'t go through, so it isn\'t set up yet.', '',
    'If you\'d still like to join, you can finish here; it takes a minute:', SETTINGS.SUPPORT_JOIN_URL, '',
    unpaidHelp_(),
    SETTINGS.BUSINESS_NAME, '', DISCLAIMER
  ].join('\n');
}

function unpaidHelp_() {
  return [
    'If something went wrong with the payment, just reply to this email and we\'ll help. If money left your account for a payment ' +
      'that didn\'t complete, it is returned automatically, usually within a few working days.', '',
    'If you\'ve changed your mind, there\'s nothing to do. This is the only email we\'ll send about it.', ''
  ].join('\n');
}

function interestText_(r) {
  return [
    'Hi ' + first_(r.name) + ',', '',
    'You asked us to let you know when one-year support opened. It\'s open now.', '',
    'For ' + inr_(SETTINGS.SUPPORT_PRICE_INR) + ' a year:',
    '- Email us questions about how investing works whenever they come up. We reply within 1 day.',
    '- Join a monthly members\' Q&A call, live on Google Meet.', '',
    'It\'s education only: we explain how things work; we don\'t tell anyone what to buy, sell or hold. ' +
      'It\'s one payment for 12 months from the day you pay, and it doesn\'t renew by itself.', '',
    'Join here: ' + SETTINGS.SUPPORT_JOIN_URL, '',
    'This is a one-off email: we won\'t write to you about it again.', '',
    SETTINGS.BUSINESS_NAME, '', DISCLAIMER
  ].join('\n');
}

/* ===================== helpers ===================== */

function sendMail_(to, subject, body) {
  MailApp.sendEmail({ to, subject, body, name: SETTINGS.BUSINESS_NAME, replyTo: SETTINGS.REPLY_TO });
}

// Alerts to the owner. A failed alert (e.g. the daily email quota is used up) never fails a sign-up: the row is already saved.
function notify_(subject, replyTo, body) {
  if (!rateOk_('alerts', SETTINGS.MAX_ALERTS_PER_HOUR, 3600)) {
    console.error('Alert limit reached; not emailed (the row is in the sheet): ' + subject);
    return;
  }
  try {
    const to = SETTINGS.NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
    const msg = { to, subject: subject.slice(0, 200), body, name: SETTINGS.BUSINESS_NAME + ' website' };
    if (replyTo) msg.replyTo = replyTo;
    MailApp.sendEmail(msg);
  } catch (err) {
    console.error('Alert not sent (' + subject + '): ' + err);
  }
}

function json_(v) {
  const body = typeof v === 'object' ? v : { ok: v };
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

// Trims, caps length, and stops typed text being run as a spreadsheet formula ("=…", "@…", "+1+IMAGE(…)").
// A plain number such as a phone "+91 98765 43210" or "-5" is left as it is.
function clean_(v, max) {
  let s = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max || 300);
  if (/^[=@]/.test(s) || (/^[+\-]/.test(s) && !/^[+\-][\d\s().-]*$/.test(s))) s = "'" + s;
  return s;
}

// Counts events in fixed time windows (CacheService). False once `limit` is passed in the current window.
// Approximate (no lock), which is fine for stopping floods.
function rateOk_(name, limit, seconds) {
  if (!(limit > 0)) return true;
  const cache = CacheService.getScriptCache();
  const key = ('rl:' + name + ':' + Math.floor(Date.now() / (seconds * 1000))).slice(0, 240);
  const n = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(n), seconds);
  return n <= limit;
}

function sheet_(key) {
  const t = TABS[key], ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(t.name);
  if (!sh) sh = ss.insertSheet(t.name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, t.cols.length).setValues([t.cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// The headings in row 1, in sheet order. A heading this script needs that has gone missing is added at the end,
// so columns can be moved, and your own columns added, without anything landing in the wrong place.
function header_(sh, key) {
  const width = Math.max(sh.getLastColumn(), 1);
  const head = sh.getRange(1, 1, 1, width).getValues()[0].map(h => String(h).trim());
  const missing = TABS[key].cols.filter(c => head.indexOf(c) === -1);
  if (!missing.length) return head;
  sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  return head.concat(missing);
}

function read_(key) {
  const sh = sheet_(key), cols = header_(sh, key), last = sh.getLastRow();
  const values = last > 1 ? sh.getRange(2, 1, last - 1, cols.length).getValues() : [];
  const rows = values.map((v, i) => {
    const r = { _row: i + 2 };
    cols.forEach((c, j) => { if (c && !(c in r)) r[c] = v[j] instanceof Date ? v[j] : String(v[j]).trim(); });
    r.email = String(r.email || '').toLowerCase();
    return r;
  });
  return { sh, cols, rows };
}

// The time column (the first one this script made) holds a real date; everything else is stored as plain text,
// so dates, phone numbers and ids stay exactly as typed.
function append_(key, obj) {
  const sh = sheet_(key), cols = header_(sh, key), r = sh.getLastRow() + 1, time = TABS[key].cols[0];
  const row = cols.map(c => c === time ? obj[c] || new Date() : obj[c] == null ? '' : clean_(obj[c], c === 'message' || c === 'goals' ? 1500 : 300));
  sh.getRange(r, 1, 1, cols.length).setNumberFormat('@');
  sh.getRange(r, cols.indexOf(time) + 1).setNumberFormat(TIME_FORMAT_);
  sh.getRange(r, 1, 1, cols.length).setValues([row]);
  return r;
}

const TIME_FORMAT_ = 'd mmm yyyy, h:mm am/pm';

function setTime_(sh, cols, rowNum, col, date) {
  const i = cols.indexOf(col);
  if (i !== -1) sh.getRange(rowNum, i + 1).setNumberFormat(TIME_FORMAT_).setValue(date);
}

function update_(sh, cols, rowNum, fields) {
  Object.keys(fields).forEach(c => {
    const i = cols.indexOf(c);
    if (i !== -1) sh.getRange(rowNum, i + 1).setNumberFormat('@').setValue(clean_(fields[c], 500));
  });
}

// The next class that hasn't started yet (a class that is live now is no longer bookable).
function nextClass_(now) {
  now = now || new Date();
  const IST = 5.5 * HOUR;
  const t = new Date(now.getTime() + IST);
  const hm = SETTINGS.CLASS_START.split(':').map(Number);
  const add = (SETTINGS.CLASS_WEEKDAY - t.getUTCDay() + 7) % 7;
  let s = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + add, hm[0], hm[1]) - IST;
  if (s <= now.getTime()) s += 7 * 24 * HOUR;
  return new Date(s);
}

function parseDate_(v) {
  if (v instanceof Date) return isNaN(v) ? null : v;
  const d = new Date(String(v || ''));
  return String(v || '') && !isNaN(d) ? d : null;
}

function iso_(d) { return Utilities.formatDate(d, SETTINGS.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss") + '+05:30'; }
function stamp_() { return iso_(new Date()); }
function dayIST_(d) { return Utilities.formatDate(d, SETTINGS.TIMEZONE, 'd MMMM yyyy'); }
function timeIST_(d) { return Utilities.formatDate(d, SETTINGS.TIMEZONE, 'h:mm a').toLowerCase(); }
function first_(name) { return String(name || '').trim().split(/\s+/)[0] || 'there'; }

// "Saturday 18 October 2026, 3:00 to 4:00 pm IST"; short form "Saturday 18 October, 3:00 pm IST"
function label_(start, short, minutes = SETTINGS.CLASS_MINUTES) {
  const day = Utilities.formatDate(start, SETTINGS.TIMEZONE, short ? 'EEEE d MMMM' : 'EEEE d MMMM yyyy');
  if (short) return day + ', ' + timeIST_(start) + ' IST';
  const end = new Date(start.getTime() + minutes * MIN);
  return day + ', ' + Utilities.formatDate(start, SETTINGS.TIMEZONE, 'h:mm') + ' to ' + timeIST_(end) + ' IST';
}
function callLabel_(start) { return label_(start, false, SETTINGS.MEMBERS_CALL_MINUTES); }

// A day as written in the sheet ("17 October 2027", "17 Oct 2027" or "2027-10-17"), as midnight IST on that day.
function parseDay_(v) {
  if (v instanceof Date) {
    if (isNaN(v)) return null;
    v = iso_(v).slice(0, 10);
  }
  const s = String(v || '').trim();
  let m = /^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/.exec(s), y, mo, d;
  if (m) { y = +m[3]; mo = MONTHS_.indexOf(m[2].slice(0, 3).toLowerCase()); d = +m[1]; }
  else if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) { y = +m[1]; mo = m[2] - 1; d = +m[3]; }
  else return null;
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo, d) - IST_);
}
const MONTHS_ = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// ₹3,000 and ₹3,00,000 (Indian grouping)
function inr_(n) { return '₹' + String(n).replace(/(\d)(?=(\d\d)+\d$)/g, '$1,'); }
