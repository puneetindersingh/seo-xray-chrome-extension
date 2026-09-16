/**
 * Technology and tracking detection.
 *
 * The signature catalogue lives in src/catalogue.js. It is data, not logic: adding
 * a tool to watch for means adding a pattern there, never touching this file.
 *
 * What this does that a scan of the HTML cannot: it sees the requests the page
 * actually made. A tag fired by a container at runtime appears in no HTML source,
 * which is exactly where an HTML-only scan goes blind.
 *
 * Pure functions. Catalogue and text in, findings out.
 */
(function (root) {
  "use strict";

  /**
   * @param cat  the catalogue object
   * @param sources {label: text} - every place a fingerprint might appear
   */
  function detectTrackers(cat, sources) {
    const found = [];
    for (const t of cat.trackers) {
      const hitSources = [];
      const ids = [];
      for (const [label, text] of Object.entries(sources)) {
        if (!text) continue;
        if (!t.patterns.some((p) => new RegExp(p, "i").test(text))) continue;
        hitSources.push(label);
        // ID extraction is case SENSITIVE on purpose. Platform ids (GTM-, G-, AW-,
        // UA-, ca-pub-) are fixed case, and matching loosely turns a string like
        // "gtm-loader" into a container that does not exist.
        for (const idp of t.id_patterns) {
          for (const m of text.matchAll(new RegExp(idp, "g"))) {
            if (m[1] && !ids.includes(m[1])) ids.push(m[1]);
          }
        }
      }
      if (hitSources.length) {
        found.push({
          key: t.key, name: t.name, category: t.category,
          ids: ids.slice(0, 10), sources: hitSources, dead: t.dead || "",
        });
      }
    }
    const order = Object.keys(cat.categories);
    found.sort((a, b) => {
      const ai = order.indexOf(a.category), bi = order.indexOf(b.category);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.name.localeCompare(b.name);
    });
    return found;
  }

  /**
   * CMS, builder, framework. Ordered deliberately: the
   * porter hashes that function and warns when it drifts from this list.
   */
  const CMS_RULES = [
    { test: "/wp-content/|/wp-includes/|wp-json", name: "WordPress", details: "wordpressDetails" },
    { test: "cdn\\.shopify\\.com|myshopify\\.com", name: "Shopify" },
    { test: "static\\.parastorage\\.com|wixstatic\\.com|wix\\.com", name: "Wix" },
    { test: "squarespace\\.com|static1\\.squarespace", name: "Squarespace" },
    { test: "assets(?:-global)?\\.website-files\\.com|data-wf-site", name: "Webflow" },
    { test: "cdn\\.dudamobile\\.com|dudaone|_duda_", name: "Duda" },
    { test: "bigcommerce\\.com|cdn\\d+\\.bigcommerce", name: "BigCommerce" },
    { test: "/static/version\\d+/frontend/|Mage\\.Cookies|mage-init|data-mage-init|/mage/|\"Magento_|x-magento",
      name: "Magento (Adobe Commerce)", caseSensitive: true },
    { test: "framerusercontent\\.com", name: "Framer" },
  ];

  function detectPlatform(cat, html, headers, snapshot) {
    const h = html || "";
    const hl = {};
    for (const [k, v] of Object.entries(headers || {})) hl[k.toLowerCase()] = v;
    const out = {
      cms: "", detail: [],
      generator: (snapshot && snapshot.page && snapshot.page.generator) || "",
      server: hl["server"] || "",
      poweredBy: hl["x-powered-by"] || "",
    };
    const add = (d) => { if (d && !out.detail.includes(d)) out.detail.push(d); };

    for (const rule of CMS_RULES) {
      if (!new RegExp(rule.test, rule.caseSensitive ? "" : "i").test(h)) continue;
      out.cms = rule.name;
      if (rule.name === "WordPress") {
        if (out.generator.toLowerCase().startsWith("wordpress")) add(out.generator);
        const theme = h.match(/\/wp-content\/themes\/([a-zA-Z0-9_-]+)\//);
        if (theme) add("Theme: " + theme[1]);
        for (const [pat, label] of cat.wordpressDetails) {
          if (new RegExp(pat, "i").test(h)) add(label);
        }
      }
      if (rule.name === "Shopify") {
        const theme = h.match(/"name":"([^"]+)","theme_store_id"/);
        if (theme) add("Theme: " + theme[1]);
      }
      break;
    }
    if (!out.cms && out.generator) out.cms = out.generator;

    for (const [pat, label] of cat.frameworks) {
      if (new RegExp(pat).test(h)) add("Framework: " + label);
    }
    return out;
  }

  function verifications(cat, snapshot) {
    const meta = (snapshot && snapshot.otherMeta) || {};
    const out = [];
    for (const [key, label] of cat.verifications) {
      const hit = Object.keys(meta).find((k) => k.toLowerCase() === key.toLowerCase());
      if (hit) out.push({ platform: label, meta: key, value: String(meta[hit]).slice(0, 60) });
    }
    return out;
  }

  const SOCIAL_JUNK = /\/sharer|\/share\b|share\?|\/intent\/|\/plugins\/|\/dialog\/|\/hashtag\/|facebook\.com\/tr\b|\/login|\.js\b|\/embed\//i;

  function socials(cat, snapshot) {
    const urls = (snapshot.links || []).map((l) => l.href).filter(Boolean);
    for (const b of snapshot.structuredData.jsonLd || []) {
      if (!b.ok) continue;
      for (const n of [].concat(b.data["@graph"] || b.data)) {
        if (n && n.sameAs) urls.push(...[].concat(n.sameAs));
      }
    }
    const seen = new Map();
    for (const u of urls) {
      if (SOCIAL_JUNK.test(u)) continue;
      let host;
      try { host = new URL(u).host.replace(/^www\./, ""); } catch { continue; }
      const platform = cat.socials[host];
      if (!platform || seen.has(platform)) continue;
      seen.set(platform, { platform, url: u });
    }
    return [...seen.values()];
  }

  function securityGrade(cat, headers, isHttps) {
    if (!headers || !Object.keys(headers).length) return null;
    const hl = {};
    for (const [k, v] of Object.entries(headers)) hl[k.toLowerCase()] = v;
    const present = cat.securityHeaders.filter(([k]) => k in hl).map(([, l]) => l);
    const missing = cat.securityHeaders.filter(([k]) => !(k in hl)).map(([, l]) => l);
    const n = present.length + (isHttps ? 1 : 0);
    const grade = n >= 7 ? "A+" : n >= 6 ? "A" : n >= 5 ? "B" : n >= 4 ? "C" : n >= 2 ? "D" : "F";
    return { grade, https: !!isHttps, present, missing };
  }

  /** Container URLs worth fetching so tags fired through a tag manager get seen. */
  function containerUrls(trackers) {
    const urls = [];
    for (const t of trackers) {
      if (t.key !== "gtm" && t.key !== "ga4" && t.key !== "google_ads") continue;
      for (const id of t.ids) {
        if (/^GTM-/.test(id)) urls.push(`https://www.googletagmanager.com/gtm.js?id=${id}`);
        else if (/^G-/.test(id)) urls.push(`https://www.googletagmanager.com/gtag/js?id=${id}`);
      }
    }
    return [...new Set(urls)].slice(0, 5);
  }

  /** The plain sentence at the top of the card. */
  function summarise(trackers, hosts) {
    const ads = trackers.filter((t) => t.category === "advertising").length;
    const dead = trackers.filter((t) => t.dead).length;
    const thirdParty = hosts.filter((h) => h.thirdParty).length;
    const level = trackers.length >= 12 ? "Heavily instrumented"
      : trackers.length >= 5 ? "Moderately instrumented"
      : trackers.length ? "Lightly instrumented" : "No tracking found";
    const bits = [`${trackers.length} tool${trackers.length === 1 ? "" : "s"}`];
    if (ads) bits.push(`${ads} ad pixel${ads === 1 ? "" : "s"}`);
    bits.push(`data to ${thirdParty} third part${thirdParty === 1 ? "y" : "ies"}`);
    const detail = bits.join(", ") + ".";
    return { level, detail, line: `${level}: ${detail}`, trackers: trackers.length, ads, dead, thirdParty };
  }

  /** Anything worth acting on, in the same shape the other cards use. */
  function findings(tech) {
    const out = [];
    const F = (severity, id, title, detail, fix) => ({ severity, id, title, detail, fix: fix || null });
    for (const t of tech.trackers.filter((x) => x.dead)) {
      out.push(F("warn", "tech.dead." + t.key, `${t.name} is still on the page`, t.dead,
        "Remove the tag. It collects nothing and it slows the page down."));
    }
    const dupes = tech.trackers.filter((t) => t.ids.length > 1);
    for (const t of dupes) {
      out.push(F("warn", "tech.dupe." + t.key, `${t.name} has ${t.ids.length} IDs on one page`,
        `Found: ${t.ids.join(", ")}. Two of the same tag usually means doubled events or split reporting.`,
        "Work out which one is the live property and remove the rest."));
    }
    const runtimeOnly = tech.trackers.filter((t) => t.sources.length === 1 && t.sources[0] === "requests");
    if (runtimeOnly.length) {
      out.push(F("note", "tech.runtime-only", `${runtimeOnly.length} tool${runtimeOnly.length === 1 ? "" : "s"} fire only at runtime`,
        `${runtimeOnly.map((t) => t.name).join(", ")}. Nothing in the HTML shows these, they were caught by watching what the page requested.`,
        null));
    }
    if (tech.security && ["D", "F"].includes(tech.security.grade)) {
      out.push(F("warn", "tech.security", `Security headers grade ${tech.security.grade}`,
        `Missing: ${tech.security.missing.join(", ")}.`,
        "HSTS and X-Content-Type-Options are one line each in the server config."));
    }
    if (!tech.trackers.some((t) => t.category === "analytics")) {
      out.push(F("note", "tech.no-analytics", "No analytics tool found",
        "Nothing on this page is measuring traffic.", null));
    }
    return out;
  }

  const api = { detectTrackers, detectPlatform, verifications, socials, securityGrade, containerUrls, summarise, findings, CMS_RULES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SEOTech = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
