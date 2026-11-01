/* Free 1-on-1 call: the booking form on free-call.html and the yes / no page free-call-reply.html.
   Free times come from the Apps Script (_backend/Code.gs, GET ?action=consult_slots) and are always shown in IST.
   With no FORMS_ENDPOINT in config.js, or ?demo in the address, the page makes up sample times and books nothing. */
(() => {
  const cfg = window.RBS_CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const api = cfg.CONSULT_ENDPOINT || cfg.FORMS_ENDPOINT || '';
  const demo = !api || new URLSearchParams(location.search).has('demo');
  const contact = cfg.CONTACT_EMAIL || 'hello@researchbysrivathsa.com';
  const IST = 'Asia/Kolkata';
  const fmt = (d, o, tz = IST) => new Intl.DateTimeFormat('en-IN', Object.assign({ timeZone: tz }, o)).format(d);
  const dayKey = d => fmt(d, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const dayShort = d => fmt(d, { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
  const dayLong = d => fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
  const time = (d, tz) => fmt(d, { hour: 'numeric', minute: '2-digit', hour12: true }, tz).toLowerCase().replace(/\s+/g, ' ');
  const here = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } })();
  const abroad = here && here !== IST && here !== 'Asia/Calcutta';
  const track = (name, props = {}) => {
    try {
      if (window.plausible) window.plausible(name, { props });
      if (window.gtag) window.gtag('event', name, props);
      if (window.fbq && name === 'generate_lead') window.fbq('track', 'Schedule');
    } catch (e) {}
  };
  const post = async data => {
    const res = await fetch(api, { method: 'POST', body: new URLSearchParams(data), headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  };
  const el = (tag, attrs = {}, text) => {
    const n = document.createElement(tag);
    Object.keys(attrs).forEach(k => n.setAttribute(k, attrs[k]));
    if (text != null) n.textContent = text;
    return n;
  };

  /* ---------- booking form (free-call.html) ---------- */
  const form = $('#call-form');
  if (form) {
    const loadedAt = Date.now();
    const status = $('[data-slot-status]', form), picker = $('[data-picker]', form);
    const daysBox = $('[data-days]', form), timesBox = $('[data-times]', form), chosen = $('[data-chosen]', form);
    const whenField = $('#fc-when-field'), investsField = $('#fc-invests-field');
    let byDay = new Map(), picked = null;

    // sample times for demo mode: the next three weekends, 12 noon to 10:30 pm IST, skipping the 3 pm class
    const demoSlots = () => {
      const out = [], now = Date.now();
      for (let i = 0; i < 21; i++) {
        const day = new Date(now + i * 864e5), ymd = fmt(day, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');
        const wd = fmt(day, { weekday: 'short' });
        if (wd !== 'Sat' && wd !== 'Sun') continue;
        for (let m = 12 * 60; m <= 22 * 60 + 30; m += 30) {
          const hh = String(Math.floor(m / 60)).padStart(2, '0'), mm = String(m % 60).padStart(2, '0');
          if (wd === 'Sat' && (hh + mm === '1500' || hh + mm === '1530')) continue;
          const iso = ymd + 'T' + hh + ':' + mm + ':00+05:30';
          if (Date.parse(iso) > now + 3 * 3600e3) out.push(iso);
        }
      }
      return out;
    };

    const say = (msg, isError) => {
      status.textContent = msg;
      status.hidden = !msg;
      status.classList.toggle('fc-status-error', !!isError);
    };

    function showChosen() {
      const input = $('input[name="slot"]:checked', form);
      picked = input ? new Date(input.value) : null;
      chosen.hidden = !picked;
      if (!picked) return;
      chosen.textContent = 'Your call: ' + dayLong(picked) + ', ' + time(picked) + ' IST' +
        (abroad ? ' (' + time(picked, here) + ' your time)' : '');
      whenField.classList.remove('invalid');
    }

    function showTimes(key) {
      timesBox.replaceChildren();
      (byDay.get(key) || []).forEach(iso => {
        const d = new Date(iso), lab = el('label', { class: 'choice' });
        const input = el('input', { type: 'radio', name: 'slot', value: iso });
        input.setAttribute('aria-label', dayLong(d) + ', ' + time(d) + ' IST');
        lab.append(input, el('span', {}, time(d)));
        timesBox.append(lab);
      });
      showChosen();
    }

    async function loadSlots(keepDay) {
      say('Loading free times…');
      picker.hidden = true;
      let slots;
      try {
        if (demo) slots = demoSlots();
        else {
          const res = await fetch(api + '?action=consult_slots', { headers: { Accept: 'application/json' } });
          const data = await res.json();
          if (!data.ok) throw new Error(data.message || 'not ok');
          slots = data.slots || [];
        }
      } catch (e) {
        say('We couldn\'t load the free times just now. Please refresh the page, or email ' + contact + ' and we\'ll find you a time.', true);
        return;
      }
      byDay = new Map();
      slots.forEach(iso => {
        const k = dayKey(new Date(iso));
        if (!byDay.has(k)) byDay.set(k, []);
        byDay.get(k).push(iso);
      });
      if (!byDay.size) {
        say('Every time is booked for the next three weekends. Please email ' + contact + ' and we\'ll find you one.', true);
        return;
      }
      daysBox.replaceChildren();
      [...byDay.keys()].forEach(k => {
        const d = new Date(byDay.get(k)[0]), lab = el('label', { class: 'choice' });
        const input = el('input', { type: 'radio', name: 'day', value: k });
        input.setAttribute('aria-label', dayLong(d));
        input.addEventListener('change', () => showTimes(k));
        lab.append(input, el('span', {}, dayShort(d)));
        daysBox.append(lab);
      });
      const first = keepDay && byDay.has(keepDay) ? keepDay : [...byDay.keys()][0];
      $('input[name="day"][value="' + first + '"]', daysBox).checked = true;
      showTimes(first);
      say(demo ? 'Sample times (demo mode): nothing will be booked.' : '');
      picker.hidden = false;
    }

    timesBox.addEventListener('change', showChosen);

    // "Nothing yet" and the other boxes don't go together
    const invests = $$('input[name="invests"]', form);
    invests.forEach(c => c.addEventListener('change', () => {
      if (!c.checked) return;
      invests.filter(o => o !== c && (c.value === 'nothing' || o.value === 'nothing')).forEach(o => { o.checked = false; });
      investsField.classList.remove('invalid');
    }));

    // where the visitor came from (the ad's utm_ tags), as site.js keeps it for this tab
    const utmClean = v => String(v || '').trim().toLowerCase().replace(/[^a-z0-9_.+-]/g, '').slice(0, 60);
    let saved = {};
    try { saved = JSON.parse(sessionStorage.getItem('rbs_utm') || '{}') || {}; } catch (e) {}
    const q = new URLSearchParams(location.search);
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach(k => { form.elements[k].value = utmClean(q.get(k) || saved[k]); });
    const page = el('input', { type: 'hidden', name: 'page', value: location.pathname });
    form.append(page);

    // inline checks, the same look as the other forms
    const fields = $$('.field', form).filter(f => $(':scope > input, :scope > select, :scope > textarea', f));
    const check = f => {
      const input = $(':scope > input, :scope > select, :scope > textarea', f), ok = input.checkValidity();
      f.classList.toggle('invalid', !ok);
      input.setAttribute('aria-invalid', String(!ok));
      return ok;
    };
    fields.forEach(f => { const i = $(':scope > input, :scope > select, :scope > textarea', f); i.addEventListener('blur', () => { if (i.value) check(f); }); });
    form.addEventListener('focusin', () => track('form_start', { form: 'consult' }), { once: true });

    const err = $('.form-error', form), errText = err.textContent;
    const fail = msg => { err.textContent = msg || errText; err.hidden = false; err.focus(); };

    form.addEventListener('submit', async e => {
      e.preventDefault();
      err.hidden = true;
      const problems = [];
      if (!picked) { whenField.classList.add('invalid'); problems.push($('input[name="slot"]', form) || whenField); }
      fields.forEach(f => { if (!check(f)) problems.push($(':scope > input, :scope > select, :scope > textarea', f)); });
      if (!invests.some(c => c.checked)) { investsField.classList.add('invalid'); problems.push(invests[0]); }
      const consent = $('#fc-consent');
      if (!consent.checked) problems.push(consent);
      if (problems.length) {
        // first problem in page order
        problems.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
        const first = problems[0];
        if (first.focus) first.focus();
        if (first === consent) consent.reportValidity();
        if (first === whenField) whenField.scrollIntoView({ block: 'center' });
        return;
      }
      // bots fill the hidden field or submit instantly: say nothing and send nothing
      if (form.elements._gotcha.value || Date.now() - loadedAt < 2500) return;

      const btn = $('button[type="submit"]', form), label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Booking…';
      try {
        let res;
        if (demo) res = { ok: true, state: 'booked', when: dayLong(picked) + ', ' + time(picked) + ' IST' };
        else res = await post(new FormData(form));
        if (res.ok) {
          track('generate_lead', { form: 'consult' });
          const done = $('#call-done');
          $('[data-done-when]', done).textContent = res.when;
          $('[data-done-email]', done).textContent = form.elements.email.value.trim();
          $('[data-done-check]', done).hidden = res.state === 'confirmed';
          if (demo && !$('.demo-note', done)) done.append(el('p', { class: 'demo-note' }, 'Demo mode: nothing was booked or sent.'));
          form.hidden = true; done.hidden = false;
          done.setAttribute('tabindex', '-1'); done.focus();
          done.scrollIntoView({ block: 'start' });
          return;
        }
        track('form_error', { form: 'consult', error: res.error || 'not ok' });
        if (res.error === 'slot_taken') {
          const day = $('input[name="day"]:checked', form);
          picked = null;
          await loadSlots(day && day.value);
          whenField.scrollIntoView({ block: 'start' });
        }
        fail(res.message);
      } catch (x) {
        track('form_error', { form: 'consult', error: String(x && x.message || x).slice(0, 80) });
        fail();
      } finally {
        btn.disabled = false; btn.textContent = label;
      }
    });

    loadSlots();
  }

  /* ---------- "still coming?" page (free-call-reply.html?b=…&a=yes|no) ---------- */
  const box = $('#call-reply');
  if (box) {
    const q = new URLSearchParams(location.search), token = (q.get('b') || '').replace(/[^a-f0-9]/gi, ''), wanted = q.get('a');
    const when = $('[data-when]', box), msg = $('[data-msg]', box), ask = $('[data-ask]', box), again = $('[data-again]', box);
    const yes = $('[data-yes]', box), no = $('[data-no]', box);
    const show = (text, opts = {}) => {
      msg.textContent = text;
      ask.hidden = !opts.ask;
      no.hidden = opts.ask === 'no-only' ? false : !opts.ask;
      yes.hidden = opts.ask === 'no-only' || !opts.ask;
      again.hidden = !opts.again;
    };
    const TEXT = {
      booked: wanted === 'no' ? 'Can\'t make it? Tap below and we\'ll cancel the call, so someone else can have the time.' : 'Are you still coming?',
      confirmed: 'You\'re confirmed. See you then. Join with the Google Meet link in your calendar invite or confirmation email.',
      cancelled_now: 'Your call is cancelled. Thank you for letting us know.',
      cancelled: 'This booking is already cancelled.',
      released: 'We didn\'t hear back in time, so we freed up this time for someone else.',
      past: 'This call has already happened.'
    };
    const render = res => {
      if (!res.ok) { show(res.message || 'We couldn\'t find this booking. Please use the link in your latest email, or email ' + contact + '.', { again: true }); return; }
      if (res.when) when.textContent = res.when;
      if (res.state === 'booked') show(TEXT.booked, { ask: true });
      else if (res.state === 'confirmed') show(TEXT.confirmed, { ask: 'no-only' });
      else show(TEXT[res.state] || TEXT.cancelled, { again: res.state !== 'past' });
      if (res.state === 'booked' && wanted === 'no') no.focus();
    };
    const send = async answer => {
      [yes, no].forEach(b => { b.disabled = true; });
      try {
        render(demo ? { ok: true, state: answer === 'yes' ? 'confirmed' : answer === 'no' ? 'cancelled_now' : 'booked', when: 'Saturday 8 November, 7:30 to 8:00 pm IST (demo)' }
          : await post({ action: 'consult_reply', b: token, answer }));
        if (answer === 'yes') track('consult_confirmed');
        if (answer === 'no') track('consult_cancelled');
      } catch (e) {
        show('Something went wrong. Please try again, or reply to our email and we\'ll sort it out.', { ask: true });
      } finally {
        [yes, no].forEach(b => { b.disabled = false; });
      }
    };
    yes.addEventListener('click', () => send('yes'));
    no.addEventListener('click', () => send('no'));
    if (!token && !demo) show('This link is missing a part. Please use the link in your email, or email ' + contact + '.', { again: true });
    else send('');
  }
})();
