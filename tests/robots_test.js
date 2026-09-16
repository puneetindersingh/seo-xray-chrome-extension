const R = require("../src/robots.js");

let checks = 0; const failures = [];
const check = (label, got, want) => {
  checks++;
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) failures.push(`${label}: got ${a}, want ${b}`);
};
const allowed = (txt, agent, url) => R.isAllowed(R.parseRobots(txt), agent, url).allowed;

// ---- parsing ----
const sample = `
# a comment
User-agent: *
Disallow: /admin/
Allow: /admin/public/
Sitemap: https://example.com/sitemap.xml

User-agent: GPTBot
User-agent: CCBot
Disallow: /

User-agent: Googlebot
Disallow:
Crawl-delay: 2
`;
const p = R.parseRobots(sample);
check("group count", p.groups.length, 3);
check("two agents share one group", p.groups[1].agents, ["gptbot", "ccbot"]);
check("sitemap captured", p.sitemaps, ["https://example.com/sitemap.xml"]);
check("crawl delay", p.groups[2].crawlDelay, "2");
check("comment line ignored", p.errors.length, 0);

// ---- matching ----
check("wildcard group applies", allowed(sample, "Ahrefsbot", "https://example.com/admin/x"), false);
check("allow beats parent disallow by length", allowed(sample, "Ahrefsbot", "https://example.com/admin/public/y"), true);
check("gptbot blocked site-wide", allowed(sample, "GPTBot", "https://example.com/"), false);
check("ccbot blocked too", allowed(sample, "CCBot", "https://example.com/page"), false);
check("empty disallow allows all", allowed(sample, "Googlebot", "https://example.com/admin/x"), true);
check("agent match is case insensitive", allowed(sample, "gptBOT", "https://example.com/"), false);

// Longest rule wins regardless of the order the lines appear in.
const longest = "User-agent: *\nAllow: /a/b/c\nDisallow: /a/\nDisallow: /a/b/c/d\n";
check("longest wins (allow)", allowed(longest, "x", "https://e.com/a/b/c"), true);
check("longest wins (disallow deeper)", allowed(longest, "x", "https://e.com/a/b/c/d"), false);
check("shorter disallow still applies elsewhere", allowed(longest, "x", "https://e.com/a/zzz"), false);

// Equal length, allow wins.
const tie = "User-agent: *\nDisallow: /page\nAllow: /page\n";
check("tie goes to allow", allowed(tie, "x", "https://e.com/page"), true);

// Wildcards and the end anchor.
const wild = "User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp/*/private\n";
check("$ anchors the end", allowed(wild, "x", "https://e.com/docs/file.pdf"), false);
check("$ does not match past the end", allowed(wild, "x", "https://e.com/docs/file.pdf?v=2"), true);
check("mid-path wildcard", allowed(wild, "x", "https://e.com/tmp/abc/private"), false);

// Query strings count as part of the path.
const qs = "User-agent: *\nDisallow: /*?sort=\n";
check("query string matched", allowed(qs, "x", "https://e.com/shop?sort=price"), false);
check("same path without the query is fine", allowed(qs, "x", "https://e.com/shop"), true);

// Repeated groups for one agent are merged.
const repeated = "User-agent: GPTBot\nDisallow: /a\n\nUser-agent: GPTBot\nDisallow: /b\n";
check("merged groups: first rule", allowed(repeated, "GPTBot", "https://e.com/a"), false);
check("merged groups: second rule", allowed(repeated, "GPTBot", "https://e.com/b"), false);

// Fallback chains.
const noExt = "User-agent: *\nDisallow: /private/\nUser-agent: Googlebot\nDisallow:\n";
check("Google-Extended does NOT inherit Googlebot", allowed(noExt, "Google-Extended", "https://e.com/private/x"), false);
check("Googlebot keeps its own group", allowed(noExt, "Googlebot", "https://e.com/private/x"), true);
const claude = "User-agent: ClaudeBot\nDisallow: /\n";
check("Claude-User falls back to ClaudeBot", allowed(claude, "Claude-User", "https://e.com/x"), false);

// Malformed input.
const broken = "Disallow: /orphan\nUser-agent: *\nnonsense line\nDisallow: /real\n";
const bp = R.parseRobots(broken);
check("orphan rule flagged", bp.errors[0].problem.includes("before any user-agent"), true);
check("line without a colon flagged", bp.errors[1].problem.includes("no colon"), true);
check("orphan rule has no effect", allowed(broken, "x", "https://e.com/orphan"), true);
check("valid rule after the mess still works", allowed(broken, "x", "https://e.com/real"), false);

// No group at all, and an empty file.
check("empty robots allows everything", allowed("", "GPTBot", "https://e.com/x"), true);
check("no wildcard group and no match", allowed("User-agent: Bingbot\nDisallow: /\n", "GPTBot", "https://e.com/"), true);

// ---- availability ----
check("404 means open", R.availability(404).verdict, "open");
check("503 means blocked", R.availability(503).verdict, "blocked");
check("network failure means blocked", R.availability(0, true).verdict, "blocked");
check("200 is usable", R.availability(200).usable, true);

// ---- the whole grid ----
const grid = R.auditAll(R.parseRobots("User-agent: GPTBot\nDisallow: /\nUser-agent: *\nAllow: /\n"), "https://e.com/page");
check("grid covers every known agent", grid.length, R.AGENTS.length);
check("grid: GPTBot blocked", grid.find((g) => g.id === "GPTBot").allowed, false);
check("grid: Googlebot allowed", grid.find((g) => g.id === "Googlebot").allowed, true);
check("grid: reason names the rule", grid.find((g) => g.id === "GPTBot").reason.startsWith("disallow: /"), true);
check("grid: wildcard match is labelled", grid.find((g) => g.id === "Googlebot").matchedBy, "wildcard");

console.log(`${checks - failures.length}/${checks} checks passed`);
failures.forEach((f) => console.log("  FAIL " + f));
process.exit(failures.length ? 1 : 0);
