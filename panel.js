/**
 * Side panel controller.
 *
 * Everything shown here comes from a site we do not control, so nothing is ever
 * written with innerHTML. Text goes in through textContent, always.
 *
 * Reading the page is free and automatic. Anything that requests something over
 * the network sits behind a button: Run site checks, or Check status on Links.
 *
 * This file draws. It does not judge. Every colour on screen comes from a
 * severity that checks.js, tech.js or aiready.js decided.
 */
const $ = (id) => document.getElementById(id);
const out = $("out");

// localStorage throws on some origins, and a remembered checkbox is not worth a crash.
const remember = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* fine */ } },
};

const VIEWS = [
  { id: "summary", label: "Summary" },
  { id: "issues", label: "Issues" },
  { id: "headings", label: "Headings" },
  { id: "links", label: "Links" },
  { id: "images", label: "Images" },
  { id: "schema", label: "Schema" },
  { id: "social", label: "Social" },
  { id: "tech", label: "Tech" },
  { id: "ai", label: "AI" },
  { id: "data", label: "Data" },
];
const VIEW_IDS = VIEWS.map((v) => v.id);

const state = {
  tabId: null,
  snapshot: null,
  view: VIEW_IDS.includes(remember.get("view")) ? remember.get("view") : "summary",
  drawnView: null,
  show: { fail: true, warn: true, note: true, pass: false },
  linkFilter: "all",
  imageFilter: "all",
  reading: false,
  running: false,
  timing: {},
  net: { raw: "", headers: null, containers: "", ranFor: null, extras: null },
  status: { ranFor: null, running: false, results: {}, total: 0, done: 0 },
  result: { checks: null, tech: null, ai: null },
};

const RANK = { fail: 0, warn: 1, note: 2, pass: 3 };
const ICON = { fail: "✕", warn: "!", note: "i", pass: "✓" };

// ---------- DOM helpers ----------
function el(tag, props = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) if (kid) n.appendChild(kid);
  return n;
}

function card(title, count, bodyNodes, open = false) {
  const sum = el("summary", { text: title });
  if (count !== null && count !== undefined) sum.appendChild(el("span", { class: "count", text: String(count) }));
  const d = el("details", { class: "card" }, [sum, el("div", { class: "body" }, bodyNodes)]);
  if (open) d.setAttribute("open", "");
  return d;
}

// A card that is always open, for pages where every section matters.
const panelCard = (title, bodyNodes, aside) => el("section", { class: "pcard" }, [
  el("div", { class: "pcard-head" }, [el("h2", { text: title }), aside || null]),
  ...bodyNodes,
]);

function kv(rows) {
  const table = el("table", { class: "kv" });
  for (const [k, v, extra] of rows) {
    const vcell = el("td", { class: "v" });
    if (v === null || v === undefined || v === "") vcell.appendChild(el("span", { class: "empty", text: "not set" }));
    else vcell.appendChild(el("span", { class: "mono", text: String(v) }));
    if (extra) vcell.appendChild(el("span", { class: "len", text: " " + extra }));
    table.appendChild(el("tr", {}, [el("td", { class: "k", text: k }), vcell]));
  }
  return table;
}

/** A status pill. Loudness follows severity: red solid, amber solid, green soft, grey soft. */
function pill(severity, text, title) {
  const cls = severity ? "pill " + severity : "pill plain";
  const n = el("span", { class: cls, title: title || null });
  if (severity && ICON[severity]) n.appendChild(el("span", { class: "pill-ico", text: ICON[severity] }));
  if (text) n.appendChild(document.createTextNode(text));
  return n;
}

const worst = (fs) => fs.slice().sort((a, b) => RANK[a.severity] - RANK[b.severity])[0] || null;
const worstSeverity = (sevs) => sevs.filter(Boolean).sort((a, b) => RANK[a] - RANK[b])[0] || null;

// Third party hosts are long strings in a narrow panel. One line each, the name
// truncates rather than wrapping, and the list is capped so the card stays short.
function hostList(hosts, shown = 10) {
  const wrap = el("div", { class: "hosts" });
  const line = (h) => el("div", { class: "line host" }, [
    el("span", { class: "hname mono", text: h.host, title: h.host }),
    el("span", { class: "hhow", text: h.how.join(" ") }),
    el("span", { class: "hcount", text: String(h.count) }),
  ]);
  const sorted = hosts.slice().sort((a, b) => b.count - a.count || a.host.localeCompare(b.host));
  for (const h of sorted.slice(0, shown)) wrap.appendChild(line(h));
  if (sorted.length > shown) {
    const rest = el("div", { class: "morehosts" });
    for (const h of sorted.slice(shown)) rest.appendChild(line(h));
    const btn = el("button", { class: "morebtn", type: "button", text: `Show ${sorted.length - shown} more` });
    btn.addEventListener("click", () => { rest.classList.add("on"); btn.remove(); });
    wrap.appendChild(rest);
    wrap.appendChild(btn);
  }
  return wrap;
}

/** Long lists render in pages, so a 2,000 link page draws as fast as a 20 link one. */
function pagedList(cls, items, draw, page = 120) {
  const wrap = el("div", { class: cls });
  let shown = 0;
  const more = el("button", { class: "morebtn", type: "button" });
  const step = () => {
    const frag = document.createDocumentFragment();
    for (const it of items.slice(shown, shown + page)) frag.appendChild(draw(it));
    shown = Math.min(items.length, shown + page);
    wrap.insertBefore(frag, more);
    if (shown >= items.length) more.remove();
    else more.textContent = `Show ${Math.min(page, items.length - shown)} more of ${items.length - shown}`;
  };
  wrap.appendChild(more);
  more.addEventListener("click", step);
  step();
  return wrap;
}

const AREA_LABELS = {
  indexability: "indexing", meta: "meta", content: "content", links: "links",
  images: "images", schema: "schema", international: "hreflang", tech: "tech", ai: "AI",
};

function findingEl(f, showArea = true) {
  const node = el("div", { class: "finding " + f.severity }, [
    el("div", { class: "f-head" }, [
      el("div", { class: "f-title", text: f.title }),
      el("span", { class: "f-sev", text: showArea ? (AREA_LABELS[f.area] || f.area || "") : (f.severity === "pass" ? "ok" : f.severity) }),
    ]),
  ]);
  if (f.detail) node.appendChild(el("div", { class: "f-detail", text: f.detail }));
  if (f.fix) {
    const fix = el("div", { class: "f-fix" });
    fix.appendChild(el("b", { text: "Fix " }));
    fix.appendChild(document.createTextNode(f.fix));
    node.appendChild(fix);
  }
  return node;
}

/** One line per problem, for the top of a page. The full finding lives on Issues. */
function flags(fs) {
  const shown = fs.filter((f) => f.severity !== "pass").sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  if (!shown.length) return null;
  return el("div", { class: "flags" }, shown.map((f) => el("div", { class: "flag " + f.severity, title: f.fix || "" }, [
    el("span", { class: "flag-ico", text: ICON[f.severity] }),
    el("span", { text: f.title }),
  ])));
}

