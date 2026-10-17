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
 *   5. Each paid one-year support sign-up gets a welcome email, with the dates their year starts and ends.
 *
 * Secrets (the Razorpay key id and key secret) go in Project Settings → Script properties.
 * Never paste them into this file, into the sheet or into the website.
 */

const SETTINGS = {
  BUSINESS_NAME: 'Research by Srivathsa',
  REPLY_TO: 'hello@researchbysrivathsa.com',   // replies to our emails go here
  NOTIFY_EMAIL: '',                            // new contact/support messages go here; blank = this Google account
  TIMEZONE: 'Asia/Kolkata',

  /* weekly class: Saturday (6), 15:00 IST, 60 minutes */
  CLASS_WEEKDAY: 6,
  CLASS_START: '15:00',
  CLASS_MINUTES: 60,
  CLASS_TITLE: 'Investing basics, start to finish (live class)',
  CLASS_AMOUNTS_INR: [199, 1],                 // 1 = the ₹1 Razorpay test-mode page; remove it after testing
  SUPPORT_AMOUNTS_INR: [3000],                 // one-year support

  /* how people join the class */
  MEETING_TOOL: 'meet',          // 'meet' = a new Google Meet link per Saturday, made automatically
                                 // 'fixed' = everyone gets FIXED_MEETING_LINK (e.g. a recurring Zoom meeting)
  FIXED_MEETING_LINK: '',
  CALENDAR_ID: 'primary',
  SEND_CALENDAR_INVITES: true,   // Google Calendar also emails each paid guest an invite with the link

  /* links used in emails */
  FEEDBACK_FORM_URL: '',         // e.g. a Google Form; the feedback email is skipped while this is blank
  TEST_EMAIL: ''                 // your own second address, for testBooking()
};

const TABS = {
  class: {
    name: 'Class sign-ups',
    cols: ['timestamp', 'name', 'email', 'phone', 'class_date', 'class_date_label', 'lang', 'stage', 'consent',
      'status', 'payment_id', 'amount_inr', 'meeting_link', 'confirmation_sent', 'reminder_24h_sent',
      'reminder_1h_sent', 'feedback_sent', 'notes']
  },
  support: {
    name: 'One-year support',
    cols: ['timestamp', 'form_type', 'name', 'email', 'phone', 'goals', 'consent', 'terms', 'status', 'payment_id',
      'amount_inr', 'starts', 'ends', 'welcome_sent', 'notes']
  },
  contact: { name: 'Contact', cols: ['timestamp', 'name', 'email', 'topic', 'message', 'status', 'notes'] },
  newsletter: { name: 'Newsletter', cols: ['timestamp', 'email', 'page', 'status'] },
  payments: {
    name: 'Payments',
    cols: ['seen_at', 'payment_id', 'paid_at', 'email', 'phone', 'amount_inr', 'method', 'matched_to', 'notes']
  }
};

const DISCLAIMER = 'Educational content only. Not investment advice. Investments carry risk, including loss of capital.';
const MIN = 60 * 1000, HOUR = 60 * MIN;

/* ===================== one-time set-up ===================== */

