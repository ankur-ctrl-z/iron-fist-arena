#!/usr/bin/env bash
# Builds the playable page (dist/index.html) and the model bundle (dist/models.js).
# If vendor/ exists (see scripts/setup-tests.sh), also builds an offline copy in .test/ for the tests.
set -euo pipefail
cd "$(dirname "$0")/.."
order=(01_core 02_rig 03_moves 04_stage 05_fx 06_fighter 07_ai 08_input 10_skin 09_game)
mkdir -p dist
{ cat src/00_head.html; for f in "${order[@]}"; do cat "src/$f.js"; done; echo '</script>'; } > dist/index.html
python3 scripts/bundle_models.py
if [ -d vendor ]; then
  mkdir -p .test
  python3 - <<'PY'
import re
s = open('dist/index.html').read()
s = s.replace('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', '../vendor/three.min.js')
s = re.sub(r'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/[a-z]*/', '../vendor/ex/', s)
s = s.replace('src="models.js"', 'src="../dist/models.js"')
s = s.replace('<link rel="stylesheet" href="https://fonts.googleapis.com', '<link rel="x-test-disabled" href="https://fonts.googleapis.com')
open('.test/index.html', 'w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + s + '</body></html>')
PY
fi
echo "built dist/index.html ($(wc -c < dist/index.html) bytes) and dist/models.js ($(wc -c < dist/models.js) bytes)"
