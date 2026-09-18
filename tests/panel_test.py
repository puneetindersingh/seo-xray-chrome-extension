"""Render the real panel with a stubbed chrome API and look at it.

Feeds the panel a genuine snapshot taken from the fixture page, so the two halves
are tested against the same data the extension will actually carry.
"""
import functools, http.server, json, pathlib, threading, sys

ROOT = pathlib.Path(__file__).resolve().parent
APP = ROOT.parent
SRC = (APP / "src" / "extract.js").read_text()

failures, checks = [], 0
def check(label, got, want):
    global checks
    checks += 1
    if got != want:
        failures.append(f"{label}: got {got!r}, want {want!r}")

STUB = r"""
(() => {
  const snap = __SNAP__;
  const noop = { addListener() {} };
  // Host access is optional in the manifest, so the stub models a real grant
  // state: what is held, what gets asked for, and whether Chrome says yes.
  const perm = Object.assign({ granted: ["<all_urls>"], asked: [], deny: false, denyRead: false }, __PERM__);
  globalThis.__perm = perm;
  const held = (o) => perm.granted.includes("<all_urls>") || perm.granted.includes(o);
  globalThis.chrome = {
    tabs: {
      query: async () => [{ id: 1, title: "Cheap Widgets Melbourne | Widget Co",
                            url: "https://example.com/widgets", favIconUrl: "" }],
      onActivated: noop, onUpdated: noop,
    },
    windows: { onFocusChanged: noop, WINDOW_ID_NONE: -1 },
    permissions: {
      contains: async ({ origins }) => origins.every(held),
      request: async ({ origins }) => {
        perm.asked.push(origins.join(","));
        if (perm.deny) return false;
        perm.granted.push(...origins);
        perm.denyRead = false;
        return true;
      },
      onAdded: noop, onRemoved: noop,
    },
    scripting: {
      executeScript: async () => {
        if (perm.denyRead) throw new Error("Cannot access contents of the page.");
        return [{ result: snap }];
      },
    },
    declarativeNetRequest: { updateSessionRules: async () => {} },
  };

  // A site whose HTML is an empty shell: content, links and schema all arrive with JS.
  const SHELL = `<!doctype html><html><head><title>Cheap Widgets Melbourne | Widget Co</title>
    <link rel="canonical" href="https://example.com/widgets"></head>
    <body><div id="root"></div></body></html>`;
  const ROBOTS = "User-agent: GPTBot\nDisallow: /\nUser-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n";
  const SITEMAP = "<urlset><url><loc>https://example.com/widgets</loc></url></urlset>";
  const routes = {
    "https://example.com/widgets": [200, SHELL, "text/html"],
    "https://example.com/robots.txt": [200, ROBOTS, "text/plain"],
    "https://example.com/sitemap.xml": [200, SITEMAP, "application/xml"],
    "https://example.com/llms.txt": [404, "", "text/plain"],
    "https://example.com/llms-full.txt": [404, "", "text/plain"],
  };
  globalThis.__routes = routes;
  globalThis.__calls = [];
  globalThis.__requests = [];
  globalThis.fetch = async (url, opts = {}) => {
    globalThis.__calls.push(url);
    globalThis.__requests.push([url, opts.method || "GET"]);
    const [status, body, type, finalUrl] = routes[url] || [404, "", "text/plain"];
    return {
      url: finalUrl || url, status, ok: status >= 200 && status < 300, redirected: !!finalUrl,
      headers: { entries: () => [["content-type", type], ["x-robots-tag", "noarchive"]] },
      text: async () => body,
    };
  };
})();
"""


