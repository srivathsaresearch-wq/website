// Offline tests for site/_backend/Code.gs (the Google Apps Script back office).
// Runs the script against in-memory fakes of Sheets, Gmail, Calendar, Razorpay and friends. No network, no real data.
// Usage (from the site folder):  node _dev/test-apps-script.js _backend/Code.gs
// Expected: "Checkout checks passed.", "One-year support checks passed." and "All Apps Script checks passed.", then sample emails.

// Offline test of _backend/Code.gs with in-memory fakes of the Google services it uses.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(process.argv[2], 'utf8');

let NOW = Date.parse('2026-10-17T10:00:00+05:30');          // Saturday 10:00 IST
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
  static now() { return NOW; }
}

function fmt(d, tz, f) {
  const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', hour: 'numeric', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).forEach(x => { p[x.type] = x.value; });
  const mm = String(new Intl.DateTimeFormat('en-GB', { timeZone: tz, month: '2-digit' }).format(d));
  const H = Number(p.hour), h12 = H % 12 || 12, ap = H < 12 ? 'AM' : 'PM';
  const map = { "yyyy-MM-dd'T'HH:mm:ss": `${p.year}-${mm}-${String(p.day).padStart(2, '0')}T${String(H).padStart(2, '0')}:${p.minute}:${p.second}`,
    'h:mm a': `${h12}:${p.minute} ${ap}`, 'h:mm': `${h12}:${p.minute}`,
    'EEEE d MMMM': `${p.weekday} ${p.day} ${p.month}`, 'd MMMM yyyy': `${p.day} ${p.month} ${p.year}`, 'EEEE d MMMM yyyy': `${p.weekday} ${p.day} ${p.month} ${p.year}` };
  if (!(f in map)) throw new Error('fmt ' + f);
  return map[f];
}

// --- spreadsheet fake ---
function makeSheet(name) {
  const data = [];
  const sh = {
    name, data, getLastRow: () => data.length, getLastColumn: () => data.reduce((m, r) => Math.max(m, (r || []).length), 0), setFrozenRows() {},
    getRange(r, c, nr = 1, nc = 1) {
      const rng = {
        setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { (data[r - 1 + i] = data[r - 1 + i] || [])[c - 1 + j] = x; })); return rng; },
        setValue(x) { return rng.setValues([[x]]); },
        getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const v = (data[r - 1 + i] || [])[c - 1 + j]; return v === undefined ? '' : v; })); },
        setNumberFormat() { return rng; }, setFontWeight() { return rng; }
      };
      return rng;
    }
  };
  return sh;
}
const sheets = [makeSheet('Sheet1')];
const SpreadsheetApp = { getActive: () => ({
  getSheetByName: n => sheets.find(s => s.name === n) || null,
  insertSheet: n => { const s = makeSheet(n); sheets.push(s); return s; },
  getSheets: () => sheets, deleteSheet: s => sheets.splice(sheets.indexOf(s), 1)
}) };

const mails = [], props = {}, cache = {}, events = {}, rzpCalls = [], rzpOrders = {}, rzpPays = {};
let orderN = 0, rzpAuthFails = false, captureFails = false, calHiccup = false;
let evN = 0, rzpItems = [], mailQuota = 100, patches = 0;
const ctx = {
  Date: FakeDate, console, Intl, JSON, Math, String, Number, Object, Array, Set, Error, isNaN, RegExp,
  SpreadsheetApp,
  Utilities: { computeHmacSha256Signature: (msg, key) => [...require('crypto').createHmac('sha256', key).update(msg).digest()].map(b => b > 127 ? b - 256 : b), formatDate: fmt, base64Encode: s => Buffer.from(s).toString('base64'), getUuid: () => 'uuid' + (++evN), sleep() {} },
  MailApp: { sendEmail: m => mails.push(m), getRemainingDailyQuota: () => mailQuota },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
  CacheService: { getScriptCache: () => ({ get: k => (cache[k] && cache[k].until > NOW ? cache[k].v : null), put: (k, v, ttl) => { cache[k] = { v, until: NOW + (ttl || 600) * 1000 }; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ t, setMimeType() { return this; } }) },
  ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }) }) }) },
  UrlFetchApp: { fetch: (url, o) => {
    assert(o.headers.Authorization.startsWith('Basic '));
    rzpCalls.push({ url, method: o.method || 'get', body: o.payload ? JSON.parse(o.payload) : null, auth: o.headers.Authorization });
    const out = (code, data) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(data) });
    if (rzpAuthFails) return out(401, { error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' } });
    let m;
    if ((o.method || 'get') === 'post' && /\/v1\/orders$/.test(url)) {
      const b = JSON.parse(o.payload), id = 'order_T' + (++orderN);
      rzpOrders[id] = { id, entity: 'order', amount: b.amount, currency: b.currency, receipt: b.receipt, notes: b.notes };
      return out(200, rzpOrders[id]);
    }
    if ((m = /\/v1\/payments\/([^/?]+)\/capture$/.exec(url))) {
      const pay = rzpPays[m[1]] || rzpItems.find(x => x.id === m[1]);
      if (!pay || captureFails || pay.status !== 'authorized' || JSON.parse(o.payload).amount !== pay.amount) return out(400, { error: { description: 'cannot capture' } });
      pay.status = 'captured';
      return out(200, Object.assign({}, pay));
    }
    if ((m = /\/v1\/orders\/([^/?]+)$/.exec(url))) return rzpOrders[m[1]] ? out(200, rzpOrders[m[1]]) : out(404, {});
    if ((m = /\/v1\/payments\/([^/?]+)$/.exec(url))) return rzpPays[m[1]] ? out(200, rzpPays[m[1]]) : out(404, {});
    const skip = +/skip=(\d+)/.exec(url)[1];
    return out(200, { items: rzpItems.slice(skip, skip + 100) });
  } },
  Calendar: { Events: {
    insert(body, cal, opt) { const id = 'ev' + (++evN); events[id] = Object.assign({ id, status: 'confirmed', hangoutLink: 'https://meet.google.com/abc-' + id, attendees: [] }, body); return events[id]; },
    get(cal, id) {
      if (calHiccup) throw new Error('API call to calendar.events.get failed with error: Backend Error');
      if (!events[id] || events[id]._deleted) throw new Error('API call to calendar.events.get failed with error: Not Found');
      return events[id];
    },
    list(cal, o) {
      const a = Date.parse(o.timeMin), b = Date.parse(o.timeMax);
      return { items: Object.values(events).filter(e => !e._deleted && e.start && Date.parse(e.start.dateTime) < b && Date.parse(e.end.dateTime) > a) };
    },
    patch(body, cal, id, opt) { patches++; Object.assign(events[id], body); events[id]._sendUpdates = opt.sendUpdates; return events[id]; }
  } }
};
vm.createContext(ctx);
vm.runInContext(src + '\n;this.__api = { paymentApi_, setup, doPost, every10Minutes, nextClass_, label_, iso_, read_, update_, append_, checkSheet, emailInterestList, parseDay_, SETTINGS, clean_, rateOk_, notify_ };', ctx);
const api = ctx.__api;

api.setup();
api.SETTINGS.MEMBERS_CALL_DAY = 15;                          // a members' call on the 15th of each month, 7 pm IST
assert.deepStrictEqual(sheets.map(s => s.name), ['Class sign-ups', 'One-year support', 'Contact', 'Newsletter', 'Payments']);

// next class
assert.strictEqual(api.iso_(api.nextClass_()), '2026-10-17T15:00:00+05:30');
assert.strictEqual(api.label_(api.nextClass_()), 'Saturday 17 October 2026, 3:00 to 4:00 pm IST');
assert.strictEqual(api.label_(api.nextClass_(), true), 'Saturday 17 October, 3:00 pm IST');
assert.strictEqual(api.iso_(api.nextClass_(new FakeDate('2026-10-17T15:10:00+05:30'))), '2026-10-24T15:00:00+05:30');  // live = not bookable
assert.strictEqual(api.iso_(api.nextClass_(new FakeDate('2026-10-18T09:00:00+05:30'))), '2026-10-24T15:00:00+05:30');

