"""Does this folder actually load as an extension?

Cheap checks that catch a broken build before Chrome does: every file the
manifest and the panel reference exists, the manifest parses, and nothing in the
shipped source points at this machine.
"""
import json, pathlib, re, sys

APP = pathlib.Path(__file__).resolve().parent.parent
failures, checks = [], 0
def check(label, got, want):
    global checks
    checks += 1
    if got != want:
        failures.append(f"{label}: got {got!r}, want {want!r}")

m = json.loads((APP / "manifest.json").read_text())
check("manifest v3", m["manifest_version"], 3)
check("side panel registered", "side_panel" in m, True)
check("side panel file exists", (APP / m["side_panel"]["default_path"]).exists(), True)
check("service worker exists", (APP / m["background"]["service_worker"]).exists(), True)
check("sidePanel permission", "sidePanel" in m["permissions"], True)
check("scripting permission", "scripting" in m["permissions"], True)
check("header rewriting permission for the crawler probes",
      "declarativeNetRequestWithHostAccess" in m["permissions"], True)
check("no permission we do not use", sorted(m["permissions"]),
      ["declarativeNetRequestWithHostAccess", "scripting", "sidePanel", "storage", "tabs"])

html = (APP / "panel.html").read_text()
srcs = re.findall(r'<script src="([^"]+)"', html) + re.findall(r'<link rel="stylesheet" href="([^"]+)"', html)
for s in srcs:
    check(f"panel references {s}", (APP / s).exists(), True)
check("the extractor loads before the panel uses it", srcs.index("src/extract.js") < srcs.index("panel.js"), True)
check("the catalogue loads before tech.js", srcs.index("src/catalogue.js") < srcs.index("src/tech.js"), True)

injected = ["src/extract.js", "src/extract-inject.js"]
panel_js = (APP / "panel.js").read_text()
for f in injected:
    check(f"injected file {f} exists", (APP / f).exists(), True)
    check(f"panel injects {f}", f in panel_js, True)

# Nothing shipped may point at this machine or hold a key.
shipped = [p for p in APP.glob("*.js")] + [p for p in (APP / "src").glob("*.js")] + [APP / "panel.html"]
for p in shipped:
    text = p.read_text()
    check(f"{p.name} has no home path", "/home/" in text, False)
    check(f"{p.name} has no localhost reference", "localhost" in text or "127.0.0.1" in text, False)
    check(f"{p.name} has no em dash", "—" in text, False)

# Icons: every size the manifest promises must exist and actually be that size.
import struct
def png_size(path):
    with open(path, "rb") as fh:
        head = fh.read(24)
    return struct.unpack(">II", head[16:24]) if head[:8] == b"\x89PNG\r\n\x1a\n" else None

for field in ("icons", "action"):
    block = m.get(field, {})
    if field == "action":
        block = block.get("default_icon", {})
    check(f"{field} declares four sizes", sorted(block), ["128", "16", "32", "48"])
    for size, rel in block.items():
        f = APP / rel
        check(f"{field} icon {size} exists", f.exists(), True)
        if f.exists():
            check(f"icon {size} really is {size}x{size}", png_size(f), (int(size), int(size)))

check("no api key looking strings", any(re.search(r'(api[_-]?key|secret|bearer)\s*[:=]\s*["\'][A-Za-z0-9]{12,}', p.read_text(), re.I) for p in shipped), False)

print(f"{checks - len(failures)}/{checks} checks passed")
for f in failures:
    print("  FAIL " + f)
sys.exit(1 if failures else 0)
