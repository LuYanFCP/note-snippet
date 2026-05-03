#!/bin/sh
# POSIX sh on purpose — Cloudflare Pages invokes this with `sh ./build.sh`,
# the bash shebang is ignored, so no `pipefail`, no `[[ ... ]]`.

set -eu

# Install uv only if missing (most CI images already have it pre-installed)
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  PATH="${HOME}/.local/bin:${PATH}"
  export PATH
fi

# Forward GITHUB_TOKEN to the fetcher when present (CI auto-injects it).
# Locally you can `export GITHUB_TOKEN=...` or skip it for public repos.
if [ -n "${GITHUB_TOKEN:-}" ]; then
  uv run fetch_github_content.py --token "${GITHUB_TOKEN}"
else
  uv run fetch_github_content.py
fi

# Hugo build (minified for production)
hugo --minify
