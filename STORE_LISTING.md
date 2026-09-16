# Chrome Web Store listing copy

**Name**
SEO Xray

**Short description** (132 characters max)
Free on-page SEO audit in a side panel. Titles, meta, schema, robots.txt,
indexing and AI crawler readiness. No account, no tracking.

**Category**
Developer Tools

**Detailed description**

SEO Xray audits the page you are looking at using the page's own code. Open the
side panel and you get a list of what is wrong, each with a fix written next to
it. No account, no API key, no AI, nothing sent anywhere.

What it checks:

ON-PAGE
Title and meta description measured in real pixel widths, not character counts.
Canonical, meta robots, X-Robots-Tag, viewport, lang, charset. Full heading
outline with skipped levels flagged. Internal and external links, nofollow.
Images missing alt text. Open Graph and Twitter cards. Hreflang pairs.

STRUCTURED DATA
Every JSON-LD block, parsed. A block with a syntax error is ignored by Google
silently, so the panel names the block and the position of the error.

INDEXING
Whether the URL is in the site's XML sitemap, what robots.txt says about it per
crawler, and whether a directive is keeping the page out of the index.

AI SEARCH
The raw HTML the server sends, compared against the rendered page. GPTBot,
ClaudeBot, PerplexityBot and CCBot do not run JavaScript, so anything that only
appears after hydration is invisible to them. Reads llms.txt, applies robots.txt
rules per crawler, and can repeat the request as a crawler to catch a CDN
blocking them.

TECH AND TRACKING
80 tracker signatures with their container and property IDs. CMS, theme, page
builder, SEO plugin, JavaScript framework, verification tags, social profiles,
third party hosts, security header grade.

PRIVACY
Reading the page is local. The only button that touches the network is Run site
checks, and it talks to the site you are already on and nowhere else. No
analytics, no telemetry, no remote code, no account.

Open source under the MIT license.

**Permission justifications**

sidePanel: the panel is the entire interface.
scripting: runs the page reader inside the active tab to take a snapshot.
tabs: detects the active tab and navigation so the panel stays in sync.
storage: remembers which panel tab was last open.
declarativeNetRequestWithHostAccess: sets a crawler user agent header on the
optional probe request so the user can see whether the site blocks AI crawlers.
Host permission all urls: the user can audit any page they are on, and robots.txt
must be fetchable from whichever host that is.

**Single purpose**
Inspect the current page for search engine optimisation problems and show the
user what to fix.

**Data usage**
No user data is collected or transmitted.
