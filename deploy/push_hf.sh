#!/usr/bin/env bash
# Push the current main branch to a Hugging Face Space (Docker SDK).
# HF needs YAML front matter in README.md; we add it only in the Space copy,
# so the GitHub README stays clean.
#
# Usage: deploy/push_hf.sh <hf-username>/<space-name>
# Auth:  when git asks, username = your HF username, password = an HF access token with "write" scope.
set -euo pipefail
SPACE="${1:?usage: deploy/push_hf.sh <hf-username>/<space-name>}"
ROOT="$(git rev-parse --show-toplevel)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git clone -q "$ROOT" "$TMP/space"
cd "$TMP/space"
{
  printf -- '---\ntitle: FlowShield Bengaluru\nemoji: 🌊\ncolorFrom: blue\ncolorTo: indigo\nsdk: docker\napp_port: 7860\npinned: false\nshort_description: Flood simulation and early warning for Bengaluru lakes\n---\n\n'
  cat README.md
} > README.hf && mv README.hf README.md
git add README.md
git -c user.name="FlowShield deploy" -c user.email="deploy@flowshield.local" commit -qm "Hugging Face Space config"
git push --force "https://huggingface.co/spaces/${SPACE}" HEAD:main
echo "Pushed. Build logs: https://huggingface.co/spaces/${SPACE}?logs=build"
