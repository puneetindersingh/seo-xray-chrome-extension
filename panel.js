/**
 * Side panel controller.
 *
 * Everything shown here comes from a site we do not control, so nothing is ever
 * written with innerHTML. Text goes in through textContent, always.
 *
 * Reading the page is free and automatic. Anything that requests something from
 * the site sits behind the Run site checks button.
 */
const $ = (id) => document.getElementById(id);
const out = $("out");

// localStorage throws on some origins, and a remembered checkbox is not worth a crash.
const remember = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* fine */ } },
};

const VIEWS = [
  { id: "issues", label: "Issues" },
  { id: "page", label: "Page" },
  { id: "tech", label: "Tech" },
  { id: "ai", label: "AI" },
  { id: "data", label: "Data" },
];

const state = {
  tabId: null,
  snapshot: null,
  view: remember.get("view") || "issues",
  show: { fail: true, warn: true, note: true, pass: false },
  reading: false,
  running: false,
  timing: {},
  net: { raw: "", headers: null, containers: "", ranFor: null, extras: null },
  result: { checks: null, tech: null, ai: null },
};

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

const stats = (pairs) => el("div", { class: "stats" }, pairs.map(([n, label]) =>
  el("div", { class: "stat" }, [el("b", { text: String(n) }), el("span", { text: label })])));

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

const group = (title, nodes) => el("div", { class: "group" }, [el("h3", { text: title }), ...nodes]);

// Real text measurement beats a character count: "iiii" and "WWWW" are not the same width.
const canvas = document.createElement("canvas").getContext("2d");
function measure(text, font) {
  if (!text) return 0;
  try { canvas.font = font; return Math.round(canvas.measureText(text).width); } catch { return 0; }
}