/** Run once from the editor: makes the tabs and the 10-minute timer. Safe to run again. */
function setup() {
  if (typeof Calendar === 'undefined') throw new Error('Add the Google Calendar API service first: Services (+) → Google Calendar API → Add.');
  Object.keys(TABS).forEach(sheet_);
  const first = SpreadsheetApp.getActive().getSheetByName('Sheet1');
  if (first && first.getLastRow() === 0 && SpreadsheetApp.getActive().getSheets().length > 1) SpreadsheetApp.getActive().deleteSheet(first);
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'every10Minutes').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('every10Minutes').timeBased().everyMinutes(10).create();
  console.log('Set-up done. Next: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).');
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

  const type = String(p.form_type || '');
  const email = clean_(p.email).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(TYPES_, type) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json_(false);

  // the same form from the same address twice inside a minute is a double tap, not two sign-ups
  const cache = CacheService.getScriptCache(), key = ('f:' + type + ':' + email).slice(0, 240);
  if (cache.get(key)) return json_(true);
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
    append_('class', {
      timestamp: new Date(), name: p.name, email, phone: p.phone, class_date: iso_(start), class_date_label: label_(start),
      lang: p.lang, stage: p.stage, consent: p.consent || (p.ack && p.privacy ? 'yes' : ''), status: 'Pending'
    });
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
  append_('support', {
    timestamp: new Date(), form_type: kind, name: p.name, email, phone: p.phone, goals: p.goals || p.goal,
    consent: p.consent, terms: p.terms, status: kind === 'interest' ? 'Interest' : 'Pending'
  });
  notify_((kind === 'interest' ? 'Support interest: ' : 'Support sign-up (payment next): ') + clean_(p.name), email,
    'Name: ' + clean_(p.name) + '\nEmail: ' + email + (p.phone ? '\nPhone: ' + clean_(p.phone) : '') +
    ((p.goals || p.goal) ? '\nWants to understand: ' + clean_(p.goals || p.goal, 1200) : '') +
    '\n\nIt is also in the "' + TABS.support.name + '" tab.');
}

/* ===================== the 10-minute timer ===================== */