const group = (title, nodes) => el("div", { class: "group" }, [el("h3", { text: title }), ...nodes]);

// Real text measurement beats a character count: "iiii" and "WWWW" are not the same width.
const canvas = document.createElement("canvas").getContext("2d");
function measure(text, font) {
  if (!text) return 0;
  try { canvas.font = font; return Math.round(canvas.measureText(text).width); } catch { return 0; }
}

function goTo(view) {
  state.view = view;
  remember.set("view", view);
  render();
}

function extLink(href, text) {
  const a = el("a", { class: "xlink", href, target: "_blank", rel: "noreferrer noopener", text });
  return a;
}

// ---------- scoring ----------
function allFindings() {
  const r = state.result;
  const st = state.status;
  const statusDone = state.snapshot && st.ranFor === state.snapshot.url;
  return [
    ...((r.checks && r.checks.findings) || []),
    ...(statusDone ? SEOChecks.linkStatusFindings(st.results) : []),
    ...((r.tech && r.tech.findings) || []),
    ...((r.ai && r.ai.findings) || []).map((f) => Object.assign({ area: "ai" }, f)),
  ];
}
const counts = (fs) => ({
  fail: fs.filter((f) => f.severity === "fail").length,
  warn: fs.filter((f) => f.severity === "warn").length,
  note: fs.filter((f) => f.severity === "note").length,
  pass: fs.filter((f) => f.severity === "pass").length,
});

/** Which page a finding is drawn on, besides Issues. */
function tabOf(f) {
  const id = f.id || "";
  if (f.area === "ai") return "ai";
  if (f.area === "tech") return "tech";
  if (id.startsWith("og.")) return "social";
  if (f.area === "schema" || f.area === "international") return "schema";
  if (f.area === "links") return "links";
  if (f.area === "images") return "images";
  if (id.startsWith("h1.") || id.startsWith("head.")) return "headings";
  return "summary";
}
const findingsFor = (tab) => allFindings().filter((f) => tabOf(f) === tab);
const byId = (id) => allFindings().filter((f) => f.id === id);
const byPrefix = (...prefixes) => allFindings().filter((f) => prefixes.some((p) => (f.id || "").startsWith(p)));

function score(s, c) {
  if (c.fail) return { big: `${c.fail} thing${c.fail > 1 ? "s" : ""} to fix`, sub: "Failures are costing traffic or blocking indexing." };
  if (c.warn) return { big: `${c.warn} thing${c.warn > 1 ? "s" : ""} worth a look`, sub: "Nothing broken, but there is room here." };
  if (!state.net.ranFor) return { big: "Nothing broken on the page", sub: "Run site checks for robots.txt, raw HTML and tracking." };
  return { big: "This page checks out", sub: "Everything measured came back clean." };
}

// ---------- computing ----------
function compute() {
  const s = state.snapshot;
  if (!s) return;
  const t0 = performance.now();

  state.result.checks = SEOChecks.audit(s, {
    xRobotsTag: state.net.headers ? state.net.headers["x-robots-tag"] : null,
    titlePx: measure(s.title.text, "400 20px Arial"),
    descPx: measure(s.description.content, "400 14px Arial"),
  });

  const sources = {
    "rendered page": (s.loaded && s.loaded.html) || "",
    requests: ((s.loaded && s.loaded.requestedUrls) || []).join("\n"),
  };
  if (state.net.raw) sources["raw HTML"] = state.net.raw;
  if (state.net.containers) sources["tag manager container"] = state.net.containers;

  const trackers = SEOTech.detectTrackers(SEO_CATALOGUE, sources);
  const tech = {
    trackers,
    platform: SEOTech.detectPlatform(SEO_CATALOGUE, sources["rendered page"] || state.net.raw, state.net.headers || {}, s),
    verifications: SEOTech.verifications(SEO_CATALOGUE, s),
    socials: SEOTech.socials(SEO_CATALOGUE, s),
    security: SEOTech.securityGrade(SEO_CATALOGUE, state.net.headers, s.protocol === "https:"),
    summary: SEOTech.summarise(trackers, (s.loaded && s.loaded.hosts) || []),
  };
  tech.findings = SEOTech.findings(tech).map((f) => Object.assign({ area: "tech" }, f));
  state.result.tech = tech;
  state.timing.score = Math.round(performance.now() - t0);
}

// ---------- summary ----------
/**
 * One field of the summary. The pill shows the measurement coloured by the
 * finding that owns it; every other non-pass finding about the field is listed
 * underneath in its own colour.
 */
function fieldRow({ label, value, mono, pillFs, pillText, pillFallback, msgs, empty, quiet }) {
  const head = el("div", { class: "row-head" }, [el("span", { class: "row-label", text: label })]);
  const owner = worst(pillFs || []);
  if (owner) head.appendChild(pill(owner.severity, pillText ? pillText(owner) : null, owner.title));
  else if (pillFallback) head.appendChild(pillFallback);

  const row = el("div", { class: "row" + (owner && ["fail", "warn"].includes(owner.severity) ? " " + owner.severity : "") }, [head]);
  if (value === null || value === undefined || value === "") row.appendChild(el("div", { class: "row-value empty", text: empty || "not set" }));
  else row.appendChild(el("div", { class: "row-value" + (mono ? " mono" : ""), text: String(value) }));
  // The pill's own reason first, then anything else said about this field.
  const said = [];
  if (owner && !quiet && owner.severity !== "pass" && owner.severity !== "note") said.push(owner);
  said.push(...(msgs || []).filter((m) => m.severity !== "pass" && m !== owner)
    .sort((a, b) => RANK[a.severity] - RANK[b.severity]));
  for (const f of said) {
    row.appendChild(el("div", { class: "row-msg " + f.severity, title: f.fix || "" }, [
      el("span", { class: "flag-ico", text: ICON[f.severity] }), el("span", { text: f.title }),
    ]));
  }
  return row;
}

