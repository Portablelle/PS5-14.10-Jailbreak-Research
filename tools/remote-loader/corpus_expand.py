#!/usr/bin/env python3
"""Expand the crash-test corpus by harvesting WebKit crash fixes in date windows.

The GitHub commit-search API caps results (~1000); a single open-ended query
saturates before covering three years of fixes. This script searches in
six-month windows, keeps commits whose subject looks like a crash fix, keeps
only tests ADDED by the fix commit (same rule as webkit_crash_corpus.py),
downloads them, and appends them to corpus/list.json — EXISTING ORDER IS
PRESERVED so the crash-resume cursor (/corpus-next) stays valid: new cases
run after the previous walk's highest GAP.

Usage: python3 corpus_expand.py [--windows N] [--max-pages P]
"""

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))
CORPUS = os.path.join(ROOT, "corpus")
LIST = os.path.join(CORPUS, "list.json")

WINDOWS = [
    ("2023-09-21", "2024-03-31"),
    ("2024-04-01", "2024-09-30"),
    ("2024-10-01", "2025-03-31"),
    ("2025-04-01", "2025-09-30"),
    ("2025-10-01", "2026-03-31"),
    ("2026-04-01", "2026-10-20"),
]

CRASH_WORDS = re.compile(
    r"crash|null deref|nullptr|use[- ]after[- ]free|uaf\b|overflow|out[- ]of[- ]bounds|"
    r"assertion|security|type confusion|bad access|heap[- ]buffer",
    re.IGNORECASE,
)
SKIP_WORDS = re.compile(r"resync|^import |unreviewed, reverting|migrat", re.IGNORECASE)
TEST_SUFFIX = (".html", ".xhtml", ".svg")
MAX_BYTES = 160 * 1024


def gh(args):
    proc = subprocess.run(["gh", "api"] + args, capture_output=True, text=True)
    if proc.returncode != 0:
        print("gh api failed:", " ".join(args), proc.stderr.strip()[:200])
        return None
    return json.loads(proc.stdout)


def search_window(since, until, max_pages):
    kept = []
    for page in range(1, max_pages + 1):
        q = f"crash repo:WebKit/WebKit committer-date:{since}..{until}"
        args = ["search/commits", "--method", "GET", "-f", f"q={q}",
                "-f", "per_page=100", "-f", f"page={page}",
                "--jq", ".items[] | [.sha, .commit.committer.date, .commit.message] | @tsv"]
        proc = subprocess.run(["gh", "api"] + args, capture_output=True, text=True)
        if proc.returncode != 0:
            break
        lines = [l for l in proc.stdout.splitlines() if l.strip()]
        if not lines:
            break
        for line in lines:
            parts = line.split("\t", 2)
            if len(parts) < 3:
                continue
            sha, date, message = parts[0], parts[1], parts[2]
            subject = message.split("\n", 1)[0]
            if CRASH_WORDS.search(subject) and not SKIP_WORDS.search(subject):
                kept.append((sha, date, subject))
        if len(lines) < 100:
            break
    return kept


def commit_added_tests(sha):
    data = gh(["repos/WebKit/WebKit/commits/" + sha])
    if not data:
        return []
    out = []
    for f in data.get("files", []):
        p = f.get("filename", "")
        if not p.startswith("LayoutTests/"):
            continue
        if not p.endswith(TEST_SUFFIX):
            continue
        if f.get("status") != "added":
            continue
        if (f.get("changes") or 0) > MAX_BYTES:
            continue
        out.append(p)
    return out


def fetch_test(path, sha):
    quoted = urllib.parse.quote(path)
    data = gh([f"repos/WebKit/WebKit/contents/{quoted}?ref={sha}"])
    if not data or data.get("encoding") != "base64":
        return None
    import base64
    try:
        return base64.b64decode(data["content"])
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-pages", type=int, default=3)
    args = ap.parse_args()

    lst = json.load(open(LIST)) if os.path.exists(LIST) else []
    known = {t["path"] for t in lst}
    print(f"existing corpus: {len(lst)} cases")

    added = 0
    for since, until in WINDOWS:
        commits = search_window(since, until, args.max_pages)
        print(f"window {since}..{until}: {len(commits)} crash-fix commits")
        for sha, date, subject in commits:
            for path in commit_added_tests(sha):
                if path in known:
                    continue
                blob = fetch_test(path, sha)
                if not blob:
                    continue
                flat = path.replace("/", "_")
                with open(os.path.join(CORPUS, flat), "wb") as fh:
                    fh.write(blob)
                lst.append({"path": path, "file": flat, "subject": subject})
                known.add(path)
                added += 1
                print(f"  + {path}")

    with open(LIST, "w") as fh:
        json.dump(lst, fh)
    print(f"added {added}; corpus now {len(lst)} cases")


if __name__ == "__main__":
    sys.exit(main())
