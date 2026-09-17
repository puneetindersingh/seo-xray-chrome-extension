const C = require("../src/checks.js");

let checks = 0; const failures = [];
const check = (label, got, want) => {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const sev = (l, id) => (l.find((f) => f.id === id) || {}).severity;
const has = (l, id) => l.some((f) => f.id === id);

function snap(o = {}) {
  const s = {
    url: "https://e.com/page", host: "e.com", protocol: "https:",
    title: { text: "A perfectly reasonable page title here", count: 1, all: [] },
    description: { content: "A description that runs to about the right sort of length for a search result listing.", count: 1 },
    robotsMeta: { content: null, count: 0 }, googlebotMeta: { content: null, count: 0 },
    canonical: { href: "https://e.com/page", raw: "https://e.com/page", count: 1, all: ["https://e.com/page"] },
    metaRefresh: null, lang: "en-AU", charset: "UTF-8", metaCharset: "utf-8", viewport: "width=device-width",
    og: { "og:title": "t", "og:description": "d", "og:image": "i" },
    headings: [{ level: 1, text: "The page heading", empty: false, hidden: false }],
    links: [{ kind: "link", internal: true, text: "Services", rel: null, href: "https://e.com/s", hasImage: false, ariaLabel: null }],
    specialLinks: { mailto: 0, tel: 0, javascript: 0, fragment: 0 },
    images: [], hreflang: [],
    structuredData: { jsonLd: [{ ok: true, data: { "@type": "WebPage", "@id": "#p", name: "x" } }] },
    content: { mainWords: 800, bodyWords: 900, hasMain: true },
  };
  return Object.assign(s, o);
}

// ---- indexability ----
check("noindex fails", sev(C.indexability(snap({ robotsMeta: { content: "noindex, follow", count: 1 } })), "index.noindex"), "fail");
check("noindex in the header fails too", sev(C.indexability(snap(), { xRobotsTag: "noindex" }), "index.noindex"), "fail");
check("and the header is named", C.indexability(snap(), { xRobotsTag: "noindex" })[0].detail.includes("X-Robots-Tag"), true);
check("page nofollow warns", sev(C.indexability(snap({ robotsMeta: { content: "index, nofollow", count: 1 } })), "index.nofollow"), "warn");
check("nosnippet noted", sev(C.indexability(snap({ robotsMeta: { content: "nosnippet", count: 1 } })), "index.nosnippet"), "note");
check("max-snippet:0 warns", sev(C.indexability(snap({ robotsMeta: { content: "max-snippet:0", count: 1 } })), "index.max-snippet-zero"), "warn");
check("self canonical passes", sev(C.indexability(snap()), "canon.self"), "pass");
check("missing canonical warns", sev(C.indexability(snap({ canonical: { count: 0, href: null, raw: null, all: [] } })), "canon.missing"), "warn");
check("two canonicals fail", sev(C.indexability(snap({ canonical: { count: 2, href: "https://e.com/a", raw: "/a", all: ["https://e.com/a", "https://e.com/b"] } })), "canon.multiple"), "fail");
check("cross domain canonical warns", sev(C.indexability(snap({ canonical: { count: 1, href: "https://other.com/x", raw: "https://other.com/x", all: [] } })), "canon.cross-domain"), "warn");
check("canonical elsewhere on site warns", sev(C.indexability(snap({ canonical: { count: 1, href: "https://e.com/other", raw: "https://e.com/other", all: [] } })), "canon.other"), "warn");
check("relative canonical noted", sev(C.indexability(snap({ canonical: { count: 1, href: "https://e.com/page", raw: "/page", all: [] } })), "canon.relative"), "note");
check("meta refresh warns", sev(C.indexability(snap({ metaRefresh: "0;url=/x" })), "index.meta-refresh"), "warn");
check("http fails", sev(C.indexability(snap({ protocol: "http:" })), "index.http"), "fail");

// ---- meta ----
check("missing title fails", sev(C.meta(snap({ title: { text: null, count: 0, all: [] } })), "title.missing"), "fail");
check("good title passes", sev(C.meta(snap()), "title.ok"), "pass");
check("long title warns", sev(C.meta(snap({ title: { text: "x".repeat(90), count: 1, all: [] } })), "title.long"), "warn");
check("measured pixels beat the estimate", sev(C.meta(snap({ title: { text: "iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii", count: 1, all: [] } }), { titlePx: 300 }), "title.long"), undefined);
check("short title warns", sev(C.meta(snap({ title: { text: "Widgets", count: 1, all: [] } })), "title.short"), "warn");
check("short description warns", sev(C.meta(snap({ description: { content: "Widgets for sale.", count: 1 } })), "desc.short"), "warn");
check("two titles warn", sev(C.meta(snap({ title: { text: "A perfectly reasonable page title here", count: 2, all: ["a", "b"] } })), "title.multiple"), "warn");
check("title identical to h1 noted", sev(C.meta(snap({ headings: [{ level: 1, text: "A perfectly reasonable page title here", empty: false, hidden: false }] })), "title.same-as-h1"), "note");
check("missing description warns", sev(C.meta(snap({ description: { content: null, count: 0 } })), "desc.missing"), "warn");
check("long description warns", sev(C.meta(snap({ description: { content: "x".repeat(300), count: 1 } })), "desc.long"), "warn");
check("no viewport fails", sev(C.meta(snap({ viewport: null })), "meta.viewport"), "fail");
check("no lang warns", sev(C.meta(snap({ lang: null })), "meta.lang"), "warn");
check("no open graph at all warns", sev(C.meta(snap({ og: {} })), "og.missing"), "warn");
check("open graph without an image warns", sev(C.meta(snap({ og: { "og:title": "t" } })), "og.partial"), "warn");
check("open graph with an image but no description is a note", sev(C.meta(snap({ og: { "og:title": "t", "og:image": "i" } })), "og.partial"), "note");
check("og:url mismatch warns", sev(C.meta(snap({ og: { "og:title": "t", "og:description": "d", "og:image": "i", "og:url": "https://e.com/different" } })), "og.url-mismatch"), "warn");

// ---- content ----
check("no h1 fails", sev(C.content(snap({ headings: [] })), "h1.missing"), "fail");
check("two h1s warn", sev(C.content(snap({ headings: [{ level: 1, text: "A", empty: false, hidden: false }, { level: 1, text: "B", empty: false, hidden: false }] })), "h1.multiple"), "warn");
check("empty h1 fails", sev(C.content(snap({ headings: [{ level: 1, text: "", empty: true, hidden: false }] })), "h1.empty"), "fail");
check("skipped level noted", sev(C.content(snap({ headings: [
  { level: 1, text: "A", empty: false, hidden: false }, { level: 3, text: "B", empty: false, hidden: false }] })), "head.skipped"), "note");
check("hidden headings do not trigger the skip rule", has(C.content(snap({ headings: [
  { level: 1, text: "A", empty: false, hidden: false }, { level: 4, text: "hidden", empty: false, hidden: true },
  { level: 2, text: "B", empty: false, hidden: false }] })), "head.skipped"), false);
check("thin content warns", sev(C.content(snap({ content: { mainWords: 80, bodyWords: 90, hasMain: true } })), "content.thin"), "warn");
check("short content noted", sev(C.content(snap({ content: { mainWords: 220, bodyWords: 250, hasMain: true } })), "content.short"), "note");
check("no main element noted", sev(C.content(snap({ content: { mainWords: 800, bodyWords: 900, hasMain: false } })), "content.no-main"), "note");

// ---- links ----
const link = (o) => Object.assign({ kind: "link", internal: true, text: "Text", rel: null, href: "https://e.com/a", hasImage: false, ariaLabel: null }, o);
check("empty anchor text warns", sev(C.links(snap({ links: [link({ text: "" })] })), "link.no-text"), "warn");
check("an icon link with aria-label is fine", has(C.links(snap({ links: [link({ text: "", ariaLabel: "Search" })] })), "link.no-text"), false);
check("an image link is fine", has(C.links(snap({ links: [link({ text: "", hasImage: true })] })), "link.no-text"), false);
check("generic anchors noted past two", sev(C.links(snap({ links: [link({ text: "read more" }), link({ text: "click here" }), link({ text: "Learn More" })] })), "link.generic"), "note");
check("two generic anchors are left alone", has(C.links(snap({ links: [link({ text: "read more" }), link({ text: "here" })] })), "link.generic"), false);
check("internal nofollow warns", sev(C.links(snap({ links: [link({ rel: "nofollow" })] })), "link.internal-nofollow"), "warn");
check("external nofollow is fine", has(C.links(snap({ links: [link({ rel: "nofollow", internal: false })] })), "link.internal-nofollow"), false);
check("javascript hrefs warn", sev(C.links(snap({ specialLinks: { mailto: 0, tel: 0, javascript: 3, fragment: 0 } })), "link.javascript"), "warn");
check("no internal links warns", sev(C.links(snap({ links: [link({ internal: false })] })), "link.no-internal"), "warn");

// ---- images ----
const img = (o) => Object.assign({ hasAlt: true, alt: "x", src: "https://e.com/a.webp", ext: "webp", hidden: false,
  widthAttr: "800", heightAttr: "600", naturalWidth: 800, displayWidth: 800, loading: null, inViewport: false }, o);
check("no images, no findings", C.images(snap({ images: [] })), []);
check("all alts present passes", sev(C.images(snap({ images: [img()] })), "img.alt-ok"), "pass");
check("missing alt warns", sev(C.images(snap({ images: [img({ hasAlt: false })] })), "img.no-alt"), "warn");
check("hidden images are not counted", has(C.images(snap({ images: [img({ hasAlt: false, hidden: true })] })), "img.no-alt"), false);
check("oversized image warns", sev(C.images(snap({ images: [img({ naturalWidth: 3000, displayWidth: 400 })] })), "img.oversized"), "warn");
check("and names the worst one", C.images(snap({ images: [img({ naturalWidth: 3000, displayWidth: 400 })] })).find((f) => f.id === "img.oversized").detail.includes("3000px"), true);
check("missing dimensions warn", sev(C.images(snap({ images: [img({ widthAttr: null })] })), "img.no-dims"), "warn");
check("lazy hero warns", sev(C.images(snap({ images: [img({ loading: "lazy", inViewport: true })] })), "img.lazy-lcp"), "warn");
check("lazy below the fold is fine", has(C.images(snap({ images: [img({ loading: "lazy", inViewport: false })] })), "img.lazy-lcp"), false);
check("old formats noted past three", sev(C.images(snap({ images: [img({ ext: "jpg" }), img({ ext: "jpg" }), img({ ext: "png" }), img({ ext: "jpeg" })] })), "img.format"), "note");

// ---- schema ----
check("broken json-ld fails", sev(C.schema(snap({ structuredData: { jsonLd: [{ ok: false, error: "Unexpected token" }] } })), "schema.parse"), "fail");
check("no schema warns", sev(C.schema(snap({ structuredData: { jsonLd: [] } })), "schema.none"), "warn");
check("schema present passes", sev(C.schema(snap()), "schema.present"), "pass");
check("missing required properties warn", sev(C.schema(snap({ structuredData: { jsonLd: [{ ok: true, data: { "@type": "Article", "@id": "#a", headline: "H" } }] } })), "schema.required.Article"), "warn");
check("and names what is missing", C.schema(snap({ structuredData: { jsonLd: [{ ok: true, data: { "@type": "Article", "@id": "#a", headline: "H" } }] } })).find((f) => f.id === "schema.required.Article").title, "Article schema is missing image, datePublished, author");
check("a complete Article is left alone", has(C.schema(snap({ structuredData: { jsonLd: [{ ok: true, data: { "@type": "Article", "@id": "#a", headline: "H", image: "i", datePublished: "2026-01-01", author: { name: "A" } } }] } })), "schema.required.Article"), false);
check("Product with no offer suggests Service", sev(C.schema(snap({ structuredData: { jsonLd: [{ ok: true, data: { "@type": "Product", "@id": "#p", name: "Widget install", image: "i", offers: null } }] } })), "schema.product-no-offer"), "note");
check("no @id anywhere noted", sev(C.schema(snap({ structuredData: { jsonLd: [{ ok: true, data: { "@type": "WebPage", name: "x" } }] } })), "schema.no-id"), "note");
check("@graph is read", sev(C.schema(snap({ structuredData: { jsonLd: [{ ok: true, data: { "@graph": [{ "@type": "Organization", "@id": "#o", name: "N", url: "u" }] } }] } })), "schema.present"), "pass");

// ---- international ----
check("no hreflang, no findings", C.international(snap()), []);
check("invalid code warns", sev(C.international(snap({ hreflang: [{ hreflang: "en_AU", href: "https://e.com/page" }] })), "hreflang.invalid"), "warn");
check("valid codes accepted", has(C.international(snap({ hreflang: [{ hreflang: "en-AU", href: "https://e.com/page" }, { hreflang: "zh-Hant-HK", href: "https://e.com/hk" }, { hreflang: "x-default", href: "https://e.com/page" }] })), "hreflang.invalid"), false);
check("missing self reference warns", sev(C.international(snap({ hreflang: [{ hreflang: "en-NZ", href: "https://e.com/nz" }] })), "hreflang.no-self"), "warn");
check("missing x-default noted", sev(C.international(snap({ hreflang: [{ hreflang: "en-AU", href: "https://e.com/page" }, { hreflang: "en-NZ", href: "https://e.com/nz" }] })), "hreflang.no-xdefault"), "note");

// ---- per-row marks: the same tests as the findings, one row at a time ----
const H = (level, text, o = {}) => Object.assign({ level, text, empty: !text, hidden: false, region: "main" }, o);
const labels = (row) => row.marks.map((m) => m.label);
const hm = C.markHeadings(snap({ headings: [H(2, "Intro"), H(1, "Main"), H(3, "Skipped"), H(1, "Again"), H(2, ""), H(4, "Hid", { hidden: true }), H(2, "Foot", { region: "footer" })] }));
check("first H1 carries no mark", labels(hm[1]), []);
check("second H1 marked extra", labels(hm[3]), ["extra H1"]);
check("skip marked on the row that skips", labels(hm[2]), ["skips from H1"]);
check("empty heading marked", hm[4].marks[0].id, "head.empty");
check("hidden heading marked and not accused of skipping", labels(hm[5]), ["hidden"]);
check("region shown as context, not a fault", hm[6].marks.map((m) => [m.label, m.severity]), [["footer", null]]);
check("sole empty H1 fails on the row", C.markHeadings(snap({ headings: [H(1, "")] }))[0].marks[0].severity, "fail");
check("row skips agree with the finding", C.content(snap({ headings: [H(1, "A"), H(3, "B"), H(5, "C")] }))
  .find((f) => f.id === "head.skipped").title, "The heading order skips a level (H1 to H3, H3 to H5)");

const lm = C.markLinks(snap({ links: [link({ text: "" }), link({ rel: "nofollow" }), link({ rel: "nofollow sponsored", internal: false }),
  { kind: "no-href", text: "x", rel: null, internal: null }, link({ text: "read more" })] }));
check("empty anchor marked warn", lm[0].marks.map((m) => [m.label, m.severity]), [["no anchor text", "warn"]]);
check("internal nofollow marked warn", lm[1].marks.map((m) => m.severity), ["warn"]);
check("external nofollow is context only", lm[2].marks.map((m) => [m.label, m.severity]), [["nofollow", null], ["sponsored", null]]);
check("no href marked", lm[3].marks[0].id, "link.no-href");
check("generic anchor marked", lm[4].marks[0].label, "generic anchor");

const im = C.markImages(snap({ images: [img({ hasAlt: false }), img({ alt: "" }), img({ broken: true }), img({ broken: true, ext: "svg" }),
  img({ naturalWidth: 2000, displayWidth: 500 })] }));
check("missing alt marked warn", im[0].marks.map((m) => [m.label, m.severity]), [["no alt", "warn"]]);
check("empty alt is context only", im[1].marks.map((m) => m.severity), [null]);
check("broken image marked fail", im[2].marks[0].severity, "fail");
check("an svg reporting zero size is not called broken", im[3].marks, []);
check("oversize ratio shown", im[4].marks[0].label, "4.0x too big");
check("broken image finding fails", sev(C.images(snap({ images: [img({ broken: true })] })), "img.broken"), "fail");

const sm = C.markSchema(snap({ structuredData: { jsonLd: [
  { ok: false, error: "Unexpected token", preview: "{" },
  { ok: true, data: { "@graph": [{ "@type": "Article", "@id": "#a", headline: "H" }, { "@type": "WebPage" }] } }] } }));
check("broken block marked fail", sm[0].severity, "fail");
check("graph nodes listed", sm[1].nodes.map((n) => n.types[0]), ["Article", "WebPage"]);
check("missing required named per node", sm[1].nodes[0].missing, ["image", "datePublished", "author"]);
check("a block with gaps is amber", sm[1].severity, "warn");
const hl = C.markHreflang(snap({ hreflang: [{ hreflang: "en_AU", href: "https://e.com/x" }, { hreflang: "en-AU", href: "https://e.com/page/" }] }));
check("invalid hreflang code marked", [hl[0].valid, hl[0].severity], [false, "warn"]);
check("self reference found despite trailing slash", hl[1].self, true);

const v = C.linkStatusVerdict;
check("200 passes", v({ status: 200 }), { severity: "pass", label: "200" });
check("404 is broken", v({ status: 404 }).severity, "fail");
check("500 is broken", v({ status: 503 }).severity, "fail");
check("403 is a bot wall, not broken", v({ status: 403 }).severity, "warn");
check("a redirect is amber", v({ status: 200, redirected: true }), { severity: "warn", label: "redirect 200" });
check("a dead host is broken", v({ status: 0, error: "Failed to fetch" }).label, "failed");
check("a timeout says so", v({ status: 0, error: "timed out" }).label, "timeout");

const lsf = C.linkStatusFindings({
  a: { url: "https://e.com/a", status: 404 }, b: { url: "https://e.com/b", status: 200, redirected: true },
  c: { url: "https://x.com/c", status: 403 }, d: { url: "https://e.com/d", status: 200 },
});
check("broken links become a failure", sev(lsf, "link.broken"), "fail");
check("and name the URL with its status", lsf.find((f) => f.id === "link.broken").detail.startsWith("https://e.com/a (404)"), true);
check("redirects become a warning", sev(lsf, "link.redirect"), "warn");
check("a bot wall is its own warning, not a broken link", [sev(lsf, "link.blocked"), lsf.find((f) => f.id === "link.broken").title], ["warn", "1 link is broken"]);
check("a clean check says so", sev(C.linkStatusFindings({ a: { url: "u", status: 200 } }), "link.status-ok"), "pass");
check("no check, no findings", C.linkStatusFindings({}), []);
check("status findings carry fixes", lsf.every((f) => f.fix), true);

// ---- the whole audit ----
const bad = C.audit(snap({
  title: { text: null, count: 0, all: [] }, viewport: null, headings: [],
  robotsMeta: { content: "noindex", count: 1 },
}));
check("failures sort first", bad.findings[0].severity, "fail");
check("score counts", bad.score.fail >= 4, true);
check("every finding has an area", bad.findings.every((f) => f.area), true);
check("every non-pass finding has a fix", bad.findings.filter((f) => f.severity !== "pass").every((f) => f.fix), true);
check("no em dash or en dash anywhere", bad.findings.every((f) => !/[—–]/.test(f.title + f.detail + (f.fix || ""))), true);
const clean = C.audit(snap());
check("a healthy page reports no failures", clean.score.fail, 0);
check("and no warnings", clean.score.warn, 0);
check("but still says what it checked", clean.score.pass >= 5, true);

console.log(`${checks - failures.length}/${checks} checks passed`);
failures.forEach((x) => console.log("  FAIL " + x));
process.exit(failures.length ? 1 : 0);