function every10Minutes() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;                      // the last run is still going
  try {
    [syncRazorpay_, processPaidClassRows_, sendClassReminders_, processPaidSupport_].forEach(step => {
      try { step(); } catch (err) { console.error(step.name + ': ' + (err && err.stack || err)); }
    });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- 1. Razorpay → "Paid" ---------- */

function syncRazorpay_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('RAZORPAY_KEY_ID'), secret = props.getProperty('RAZORPAY_KEY_SECRET');
  if (!id || !secret) return;                            // not connected yet: mark rows "Paid" by hand instead

  const now = Math.floor(Date.now() / 1000);
  const last = Number(props.getProperty('RAZORPAY_SYNCED_TO')) || now - 3 * 86400;
  const from = last - 3600;                              // overlap, so a payment captured late is not missed
  const seen = new Set(read_('payments').rows.map(r => r.payment_id));
  const auth = { Authorization: 'Basic ' + Utilities.base64Encode(id + ':' + secret) };

  let skip = 0, items;
  do {
    const res = UrlFetchApp.fetch('https://api.razorpay.com/v1/payments?from=' + from + '&to=' + now + '&count=100&skip=' + skip,
      { headers: auth, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('Razorpay said ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
    items = JSON.parse(res.getContentText()).items || [];
    items.filter(pay => pay.status === 'captured' && !seen.has(pay.id)).reverse().forEach(pay => { seen.add(pay.id); recordPayment_(pay); });
    skip += items.length;
  } while (items.length === 100);
  props.setProperty('RAZORPAY_SYNCED_TO', String(now));
}

function recordPayment_(pay) {
  const email = clean_(pay.email).toLowerCase();
  const rupees = pay.amount / 100;
  const notes = pay.notes || {};
  // Payment Pages store their form fields in notes; the name field's key depends on how the page was built
  const nameKey = Object.keys(notes).find(k => /name/i.test(k));
  const who = { email, name: nameKey ? clean_(notes[nameKey]) : '', phone: clean_(pay.contact), pay };

  let matched = 'not matched';
  if (SETTINGS.CLASS_AMOUNTS_INR.indexOf(rupees) !== -1) matched = markPaid_('class', who);
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
  const open = rows.filter(r => r.email === who.email && (r.status === 'Pending' || r.status === 'Interest'));
  const row = open[open.length - 1];
  const fields = { status: 'Paid', payment_id: who.pay.id, amount_inr: who.pay.amount / 100 };
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
  if (!guests.some(g => String(g.email).toLowerCase() === email)) {
    guests.push({ email, displayName: name || undefined });
    ev = Calendar.Events.patch({ attendees: guests }, SETTINGS.CALENDAR_ID, ev.id,
      { sendUpdates: SETTINGS.SEND_CALENDAR_INVITES ? 'all' : 'none', conferenceDataVersion: 1 });
  }
  const link = meetingLink_(ev);
  if (!link) throw new Error('The calendar event has no meeting link yet');
  return link;
}

function classEvent_(start) {
  const props = PropertiesService.getScriptProperties();
  const key = 'EVENT_' + iso_(start).slice(0, 16);
  const saved = props.getProperty(key);
  if (saved) {
    try {
      const ev = Calendar.Events.get(SETTINGS.CALENDAR_ID, saved);
      if (ev.status !== 'cancelled') return ev;
    } catch (err) { /* deleted by hand: make a new one */ }
  }
  const end = new Date(start.getTime() + SETTINGS.CLASS_MINUTES * MIN);
  const body = {
    summary: SETTINGS.CLASS_TITLE,
    description: 'Live class from ' + SETTINGS.BUSINESS_NAME + '. Please join with the email address this invite was sent to.\n\n' +
      'Not recorded. General Q&A only, not personal advice.\n' + DISCLAIMER,
    start: { dateTime: start.toISOString(), timeZone: SETTINGS.TIMEZONE },
    end: { dateTime: end.toISOString(), timeZone: SETTINGS.TIMEZONE },
    guestsCanSeeOtherGuests: false,
    guestsCanInviteOthers: false,
    guestsCanModify: false
  };
  if (SETTINGS.MEETING_TOOL === 'meet') {
    body.conferenceData = { createRequest: { requestId: Utilities.getUuid(), conferenceSolutionKey: { type: 'hangoutsMeet' } } };
  } else {
    body.location = SETTINGS.FIXED_MEETING_LINK;
  }
  let ev = Calendar.Events.insert(body, SETTINGS.CALENDAR_ID, { conferenceDataVersion: 1, sendUpdates: 'none' });
  // Google sometimes takes a moment to attach the Meet link
  for (let i = 0; i < 5 && SETTINGS.MEETING_TOOL === 'meet' && !meetingLink_(ev); i++) {
    Utilities.sleep(2000);
    ev = Calendar.Events.get(SETTINGS.CALENDAR_ID, ev.id);
  }
  props.setProperty(key, ev.id);
  return ev;
}

function meetingLink_(ev) {
  if (SETTINGS.MEETING_TOOL !== 'meet') return SETTINGS.FIXED_MEETING_LINK;
  if (ev.hangoutLink) return ev.hangoutLink;
  const video = ev.conferenceData && (ev.conferenceData.entryPoints || []).find(x => x.entryPointType === 'video');
  return video ? video.uri : '';
}

/* ---------- 3. reminders and feedback ---------- */

function sendClassReminders_() {
  const { sh, cols, rows } = read_('class');
  const now = Date.now();
  rows.filter(r => r.status === 'Paid' && r.confirmation_sent && r.email).forEach(r => {
    const start = parseDate_(r.class_date);
    if (!start) return;
    const until = start.getTime() - now;
    const sentAgo = now - (parseDate_(r.confirmation_sent) || new Date(0)).getTime();
    const link = r.meeting_link;

    if (!r.reminder_24h_sent && until <= 24 * HOUR && until > HOUR) {
      // booked within the last few hours: the confirmation is reminder enough
      const skip = until < 3 * HOUR || sentAgo < 3 * HOUR;
      if (!skip) sendMail_(r.email, 'Tomorrow: your class at ' + timeIST_(start) + ' IST', reminderText_(r, start, link, 'tomorrow'));
      update_(sh, cols, r._row, { reminder_24h_sent: skip ? 'skipped' : stamp_() });
    }
    if (!r.reminder_1h_sent && until <= 70 * MIN && until > 0) {
      const skip = sentAgo < 30 * MIN;
      if (!skip) sendMail_(r.email, 'Starting soon: your class at ' + timeIST_(start) + ' IST', reminderText_(r, start, link, 'soon'));
      update_(sh, cols, r._row, { reminder_1h_sent: skip ? 'skipped' : stamp_() });
    }
    const after = now - (start.getTime() + SETTINGS.CLASS_MINUTES * MIN);
    if (!r.feedback_sent && SETTINGS.FEEDBACK_FORM_URL && after > 15 * MIN && after < 3 * 24 * HOUR) {
      sendMail_(r.email, 'How was the class?', feedbackText_(r));
      update_(sh, cols, r._row, { feedback_sent: stamp_() });
    }
  });
}

/* ---------- 4. paid one-year support → welcome email ---------- */

function processPaidSupport_() {
  const { sh, cols, rows } = read_('support');
  rows.filter(r => r.status === 'Paid' && !r.welcome_sent && r.email).forEach(r => {
    sendMail_(r.email, 'Welcome to one-year support', [
      'Hi ' + first_(r.name) + ',', '',
      'Thank you, your payment has come through. Your one-year support runs from ' + (r.starts || 'today') +
        (r.ends ? ' to ' + r.ends : ' for 12 months') + '.', '',
      'How it works:',
      '- Questions: email them to ' + SETTINGS.REPLY_TO + ' (or just reply to this email) from this address. We reply within 1 day.',
      '- Members\' Q&A call: once a month, live on Google Meet. We\'ll email you the date and link ahead of each one.', '',
      'Ask about anything to do with how investing works. We explain how things work; we don\'t tell anyone what to buy, sell or hold.', '',
      r.payment_id && r.payment_id !== 'test' ? 'Payment reference: ' + r.payment_id + '\n' : '',
      'Glad to have you with us,', SETTINGS.BUSINESS_NAME, '', DISCLAIMER
    ].join('\n'));
    update_(sh, cols, r._row, { welcome_sent: stamp_() });
  });
}

/* ===================== email text ===================== */

function joinHelp_() {
  return SETTINGS.MEETING_TOOL === 'meet'
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

/* ===================== helpers ===================== */

function sendMail_(to, subject, body) {
  MailApp.sendEmail({ to, subject, body, name: SETTINGS.BUSINESS_NAME, replyTo: SETTINGS.REPLY_TO });
}

function notify_(subject, replyTo, body) {
  const to = SETTINGS.NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
  const msg = { to, subject: subject.slice(0, 200), body, name: SETTINGS.BUSINESS_NAME + ' website' };
  if (replyTo) msg.replyTo = replyTo;
  MailApp.sendEmail(msg);
}

function json_(ok) {
  return ContentService.createTextOutput(JSON.stringify({ ok })).setMimeType(ContentService.MimeType.JSON);
}

// Trims, caps length, and stops a typed "=..." being run as a spreadsheet formula.
function clean_(v, max) {
  let s = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max || 300);
  if (/^[=@]|^[+\-][^\d\s]/.test(s)) s = "'" + s;
  return s;
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

function read_(key) {
  const sh = sheet_(key), cols = TABS[key].cols, last = sh.getLastRow();
  const values = last > 1 ? sh.getRange(2, 1, last - 1, cols.length).getValues() : [];
  const rows = values.map((v, i) => {
    const r = { _row: i + 2 };
    cols.forEach((c, j) => { r[c] = v[j] instanceof Date ? v[j] : String(v[j]).trim(); });
    r.email = String(r.email || '').toLowerCase();
    return r;
  });
  return { sh, cols, rows };
}

// Columns after the timestamp are stored as plain text, so dates, phone numbers and ids stay as typed.
function append_(key, obj) {
  const sh = sheet_(key), cols = TABS[key].cols, r = sh.getLastRow() + 1;
  const row = cols.map((c, i) => i === 0 ? obj[c] || new Date() : obj[c] == null ? '' : clean_(obj[c], c === 'message' || c === 'goals' ? 1500 : 300));
  sh.getRange(r, 2, 1, cols.length - 1).setNumberFormat('@');
  sh.getRange(r, 1, 1, cols.length).setValues([row]);
  return r;
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
function label_(start, short) {
  const day = Utilities.formatDate(start, SETTINGS.TIMEZONE, short ? 'EEEE d MMMM' : 'EEEE d MMMM yyyy');
  if (short) return day + ', ' + timeIST_(start) + ' IST';
  const end = new Date(start.getTime() + SETTINGS.CLASS_MINUTES * MIN);
  return day + ', ' + Utilities.formatDate(start, SETTINGS.TIMEZONE, 'h:mm') + ' to ' + timeIST_(end) + ' IST';
}
