#!/usr/bin/env python3
"""Bundles the game into one self-contained HTML body for publishing as an artifact.

    python3 tools/build-single.py OUTPUT.html [--full]

The publisher adds its own document skeleton, so the default output has none. Use --full for
a complete standalone page instead.
"""
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')


def read(rel):
    return (root / rel).read_text(encoding='utf-8')


title = re.search(r'<title>.*?</title>', html)[0]
css = read('src/style.css') + read('src/fonts.css')
body = re.search(r'<body>(.*)</body>', html, re.S)[1]
body = re.sub(r'\s*<!--.*?-->', '', body, flags=re.S)


def inline(match):
    code = read(match[1])
    if '</script' in code:
        raise SystemExit(f'{match[1]} contains a closing script tag')
    return f'<script>\n{code}\n</script>'


body = re.sub(r'<script src="([^"]+)"></script>', inline, body)
page = f'{title}\n<style>\n{css}\n</style>\n{body}\n'
if '--full' in sys.argv:
    page = ('<!doctype html>\n<html lang="lv">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            f'{title}\n<style>\n{css}\n</style>\n</head>\n<body>\n{body}\n</body>\n</html>\n')
pathlib.Path(sys.argv[1]).write_text(page, encoding='utf-8')
print(sys.argv[1], f'{len(page.encode()) // 1024} KB')
