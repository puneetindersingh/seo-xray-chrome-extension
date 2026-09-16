"""Run every test file in this folder."""
import pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent
fails = 0
tests = sorted(ROOT.glob("*_test.py")) + sorted(ROOT.glob("*_test.js"))
for test in tests:
    print(f"\n== {test.name}")
    runner = ["node"] if test.suffix == ".js" else [sys.executable]
    r = subprocess.run(runner + [str(test)], capture_output=True, text=True)
    for line in r.stdout.splitlines():
        if "127.0.0.1 - -" not in line and "code 404" not in line:
            print(line)
    if r.returncode:
        fails += 1
        print(r.stderr.strip()[-2000:])
sys.exit(1 if fails else 0)
