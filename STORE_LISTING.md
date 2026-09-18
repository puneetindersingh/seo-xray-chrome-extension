# Chrome Web Store listing copy

**Name**
SEO Side Panel

**Short description** (132 characters max)
Free, made by an SEO. Stays open beside every page you visit, listing each SEO
issue with its fix, and what AI crawlers can read.

**Category**
Developer Tools

**Detailed description**

SEO Side Panel stays open beside every page you visit and audits each one using
the page's own code. Change tabs and it follows you. On every page you get a
list of what is wrong, each with a fix written next to it. No account, no API key, no AI, nothing sent anywhere.

The Summary page shows title, description, URL, canonical, robots directives, H1
and word count together, each with a colour: red when broken, amber when worth a
look, green when fine. Headings, Links, Images, Schema and Social each have their
own page.

What it checks:

ON-PAGE
Title and meta description measured in real pixel widths, not character counts.
Canonical, meta robots, X-Robots-Tag, viewport, lang, charset. Full heading
outline with skipped levels flagged. Internal and external links, nofollow, and
a status check that marks each link 200, redirect or 404. Images missing alt
text, missing dimensions, oversized or failing to load. Open Graph and Twitter cards. Hreflang pairs.

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
blocking them, which is a tick box, off by default, for sites you own or audit.

TECH AND TRACKING
80 tracker signatures with their container and property IDs. CMS, theme, page
builder, SEO plugin, JavaScript framework, verification tags, social profiles,
third party hosts, security header grade.

PERMISSIONS
Installed, it has access to no website. The tab you open the panel on is read
through activeTab. The first page it cannot read offers you two buttons: allow
this site, or allow all sites. Withdraw either at chrome://extensions.

PRIVACY
Reading the page is local. Two buttons touch the network: Run site checks talks
only to the site you are on, and Check status sends a HEAD request to each link
on the page. Nothing else requests anything. No
analytics, no telemetry, no remote code, no account.

Open source under the MIT license.

**Permission justifications**

sidePanel: the panel is the entire interface.
scripting: runs the page reader inside the active tab to take a snapshot.
tabs: detects the active tab and navigation so the panel stays in sync.
storage: remembers which panel tab was last open.
activeTab: reads the tab the user opened the panel on, so a fresh install needs
no host permission at all.
declarativeNetRequestWithHostAccess: sets a crawler user agent header on the
optional probe request, which the user ticks, so they can see whether the site
blocks AI crawlers. It writes one session rule and removes it in a finally block.
Optional host permission all urls: requested at runtime, never at install, and
only when the user asks for something that needs it. Reading a tab they moved to,
fetching robots.txt and the sitemap from that host, and checking links that point
to other domains. The panel offers a single site first and all sites second.

**Single purpose**
Inspect the current page for search engine optimisation problems and show the
user what to fix.

**Data usage**
No user data is collected or transmitted.