function viewSummary() {
  const s = state.snapshot;
  const nodes = [];
  const c = counts(allFindings());

  // Health strip: the three numbers that matter, each one a way into Issues.
  const strip = el("div", { class: "health" });
  for (const [key, label] of [["fail", "to fix"], ["warn", "worth a look"], ["pass", "passed"]]) {
    // Only tint a cell when there is something in it: a red zero is still red.
    const b = el("button", { class: "hcell" + (c[key] ? " " + key : ""), type: "button" }, [el("b", { text: String(c[key]) }), el("span", { text: label })]);
    b.addEventListener("click", () => {
      state.show = { fail: key === "fail", warn: key === "warn", note: false, pass: key === "pass" };
      goTo("issues");
    });
    strip.appendChild(b);
  }
  nodes.push(strip);

  const titleLen = s.title.text ? s.title.text.length : 0;
  const descLen = s.description.content ? s.description.content.length : 0;
  const titlePx = measure(s.title.text, "400 20px Arial");
  const descPx = measure(s.description.content, "400 14px Arial");
  const missing = (f) => /missing/.test(f.id) ? "Missing" : null;

  const indexFs = byId("index.noindex").concat(byId("index.http"));
  nodes.push(panelCard("Search result", [
    fieldRow({
      label: "Title", value: s.title.text,
      pillFs: byId("title.missing").concat(byId("title.long"), byId("title.short"), byId("title.ok")),
      pillText: (f) => missing(f) || `${titleLen} chars · ${titlePx}px`,
      msgs: byPrefix("title."),
    }),
    fieldRow({
      label: "Description", value: s.description.content,
      pillFs: byId("desc.missing").concat(byId("desc.long"), byId("desc.short"), byId("desc.ok")),
      pillText: (f) => missing(f) || `${descLen} chars · ${descPx}px`,
      msgs: byPrefix("desc."),
    }),
    fieldRow({
      label: "URL", value: s.url, mono: true,
      // The robots rows below say why; the pill here is enough.
      pillFs: indexFs, quiet: /\bnoindex\b/i.test(s.robotsMeta.content || "") || !!state.net.headers,
      pillText: (f) => f.id === "index.noindex" ? "Noindex" : "Not https",
      pillFallback: pill("pass", "Indexable", "No noindex in the robots meta tag" + (state.net.headers ? " or the X-Robots-Tag header" : "")),
    }),
    fieldRow({
      label: "Canonical", value: s.canonical.href, mono: true, empty: "no canonical tag",
      pillFs: byPrefix("canon.").filter((f) => f.id !== "canon.relative"),
      pillText: (f) => ({ "canon.self": "Self", "canon.other": "Canonicalised", "canon.cross-domain": "Other domain",
        "canon.missing": "Missing", "canon.multiple": `${s.canonical.count} tags` })[f.id] || null,
      msgs: byId("canon.relative"),
    }),
  ], el("button", { class: "linkbtn", type: "button", text: "All issues" })));
  nodes[nodes.length - 1].querySelector(".linkbtn").addEventListener("click", () => goTo("issues"));

  const robotsRows = [
    fieldRow({
      label: "Robots meta", value: s.robotsMeta.content, mono: true, empty: "not set, so index, follow",
      pillFs: (/\bnoindex\b/i.test(s.robotsMeta.content || "") ? byId("index.noindex") : []).concat(byId("index.nofollow"), byId("index.max-snippet-zero")),
      pillText: (f) => ({ "index.noindex": "noindex", "index.nofollow": "nofollow", "index.max-snippet-zero": "max-snippet:0" })[f.id],
      msgs: byId("index.nosnippet").concat(byId("index.noarchive"), byId("index.noimageindex")),
    }),
    fieldRow({
      label: "X-Robots-Tag", mono: true,
      value: state.net.headers ? (state.net.headers["x-robots-tag"] || null) : null,
      empty: state.net.headers ? "not set" : "Run site checks to read the response header",
      pillFs: /\bnoindex\b/i.test((state.net.headers && state.net.headers["x-robots-tag"]) || "") ? byId("index.noindex") : [],
      pillText: () => "noindex",
    }),
  ];
  if (s.googlebotMeta.content) robotsRows.push(fieldRow({ label: "Googlebot meta", value: s.googlebotMeta.content, mono: true }));
  if (s.metaRefresh) {
    robotsRows.push(fieldRow({ label: "Meta refresh", value: s.metaRefresh, mono: true,
      pillFs: byId("index.meta-refresh"), pillText: () => "Redirect" }));
  }
  nodes.push(panelCard("Crawling and indexing", robotsRows));

  const h1s = s.headings.filter((h) => h.level === 1);
  const words = s.content.mainWords || s.content.bodyWords;
  const basics = [
    fieldRow({
      label: "H1", value: h1s.length ? (h1s[0].text || "") : null, empty: h1s.length ? "empty" : "no H1 on the page",
      pillFs: byPrefix("h1."),
      pillText: (f) => ({ "h1.missing": "Missing", "h1.empty": "Empty", "h1.multiple": `${h1s.length} H1s`, "h1.ok": "1" })[f.id],
    }),
    fieldRow({
      label: "Word count", value: s.content.hasMain ? `counted inside <${s.content.mainSelector}>` : "counted across the whole body",
      pillFs: byPrefix("content.thin", "content.short", "content.ok"),
      pillText: () => `${words} words`,
      msgs: byId("content.no-main"),
    }),
    fieldRow({ label: "Lang", value: s.lang, mono: true, pillFs: byId("meta.lang"), pillText: () => "Missing" }),
    fieldRow({ label: "Viewport", value: s.viewport, mono: true, pillFs: byId("meta.viewport"), pillText: () => "Missing" }),
    fieldRow({ label: "Charset", value: s.charset || s.metaCharset, mono: true, pillFs: byId("meta.charset"), pillText: () => "Missing" }),
  ];
  if (s.keywords && s.keywords.content) {
    basics.push(fieldRow({ label: "Meta keywords", value: s.keywords.content,
      pillFallback: pill(null, `${s.keywords.content.split(",").filter((k) => k.trim()).length} values`, "Ignored by Google") }));
  }
  if (s.otherMeta && s.otherMeta.author) basics.push(fieldRow({ label: "Author", value: s.otherMeta.author }));
  nodes.push(panelCard("Page", basics));

  // Counts, each one a door into its own page.
  const lv = [1, 2, 3, 4, 5, 6].map((n) => s.headings.filter((h) => h.level === n).length);
  const grid = el("div", { class: "cgrid" });
  const cell = (label, n, sev, view) => {
    const b = el("button", { class: "ccell" + (sev ? " " + sev : ""), type: "button", title: `Open ${view}` },
      [el("span", { text: label }), el("b", { text: String(n) })]);
    b.addEventListener("click", () => goTo(view));
    return b;
  };
  lv.forEach((n, i) => grid.appendChild(cell("H" + (i + 1), n, i === 0 ? (n === 1 ? "pass" : n === 0 ? "fail" : "warn") : null, "headings")));
  const imgSev = worstSeverity(findingsFor("images").map((f) => f.severity).filter((x) => x === "fail" || x === "warn"));
  const linkSev = worstSeverity(findingsFor("links").map((f) => f.severity).filter((x) => x === "fail" || x === "warn"));
  grid.appendChild(cell("Images", s.imageCount != null ? s.imageCount : s.images.length, imgSev, "images"));
  grid.appendChild(cell("Links", s.linkCount != null ? s.linkCount : s.links.length, linkSev, "links"));
  nodes.push(grid);

  if (s.origin) {
    nodes.push(el("div", { class: "quick" }, [
      extLink(s.origin + "/robots.txt", "robots.txt"),
      extLink(s.origin + "/sitemap.xml", "sitemap.xml"),
    ]));
  }
  return nodes;
}

