/**
 * AI readiness scoring.
 *
 * Pure: snapshots and fetch results in, findings out. No DOM, no network.
 *
 * The question behind this whole module: most AI crawlers do not run JavaScript.
 * GPTBot, ClaudeBot, PerplexityBot and CCBot read the HTML the server sends and
 * stop there. Google renders, they do not. So comparing the raw HTML against the
 * rendered DOM tells you what an answer engine can actually quote.
 *
 * Two things this module refuses to do:
 *   - call a blocked AI crawler a fault. Plenty of sites block them on purpose.
 *     It reports the fact and says what it costs.
 *   - score llms.txt. No search engine has confirmed using it. Presence is reported,
 *     absence is not a problem.
 */
(function (root) {
  "use strict";

  const F = (severity, id, title, detail, fix) => ({ severity, id, title, detail, fix: fix || null });
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

  /** Raw HTML against rendered DOM. The core of the card. */
  function javascriptGap(live, stat) {
    const out = [];
    if (!stat) {
      out.push(F("note", "js.no-raw", "Raw HTML could not be read",
        "The page was not re-fetched, so there is nothing to compare the rendered DOM against.",
        "Open the panel again on a normal http or https page."));
      return out;
    }

    // Before anything else: are we even comparing like with like?
    if (stat.page.passwordFields > 0 && live.page.passwordFields === 0) {
      out.push(F("note", "js.logged-in", "You are logged in, the crawler is not",
        "The logged-out fetch came back with a sign-in form, so the comparison below is your session against a visitor's view, not rendered against raw.",
        "Check this page in a private window to see what a crawler receives."));
    }

    const rendered = live.content.mainWords || live.content.bodyWords;
    const raw = stat.content.mainWords || stat.content.bodyWords;
    const share = pct(raw, rendered);

    if (rendered >= 150 && share < 10) {
      out.push(F("fail", "js.content-missing", `A crawler without JavaScript sees ${share}% of this page`,
        `Rendered: ${rendered} words. In the HTML the server sends: ${raw} words. ChatGPT, Claude and Perplexity read the second number.`,
        "Server-render the main content, or pre-render it for crawlers. Client-side rendering is invisible to every AI crawler except Google's."));
    } else if (rendered >= 150 && share < 60) {
      out.push(F("warn", "js.content-partial", `Only ${share}% of the content is in the raw HTML`,
        `Rendered: ${rendered} words, raw: ${raw} words. The missing part cannot be quoted by an answer engine.`,
        "Find what is being injected after load (tabs, accordions, reviews, spec tables) and put it in the served HTML."));
    } else if (rendered > 0) {
      out.push(F("pass", "js.content-ok", `${share}% of the content is in the raw HTML`,
        `Rendered: ${rendered} words, raw: ${raw} words.`, null));
    }

    const missing = [];
    if (live.title.text && !stat.title.text) missing.push("title");
    if (live.description.content && !stat.description.content) missing.push("meta description");
    if (live.canonical.href && !stat.canonical.href) missing.push("canonical");
    if (live.headings.some((h) => h.level === 1) && !stat.headings.some((h) => h.level === 1)) missing.push("H1");
    if (missing.length) {
      out.push(F("fail", "js.head-injected", `${missing.join(", ")} only exist${missing.length === 1 ? "s" : ""} after JavaScript runs`,
        "These are written by script, so a non-rendering crawler never sees them.",
        "Put them in the HTML the server sends. Tag manager injected tags are the usual cause."));
    }

    const liveLd = (live.structuredData.jsonLd || []).length;
    const rawLd = (stat.structuredData.jsonLd || []).length;
    if (liveLd > rawLd) {
      out.push(F("warn", "js.schema-injected", `${liveLd - rawLd} of ${liveLd} schema blocks are added by JavaScript`,
        "Schema injected client side is missed by crawlers that do not render, and it is the part AI systems use to work out what a page is about.",
        "Move the JSON-LD into the page template instead of firing it through a tag manager."));
    }

    const liveInternal = live.links.filter((l) => l.internal === true).length;
    const rawInternal = stat.links.filter((l) => l.internal === true).length;
    if (liveInternal >= 5 && rawInternal === 0) {
      out.push(F("fail", "js.links-missing", "No internal links exist before JavaScript runs",
        `The rendered page has ${liveInternal} internal links, the raw HTML has none. A non-rendering crawler cannot move through this site at all.`,
        "Render navigation and in-content links as real anchors in the served HTML."));
    } else if (liveInternal > 0 && rawInternal < liveInternal / 2) {
      out.push(F("warn", "js.links-partial", `${rawInternal} of ${liveInternal} internal links are in the raw HTML`,
        "The rest are only discoverable once scripts run.",
        "Check that menus, pagination and related links are real anchors in the served HTML."));
    }
    return out;
  }

  /** Who is allowed to crawl this URL, and what each block costs. */
  function crawlerAccess(grid, avail, robotsMeta) {
    const out = [];
    if (avail && !avail.usable) {
      out.push(F(avail.verdict === "blocked" ? "fail" : "note", "robots.availability",
        avail.verdict === "blocked" ? "robots.txt cannot be read" : "No robots.txt",
        avail.note,
        avail.verdict === "blocked" ? "Fix the response. Until it returns 200 or 404, crawlers hold off on the whole site." : null));
      if (avail.verdict !== "read") return out;
    }
    if (!grid || !grid.length) return out;

    const blocked = grid.filter((g) => !g.allowed);
    const search = blocked.filter((g) => g.group === "search");
    const ai = blocked.filter((g) => g.group === "ai");

    if (search.length) {
      out.push(F("fail", "robots.search-blocked", `${search.map((g) => g.label).join(", ")} blocked from this URL`,
        search.map((g) => `${g.label}: ${g.reason}`).join(" · "),
        "Remove or narrow that disallow rule unless this page is meant to stay out of search."));
    }
    const ext = blocked.find((g) => g.id === "Google-Extended");
    if (ext) {
      out.push(F("warn", "robots.google-extended", "Google-Extended is blocked",
        `${ext.reason}. This is the token that controls Gemini and AI Overviews grounding, separate from ranking in Google Search.`,
        "Deliberate is fine. If nobody chose it, know that it keeps the page out of AI Overviews answers."));
    }
    const otherAi = ai.filter((g) => g.id !== "Google-Extended");
    if (otherAi.length) {
      out.push(F("note", "robots.ai-blocked", `${otherAi.length} AI crawler${otherAi.length > 1 ? "s" : ""} blocked: ${otherAi.map((g) => g.label).join(", ")}`,
        "Reported as a fact, not a fault. Blocking these is a reasonable choice, it just means those systems cannot cite the page.",
        null));
    }
    if (!blocked.length) {
      out.push(F("pass", "robots.all-allowed", "Every crawler checked is allowed on this URL", `${grid.length} agents checked against robots.txt.`, null));
    }

    const m = (robotsMeta || "").toLowerCase();
    if (m.includes("noai") || m.includes("noimageai")) {
      out.push(F("note", "meta.noai", "The page carries a noai directive",
        "Honoured by some platforms, ignored by most. It is not part of any search engine's spec.", null));
    }
    return out;
  }

  /** Did the server treat a crawler's user agent differently from a browser's? */
  function agentProbes(baseline, probes) {
    const out = [];
    if (!probes || !probes.length) return out;
    for (const p of probes) {
      if (p.error) {
        out.push(F("note", "probe.error." + p.agent, `${p.agent}: request failed`, p.error, null));
        continue;
      }
      if (p.status === 403 || p.status === 401 || p.status === 429) {
        out.push(F("fail", "probe.blocked." + p.agent, `${p.agent} is blocked at the server (${p.status})`,
          `A browser gets ${baseline.status}, this crawler's user agent gets ${p.status}. robots.txt is not the whole story here, something in front of the site is turning it away.`,
          "Usually a WAF or the host's bot rules. Cloudflare's AI crawler setting is the common one. Allow it if you want to be cited."));
      } else if (baseline.bytes > 0 && Math.abs(p.bytes - baseline.bytes) / baseline.bytes > 0.3) {
        out.push(F("warn", "probe.different." + p.agent, `${p.agent} is served different HTML`,
          `A browser receives ${baseline.bytes} bytes, this crawler receives ${p.bytes}. A gap that size usually means a challenge page or a stripped version.`,
          "Check what the edge or CDN is doing with bot user agents."));
      } else {
        out.push(F("pass", "probe.ok." + p.agent, `${p.agent} gets the same page a browser does`, `${p.status}, ${p.bytes} bytes.`, null));
      }
    }
    return out;
  }

  /** Presence only. This is a proposal, not a standard, and it is never scored. */
  function llmsTxt(res) {
    if (!res) return [];
    const { llms, llmsFull } = res;
    if (llms && llms.servedHtml) {
      return [F("note", "llms.html", "/llms.txt returns a web page",
        "The path resolves to HTML, which usually means the site has a catch-all route rather than a real file.", null)];
    }
    if (llms && llms.present) {
      const s = llms.shape || {};
      const detail = `${llms.bytes} bytes, ${s.sections || 0} sections, ${s.links || 0} links` +
        (llmsFull && llmsFull.present ? ". llms-full.txt is there too." : "");
      const shapeOff = !s.h1 || !s.summary;
      return [F(shapeOff ? "note" : "pass", "llms.present", "llms.txt is published", detail,
        shapeOff ? "The proposal expects an H1 name and a blockquote summary at the top. Worth matching if you are publishing one at all." : null)];
    }
    return [F("note", "llms.absent", "No llms.txt",
      "No search engine has confirmed reading this file, and Google has said it does not. Absence costs nothing today.", null)];
  }

  /** Can an answer engine lift a clean passage out of this page? */
  function citability(live) {
    const out = [];
    const shape = live.content.shape || {};
    const words = live.content.mainWords || live.content.bodyWords;

    if (shape.firstParagraphWords > 90) {
      out.push(F("warn", "cite.long-lead", `The opening paragraph runs ${shape.firstParagraphWords} words`,
        "Answer engines quote the passage that answers the question soonest. A long wind-up gets skipped.",
        "Open with a direct two or three sentence answer, then expand."));
    }
    if (shape.paragraphsOver120Words > 0) {
      out.push(F("note", "cite.long-paras", `${shape.paragraphsOver120Words} paragraph${shape.paragraphsOver120Words > 1 ? "s run" : " runs"} past 120 words`,
        "Long blocks are harder to quote without dragging in something irrelevant.", "Split them where the subject changes."));
    }
    if (live.content.questionHeadings === 0 && live.headings.length > 3) {
      out.push(F("note", "cite.no-questions", "No heading is phrased as a question",
        "Headings that match how someone asks give an engine an obvious place to cut a passage from.",
        "Turn two or three subheads into the question a customer actually asks."));
    }
    if (words > 600 && !shape.lists && !shape.tables) {
      out.push(F("note", "cite.no-structure", "No lists or tables in a long page",
        "Steps, comparisons and specs get lifted into answers far more often when they are marked up as lists or tables.",
        "Where the content is already a sequence or a comparison, mark it up as one."));
    }
    const types = [];
    for (const b of live.structuredData.jsonLd || []) {
      if (!b.ok) continue;
      for (const n of [].concat(b.data["@graph"] || b.data)) if (n && n["@type"]) types.push(...[].concat(n["@type"]));
    }
    const has = (t) => types.some((x) => String(x).toLowerCase() === t.toLowerCase());
    if (!types.length) {
      out.push(F("warn", "cite.no-schema", "No structured data",
        "Schema is how a machine confirms what this page is and who published it.",
        "Start with the page's own type and an Organization block with sameAs links."));
    } else if (!has("Organization") && !has("LocalBusiness") && !has("Person")) {
      out.push(F("note", "cite.no-publisher", "Nothing identifies the publisher",
        `Schema present: ${[...new Set(types)].join(", ")}. None of it names who stands behind the page.`,
        "Add an Organization or Person node with sameAs pointing at the profiles that confirm the identity."));
    }
    if (!(shape.timeElements || []).length && !has("Article") && !has("BlogPosting")) {
      out.push(F("note", "cite.no-date", "No machine-readable date",
        "Engines lean on recency when picking between two answers, and there is nothing here to read.",
        "Add a <time datetime> element, or dateModified in schema."));
    }
    if (shape.contentInIframes > 0) {
      out.push(F("note", "cite.iframes", `${shape.contentInIframes} iframe${shape.contentInIframes > 1 ? "s" : ""} in the main content`,
        "Anything inside an iframe belongs to the other document, not this page.", null));
    }
    return out;
  }

  function score(findings) {
    const n = (s) => findings.filter((f) => f.severity === s).length;
    return { fail: n("fail"), warn: n("warn"), note: n("note"), pass: n("pass"), total: findings.length };
  }

  function audit(input) {
    const findings = [
      ...javascriptGap(input.live, input.static),
      ...crawlerAccess(input.robotsGrid, input.robotsAvailability, input.live && input.live.robotsMeta.content),
      ...agentProbes(input.baseline || {}, input.probes),
      ...llmsTxt(input.llms),
      ...citability(input.live),
    ];
    const order = { fail: 0, warn: 1, note: 2, pass: 3 };
    findings.sort((a, b) => order[a.severity] - order[b.severity]);
    return { findings, score: score(findings) };
  }

  const api = { audit, javascriptGap, crawlerAccess, agentProbes, llmsTxt, citability, score };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SEOAiReady = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
