/* Research by Srivathsa: site behaviour. No dependencies. Every feature degrades to static content. */
(() => {
  const root = document.documentElement;
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches || root.dataset.motion === 'off';
  const speed = () => parseFloat(getComputedStyle(root).getPropertyValue('--speed')) || 1;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // Fallback page fade where cross-document view transitions are not supported
  if (!('onpagereveal' in window) && !reduce()) root.classList.add('fade-in');

  /* ---------- hero entry animation ---------- */
  const main = $('main');
  window.rbsReplay = () => { if (!main) return; main.classList.remove('play'); void main.offsetWidth; main.classList.add('play'); };
  if (main && !reduce()) main.classList.add('play');

  /* ---------- nav ---------- */
  const nav = $('.nav');
  const onScroll = () => nav && nav.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const sheet = $('#sheet'), openBtn = $('#menuOpen'), closeBtn = $('#menuClose');
  function openSheet() { sheet.classList.add('open'); sheet.removeAttribute('inert'); openBtn.setAttribute('aria-expanded', 'true'); document.body.classList.add('locked'); closeBtn.focus(); }
  function closeSheet() { if (!sheet.classList.contains('open')) return; sheet.classList.remove('open'); sheet.setAttribute('inert', ''); openBtn.setAttribute('aria-expanded', 'false'); document.body.classList.remove('locked'); openBtn.focus(); }
  if (sheet && openBtn && closeBtn) {
    sheet.setAttribute('inert', '');
    openBtn.addEventListener('click', openSheet);
    closeBtn.addEventListener('click', closeSheet);
    addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
    // keep focus inside the open sheet
    sheet.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const f = $$('a, button', sheet); const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* ---------- scroll reveal, charts, count-up ----------
     Only elements below the fold are hidden first, so the page is complete at rest. */
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const el = en.target;
      el.classList.remove('pre');
      if (el.hasAttribute('data-count')) countUp(el);
      io.unobserve(el);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 }) : null;

  function belowFold(el) { return el.getBoundingClientRect().top > innerHeight * 0.92; }

  if (io && !reduce()) {
    $$('[data-reveal]').forEach(el => { if (belowFold(el)) { el.classList.add('pre'); io.observe(el); } });
    // charts draw as you scroll where CSS scroll-driven animations exist (html.sd), else animate once on entry
    const sd = window.CSS && CSS.supports('animation-timeline: view()');
    if (sd) root.classList.add('sd');
    $$('[data-chart]').forEach(el => {
      el.querySelectorAll('.line').forEach(p => { try { p.style.setProperty('--len', Math.ceil(p.getTotalLength()) + 1); } catch (e) {} });
      if (sd) return;
      el.classList.add('pre');
      requestAnimationFrame(() => io.observe(el));
    });
    $$('[data-count]').forEach(el => io.observe(el));
  }

  function countUp(el) {
    const target = parseFloat(el.dataset.count), prefix = el.dataset.prefix || '', dur = 1100 * speed();
    if (isNaN(target)) return;
    const final = el.textContent; const t0 = performance.now();
    el.setAttribute('aria-label', final);
    const tick = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = prefix + Math.round(target * e).toLocaleString('en-IN');
      if (k < 1) requestAnimationFrame(tick); else el.textContent = final;
    };
    requestAnimationFrame(tick);
  }

  /* ---------- sticky "how it works" ---------- */
  const how = $('.how');
  if (how && 'IntersectionObserver' in window) {
    const steps = $$('.how-step', how);
    const setActive = n => { how.dataset.active = n; steps.forEach(s => s.classList.toggle('active', s.dataset.step === n)); };
    const sio = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) setActive(en.target.dataset.step); });
    }, { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach(s => sio.observe(s));
    setActive('1');
  }

  /* ---------- gentle card tilt (mouse/pen only) ---------- */
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    $$('[data-tilt]').forEach(card => {
      card.addEventListener('pointermove', e => {
        if (reduce()) return;
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        card.classList.add('tilting');
        card.style.setProperty('--ry', (x * 5).toFixed(2) + 'deg');
        card.style.setProperty('--rx', (-y * 5).toFixed(2) + 'deg');
      });
      card.addEventListener('pointerleave', () => { card.classList.remove('tilting'); card.style.removeProperty('--rx'); card.style.removeProperty('--ry'); });
    });
  }

  /* ---------- learn hub filters ---------- */
  const filters = $('.filters');
  if (filters) {
    const posts = $$('.post', filters.parentElement), btns = $$('button', filters), status = $('#filterStatus'), empty = $('#filterEmpty');
    const apply = topic => {
      let n = 0;
      posts.forEach(p => { const show = topic === 'all' || p.dataset.topic === topic; p.hidden = !show; if (show) n++; });
      btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === topic)));
      if (status) status.textContent = `Showing ${n} ${n === 1 ? 'piece' : 'pieces'}`;
      if (empty) empty.hidden = n > 0;
    };
    btns.forEach(b => b.addEventListener('click', () => { apply(b.dataset.filter); history.replaceState(null, '', b.dataset.filter === 'all' ? location.pathname : '#' + b.dataset.filter); }));
    const fromHash = location.hash.slice(1);
    apply(btns.some(b => b.dataset.filter === fromHash) ? fromHash : 'all');
  }

  /* ---------- carousels ---------- */
  $$('.carousel').forEach(c => {
    const track = $('.track', c), prev = $('[data-prev]', c), next = $('[data-next]', c), count = $('.car-count', c);
    const slides = $$('.slide', track);
    const update = () => {
      const w = slides[0].getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 16);
      const i = Math.round(track.scrollLeft / w);
      if (count) count.textContent = `${Math.min(i + 1, slides.length)} / ${slides.length}`;
      prev.disabled = track.scrollLeft < 4;
      next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    };
    const step = dir => track.scrollBy({ left: dir * (slides[0].getBoundingClientRect().width + 16), behavior: reduce() ? 'auto' : 'smooth' });
    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    track.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
    track.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { e.preventDefault(); step(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); } });
    update();
  });

  /* ---------- forms ----------
     Validate in the browser, then POST to the endpoint set in config.js (the Google Sheet's Apps Script, Formspree or a Make webhook).
     Spam guards: a hidden honeypot field and a minimum time on page. With no endpoint set,
     the form shows its success panel and says nothing was sent (demo mode).
     Class and support sign-ups then go on to pay: with a Razorpay Payment Page link in config.js they are sent
     there; otherwise, with FORMS_ENDPOINT set, Razorpay Standard Checkout opens on this page. The order is made
     and the payment signature checked by the Apps Script (_backend/Code.gs), so no secret is ever in the browser. */
  const cfg = window.RBS_CONFIG || {};
  const ENDPOINT = { class: 'CLASS_FORM_ENDPOINT', interest: 'SUPPORT_FORM_ENDPOINT', support: 'SUPPORT_FORM_ENDPOINT', contact: 'CONTACT_ENDPOINT', newsletter: 'NEWSLETTER_ENDPOINT' };
  const NEXT_STEP = { class: 'CLASS_PAYMENT_LINK', support: 'SUPPORT_PAYMENT_LINK' };
  const loadedAt = Date.now();
  const PAYS = { class: true, support: true };

  /* Booking funnel events: CTA click, form started, sent, error, payment opened/closed/failed/done.
     Sent only to a tool that is already loaded and supports events (Plausible, GA4 after consent,
     the Meta Pixel after consent). Cloudflare Web Analytics counts pages only, so with it this does nothing. */
  const track = (name, props = {}) => {
    try {
      if (window.plausible) window.plausible(name, { props });
      if (window.gtag) window.gtag('event', name, props);
      if (window.fbq && name === 'payment_done') window.fbq('track', 'Purchase', { currency: 'INR', value: Number(props.value) || 0 });
    } catch (e) {}
  };
  $$('a[href$="#join"], a[href$="#signup"], a[href$="#join-support"]').forEach(a => a.addEventListener('click', () => track('booking_cta', { page: location.pathname, to: a.getAttribute('href') })));

  class PayError extends Error {}
  const postForm = async (url, data) => {
    const res = await fetch(url, { method: 'POST', body: new URLSearchParams(data), headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  };
  // checkout.js is only fetched when someone is about to pay
  let checkoutJs;
  const loadCheckout = () => checkoutJs || (checkoutJs = new Promise((ok, no) => {
    if (window.Razorpay) return ok();
    const t = document.createElement('script');
    t.src = 'https://checkout.razorpay.com/v1/checkout.js';
    t.onload = ok;
    t.onerror = () => { checkoutJs = null; no(new PayError('We could not load the payment window. Please check your connection and try again.')); };
    document.head.appendChild(t);
  }));

  // 10-digit Indian numbers get +91 so Razorpay can prefill them; anything else is passed on as typed
  const indianMobile = v => { const d = String(v).replace(/[^\d+]/g, ''); return /^\d{10}$/.test(d) ? '+91' + d : d; };

  // Opens the Razorpay window; the handlers below finish the job later, when the window reports back.
  async function checkout(form, type, say) {
    const val = n => (form.elements[n] ? form.elements[n].value : '');
    const api = cfg.FORMS_ENDPOINT;
    const [order] = await Promise.all([
      postForm(api, { action: 'create_order', product: type, name: val('name'), email: val('email'), phone: val('phone'), class_date: val('class_date') }),
      loadCheckout()
    ]);
    if (!order.ok) throw new PayError(order.message || 'We could not start the payment. Please try again.');
    const help = id => 'Please do not pay again. Email ' + (cfg.CONTACT_EMAIL || 'us') + ' with this payment number: ' + id + ', and we will confirm it.';
    const rzp = new window.Razorpay({
      key: order.key_id, order_id: order.order_id, amount: order.amount, currency: order.currency,
      name: order.name, description: order.description,
      prefill: { name: val('name'), email: val('email'), contact: indianMobile(val('phone')) },
      theme: { color: '#0B7564' },
      modal: { ondismiss: () => { track('payment_closed', { form: type }); say('The payment window was closed before paying. Your details are saved. Press the button to try again.'); } },
      handler: async r => {
        try {
          const v = await postForm(api, { action: 'verify_payment', razorpay_order_id: r.razorpay_order_id, razorpay_payment_id: r.razorpay_payment_id, razorpay_signature: r.razorpay_signature });
          if (!v.ok) throw new Error(v.error);
          track('payment_done', { form: type, value: order.amount / 100 });
          location.href = 'thank-you.html?type=' + type;
        } catch (e) {
          say('Your payment went through, but we could not confirm it on this page. ' + help(r.razorpay_payment_id));
        }
      }
    });
    rzp.on('payment.failed', r => { track('payment_failed', { form: type }); say((r.error && r.error.description ? r.error.description + ' ' : '') + 'The payment did not go through. You have not been charged, or any amount taken will be returned by your bank. Please try again.'); });
    track('payment_opened', { form: type });
    rzp.open();
  }

  function showDone(form, demo) {
    const done = document.getElementById(form.dataset.done);
    if (!done) return;
    if (demo && !$('.demo-note', done)) done.insertAdjacentHTML('beforeend', '<p class="demo-note"><span class="ph">Demo mode: nothing was sent. Add the endpoint in config.js.</span></p>');
    form.hidden = true; done.hidden = false; done.setAttribute('tabindex', '-1'); done.focus();
  }

  /* Where a visitor came from: utm_source, utm_medium and utm_campaign from the link they arrived on.
     Kept for this browser tab only (sessionStorage, no cookies), so it survives a click from Home to Classes.
     The first landing wins; empty values never overwrite saved ones. Sent only with the form post. */
  const UTM = ['utm_source', 'utm_medium', 'utm_campaign'];
  const utmClean = v => String(v || '').trim().toLowerCase().replace(/[^a-z0-9_.+-]/g, '').slice(0, 60);
  const utm = (() => {
    const q = new URLSearchParams(location.search), fromUrl = {};
    UTM.forEach(k => { const v = utmClean(q.get(k)); if (v) fromUrl[k] = v; });
    let saved = {};
    try { saved = JSON.parse(sessionStorage.getItem('rbs_utm') || '{}') || {}; } catch (e) {}
    try { if (Object.keys(fromUrl).length && !Object.keys(saved).length) sessionStorage.setItem('rbs_utm', JSON.stringify(fromUrl)); } catch (e) {}
    return Object.keys(fromUrl).length ? fromUrl : saved;
  })();

  $$('form[data-form]').forEach(form => {
    const type = form.dataset.form;
    const fields = $$('.field', form);
    const check = f => {
      const input = $('input, select, textarea', f); if (!input) return true;
      const ok = input.checkValidity(); f.classList.toggle('invalid', !ok);
      input.setAttribute('aria-invalid', String(!ok)); return ok;
    };
    fields.forEach(f => { const i = $('input, select, textarea', f); if (i) i.addEventListener('blur', () => { if (i.value) check(f); }); });

    // context the receiving sheet needs
    const hidden = (name, value) => {
      if (form.elements[name]) return;
      const i = document.createElement('input');      // built as an element, so a value can never become HTML
      i.type = 'hidden'; i.name = name; i.value = value;
      form.appendChild(i);
    };
    hidden('form_type', type);
    hidden('page', location.pathname);
    hidden('_subject', 'New ' + type + ' form, researchbysrivathsa.com');
    if (type === 'class' || type === 'support') UTM.forEach(k => {
      const v = utmClean(utm[k]);
      if (form.elements[k]) form.elements[k].value = v; else hidden(k, v);
    });
    form.addEventListener('focusin', () => track('form_start', { form: type }), { once: true });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const bad = fields.filter(f => !check(f));
      const checks = $$('input[type="checkbox"][required]', form).filter(c => !c.checked);
      if (bad.length || checks.length) {
        const first = bad.length ? $('input, select, textarea', bad[0]) : checks[0];
        first.focus();
        if (checks.length && !bad.length) checks[0].reportValidity();
        return;
      }
      // bots fill the honeypot or submit instantly: pretend it worked and send nothing
      const trap = form.elements._gotcha;
      if ((trap && trap.value) || Date.now() - loadedAt < 2500) { showDone(form, false); return; }

      const endpoint = cfg[ENDPOINT[type]] || cfg.FORMS_ENDPOINT || '';
      const next = cfg[NEXT_STEP[type]] || '';
      const btn = $('button[type="submit"]', form), label = btn ? btn.innerHTML : '';
      const err = $('.form-error', form);
      if (err && !err.dataset.orig) err.dataset.orig = err.textContent;
      const say = msg => { if (err) { err.textContent = msg; err.hidden = false; err.focus(); } };
      if (err) { err.textContent = err.dataset.orig; err.hidden = true; }
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      try {
        if (endpoint) {
          // URL-encoded keeps this a "simple" cross-site request that Apps Script, Formspree and Make all read
          const res = await fetch(endpoint, { method: 'POST', body: new URLSearchParams(new FormData(form)), headers: { Accept: 'application/json' } });
          if (!res.ok) throw new Error('HTTP ' + res.status);
        }
        track('form_sent', { form: type });
        if (next) { location.href = next; return; }   // on to a Razorpay Payment Page
        if (cfg.FORMS_ENDPOINT && PAYS[type]) { await checkout(form, type, say); return; }   // Razorpay Standard Checkout
        showDone(form, !endpoint);
      } catch (x) {
        track('form_error', { form: type, error: String(x && x.message || x).slice(0, 80) });
        if (x instanceof PayError) say(x.message);
        else if (err) { err.hidden = false; err.focus(); }
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = label; }
      }
    });
  });

  /* ---------- page social links: plain links in the HTML, upgraded to the animated icon pair ---------- */
  if (window.RBS_SOCIALS) $$('[data-socials]').forEach(n => { n.outerHTML = window.RBS_SOCIALS('page-soc', true); });

  /* ---------- contact page: "Ask for the next dates" links (classes.html) pass ?class=… ---------- */
  (() => {
    const wanted = new URLSearchParams(location.search).get('class');
    const form = $('form[data-form="contact"]');
    if (!wanted || !form) return;
    const topic = form.elements.topic, msg = form.elements.message;
    const opt = topic && [...topic.options].find(o => /in-depth class/i.test(o.text));
    if (opt) topic.value = opt.value;
    if (msg && !msg.value) msg.value = "I'd like a seat in the next “" + wanted.slice(0, 80) + "” class. Please email me the dates.";
  })();

  /* ---------- one-year support switch (config.js: SUPPORT_ENABLED) ----------
     The HTML ships in the current state (on); this hides or shows each part if the switch says otherwise. */
  const supportOn = cfg.SUPPORT_ENABLED === true;
  $$('[data-when-support]').forEach(n => { n.hidden = (n.getAttribute('data-when-support') === 'on') !== supportOn; });

  /* ---------- feedback cards (testimonials.json) ----------
     Only entries with consent and verified both true are shown, exactly as written. */
  const star = '<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.6 7.7l5.8-.8z" fill="currentColor"/></svg>';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  $$('[data-testimonials]').forEach(wrap => {
    const section = wrap.closest('section');
    fetch('testimonials.json').then(r => r.json()).then(list => {
      // "show": false keeps an entry on file without displaying it
      const shown = list.filter(t => t && t.consent === true && t.verified === true && t.show !== false && t.quote && t.name);
      if (!shown.length) { if (section) section.hidden = true; return; }
      shown.forEach(t => {
        const fig = el('figure', 'quote-card');
        const n = Math.max(0, Math.min(5, Math.round(Number(t.rating) || 0)));
        if (n) { const s = el('div', 'stars'); s.setAttribute('role', 'img'); s.setAttribute('aria-label', `Rated ${n} out of 5`); s.innerHTML = star.repeat(n); fig.appendChild(s); }
        const bq = el('blockquote'); bq.appendChild(el('p', null, t.quote)); fig.appendChild(bq);
        const cap = el('figcaption', null, t.name);
        if (/^\d{4}-\d{2}-\d{2}$/.test(t.date || '')) {
          cap.appendChild(document.createTextNode(' · '));
          const d = el('time', null, new Date(t.date + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }));
          d.dateTime = t.date; cap.appendChild(d);
        }
        fig.appendChild(cap);
        wrap.appendChild(fig);
      });
    }).catch(() => { if (section) section.hidden = true; });
  });

  /* ---------- team cards (team.json): verified people only ---------- */
  $$('[data-team]').forEach(wrap => {
    fetch('team.json').then(r => r.json()).then(list => {
      list.filter(p => p && p.verified === true).forEach(p => {
        const card = el('article', 'team-card');
        const photo = el('div', 'photo');
        if (p.photo) { const img = el('img'); img.src = p.photo; img.alt = p.photo_alt || ''; img.loading = 'lazy'; img.width = 400; img.height = 400; photo.appendChild(img); }
        else photo.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle cx="50" cy="38" r="20" fill="var(--accent)"/><path d="M14 96 a36 30 0 0 1 72 0z" fill="var(--accent)" opacity=".55"/><circle cx="80" cy="18" r="7" fill="var(--marigold)"/></svg>';
        const info = el('div', 'info');
        info.appendChild(el('h3', 'role', p.role || ''));
        if (p.name) info.appendChild(el('p', 'name', p.name));
        if (p.credential) info.appendChild(el('span', 'cred', p.credential));
        if (p.line) info.appendChild(el('p', 'line', p.line));
        card.append(photo, info);
        wrap.appendChild(card);
      });
    }).catch(() => {});
  });

  /* ---------- myth or fact flip cards ---------- */
  $$('[data-flip]').forEach(card => {
    const front = $('.front', card), back = $('.back', card), go = $('[data-flip-go]', card);
    back.inert = true;
    const flip = on => {
      card.classList.toggle('flipped', on);
      front.inert = on; back.inert = !on;
      (on ? back : go).focus({ preventScroll: true });
    };
    front.addEventListener('click', () => flip(true));
    $('[data-flip-back]', card).addEventListener('click', () => flip(false));
  });

  /* ---------- 60-second quiz ---------- */
  $$('[data-quiz]').forEach(quiz => {
    const qs = $$('.q', quiz), end = $('.quiz-end', quiz);
    let score = 0, answered = 0;
    qs.forEach(q => {
      q.addEventListener('change', e => {
        if (q.dataset.done) return;
        q.dataset.done = '1'; answered++;
        const right = e.target.value === q.dataset.answer;
        if (right) score++;
        $$('.opt', q).forEach(o => {
          const inp = $('input', o); inp.disabled = true;
          if (inp.value === q.dataset.answer) o.classList.add('right');
          else if (inp === e.target) o.classList.add('wrong');
        });
        const fb = $('.q-feedback', q);
        fb.textContent = (right ? 'Right. ' : 'Not quite. ') + q.dataset.explain;
        fb.classList.add(right ? 'ok' : 'no');
        if (answered === qs.length && end) { $('[data-score]', end).textContent = `You got ${score} of ${qs.length}.`; end.hidden = false; }
      });
    });
  });

  /* ---------- rule of 72 ---------- */
  $$('[data-r72]').forEach(form => {
    const input = $('input', form), out = $('output', form);
    const calc = () => {
      const r = parseFloat(String(input.value).replace(',', '.'));
      if (input.value === '' || isNaN(r)) { out.textContent = 'Type a yearly rate to see the result.'; return; }
      if (r <= 0) { out.textContent = 'At 0% or less, money does not double. It stays the same or shrinks.'; return; }
      const yrs = 72 / r;
      out.textContent = `At ${r}% a year, money would roughly double in about ${yrs < 10 ? yrs.toFixed(1) : Math.round(yrs)} years.` + (r > 20 ? ' The rule gets less accurate at very high rates.' : '');
    };
    input.addEventListener('input', calc);
    form.addEventListener('submit', e => { e.preventDefault(); calc(); });
    calc();
  });

  /* ---------- thank-you page: message by type ---------- */
  const ty = $('[data-thanks]');
  if (ty) {
    const kind = new URLSearchParams(location.search).get('type');
    const t = kind === 'support' && supportOn ? 'support' : kind === 'class' ? 'class' : 'default';
    $$('[data-ty]', ty).forEach(n => { n.hidden = n.dataset.ty !== t; });
  }

  /* ---------- analytics and pixel: off until IDs are set in config.js ----------
     Plausible is cookieless and loads straight away. GA4 and the Meta Pixel set cookies,
     so they wait for a yes on the cookie notice. */
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
  const addScript = (src, attrs = {}) => { const s = document.createElement('script'); s.src = src; s.async = true; Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v)); document.head.appendChild(s); };
  if (cfg.ANALYTICS_ID && cfg.ANALYTICS_PROVIDER === 'plausible') addScript('https://plausible.io/js/script.js', { 'data-domain': cfg.ANALYTICS_ID });
  // Cloudflare Web Analytics: free and cookieless, so it needs no cookie notice either
  if (cfg.ANALYTICS_ID && cfg.ANALYTICS_PROVIDER === 'cloudflare') addScript('https://static.cloudflareinsights.com/beacon.min.js', { defer: '', 'data-cf-beacon': JSON.stringify({ token: cfg.ANALYTICS_ID }) });
  const ga = !!cfg.ANALYTICS_ID && cfg.ANALYTICS_PROVIDER === 'ga4', px = !!cfg.META_PIXEL_ID;
  function loadTracking() {
    if (ga) {
      addScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(cfg.ANALYTICS_ID));
      window.dataLayer = window.dataLayer || []; window.gtag = function () { dataLayer.push(arguments); };
      gtag('js', new Date()); gtag('config', cfg.ANALYTICS_ID);
    }
    if (px) {
      const f = window.fbq = function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); };
      if (!window._fbq) window._fbq = f; f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
      addScript('https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', cfg.META_PIXEL_ID); fbq('track', 'PageView');
    }
  }
  if (ga || px) {
    const choice = store.get('rbs-consent');
    if (choice === 'yes') loadTracking();
    else if (choice !== 'no') {
      document.body.insertAdjacentHTML('beforeend', '<div class="cookie" role="region" aria-label="Cookie notice"><p>We\'d like to use cookies to count visits' + (px ? ' and see which ads work' : '') + '. Nothing loads unless you say yes. <a href="legal.html#cookies">Read more</a></p><div class="ctas"><button class="btn" type="button" data-consent="yes">Accept</button><button class="btn ghost" type="button" data-consent="no">Decline</button></div></div>');
      $$('[data-consent]').forEach(b => b.addEventListener('click', () => {
        store.set('rbs-consent', b.dataset.consent);
        if (b.dataset.consent === 'yes') loadTracking();
        $('.cookie').remove();
      }));
    }
  }

  /* ---------- copy email ---------- */
  $$('[data-copy]').forEach(btn => btn.addEventListener('click', () => {
    const text = btn.dataset.copy, label = btn.textContent;
    const ok = () => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = label; }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(ok).catch(() => selectText(btn.dataset.target));
    else selectText(btn.dataset.target);
  }));
  function selectText(id) { const el = document.getElementById(id); if (!el) return; const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }

  /* ---------- legal page: highlight current section ---------- */
  const toc = $('.toc');
  if (toc && 'IntersectionObserver' in window) {
    const links = $$('a[href^="#"]', toc);
    const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
    const tio = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { links.forEach(a => a.classList.remove('on')); const a = map.get(en.target.id); if (a) a.classList.add('on'); } });
    }, { rootMargin: '-20% 0px -70% 0px' });
    map.forEach((a, id) => { const t = document.getElementById(id); if (t) tio.observe(t); });
  }

  /* ---------- interactive illustrations (data-toy) ----------
     Made-up numbers for teaching. Parts only fade and move; the starting picture is in the HTML. */
  const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
  const HYPO = ' <span class="hypo">[hypothetical]</span>';
  const yrs = n => n + (n === 1 ? ' year' : ' years');
  const at = (el, x, y, extra) => { el.style.transform = 'translate(' + x + 'px,' + y + 'px)' + (extra || ''); };

  $$('[data-toy="basket"]').forEach(toy => {
    const years = $('input[type="range"]', toy), items = $$('.b-item', toy), out = $('[data-out="text"]', toy);
    const home = items.map(it => (it.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/) || [0, 0, 0]).slice(1).map(Number));
    function draw() {
      const y = +years.value, r = +($('input[name="tb-rate"]:checked', toy) || { value: 6 }).value / 100;
      const power = 1 / Math.pow(1 + r, y), have = power * items.length;
      items.forEach((it, i) => {
        const f = Math.max(0, Math.min(1, have - i));
        $('.b-full', it).style.opacity = f;
        at(it, home[i][0], home[i][1], ' scale(' + (0.8 + 0.2 * f) + ')');
      });
      $('[data-out="years"]', toy).textContent = y;
      const n = Math.floor(have + 1e-9);
      out.innerHTML = y === 0
        ? 'Today the basket costs ₹1,000' + HYPO + ', and your ₹1,000 buys all 10 things.'
        : 'In ' + yrs(y) + ' the same basket costs about ' + inr(1000 / power) + HYPO + '. Your ₹1,000 buys about ' + n + ' of the 10 things.';
    }
    years.addEventListener('input', draw);
    $$('input[name="tb-rate"]', toy).forEach(r => r.addEventListener('change', draw));
    draw();
  });

  $$('[data-toy="fees"]').forEach(toy => {
    const years = $('#tf-years', toy), fee = $('#tf-fee', toy), out = $('[data-out="text"]', toy);
    const coins = { a: $$('.f-coin.a', toy), b: $$('.f-coin.b', toy) };
    const fill = (list, v) => { const have = v / 100000 * list.length; list.forEach((c, i) => { c.style.opacity = Math.max(0, Math.min(1, have - i)); }); };
    const pct = n => (Math.round(n * 100) / 100) + '%';
    function draw() {
      const y = +years.value, fb = +fee.value;
      const a = 100000 * Math.pow(1 - 0.005, y), b = 100000 * Math.pow(1 - fb / 100, y);
      fill(coins.a, a); fill(coins.b, b);
      $('[data-out="years"]', toy).textContent = y;
      $('[data-out="fee"]', toy).textContent = pct(fb);
      out.innerHTML = y === 0
        ? 'Both piles start at ₹1,00,000' + HYPO + '. Move the years slider to watch them drift apart.'
        : 'After ' + yrs(y) + ': ' + inr(a) + ' at 0.5% a year, and ' + inr(b) + ' at ' + pct(fb) + ' a year' + HYPO + '. A gap of ' + inr(a - b) + ', from costs alone.';
    }
    years.addEventListener('input', draw); fee.addEventListener('input', draw);
    draw();
  });

  $$('[data-toy="eggs"]').forEach(toy => {
    const eggs = $$('.e-egg', toy), baskets = $$('.e-basket', toy), out = $('[data-out="text"]', toy);
    const btnOne = $('[data-act="one"]', toy), btnAll = $('[data-act="all"]', toy);
    let n = 1, layout, lost;
    // same layout rules as the starting picture in the HTML
    function place(count) {
      const W = 360 / count, per = [], pos = [];
      for (let b = 0; b < count; b++) per.push(Math.floor(eggs.length / count) + (b < eggs.length % count ? 1 : 0));
      per.forEach((c, b) => {
        const cx = W * (b + 0.5), row = c > 6 ? 4 : c > 2 ? 3 : c;
        for (let j = 0; j < c; j++) {
          const r = Math.floor(j / row), col = j % row, inRow = Math.min(row, c - r * row);
          pos.push({ x: cx + (col - (inRow - 1) / 2) * 17, y: 150 - r * 19, b, top: r });
        }
      });
      return { W, per, pos };
    }
    const held = i => layout.pos.map((p, k) => k).filter(k => layout.pos[k].b === i && !lost.has(k));
    const left = () => eggs.length - lost.size;
    const narrow = () => layout.W < 72 ? ' scaleX(' + ((layout.W - 10) / 60).toFixed(3) + ')' : ''; // keep a gap between baskets
    const done = () => { if (!left()) btnOne.disabled = btnAll.disabled = true; };
    function reset(count) {
      n = count; layout = place(n); lost = new Set();
      baskets.forEach((bk, i) => { bk.classList.toggle('on', i < n); bk.classList.remove('dropped'); at(bk, i < n ? layout.W * (i + 0.5) : 180, 0, narrow()); });
      eggs.forEach((e, i) => { e.classList.remove('lost'); at(e, layout.pos[i].x, layout.pos[i].y); });
      btnOne.disabled = btnAll.disabled = false;
      const lo = layout.per[n - 1], hi = layout.per[0];
      out.textContent = n === 1 ? 'All 12 eggs are in one basket.' : 'Your 12 eggs are spread across ' + n + ' baskets, ' + (lo === hi ? hi : lo + ' or ' + hi) + ' in each.';
    }
    // the given eggs of basket i fall to the ground; the basket tips over once it is empty
    function drop(i, ks) {
      ks.forEach((k, m) => { lost.add(k); eggs[k].classList.add('lost'); const s = m % 2 ? 1 : -1; at(eggs[k], layout.pos[k].x + s * (6 + m * 3), 212, ' rotate(' + s * 70 + 'deg)'); });
      if (!held(i).length) { baskets[i].classList.add('dropped'); at(baskets[i], layout.W * (i + 0.5), 24, ' rotate(' + (i % 2 ? 12 : -12) + 'deg)' + narrow()); }
    }
    btnOne.addEventListener('click', () => {
      const alive = [...Array(n).keys()].filter(i => held(i).length);
      if (!alive.length) return;
      const i = alive[Math.floor(Math.random() * alive.length)], ks = held(i);
      drop(i, ks);
      out.textContent = (n === 1 ? 'Your only basket dropped. ' : 'One basket dropped. ') + (left() ? 'You lost ' + ks.length + (ks.length === 1 ? ' egg' : ' eggs') + ' and still have ' + left() + ' of 12.' : 'You lost all ' + ks.length + ' eggs that were left.');
      done();
    });
    btnAll.addEventListener('click', () => {
      // half of the remaining eggs fall, shared round the baskets (top ones first), however many baskets there are
      const piles = [...Array(n).keys()].map(i => held(i).sort((p, q) => layout.pos[q].top - layout.pos[p].top));
      const target = Math.floor(left() / 2), take = piles.map(() => []);
      for (let got = 0, i = 0; got < target; i = (i + 1) % n) if (piles[i].length) { take[i].push(piles[i].shift()); got++; }
      take.forEach((ks, i) => { if (ks.length) drop(i, ks); });
      out.textContent = 'A bad day for everything: every basket lost some eggs. You lost ' + target + ' and still have ' + left() + ' of 12. Spreading out softens a fall like this; it doesn’t stop it.';
      done();
    });
    $('[data-act="reset"]', toy).addEventListener('click', () => reset(n));
    $$('input[name="te-n"]', toy).forEach(r => r.addEventListener('change', () => reset(+r.value)));
    reset(1);
  });

  /* ---------- footer year ---------- */
  $$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
})();