// ---------- issues ----------
function viewIssues() {
  const fs = allFindings();
  const c = counts(fs);
  const nodes = [];

  const v = score(state.snapshot, c);
  nodes.push(el("div", { class: "verdict" }, [
    el("div", { class: "big", text: v.big }),
    el("div", { class: "sub", text: v.sub }),
  ]));

  const row = el("div", { class: "summary" });
  for (const [key, label] of [["fail", "to fix"], ["warn", "to look at"], ["note", "notes"], ["pass", "passed"]]) {
    const tile = el("button", { class: "tile " + key, type: "button", "aria-pressed": String(state.show[key]) }, [
      el("b", { text: String(c[key]) }), el("span", { text: label }),
    ]);
    tile.addEventListener("click", () => { state.show[key] = !state.show[key]; render(); });
    row.appendChild(tile);
  }
  nodes.push(row);

  const shown = fs.filter((f) => state.show[f.severity]);
  if (!shown.length) {
    nodes.push(el("div", { class: "allclear" }, [
      el("span", { class: "tick", text: "✓" }),
      el("div", { text: fs.length ? "Nothing matches the filters above." : "No findings yet." }),
    ]));
    return nodes;
  }

  // Severity first. A failure in one area must never sit below another area's notes.
  const AREA_ORDER = ["indexability", "meta", "content", "links", "images", "schema", "international", "tech", "ai"];
  const BANDS = [["fail", "To fix"], ["warn", "Worth a look"], ["note", "Notes"], ["pass", "Checked and fine"]];
  for (const [sev, label] of BANDS) {
    const band = shown.filter((f) => f.severity === sev)
      .sort((a, b) => AREA_ORDER.indexOf(a.area) - AREA_ORDER.indexOf(b.area));
    if (band.length) nodes.push(group(`${label} (${band.length})`, band.map((f) => findingEl(f))));
  }
  return nodes;
}

// ---------- headings ----------
function viewHeadings() {
  const s = state.snapshot;
  const rows = SEOChecks.markHeadings(s);
  const nodes = [];

  const lv = [1, 2, 3, 4, 5, 6].map((n) => s.headings.filter((h) => h.level === n).length);
  nodes.push(el("div", { class: "levels" }, lv.map((n, i) => el("div", {
    class: "lcell" + (i === 0 ? (n === 1 ? " pass" : n === 0 ? " fail" : " warn") : ""),
  }, [el("span", { text: "H" + (i + 1) }), el("b", { text: String(n) })]))));

  const fl = flags(findingsFor("headings"));
  if (fl) nodes.push(fl);

  if (!rows.length) {
    nodes.push(el("div", { class: "allclear" }, [el("div", { text: "No headings on the page." })]));
    return nodes;
  }

  const copy = el("button", { class: "btn ghost small", type: "button", text: "Copy outline" });
  copy.addEventListener("click", async () => {
    const text = rows.map((r) => "  ".repeat(r.heading.level - 1) + `H${r.heading.level} ${r.heading.text || "(empty)"}`).join("\n");
    try { await navigator.clipboard.writeText(text); copy.textContent = "Copied"; } catch { copy.textContent = "Copy failed"; }
    setTimeout(() => (copy.textContent = "Copy outline"), 1200);
  });

  const list = el("ol", { class: "outline2" });
  for (const r of rows) {
    const h = r.heading;
    const sev = worstSeverity(r.marks.map((m) => m.severity));
    const li = el("li", {
      class: "oh lvl" + h.level + (sev === "fail" || sev === "warn" ? " " + sev : "") + (h.hidden ? " dim" : ""),
      style: `--depth:${Math.min(h.level - 1, 5)}`,
    }, [
      el("span", { class: "hchip h" + h.level, text: "H" + h.level }),
      el("span", { class: "otext" + (h.empty ? " empty" : ""), text: h.text || "empty heading" }),
    ]);
    const marks = el("span", { class: "omarks" }, r.marks.map((m) => pill(m.severity, m.label)));
    if (r.marks.length) li.appendChild(marks);
    list.appendChild(li);
  }
  nodes.push(panelCard(`Outline (${rows.length})`, [list], copy));
  return nodes;
}

// ---------- links ----------
function linkKey(l) { return l.href ? l.href.split("#")[0] : null; }

function viewLinks() {
  const s = state.snapshot;
  const rows = SEOChecks.markLinks(s);
  const nodes = [];
  const real = rows.filter((r) => r.link.kind === "link");
  const unique = new Set(real.map((r) => linkKey(r.link)).filter(Boolean));
  const st = state.status;
  const statusReady = st.ranFor === s.url;
  const verdictOf = (r) => statusReady ? SEOChecks.linkStatusVerdict(st.results[linkKey(r.link)]) : null;
  const problem = (r) => r.marks.some((m) => m.severity === "fail" || m.severity === "warn") ||
    ["fail", "warn"].includes((verdictOf(r) || {}).severity);

  const FILTERS = [
    ["all", "All", rows.length, null],
    ["internal", "Internal", real.filter((r) => r.link.internal === true).length, null],
    ["external", "External", real.filter((r) => r.link.internal === false).length, null],
    ["nofollow", "Nofollow", real.filter((r) => SEOChecks.isNofollow(r.link)).length, null],
    ["problems", "Problems", rows.filter(problem).length, worstSeverity(rows.flatMap((r) => r.marks.map((m) => m.severity).concat([(verdictOf(r) || {}).severity])).filter((x) => x === "fail" || x === "warn"))],
  ];
  const tiles = el("div", { class: "ftiles" });
  for (const [key, label, n, sev] of FILTERS) {
    const b = el("button", { class: "ftile" + (sev && n ? " " + sev : ""), type: "button", "aria-pressed": String(state.linkFilter === key) },
      [el("b", { text: String(n) }), el("span", { text: label })]);
    b.addEventListener("click", () => { state.linkFilter = key; render(); });
    tiles.appendChild(b);
  }
  nodes.push(tiles);

  const fl = flags(findingsFor("links"));
  if (fl) nodes.push(fl);

  // Status check: the one thing on this page that goes to the network, so it waits for a click.
  const toCheck = [...unique].filter((u) => /^https?:/i.test(u));
  const bar = el("div", { class: "statusbar" });
  const btn = el("button", { class: "btn ghost small", type: "button", id: "check-status",
    text: st.running ? "Checking..." : statusReady ? "Check again" : "Check status" });
  if (st.running || !toCheck.length) btn.setAttribute("disabled", "");
  btn.addEventListener("click", () => checkLinkStatuses(toCheck));
  bar.appendChild(btn);
  if (st.running) {
    bar.appendChild(el("span", { class: "sb-note", id: "status-progress", text: `${st.done} of ${st.total} checked` }));
  } else if (statusReady) {
    const v = Object.values(st.results).map((r) => SEOChecks.linkStatusVerdict(r));
    const broken = v.filter((x) => x.severity === "fail").length;
    const amber = v.filter((x) => x.severity === "warn").length;
    const ok = v.filter((x) => x.severity === "pass").length;
    bar.appendChild(el("span", { class: "sb-counts" }, [
      pill(broken ? "fail" : null, `${broken} broken`), pill(amber ? "warn" : null, `${amber} redirect or blocked`), pill("pass", `${ok} ok`),
    ]));
  } else {
    bar.appendChild(el("span", { class: "sb-note", text: `Requests ${Math.min(toCheck.length, 300)} unique URLs from this browser.` }));
  }
  nodes.push(bar);

  const pick = {
    all: () => true,
    internal: (r) => r.link.internal === true,
    external: (r) => r.link.internal === false,
    nofollow: (r) => SEOChecks.isNofollow(r.link),
    problems: problem,
  }[state.linkFilter] || (() => true);
  const shown = rows.filter(pick);

  if (!shown.length) {
    nodes.push(el("div", { class: "allclear" }, [el("div", { text: rows.length ? "No links match this filter." : "No links on the page." })]));
  } else {
    nodes.push(pagedList("links", shown, (r) => {
      const l = r.link;
      const v = verdictOf(r);
      const sev = worstSeverity(r.marks.map((m) => m.severity).concat([v && v.severity]));
      const head = el("div", { class: "lk-head" }, [
        el("span", { class: "lk-text" + (l.text ? "" : " empty"), text: l.text || l.ariaLabel || (l.hasImage ? "image link" : "no anchor text") }),
      ]);
      if (v) head.appendChild(pill(v.severity, v.label, st.results[linkKey(l)].finalUrl || st.results[linkKey(l)].error || ""));
      const tags = el("div", { class: "lk-tags" });
      if (l.internal === true) tags.appendChild(pill(null, "internal"));
      if (l.internal === false) tags.appendChild(pill(null, "external"));
      if (l.region && !["main", "body"].includes(l.region)) tags.appendChild(pill(null, l.region));
      if (l.target === "_blank") tags.appendChild(pill(null, "new tab"));
      for (const m of r.marks) tags.appendChild(pill(m.severity, m.label));
      return el("div", { class: "lk" + (sev === "fail" || sev === "warn" ? " " + sev : ""), "data-url": linkKey(l) || "" }, [
        head,
        el("div", { class: "lk-url mono", text: l.href || "(no href attribute)", title: l.href || "" }),
        tags,
      ]);
    }));
  }

  const sp = s.specialLinks;
  nodes.push(el("div", { class: "footnote", text:
    `Not listed: ${sp.mailto} mailto, ${sp.tel} tel, ${sp.fragment} on-page anchors, ${sp.javascript} javascript: hrefs.` +
    (s.linksTruncated ? ` Only the first ${rows.length} of ${s.linkCount} links were read.` : "") }));
  return nodes;
}

