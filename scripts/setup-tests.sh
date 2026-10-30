#!/usr/bin/env bash
# Downloads Three.js r128 locally so the tests can run offline, and installs Playwright.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p vendor/ex && tmp=$(mktemp -d)
(cd "$tmp" && npm pack three@0.128.0 --silent >/dev/null && tar -xzf three-0.128.0.tgz)
p="$tmp/package"
cp "$p/build/three.min.js" vendor/
cp "$p"/examples/js/postprocessing/{EffectComposer,RenderPass,ShaderPass,UnrealBloomPass}.js "$p"/examples/js/shaders/{CopyShader,LuminosityHighPassShader}.js "$p/examples/js/loaders/GLTFLoader.js" "$p/examples/js/utils/SkeletonUtils.js" vendor/ex/
rm -rf "$tmp"
npm install --no-save playwright@1.47.2
echo "Done. Run: scripts/build.sh && node tests/logic.test.js"
