/**
 * Page snapshot extractor.
 *
 * ONE implementation, TWO callers:
 *   live   - injected into the tab by extract-inject.js, measures layout as well
 *   static - run in the panel over a DOMParser document built from the raw HTML,
 *            which is exactly what a crawler that does not run JavaScript receives
 *
 * Both produce the same shape, so they can be diffed field by field. Layout-only
 * values (rendered size, visibility, viewport) are null in a static snapshot
 * because nothing has been laid out, and saying null is honest where guessing is not.
 *
 * Rules for this file:
 *   - It only READS. It never touches the page it is measuring.
 *   - It returns plain JSON-safe values. No DOM nodes, no functions, no undefined.
 *   - It makes no judgements. Every "is this bad" decision belongs in checks.js,
 *     so the same snapshot can be re-scored later without re-visiting the page.
 */
globalThis.__seoExtract = function buildSnapshot(doc, opts = {}) {
  const live = opts.live !== false;
  const pageUrl = opts.url || (live ? doc.location.href : "");
  const win = live ? (doc.defaultView || globalThis) : null;

  // A <base href> in a parsed document resolves against the extension page, so the
  // raw attribute is resolved against the page URL by hand instead.
  const baseEl = doc.querySelector("base[href]");
  let baseUrl = pageUrl;
  if (baseEl) {
    try { baseUrl = new URL(baseEl.getAttribute("href"), pageUrl).href; } catch { /* keep pageUrl */ }
  }

  const MAX_TEXT = 300;
  const t = (s, n = MAX_TEXT) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
  const attr = (el, name) => (el && el.getAttribute(name)) || null;

  const abs = (href) => {
    if (!href) return null;
    try {
      return new URL(href, baseUrl).href;
    } catch {
      return null;
    }
  };

  const hidden = (el) => {
    if (!live) return null;   // nothing has been laid out, so nothing can be called hidden
    try {
      if (el.hidden) return true;
      const cs = win.getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return true;
      const r = el.getBoundingClientRect();
      return r.width === 0 && r.height === 0;
    } catch {
      return false;
    }
  };

  const region = (el) => {
    if (el.closest("nav, [role=navigation]")) return "nav";
    if (el.closest("footer, [role=contentinfo]")) return "footer";
    if (el.closest("header, [role=banner]")) return "header";
    if (el.closest("aside, [role=complementary]")) return "aside";
    if (el.closest("main, article, [role=main]")) return "main";
    return "body";
  };

  const metaBy = (selector) => {
    const els = [...doc.querySelectorAll(selector)];
    return {
      count: els.length,
      content: els.length ? (els[0].getAttribute("content") || "") : null,
      all: els.map((e) => e.getAttribute("content") || ""),
    };
  };

  // ---------- text ----------
  const textOf = (root) => {
    if (!root) return "";
    const clone = root.cloneNode(true);
    clone.querySelectorAll("script, style, noscript, template, svg").forEach((n) => n.remove());
    return (clone.textContent || "").replace(/\s+/g, " ").trim();
  };
  const words = (s) => (s ? s.split(/\s+/).filter(Boolean).length : 0);

  const mainEl =
    doc.querySelector("main, [role=main]") ||
    doc.querySelector("article") ||
    null;
  const bodyText = textOf(doc.body);
  const mainText = mainEl ? textOf(mainEl) : "";
  const html = doc.documentElement ? doc.documentElement.outerHTML : "";

  // ---------- content shape ----------
  // Which passages an answer engine can lift cleanly: short paragraphs, real lists,
  // real tables, headings phrased as the question someone actually typed.
  const QUESTION = /^(who|what|when|where|why|how|which|can|do|does|is|are|should|will)\b/i;
  const scope = mainEl || doc.body || doc.documentElement;
  const paras = scope ? [...scope.querySelectorAll("p")].map((el) => words(textOf(el))) : [];
  const contentShape = {
    paragraphs: paras.length,
    firstParagraphWords: paras.find((n) => n > 0) || 0,
    longestParagraphWords: paras.length ? Math.max(...paras) : 0,
    paragraphsOver120Words: paras.filter((n) => n > 120).length,
    lists: scope ? scope.querySelectorAll("ul, ol").length : 0,
    listItems: scope ? scope.querySelectorAll("li").length : 0,
    tables: scope ? scope.querySelectorAll("table").length : 0,
    definitionLists: scope ? scope.querySelectorAll("dl").length : 0,
    blockquotes: scope ? scope.querySelectorAll("blockquote").length : 0,
    timeElements: [...(scope ? scope.querySelectorAll("time[datetime]") : [])].map((el) => el.getAttribute("datetime")).slice(0, 10),
    contentInIframes: scope ? scope.querySelectorAll("iframe").length : 0,
  };

  // ---------- head ----------
  const titleEls = [...doc.querySelectorAll("head title")];
  const canonicalEls = [...doc.querySelectorAll('link[rel~="canonical" i]')];

  const og = {};
  const twitter = {};
  const otherMeta = {};
  doc.querySelectorAll("meta").forEach((m) => {
    const key = (attr(m, "property") || attr(m, "name") || "").toLowerCase();
    const val = m.getAttribute("content");
    if (!key || val === null) return;
    if (key.startsWith("og:") || key.startsWith("article:") || key.startsWith("product:")) og[key] = t(val, 500);
    else if (key.startsWith("twitter:")) twitter[key] = t(val, 500);
    else if (!["description", "robots", "googlebot", "viewport", "keywords"].includes(key)) otherMeta[key] = t(val, 300);
  });

  // ---------- structured data ----------
  const jsonLd = [];
  doc.querySelectorAll('script[type="application/ld+json" i]').forEach((s, i) => {
    const raw = s.textContent || "";
    try {
      jsonLd.push({ index: i, ok: true, data: JSON.parse(raw), bytes: raw.length });
    } catch (e) {
      jsonLd.push({ index: i, ok: false, error: String(e.message || e), bytes: raw.length, preview: t(raw, 200) });
    }
  });

  // ---------- headings ----------
  const headings = [...doc.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => ({
    level: Number(h.tagName[1]),
    text: t(h.textContent, 200),
    empty: !t(h.textContent).length,
    hidden: hidden(h),
    region: region(h),
  }));

  // ---------- links ----------
  const here = (() => { try { return new URL(pageUrl); } catch { return { host: "", origin: "", pathname: "", search: "", hash: "", protocol: "" }; } })();
  const links = [];
  const specialLinks = { mailto: 0, tel: 0, javascript: 0, fragment: 0 };
  doc.querySelectorAll("a").forEach((a) => {
    const raw = a.getAttribute("href");
    if (raw === null) {
      links.push({
        href: null, raw: null, kind: "no-href", text: t(a.textContent, 120),
        rel: t(attr(a, "rel"), 120), target: attr(a, "target"),
        internal: null, region: region(a), hidden: hidden(a),
        hasImage: !!a.querySelector("img"), ariaLabel: t(attr(a, "aria-label"), 120),
      });
      return;
    }
    const lower = raw.trim().toLowerCase();
    if (lower.startsWith("mailto:")) return void specialLinks.mailto++;
    if (lower.startsWith("tel:")) return void specialLinks.tel++;
    if (lower.startsWith("javascript:")) return void specialLinks.javascript++;
    if (lower.startsWith("#")) return void specialLinks.fragment++;

    const href = abs(raw);
    let internal = null;
    try {
      internal = href ? new URL(href).host === here.host : null;
    } catch { /* leave null */ }

    links.push({
      href,
      raw: t(raw, 300),
      kind: "link",
      text: t(a.textContent, 120),
      rel: t(attr(a, "rel"), 120),
      target: attr(a, "target"),
      internal,
      region: region(a),
      hidden: hidden(a),
      hasImage: !!a.querySelector("img"),
      ariaLabel: t(attr(a, "aria-label"), 120),
    });
  });

  // ---------- images ----------
  const images = [...doc.querySelectorAll("img")].map((img) => {
    const r = live ? img.getBoundingClientRect() : null;
    const src = abs(img.currentSrc || img.getAttribute("src"));
    let ext = null;
    try {
      ext = src ? (new URL(src).pathname.split(".").pop() || "").toLowerCase().slice(0, 5) : null;
    } catch { /* data: urls etc */ }
    return {
      src,
      isData: !!(img.getAttribute("src") || "").startsWith("data:"),
      ext,
      alt: img.hasAttribute("alt") ? t(img.getAttribute("alt"), 200) : null,
      hasAlt: img.hasAttribute("alt"),
      title: t(attr(img, "title"), 120),
      loading: attr(img, "loading"),
      decoding: attr(img, "decoding"),
      widthAttr: attr(img, "width"),
      heightAttr: attr(img, "height"),
      naturalWidth: live ? (img.naturalWidth || 0) : null,
      naturalHeight: live ? (img.naturalHeight || 0) : null,
      displayWidth: r ? Math.round(r.width) : null,
      displayHeight: r ? Math.round(r.height) : null,
      inViewport: r ? (r.top < win.innerHeight && r.bottom > 0 && r.width > 0) : null,
      srcset: !!img.getAttribute("srcset"),
      inPicture: !!img.closest("picture"),
      region: region(img),
      hidden: hidden(img),
    };
  });

  // ---------- alternates ----------
  const hreflang = [...doc.querySelectorAll('link[rel~="alternate" i][hreflang]')].map((l) => ({
    hreflang: attr(l, "hreflang"),
    href: abs(attr(l, "href")),
  }));

  const questionHeadings = headings.filter((h) => h.text && (h.text.trim().endsWith("?") || QUESTION.test(h.text.trim()))).length;

  // ---------- what the page loaded ----------
  // Static markup shows tags that ship in the HTML. performance entries show the
  // requests the page actually made, which is the only way to catch a tag that a
  // container injects at runtime.
  const resHosts = {};
  const noteHost = (url, how) => {
    if (!url) return;
    let h;
    try { h = new URL(url, baseUrl).host; } catch { return; }
    if (!h) return;
    const rec = resHosts[h] || (resHosts[h] = { host: h, count: 0, thirdParty: h !== here.host, how: [] });
    rec.count++;
    if (!rec.how.includes(how)) rec.how.push(how);
  };
  for (const [sel, at] of [["script[src]", "src"], ["link[href]", "href"], ["img[src]", "src"],
                           ["iframe[src]", "src"], ["source[src]", "src"], ["video[src]", "src"]]) {
    doc.querySelectorAll(sel).forEach((el) => noteHost(el.getAttribute(at), "markup"));
  }
  let requested = [];
  if (live && win && win.performance && win.performance.getEntriesByType) {
    try {
      requested = win.performance.getEntriesByType("resource").map((e) => e.name);
      requested.forEach((u) => noteHost(u, "requested"));
    } catch { /* no timeline, no loss */ }
  }

  const LINK_CAP = 5000, IMAGE_CAP = 2000;

  const snapshot = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),

    mode: live ? "live" : "static",
    url: pageUrl,
    origin: here.origin || "",
    host: here.host,
    protocol: here.protocol,
    pathname: here.pathname,
    search: here.search,
    hash: here.hash,
    baseHref: baseEl ? baseUrl : null,
    referrerPolicy: attr(doc.querySelector("meta[name=referrer i]"), "content"),

    title: { count: titleEls.length, text: titleEls.length ? t(titleEls[0].textContent, 300) : null,
             all: titleEls.map((e) => t(e.textContent, 300)) },
    description: metaBy('meta[name="description" i]'),
    keywords: metaBy('meta[name="keywords" i]'),
    robotsMeta: metaBy('meta[name="robots" i]'),
    googlebotMeta: metaBy('meta[name="googlebot" i]'),
    metaRefresh: attr(doc.querySelector('meta[http-equiv="refresh" i]'), "content"),

    canonical: {
      count: canonicalEls.length,
      href: canonicalEls.length ? abs(attr(canonicalEls[0], "href")) : null,
      raw: canonicalEls.length ? attr(canonicalEls[0], "href") : null,
      all: canonicalEls.map((l) => abs(attr(l, "href"))),
    },

    lang: attr(doc.documentElement, "lang"),
    dir: attr(doc.documentElement, "dir"),
    charset: live ? (doc.characterSet || null) : null,
    metaCharset: (doc.querySelector("meta[charset]") && doc.querySelector("meta[charset]").getAttribute("charset")) || null,
    viewport: attr(doc.querySelector("meta[name=viewport i]"), "content"),

    og, twitter, otherMeta,

    headings,
    content: {
      bodyWords: words(bodyText),
      mainWords: words(mainText),
      hasMain: !!mainEl,
      mainSelector: mainEl ? mainEl.tagName.toLowerCase() : null,
      textLength: bodyText.length,
      htmlLength: html.length,
      textRatio: html.length ? +(bodyText.length / html.length).toFixed(4) : 0,
      domNodes: doc.getElementsByTagName("*").length,
      shape: contentShape,
      questionHeadings,
      preview: t(mainText || bodyText, 400),
    },

    links: links.slice(0, LINK_CAP),
    linksTruncated: links.length > LINK_CAP,
    linkCount: links.length,
    specialLinks,
    images: images.slice(0, IMAGE_CAP),
    imagesTruncated: images.length > IMAGE_CAP,
    imageCount: images.length,
    hreflang,

    structuredData: {
      jsonLd,
      microdataItems: doc.querySelectorAll("[itemscope]").length,
      rdfaItems: doc.querySelectorAll("[typeof], [vocab]").length,
    },

    alternates: {
      amphtml: abs(attr(doc.querySelector('link[rel="amphtml" i]'), "href")),
      prev: abs(attr(doc.querySelector('link[rel~="prev" i]'), "href")),
      next: abs(attr(doc.querySelector('link[rel~="next" i]'), "href")),
      manifest: abs(attr(doc.querySelector('link[rel="manifest" i]'), "href")),
      favicons: [...doc.querySelectorAll('link[rel~="icon" i], link[rel~="apple-touch-icon" i]')]
        .map((l) => ({ rel: attr(l, "rel"), href: abs(attr(l, "href")), sizes: attr(l, "sizes") })),
    },

    loaded: {
      hosts: Object.values(resHosts).sort((a, b) => b.count - a.count),
      thirdPartyHosts: Object.values(resHosts).filter((r) => r.thirdParty).length,
      requestedUrls: requested.slice(0, 600),
      scriptUrls: [...doc.querySelectorAll("script[src]")].map((s) => abs(s.getAttribute("src"))).filter(Boolean),
      // The serialised page, inline script bodies and all. Most tracker
      // fingerprints live in here. Capped so a runaway page cannot fill memory.
      html: html.slice(0, 600000),
      htmlTruncated: html.length > 600000,
      markupLength: html.length,
    },

    page: {
      readyState: live ? doc.readyState : null,
      iframes: doc.querySelectorAll("iframe").length,
      forms: doc.querySelectorAll("form").length,
      scripts: doc.querySelectorAll("script").length,
      inlineScripts: [...doc.querySelectorAll("script")].filter((s) => !s.src).length,
      stylesheets: doc.querySelectorAll('link[rel~="stylesheet" i]').length,
      noscript: doc.querySelectorAll("noscript").length,
      passwordFields: doc.querySelectorAll('input[type="password" i]').length,
      viewportWidth: live ? win.innerWidth : null,
      viewportHeight: live ? win.innerHeight : null,
      generator: attr(doc.querySelector('meta[name="generator" i]'), "content"),
    },
  };

  return snapshot;
};