async function checkLinkStatuses(urls) {
  const st = state.status;
  if (st.running || !state.snapshot) return;
  const forUrl = state.snapshot.url;
  const list = urls.slice(0, 300);
  Object.assign(st, { running: true, ranFor: null, results: {}, total: list.length, done: 0 });
  render();
  await SEOFetch.linkStatuses(list, {
    concurrency: 6,
    cancelled: () => !state.snapshot || state.snapshot.url !== forUrl,
    onEach: (r) => {
      st.results[r.url] = r;
      st.done++;
      const prog = document.getElementById("status-progress");
      if (prog) prog.textContent = `${st.done} of ${st.total} checked`;
    },
  });
  st.running = false;
  if (state.snapshot && state.snapshot.url === forUrl) st.ranFor = forUrl;
  render();
}

// ---------- images ----------
function viewImages() {
  const s = state.snapshot;
  const rows = SEOChecks.markImages(s);
  const nodes = [];
  const has = (r, id) => r.marks.some((m) => m.id === id);
  const problem = (r) => r.marks.some((m) => m.severity === "fail" || m.severity === "warn");

  const FILTERS = [
    ["all", "All", rows.length, null],
    ["noalt", "No alt", rows.filter((r) => has(r, "img.no-alt")).length, "warn"],
    ["broken", "Broken", rows.filter((r) => has(r, "img.broken")).length, "fail"],
    ["problems", "Problems", rows.filter(problem).length, worstSeverity(rows.flatMap((r) => r.marks.map((m) => m.severity)).filter((x) => x === "fail" || x === "warn"))],
  ];
  const tiles = el("div", { class: "ftiles" });
  for (const [key, label, n, sev] of FILTERS) {
    const b = el("button", { class: "ftile" + (sev && n ? " " + sev : ""), type: "button", "aria-pressed": String(state.imageFilter === key) },
      [el("b", { text: String(n) }), el("span", { text: label })]);
    b.addEventListener("click", () => { state.imageFilter = key; render(); });
    tiles.appendChild(b);
  }
  nodes.push(tiles);

  const fl = flags(findingsFor("images"));
  if (fl) nodes.push(fl);

  const pick = {
    all: () => true, noalt: (r) => has(r, "img.no-alt"), broken: (r) => has(r, "img.broken"), problems: problem,
  }[state.imageFilter] || (() => true);
  const shown = rows.filter(pick);
  if (!shown.length) {
    nodes.push(el("div", { class: "allclear" }, [el("div", { text: rows.length ? "No images match this filter." : "No images on the page." })]));
    return nodes;
  }

  nodes.push(pagedList("imgs", shown, (r) => {
    const i = r.image;
    const sev = worstSeverity(r.marks.map((m) => m.severity));
    let name = i.isData ? "inline data image" : (i.src || "").split("?")[0].split("/").pop() || i.src || "no src";
    try { name = decodeURIComponent(name); } catch { /* keep raw */ }
    const head = el("div", { class: "im-head" }, [el("span", { class: "im-name", text: name, title: i.src || "" })]);
    if (i.ext && !i.isData) head.appendChild(pill(null, i.ext));

    const alt = el("div", { class: "im-alt" });
    if (!i.hasAlt) alt.appendChild(el("span", { class: "empty", text: "no alt attribute" }));
    else if (!i.alt) alt.appendChild(el("span", { class: "empty", text: "alt is empty, read as decorative" }));
    else { alt.appendChild(el("span", { class: "im-k", text: "alt " })); alt.appendChild(document.createTextNode(i.alt)); }

    const dims = [];
    if (i.naturalWidth) dims.push(`file ${i.naturalWidth}×${i.naturalHeight}`);
    if (i.displayWidth) dims.push(`shown ${i.displayWidth}×${i.displayHeight}`);
    if (i.widthAttr && i.heightAttr) dims.push(`attrs ${i.widthAttr}×${i.heightAttr}`);
    if (i.loading) dims.push(`loading=${i.loading}`);
    if (i.srcset) dims.push("srcset");

    const tags = el("div", { class: "lk-tags" }, r.marks.map((m) => pill(m.severity, m.label)));
    return el("div", { class: "im" + (sev === "fail" || sev === "warn" ? " " + sev : "") }, [
      head, alt,
      dims.length ? el("div", { class: "im-dims", text: dims.join(" · ") }) : null,
      r.marks.length ? tags : null,
    ]);
  }));
  if (s.imagesTruncated) nodes.push(el("div", { class: "footnote", text: `Only the first ${rows.length} of ${s.imageCount} images were read.` }));
  return nodes;
}

