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

# 分享卡片（og:image）上的标题字体。CJK 字体 8MB，不进仓库，构建时现下；
# 钉在 noto-cjk 的 release tag 上，免得上游改动悄悄换了字形。
# 下载失败不致命：layouts/partials/og-image.html 找不到字体会退回无图的小卡片。
OG_FONT=assets/fonts/og.otf
if [ ! -f "${OG_FONT}" ]; then
  mkdir -p assets/fonts
  curl -fsSL -o "${OG_FONT}" \
    https://github.com/notofonts/noto-cjk/raw/Sans2.004/Sans/SubsetOTF/SC/NotoSansSC-Bold.otf \
    || { echo "warning: 下载 og 字体失败，分享卡片将不带图" >&2; rm -f "${OG_FONT}"; }
fi

# Hugo build (minified for production)
hugo --minify
