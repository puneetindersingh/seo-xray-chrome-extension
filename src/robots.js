/**
 * robots.txt parser and matcher.
 *
 * Follows RFC 9309 and Google's documented behaviour, because guessing here
 * produces confident wrong answers about whether a page can be crawled:
 *   - groups are selected by the most specific matching user-agent, else "*"
 *   - repeated groups for the same agent are merged
 *   - the LONGEST matching rule wins, and allow beats disallow on a tie
 *   - "*" matches any run of characters, "$" anchors the end
 *   - an empty Disallow allows everything
 *   - the path is matched against path + query string, not the whole URL
 *
 * Pure functions over strings. No DOM, no network, so it tests in node.
 */
(function (root) {
  "use strict";

  // The agents worth asking about, and what each one decides.
  const AGENTS = [
    { id: "Googlebot", label: "Googlebot", note: "Google Search crawling", group: "search" },
    { id: "Google-Extended", label: "Google-Extended", note: "Gemini and AI Overviews grounding", group: "ai" },
    { id: "Bingbot", label: "Bingbot", note: "Bing, and what feeds Copilot", group: "search" },
    { id: "GPTBot", label: "GPTBot", note: "OpenAI training crawl", group: "ai" },
    { id: "OAI-SearchBot", label: "OAI-SearchBot", note: "ChatGPT search index", group: "ai" },
    { id: "ChatGPT-User", label: "ChatGPT-User", note: "ChatGPT fetching a link live", group: "ai" },
    { id: "ClaudeBot", label: "ClaudeBot", note: "Anthropic crawl", group: "ai" },
    { id: "Claude-User", label: "Claude-User", note: "Claude fetching a link live", group: "ai" },
    { id: "PerplexityBot", label: "PerplexityBot", note: "Perplexity index", group: "ai" },
    { id: "Perplexity-User", label: "Perplexity-User", note: "Perplexity fetching a link live", group: "ai" },
    { id: "CCBot", label: "CCBot", note: "Common Crawl, feeds many models", group: "ai" },
    { id: "Applebot-Extended", label: "Applebot-Extended", note: "Apple Intelligence training", group: "ai" },
    { id: "meta-externalagent", label: "meta-externalagent", note: "Meta AI crawl", group: "ai" },
    { id: "Bytespider", label: "Bytespider", note: "ByteDance crawl", group: "ai" },
    { id: "Amazonbot", label: "Amazonbot", note: "Amazon and Alexa", group: "ai" },
  ];

  // When an agent has no group of its own it falls back down this chain, "*" last.
  const FALLBACKS = {
    "google-extended": ["google-extended"],
    "googlebot-image": ["googlebot-image", "googlebot"],
    "googlebot-news": ["googlebot-news", "googlebot"],
    "oai-searchbot": ["oai-searchbot"],
    "chatgpt-user": ["chatgpt-user"],
    "claude-user": ["claude-user", "claudebot"],
    "claude-searchbot": ["claude-searchbot", "claudebot"],
    "perplexity-user": ["perplexity-user", "perplexitybot"],
    "applebot-extended": ["applebot-extended"],
  };

  function parseRobots(text) {
    const out = { groups: [], sitemaps: [], unknown: [], errors: [], lineCount: 0, bytes: (text || "").length };
    if (typeof text !== "string") return out;

    let current = null;      // group being filled
    let lastWasAgent = false; // consecutive user-agent lines share one group
    const lines = text.split(/\r\n|\r|\n/);
    out.lineCount = lines.length;

    lines.forEach((line, i) => {
      const noComment = line.split("#")[0];
      const trimmed = noComment.trim();
      if (!trimmed) return;

      const colon = trimmed.indexOf(":");
      if (colon === -1) {
        out.errors.push({ line: i + 1, text: line.trim().slice(0, 120), problem: "no colon, this line does nothing" });
        return;
      }
      const field = trimmed.slice(0, colon).trim().toLowerCase();
      const value = trimmed.slice(colon + 1).trim();

      if (field === "user-agent" || field === "useragent") {
        if (!current || !lastWasAgent) {
          current = { agents: [], rules: [], crawlDelay: null, startLine: i + 1 };
          out.groups.push(current);
        }
        current.agents.push(value.toLowerCase());
        lastWasAgent = true;
        return;
      }
      lastWasAgent = false;

      if (field === "allow" || field === "disallow") {
        if (!current) {
          out.errors.push({ line: i + 1, text: trimmed.slice(0, 120), problem: "rule before any user-agent line, it is ignored" });
          return;
        }
        current.rules.push({ type: field, path: value, line: i + 1 });
        return;
      }
      if (field === "sitemap") { out.sitemaps.push(value); return; }
      if (field === "crawl-delay") {
        if (current) current.crawlDelay = value;
        return;
      }
      out.unknown.push({ line: i + 1, field, value: value.slice(0, 200) });
    });

    return out;
  }

  // "/a/*.php$" becomes a regex anchored at the start of the path.
  function ruleToRegex(path) {
    let src = "";
    let anchored = false;
    let p = path;
    if (p.endsWith("$")) { anchored = true; p = p.slice(0, -1); }
    for (const ch of p) {
      if (ch === "*") src += ".*";
      else src += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp("^" + src + (anchored ? "$" : ""));
  }

  function groupFor(parsed, agent) {
    const want = String(agent || "*").toLowerCase();
    const chain = (FALLBACKS[want] || [want]).concat("*");
    for (const token of chain) {
      const matched = parsed.groups.filter((g) => g.agents.includes(token));
      if (matched.length) {
        // Repeated groups for one agent are merged, per RFC 9309.
        return {
          agent: token,
          matchedBy: token === "*" && want !== "*" ? "wildcard" : "name",
          rules: matched.flatMap((g) => g.rules),
          crawlDelay: matched.map((g) => g.crawlDelay).find((c) => c !== null) ?? null,
        };
      }
    }
    return null;
  }

  function pathOf(url) {
    try {
      const u = new URL(url);
      return (u.pathname || "/") + (u.search || "");
    } catch {
      return typeof url === "string" && url.startsWith("/") ? url : "/";
    }
  }

  /**
   * @returns {{allowed: boolean, reason: string, rule: object|null, agent: string|null, matchedBy: string|null}}
   */
  function isAllowed(parsed, agent, url) {
    const target = pathOf(url);
    const group = groupFor(parsed, agent);
    if (!group) return { allowed: true, reason: "no group matches this agent and there is no * group", rule: null, agent: null, matchedBy: null };

    let best = null;
    for (const rule of group.rules) {
      if (rule.type === "disallow" && rule.path === "") continue; // empty Disallow allows everything
      if (rule.path === "") continue;
      let re;
      try { re = ruleToRegex(rule.path); } catch { continue; }
      if (!re.test(target)) continue;
      if (!best) { best = rule; continue; }
      if (rule.path.length > best.path.length) best = rule;
      else if (rule.path.length === best.path.length && rule.type === "allow") best = rule; // tie goes to allow
    }

    if (!best) return { allowed: true, reason: "no rule in the matching group applies to this path", rule: null, agent: group.agent, matchedBy: group.matchedBy };
    return {
      allowed: best.type === "allow",
      reason: `${best.type}: ${best.path} (line ${best.line})`,
      rule: best,
      agent: group.agent,
      matchedBy: group.matchedBy,
    };
  }

  /**
   * What a crawler does when robots.txt cannot be read. Google's documented behaviour:
   * a 4xx means crawl freely, a 5xx or timeout means treat the whole site as disallowed.
   */
  function availability(status, networkError) {
    if (networkError) return { usable: false, verdict: "blocked", note: "robots.txt could not be fetched, crawlers treat that as a site-wide block" };
    if (status >= 500) return { usable: false, verdict: "blocked", note: `robots.txt returned ${status}, Google treats 5xx as a site-wide disallow` };
    if (status === 404 || (status >= 400 && status < 500)) return { usable: false, verdict: "open", note: `no usable robots.txt (${status}), everything is crawlable` };
    if (status >= 300) return { usable: false, verdict: "open", note: `robots.txt redirected (${status}), crawlers follow a few hops then treat it as missing` };
    return { usable: true, verdict: "read", note: "" };
  }

  function auditAll(parsed, url, agents = AGENTS) {
    return agents.map((a) => Object.assign({}, a, isAllowed(parsed, a.id, url)));
  }

  const api = { AGENTS, parseRobots, isAllowed, groupFor, auditAll, availability, ruleToRegex, pathOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SEORobots = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