const post = p => JSON.parse(api.doPost({ parameter: p, parameters: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, [].concat(v)])) }).t);

// forms
assert.deepStrictEqual(post({ form_type: 'class', name: 'Asha K', email: 'Asha@Example.com', phone: '+91 98765 43210', class_date: '2026-10-17T15:00:00+05:30', ack: 'yes', privacy: 'yes', lang: 'en', stage: 'none' }), { ok: true });
assert.deepStrictEqual(post({ form_type: 'class', name: 'Asha K', email: 'asha@example.com' }), { ok: true });   // double tap: ignored
post({ form_type: 'class', name: '=HYPERLINK("x")', email: 'ravi@example.com', class_date: '2026-10-10T15:00:00+05:30', consent: 'yes' });  // stale date
post({ form_type: 'contact', name: 'Meera', email: 'meera@example.com', topic: 'The class', message: 'Is it in Kannada?', privacy: 'yes' });
post({ form_type: 'newsletter', email: 'n@example.com', page: '/' });
post({ form_type: 'interest', name: 'Dev', email: 'dev@example.com', goal: 'House in 5 years' });
assert.deepStrictEqual(post({ form_type: 'toString', email: 'x@example.com' }), { ok: false });
assert.deepStrictEqual(post({ form_type: 'class', email: 'bad' }), { ok: false });
post({ form_type: 'class', email: 'bot@example.com', _gotcha: 'spam' });

let cls = api.read_('class').rows;
assert.strictEqual(cls.length, 2);
assert.strictEqual(cls[0].email, 'asha@example.com');
assert.strictEqual(cls[0].phone, '+91 98765 43210');
assert.strictEqual(cls[0].consent, 'yes');
assert.strictEqual(cls[0].status, 'Pending');
assert.strictEqual(cls[1].name, `'=HYPERLINK("x")`);                         // formula neutralised
assert.strictEqual(cls[1].class_date, '2026-10-17T15:00:00+05:30');          // stale date replaced
assert.strictEqual(api.read_('support').rows[0].goals, 'House in 5 years');
assert.strictEqual(api.read_('support').rows[0].status, 'Interest');
post({ form_type: 'support', name: 'Priya S', email: 'priya@example.com', goals: 'How fund costs work', consent: 'yes', terms: 'yes' });
assert.strictEqual(api.read_('support').rows[1].status, 'Pending');
assert.strictEqual(mails.length, 3);                                          // contact + interest + support alerts
assert.strictEqual(mails[0].replyTo, 'meera@example.com');
assert.strictEqual(mails[0].to, 'owner@example.com');

// timer without Razorpay keys: nothing paid yet; the daily check tells the owner the keys are missing (once a day)
api.every10Minutes();
assert.strictEqual(mails.length, 4);
assert.ok(/^Sheet check: 1 thing/.test(mails[3].subject) && /Razorpay keys are missing/.test(mails[3].body), mails[3].body);
api.every10Minutes();
assert.strictEqual(mails.length, 4);                                          // not again today

// Razorpay: Asha pays ₹199, a stranger pays ₹199 with no sign-up, someone pays ₹50
props.RAZORPAY_KEY_ID = 'rzp_test_x'; props.RAZORPAY_KEY_SECRET = 's';
const t = Math.floor(NOW / 1000);
rzpItems = [
  { id: 'pay_3', status: 'captured', amount: 5000, email: 'odd@example.com', contact: '+919', created_at: t - 60, notes: {} },
  { id: 'pay_2', status: 'captured', amount: 19900, email: 'new@example.com', contact: '+918', created_at: t - 120, notes: { full_name: 'New Person' } },
  { id: 'pay_1', status: 'captured', amount: 19900, email: 'ASHA@example.com', contact: '+917', created_at: t - 180, notes: {} },
  { id: 'pay_5', status: 'captured', amount: 300000, email: 'priya@example.com', contact: '+916', created_at: t - 100, notes: {} },
  { id: 'pay_0', status: 'failed', amount: 19900, email: 'ravi@example.com', created_at: t - 200, notes: {} }
];
api.every10Minutes();
cls = api.read_('class').rows;
assert.strictEqual(cls[0].status, 'Paid'); assert.strictEqual(cls[0].payment_id, 'pay_1');
assert.strictEqual(cls[1].status, 'Pending');                                 // failed payment ignored
assert.strictEqual(cls[2].email, 'new@example.com'); assert.strictEqual(cls[2].name, 'New Person'); assert.strictEqual(cls[2].status, 'Paid');
assert.ok(cls[0].confirmation_sent && cls[2].confirmation_sent);
assert.strictEqual(cls[0].meeting_link, cls[2].meeting_link);                 // same Saturday, same event
const ev = Object.values(events)[0];
assert.deepStrictEqual(ev.attendees.map(a => a.email), ['asha@example.com', 'new@example.com']);
assert.strictEqual(ev.guestsCanSeeOtherGuests, false);
assert.strictEqual(ev.start.dateTime, '2026-10-17T09:30:00.000Z');
const pays = api.read_('payments').rows;
assert.deepStrictEqual(pays.map(p => p.payment_id), ['pay_5', 'pay_1', 'pay_2', 'pay_3']);
assert.strictEqual(pays[3].matched_to, 'not matched');
const sup = api.read_('support').rows[1];
assert.strictEqual(sup.status, 'Paid'); assert.strictEqual(sup.starts, '17 October 2026'); assert.strictEqual(sup.ends, '17 October 2027'); assert.ok(sup.welcome_sent);
const wel = mails.find(m => m.to === 'priya@example.com');
assert.strictEqual(wel.subject, 'Welcome to one-year membership');
assert.ok(wel.body.includes('17 October 2026 to 17 October 2027') && wel.body.includes('pay_5'), wel.body);
const conf = mails.find(m => m.to === 'asha@example.com');
assert.ok(conf.subject === "You're booked: Saturday 17 October, 3:00 pm IST", conf.subject);
assert.ok(conf.body.includes(cls[0].meeting_link) && conf.body.includes('Hi Asha,') && conf.body.includes('pay_1'));
assert.ok(mails.some(m => /could not match/.test(m.subject)));
const before = mails.length;

// second run: nothing new (payments deduped, confirmations not repeated)
api.every10Minutes();
assert.strictEqual(mails.length, before);

// reminders: booked at 10:00 today for 15:00 → 24h reminder skipped; 1h reminder at 14:00
NOW = Date.parse('2026-10-17T14:00:00+05:30');
api.every10Minutes();
cls = api.read_('class').rows;
assert.strictEqual(cls[0].reminder_24h_sent, 'skipped');
assert.ok(cls[0].reminder_1h_sent.startsWith('2026-10-17T14:00'));
assert.ok(mails.some(m => m.to === 'asha@example.com' && /Starting soon/.test(m.subject)));
const n2 = mails.length;
api.every10Minutes();
assert.strictEqual(mails.length, n2);                                          // no repeats

// Ravi pays during the live class → booked into next week, new event and link
NOW = Date.parse('2026-10-17T15:20:00+05:30');
rzpItems = [{ id: 'pay_9', status: 'captured', amount: 19900, email: 'ravi@example.com', created_at: Math.floor(NOW / 1000) - 30, notes: {} }];
api.every10Minutes();
cls = api.read_('class').rows;
assert.strictEqual(cls[1].status, 'Paid');
assert.strictEqual(cls[1].class_date, '2026-10-24T15:00:00+05:30');
assert.notStrictEqual(cls[1].meeting_link, cls[0].meeting_link);