// ---------- schema ----------
function viewSchema() {
  const s = state.snapshot;
  const nodes = [];
  const blocks = SEOChecks.markSchema(s);

  const fl = flags(findingsFor("schema"));
  if (fl) nodes.push(fl);

  const enc = encodeURIComponent(s.url);
  const tools = el("div", { class: "quick" }, [
    extLink(`https://search.google.com/test/rich-results?url=${enc}`, "Rich Results Test"),
    extLink(`https://validator.schema.org/#url=${enc}`, "Schema validator"),
  ]);

  if (!blocks.length) {
    nodes.push(panelCard("JSON-LD", [el("div", { class: "row-value empty pad", text: "No JSON-LD blocks on this page." })]));
  }
  blocks.forEach((b, n) => {
    const body = [];
    if (!b.ok) {
      body.push(el("div", { class: "row-msg fail" }, [el("span", { class: "flag-ico", text: ICON.fail }), el("span", { text: b.error })]));
      if (b.preview) body.push(el("pre", { class: "raw small", text: b.preview }));
    } else {
      for (const node of b.nodes) {
        const head = el("div", { class: "row-head" }, [el("span", { class: "row-label", text: node.types.join(", ") || "no @type" })]);
        head.appendChild(node.missing.length ? pill("warn", `missing ${node.missing.length}`) : pill("pass", null, "Required properties present"));
        const props = Object.entries(node.node).filter(([k]) => !["@context", "@type", "@graph"].includes(k)).slice(0, 12)
          .map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v).slice(0, 140) : String(v).slice(0, 200)]);
        const row = el("div", { class: "row" + (node.missing.length ? " warn" : "") }, [head]);
        if (node.missing.length) {
          row.appendChild(el("div", { class: "row-msg warn" }, [el("span", { class: "flag-ico", text: ICON.warn }),
            el("span", { text: `Required for ${node.types.find((t) => SEOChecks.REQUIRED[t])}: ${node.missing.join(", ")}` })]));
        }
        if (props.length) row.appendChild(kv(props));
        body.push(row);
      }
      const raw = el("details", { class: "rawjson" }, [el("summary", { text: "Show JSON" }),
        el("pre", { class: "raw small", text: JSON.stringify(s.structuredData.jsonLd[b.index].data, null, 2) })]);
      body.push(raw);
    }
    const title = `Block ${n + 1}`;
    nodes.push(panelCard(title, body, pill(b.severity, b.ok ? (b.severity === "pass" ? "Parses" : "Incomplete") : "Does not parse")));
  });

  const sd = s.structuredData;
  if (sd.microdataItems || sd.rdfaItems) {
    nodes.push(panelCard("Other markup", [kv([["microdata items", sd.microdataItems], ["RDFa items", sd.rdfaItems]])]));
  }

  const tags = SEOChecks.markHreflang(s);
  if (tags.length) {
    const list = el("div", { class: "hl" });
    for (const t of tags) {
      const line = el("div", { class: "line" }, [
        pill(t.valid ? null : "warn", t.tag.hreflang || "(blank)"),
        el("span", { class: "hname mono", text: t.tag.href || "", title: t.tag.href || "" }),
      ]);
      if (t.self) line.appendChild(pill("pass", "this page"));
      list.appendChild(line);
    }
    nodes.push(panelCard(`Hreflang (${tags.length})`, [list]));
  }
  nodes.push(tools);
  return nodes;
}

// ---------- social ----------
function viewSocial() {
  const s = state.snapshot;
  const og = s.og || {};
  const tw = s.twitter || {};
  const nodes = [];

  const ogFinding = worst(byId("og.missing").concat(byId("og.partial")));
  const REQUIRED_OG = ["og:title", "og:description", "og:image"];
  const firstGap = REQUIRED_OG.find((k) => !og[k]);
  const ogRows = ["og:title", "og:description", "og:image", "og:url", "og:type", "og:site_name"].map((k) => {
    const needed = REQUIRED_OG.includes(k) && !og[k] && ogFinding;
    return fieldRow({
      label: k, value: og[k], mono: ["og:image", "og:url"].includes(k), empty: "not set",
      // Every gap gets a pill; the sentence explaining them is said once.
      quiet: needed && k !== firstGap,
      pillFs: needed ? [ogFinding] : k === "og:url" ? byId("og.url-mismatch") : [],
      pillText: (f) => f.id === "og.url-mismatch" ? "Not the canonical" : "Missing",
      pillFallback: og[k] ? pill("pass", null) : null,
    });
  });
  const extraOg = Object.keys(og).filter((k) => !["og:title", "og:description", "og:image", "og:url", "og:type", "og:site_name"].includes(k));
  const ogBody = [...ogRows];
  if (extraOg.length) ogBody.push(kv(extraOg.map((k) => [k, og[k]])));
  nodes.push(panelCard("Open Graph", ogBody));

  // X falls back to Open Graph for everything except the card type, so a gap
  // here is only a gap when Open Graph does not cover it either.
  const FALLBACK = { "twitter:title": "og:title", "twitter:description": "og:description", "twitter:image": "og:image" };
  const twRows = ["twitter:card", "twitter:title", "twitter:description", "twitter:image", "twitter:site"].map((k) => fieldRow({
    label: k, value: tw[k], mono: k === "twitter:image",
    empty: FALLBACK[k] && og[FALLBACK[k]] ? `not set, X uses ${FALLBACK[k]}` : "not set",
    pillFallback: tw[k] ? pill("pass", null) : null,
  }));
  const extraTw = Object.keys(tw).filter((k) => !["twitter:card", "twitter:title", "twitter:description", "twitter:image", "twitter:site"].includes(k));
  if (extraTw.length) twRows.push(kv(extraTw.map((k) => [k, tw[k]])));
  nodes.push(panelCard("X (Twitter) card", twRows));
  return nodes;
}

