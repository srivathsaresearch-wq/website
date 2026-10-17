/* Next live class: every Saturday, 3:00 to 4:00 pm IST.
   Works out the next class from the visitor's clock, so the date never needs editing.
   After 4:00 pm IST on a Saturday it moves to the following Saturday by itself.
   Fills any element marked with data-nc="…" and keeps the Event JSON-LD in step. */
(function (root) {
  function getClass(now = new Date()) {
    const IST = 5.5 * 3600e3, HOUR = 3600e3;
    const t = new Date(now.getTime() + IST);
    const add = (6 - t.getUTCDay() + 7) % 7;
    let s = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + add, 15, 0, 0);
    if (s + HOUR <= t.getTime()) s += 7 * 24 * HOUR;
    const start = new Date(s - IST), end = new Date(start.getTime() + HOUR);
    return { start, end, live: now >= start && now < end };
  }

  const IST_MS = 5.5 * 3600e3;
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  // "2026-10-17T15:00:00+05:30"
  function isoIST(d) { return new Date(d.getTime() + IST_MS).toISOString().slice(0, 19) + '+05:30'; }

  // "Saturday 17 October" (built from parts so every browser prints it the same way)
  function dayDate(d, tz, withYear) {
    const o = { weekday: 'long', day: 'numeric', month: 'long' };
    if (tz) o.timeZone = tz;
    if (withYear) o.year = 'numeric';
    const p = {}; new Intl.DateTimeFormat('en-GB', o).formatToParts(d).forEach(x => { p[x.type] = x.value; });
    return p.weekday + ' ' + p.day + ' ' + p.month + (withYear ? ' ' + p.year : '');
  }
  function dateIST(d, withYear) { return dayDate(d, 'Asia/Kolkata', withYear); }

  // "Starts in 2 days 4 hrs" / "Starts in 3 hrs 20 mins" / "Starts in 1 min"
  function countdown(now, start) {
    const mins = Math.max(1, Math.ceil((start - now) / 60000));
    const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
    if (d > 0) return 'Starts in ' + plural(d, 'day', 'days') + (h ? ' ' + plural(h, 'hr', 'hrs') : '');
    if (h > 0) return 'Starts in ' + plural(h, 'hr', 'hrs') + (m ? ' ' + plural(m, 'min', 'mins') : '');
    return 'Starts in ' + plural(m, 'min', 'mins');
  }

  // Visitors outside India only: "Your time: 10:30 to 11:30 am BST", with the weekday added if it isn't
  // Saturday where they are ("Your time: Friday 11:30 pm to 12:30 am HST"). In India it stays empty and hidden.
  function localLine(c) {
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    if (!tz || tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') return '';
    const t = o => new Intl.DateTimeFormat('en-GB', Object.assign({ hour: 'numeric', minute: '2-digit', hour12: true }, o));
    let from = t({}).format(c.start);
    // the zone's short name: "BST", "EDT"… Each locale only names some zones, so try a few and prefer a real name over "GMT+1"
    let zone = '';
    [undefined, 'en-GB', 'en-US', 'en-AU'].some(loc => {
      try { zone = (new Intl.DateTimeFormat(loc, { timeZoneName: 'short' }).formatToParts(c.end).find(x => x.type === 'timeZoneName') || {}).value || zone; } catch (e) {}
      return zone && !/^(GMT|UTC)[+-]/.test(zone);
    });
    const to = t({}).format(c.end) + (zone ? ' ' + zone : '');
    const ampm = x => (/(am|pm)/i.exec(x) || [''])[0].toLowerCase();
    if (ampm(from) && ampm(from) === ampm(to)) from = from.replace(/\s*(am|pm)$/i, '');
    const day = dayDate(c.start).split(' ')[0];
    return 'Your time: ' + (day === 'Saturday' ? '' : day + ' ') + from + ' to ' + to;
  }

  function eventLD(c) {
    const cfg = root.RBS_CONFIG || {}, site = cfg.SITE_URL || 'https://researchbysrivathsa.com';
    return {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: 'Investing basics, start to finish (live class)',
      description: 'A one-hour live class on Google Meet for first-time investors in India. Educational content only, not investment advice.',
      startDate: isoIST(c.start),
      endDate: isoIST(c.end),
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
      location: { '@type': 'VirtualLocation', url: site + '/classes.html' },
      organizer: { '@type': 'Organization', name: 'Research by Srivathsa', url: site },
      image: site + '/assets/img/og-image.png',
      offers: { '@type': 'Offer', price: String(cfg.CLASS_PRICE_INR || 199), priceCurrency: 'INR', availability: 'https://schema.org/InStock', url: site + '/classes.html#join' }
    };
  }

  function render(now = new Date()) {
    const doc = root.document; if (!doc) return;
    const c = getClass(now);
    const set = (key, text) => doc.querySelectorAll('[data-nc="' + key + '"]').forEach(el => { el.textContent = text; });
    set('date', dateIST(c.start));
    set('next', (c.live ? 'Today, ' : '') + dateIST(c.start));
    set('local', localLine(c));

    doc.querySelectorAll('[data-nc="countdown"]').forEach(el => {
      el.classList.toggle('is-live', c.live);
      el.innerHTML = c.live
        ? '<span class="live-badge"><span class="dot" aria-hidden="true"></span>Live now</span> <span>until 4:00 pm IST</span>'
        : '<span class="count-dot" aria-hidden="true"></span>' + countdown(now, c.start);
    });

    // sign-up forms carry the class they are booking; once a class has started, that is the following week's
    const book = c.live ? new Date(c.start.getTime() + 7 * 24 * 3600e3) : c.start;
    doc.querySelectorAll('input[name="class_date"]').forEach(i => { i.value = isoIST(book); });
    doc.querySelectorAll('input[name="class_date_label"]').forEach(i => { i.value = dateIST(book, true) + ', 3:00 to 4:00 pm IST'; });

    // structured data for search engines
    if (doc.body && doc.body.hasAttribute('data-event-ld')) {
      let s = doc.getElementById('event-ld');
      if (!s) { s = doc.createElement('script'); s.type = 'application/ld+json'; s.id = 'event-ld'; doc.head.appendChild(s); }
      s.textContent = JSON.stringify(eventLD(c));
    }
  }

  root.RBSNextClass = { getClass, isoIST, dateIST, countdown, render };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RBSNextClass;

  // Loaded with defer at the end of <main>; the class block reserves its height in CSS, so filling it
  // causes no layout shift. It re-checks every minute, so the countdown, "Live now" and the
  // Saturday roll-over stay current without a reload.
  if (root.document) {
    render();
    root.document.addEventListener('DOMContentLoaded', () => render());
    setInterval(render, 60 * 1000);
  }
})(typeof window !== 'undefined' ? window : globalThis);
