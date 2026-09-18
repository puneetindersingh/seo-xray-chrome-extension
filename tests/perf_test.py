"""Speed guard.

Builds a deliberately heavy page, then measures the three costs that decide
whether the panel feels instant: reading the page, scoring the snapshot, and
drawing it. Thresholds are generous on purpose. They exist to catch a change
that makes things an order of magnitude worse, not to chase milliseconds.
"""
import functools, http.server, json, pathlib, statistics, sys, tempfile, threading

ROOT = pathlib.Path(__file__).resolve().parent
APP = ROOT.parent
SRC = (APP / "src" / "extract.js").read_text()

BUDGET = {"extract": 800, "score": 300, "render": 600}

failures, checks = [], 0
def check(label, got, want):
    global checks
    checks += 1
    if got != want:
        failures.append(f"{label}: got {got!r}, want {want!r}")


def heavy_page(path):
    parts = ["<!doctype html><html lang='en'><head><meta charset='utf-8'>",
             "<title>A heavy page for timing</title>",
             "<meta name='description' content='Timing fixture.'>",
             "<meta name='viewport' content='width=device-width'>",
             "<link rel='canonical' href='https://heavy.example/page'>",
             "<script src='https://www.googletagmanager.com/gtm.js?id=GTM-HEAVY01'></script>",
             "</head><body><main><h1>Heavy</h1>"]
    for i in range(900):
        parts.append(f"<section><h2>Section {i}</h2><p>{'word ' * 45}</p>"
                     f"<a href='/page-{i}'>Link {i}</a>"
                     f"<a href='https://other.example/{i}' rel='nofollow'>Out {i}</a>"
                     f"<img src='/img-{i}.jpg' width='400' height='300' alt='Image {i}'></section>")
    parts.append("</main></body></html>")
    path.write_text("".join(parts))
    return path


def main():
    from playwright.sync_api import sync_playwright
    tmp = pathlib.Path(tempfile.mkdtemp())
    heavy_page(tmp / "heavy.html")
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(tmp))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_port}"

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto(f"{base}/heavy.html", wait_until="load")
        page.evaluate("src => eval(src)", SRC)

        nodes = page.evaluate("() => document.getElementsByTagName('*').length")
        times = page.evaluate("""() => {
            const out = [];
            for (let i = 0; i < 5; i++) {
                const t = performance.now();
                __seoExtract(document, { live: true });
                out.push(performance.now() - t);
            }
            return out;
        }""")
        extract_ms = round(statistics.median(times))
        snap = page.evaluate("() => __seoExtract(document, { live: true })")
        payload = len(json.dumps(snap))

        stub = (ROOT / "panel_test.py").read_text().split('STUB = r"""')[1].split('"""')[0]
        panel = browser.new_page(viewport={"width": 400, "height": 900})
        panel.add_init_script(stub.strip().replace("__SNAP__", json.dumps(snap)).replace("__PERM__", "{}"))
        panel.goto((APP / "panel.html").as_uri(), wait_until="load")
        panel.wait_for_selector("#out > *")
        timing = panel.evaluate("() => state.timing")

        # Switching views must not re-score, only redraw.
        redraw = panel.evaluate("""() => {
            const t = performance.now();
            document.querySelectorAll('.tab')[3].click();   // Links: the heaviest page to draw
            return performance.now() - t;
        }""")
        browser.close()
    httpd.shutdown()

    print(f"  {nodes} DOM nodes, {payload // 1024} KB snapshot")
    print(f"  extract {extract_ms} ms · score {timing['score']} ms · draw {timing['render']} ms · switch view {round(redraw)} ms")

    check(f"extract under {BUDGET['extract']} ms", extract_ms < BUDGET["extract"], True)
    check(f"score under {BUDGET['score']} ms", timing["score"] < BUDGET["score"], True)
    check(f"draw under {BUDGET['render']} ms", timing["render"] < BUDGET["render"], True)
    check("switching view is instant", redraw < 400, True)
    check("the heavy page really is heavy", nodes > 5000, True)

    print(f"{checks - len(failures)}/{checks} checks passed")
    for f in failures:
        print("  FAIL " + f)
    sys.exit(1 if failures else 0)

main()