// ---------- tech ----------
function viewTech() {
  const tech = state.result.tech;
  const s = state.snapshot;
  const nodes = [el("div", { class: "verdict" }, [
    el("div", { class: "big", text: tech.summary.level }),
    el("div", { class: "sub", text: tech.summary.detail }),
  ])];

  const groups = {};
  for (const t of tech.trackers) (groups[t.category] = groups[t.category] || []).push(t);
  const body = [];
  for (const [cat, list] of Object.entries(groups)) {
    const ul = el("ul", { class: "tools" });
    for (const t of list) {
      const li = el("li");
      li.appendChild(el("span", { class: "tname" + (t.dead ? " dead" : ""), text: t.name }));
      for (const id of t.ids) li.appendChild(el("span", { class: "tid", text: id }));
      li.appendChild(el("span", { class: "tsrc", text: t.sources.join(", ") }));
      ul.appendChild(li);
    }
    body.push(el("div", { class: "techgroup" }, [el("h4", { text: SEO_CATALOGUE.categories[cat] || cat }), ul]));
  }
  if (!tech.trackers.length) body.push(el("p", { class: "empty", text: "No tracking or marketing tools detected." }));
  nodes.push(card("Tools on this page", tech.trackers.length, body, true));

  const rows = [];
  if (tech.platform.cms) rows.push(["platform", tech.platform.cms]);
  for (const d of tech.platform.detail) rows.push(["", d]);
  if (tech.platform.server) rows.push(["server", tech.platform.server]);
  if (tech.platform.poweredBy) rows.push(["powered by", tech.platform.poweredBy]);
  rows.push(["third party hosts", (s.loaded && s.loaded.thirdPartyHosts) || 0]);
  for (const v of tech.verifications) rows.push(["verified with", v.platform]);
  const platformBody = [kv(rows)];
  // A profile URL is long and there is nothing to read past the handle, so it gets
  // one line and a tooltip rather than breaking across the middle of a word.
  if (tech.socials.length) {
    const ul = el("div", { class: "socials" });
    for (const so of tech.socials) {
      ul.appendChild(el("div", { class: "line social" }, [
        el("span", { class: "sname", text: so.platform }),
        el("span", { class: "surl mono", text: so.url.replace(/^https?:\/\/(www\.)?/, ""), title: so.url }),
      ]));
    }
    platformBody.push(el("h4", { class: "subhead", text: "Profiles" }), ul);
  }
  nodes.push(card("Platform and profiles", null, platformBody, true));

  if (tech.security) {
    const g = tech.security.grade;
    const cls = ["A+", "A"].includes(g) ? "good" : ["B", "C"].includes(g) ? "mid" : "bad";
    nodes.push(card("Security headers", g, [
      el("div", { class: "grade " + cls, text: g }),
      kv([["present", tech.security.present.join(", ") || "none"], ["missing", tech.security.missing.join(", ") || "none"]]),
    ]));
  } else {
    nodes.push(card("Security headers", "not run", [el("p", { class: "empty", text: "Run site checks to read the response headers." })]));
  }

  const hosts = ((s.loaded && s.loaded.hosts) || []).filter((h) => h.thirdParty);
  if (hosts.length) {
    const body = [hostList(hosts.slice(0, 60))];
    if (hosts.length > 60) body.push(el("p", { class: "empty", text: `${hosts.length - 60} more not listed.` }));
    nodes.push(card("Third party hosts", hosts.length, body));
  }
  return nodes;
}

// ---------- ai ----------
function viewAi() {
  const nodes = [];
  const probe = el("input", { type: "checkbox", id: "probe-ua" });
  if (remember.get("probeUA") === "1") probe.setAttribute("checked", "");
  probe.addEventListener("change", () => remember.set("probeUA", probe.checked ? "1" : "0"));
  nodes.push(el("div", { class: "runbar" }, [
    el("label", {}, [probe, el("span", { text: "also request the page as GPTBot, ClaudeBot and PerplexityBot" })]),
  ]));

  if (!state.result.ai) {
    nodes.push(el("div", { class: "verdict" }, [
      el("div", { class: "big", text: "Not checked yet" }),
      el("div", { class: "sub", text: "Run site checks, at the bottom, fetches this page's raw HTML, robots.txt and llms.txt from the site, then compares what a crawler receives against what you can see." }),
    ]));
    return nodes;
  }
  nodes.push(...state.result.ai.findings.slice().sort((a, b) => RANK[a.severity] - RANK[b.severity]).map((f) => findingEl(f, false)));
  if (state.net.extras) nodes.push(card("What was fetched", null, [kv(state.net.extras)], true));
  return nodes;
}

// ---------- data ----------
function viewData() {
  const s = state.snapshot;
  const dump = Object.assign({}, s, {
    loaded: Object.assign({}, s.loaded, {
      html: `[${(s.loaded.html || "").length} chars, omitted here]`,
      requestedUrls: `[${(s.loaded.requestedUrls || []).length} urls]`,
    }),
  });
  const t = state.timing;
  return [
    card("Timing", null, [kv([
      ["read the page", t.read ? t.read + " ms" : "-"],
      ["score it", t.score !== undefined ? t.score + " ms" : "-"],
      ["draw the panel", t.render !== undefined ? t.render + " ms" : "-"],
      ["site checks", t.net ? t.net + " ms" : "not run"],
      ["page size", s.content.htmlLength.toLocaleString() + " chars"],
      ["DOM nodes", s.content.domNodes.toLocaleString()],
    ])], true),
    card("Snapshot", null, [el("pre", { class: "raw", text: JSON.stringify(dump, null, 2) })], true),
  ];
}

// ---------- render ----------
function renderTabs() {
  const nav = $("tabs");
  nav.textContent = "";
  const fs = state.snapshot ? allFindings() : [];
  for (const v of VIEWS) {
    const tab = el("button", { class: "tab", type: "button", role: "tab",
                               "aria-selected": String(state.view === v.id) }, [el("span", { text: v.label })]);
    // A badge only ever means "something here needs you": red for failures, amber for warnings.
    const mine = v.id === "issues" ? fs : v.id === "data" ? [] : fs.filter((f) => tabOf(f) === v.id);
    const c = counts(mine);
    if (c.fail) tab.appendChild(el("span", { class: "badge fail", text: String(c.fail) }));
    else if (c.warn) tab.appendChild(el("span", { class: "badge warn", text: String(c.warn) }));
    tab.addEventListener("click", () => goTo(v.id));
    nav.appendChild(tab);
  }
}

const DRAW = {
  summary: viewSummary, issues: viewIssues, headings: viewHeadings, links: viewLinks, images: viewImages,
  schema: viewSchema, social: viewSocial, tech: viewTech, ai: viewAi, data: viewData,
};

function render() {
  const t0 = performance.now();
  const run = $("run");
  run.textContent = state.running ? "Checking..." : "Run site checks";
  run.disabled = state.running || !state.snapshot;
  renderTabs();
  const keep = state.drawnView === state.view ? out.scrollTop : 0;
  out.textContent = "";
  if (!state.snapshot) { state.timing.render = Math.round(performance.now() - t0); return; }
  const nodes = (DRAW[state.view] || viewSummary)();
  const frag = document.createDocumentFragment();
  for (const n of nodes) if (n) frag.appendChild(n);
  out.appendChild(frag);
  out.scrollTop = keep;
  state.drawnView = state.view;
  state.timing.render = Math.round(performance.now() - t0);
  $("stamp").textContent = state.timing.read ? `read in ${state.timing.read} ms` : "";
}

function notice(msg) {
  const n = $("notice");
  if (!msg) { n.hidden = true; return; }
  n.hidden = false;
  n.textContent = msg;
}

// ---------- reading the page ----------
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

