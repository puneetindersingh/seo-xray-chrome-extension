"""Drive the real extract.js against fixture pages and assert the snapshot.

Fixtures are served over http, not file://, because internal-vs-external link
detection compares hosts and file:// has none.
"""
import functools, http.server, json, pathlib, threading, sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = (ROOT.parent / "src" / "extract.js").read_text()

failures, checks = [], 0
def check(label, got, want):
    global checks
    checks += 1
    if got != want:
        failures.append(f"{label}: got {got!r}, want {want!r}")

def serve(directory):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_port}"

def snapshot_of(page, url):
    page.goto(url, wait_until="load")
    # Same two-step the extension uses: define the extractor, then call it.
    page.evaluate("src => eval(src)", SRC)
    return page.evaluate("() => __seoExtract(document, { live: true })")

def main():
    from playwright.sync_api import sync_playwright
    httpd, base = serve(ROOT / "fixtures")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        s = snapshot_of(page, f"{base}/messy.html")
        browser.close()
    httpd.shutdown()

    check("title text", s["title"]["text"], "Cheap Widgets Melbourne | Widget Co")
    check("title count", s["title"]["count"], 1)
    check("description missing", s["description"]["content"], None)
    check("meta robots", s["robotsMeta"]["content"], "index, follow, max-snippet:-1")
    check("canonical", s["canonical"]["href"], "https://example.com/widgets")
    check("lang", s["lang"], "en-AU")
    check("charset", s["charset"], "UTF-8")
    check("viewport missing", s["viewport"], None)
    check("og title", s["og"].get("og:title"), "Cheap Widgets Melbourne")
    check("twitter empty", s["twitter"], {})

    heads = s["headings"]
    check("heading count", len(heads), 7)
    check("h1 count", len([h for h in heads if h["level"] == 1]), 2)
    check("empty heading", len([h for h in heads if h["empty"]]), 1)   # the bare <h2></h2>
    check("hidden heading", len([h for h in heads if h["hidden"]]), 1)  # display:none only
    check("hidden one is the right one", [h["text"] for h in heads if h["hidden"]], ["Hidden heading"])
    check("empty h2 is not called hidden", [h for h in heads if h["empty"]][0]["hidden"], False)
    check("nav heading region", heads[0]["region"], "nav")
    check("footer heading region", heads[-1]["region"], "footer")

    links = s["links"]
    check("internal links", len([l for l in links if l["internal"] is True]), 5)
    check("external links", len([l for l in links if l["internal"] is False]), 3)
    check("nofollow links", len([l for l in links if "nofollow" in (l["rel"] or "")]), 1)
    check("no-href link", len([l for l in links if l["kind"] == "no-href"]), 1)
    check("empty anchor text", len([l for l in links if l["kind"] == "link" and not l["text"] and not l["hasImage"]]), 1)
    check("mailto counted", s["specialLinks"]["mailto"], 1)
    check("fragment counted", s["specialLinks"]["fragment"], 1)

    imgs = s["images"]
    check("image count", len(imgs), 3)
    check("missing alt", len([i for i in imgs if not i["hasAlt"]]), 1)
    check("empty alt", len([i for i in imgs if i["hasAlt"] and not i["alt"]]), 1)
    check("width/height attrs", len([i for i in imgs if i["widthAttr"] and i["heightAttr"]]), 1)
    check("lazy", len([i for i in imgs if i["loading"] == "lazy"]), 1)
    check("webp detected", len([i for i in imgs if i["ext"] == "webp"]), 1)

    ld = s["structuredData"]["jsonLd"]
    check("jsonld blocks", len(ld), 2)
    check("jsonld good", ld[0]["ok"], True)
    check("jsonld type", ld[0]["data"]["@type"], "Service")
    check("jsonld broken flagged", ld[1]["ok"], False)

    check("hreflang", s["hreflang"][0]["hreflang"], "en-nz")
    check("has main", s["content"]["hasMain"], True)
    check("main words > 20", s["content"]["mainWords"] > 20, True)
    check("main fewer words than body", s["content"]["mainWords"] < s["content"]["bodyWords"], True)
    check("json serialisable", json.dumps(s) is not None, True)

    # what the page loaded, which is what tracker detection reads
    check("serialised html captured", "googletagmanager" in s["loaded"]["html"], True)
    check("script urls captured", any("gtm.js" in u for u in s["loaded"]["scriptUrls"]), True)
    check("third party host counted", s["loaded"]["thirdPartyHosts"] >= 1, True)
    check("requests observed", any("googletagmanager" in u for u in s["loaded"]["requestedUrls"]), True)

    print(f"{checks - len(failures)}/{checks} checks passed")
    for f in failures:
        print("  FAIL " + f)
    sys.exit(1 if failures else 0)

main()