// 24h reminder for Ravi on Friday afternoon
NOW = Date.parse('2026-10-23T16:00:00+05:30');
api.every10Minutes();
assert.ok(api.read_('class').rows[1].reminder_24h_sent.startsWith('2026-10-23'));
assert.ok(mails.some(m => m.to === 'ravi@example.com' && /^Tomorrow/.test(m.subject)));


/* ===================== Razorpay Checkout: create order, verify ===================== */
const crypto = require('crypto');
const SECRET = 'test_secret_value';
const sign = (o, p, k = SECRET) => crypto.createHmac('sha256', k).update(o + '|' + p).digest('hex');
const pa = p => ctx.__api.paymentApi_(p);
NOW = Date.parse('2026-10-19T09:00:00+05:30');                                   // Monday
rzpItems = [];

// not configured yet
delete props.RAZORPAY_KEY_ID; delete props.RAZORPAY_KEY_SECRET;
let r = pa({ action: 'create_order', product: 'class', email: 'c1@example.com', name: 'Cee One' });
assert.strictEqual(r.ok, false); assert.strictEqual(r.status, 500); assert.strictEqual(r.error, 'not_configured');
assert.ok(/saved/.test(r.message));

props.RAZORPAY_KEY_ID = 'rzp_test_abc'; props.RAZORPAY_KEY_SECRET = SECRET;

// bad requests
assert.strictEqual(pa({ action: 'create_order', product: 'nope', email: 'c1@example.com' }).status, 400);
assert.strictEqual(pa({ action: 'create_order', product: 'class', email: 'not-an-email' }).status, 400);
assert.strictEqual(pa({ action: 'burn_it_all' }).status, 400);

// wrong key at Razorpay → 401
rzpAuthFails = true;
r = pa({ action: 'create_order', product: 'class', email: 'c1@example.com', name: 'Cee One' });
assert.strictEqual(r.status, 401); assert.strictEqual(r.error, 'auth'); rzpAuthFails = false;

// create order: price from the script, never from the browser
rzpCalls.length = 0;
r = pa({ action: 'create_order', product: 'class', email: 'C1@Example.com', name: 'Cee One', phone: '9876543210', class_date: '2026-10-24T15:00:00+05:30', amount: '1' });
assert.strictEqual(r.ok, true); assert.strictEqual(r.amount, 19900); assert.strictEqual(r.currency, 'INR');
assert.strictEqual(r.key_id, 'rzp_test_abc'); assert.ok(!JSON.stringify(r).includes(SECRET), 'secret leaked to the browser');
const sent = rzpCalls[0];
assert.strictEqual(sent.body.amount, 19900); assert.strictEqual(sent.body.currency, 'INR'); assert.ok(sent.body.receipt.length <= 40);
assert.strictEqual(sent.body.notes.email, 'c1@example.com'); assert.strictEqual(sent.body.notes.class_date, '2026-10-24T15:00:00+05:30');
assert.strictEqual(sent.auth, 'Basic ' + Buffer.from('rzp_test_abc:' + SECRET).toString('base64'));
const classOrder = r.order_id;

// a class sign-up row exists (the form posts first), then payment
post({ form_type: 'class', name: 'Cee One', email: 'c1@example.com', class_date: '2026-10-24T15:00:00+05:30', consent: 'yes' });
const rowOf = (tab, email) => api.read_(tab).rows.filter(x => x.email === email).pop();
assert.strictEqual(rowOf('class', 'c1@example.com').status, 'Pending');
const mk = (id, order, status = 'captured', email = 'c1@example.com') => { rzpPays[id] = { id, order_id: order, status, amount: rzpOrders[order].amount, email, contact: '+919876543210', method: 'upi', created_at: Math.floor(NOW / 1000), notes: [] }; };
mk('pay_C1', classOrder);
const mailsBefore = mails.length;

// verify: missing fields, bad signature, signature of another order, wrong secret → 400 and NOT paid
assert.strictEqual(pa({ action: 'verify_payment', razorpay_order_id: classOrder, razorpay_payment_id: 'pay_C1' }).status, 400);
assert.strictEqual(pa({ action: 'verify_payment', razorpay_order_id: classOrder, razorpay_payment_id: 'pay_C1', razorpay_signature: 'deadbeef' }).error, 'bad_signature');
assert.strictEqual(pa({ action: 'verify_payment', razorpay_order_id: classOrder, razorpay_payment_id: 'pay_C1', razorpay_signature: sign('order_other', 'pay_C1') }).status, 400);
assert.strictEqual(pa({ action: 'verify_payment', razorpay_order_id: classOrder, razorpay_payment_id: 'pay_C1', razorpay_signature: sign(classOrder, 'pay_C1', 'wrong') }).status, 400);
assert.strictEqual(rowOf('class', 'c1@example.com').status, 'Pending', 'bad signature must not mark paid');
assert.strictEqual(mails.length, mailsBefore);

// a payment id that belongs to a different order, even with a valid signature for the pair it names → 400
rzpOrders['order_T999'] = { id: 'order_T999', amount: 100, currency: 'INR', notes: {} };
mk('pay_X', 'order_T999');   // a real payment, but for a different order than the one being verified
assert.strictEqual(pa({ action: 'verify_payment', razorpay_order_id: classOrder, razorpay_payment_id: 'pay_X', razorpay_signature: sign(classOrder, 'pay_X') }).error, 'unknown_payment');

// authorised but not captured yet → not paid, picked up later
mk('pay_A', classOrder, 'authorized');
captureFails = true;
r = pa({ action: 'verify_payment', razorpay_order_id: classOrder, razorpay_payment_id: 'pay_A', razorpay_signature: sign(classOrder, 'pay_A') });
assert.strictEqual(r.ok, true); assert.strictEqual(r.state, 'pending_capture');
assert.strictEqual(rowOf('class', 'c1@example.com').status, 'Pending');
captureFails = false;

// the good path: row Paid at once, confirmation + calendar invite straight away
r = pa({ action: 'verify_payment', razorpay_order_id: classOrder, razorpay_payment_id: 'pay_C1', razorpay_signature: sign(classOrder, 'pay_C1') });
assert.strictEqual(r.ok, true); assert.strictEqual(r.state, 'paid');
let row = rowOf('class', 'c1@example.com');
assert.strictEqual(row.status, 'Paid'); assert.strictEqual(row.payment_id, 'pay_C1'); assert.strictEqual(row.amount_inr, '199');
assert.ok(row.confirmation_sent && row.meeting_link.startsWith('https://meet.google.com/'));
assert.strictEqual(row.class_date, '2026-10-24T15:00:00+05:30');
assert.ok(mails.some(m => m.to === 'c1@example.com' && /booked/.test(m.subject)));
assert.ok(api.read_('payments').rows.some(x => x.payment_id === 'pay_C1' && /Class sign-ups row/.test(x.matched_to)));

// replay of the same success → no second row, no second email
const n1 = mails.length;
r = pa({ action: 'verify_payment', razorpay_order_id: classOrder, razorpay_payment_id: 'pay_C1', razorpay_signature: sign(classOrder, 'pay_C1') });
assert.strictEqual(r.state, 'already_recorded'); assert.strictEqual(mails.length, n1);
assert.strictEqual(api.read_('payments').rows.filter(x => x.payment_id === 'pay_C1').length, 1);

// the 10-minute check later sees the same payment in Razorpay's list and does not double-count it
rzpItems = [Object.assign({ notes: { product: 'class', email: 'c1@example.com' } }, rzpPays['pay_C1'])];
api.every10Minutes();
assert.strictEqual(api.read_('payments').rows.filter(x => x.payment_id === 'pay_C1').length, 1);
assert.strictEqual(mails.length, n1);

