# Crash-test corpus (51 cases, harvested 2026-10-20)

Public WebKit layout tests added by crash-fix commits since the Safari 17.0
branch point — replayed by `../fa-corpus-runner.js` (beacon prefix VCORP-,
crash-resume via `/corpus-next` in `../host.py`).

The test files are third-party content (WebKit LayoutTests) and are NOT
committed. Regenerate with the ZigZagBoi1 harvester and this copy step:

    git clone https://github.com/ZigZagBoi1/PS5-14.10-Research.git /tmp/zzb
    cd /tmp/zzb && git fetch origin pull/55/head && git checkout FETCH_HEAD
    python3 tools/webkit_crash_corpus.py harvest
    python3 tools/webkit_crash_corpus.py resolve
    python3 tools/webkit_crash_corpus.py fetch
    python3 - <<'PY'
import json, os, shutil
src = '/tmp/zzb/results/webkit/corpus'
idx = json.load(open(os.path.join(src, 'index.json')))
lst = sorted(idx['tests'].values(), key=lambda t: t['path'])
out = [{'path': t['path'], 'file': t['file'], 'subject': t['subject']} for t in lst]
json.dump(out, open('corpus/list.json', 'w'))
for t in lst:
    shutil.copyfile(os.path.join(src, t['file']), os.path.join('corpus', t['file']))
PY

`list.json` (committed) records what this corpus contained when it was run.