async function read() {
  if (state.reading) return;
  state.reading = true;
  $("refresh").classList.add("spinning");
  try {
    const tab = await activeTab();
    if (!tab) return;
    state.tabId = tab.id;
    $("page-title").textContent = tab.title || "Untitled";
    $("page-url").textContent = tab.url || "";
    $("favicon").src = tab.favIconUrl || "";

    const url = tab.url || "";
    if (!/^https?:/i.test(url)) {
      state.snapshot = null;
      render();
      notice("SEO Xray reads http and https pages. This tab is " + (url.split(":")[0] || "empty") + ".");
      return;
    }

    const t0 = performance.now();
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/extract.js", "src/extract-inject.js"],
    });
    const snap = res && res.result;
    if (!snap) throw new Error("the page returned nothing");
    state.timing.read = Math.round(performance.now() - t0);

    // Anything fetched belongs to the URL it was fetched for.
    if (state.net.ranFor && state.net.ranFor !== snap.url) {
      state.net = { raw: "", headers: null, containers: "", ranFor: null, extras: null };
      state.result.ai = null;
    }
    if (state.status.ranFor && state.status.ranFor !== snap.url) {
      state.status = { ranFor: null, running: false, results: {}, total: 0, done: 0 };
    }
    state.snapshot = snap;
    compute();
    notice("");
    render();
  } catch (err) {
    state.snapshot = null;
    render();
    notice("Could not read this page: " + (err.message || err));
  } finally {
    state.reading = false;
    $("refresh").classList.remove("spinning");
  }
}

// ---------- site checks (the button that touches the site) ----------
const PROBE_AGENTS = [
  { agent: "GPTBot", ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot" },
  { agent: "ClaudeBot", ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ClaudeBot/1.0; +claudebot@anthropic.com" },
  { agent: "PerplexityBot", ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot" },
];

async function runSiteChecks() {
  if (!state.snapshot || state.running) return;
  state.running = true;
  state.view = "ai";
  render();
  const t0 = performance.now();
  const url = state.snapshot.url;
  const extras = [];

  try {
    const raw = await SEOFetch.fetchText(url);
    state.net.raw = raw.ok ? raw.text : "";
    state.net.headers = raw.headers || null;
    extras.push(["raw HTML fetch", raw.ok ? `${raw.status}, ${raw.bytes} bytes, ${raw.ms} ms` : `failed: ${raw.error || raw.status}`]);
    if (raw.redirected) extras.push(["redirected to", raw.url]);
    extras.push(["X-Robots-Tag", (raw.headers && raw.headers["x-robots-tag"]) || "not set"]);

    let staticSnap = null;
    if (raw.ok && raw.text) {
      const doc = new DOMParser().parseFromString(raw.text, "text/html");
      staticSnap = __seoExtract(doc, { live: false, url: raw.url || url });
    }

    // Expand any tag manager container, so tags fired through it get named.
    const firstPass = SEOTech.detectTrackers(SEO_CATALOGUE, {
      "rendered page": (state.snapshot.loaded && state.snapshot.loaded.html) || "", "raw HTML": state.net.raw,
    });
    const containers = SEOTech.containerUrls(firstPass);
    let containerText = "";
    for (const c of containers) {
      const r = await SEOFetch.fetchText(c);
      if (r.ok) containerText += "\n" + r.text;
    }
    state.net.containers = containerText;
    if (containers.length) extras.push(["tag manager containers", `${containers.length} read, ${containerText.length} bytes`]);

    const robots = await SEOFetch.getRobots(url);
    const avail = SEORobots.availability(robots ? robots.status : 0, robots ? !!robots.error : true);
    let grid = [];
    if (avail.usable && !robots.looksLikeHtml) grid = SEORobots.auditAll(SEORobots.parseRobots(robots.text), url);
    extras.push(["robots.txt", robots ? `${robots.status}${robots.looksLikeHtml ? ", served as HTML" : ""}, ${robots.bytes} bytes` : "not fetched"]);

    const sitemaps = await SEOFetch.getSitemaps(robots ? robots.text : "", url);
    if (sitemaps.length) {
      const hit = await SEOFetch.sitemapContains(sitemaps[0].url, url);
      extras.push(["sitemap", `${sitemaps[0].url} (${sitemaps[0].source})`]);
      extras.push(["this URL is listed", hit.ok ? (hit.found ? "yes" : "no") : `could not read (${hit.status})`]);
    }

    const llms = await SEOFetch.getLlmsTxt(url);

    const probes = [];
    const probeBox = $("probe-ua");
    if (probeBox && probeBox.checked) {
      for (const a of PROBE_AGENTS) {
        const r = await SEOFetch.fetchAsAgent(url, a.ua);
        probes.push({ agent: a.agent, status: r.status, bytes: r.bytes || 0, error: r.error });
      }
    }

    state.result.ai = SEOAiReady.audit({
      live: state.snapshot, static: staticSnap, robotsGrid: grid, robotsAvailability: avail,
      baseline: raw, probes, llms,
    });
    state.net.ranFor = url;
    state.net.extras = extras;
  } catch (err) {
    state.result.ai = {
      findings: [{ severity: "note", id: "run.error", title: "The check could not finish", detail: String(err.message || err), fix: null }],
      score: { fail: 0, warn: 0, note: 1, pass: 0 },
    };
  } finally {
    state.timing.net = Math.round(performance.now() - t0);
    state.running = false;
    compute();
    render();
  }
}

// ---------- copy ----------
function report() {
  const s = state.snapshot;
  if (!s) return "";
  const lines = [`# SEO Xray: ${s.title.text || s.url}`, "", s.url, `Checked ${new Date().toLocaleString()}`, ""];
  const fs = allFindings();
  const c = counts(fs);
  lines.push(`${c.fail} to fix, ${c.warn} to look at, ${c.note} notes, ${c.pass} passed`, "");
  for (const sev of ["fail", "warn", "note"]) {
    const inSev = fs.filter((f) => f.severity === sev);
    if (!inSev.length) continue;
    lines.push(`## ${sev === "fail" ? "To fix" : sev === "warn" ? "Worth a look" : "Notes"}`, "");
    for (const f of inSev) {
      lines.push(`- **${f.title}**`);
      if (f.detail) lines.push(`  ${f.detail}`);
      if (f.fix) lines.push(`  Fix: ${f.fix}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ---------- wiring ----------
chrome.tabs.onActivated.addListener(read);
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (tabId === state.tabId && info.status === "complete") read();
});
chrome.windows.onFocusChanged.addListener((id) => {
  if (id !== chrome.windows.WINDOW_ID_NONE) read();
});

$("refresh").addEventListener("click", read);
$("run").addEventListener("click", runSiteChecks);
$("copy").addEventListener("click", async () => {
  const text = report();
  if (!text) return;
  try { await navigator.clipboard.writeText(text); } catch { /* clipboard refused */ }
  const b = $("copy");
  b.textContent = "Copied";
  setTimeout(() => (b.textContent = "Copy report"), 1200);
});

read();