// payer typed a different email in the Razorpay window: the website form's email still wins (order notes)
r = pa({ action: 'create_order', product: 'class', email: 'c2@example.com', name: 'Cee Two' });
post({ form_type: 'class', name: 'Cee Two', email: 'c2@example.com', class_date: '2026-10-24T15:00:00+05:30', consent: 'yes' });
mk('pay_C2', r.order_id, 'captured', 'someone.else@example.com');
r = pa({ action: 'verify_payment', razorpay_order_id: r.order_id, razorpay_payment_id: 'pay_C2', razorpay_signature: sign(r.order_id, 'pay_C2') });
assert.strictEqual(r.state, 'paid'); assert.strictEqual(rowOf('class', 'c2@example.com').status, 'Paid');
assert.ok(mails.some(m => m.to === 'c2@example.com' && /booked/.test(m.subject)));

// one-year membership: ₹4,999 (older ₹3,000 payments still count), welcome email, year dates
r = pa({ action: 'create_order', product: 'support', email: 'sup@example.com', name: 'Sup Person' });
assert.strictEqual(r.amount, 499900); assert.strictEqual(r.description, 'One-year membership');
post({ form_type: 'support', name: 'Sup Person', email: 'sup@example.com', consent: 'yes', terms: 'yes' });
mk('pay_S1', r.order_id, 'captured', 'sup@example.com');
r = pa({ action: 'verify_payment', razorpay_order_id: r.order_id, razorpay_payment_id: 'pay_S1', razorpay_signature: sign(r.order_id, 'pay_S1') });
assert.strictEqual(r.state, 'paid');
row = rowOf('support', 'sup@example.com');
assert.strictEqual(row.status, 'Paid'); assert.strictEqual(row.amount_inr, '4999'); assert.strictEqual(row.starts, '19 October 2026'); assert.strictEqual(row.ends, '19 October 2027');
assert.ok(mails.some(m => m.to === 'sup@example.com' && /Welcome to one-year membership/.test(m.subject)));

// doPost routes payment actions and never writes a form row for them
const rowsBefore = api.read_('class').rows.length;
const viaPost = JSON.parse(api.doPost({ parameter: { action: 'create_order', product: 'class', email: 'c3@example.com', name: 'Cee Three' }, parameters: {} }).t);
assert.strictEqual(viaPost.ok, true); assert.strictEqual(api.read_('class').rows.length, rowsBefore);
console.log('Checkout checks passed.');


/* ===================== abandoned payments, retries, failures, self-check ===================== */
NOW = Date.parse('2026-10-20T10:00:00+05:30');                                   // Tuesday
rzpItems = [];
const classRows = () => api.read_('class').rows;
post({ form_type: 'class', name: 'Walk Away', email: 'gone@example.com', class_date: '2026-10-24T15:00:00+05:30', consent: 'yes' });
const goneRow = () => rowOf('class', 'gone@example.com');
assert.strictEqual(goneRow().status, 'Pending');

// an hour later: still Pending (they may still be paying)
NOW = Date.parse('2026-10-20T11:00:00+05:30');
api.every10Minutes();
assert.strictEqual(goneRow().status, 'Pending');

// they come back and try again: same row, no duplicate, clock restarts
const count0 = classRows().length;
NOW = Date.parse('2026-10-20T11:30:00+05:30');
post({ form_type: 'class', name: 'Walk Away', email: 'gone@example.com', phone: '9000000000', class_date: '2026-10-24T15:00:00+05:30', consent: 'yes' });
assert.strictEqual(classRows().length, count0, 'retry must not add a row');
assert.strictEqual(goneRow().phone, '9000000000');
assert.ok(/^Tried again/.test(goneRow().notes));
assert.strictEqual(goneRow().timestamp.getTime(), NOW);

// a failed attempt shows up on their row, once
const tf = Math.floor(NOW / 1000);
rzpItems = [{ id: 'pay_F1', status: 'failed', amount: 19900, email: 'gone@example.com', created_at: tf - 60, notes: {}, error_description: 'Payment was cancelled by the user' }];
api.every10Minutes();
assert.ok(/pay_F1 failed .*cancelled by the user/.test(goneRow().notes), goneRow().notes);
api.every10Minutes();
assert.strictEqual((goneRow().notes.match(/pay_F1/g) || []).length, 1);

// two hours after the last try with no payment: Not paid, note kept
NOW = Date.parse('2026-10-20T13:40:00+05:30');
rzpItems = [];
api.every10Minutes();
assert.strictEqual(goneRow().status, 'Not paid');
assert.ok(/pay_F1/.test(goneRow().notes) && /No payment within 2 hours/.test(goneRow().notes), goneRow().notes);
assert.deepStrictEqual(mails.filter(m => m.to === 'gone@example.com').map(m => m.subject), ["Your seat for Saturday 24 October isn't booked yet"]);   // one follow-up, no class emails

// trying again from Not paid reopens the same row as Pending
post({ form_type: 'class', name: 'Walk Away', email: 'gone@example.com', class_date: '2026-10-24T15:00:00+05:30', consent: 'yes' });
assert.strictEqual(classRows().length, count0); assert.strictEqual(goneRow().status, 'Pending');
NOW = Date.parse('2026-10-20T16:00:00+05:30');
api.every10Minutes();
assert.strictEqual(goneRow().status, 'Not paid');

// a payment that arrives after "Not paid" still books them
rzpItems = [{ id: 'pay_L1', status: 'captured', amount: 19900, email: 'gone@example.com', created_at: Math.floor(NOW / 1000) - 60, notes: {} }];
api.every10Minutes();
assert.strictEqual(goneRow().status, 'Paid'); assert.ok(goneRow().confirmation_sent);
assert.ok(mails.some(m => m.to === 'gone@example.com' && /booked/.test(m.subject)));
assert.strictEqual(classRows().length, count0);

// an authorised payment left uncaptured for over 5 minutes is captured and booked
post({ form_type: 'class', name: 'Auth Only', email: 'auth@example.com', class_date: '2026-10-24T15:00:00+05:30', consent: 'yes' });
rzpItems = [{ id: 'pay_AU', status: 'authorized', amount: 19900, currency: 'INR', email: 'auth@example.com', created_at: Math.floor(NOW / 1000) - 400, notes: {} }];
api.every10Minutes();
assert.strictEqual(rowOf('class', 'auth@example.com').status, 'Paid');
assert.ok(rzpCalls.some(c => /pay_AU\/capture$/.test(c.url) && c.body.amount === 19900));
// an odd amount is never captured
rzpItems = [{ id: 'pay_ODD', status: 'authorized', amount: 777, currency: 'INR', email: 'x@example.com', created_at: Math.floor(NOW / 1000) - 400, notes: {} }];
api.every10Minutes();
assert.ok(!rzpCalls.some(c => /pay_ODD\/capture$/.test(c.url)));

// verify_payment with an authorised payment captures it on the spot
const o2 = pa({ action: 'create_order', product: 'class', email: 'quick@example.com', name: 'Quick' });
post({ form_type: 'class', name: 'Quick', email: 'quick@example.com', class_date: '2026-10-24T15:00:00+05:30', consent: 'yes' });
mk('pay_Q', o2.order_id, 'authorized', 'quick@example.com');
r = pa({ action: 'verify_payment', razorpay_order_id: o2.order_id, razorpay_payment_id: 'pay_Q', razorpay_signature: sign(o2.order_id, 'pay_Q') });
assert.strictEqual(r.state, 'paid'); assert.strictEqual(rowOf('class', 'quick@example.com').status, 'Paid');