def main():
    from playwright.sync_api import sync_playwright
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT / "fixtures"))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_port}"

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 400, "height": 900})
        page.goto(f"{base}/messy.html", wait_until="load")
        page.evaluate("src => eval(src)", SRC)
        snap = page.evaluate("() => __seoExtract(document, { live: true })")
        # The fixture is served from localhost. Re-label it so the stubbed routes
        # stand in for a real site, which is what the panel would be pointed at.
        snap.update(url="https://example.com/widgets", origin="https://example.com",
                    host="example.com", protocol="https:")
        # Links and images too, so the screenshots read like a real site rather than a port number.
        snap = json.loads(json.dumps(snap).replace(base, "https://example.com"))
        # Long real-world hostnames, which is what made the card overflow the panel.
        hosts = [
            {"host": "www.googletagmanager.com", "count": 4, "thirdParty": True, "how": ["script"]},
            {"host": "securepubads.g.doubleclick.net", "count": 9, "thirdParty": True, "how": ["script", "img"]},
            {"host": "connect.facebook.net", "count": 2, "thirdParty": True, "how": ["script"]},
            {"host": "fonts.gstatic.com", "count": 6, "thirdParty": True, "how": ["css"]},
            {"host": "example.com", "count": 12, "thirdParty": False, "how": ["img"]},
        ]
        hosts += [{"host": f"cdn{i}.a-very-long-third-party-hostname.example.net",
                   "count": 1, "thirdParty": True, "how": ["img"]} for i in range(14)]
        # Merge, never replace: loaded.html is what the tracker fingerprints read.
        snap["loaded"].update(hosts=hosts,
                              thirdPartyHosts=sum(1 for h in hosts if h["thirdParty"]))

        errors = []
        panel = browser.new_page(viewport={"width": 400, "height": 900})
        panel.on("pageerror", lambda e: errors.append(str(e)))
        panel.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        stub = lambda perm: STUB.strip().replace("__SNAP__", json.dumps(snap)).replace("__PERM__", json.dumps(perm))
        panel.add_init_script(stub({}))
        panel.goto((APP / "panel.html").as_uri(), wait_until="load")
        panel.wait_for_selector(".pcard")

        # ---- shell ----
        check("no page errors", errors, [])
        check("page title shown", panel.inner_text("#page-title"), "Cheap Widgets Melbourne | Widget Co")
        check("notice hidden", panel.is_visible("#notice"), False)
        tabs = panel.eval_on_selector_all(".tab", "els => els.map(e => e.firstChild.textContent)")
        check("ten views", tabs, ["Summary", "Issues", "Headings", "Links", "Images", "Schema", "Social", "Tech", "AI", "Data"])
        check("summary opens first", panel.eval_on_selector(".tab[aria-selected=true]", "e => e.firstChild.textContent"), "Summary")
        tab = lambda name: panel.click(f".tab:has(> span:text-is('{name}'))")
        badge = lambda name: panel.eval_on_selector(f".tab:has(> span:text-is('{name}'))", "e => { const b = e.querySelector('.badge'); return b ? b.className.split(' ')[1] + ':' + b.textContent : null; }")
        check("a tab with a failure wears a red badge", badge("Summary").startswith("fail:"), True)
        check("a tab with only warnings wears an amber badge", badge("Headings"), "warn:1")
        check("the data tab never carries a badge", badge("Data"), None)
        no_sideways = lambda: panel.evaluate("() => document.documentElement.scrollWidth <= document.documentElement.clientWidth")
        top = lambda: panel.evaluate("() => document.querySelector('main').scrollTo(0, 0)")

        # ---- summary ----
        rows = panel.eval_on_selector_all(".row", "els => els.map(e => e.querySelector('.row-label').textContent)")
        for want in ["Title", "Description", "URL", "Canonical", "Robots meta", "X-Robots-Tag", "H1", "Word count", "Lang", "Viewport", "Charset"]:
            check(f"summary row '{want}'", want in rows, True)
        row = lambda label: f".row:has(> .row-head > .row-label:text-is('{label}'))"
        pill_of = lambda label: panel.eval_on_selector(row(label), "e => { const p = e.querySelector('.row-head .pill'); return p ? p.className.replace('pill ', '') + ':' + p.textContent : null; }")
        check("missing viewport is a red pill", pill_of("Viewport"), "fail:\u2715Missing")
        check("and its row is marked red", panel.eval_on_selector(row("Viewport"), "e => e.classList.contains('fail')"), True)
        check("the reason is written under it", "No viewport tag" in panel.inner_text(row("Viewport")), True)
        check("missing description is amber", pill_of("Description"), "warn:!Missing")
        check("title pill carries characters and pixels", ("chars" in pill_of("Title"), "px" in pill_of("Title")), (True, True))
        check("self canonical is green", pill_of("Canonical"), "pass:\u2713Self")
        check("two H1s are amber", pill_of("H1"), "warn:!2 H1s")
        check("red really is red", panel.eval_on_selector(".row .pill.fail", "e => getComputedStyle(e).backgroundColor"), "rgb(217, 45, 32)")
        check("header waits for the run", "Run site checks to read" in panel.inner_text(row("X-Robots-Tag")), True)
        fails = panel.eval_on_selector(".hcell.fail b", "e => Number(e.textContent)")
        check("health strip counts the same failures as Issues", fails >= 2, True)
        check("H1 count cell is amber", panel.eval_on_selector(".ccell:has(> span:text-is('H1'))", "e => e.classList.contains('warn')"), True)
        check("robots.txt link opens the site's file", panel.eval_on_selector(".quick .xlink", "e => [e.href, e.target]"), ["https://example.com/robots.txt", "_blank"])
        check("summary fits the panel", no_sideways(), True)
        check("no em dash on the summary", "\u2014" in panel.inner_text("body"), False)
        top()
        panel.screenshot(path=str(ROOT / "ui-summary.png"), full_page=True)
        panel.click(".health .hcell.fail")
        check("a health cell opens Issues filtered to it", (panel.eval_on_selector(".tab[aria-selected=true]", "e => e.firstChild.textContent"),
              panel.eval_on_selector_all(".finding", "els => els.every(e => e.classList.contains('fail'))")), ("Issues", True))
        panel.evaluate("() => { state.show = { fail: true, warn: true, note: true, pass: false }; render(); }")

        # ---- issues ----
        panel.wait_for_selector(".finding")
        text = panel.inner_text("#out")
        check("verdict headline", "to fix" in panel.inner_text(".verdict"), True)
        tiles = panel.eval_on_selector_all(".tile", "els => els.map(e => e.className.split(' ')[1] + ':' + e.querySelector('b').textContent)")
        counts = dict(t.split(":") for t in tiles)
        check("failures counted", int(counts["fail"]) >= 2, True)
        check("warnings counted", int(counts["warn"]) >= 3, True)
        check("passes hidden by default", panel.eval_on_selector(".tile.pass", "e => e.getAttribute('aria-pressed')"), "false")

        check("broken json-ld reported", "does not parse" in text, True)
        check("two H1s reported", "2 H1 headings" in text, True)
        check("missing description reported", "No meta description" in text, True)
        check("missing viewport reported", "No viewport tag" in text, True)
        check("missing alt reported", "no alt attribute" in text, True)
        check("every failure and warning carries a fix", panel.eval_on_selector_all(
            ".finding.fail, .finding.warn", "els => els.every(e => e.querySelector('.f-fix'))"), True)
        check("and there are plenty of them", panel.eval_on_selector_all(".finding .f-fix", "e => e.length") > 5, True)
        check("failures are grouped first", panel.eval_on_selector(".group h3", "e => e.textContent").startswith("To fix"), True)
        check("a failure never sits below another area's notes", panel.eval_on_selector_all(
            ".finding", "els => els.findIndex(e => e.classList.contains('note')) > els.findLastIndex(e => e.classList.contains('fail'))"), True)
        check("each finding names its area", panel.eval_on_selector(".finding .f-sev", "e => e.textContent"), "meta")
        check("no em dash anywhere", "\u2014" in panel.inner_text("body"), False)
        check("nothing from the page was parsed as html", "<script" in text, False)
        panel.evaluate("() => document.querySelector('main').scrollTo(0, 0)")
        panel.screenshot(path=str(ROOT / "ui-issues.png"), full_page=True)

        # filters are live
        before = panel.eval_on_selector_all(".finding", "e => e.length")
        panel.click(".tile.note")
        after = panel.eval_on_selector_all(".finding", "e => e.length")
        check("turning notes off removes findings", after < before, True)
        panel.click(".tile.note")
        check("and turning them back on restores them", panel.eval_on_selector_all(".finding", "e => e.length"), before)

        # ---- headings ----
        tab("Headings")
        oh = ".outline2 > li"
        check("outline rows", panel.eval_on_selector_all(oh, "e => e.length"), 7)
        marks = panel.eval_on_selector_all(oh, "els => els.map(e => [...e.querySelectorAll('.omarks .pill')].map(p => [...p.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('')).join('|'))")
        check("second H1 marked extra", marks[2], "extra H1")
        check("skip marked on the H3", marks[3], "skips from H1")
        check("empty heading marked", marks[4], "empty")
        check("hidden heading marked", marks[5], "hidden")
        check("nav and footer shown as context", (marks[0], marks[6]), ("nav", "footer"))
        check("the extra H1 row is amber", panel.eval_on_selector_all(oh, "els => els[2].classList.contains('warn')"), True)
        check("the hidden row is dimmed", panel.eval_on_selector_all(oh, "els => els[5].classList.contains('dim')"), True)
        check("deeper levels sit further in", panel.eval_on_selector_all(oh,
              "els => parseFloat(getComputedStyle(els[3]).paddingLeft) > parseFloat(getComputedStyle(els[1]).paddingLeft)"), True)
        check("H1 level cell is amber", panel.eval_on_selector(".lcell:first-child", "e => e.classList.contains('warn')"), True)
        check("problems listed above the outline", "2 H1 headings" in panel.inner_text(".flags"), True)
        check("copy outline offered", panel.is_visible("text=Copy outline"), True)
        check("headings fit the panel", no_sideways(), True)
        top()
        panel.screenshot(path=str(ROOT / "ui-headings.png"), full_page=True)

        # ---- links ----
        tab("Links")
        tiles = dict(panel.eval_on_selector_all(".ftile", "els => els.map(e => [e.querySelector('span').textContent, Number(e.querySelector('b').textContent)])"))
        check("link filter counts", [tiles[k] for k in ["All", "Internal", "External", "Nofollow"]], [9, 5, 3, 1])
        lk = ".links > .lk"
        check("every link listed", panel.eval_on_selector_all(lk, "e => e.length"), 9)
        check("empty anchor row is amber", panel.eval_on_selector_all(lk, "els => els.some(e => e.classList.contains('warn') && e.textContent.includes('no anchor text'))"), True)
        check("external nofollow is context, not a fault", panel.eval_on_selector_all(".lk-tags .pill", "els => els.filter(p => /nofollow/.test(p.textContent)).map(p => p.className)"), ["pill plain"])
        check("no status requests before the click", any(m == "HEAD" for _, m in panel.evaluate("() => __requests")), False)
        panel.click(".ftile:has(> span:text-is('Problems'))")
        check("problems filter keeps only amber and red rows", panel.eval_on_selector_all(lk, "els => els.length > 0 && els.every(e => e.classList.contains('warn') || e.classList.contains('fail'))"), True)
        panel.click(".ftile:has(> span:text-is('All'))")

        base_url = snap["links"][0]["href"].rsplit("/", 1)[0]
        panel.evaluate("""b => Object.assign(__routes, {
            [b + '/about']: [200, '', 'text/html'],
            [b + '/contact']: [200, '', 'text/html', b + '/contact-us'],
            'https://partner.example.org/x': [403, '', 'text/html'],
            'https://other.example.org/y': [200, '', 'text/html'],
        })""", base_url)
        panel.click("#check-status")
        panel.wait_for_selector("#check-status:text-is('Check again')")
        heads = [u for u, m in panel.evaluate("() => __requests") if m == "HEAD"]
        check("one HEAD per unique URL", len(heads), len(set(heads)))
        check("every unique link was checked", len(heads), 8)
        status = dict(panel.eval_on_selector_all(lk, "els => els.filter(e => e.querySelector('.lk-head .pill')).map(e => [e.dataset.url.replace(/^https?:\\/\\/[^/]+/, ''), e.querySelector('.lk-head .pill').className.replace('pill ', '') + ':' + e.querySelector('.lk-head .pill').textContent.replace(/^[^0-9a-z]+/i, '')])"))
        check("a 200 is green", status["/about"], "pass:200")
        check("a 404 is red", status["/services"], "fail:404")
        check("a redirect is amber", status["/contact"], "warn:redirect 200")
        check("a 403 is amber, not called broken", status["/x"], "warn:403")
        check("a broken link turns its row red", panel.eval_on_selector_all(lk, "els => els.some(e => e.classList.contains('fail'))"), True)
        check("the tally is shown", "broken" in panel.inner_text(".statusbar"), True)
        check("broken links turn the Links badge red", badge("Links").startswith("fail:"), True)
        check("and reach the problems listed above", "links are broken" in panel.inner_text(".flags"), True)
        check("and the copied report", "links are broken" in panel.evaluate("() => report()"), True)
        check("links fit the panel", no_sideways(), True)
        check("every url is one line", panel.eval_on_selector_all(".lk-url", "els => els.every(e => e.getBoundingClientRect().height < 24)"), True)
        top()
        panel.screenshot(path=str(ROOT / "ui-links.png"), full_page=True)

        # ---- images ----
        tab("Images")
        tiles = dict(panel.eval_on_selector_all(".ftile", "els => els.map(e => [e.querySelector('span').textContent, Number(e.querySelector('b').textContent)])"))
        check("image filter counts", [tiles["All"], tiles["No alt"]], [3, 1])
        # The fixture's image files do not exist, so the browser really did fail to load them.
        check("images that failed to load are counted broken", tiles["Broken"] >= 2, True)
        check("broken outranks missing alt on the row", panel.eval_on_selector_all(".imgs > .im", "els => els.some(e => e.classList.contains('fail') && e.textContent.includes('no alt attribute'))"), True)
        check("and the Images tab wears a red badge", badge("Images").startswith("fail:"), True)
        check("alt text shown", "Widget installer at work" in panel.inner_text("#out"), True)
        check("images fit the panel", no_sideways(), True)
        top()
        panel.screenshot(path=str(ROOT / "ui-images.png"), full_page=True)

        # ---- schema ----
        tab("Schema")
        heads = panel.eval_on_selector_all(".pcard .pcard-head", "els => els.map(e => e.textContent)")
        check("broken block is red", any(h.startswith("Block 2") and "Does not parse" in h for h in heads), True)
        check("service without provider is amber", any(h.startswith("Block 1") and "Incomplete" in h for h in heads), True)
        check("hreflang listed", "en-nz" in panel.inner_text("#out"), True)
        check("rich results test link carries the URL", "example.com" in panel.eval_on_selector(".quick .xlink", "e => e.href"), True)
        check("schema fits the panel", no_sideways(), True)
        top()
        panel.screenshot(path=str(ROOT / "ui-schema.png"), full_page=True)

        # ---- social ----
        tab("Social")
        check("og:title present is green", pill_of("og:title"), "pass:\u2713")
        check("og:description gap flagged", pill_of("og:description").endswith("Missing"), True)
        check("twitter gaps explain the fallback", "X uses og:title" in panel.inner_text(row("twitter:title")), True)
        check("social fits the panel", no_sideways(), True)
        top()
        panel.screenshot(path=str(ROOT / "ui-social.png"), full_page=True)

        # ---- tech view, built with no network ----
        tab("Tech")
        tech = panel.inner_text("#out")
        check("verdict in plain words", "instrumented" in tech, True)
        check("GTM container id read", "GTM-TEST123" in tech, True)
        check("GA4 id read", "G-TEST123456" in tech, True)
        check("gtm-loader did not invent an id", "GTM-LOADE" in tech, False)
        check("WordPress detected", "WordPress" in tech, True)
        check("theme named", "Theme: astra" in tech, True)
        check("social profile found", "Facebook" in tech, True)
        check("profile url sits on one line", panel.eval_on_selector(
            ".surl", "e => e.getBoundingClientRect().height < 24"), True)
        check("profile url keeps the full address in the tooltip", panel.eval_on_selector(
            ".surl", "e => e.title.startsWith('https://')"), True)
        check("security headers wait for the run", "not run" in tech, True)
        check("one primary action, not two", panel.eval_on_selector_all("button.btn", "e => e.length"), 2)

        # Third party hosts: long names in a narrow panel must not blow the layout up.
        check("hosts card counts third party only", "Third party hosts" in tech, True)
        panel.click("details.card:has(> summary:text-matches('Third party hosts'))  > summary")
        panel.wait_for_selector(".host")
        check("busiest host first", panel.eval_on_selector(".hname", "e => e.textContent"), "securepubads.g.doubleclick.net")
        check("list is capped, not all 18 at once", panel.eval_on_selector_all(".hosts > .host", "e => e.length"), 10)
        check("a show more control exists", panel.is_visible(".morebtn"), True)
        check("every host name is one line", panel.eval_on_selector_all(
            ".hname", "els => els.every(e => e.getBoundingClientRect().height < 24)"), True)
        check("the longest name truncates rather than pushing the panel wide", panel.eval_on_selector_all(
            ".hname", "els => els.every(e => e.scrollWidth >= e.clientWidth)"), True)
        check("nothing overflows the panel width", panel.evaluate(
            "() => document.documentElement.scrollWidth <= document.documentElement.clientWidth"), True)
        check("the collapsed card stays inside one panel height", panel.eval_on_selector(
            ".hosts", "e => e.getBoundingClientRect().height < window.innerHeight * 0.45"), True)
        check("full name kept in the tooltip", panel.eval_on_selector(".hname", "e => e.title"), "securepubads.g.doubleclick.net")
        panel.click(".morebtn")
        check("show more reveals the rest", panel.eval_on_selector_all(".host", "e => e.length"), 18)
        check("no scrollbar nested inside the panel scroll", panel.eval_on_selector(
            ".hosts", "e => e.scrollHeight <= e.clientHeight + 1"), True)
        check("still no sideways scroll with everything open", panel.evaluate(
            "() => document.documentElement.scrollWidth <= document.documentElement.clientWidth"), True)
        panel.evaluate("() => document.querySelector('main').scrollTo(0, 0)")
        panel.screenshot(path=str(ROOT / "ui-tech.png"), full_page=True)

        # ---- ai view and the run ----
        panel.click("#run")
        panel.wait_for_selector(".finding")
        panel.wait_for_function("() => !document.querySelector('#run').disabled")
        ai = panel.inner_text("#out")
        check("the run switches to the AI view", panel.eval_on_selector(".tab[aria-selected=true]", "e => e.firstChild.textContent"), "AI")
        check("shell page fails the JS gap", "without JavaScript" in ai, True)
        check("missing internal links caught", "No internal links exist before JavaScript runs" in ai, True)
        check("GPTBot block reported", "GPTBot" in ai, True)
        check("llms.txt absence is not a failure", panel.eval_on_selector_all(
            ".finding.fail", "els => els.some(e => /llms/.test(e.textContent))"), False)
        check("what was fetched is listed", "raw HTML fetch" in ai, True)
        check("x-robots-tag surfaced", "noarchive" in ai, True)
        check("sitemap membership surfaced", "this URL is listed" in ai, True)
        calls = panel.evaluate("() => __calls")
        check("robots.txt fetched once", calls.count("https://example.com/robots.txt"), 1)
        check("no user agent probes unless asked", any("gptbot" in c.lower() for c in calls), False)
        panel.evaluate("() => document.querySelector('main').scrollTo(0, 0)")
        panel.screenshot(path=str(ROOT / "ui-ai.png"), full_page=True)

        # the run feeds the other views
        tab("Tech")
        check("security grade appears after the run", "Security headers" in panel.inner_text("#out"), True)
        tab("Issues")
        check("header directives reach the page checks", "noarchive" in panel.inner_text("#out").lower(), True)
        tab("Summary")
        check("the header value reaches the summary", panel.inner_text(row("X-Robots-Tag")).strip().endswith("noarchive"), True)

        # ---- data view ----
        tab("Data")
        data = panel.inner_text("#out")
        check("timing shown", "read the page" in data, True)
        check("serialised html kept out of the dump", "omitted here" in data, True)
        panel.evaluate("() => document.querySelector('main').scrollTo(0, 0)")
        panel.screenshot(path=str(ROOT / "ui-data.png"), full_page=True)

        # ---- report ----
        md = panel.evaluate("() => report()")
        check("report names the page", md.startswith("# SEO Side Panel: Cheap Widgets"), True)
        check("report has a to-fix section", "## To fix" in md, True)
        check("report carries fixes", "Fix:" in md, True)
        check("report has no em dash", "\u2014" in md, False)

        # ---- host access, asked for rather than granted at install ----
        check("site checks asked for access to the site it reads",
              any(a == "https://example.com/*" for a in panel.evaluate("() => __perm.asked")), True)

        # A panel that holds nothing and cannot read: the card should ask, not fail.
        cold = browser.new_page(viewport={"width": 400, "height": 900})
        cold.on("pageerror", lambda e: errors.append(str(e)))
        cold.add_init_script(stub({"granted": [], "denyRead": True}))
        cold.goto((APP / "panel.html").as_uri(), wait_until="load")
        cold.wait_for_selector("#grant-site")
        check("no read failure shown to a user who simply has not granted access",
              cold.is_visible("#notice"), False)
        check("the card names the site", cold.inner_text("#grant-site"), "Allow on example.com")
        check("all sites is offered too", cold.inner_text("#grant-all"), "Allow on all sites")
        check("nothing was asked for before the card was shown", cold.evaluate("() => __perm.asked"), [])
        cold.click("#grant-site")
        cold.wait_for_selector(".pcard")
        check("granting one site reads the page", cold.inner_text("#page-title"), "Cheap Widgets Melbourne | Widget Co")
        check("only that site was asked for", cold.evaluate("() => __perm.asked"), ["https://example.com/*"])

        # Refused: the card stays, and the panel says so rather than looking broken.
        refused = browser.new_page(viewport={"width": 400, "height": 900})
        refused.add_init_script(stub({"granted": [], "denyRead": True, "deny": True}))
        refused.goto((APP / "panel.html").as_uri(), wait_until="load")
        refused.wait_for_selector("#grant-all")
        refused.click("#grant-all")
        refused.wait_for_selector("#notice:visible")
        check("a refusal is explained", "did not grant" in refused.inner_text("#notice"), True)
        check("the card is still there to try again", refused.is_visible("#grant-site"), True)

        # Link status: cross-domain links need every site, and a refusal checks the rest.
        links = browser.new_page(viewport={"width": 400, "height": 900})
        links.add_init_script(stub({"granted": ["https://example.com/*"], "deny": True}))
        links.goto((APP / "panel.html").as_uri(), wait_until="load")
        links.wait_for_selector(".pcard")
        links.click(".tab:has(> span:text-is('Links'))")
        links.click("#check-status")
        links.wait_for_selector("#notice:visible")
        check("all sites is what an external link check asks for",
              links.evaluate("() => __perm.asked"), ["<all_urls>"])
        check("a refusal still checks the links it can", "were checked" in links.inner_text("#notice"), True)
        checked = links.evaluate("() => __requests.map(r => r[0])")
        check("no request went to a site that was not granted",
              [u for u in checked if not u.startswith("https://example.com")], [])
        check("the links on the granted site were still checked", len(checked) > 0, True)

        browser.close()
    httpd.shutdown()

    print(f"{checks - len(failures)}/{checks} checks passed  (screenshots in tests/)")
    for f in failures:
        print("  FAIL " + f)
    sys.exit(1 if failures else 0)

main()
