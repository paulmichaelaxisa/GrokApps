#!/usr/bin/env python3
"""Copy the sibling web app into www/ for Capacitor. www/ is gitignored."""
import os, re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT.parent.parent / ROOT.name
WWW = ROOT / "www"

if not WEB.is_dir():
    sys.exit(f"Web app folder not found: {WEB}")

exclude_names = {"sw.js", "README.md", "config.local.js", "package.json"}
skip_dirs = {"test", "tools"}  # dev-only folders of the web app (mock HS110 + tests)

if WWW.exists():
    shutil.rmtree(WWW)
WWW.mkdir(parents=True)

for dirpath, dirs, files in os.walk(WEB):
    root_p = Path(dirpath)
    dirs[:] = [d for d in dirs if not d.startswith(".git") and not (root_p == WEB and d in skip_dirs)]
    dest_dir = WWW / root_p.relative_to(WEB)
    dest_dir.mkdir(parents=True, exist_ok=True)
    for name in files:
        if name in exclude_names or name.startswith(".git"):
            continue
        shutil.copy2(root_p / name, dest_dir / name)

sw_js = re.compile(
    r"\n\s*// Service worker\n\s*if \(\"serviceWorker\" in navigator\) \{\n"
    r"\s*window\.addEventListener\(\"load\", \(\) => \{\n"
    r"\s*navigator\.serviceWorker\.register\(\"./sw\.js\"\)\.catch\(\(\) => \{\}\);\n"
    r"\s*\}\);\n\s*\}\n",
)
sw_html = re.compile(
    r"\n\s*<script>\s*\n\s*if \(\"serviceWorker\" in navigator\) \{\n"
    r"\s*window\.addEventListener\(\"load\", \(\) => \{\n"
    r"\s*navigator\.serviceWorker\.register\(\"./sw\.js\"\)\.catch\(\(\) => \{\}\);\n"
    r"\s*\}\);\n\s*\}\s*\n\s*</script>\n",
)
for name in ("app.js", "app.mjs", "index.html"):
    path = WWW / name
    if not path.exists():
        continue
    text = path.read_text(encoding="utf-8")
    new = sw_js.sub("\n", text)
    new = sw_html.sub("\n", new)
    if new != text:
        path.write_text(new, encoding="utf-8")
        print("stripped service worker registration from", name)

local = WWW / "config.local.js"
if local.exists():
    local.unlink()
    print("removed config.local.js")

print("Synced www/ from", WEB)
