const T = require("../src/tech.js");
const cat = require("../src/catalogue.js");

let checks = 0; const failures = [];
const check = (label, got, want) => {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const names = (list) => list.map((t) => t.name);
const byKey = (list, k) => list.find((t) => t.key === k);

// ---- the catalogue arrived intact ----
check("catalogue has the full signature set", cat.trackers.length, 80);
check("every signature has a category", cat.trackers.every((t) => t.category && cat.categories[t.category]), true);
check("every pattern compiles in this engine", cat.trackers.every((t) => t.patterns.every((p) => { try { new RegExp(p, "i"); return true; } catch { return false; } })), true);

// ---- tracker detection ----
const page = `<script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234"></script>
<script>gtag('config','G-AB12CD34EF');</script>
<script>!function(f,b,e){}(window,document);fbq('init','123456789012345');</script>
<script src="https://www.clarity.ms/tag/abcd1234"></script>`;
let found = T.detectTrackers(cat, { "rendered page": page });
check("GTM found", !!byKey(found, "gtm"), true);
check("GTM container id extracted", byKey(found, "gtm").ids, ["GTM-ABC1234"]);
check("GA4 measurement id extracted", byKey(found, "ga4").ids, ["G-AB12CD34EF"]);
check("Meta pixel found", names(found).some((n) => /Meta|Facebook/i.test(n)), true);
check("Clarity id extracted", byKey(found, "clarity").ids, ["abcd1234"]);
check("tag managers sort before analytics", found[0].category, "tag_manager");

// Regression: a lowercase string must not become a container id.
found = T.detectTrackers(cat, { html: '<script src="/js/gtm-loader.js"></script>' });
check("gtm-loader does not invent a container id", byKey(found, "gtm") ? byKey(found, "gtm").ids : [], []);

// Dead tags are carried through, not silently dropped.
found = T.detectTrackers(cat, { html: "<script>ga('create','UA-12345-1');</script>" });
check("Universal Analytics still detected", !!byKey(found, "ua"), true);
check("and flagged as dead", byKey(found, "ua").dead.includes("1 Jul 2023"), true);

// Where a signature was seen matters: the HTML or the requests the page made.
found = T.detectTrackers(cat, {
  "rendered page": "<html><body>nothing here</body></html>",
  requests: "https://www.google-analytics.com/g/collect?v=2&tid=G-XYZ12345",
});
check("a tag fired at runtime is still caught", !!byKey(found, "ga4"), true);
check("and its source is named", byKey(found, "ga4").sources, ["requests"]);
check("nothing is reported when nothing matches", T.detectTrackers(cat, { html: "<p>plain page</p>" }), []);

// ---- platform ----
let plat = T.detectPlatform(cat, '<link href="/wp-content/themes/astra/style.css"><div class="elementor-section">',
                            { server: "nginx" }, { page: { generator: "WordPress 6.5" } });
check("WordPress detected", plat.cms, "WordPress");
check("theme read from the path", plat.detail.includes("Theme: astra"), true);
check("builder detected", plat.detail.includes("Builder: Elementor"), true);
check("server header carried", plat.server, "nginx");

// Regression: a bare word must not name a builder.
plat = T.detectPlatform(cat, '<p>Every individual divider is included.</p><link href="/wp-content/x.css">', {}, {});
check("'individual' does not become Divi", plat.detail.some((d) => /Divi/.test(d)), false);
plat = T.detectPlatform(cat, '<div class="et_pb_row"><link href="/wp-content/x.css">', {}, {});
check("a real Divi marker does", plat.detail.includes("Builder: Divi"), true);

plat = T.detectPlatform(cat, '<script src="https://cdn.shopify.com/s/files/x.js">"name":"Dawn","theme_store_id"', {}, {});
check("Shopify detected", plat.cms, "Shopify");
check("Shopify theme named", plat.detail.includes("Theme: Dawn"), true);

plat = T.detectPlatform(cat, '<div data-wf-site="abc"></div>', {}, {});
check("Webflow detected", plat.cms, "Webflow");
plat = T.detectPlatform(cat, '<script id="__NEXT_DATA__">{}</script>', {}, {});
check("framework detected without a CMS", plat.detail.includes("Framework: Next.js"), true);
check("and cms stays empty", plat.cms, "");

// ---- verifications, socials, security ----
check("verification meta read", T.verifications(cat, { otherMeta: { "google-site-verification": "abc123" } }),
      [{ platform: "Google Search Console", meta: "google-site-verification", value: "abc123" }]);

const snap = {
  links: [
    { href: "https://www.facebook.com/widgetco" },
    { href: "https://www.facebook.com/sharer/sharer.php?u=x" },
    { href: "https://www.instagram.com/widgetco" },
    { href: "https://example.com/about" },
  ],
  structuredData: { jsonLd: [{ ok: true, data: { sameAs: ["https://www.linkedin.com/company/widgetco"] } }] },
};
const soc = T.socials(cat, snap);
check("socials found across links and schema", soc.map((s) => s.platform).sort(), ["Facebook", "Instagram", "LinkedIn"]);
check("share links are not treated as profiles", soc.find((s) => s.platform === "Facebook").url, "https://www.facebook.com/widgetco");

check("no headers, no grade", T.securityGrade(cat, {}, true), null);
check("bare https scores F", T.securityGrade(cat, { server: "nginx" }, true).grade, "F");
const strong = T.securityGrade(cat, {
  "strict-transport-security": "max-age=31536000", "content-security-policy": "default-src 'self'",
  "x-content-type-options": "nosniff", "x-frame-options": "DENY",
  "referrer-policy": "no-referrer", "permissions-policy": "geolocation=()",
}, true);
check("all six headers over https is A+", strong.grade, "A+");
check("missing list is empty then", strong.missing, []);

// ---- containers ----
check("container urls built from ids", T.containerUrls([{ key: "gtm", ids: ["GTM-ABC1234"] }, { key: "ga4", ids: ["G-AB12CD34EF"] }]),
  ["https://www.googletagmanager.com/gtm.js?id=GTM-ABC1234", "https://www.googletagmanager.com/gtag/js?id=G-AB12CD34EF"]);
check("nothing to fetch without ids", T.containerUrls([{ key: "hotjar", ids: ["123"] }]), []);

// ---- summary and findings ----
const many = Array.from({ length: 13 }, (_, i) => ({ category: i < 4 ? "advertising" : "analytics", ids: [], dead: "", name: "T" + i, sources: ["rendered page"] }));
const sum = T.summarise(many, [{ thirdParty: true }, { thirdParty: true }, { thirdParty: false }]);
check("verdict reads in plain words", sum.line, "Heavily instrumented: 13 tools, 4 ad pixels, data to 2 third parties.");
check("an empty page says so", T.summarise([], []).level, "No tracking found");
check("the detail does not repeat the verdict", sum.detail, "13 tools, 4 ad pixels, data to 2 third parties.");

const f = T.findings({
  trackers: [
    { key: "ua", name: "Universal Analytics", category: "analytics", ids: ["UA-1-1"], dead: "Stopped collecting data 1 Jul 2023", sources: ["rendered page"] },
    { key: "ga4", name: "Google Analytics 4", category: "analytics", ids: ["G-AAA111", "G-BBB222"], dead: "", sources: ["rendered page"] },
    { key: "meta", name: "Meta Pixel", category: "advertising", ids: [], dead: "", sources: ["requests"] },
  ],
  security: { grade: "F", missing: ["HSTS", "CSP"] },
});
check("dead tag warns", f.find((x) => x.id === "tech.dead.ua").severity, "warn");
check("two GA4 ids warns", f.find((x) => x.id === "tech.dupe.ga4").title, "Google Analytics 4 has 2 IDs on one page");
check("runtime-only tags noted", f.find((x) => x.id === "tech.runtime-only").severity, "note");
check("weak security warns", f.find((x) => x.id === "tech.security").severity, "warn");
check("no analytics note not raised when analytics exists", f.some((x) => x.id === "tech.no-analytics"), false);
check("no em dashes in any finding", f.every((x) => !/[—–]/.test(x.title + x.detail + (x.fix || ""))), true);

console.log(`${checks - failures.length}/${checks} checks passed`);
failures.forEach((x) => console.log("  FAIL " + x));
process.exit(failures.length ? 1 : 0);