// support: interest twice = one row; support sign-up twice = one row, one alert
const supN = api.read_('support').rows.length, alerts = mails.length;
post({ form_type: 'interest', name: 'Dev', email: 'dev@example.com', goal: 'again' });
assert.strictEqual(api.read_('support').rows.length, supN);
post({ form_type: 'support', name: 'Twice', email: 'twice@example.com', consent: 'yes', terms: 'yes' });
NOW += 5 * 60 * 1000;
post({ form_type: 'support', name: 'Twice', email: 'twice@example.com', consent: 'yes', terms: 'yes' });
assert.strictEqual(api.read_('support').rows.length, supN + 1);
assert.strictEqual(mails.length, alerts + 1);
// someone who registered interest then signs up: the sign-up row is the one that turns Paid
post({ form_type: 'support', name: 'Dev', email: 'dev@example.com', consent: 'yes', terms: 'yes' });
rzpItems = [{ id: 'pay_DV', status: 'captured', amount: 300000, email: 'dev@example.com', created_at: Math.floor(NOW / 1000) - 30, notes: {} }];
api.every10Minutes();
assert.deepStrictEqual(api.read_('support').rows.filter(x => x.email === 'dev@example.com').map(x => x.status), ['Interest', 'Paid']);

// an alert that can't be sent (mail quota used up) never loses the sign-up
const realSend = ctx.MailApp.sendEmail;
ctx.MailApp.sendEmail = () => { throw new Error('Service invoked too many times for one day: email.'); };
assert.deepStrictEqual(post({ form_type: 'contact', name: 'Q', email: 'quota@example.com', topic: 'x', message: 'y', privacy: 'yes' }), { ok: true });
assert.ok(api.read_('contact').rows.some(x => x.email === 'quota@example.com'));
ctx.MailApp.sendEmail = realSend;

// columns moved by hand: someone inserts their own column after "timestamp"; everything still lines up
const clsSheet = sheets.find(x => x.name === 'Class sign-ups');
clsSheet.data.forEach((row, i) => row.splice(1, 0, i === 0 ? 'my notes' : 'hand note'));
post({ form_type: 'class', name: 'After Move', email: 'moved@example.com', class_date: '2026-10-24T15:00:00+05:30', consent: 'yes' });
let mv = rowOf('class', 'moved@example.com');
assert.strictEqual(mv.name, 'After Move'); assert.strictEqual(mv.status, 'Pending'); assert.strictEqual(mv['my notes'], '');
assert.strictEqual(rowOf('class', 'asha@example.com')['my notes'], 'hand note');
assert.strictEqual(rowOf('class', 'asha@example.com').status, 'Paid');
rzpItems = [{ id: 'pay_MV', status: 'captured', amount: 19900, email: 'moved@example.com', created_at: Math.floor(NOW / 1000) - 30, notes: {} }];
api.every10Minutes();
mv = rowOf('class', 'moved@example.com');
assert.strictEqual(mv.status, 'Paid'); assert.ok(mv.confirmation_sent); assert.strictEqual(mv['my notes'], '');

// a heading deleted by mistake comes back at the end
const langAt = clsSheet.data[0].indexOf('lang');
clsSheet.data.forEach(row => row.splice(langAt, 1));
api.read_('class');
assert.strictEqual(clsSheet.data[0][clsSheet.data[0].length - 1], 'lang');

