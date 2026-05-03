#!/usr/bin/env bash
# Build the static site:
# 1. Sync content from GitHub Issues (writes into content/posts/, gitignored)
# 2. Run Hugo to produce ./public

set -euo pipefail

# Install uv only if it's missing (CI images often pre-install it via setup-uv)
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  # The installer drops the binary into ~/.local/bin; make sure it's on PATH
  export PATH="${HOME}/.local/bin:${PATH}"
fi

# Pass GITHUB_TOKEN to the fetcher when present (CI auto-injects it).
# Locally you can `export GITHUB_TOKEN=...` or skip it for public repos.
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  uv run fetch_github_content.py --token "${GITHUB_TOKEN}"
else
  uv run fetch_github_content.py
fi

# Hugo build (minified for production)
hugo --minify
