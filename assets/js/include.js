/* Shared header, mobile menu and footer (with the disclaimer), defined once here.
   Each page calls RBS.header() just after <body> and RBS.footer() just before </body>.
   Both run while the page is parsing, so there is no flash or layout shift.
   Each page also carries a <noscript> fallback with plain links and the disclaimer. */
(function () {
  document.documentElement.classList.add('js');
  const cfg = window.RBS_CONFIG || {};
  const IG = cfg.INSTAGRAM_URL || 'https://www.instagram.com/srivathsa_research/';
  const LI = cfg.LINKEDIN_URL || 'https://in.linkedin.com/in/srivathsa-research-9663b9444';

  const NAV = [
    ['home', 'index.html', 'Home'],
    ['classes', 'classes.html', 'Classes'],
    ['one-to-one', 'one-to-one.html', '1-1'],
    ['learn', 'learn.html', 'Learn'],
    ['about', 'about.html', 'About'],
    ['faq', 'faq.html', 'FAQ'],
    ['contact', 'contact.html', 'Contact']
  ];

  const brand = '<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true" focusable="false"><rect width="34" height="34" rx="10" fill="var(--accent)"/><path d="M9 24 V14 a5 5 0 0 1 10 0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="24" cy="22" r="3.2" fill="var(--marigold)"/></svg><span class="brand-word">Research<small> by Srivathsa</small></span>';

  const icon = {
    instagram: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2"/><circle class="ig-dot" cx="17.3" cy="6.7" r="1.3" fill="currentColor"/></svg>',
    linkedin: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><rect x="7" y="10.5" width="2.4" height="6.5" rx="1" fill="currentColor"/><circle cx="8.2" cy="7.6" r="1.4" fill="currentColor"/><path d="M12 17v-6.5h2.3v1c.5-.8 1.4-1.2 2.4-1.2 1.7 0 2.6 1.1 2.6 3V17h-2.4v-3.4c0-.9-.4-1.4-1.1-1.4-.8 0-1.4.6-1.4 1.6V17z" fill="currentColor"/></svg>'
  };

  // aria-label names the network; the visible text (when shown) says the same
  function socials(cls, withText) {
    const a = (url, name, ic) => '<a class="soc" href="' + url + '" target="_blank" rel="noopener noreferrer" aria-label="' + name + '">' + ic + (withText ? '<span aria-hidden="true">' + name + '</span>' : '') + '</a>';
    return '<div class="' + cls + '">' + a(IG, 'Instagram', icon.instagram) + a(LI, 'LinkedIn', icon.linkedin) + '</div>';
  }
  window.RBS_ICONS = icon;
  window.RBS_SOCIALS = socials;

  function header() {
    const page = document.body.dataset.page || '';
    const link = ([key, href, label]) => '<a href="' + href + '"' + (key === page ? ' aria-current="page"' : '') + '>' + label + '</a>';
    const html =
      '<header class="nav"><div class="wrap">' +
        '<a class="brand" href="index.html">' + brand + '</a>' +
        '<nav class="links" aria-label="Main">' + NAV.map(link).join('') + '</nav>' +
        socials('nav-soc', false) +
        '<a class="btn" href="classes.html#join">Join the class</a>' +
        '<button class="menu-btn" type="button" id="menuOpen" aria-expanded="false" aria-controls="sheet" aria-label="Open menu"><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3 6h14M3 14h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
      '</div></header>' +
      '<div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-label="Menu">' +
        '<div class="sheet-top"><a class="brand" href="index.html">' + brand + '</a>' +
        '<button class="menu-btn" type="button" id="menuClose" aria-label="Close menu"><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>' +
        '<nav aria-label="Mobile">' + NAV.map(link).join('') + '<a href="legal.html"' + (page === 'legal' ? ' aria-current="page"' : '') + '>Legal</a></nav>' +
        socials('sheet-soc', true) +
        '<a class="btn lg block" href="classes.html#join">Join the class · ₹' + (cfg.CLASS_PRICE_INR || 199) + '</a>' +
        '<p class="disc">Educational content only. Not investment advice.</p>' +
      '</div>';
    document.currentScript.insertAdjacentHTML('beforebegin', html);
  }

  function footer() {
    const html =
      '<footer class="site-foot"><div class="wrap">' +
        '<div class="f-top"><div>' +
          '<a class="brand" href="index.html">' + brand + '</a>' +
          '<p class="f-tag">Investing basics for India, explained plainly by a research-led team.</p>' +
          socials('foot-soc', true) +
        '</div><div class="f-cols">' +
          '<div><h2>Learn</h2><ul><li><a href="classes.html">Classes</a></li><li><a href="one-to-one.html">1-1 sessions</a></li><li><a href="learn.html">Explainers</a></li><li><a href="faq.html">FAQ</a></li></ul></div>' +
          '<div><h2>About</h2><ul><li><a href="about.html">Our story</a></li><li><a href="about.html#team">Our team</a></li><li><a href="contact.html">Contact</a></li></ul></div>' +
          '<div><h2>Legal</h2><ul><li><a href="legal.html#disclaimer">Disclaimer</a></li><li><a href="legal.html#privacy">Privacy</a></li><li><a href="legal.html#terms">Terms</a></li><li><a href="legal.html#refunds">Refunds</a></li></ul></div>' +
        '</div></div>' +
        '<div class="disclaimer">' +
          '<p><strong>Educational content only. Not investment advice.</strong> Investments carry risk, including loss of capital. <span class="tbc">[Final wording to be confirmed against SEBI rules.]</span></p>' +
          '<p>© <span data-year>2026</span> Research by Srivathsa · researchbysrivathsa.com</p>' +
        '</div>' +
      '</div></footer>';
    document.currentScript.insertAdjacentHTML('beforebegin', html);
  }

  window.RBS = { header, footer };
})();
