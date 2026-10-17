/* Research by Srivathsa: site settings.
   Edit the values here; every page reads them. No secrets belong in this file:
   it is public. Form endpoints, payment links and analytics IDs are public by design. */
window.RBS_CONFIG = {
  SITE_URL: "https://researchbysrivathsa.com",
  CONTACT_EMAIL: "hello@researchbysrivathsa.com",   // placeholder until Email Routing is set up

  /* ---- social ---- */
  INSTAGRAM_URL: "https://www.instagram.com/srivathsa_research/",
  LINKEDIN_URL: "https://in.linkedin.com/in/srivathsa-research-9663b9444",

  /* ---- weekly class (times are IST, Asia/Kolkata) ---- */
  CLASS_DAY: "Saturday",
  CLASS_START: "15:00",
  CLASS_DURATION_MINUTES: 60,
  CLASS_PRICE_INR: 199,

  /* ---- one-year support (education only: email questions + a monthly members' Q&A call) ---- */
  SUPPORT_PRICE_INR: 3000,
  SUPPORT_ENABLED: true,         // false = "register interest" only; true = sign-up form, then the ₹3,000 payment window

  /* ---- placeholders: paste real values when each tool is set up (see backend-notes.md) ---- */
  FORMS_ENDPOINT: "https://script.google.com/macros/s/AKfycbxLrTomvLGe7mcbiO3Ags6XhdIoXk1z8Y3qjeczoCYihSFpJq8oMC59b0iReaj7MP3ijA/exec",  // Google Apps Script web app (the Google Sheet back office);
                                    // every form posts here unless it has its own endpoint below. See _backend/SETUP.md
  CLASS_FORM_ENDPOINT: "",          // optional override, e.g. https://formspree.io/f/xxxxxxx
  CLASS_PAYMENT_LINK: "",           // leave empty to use Razorpay Checkout on the site (needs FORMS_ENDPOINT). Or a Razorpay Payment Page link for ₹199
  SUPPORT_FORM_ENDPOINT: "",        // optional override (also receives "register interest")
  SUPPORT_PAYMENT_LINK: "",         // leave empty to use Razorpay Checkout. Or a Razorpay Payment Page link for ₹3,000 (redirect to /thank-you.html?type=support)
  NEWSLETTER_ENDPOINT: "",
  CONTACT_ENDPOINT: "",

  /* ---- tracking: off until an ID is added ---- */
  ANALYTICS_PROVIDER: "plausible",  // "plausible" (cookieless) or "ga4"
  ANALYTICS_ID: "",                 // Plausible: your domain, e.g. researchbysrivathsa.com. GA4: G-XXXXXXX
  META_PIXEL_ID: ""
};
