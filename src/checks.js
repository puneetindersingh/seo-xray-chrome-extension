/**
 * On-page SEO rules.
 *
 * Pure: a snapshot in, findings out. Nothing here touches the DOM or the network,
 * which is what lets a snapshot taken an hour ago be re-scored without revisiting
 * the site, and lets every rule be tested in node.
 *
 * Every finding carries a fix. A rule that cannot say what to do about it is not
 * worth showing, so it does not get written.
 *
 * severity: fail    something is broken or costing traffic now
 *           warn    worth a look, usually a judgement call
 *           note    context, or a small improvement
 *           pass    checked and fine, shown so silence is not mistaken for a gap
 */
(function (root) {
  "use strict";

  const F = (severity, area, id, title, detail, fix) => ({ severity, area, id, title, detail, fix: fix || null });
  const list = (xs, n = 3) => xs.slice(0, n).join(", ") + (xs.length > n ? ` and ${xs.length - n} more` : "");

  // Rough pixel widths, used only when the panel has not measured for real.
  const TITLE_PX_LIMIT = 580;
  const DESC_PX_LIMIT = 960;

  function indexability(s, extra = {}) {
    const out = [];
    const robots = (s.robotsMeta.content || "").toLowerCase();
    const googlebot = (s.googlebotMeta.content || "").toLowerCase();
    const xrobots = (extra.xRobotsTag || "").toLowerCase();
    const directives = [robots, googlebot, xrobots].join(" ");

    if (/\bnoindex\b/.test(directives)) {
      const where = /\bnoindex\b/.test(xrobots) ? "the X-Robots-Tag header" : "the robots meta tag";
      out.push(F("fail", "indexability", "index.noindex", "This page is set to noindex",
        `${where} says noindex, so it will be dropped from search results.`,
        "Remove the directive if the page is meant to rank. Staging rules left on a live site are the usual cause."));
    } else if (s.robotsMeta.count || xrobots) {
      out.push(F("pass", "indexability", "index.indexable", "The page allows indexing",
        `Directives: ${[robots, xrobots].filter(Boolean).join(" · ") || "none"}.`, null));
    }
    if (/\bnofollow\b/.test(directives)) {
      out.push(F("warn", "indexability", "index.nofollow", "Every link on this page is nofollow",
        "A page-level nofollow stops link value passing anywhere, including to your own pages.",
        "Drop it unless this is deliberate. Per-link rel is the finer tool."));
    }
    for (const d of ["noarchive", "nosnippet", "noimageindex"]) {
      if (directives.includes(d)) {
        out.push(F("note", "indexability", "index." + d, `${d} is set`,
          d === "nosnippet" ? "Google cannot show a description, which usually costs clicks."
            : d === "noimageindex" ? "Images on this page stay out of image search."
            : "Cached copies are suppressed.", null));
      }
    }
    if (/max-snippet:\s*0/.test(directives)) {
      out.push(F("warn", "indexability", "index.max-snippet-zero", "max-snippet is set to 0",
        "That forbids a text snippet, so the result shows almost nothing.",
        "Use max-snippet:-1 unless there is a licensing reason not to."));
    }

    if (s.canonical.count === 0) {
      out.push(F("warn", "indexability", "canon.missing", "No canonical tag",
        "Without one, any URL that serves this page can be treated as its own page.",
        "Add a self-referencing canonical with the absolute URL."));
    } else if (s.canonical.count > 1) {
      out.push(F("fail", "indexability", "canon.multiple", `${s.canonical.count} canonical tags`,
        `Conflicting: ${list(s.canonical.all.filter(Boolean))}. Google ignores the lot when they disagree.`,
        "Leave exactly one. Two SEO plugins fighting is the usual cause."));
    } else {
      const here = s.url.split("#")[0];
      const canon = (s.canonical.href || "").split("#")[0];
      if (s.canonical.raw && !/^https?:/i.test(s.canonical.raw)) {
        out.push(F("note", "indexability", "canon.relative", "The canonical is a relative URL",
          `Written as "${s.canonical.raw}". It resolves, but the spec asks for an absolute URL.`,
          "Output the full https URL."));
      }
      let sameHost = true;
      try { sameHost = new URL(canon).host === s.host; } catch { /* leave true */ }
      if (!sameHost) {
        out.push(F("warn", "indexability", "canon.cross-domain", "The canonical points at another domain",
          `This page hands its ranking to ${canon}.`,
          "Correct unless this really is syndicated content."));
      } else if (canon !== here) {
        out.push(F("warn", "indexability", "canon.other", "The canonical points at a different URL",
          `This page asks to be indexed as ${canon}.`,
          "Right for a filtered or paginated view. Wrong if this page has content of its own."));
      } else {
        out.push(F("pass", "indexability", "canon.self", "Self-referencing canonical", canon, null));
      }
    }

    if (s.metaRefresh) {
      out.push(F("warn", "indexability", "index.meta-refresh", "The page uses a meta refresh redirect",
        `Set to "${s.metaRefresh}". Search engines handle it poorly and users cannot go back.`,
        "Use a 301 redirect on the server instead."));
    }
    if (s.protocol === "http:") {
      out.push(F("fail", "indexability", "index.http", "The page is served over http",
        "No encryption, a browser warning, and https has been a ranking signal for years.",
        "Move to https and redirect http to it."));
    }
    return out;
  }

  function meta(s, extra = {}) {
    const out = [];
    const t = s.title.text;
    if (!t) {
      out.push(F("fail", "meta", "title.missing", "No title tag",
        "The title is the headline of the search result and the strongest on-page signal there is.",
        "Write one: the subject first, the brand last, around 55 characters."));
    } else {
      if (s.title.count > 1) {
        out.push(F("warn", "meta", "title.multiple", `${s.title.count} title tags`,
          `Google reads the first: "${s.title.all[0]}".`, "Leave one."));
      }
      const px = extra.titlePx || Math.round(t.length * 9.2);
      if (px > TITLE_PX_LIMIT) {
        out.push(F("warn", "meta", "title.long", `The title is too long for the result (${t.length} chars)`,
          `About ${px}px wide, the cut-off is near ${TITLE_PX_LIMIT}px, so the end gets truncated.`,
          "Move the important words to the front and shorten the tail."));
      } else if (t.length < 30) {
        out.push(F("warn", "meta", "title.short", `The title is only ${t.length} characters`,
          "There is room left that could carry another term someone searches for.", "Expand it."));
      } else {
        out.push(F("pass", "meta", "title.ok", `Title is ${t.length} characters`, t, null));
      }
      const h1 = (s.headings.find((h) => h.level === 1) || {}).text;
      if (h1 && h1.trim() === t.trim()) {
        out.push(F("note", "meta", "title.same-as-h1", "The title and the H1 are identical",
          "Two chances to say something, used once.", "Let the title chase the search term and the H1 speak to the reader."));
      }
    }

    const d = s.description.content;
    if (!d) {
      out.push(F("warn", "meta", "desc.missing", "No meta description",
        "Google writes its own from the page, and it is usually worse than yours would be.",
        "Write 150 characters that say what the page gives and why to click."));
    } else {
      if (s.description.count > 1) {
        out.push(F("warn", "meta", "desc.multiple", `${s.description.count} meta descriptions`, "Only the first counts.", "Leave one."));
      }
      const px = extra.descPx || Math.round(d.length * 6.6);
      if (px > DESC_PX_LIMIT) {
        out.push(F("warn", "meta", "desc.long", `The description will be cut short (${d.length} chars)`,
          `About ${px}px, the cut-off is near ${DESC_PX_LIMIT}px.`, "Put the point in the first sentence."));
      } else if (d.length < 70) {
        out.push(F("warn", "meta", "desc.short", `The description is only ${d.length} characters`,
          "Short descriptions leave the result looking thin next to the ones around it.", "Use the space."));
      } else {
        out.push(F("pass", "meta", "desc.ok", `Description is ${d.length} characters`, d, null));
      }
    }

    if (!s.viewport) {
      out.push(F("fail", "meta", "meta.viewport", "No viewport tag",
        "The page renders at desktop width on a phone and gets treated as not mobile friendly.",
        'Add <meta name="viewport" content="width=device-width, initial-scale=1">.'));
    }
    if (!s.lang) {
      out.push(F("warn", "meta", "meta.lang", "The html tag has no lang attribute",
        "Screen readers and translation tools both read it, and so do search engines.",
        'Set it, for example lang="en-AU".'));
    }
    if (!s.charset && !s.metaCharset) {
      out.push(F("note", "meta", "meta.charset", "No character set declared", "Accented characters can render as rubbish.", 'Add <meta charset="utf-8"> as the first thing in the head.'));
    }

    const og = s.og || {};
    const missingOg = ["og:title", "og:description", "og:image"].filter((k) => !og[k]);
    if (missingOg.length === 3) {
      out.push(F("warn", "meta", "og.missing", "No Open Graph tags",
        "Shares on social and in chat apps fall back to whatever the platform scrapes, which is rarely what you would choose.",
        "Add og:title, og:description and og:image."));
    } else if (missingOg.length) {
      // No image is the gap people notice: the share turns into a grey box.
      out.push(F(missingOg.includes("og:image") ? "warn" : "note", "meta", "og.partial", `Open Graph is missing ${missingOg.join(", ")}`,
        missingOg.includes("og:image") ? "Without an image the share is a grey box." : "Partial tags give an inconsistent preview.",
        "Fill the gaps."));
    }
    if (og["og:url"] && s.canonical.href && og["og:url"].split("#")[0] !== s.canonical.href.split("#")[0]) {
      out.push(F("warn", "meta", "og.url-mismatch", "og:url and the canonical disagree",
        `og:url is ${og["og:url"]}, canonical is ${s.canonical.href}.`, "Point both at the same URL."));
    }
    return out;
  }

  /**
   * Per-heading marks for the outline view. The aggregate heading findings below
   * are counted from these same marks, so a row and the Issues tab can never
   * disagree about what is wrong.
   */
  function markHeadings(s) {
    const heads = s.headings || [];
    const h1Total = heads.filter((h) => h.level === 1).length;
    let h1Seen = 0;
    let prev = null;   // last visible heading with text, which is what the skip rule compares against
    return heads.map((h) => {
      const marks = [];
      if (h.level === 1) {
        h1Seen++;
        if (h1Seen > 1) marks.push({ severity: "warn", id: "h1.multiple", label: "extra H1" });
      }
      if (h.hidden) {
        marks.push({ severity: null, id: "head.hidden", label: "hidden" });
      } else if (h.empty) {
        // The only H1 being empty is its own failure; any other empty tag is builder litter.
        const soleH1 = h.level === 1 && h1Total === 1;
        marks.push({ severity: soleH1 ? "fail" : "note", id: soleH1 ? "h1.empty" : "head.empty", label: "empty" });
      } else {
        if (prev !== null && h.level - prev > 1) {
          marks.push({ severity: "note", id: "head.skipped", label: `skips from H${prev}`, from: prev });
        }
        prev = h.level;
      }
      if (h.region && !["main", "body"].includes(h.region)) marks.push({ severity: null, id: "head.region", label: h.region });
      return { heading: h, marks };
    });
  }

  function content(s) {
    const out = [];
    const rows = markHeadings(s);
    const h1s = s.headings.filter((h) => h.level === 1);
    if (!h1s.length) {
      out.push(F("fail", "content", "h1.missing", "No H1",
        "Nothing on the page states what it is about in the one place readers and crawlers both look.",
        "Add one H1 carrying the page's subject."));
    } else if (h1s.length > 1) {
      out.push(F("warn", "content", "h1.multiple", `${h1s.length} H1 headings`,
        `"${list(h1s.map((h) => h.text).filter(Boolean), 2)}". The page is claiming to be about several things at once.`,
        "Keep one. Demote the rest to H2."));
    } else if (!h1s[0].text) {
      out.push(F("fail", "content", "h1.empty", "The H1 is empty",
        "The tag is there with no words in it, often because it holds only a logo image.",
        "Put the page's subject in it, or move the H1 to the real headline."));
    } else {
      out.push(F("pass", "content", "h1.ok", "One H1", h1s[0].text, null));
    }

    const empties = rows.filter((r) => r.marks.some((m) => m.id === "head.empty"));
    if (empties.length) {
      out.push(F("note", "content", "head.empty", `${empties.length} empty heading tag${empties.length > 1 ? "s" : ""}`,
        "Heading tags with no text, usually left behind by a page builder.", "Remove them or fill them."));
    }
    const skips = [];
    for (const r of rows) for (const m of r.marks) if (m.id === "head.skipped") skips.push(`H${m.from} to H${r.heading.level}`);
    if (skips.length) {
      out.push(F("note", "content", "head.skipped", `The heading order skips a level (${list(skips, 2)})`,
        "The outline is what a machine reads to work out how the page is organised.",
        "Step down one level at a time."));
    }

    const words = s.content.mainWords || s.content.bodyWords;
    if (words < 150) {
      out.push(F("warn", "content", "content.thin", `Only ${words} words on the page`,
        "There is not much here to rank, and not much for an answer engine to quote.",
        "If this page is meant to earn traffic, it needs the substance to."));
    } else if (words < 300) {
      out.push(F("note", "content", "content.short", `${words} words`,
        "Short for a page expected to compete, though fine for a contact or thank you page.", null));
    } else {
      out.push(F("pass", "content", "content.ok", `${words} words`, null, null));
    }
    if (!s.content.hasMain) {
      out.push(F("note", "content", "content.no-main", "No main or article element",
        "Nothing marks where the content starts, so boilerplate and content read as one block.",
        "Wrap the content in <main> or <article>."));
    }
    return out;
  }

  const GENERIC_ANCHORS = /^(click here|here|read more|learn more|more|this|link|find out more|see more|details|view)$/i;
  const isNofollow = (l) => /(^|\s)nofollow(\s|$)/i.test(l.rel || "");
  const LINK_TESTS = {
    noText: (l) => l.kind === "link" && !l.text && !l.ariaLabel && !l.hasImage,
    generic: (l) => l.kind === "link" && GENERIC_ANCHORS.test((l.text || "").trim()),
    internalNofollow: (l) => l.kind === "link" && l.internal === true && isNofollow(l),
    noHref: (l) => l.kind === "no-href",
  };

  /** Per-link marks for the links view, built from the same tests as the findings. */
  function markLinks(s) {
    return (s.links || []).map((l) => {
      const marks = [];
      if (LINK_TESTS.noHref(l)) marks.push({ severity: "note", id: "link.no-href", label: "no href" });
      if (LINK_TESTS.noText(l)) marks.push({ severity: "warn", id: "link.no-text", label: "no anchor text" });
      if (LINK_TESTS.internalNofollow(l)) marks.push({ severity: "warn", id: "link.internal-nofollow", label: "nofollow" });
      else if (isNofollow(l)) marks.push({ severity: null, id: "link.nofollow", label: "nofollow" });
      for (const r of ["sponsored", "ugc"]) if (new RegExp(`(^|\\s)${r}(\\s|$)`, "i").test(l.rel || "")) marks.push({ severity: null, id: "link." + r, label: r });
      if (LINK_TESTS.generic(l)) marks.push({ severity: "note", id: "link.generic", label: "generic anchor" });
      return { link: l, marks };
    });
  }

  function links(s) {
    const out = [];
    const real = s.links.filter((l) => l.kind === "link");
    const internal = real.filter((l) => l.internal === true);
    const noText = real.filter(LINK_TESTS.noText);
    if (noText.length) {
      out.push(F("warn", "links", "link.no-text", `${noText.length} link${noText.length > 1 ? "s have" : " has"} no anchor text`,
        `Nothing to read and nothing to click: ${list(noText.map((l) => l.href).filter(Boolean), 2)}.`,
        "Give each one visible text, or an aria-label if it is an icon."));
    }
    const generic = real.filter(LINK_TESTS.generic);
    if (generic.length > 2) {
      out.push(F("note", "links", "link.generic", `${generic.length} links say things like "read more"`,
        "Anchor text is a signal about the page being linked to, and this spends it on nothing.",
        "Say what is on the other end."));
    }
    const noFollowInternal = real.filter(LINK_TESTS.internalNofollow);
    if (noFollowInternal.length) {
      out.push(F("warn", "links", "link.internal-nofollow", `${noFollowInternal.length} internal link${noFollowInternal.length > 1 ? "s are" : " is"} nofollow`,
        `To ${list(noFollowInternal.map((l) => l.href).filter(Boolean), 2)}. Sculpting links this way has not worked for over a decade, it just wastes the link.`,
        "Remove rel=nofollow from links to your own pages."));
    }
    const jsHrefs = s.specialLinks.javascript;
    if (jsHrefs) {
      out.push(F("warn", "links", "link.javascript", `${jsHrefs} link${jsHrefs > 1 ? "s use" : " uses"} a javascript: href`,
        "Crawlers do not follow these, so whatever is on the other side is undiscoverable from here.",
        "Use a real href and attach behaviour with an event listener."));
    }
    const noHref = s.links.filter(LINK_TESTS.noHref).length;
    if (noHref > 2) {
      out.push(F("note", "links", "link.no-href", `${noHref} anchor tags have no href`,
        "An <a> without an href is not a link to anything.", "Give them one, or use a button."));
    }
    if (real.length > 300) {
      out.push(F("note", "links", "link.many", `${real.length} links on the page`,
        "Past a few hundred, each one carries less and the page gets slower to render.", null));
    }
    if (!internal.length && real.length) {
      out.push(F("warn", "links", "link.no-internal", "No internal links",
        "Nothing here points anywhere else on the site, so this page is a dead end for crawling and for readers.",
        "Link to the pages this one naturally leads to."));
    } else if (internal.length) {
      out.push(F("pass", "links", "link.ok", `${internal.length} internal and ${real.filter((l) => l.internal === false).length} external links`, null, null));
    }
    return out;
  }

  const IMAGE_TESTS = {
    // Only a live read can know: the browser finished the request and got no picture.
    // SVGs without intrinsic size also report 0, so they are left out rather than accused.
    broken: (i) => i.broken === true && i.ext !== "svg",
    noAlt: (i) => !i.hasAlt && !i.hidden,
    decorative: (i) => i.hasAlt && !i.alt,
    oversized: (i) => !!(i.naturalWidth && i.displayWidth > 20 && i.naturalWidth > i.displayWidth * 2),
    noDims: (i) => (!i.widthAttr || !i.heightAttr) && !i.hidden,
    lazyTop: (i) => i.loading === "lazy" && i.inViewport === true,
    oldFormat: (i) => ["jpg", "jpeg", "png"].includes(i.ext),
  };

  /** Per-image marks for the images view. */
  function markImages(s) {
    return (s.images || []).map((i) => {
      const marks = [];
      if (IMAGE_TESTS.broken(i)) marks.push({ severity: "fail", id: "img.broken", label: "broken" });
      if (IMAGE_TESTS.noAlt(i)) marks.push({ severity: "warn", id: "img.no-alt", label: "no alt" });
      else if (IMAGE_TESTS.decorative(i)) marks.push({ severity: null, id: "img.decorative", label: "alt=\"\"" });
      if (IMAGE_TESTS.oversized(i)) marks.push({ severity: "warn", id: "img.oversized", label: `${(i.naturalWidth / i.displayWidth).toFixed(1)}x too big` });
      if (IMAGE_TESTS.noDims(i)) marks.push({ severity: "warn", id: "img.no-dims", label: "no width/height" });
      if (IMAGE_TESTS.lazyTop(i)) marks.push({ severity: "warn", id: "img.lazy-lcp", label: "lazy above fold" });
      if (i.hidden) marks.push({ severity: null, id: "img.hidden", label: "hidden" });
      return { image: i, marks };
    });
  }

  function images(s) {
    const out = [];
    const imgs = s.images || [];
    if (!imgs.length) return out;
    const broken = imgs.filter(IMAGE_TESTS.broken);
    if (broken.length) {
      out.push(F("fail", "images", "img.broken", `${broken.length} image${broken.length > 1 ? "s" : ""} did not load`,
        `The browser asked for ${list(broken.map((i) => (i.src || "").split("/").pop()).filter(Boolean), 2)} and got nothing it could draw.`,
        "Fix the path or remove the tag. A broken image in the content reads as a neglected page."));
    }
    const noAlt = imgs.filter(IMAGE_TESTS.noAlt);
    if (noAlt.length) {
      out.push(F("warn", "images", "img.no-alt", `${noAlt.length} of ${imgs.length} images have no alt attribute`,
        `Missing on ${list(noAlt.map((i) => (i.src || "").split("/").pop()).filter(Boolean), 2)}. Screen readers announce the file name instead.`,
        'Describe what the image shows. Decorative images take alt="".'));
    } else {
      out.push(F("pass", "images", "img.alt-ok", `All ${imgs.length} images have an alt attribute`, null, null));
    }

    const oversized = imgs.filter(IMAGE_TESTS.oversized);
    if (oversized.length) {
      const worst = oversized.sort((a, b) => b.naturalWidth / b.displayWidth - a.naturalWidth / a.displayWidth)[0];
      out.push(F("warn", "images", "img.oversized", `${oversized.length} image${oversized.length > 1 ? "s are" : " is"} far larger than displayed`,
        `Worst: ${(worst.src || "").split("/").pop()} is ${worst.naturalWidth}px wide, shown at ${worst.displayWidth}px. Every visitor downloads the difference.`,
        "Serve them at the size they are shown, with srcset for other screens."));
    }
    const noDims = imgs.filter(IMAGE_TESTS.noDims);
    if (noDims.length) {
      out.push(F("warn", "images", "img.no-dims", `${noDims.length} image${noDims.length > 1 ? "s have" : " has"} no width and height`,
        "The browser cannot reserve space, so the page jumps as images load. That is what Cumulative Layout Shift measures.",
        "Put width and height attributes on every img."));
    }
    const lazyTop = imgs.filter(IMAGE_TESTS.lazyTop);
    if (lazyTop.length) {
      out.push(F("warn", "images", "img.lazy-lcp", `${lazyTop.length} image${lazyTop.length > 1 ? "s" : ""} above the fold ${lazyTop.length > 1 ? "are" : "is"} lazy loaded`,
        "Lazy loading the first thing on screen delays it, and it is usually the element Largest Contentful Paint is timing.",
        'Load the hero image eagerly, with fetchpriority="high".'));
    }
    const old = imgs.filter(IMAGE_TESTS.oldFormat);
    if (old.length > 3) {
      out.push(F("note", "images", "img.format", `${old.length} images are still jpg or png`,
        "WebP or AVIF is usually 25 to 50 percent smaller at the same quality.", "Convert them and keep a fallback."));
    }
    return out;
  }

  const REQUIRED = {
    Article: ["headline", "image", "datePublished", "author"],
    BlogPosting: ["headline", "image", "datePublished", "author"],
    NewsArticle: ["headline", "image", "datePublished", "author"],
    Product: ["name", "image", "offers"],
    LocalBusiness: ["name", "address", "telephone"],
    Organization: ["name", "url"],
    FAQPage: ["mainEntity"],
    BreadcrumbList: ["itemListElement"],
    Event: ["name", "startDate", "location"],
    Recipe: ["name", "image", "recipeIngredient"],
    Service: ["name", "provider"],
    VideoObject: ["name", "thumbnailUrl", "uploadDate"],
  };

  function schema(s) {
    const out = [];
    const blocks = s.structuredData.jsonLd || [];
    const broken = blocks.filter((b) => !b.ok);
    if (broken.length) {
      out.push(F("fail", "schema", "schema.parse", `${broken.length} JSON-LD block${broken.length > 1 ? "s do" : " does"} not parse`,
        `${broken[0].error}. A block with a syntax error is ignored completely.`,
        "Run it through the Rich Results test and fix the syntax. A trailing comma is the usual culprit."));
    }
    const nodes = [];
    for (const b of blocks) {
      if (!b.ok) continue;
      for (const n of [].concat(b.data["@graph"] || b.data)) if (n && typeof n === "object") nodes.push(n);
    }
    if (!nodes.length) {
      if (!broken.length) {
        out.push(F("warn", "schema", "schema.none", "No structured data",
          "Nothing tells a search engine what kind of page this is, so no rich result can be earned.",
          "Add the type that matches the page, then Organization for the publisher."));
      }
      return out;
    }

    const types = [];
    for (const n of nodes) types.push(...[].concat(n["@type"] || []).map(String));
    out.push(F("pass", "schema", "schema.present", `Structured data: ${[...new Set(types)].join(", ")}`, `${blocks.length} JSON-LD block${blocks.length > 1 ? "s" : ""}.`, null));

    for (const n of nodes) {
      const type = [].concat(n["@type"] || []).map(String).find((t) => REQUIRED[t]);
      if (!type) continue;
      const missing = REQUIRED[type].filter((k) => n[k] === undefined || n[k] === null || n[k] === "");
      if (missing.length) {
        out.push(F("warn", "schema", "schema.required." + type, `${type} schema is missing ${missing.join(", ")}`,
          "Google needs the required properties before it will show a rich result for this type.",
          `Add ${missing.join(", ")} to the ${type} block.`));
      }
    }
    const product = nodes.find((n) => [].concat(n["@type"] || []).includes("Product"));
    if (product && !product.offers && !product.sku && !product.gtin) {
      out.push(F("note", "schema", "schema.product-no-offer", "Product schema with no price, offer or SKU",
        "Product is for something with a price. If this page sells a service, Service is the type that fits, with the work listed in an OfferCatalog.",
        "Switch to Service, or add the offer details."));
    }
    if (!nodes.some((n) => n["@id"])) {
      out.push(F("note", "schema", "schema.no-id", "No @id on any node",
        "Without @id the blocks cannot reference each other, so the same organisation ends up described twice.",
        "Give each node a stable @id and link them."));
    }
    return out;
  }

  const LANG_RE = /^([a-z]{2,3})(-[a-zA-Z]{4})?(-([a-zA-Z]{2}|\d{3}))?$/;

  /** Each JSON-LD block with its nodes, types, and any required properties missing. */
  function markSchema(s) {
    return (s.structuredData.jsonLd || []).map((b, i) => {
      if (!b.ok) return { index: i, ok: false, error: b.error, preview: b.preview || "", nodes: [], severity: "fail" };
      const nodes = [].concat(b.data["@graph"] || b.data).filter((n) => n && typeof n === "object").map((n) => {
        const types = [].concat(n["@type"] || []).map(String);
        const type = types.find((t) => REQUIRED[t]);
        const missing = type ? REQUIRED[type].filter((k) => n[k] === undefined || n[k] === null || n[k] === "") : [];
        return { types, id: n["@id"] || null, missing, node: n };
      });
      return { index: i, ok: true, nodes, severity: nodes.some((n) => n.missing.length) ? "warn" : "pass" };
    });
  }

  /** Each hreflang tag, marked for an invalid code and for being this page. */
  function markHreflang(s) {
    const here = s.url.split("#")[0].replace(/\/$/, "");
    return (s.hreflang || []).map((t) => {
      const code = (t.hreflang || "").trim();
      const valid = code.toLowerCase() === "x-default" || LANG_RE.test(code);
      const self = (t.href || "").split("#")[0].replace(/\/$/, "") === here;
      return { tag: t, valid, self, severity: valid ? null : "warn" };
    });
  }

  /**
   * What a link status means. 404, 410, 5xx and dead hosts are broken. 401, 403,
   * 429 and LinkedIn's 999 are usually a site turning away automated requests,
   * which a real visitor would not hit, so they are flagged but not called broken.
   */
  function linkStatusVerdict(r) {
    if (!r) return null;
    if (r.error || !r.status) return { severity: "fail", label: r.error === "timed out" ? "timeout" : "failed" };
    if ([401, 403, 429, 999].includes(r.status)) return { severity: "warn", label: String(r.status) };
    if (r.status >= 400) return { severity: "fail", label: String(r.status) };
    if (r.redirected) return { severity: "warn", label: `redirect ${r.status}` };
    return { severity: "pass", label: String(r.status) };
  }

  const BOT_WALL = [401, 403, 429, 999];

  /** Findings from a finished link status check, so broken links reach Issues and the report. */
  function linkStatusFindings(results) {
    const out = [];
    const all = Object.values(results || {});
    if (!all.length) return out;
    const tagged = all.map((r) => ({ r, v: linkStatusVerdict(r) }));
    const named = (xs) => list(xs.map(({ r, v }) => `${r.url} (${v.label})`), 3);
    const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

    const broken = tagged.filter((x) => x.v.severity === "fail");
    const blocked = tagged.filter((x) => x.v.severity === "warn" && BOT_WALL.includes(x.r.status));
    const moved = tagged.filter((x) => x.v.severity === "warn" && !BOT_WALL.includes(x.r.status));
    if (broken.length) {
      out.push(F("fail", "links", "link.broken", `${plural(broken.length, "link is", "links are")} broken`,
        `${named(broken)}. Visitors hit a dead end and crawlers waste the visit.`,
        "Point each one at a live page or take it out. The internal ones are entirely yours to fix."));
    }
    if (moved.length) {
      out.push(F("warn", "links", "link.redirect", `${plural(moved.length, "link goes", "links go")} through a redirect`,
        `${named(moved)}.`, "Link straight to the final URL so nobody takes the extra hop."));
    }
    if (blocked.length) {
      out.push(F("warn", "links", "link.blocked", `${plural(blocked.length, "link", "links")} refused the automated check`,
        `${named(blocked)}. A 403 or 429 is usually a site blocking scripts, not a dead page.`,
        "Open one in a normal tab. If it loads, the link is fine."));
    }
    if (!broken.length && !moved.length && !blocked.length) {
      out.push(F("pass", "links", "link.status-ok", `All ${all.length} checked links answer directly`, null, null));
    }
    return out;
  }

  function international(s) {
    const out = [];
    const tags = s.hreflang || [];
    if (!tags.length) return out;
    const bad = tags.filter((t) => t.hreflang && t.hreflang.toLowerCase() !== "x-default" && !LANG_RE.test(t.hreflang));
    if (bad.length) {
      out.push(F("warn", "international", "hreflang.invalid", `${bad.length} hreflang value${bad.length > 1 ? "s are" : " is"} not a valid code`,
        `Invalid: ${list(bad.map((t) => t.hreflang))}. A bad code makes the whole cluster ignored.`,
        "Use a language code, optionally with a region: en, en-AU, zh-Hant-HK."));
    }
    const here = s.url.split("#")[0].replace(/\/$/, "");
    const self = tags.some((t) => (t.href || "").split("#")[0].replace(/\/$/, "") === here);
    if (!self) {
      out.push(F("warn", "international", "hreflang.no-self", "The hreflang set does not include this page",
        "Every page in a cluster has to list itself, or the set is ignored.",
        "Add a self-referencing hreflang tag."));
    }
    if (tags.length > 1 && !tags.some((t) => (t.hreflang || "").toLowerCase() === "x-default")) {
      out.push(F("note", "international", "hreflang.no-xdefault", "No x-default in the hreflang set",
        "Nothing is nominated for visitors who match none of the listed regions.", "Point x-default at your main version."));
    }
    if (!bad.length && self) {
      out.push(F("pass", "international", "hreflang.ok", `${tags.length} hreflang tags, all valid`, null, null));
    }
    return out;
  }

  function audit(s, extra = {}) {
    const findings = [
      ...indexability(s, extra), ...meta(s, extra), ...content(s),
      ...links(s), ...images(s), ...schema(s), ...international(s),
    ];
    const order = { fail: 0, warn: 1, note: 2, pass: 3 };
    findings.sort((a, b) => order[a.severity] - order[b.severity]);
    const count = (x) => findings.filter((f) => f.severity === x).length;
    return { findings, score: { fail: count("fail"), warn: count("warn"), note: count("note"), pass: count("pass") } };
  }

  const api = {
    audit, indexability, meta, content, links, images, schema, international, REQUIRED,
    markHeadings, markLinks, markImages, markSchema, markHreflang, linkStatusVerdict, linkStatusFindings, isNofollow,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SEOChecks = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
