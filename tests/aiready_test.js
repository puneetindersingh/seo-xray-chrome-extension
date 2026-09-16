const AI = require("../src/aiready.js");
const R = require("../src/robots.js");

let checks = 0; const failures = [];
const check = (label, got, want) => {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const has = (list, id) => list.some((f) => f.id === id);
const sev = (list, id) => (list.find((f) => f.id === id) || {}).severity;

// Minimal snapshot in the shape extract.js produces.
function snap(o = {}) {
  return {
    title: { text: o.title === undefined ? "A page" : o.title, count: 1 },
    description: { content: o.description === undefined ? "A description" : o.description, count: 1 },
    canonical: { href: o.canonical === undefined ? "https://e.com/p" : o.canonical, count: 1 },
    robotsMeta: { content: o.robotsMeta || null, count: 0 },
    headings: o.headings || [{ level: 1, text: "Heading", empty: false, hidden: false, region: "main" }],
    links: o.links || [],
    structuredData: { jsonLd: o.jsonLd || [], microdataItems: 0, rdfaItems: 0 },
    content: {
      mainWords: o.words === undefined ? 500 : o.words,
      bodyWords: o.words === undefined ? 600 : o.words,
      questionHeadings: o.questionHeadings === undefined ? 2 : o.questionHeadings,
      shape: Object.assign({
        firstParagraphWords: 40, longestParagraphWords: 80, paragraphsOver120Words: 0,
        lists: 2, listItems: 8, tables: 1, timeElements: ["2026-01-01"], contentInIframes: 0,
      }, o.shape || {}),
    },
    page: { passwordFields: o.passwordFields || 0 },
  };
}
const internalLinks = (n) => Array.from({ length: n }, () => ({ internal: true, rel: null }));

// ---- the JavaScript gap ----
let f = AI.javascriptGap(snap({ words: 800, links: internalLinks(20) }), snap({ words: 15, links: [] }));
check("SPA with no server content fails", sev(f, "js.content-missing"), "fail");
check("SPA headline names the share", f.find((x) => x.id === "js.content-missing").title.includes("2%"), true);
check("SPA also flags the missing links", sev(f, "js.links-missing"), "fail");

f = AI.javascriptGap(snap({ words: 800, links: internalLinks(20) }), snap({ words: 760, links: internalLinks(20) }));
check("server rendered page passes", sev(f, "js.content-ok"), "pass");
check("no link finding when links are in the html", has(f, "js.links-partial"), false);

f = AI.javascriptGap(snap({ words: 800 }), snap({ words: 300 }));
check("half the content missing warns", sev(f, "js.content-partial"), "warn");

f = AI.javascriptGap(snap({}), snap({ title: null, canonical: null }));
check("head tags injected by script fail", sev(f, "js.head-injected"), "fail");
check("both missing tags are named", f.find((x) => x.id === "js.head-injected").title, "title, canonical only exist after JavaScript runs");
check("one missing tag reads as singular",
  AI.javascriptGap(snap({}), snap({ canonical: null })).find((x) => x.id === "js.head-injected").title,
  "canonical only exists after JavaScript runs");

f = AI.javascriptGap(snap({ jsonLd: [{ ok: true, data: {} }, { ok: true, data: {} }] }), snap({ jsonLd: [{ ok: true, data: {} }] }));
check("schema injected by a tag manager warns", sev(f, "js.schema-injected"), "warn");

f = AI.javascriptGap(snap({ passwordFields: 0 }), snap({ passwordFields: 1 }));
check("a login wall is called out, not counted as a fault", sev(f, "js.logged-in"), "note");
check("no raw html at all is a note", sev(AI.javascriptGap(snap({}), null), "js.no-raw"), "note");

// ---- crawler access ----
const gridFor = (txt, url = "https://e.com/p") => R.auditAll(R.parseRobots(txt), url);
f = AI.crawlerAccess(gridFor("User-agent: *\nDisallow: /\n"), R.availability(200));
check("blocking search engines fails", sev(f, "robots.search-blocked"), "fail");

f = AI.crawlerAccess(gridFor("User-agent: Google-Extended\nDisallow: /\nUser-agent: *\nAllow: /\n"), R.availability(200));
check("Google-Extended blocked is a warning", sev(f, "robots.google-extended"), "warn");
check("and search is untouched", has(f, "robots.search-blocked"), false);

f = AI.crawlerAccess(gridFor("User-agent: GPTBot\nDisallow: /\nUser-agent: CCBot\nDisallow: /\nUser-agent: *\nAllow: /\n"), R.availability(200));
check("blocking AI crawlers is reported, not scored", sev(f, "robots.ai-blocked"), "note");
check("the note names them", f.find((x) => x.id === "robots.ai-blocked").title.includes("GPTBot, CCBot"), true);

f = AI.crawlerAccess(gridFor("User-agent: *\nAllow: /\n"), R.availability(200));
check("everything allowed passes", sev(f, "robots.all-allowed"), "pass");

f = AI.crawlerAccess([], R.availability(503));
check("robots 5xx fails", sev(f, "robots.availability"), "fail");
check("robots 404 is only a note", sev(AI.crawlerAccess([], R.availability(404)), "robots.availability"), "note");

check("noai directive noted", sev(AI.crawlerAccess(gridFor("User-agent: *\nAllow: /\n"), R.availability(200), "index, noai"), "meta.noai"), "note");

// ---- user agent probes ----
const base = { status: 200, bytes: 50000 };
f = AI.agentProbes(base, [{ agent: "GPTBot", status: 403, bytes: 500 }]);
check("a 403 for a crawler UA fails", sev(f, "probe.blocked.GPTBot"), "fail");
check("the fix points at the edge, not robots.txt", f[0].fix.includes("Cloudflare"), true);
f = AI.agentProbes(base, [{ agent: "ClaudeBot", status: 200, bytes: 9000 }]);
check("a much smaller response warns", sev(f, "probe.different.ClaudeBot"), "warn");
f = AI.agentProbes(base, [{ agent: "PerplexityBot", status: 200, bytes: 49000 }]);
check("same page passes", sev(f, "probe.ok.PerplexityBot"), "pass");
check("no probes, no findings", AI.agentProbes(base, []), []);

// ---- llms.txt ----
check("absent llms.txt is a note, never a fault", sev(AI.llmsTxt({ llms: { present: false }, llmsFull: { present: false } }), "llms.absent"), "note");
f = AI.llmsTxt({ llms: { present: true, bytes: 900, shape: { h1: true, summary: true, sections: 3, links: 12 } }, llmsFull: { present: false } });
check("a well formed llms.txt passes", sev(f, "llms.present"), "pass");
f = AI.llmsTxt({ llms: { present: true, bytes: 40, shape: { h1: false, summary: false, sections: 0, links: 0 } }, llmsFull: { present: false } });
check("a malformed one is still only a note", sev(f, "llms.present"), "note");
check("html at /llms.txt is noted", sev(AI.llmsTxt({ llms: { servedHtml: true } }), "llms.html"), "note");

// ---- citability ----
f = AI.citability(snap({ shape: { firstParagraphWords: 140, paragraphsOver120Words: 3 } }));
check("a long lead warns", sev(f, "cite.long-lead"), "warn");
check("long paragraphs noted", sev(f, "cite.long-paras"), "note");

f = AI.citability(snap({ jsonLd: [] }));
check("no schema warns", sev(f, "cite.no-schema"), "warn");
f = AI.citability(snap({ jsonLd: [{ ok: true, data: { "@type": "Service" } }] }));
check("schema without a publisher is noted", sev(f, "cite.no-publisher"), "note");
check("and no-schema does not also fire", has(f, "cite.no-schema"), false);
f = AI.citability(snap({ jsonLd: [{ ok: true, data: { "@graph": [{ "@type": "Organization" }, { "@type": "WebPage" }] } }] }));
check("@graph is read", has(f, "cite.no-publisher"), false);

f = AI.citability(snap({ questionHeadings: 0, headings: [1, 2, 3, 4].map((i) => ({ level: 2, text: "H" + i })) }));
check("no question headings noted", sev(f, "cite.no-questions"), "note");
f = AI.citability(snap({ words: 900, shape: { lists: 0, tables: 0 } }));
check("long page with no structure noted", sev(f, "cite.no-structure"), "note");
f = AI.citability(snap({ shape: { timeElements: [] } }));
check("missing date noted", sev(f, "cite.no-date"), "note");

// ---- the whole audit ----
const res = AI.audit({
  live: snap({ words: 800, links: internalLinks(20) }),
  static: snap({ words: 10, links: [], title: null }),
  robotsGrid: gridFor("User-agent: GPTBot\nDisallow: /\nUser-agent: *\nAllow: /\n"),
  robotsAvailability: R.availability(200),
  baseline: base,
  probes: [{ agent: "ClaudeBot", status: 403, bytes: 100 }],
  llms: { llms: { present: false }, llmsFull: { present: false } },
});
check("failures sort to the top", res.findings[0].severity, "fail");
check("score counts failures", res.score.fail >= 3, true);
check("every finding carries an id and a title", res.findings.every((x) => x.id && x.title), true);
check("no finding uses an em dash", res.findings.every((x) => !/[—–]/.test(x.title + x.detail + (x.fix || ""))), true);

console.log(`${checks - failures.length}/${checks} checks passed`);
failures.forEach((x) => console.log("  FAIL " + x));
process.exit(failures.length ? 1 : 0);