// ---------- scoring ----------
function allFindings() {
  const r = state.result;
  return [
    ...((r.checks && r.checks.findings) || []),
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

// ---------- views ----------
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

function viewPage() {
  const s = state.snapshot;
  const nodes = [];
  const links = s.links || [];
  const imgs = s.images || [];
  const h1s = (s.headings || []).filter((h) => h.level === 1);

  nodes.push(stats([
    [s.content.mainWords || s.content.bodyWords, "words"],
    [links.length, "links"],
    [imgs.length, "images"],
    [h1s.length, "H1"],
    [(s.structuredData.jsonLd || []).length, "JSON-LD"],
  ]));

  nodes.push(card("Indexing", null, [kv([
    ["meta robots", s.robotsMeta.content, s.robotsMeta.count > 1 ? `(${s.robotsMeta.count} tags)` : ""],
    ["meta googlebot", s.googlebotMeta.content],
    ["X-Robots-Tag", state.net.headers ? (state.net.headers["x-robots-tag"] || "not set") : "run site checks to read the header"],
    ["canonical", s.canonical.href, s.canonical.count > 1 ? `(${s.canonical.count} tags)` : ""],
    ["meta refresh", s.metaRefresh],
    ["protocol", s.protocol],
  ])], true));

  nodes.push(card("Title and meta", null, [kv([
    ["title", s.title.text, s.title.text ? `${s.title.text.length} chars, ${measure(s.title.text, "400 20px Arial")}px` : ""],
    ["description", s.description.content, s.description.content ? `${s.description.content.length} chars` : ""],
    ["lang", s.lang], ["charset", s.charset || s.metaCharset], ["viewport", s.viewport],
    ["generator", s.page.generator],
  ])], true));

  const ogRows = Object.entries(s.og || {});
  const twRows = Object.entries(s.twitter || {});
  nodes.push(card("Social tags", ogRows.length + twRows.length, [
    ogRows.length || twRows.length ? kv([...ogRows, ...twRows]) : el("p", { class: "empty", text: "No Open Graph or Twitter tags." }),
  ]));

  const outline = el("ul", { class: "outline" });
  for (const h of s.headings || []) {
    const li = el("li");
    li.appendChild(el("span", { class: "tag" + (h.level === 1 ? " h1" : ""), text: "H" + h.level }));
    li.appendChild(document.createTextNode(h.text || ""));
    if (h.empty) li.appendChild(el("span", { class: "pill", text: "empty" }));
    if (h.hidden) li.appendChild(el("span", { class: "pill", text: "hidden" }));
    if (h.region && !["main", "body"].includes(h.region)) li.appendChild(el("span", { class: "pill", text: h.region }));
    outline.appendChild(li);
  }
  nodes.push(card("Heading outline", (s.headings || []).length,
    [(s.headings || []).length ? outline : el("p", { class: "empty", text: "No headings on the page." })]));

  const internal = links.filter((l) => l.internal === true);
  nodes.push(card("Links", links.length, [
    stats([[internal.length, "internal"], [links.filter((l) => l.internal === false).length, "external"],
           [links.filter((l) => /(^|\s)nofollow(\s|$)/i.test(l.rel || "")).length, "nofollow"]]),
    kv([
      ["no href", links.filter((l) => l.kind === "no-href").length],
      ["empty anchor text", links.filter((l) => l.kind === "link" && !l.text && !l.ariaLabel && !l.hasImage).length],
      ["opens a new tab", links.filter((l) => l.target === "_blank").length],
      ["mailto / tel", `${s.specialLinks.mailto} / ${s.specialLinks.tel}`],
      ["on-page anchors", s.specialLinks.fragment],
      ["javascript: hrefs", s.specialLinks.javascript],
    ]),
  ]));

  nodes.push(card("Images", imgs.length, [kv([
    ["missing alt attribute", imgs.filter((i) => !i.hasAlt).length],
    ["empty alt (decorative)", imgs.filter((i) => i.hasAlt && !i.alt).length],
    ["no width and height", imgs.filter((i) => !i.widthAttr || !i.heightAttr).length],
    ["lazy loaded", imgs.filter((i) => i.loading === "lazy").length],
    ["uses srcset", imgs.filter((i) => i.srcset).length],
    ["webp or avif", imgs.filter((i) => ["webp", "avif"].includes(i.ext)).length],
  ])]));

  const sd = s.structuredData;
  const types = [];
  for (const b of sd.jsonLd || []) {
    if (!b.ok) { types.push("parse error: " + b.error); continue; }
    for (const n of [].concat(b.data["@graph"] || b.data)) if (n && n["@type"]) types.push([].concat(n["@type"]).join(", "));
  }
  nodes.push(card("Structured data", (sd.jsonLd || []).length, [
    types.length ? kv(types.map((t, i) => ["block " + (i + 1), t])) : el("p", { class: "empty", text: "No JSON-LD found." }),
    kv([["microdata items", sd.microdataItems], ["RDFa items", sd.rdfaItems]]),
  ]));

  if ((s.hreflang || []).length) {
    nodes.push(card("Hreflang", s.hreflang.length, [kv(s.hreflang.map((h) => [h.hreflang, h.href]))]));
  }
  return nodes;
}

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
  const order = { fail: 0, warn: 1, note: 2, pass: 3 };
  nodes.push(...state.result.ai.findings.slice().sort((a, b) => order[a.severity] - order[b.severity]).map((f) => findingEl(f, false)));
  if (state.net.extras) nodes.push(card("What was fetched", null, [kv(state.net.extras)], true));
  return nodes;
}

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
  const c = counts(allFindings());
  for (const v of VIEWS) {
    const tab = el("button", { class: "tab", type: "button", role: "tab",
                               "aria-selected": String(state.view === v.id), text: v.label });
    if (v.id === "issues" && (c.fail || c.warn)) {
      tab.appendChild(el("span", { class: "badge " + (c.fail ? "fail" : "warn"), text: String(c.fail || c.warn) }));
    }
    if (v.id === "tech" && state.result.tech) tab.appendChild(el("span", { class: "badge", text: String(state.result.tech.trackers.length) }));
    tab.addEventListener("click", () => { state.view = v.id; remember.set("view", v.id); render(); });
    nav.appendChild(tab);
  }
}

function render() {
  const t0 = performance.now();
  const run = $("run");
  run.textContent = state.running ? "Checking..." : "Run site checks";
  run.disabled = state.running || !state.snapshot;
  renderTabs();
  out.textContent = "";
  if (!state.snapshot) { state.timing.render = Math.round(performance.now() - t0); return; }
  const nodes = state.view === "page" ? viewPage()
    : state.view === "tech" ? viewTech()
    : state.view === "ai" ? viewAi()
    : state.view === "data" ? viewData()
    : viewIssues();
  const frag = document.createDocumentFragment();
  for (const n of nodes) frag.appendChild(n);
  out.appendChild(frag);
  out.scrollTop = 0;
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

// ---------- site checks (the only part that touches the network) ----------
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