// self-check: paid twice for one class, a typo'd status, test mode, an unmatched payment
const tw = api.read_('class');
api.update_(tw.sh, tw.cols, rowOf('class', 'quick@example.com')._row, { email: 'gone@example.com' });  // gone@ now has two paid seats
api.update_(tw.sh, tw.cols, rowOf('class', 'auth@example.com')._row, { status: 'paid' });
const issues = api.checkSheet();
assert.ok(issues.some(x => /gone@example.com has paid twice/.test(x)), issues.join('\n'));
assert.ok(issues.some(x => /status "paid" isn't one the script knows/.test(x)), issues.join('\n'));
assert.ok(issues.some(x => /test mode/.test(x)));
assert.ok(issues.some(x => /₹50 from odd@example.com/.test(x)), issues.join('\n'));
// the daily email goes out the next morning, once, and lists real problems only (not test mode)
NOW = Date.parse('2026-10-21T09:05:00+05:30');
const pre = mails.length;
api.every10Minutes(); api.every10Minutes();
const daily = mails.slice(pre).filter(m => /^Sheet check/.test(m.subject));
assert.strictEqual(daily.length, 1);
assert.ok(/paid twice/.test(daily[0].body) && !/test mode/.test(daily[0].body), daily[0].body);
console.log('Abandoned-payment and self-check tests passed.');


/* ===================== one-year support: interest list, members' calls, end of year ===================== */
const S = api.SETTINGS, plain = o => JSON.parse(JSON.stringify(o));
const supRow = email => api.read_('support').rows.filter(x => x.email === email);
const to = (email, re) => mails.filter(m => m.to === email && (!re || re.test(m.subject)));
const DISC = 'For educational purposes only. Not investment advice.';

// dates as written in the sheet
assert.strictEqual(api.iso_(api.parseDay_('17 October 2027')), '2027-10-17T00:00:00+05:30');
assert.strictEqual(api.iso_(api.parseDay_('17 Oct 2027')), '2027-10-17T00:00:00+05:30');
assert.strictEqual(api.iso_(api.parseDay_('2027-10-17')), '2027-10-17T00:00:00+05:30');
assert.strictEqual(api.iso_(api.parseDay_(new FakeDate('2027-10-17T00:00:00+05:30'))), '2027-10-17T00:00:00+05:30');
assert.strictEqual(api.parseDay_('next year'), null);
assert.strictEqual(api.parseDay_(''), null);

// 1. the register-interest list: the timer never emails it; emailInterestList does, once per person
post({ form_type: 'interest', name: 'Kiran R', email: 'kiran@example.com', goal: 'Index funds' });
post({ form_type: 'interest', name: 'Lata', email: 'lata@example.com' });
api.every10Minutes();
const openMails = () => mails.filter(m => m.subject === 'One-year membership is now open');
assert.strictEqual(openMails().length, 0, 'the timer must not email the interest list');
mailQuota = 11;                                                                   // room for one, after a reserve of 10
let res = plain(api.emailInterestList());
assert.deepStrictEqual(res, { sent: 1, skipped: 1, left: 1 });                    // dev@ already paid: skipped
const kiran = to('kiran@example.com', /now open/)[0];
assert.ok(kiran.body.includes('Hi Kiran,') && kiran.body.includes('https://researchbysrivathsa.com/membership.html#join-support') &&
  kiran.body.includes('₹4,999 a year') && kiran.body.includes(DISC), kiran.body);
assert.ok(!/\bI\b/.test(kiran.body));
assert.ok(/^Support-open email sent 2026-10-21/.test(supRow('kiran@example.com')[0].notes));
assert.strictEqual(supRow('dev@example.com')[0].notes, 'Support-open email skipped: already has a sign-up row');
assert.strictEqual(supRow('lata@example.com')[0].notes, '');                       // still to send
mailQuota = 100;
api.append_('support', { timestamp: new Date(), form_type: 'interest', name: 'Kiran R', email: 'kiran@example.com', status: 'Interest' });  // hand-added twice
res = plain(api.emailInterestList());
assert.deepStrictEqual(res, { sent: 1, skipped: 1, left: 0 });
assert.ok(/sent on another row/.test(supRow('kiran@example.com')[1].notes));
assert.deepStrictEqual(plain(api.emailInterestList()), { sent: 0, skipped: 0, left: 0 });
assert.strictEqual(openMails().length, 2);
assert.strictEqual(to('kiran@example.com', /now open/).length, 1);
assert.strictEqual(to('dev@example.com', /now open/).length, 0);

// a member whose year is already over, added by hand: never invited, no end-of-year email
api.append_('support', { timestamp: new Date(), form_type: 'support', name: 'Old Member', email: 'old@example.com', status: 'Paid',
  starts: '1 October 2025', ends: '1 October 2026', welcome_sent: 'by hand' });
api.every10Minutes();
assert.strictEqual(supRow('old@example.com')[0].ending_reminder_sent, 'skipped: year already over');

// 2. members' call on the 15th: event + invites 7 days before
const callEvents = () => Object.values(events).filter(e => e.summary === S.MEMBERS_CALL_TITLE);
NOW = Date.parse('2026-11-07T20:00:00+05:30');                                    // 7 days and 23 hours before: too early
api.every10Minutes();
assert.strictEqual(callEvents().length, 0);
NOW = Date.parse('2026-11-08T20:00:00+05:30');
api.every10Minutes();
assert.strictEqual(callEvents().length, 1);
let call = callEvents()[0];
assert.strictEqual(call.start.dateTime, '2026-11-15T13:30:00.000Z'); assert.strictEqual(call.end.dateTime, '2026-11-15T14:30:00.000Z');
assert.strictEqual(call.guestsCanSeeOtherGuests, false); assert.strictEqual(call.guestsCanInviteOthers, false);
assert.ok(call.conferenceData.createRequest && call.description.includes(DISC));
assert.strictEqual(call._sendUpdates, 'all');
assert.strictEqual(props['CALL_EVENT_2026-11-15T19:00'], call.id);
assert.deepStrictEqual(call.attendees.map(a => a.email).sort(), ['dev@example.com', 'priya@example.com', 'sup@example.com']);
const callSubject = /^Members' Q&A call: Sunday 15 November, 7:00 pm IST$/;
['dev@example.com', 'priya@example.com', 'sup@example.com'].forEach(e => assert.strictEqual(to(e, callSubject).length, 1, e));
const pc = to('priya@example.com', callSubject)[0];
assert.ok(pc.body.includes(call.hangoutLink) && pc.body.includes('Sunday 15 November 2026, 7:00 to 8:00 pm IST') &&
  pc.body.includes('not recorded') && pc.body.includes('not personal advice') && pc.body.includes(DISC), pc.body);
assert.strictEqual(to('old@example.com').length, 0);
assert.strictEqual(supRow('priya@example.com')[0].last_call_invite, '2026-11-15T19:00:00+05:30');
const nCall = mails.length, p0 = patches;
api.every10Minutes();
assert.strictEqual(mails.length, nCall); assert.strictEqual(patches, p0);         // nothing repeated
assert.strictEqual(callEvents().length, 1);

// someone who joins after the invites went out is added (and emailed) straight away; nobody else hears again
NOW = Date.parse('2026-11-10T10:00:00+05:30');
rzpItems = [{ id: 'pay_LATE', status: 'captured', amount: 300000, email: 'late@example.com', contact: '+915', created_at: Math.floor(NOW / 1000) - 30, notes: { full_name: 'Late Joiner' } }];
api.every10Minutes();
assert.strictEqual(supRow('late@example.com')[0].starts, '10 November 2026');
assert.ok(to('late@example.com', /Welcome/)[0].body.includes('The next one is on Sunday 15 November 2026, 7:00 to 8:00 pm IST'));
assert.strictEqual(to('late@example.com', callSubject).length, 1);
assert.strictEqual(callEvents()[0].attendees.length, 4);
assert.strictEqual(to('priya@example.com', callSubject).length, 1);

// the call moved a day earlier after invites went out: a new event, and everyone is emailed the new date
S.MEMBERS_CALL_DATES = ['2026-11-14'];
api.every10Minutes();
assert.strictEqual(to('priya@example.com', /^Members' Q&A call: Saturday 14 November/).length, 1);
assert.strictEqual(callEvents().length, 2);
api.every10Minutes();
assert.strictEqual(to('priya@example.com', /^Members' Q&A call: Saturday 14 November/).length, 1);

// a list of dates wins over the day of the month, and a date can carry its own time
S.MEMBERS_CALL_DATES = ['2026-12-05', '2026-12-20 18:30'];
NOW = Date.parse('2026-11-29T20:00:00+05:30');
api.every10Minutes();
NOW = Date.parse('2026-12-14T10:00:00+05:30');
api.every10Minutes();
assert.deepStrictEqual(callEvents().map(e => e.start.dateTime), ['2026-11-15T13:30:00.000Z', '2026-11-14T13:30:00.000Z', '2026-12-05T13:30:00.000Z', '2026-12-20T13:00:00.000Z']);
assert.strictEqual(to('late@example.com', /^Members' Q&A call/).length, 4);
assert.strictEqual(supRow('late@example.com')[0].last_call_invite, '2026-12-20T18:30:00+05:30');

// the check flags a missing or unreadable call date while there are members, and a date it can't read in the sheet
S.MEMBERS_CALL_DATES = ['20 Dec'];
let found = api.checkSheet();
assert.ok(found.some(x => /MEMBERS_CALL_DATES in SETTINGS has "20 Dec"/.test(x)), found.join('\n'));
assert.ok(found.some(x => /4 one-year membership members are current, but no members' Q&A call is set/.test(x)), found.join('\n'));
S.MEMBERS_CALL_DATES = []; S.MEMBERS_CALL_DAY = 0;
assert.ok(api.checkSheet().some(x => /no members' Q&A call is set/.test(x)));
S.MEMBERS_CALL_DAY = 15;
assert.ok(!api.checkSheet().some(x => /members' Q&A call|MEMBERS_CALL/.test(x)));
api.append_('support', { timestamp: new Date(), form_type: 'support', name: 'Bad Date', email: 'bad@example.com', status: 'Paid',
  starts: '1 Nov 2026', ends: 'next year', welcome_sent: 'by hand' });
assert.ok(api.checkSheet().some(x => /bad@example.com\): the ends date can't be read/.test(x)));
let sa = api.read_('support');
api.update_(sa.sh, sa.cols, supRow('bad@example.com')[0]._row, { status: 'Cancelled' });

// 3. end of the year: one email about 14 days before `ends`
const endingSubject = /^Your one-year membership ends on /;
NOW = Date.parse('2027-10-02T10:00:00+05:30');                                    // 14 days 14 hours before 17 October
api.every10Minutes();
assert.strictEqual(mails.filter(m => endingSubject.test(m.subject)).length, 0);
NOW = Date.parse('2027-10-03T10:00:00+05:30');
api.every10Minutes();
assert.deepStrictEqual(mails.filter(m => endingSubject.test(m.subject)).map(m => m.to), ['priya@example.com']);
const end = to('priya@example.com', endingSubject)[0];
assert.strictEqual(end.subject, 'Your one-year membership ends on 17 October 2027');
assert.ok(end.body.includes("doesn't renew by itself") && end.body.includes(S.SUPPORT_JOIN_URL) &&
  end.body.includes('Friday 15 October 2027, 7:00 to 8:00 pm IST') && end.body.includes(DISC), end.body);
assert.ok(supRow('priya@example.com')[0].ending_reminder_sent.startsWith('2027-10-03'));
api.every10Minutes();
assert.strictEqual(to('priya@example.com', endingSubject).length, 1);

// renewed already: no "join again" email for the old year
api.append_('support', { timestamp: new Date(), form_type: 'support', name: 'Sup Person', email: 'sup@example.com', status: 'Paid',
  starts: '4 October 2027', ends: '4 October 2028', welcome_sent: 'by hand' });
NOW = Date.parse('2027-10-05T10:00:00+05:30');
api.every10Minutes();
assert.strictEqual(to('sup@example.com', endingSubject).length, 0);
assert.strictEqual(supRow('sup@example.com')[0].ending_reminder_sent, 'skipped: renewed');

// the 15 October call: someone with two covering rows (old year + renewal) gets one email, both rows stamped
NOW = Date.parse('2027-10-09T10:00:00+05:30');
api.every10Minutes();
const oct = callEvents().find(e => e.start.dateTime === '2027-10-15T13:30:00.000Z');
assert.deepStrictEqual(oct.attendees.map(a => a.email).sort(), ['dev@example.com', 'late@example.com', 'priya@example.com', 'sup@example.com']);
assert.strictEqual(to('sup@example.com', /^Members' Q&A call: Friday 15 October/).length, 1);
assert.deepStrictEqual(supRow('sup@example.com').map(x => x.last_call_invite), ['2027-10-15T19:00:00+05:30', '2027-10-15T19:00:00+05:30']);
assert.strictEqual(to('dev@example.com', endingSubject).length, 1);               // dev's year ends 20 October
// a renewal row added after the invite went out: stamped, but no second email for the same call
api.append_('support', { timestamp: new Date(), form_type: 'support', name: 'Late Joiner', email: 'late@example.com', status: 'Paid',
  starts: '9 October 2027', ends: '9 October 2028', welcome_sent: 'by hand' });
api.every10Minutes();
assert.strictEqual(to('late@example.com', /^Members' Q&A call: Friday 15 October/).length, 1);
assert.deepStrictEqual(supRow('late@example.com').map(x => x.last_call_invite), ['2027-10-15T19:00:00+05:30', '2027-10-15T19:00:00+05:30']);

// the November call is only for years that cover it
NOW = Date.parse('2027-11-09T10:00:00+05:30');
api.every10Minutes();
const nov = callEvents().find(e => e.start.dateTime === '2027-11-15T13:30:00.000Z');
assert.deepStrictEqual(nov.attendees.map(a => a.email).sort(), ['late@example.com', 'sup@example.com']);
assert.strictEqual(to('priya@example.com', /^Members' Q&A call: Monday 15 November/).length, 0);
assert.strictEqual(to('late@example.com', endingSubject).length, 0);              // renewed before 10 November
assert.strictEqual(supRow('late@example.com')[0].ending_reminder_sent, 'skipped: renewed');
console.log('One-year support checks passed.');


/* ===================== "you didn't finish" email; one Meet link per class ===================== */
{
  const HOUR_ = 3600000;
  NOW = Date.parse('2027-11-15T10:00:00+05:30');                                  // Monday
  rzpItems = [];
  const classDate = api.iso_(api.nextClass_());                                     // Saturday 20 November 2027
  const signUp = (email, name) => post({ form_type: 'class', name, email, class_date: classDate, consent: 'yes' });
  const unpaidMails = to => mails.filter(m => m.to === to && /isn't booked yet|isn't set up yet/.test(m.subject));

  // walks away → Not paid after 2 hours → exactly one friendly email, pointing at their class and the booking page
  signUp('nudge@example.com', 'Nudge Person');
  NOW += 2 * HOUR_ + 10 * 60000;
  api.every10Minutes();
  assert.strictEqual(rowOf('class', 'nudge@example.com').status, 'Not paid');
  let um = unpaidMails('nudge@example.com');
  assert.strictEqual(um.length, 1);
  assert.strictEqual(um[0].subject, "Your seat for Saturday 20 November isn't booked yet");
  assert.ok(um[0].body.includes('Hi Nudge,') && um[0].body.includes('Saturday 20 November 2027') && um[0].body.includes('classes.html#join'), um[0].body);
  assert.ok(um[0].body.includes('only email') && um[0].body.includes('For educational purposes only. Not investment advice.') && um[0].body.trim().endsWith("Reply STOP and we won't email you about this again.") && !um[0].body.includes('If money left'), um[0].body);
  assert.ok(rowOf('class', 'nudge@example.com').unpaid_email_sent);
  api.every10Minutes();
  assert.strictEqual(unpaidMails('nudge@example.com').length, 1);                 // never twice

  // tries again and walks away again the same week: no second email
  NOW += 60 * 60000; signUp('nudge@example.com', 'Nudge Person');
  NOW += 2 * HOUR_ + 10 * 60000; api.every10Minutes();
  assert.strictEqual(unpaidMails('nudge@example.com').length, 1);

  // paid in the meantime (another row) → no email
  signUp('payer@example.com', 'Payer');
  rzpItems = [{ id: 'pay_NP', status: 'captured', amount: 19900, email: 'payer@example.com', created_at: Math.floor(NOW / 1000) - 30, notes: {} }];
  api.every10Minutes();
  rzpItems = [];
  NOW += 60000; signUp('payer@example.com', 'Payer');                               // a second, unpaid try
  NOW += 2 * HOUR_ + 10 * 60000; api.every10Minutes();
  assert.strictEqual(unpaidMails('payer@example.com').length, 0);

  // support: its own wording and link
  post({ form_type: 'support', name: 'Sup Away', email: 'supaway@example.com', consent: 'yes', terms: 'yes' });
  NOW += 2 * HOUR_ + 10 * 60000; api.every10Minutes();
  um = unpaidMails('supaway@example.com');
  assert.strictEqual(um.length, 1); assert.ok(um[0].body.includes('membership.html#join-support'));

  /* rows older than 2 days are never emailed (e.g. old Pending rows tidied up on the first run after deploying) */
  const shC = sheets.find(x => x.name === 'Class sign-ups');
  signUp('old@example.com', 'Old Row');
  const oldR = rowOf('class', 'old@example.com');
  shC.data[oldR._row - 1][shC.data[0].indexOf('timestamp')] = new FakeDate(NOW - 3 * 24 * HOUR_);
  api.every10Minutes();
  assert.strictEqual(rowOf('class', 'old@example.com').status, 'Not paid');
  assert.strictEqual(unpaidMails('old@example.com').length, 0);

  /* ---------- one Meet link per class ---------- */
  const book = (email, id) => {
    signUp(email, 'Guest ' + id);
    rzpItems = [{ id, status: 'captured', amount: 19900, email, created_at: Math.floor(NOW / 1000) - 30, notes: {} }];
    api.every10Minutes(); rzpItems = [];
    return rowOf('class', email);
  };
  const eventsFor = d => Object.values(events).filter(e => !e._deleted && e.start && Date.parse(e.start.dateTime) === Date.parse(d));
  const a = book('m1@example.com', 'pay_M1'), b = book('m2@example.com', 'pay_M2');
  assert.ok(a.meeting_link && a.meeting_link === b.meeting_link);
  assert.strictEqual(eventsFor(classDate).length, 1);

  // a Calendar hiccup never makes a second meeting: the confirmation waits and retries
  calHiccup = true;
  let c = book('m3@example.com', 'pay_M3');
  assert.strictEqual(c.status, 'Paid'); assert.ok(!c.confirmation_sent && /will retry/.test(c.notes), c.notes);
  assert.strictEqual(eventsFor(classDate).length, 1);
  calHiccup = false;
  api.every10Minutes();
  c = rowOf('class', 'm3@example.com');
  assert.strictEqual(c.meeting_link, a.meeting_link);

  // the saved event id is lost (e.g. Script properties cleared): the event is found on the calendar, same link
  Object.keys(props).filter(k => k.startsWith('EVENT_')).forEach(k => delete props[k]);
  const d = book('m4@example.com', 'pay_M4');
  assert.strictEqual(d.meeting_link, a.meeting_link);
  assert.strictEqual(eventsFor(classDate).length, 1);

  // the event is deleted by hand: the new one takes everyone already booked, so the class still shares one link
  eventsFor(classDate)[0]._deleted = true;
  const e = book('m5@example.com', 'pay_M5');
  assert.strictEqual(eventsFor(classDate).length, 1);
  const ev2 = eventsFor(classDate)[0];
  assert.notStrictEqual(e.meeting_link, a.meeting_link);
  ['m1', 'm2', 'm3', 'm4', 'm5'].forEach(n => {
    assert.ok(ev2.attendees.some(g => g.email === n + '@example.com'), n + ' missing from the new event');
    assert.strictEqual(rowOf('class', n + '@example.com').meeting_link, e.meeting_link, n + ' has the old link');
  });

  // reminders always carry the class's current link, even if a row still holds an old one
  const tw2 = api.read_('class');
  api.update_(tw2.sh, tw2.cols, rowOf('class', 'm1@example.com')._row, { meeting_link: 'https://meet.google.com/old-link' });
  assert.ok(api.checkSheet().some(x => /two different Meet links/.test(x)));
  NOW = Date.parse(classDate) - 60 * 60000 + 60000;                                 // 59 minutes before
  api.every10Minutes();
  const soon = mails.filter(m => m.to === 'm1@example.com' && /Starting soon/.test(m.subject)).pop();
  assert.ok(soon && soon.body.includes(e.meeting_link) && !soon.body.includes('old-link'), soon && soon.body);
  assert.strictEqual(rowOf('class', 'm1@example.com').meeting_link, e.meeting_link);
  assert.ok(!api.checkSheet().some(x => /two different Meet links/.test(x)));
  console.log('Unpaid email and one-Meet-link checks passed.');
}

{
  // formula guard: anything a spreadsheet would run as a formula gets a leading apostrophe; plain numbers don't
  ['=1+1', '@SUM(A1)', '+1+IMAGE("x")', '-2*HYPERLINK("x")', '+cmd'].forEach(s => assert.strictEqual(api.clean_(s), "'" + s, s));
  ['+91 98765 43210', '-5', '98765 43210', 'Ravi', '(080) 1234-5678'].forEach(s => assert.strictEqual(api.clean_(s), s, s));

  // flood limits
  assert.ok([1, 2, 3].every(() => api.rateOk_('t-small', 3, 600)) && !api.rateOk_('t-small', 3, 600));
  assert.ok(api.rateOk_('t-off', 0, 600));                                           // 0 = no limit
  let last;
  for (let i = 0; i < 11; i++) last = post({ action: 'create_order', product: 'class', name: 'F', email: 'flood@example.com' });
  assert.strictEqual(last.error, 'busy', JSON.stringify(last));
  const sent = mails.length;
  for (let i = 0; i < 25; i++) api.notify_('flood ' + i, '', 'x');
  assert.ok(mails.length - sent <= 20, 'alert emails were not capped: ' + (mails.length - sent));
  console.log('Formula guard and flood-limit checks passed.');
}

/* ===================== where sign-ups came from, the email opt-in, attendance, Reply-To ===================== */
{
  const when = api.iso_(api.nextClass_());
  const head = name => sheets.find(x => x.name === name).data[0];
  const base = { form_type: 'class', name: 'Src One', email: 'src1@example.com', class_date: when, ack: 'yes', privacy: 'yes' };

  // all fields filled
  post(Object.assign({}, base, { utm_source: ' Test ', utm_medium: 'claude', utm_campaign: 'n4check', heard_from: 'Instagram', marketing_opt_in: 'yes' }));
  let r = rowOf('class', 'src1@example.com');
  assert.strictEqual(r.utm_source, 'test'); assert.strictEqual(r.utm_medium, 'claude'); assert.strictEqual(r.utm_campaign, 'n4check');
  assert.strictEqual(r.heard_from, 'instagram'); assert.strictEqual(r.marketing_opt_in, 'yes');
  assert.ok(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+05:30$/.test(r.marketing_opt_in_at), r.marketing_opt_in_at);
  assert.strictEqual(r.attendance, ''); assert.strictEqual(r.status, 'Pending'); assert.strictEqual(r.consent, 'yes');
  const firstYes = r.marketing_opt_in_at;

  // nothing filled: all blank; junk values are dropped
  post({ form_type: 'class', name: 'Src Two', email: 'src2@example.com', class_date: when, ack: 'yes', privacy: 'yes',
    heard_from: 'facebook', marketing_opt_in: 'on', utm_source: '=IMAGE("x")<b>' });
  r = rowOf('class', 'src2@example.com');
  assert.strictEqual(r.heard_from, ''); assert.strictEqual(r.marketing_opt_in, ''); assert.strictEqual(r.marketing_opt_in_at, '');
  assert.strictEqual(r.utm_source, 'imagexb'); assert.strictEqual(r.utm_medium, ''); assert.strictEqual(r.attendance, '');

  // a retry: a repeat yes keeps the first time; unticking clears it; UTM from the first try is kept
  NOW += 2 * 60000; post(Object.assign({}, base, { marketing_opt_in: 'yes' }));
  r = rowOf('class', 'src1@example.com');
  assert.strictEqual(r.marketing_opt_in_at, firstYes); assert.strictEqual(r.utm_source, 'test');
  NOW += 2 * 60000; post(base);
  r = rowOf('class', 'src1@example.com');
  assert.strictEqual(r.marketing_opt_in, ''); assert.strictEqual(r.marketing_opt_in_at, '');

  // attendance filled by hand survives payment and the timer
  const shC = sheets.find(x => x.name === 'Class sign-ups');
  shC.data[r._row - 1][head('Class sign-ups').indexOf('attendance')] = 'yes';
  rzpItems = [{ id: 'pay_SRC', status: 'captured', amount: 19900, email: 'src1@example.com', created_at: Math.floor(NOW / 1000) - 30, notes: {} }];
  api.every10Minutes(); api.every10Minutes(); rzpItems = [];
  r = rowOf('class', 'src1@example.com');
  assert.strictEqual(r.status, 'Paid'); assert.strictEqual(r.attendance, 'yes');

  // new columns come after the existing ones, in this order (an earlier test moved "lang" to the end on purpose);
  // support has no attendance column
  const NEW = ['utm_source', 'utm_medium', 'utm_campaign', 'heard_from', 'marketing_opt_in', 'marketing_opt_in_at', 'attendance'];
  const hc = head('Class sign-ups');
  assert.deepStrictEqual(hc.filter(h => NEW.includes(h)), NEW);
  assert.ok(hc.indexOf('notes') < hc.indexOf('utm_source') && hc.indexOf('unpaid_email_sent') < hc.indexOf('utm_source'));
  assert.deepStrictEqual(head('One-year support').filter(h => NEW.includes(h)), NEW.slice(0, 6));

  // membership form
  post({ form_type: 'support', name: 'Src Sup', email: 'srcsup@example.com', consent: 'yes', terms: 'yes', heard_from: 'linkedin', marketing_opt_in: 'yes', utm_campaign: 'n4check' });
  const s = supRow('srcsup@example.com').pop();
  assert.strictEqual(s.heard_from, 'linkedin'); assert.strictEqual(s.marketing_opt_in, 'yes'); assert.strictEqual(s.utm_campaign, 'n4check');

  // every email to a customer has Reply-To hello@ and ends with the short disclaimer (or the STOP line after it)
  const toCustomers = mails.filter(m => m.to !== 'owner@example.com');
  assert.ok(toCustomers.length > 10);
  toCustomers.forEach(m => {
    assert.strictEqual(m.replyTo, 'hello@researchbysrivathsa.com', m.subject);
    assert.ok(m.body.includes(DISC) && !m.body.includes('Investments carry risk'), m.subject);
  });
  console.log('Source, opt-in, attendance and Reply-To checks passed.');
}

console.log('All Apps Script checks passed. Emails sent:', mails.length);
[[/booked/, 'confirmation'], [/now open/, 'support is open (emailInterestList)'], [/^Members' Q&A call/, 'members\' call invite'], [/ends on/, 'end of year']]
  .forEach(([re, what]) => mails.filter(m => re.test(m.subject)).slice(0, 1).forEach(m => console.log('\n--- sample ' + what + ' ---\nSubject: ' + m.subject + '\n' + m.body)));
