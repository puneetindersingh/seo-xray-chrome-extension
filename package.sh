#!/usr/bin/env bash
# Build the zip that goes to the Chrome Web Store. Ships the extension and
# nothing else: no tests, no screenshots, no git, no repo paperwork.
set -euo pipefail
cd "$(dirname "$0")"

version=$(python3 -c 'import json;print(json.load(open("manifest.json"))["version"])')
out="dist/seo-side-panel-$version.zip"

python3 tests/run.py

rm -f "$out"
mkdir -p dist
zip -q -r "$out" manifest.json background.js panel.html panel.css panel.js src icons LICENSE \
  -x '*.svg' -x '.*'

echo
echo "$out"
unzip -l "$out" | tail -1
