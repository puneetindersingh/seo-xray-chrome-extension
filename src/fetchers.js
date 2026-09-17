/**
 * Network reads. These run in the panel, which has host permissions, so the
 * fetches are not subject to CORS and response headers are readable.
 *
 * Deliberate choices:
 *   - credentials are omitted. A crawler is logged out, so a logged-out fetch is
 *     the honest comparison. It also keeps the extension away from session cookies.
 *   - cache is bypassed, otherwise the "raw HTML" is whatever the tab already had.
 *   - every failure returns an object. Nothing here throws at the caller.
 */
(function (root) {
  "use strict";

  const TIMEOUT_MS = 12000;

  async function fetchText(url, opts = {}) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeout || TIMEOUT_MS);
    const result = {
      requested: url, url: null, ok: false, status: 0, redirected: false,
      headers: {}, text: "", bytes: 0, ms: 0, error: null, ua: opts.ua || null,
    };
    try {
      const res = await fetch(url, {
        credentials: "omit",
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,
      });
      result.url = res.url;
      result.status = res.status;
      result.ok = res.ok;
      result.redirected = res.redirected;
      for (const [k, v] of res.headers.entries()) result.headers[k.toLowerCase()] = v;
      result.text = await res.text();
      result.bytes = result.text.length;
    } catch (err) {
      result.error = err.name === "AbortError" ? "timed out" : String(err.message || err);
    } finally {
      clearTimeout(timer);
      result.ms = Date.now() - started;
    }
    return result;
  }

  /**
   * Send one request with a crawler's user agent, to see whether the site treats
   * it differently. Uses a single-shot session rule, removed in the finally block
   * so a failure can never leave the browser rewriting headers.
   */
  async function fetchAsAgent(url, ua) {
    const id = 9000 + Math.floor(Math.random() * 900);
    const rule = {
      id,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [{ header: "user-agent", operation: "set", value: ua }],
      },
      condition: { urlFilter: url, resourceTypes: ["xmlhttprequest"] },
    };
    try {
      await chrome.declarativeNetRequest.updateSessionRules({ addRules: [rule], removeRuleIds: [id] });
      return await fetchText(url, { ua });
    } catch (err) {
      return { requested: url, ok: false, status: 0, error: "could not set the user agent: " + (err.message || err), ua };
    } finally {
      try { await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] }); } catch { /* already gone */ }
    }
  }

  const originOf = (url) => { try { return new URL(url).origin; } catch { return null; } };

  async function getRobots(url) {
    const origin = originOf(url);
    if (!origin) return null;
    const res = await fetchText(origin + "/robots.txt");
    const looksLikeHtml = /^\s*<(!doctype|html)/i.test(res.text || "");
    return Object.assign(res, {
      looksLikeHtml,
      contentType: res.headers["content-type"] || null,
    });
  }

  // llms.txt is a proposal. No search engine has confirmed using it, so this
  // reports presence and never scores it.
  async function getLlmsTxt(url) {
    const origin = originOf(url);
    if (!origin) return null;
    const [main, full] = await Promise.all([
      fetchText(origin + "/llms.txt"),
      fetchText(origin + "/llms-full.txt"),
    ]);
    const shape = (t) => {
      const lines = (t || "").split(/\r?\n/);
      return {
        h1: lines.some((l) => /^#\s+\S/.test(l)),
        summary: lines.some((l) => /^>\s*\S/.test(l)),
        sections: lines.filter((l) => /^##\s+\S/.test(l)).length,
        links: (t.match(/\[[^\]]+\]\([^)]+\)/g) || []).length,
      };
    };
    const judge = (res) => ({
      present: res.ok && res.bytes > 0 && !/^\s*<(!doctype|html)/i.test(res.text),
      status: res.status,
      bytes: res.bytes,
      url: res.requested,
      shape: res.ok ? shape(res.text) : null,
      servedHtml: /^\s*<(!doctype|html)/i.test(res.text || ""),
    });
    return { llms: judge(main), llmsFull: judge(full) };
  }

  async function getSitemaps(robotsText, url) {
    const origin = originOf(url);
    const found = [];
    const parsed = root.SEORobots ? root.SEORobots.parseRobots(robotsText || "") : { sitemaps: [] };
    for (const s of parsed.sitemaps) found.push({ url: s, source: "robots.txt" });
    if (!found.length && origin) found.push({ url: origin + "/sitemap.xml", source: "guessed" });
    return found;
  }

  /** Is this URL listed in the site's sitemaps? Follows one level of sitemap index. */
  async function sitemapContains(sitemapUrl, targetUrl, depth = 0) {
    const res = await fetchText(sitemapUrl);
    if (!res.ok) return { checked: sitemapUrl, ok: false, status: res.status, found: false, urls: 0, error: res.error };
    const isIndex = /<sitemapindex/i.test(res.text);
    const locs = [...res.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    if (isIndex && depth < 1) {
      for (const child of locs.slice(0, 25)) {
        const hit = await sitemapContains(child, targetUrl, depth + 1);
        if (hit.found) return hit;
      }
      return { checked: sitemapUrl, ok: true, status: res.status, found: false, urls: locs.length, isIndex: true };
    }
    const clean = (u) => u.split("#")[0].replace(/\/$/, "");
    return {
      checked: sitemapUrl,
      ok: true,
      status: res.status,
      isIndex: false,
      urls: locs.length,
      found: locs.some((u) => clean(u) === clean(targetUrl)),
    };
  }

  /**
   * Status of one linked URL. HEAD first because it is cheap; servers that refuse
   * HEAD get a GET that is cut off as soon as the headers arrive. Redirects are
   * followed, so the result carries the final status and whether it moved.
   */
  async function linkStatus(url, opts = {}) {
    const started = Date.now();
    const attempt = async (method) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeout || 10000);
      try {
        const res = await fetch(url, { method, credentials: "omit", cache: "no-store", redirect: "follow", signal: controller.signal });
        const out = { status: res.status, finalUrl: res.url, redirected: res.redirected, method };
        controller.abort();   // a GET only needed the headers
        return out;
      } finally {
        clearTimeout(timer);
      }
    };
    try {
      let r = await attempt("HEAD");
      if ([405, 501].includes(r.status)) r = await attempt("GET");
      return Object.assign({ url, error: null, ms: Date.now() - started }, r);
    } catch (err) {
      return { url, status: 0, finalUrl: null, redirected: false, error: err.name === "AbortError" ? "timed out" : String(err.message || err), ms: Date.now() - started };
    }
  }

  /** Check many URLs, a few at a time, reporting each one as it lands. */
  async function linkStatuses(urls, opts = {}) {
    const queue = urls.slice();
    const results = {};
    const worker = async () => {
      while (queue.length) {
        if (opts.cancelled && opts.cancelled()) return;
        const url = queue.shift();
        results[url] = await linkStatus(url, opts);
        if (opts.onEach) opts.onEach(results[url]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(opts.concurrency || 6, urls.length) }, worker));
    return results;
  }

  const api = { fetchText, fetchAsAgent, getRobots, getLlmsTxt, getSitemaps, sitemapContains, originOf, linkStatus, linkStatuses };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SEOFetch = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
